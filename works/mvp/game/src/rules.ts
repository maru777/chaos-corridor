import { DIRS, bothHavePath, goalRow, inBounds, isBlocked } from './board';
import type { AbilityId, Action, ApplyResult, GameState, PlayerId, Pos, Wall, WallSpec } from './types';

export const BOARD_SIZE = 9;
export const WALLS_PER_PLAYER = 10;

export function initialState(
  size: number = BOARD_SIZE,
  wallsPerPlayer: number = WALLS_PER_PLAYER,
  abilities: readonly [readonly AbilityId[], readonly AbilityId[]] = [[], []],
): GameState {
  const mid = Math.floor(size / 2);
  return {
    size,
    pawns: [
      { x: mid, y: size - 1 },
      { x: mid, y: 0 },
    ],
    walls: [],
    wallsLeft: [wallsPerPlayer, wallsPerPlayer],
    turn: 0,
    winner: null,
    abilities,
    wallBlocked: [false, false],
  };
}

function samePos(a: Pos, b: Pos): boolean {
  return a.x === b.x && a.y === b.y;
}

function otherPlayer(p: PlayerId): PlayerId {
  return p === 0 ? 1 : 0;
}

function sameWall(a: WallSpec, b: WallSpec): boolean {
  return a.x === b.x && a.y === b.y && a.o === b.o;
}

/** 手番のコマが動ける先（ジャンプ・斜め越えを含む） */
export function legalPawnMoves(state: GameState): Pos[] {
  const me = state.pawns[state.turn];
  const foe = state.pawns[otherPlayer(state.turn)];
  const out: Pos[] = [];
  for (const d of DIRS) {
    const n = { x: me.x + d.x, y: me.y + d.y };
    if (!inBounds(state.size, n) || isBlocked(state.walls, me, n)) continue;
    if (!samePos(n, foe)) {
      out.push(n);
      continue;
    }
    const jump = { x: n.x + d.x, y: n.y + d.y };
    if (inBounds(state.size, jump) && !isBlocked(state.walls, n, jump)) {
      out.push(jump);
      continue;
    }
    for (const side of DIRS) {
      if (side.x * d.x + side.y * d.y !== 0) continue;
      const diag = { x: n.x + side.x, y: n.y + side.y };
      if (inBounds(state.size, diag) && !isBlocked(state.walls, n, diag)) out.push(diag);
    }
  }
  return out;
}

/**
 * 斜行（能力）で動ける先。斜めのマスに、壁にふさがれていない道（横→縦、または縦→横）が 1 つでもあればよい。
 * 途中のマスに相手のコマがいる道は通れない。
 */
export function legalDiagonalMoves(state: GameState): Pos[] {
  const me = state.pawns[state.turn];
  const foe = state.pawns[otherPlayer(state.turn)];
  const out: Pos[] = [];
  for (const dx of [-1, 1]) {
    for (const dy of [-1, 1]) {
      const to = { x: me.x + dx, y: me.y + dy };
      if (!inBounds(state.size, to) || samePos(to, foe)) continue;
      const viaX = { x: me.x + dx, y: me.y };
      const viaY = { x: me.x, y: me.y + dy };
      const routeX = !samePos(viaX, foe) && !isBlocked(state.walls, me, viaX) && !isBlocked(state.walls, viaX, to);
      const routeY = !samePos(viaY, foe) && !isBlocked(state.walls, me, viaY) && !isBlocked(state.walls, viaY, to);
      if (routeX || routeY) out.push(to);
    }
  }
  return out;
}

/** 壁を置けない理由。置けるなら null */
export function wallProblem(state: GameState, wall: WallSpec): string | null {
  if (state.wallBlocked[state.turn]) return '電波妨害で、この手番は壁を置けない';
  if (state.wallsLeft[state.turn] <= 0) return '壁の残りがない';
  const max = state.size - 2;
  if (wall.x < 0 || wall.y < 0 || wall.x > max || wall.y > max) return '盤の外';
  for (const w of state.walls) {
    if (w.x === wall.x && w.y === wall.y) return '壁が重なる';
    if (wall.o === 'h' && w.o === 'h' && w.y === wall.y && Math.abs(w.x - wall.x) === 1) return '壁が重なる';
    if (wall.o === 'v' && w.o === 'v' && w.x === wall.x && Math.abs(w.y - wall.y) === 1) return '壁が重なる';
  }
  if (!bothHavePath(state, [...state.walls, wall])) return 'ゴールへの道がなくなる';
  return null;
}

/** 手番の人が置ける壁をすべて返す */
export function legalWalls(state: GameState): WallSpec[] {
  const out: WallSpec[] = [];
  for (let y = 0; y < state.size - 1; y++) {
    for (let x = 0; x < state.size - 1; x++) {
      for (const o of ['h', 'v'] as const) {
        const wall = { x, y, o };
        if (wallProblem(state, wall) === null) out.push(wall);
      }
    }
  }
  return out;
}

/** 手番の人が、自分の壁として戻せる壁 */
export function reclaimableWalls(state: GameState): Wall[] {
  return state.walls.filter((w) => w.owner === state.turn);
}

export function legalActions(state: GameState): Action[] {
  if (state.winner !== null) return [];
  const out: Action[] = [
    ...legalPawnMoves(state).map((to): Action => ({ type: 'move', to })),
    ...legalWalls(state).map((w): Action => ({ type: 'wall', x: w.x, y: w.y, o: w.o })),
  ];
  for (const id of state.abilities[state.turn]) {
    if (id === 'diagonal') {
      for (const to of legalDiagonalMoves(state)) out.push({ type: 'ability', id, to });
    } else if (id === 'reclaim') {
      for (const w of reclaimableWalls(state)) out.push({ type: 'ability', id, wall: { x: w.x, y: w.y, o: w.o } });
    } else if (!state.wallBlocked[otherPlayer(state.turn)]) {
      out.push({ type: 'ability', id });
    }
  }
  return out;
}

/**
 * 元の状態は変えず、新しい状態を返す。反則なら理由を返す。
 * 能力を使うと、その手番を使う（1 手番に 1 つの行動）。1 つの能力は 1 局に 1 回。
 * 手番が終わると、その人にかかっていた電波妨害は解ける。
 */
export function applyAction(state: GameState, action: Action): ApplyResult {
  if (state.winner !== null) return { ok: false, reason: '勝負はついている' };
  const me = state.turn;
  const foe = otherPlayer(me);

  const wallBlocked: [boolean, boolean] = [state.wallBlocked[0], state.wallBlocked[1]];
  wallBlocked[me] = false;

  const moveTo = (to: Pos, abilities: GameState['abilities']): ApplyResult => {
    const pawns: [Pos, Pos] = [state.pawns[0], state.pawns[1]];
    pawns[me] = { x: to.x, y: to.y };
    const won = to.y === goalRow(state.size, me);
    return {
      ok: true,
      state: { ...state, pawns, abilities, wallBlocked, turn: won ? me : foe, winner: won ? me : null },
    };
  };

  if (action.type === 'move') {
    if (!legalPawnMoves(state).some((p) => samePos(p, action.to))) return { ok: false, reason: '動けないマス' };
    return moveTo(action.to, state.abilities);
  }

  if (action.type === 'wall') {
    const wall: WallSpec = { x: action.x, y: action.y, o: action.o };
    const problem = wallProblem(state, wall);
    if (problem !== null) return { ok: false, reason: problem };
    const wallsLeft: [number, number] = [state.wallsLeft[0], state.wallsLeft[1]];
    wallsLeft[me] -= 1;
    const placed: Wall = { ...wall, owner: me };
    return { ok: true, state: { ...state, walls: [...state.walls, placed], wallsLeft, wallBlocked, turn: foe } };
  }

  // 能力
  const mine = state.abilities[me];
  const index = mine.indexOf(action.id);
  if (index < 0) return { ok: false, reason: 'その能力を持っていない' };
  const rest = mine.filter((_, i) => i !== index);
  const abilities: [readonly AbilityId[], readonly AbilityId[]] = [state.abilities[0], state.abilities[1]];
  abilities[me] = rest;

  if (action.id === 'diagonal') {
    if (!legalDiagonalMoves(state).some((p) => samePos(p, action.to))) return { ok: false, reason: '斜めに動けないマス' };
    return moveTo(action.to, abilities);
  }

  if (action.id === 'reclaim') {
    const target = reclaimableWalls(state).find((w) => sameWall(w, action.wall));
    if (!target) return { ok: false, reason: '戻せる自分の壁がない' };
    const wallsLeft: [number, number] = [state.wallsLeft[0], state.wallsLeft[1]];
    wallsLeft[me] += 1;
    return {
      ok: true,
      state: { ...state, walls: state.walls.filter((w) => w !== target), wallsLeft, abilities, wallBlocked, turn: foe },
    };
  }

  // jam（電波妨害）
  if (state.wallBlocked[foe]) return { ok: false, reason: '相手はすでに壁を封じられている' };
  wallBlocked[foe] = true;
  return { ok: true, state: { ...state, abilities, wallBlocked, turn: foe } };
}
