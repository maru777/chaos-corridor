import { DIRS, bothHavePath, goalRow, inBounds, isBlocked } from './board';
import type { Action, ApplyResult, GameState, Pos, Wall } from './types';

export const BOARD_SIZE = 9;
export const WALLS_PER_PLAYER = 10;

export function initialState(size: number = BOARD_SIZE, wallsPerPlayer: number = WALLS_PER_PLAYER): GameState {
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
  };
}

function samePos(a: Pos, b: Pos): boolean {
  return a.x === b.x && a.y === b.y;
}

/** 手番のコマが動ける先（ジャンプ・斜め越えを含む） */
export function legalPawnMoves(state: GameState): Pos[] {
  const me = state.pawns[state.turn];
  const foe = state.pawns[state.turn === 0 ? 1 : 0];
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

/** 壁を置けない理由。置けるなら null */
export function wallProblem(state: GameState, wall: Wall): string | null {
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
export function legalWalls(state: GameState): Wall[] {
  const out: Wall[] = [];
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

export function legalActions(state: GameState): Action[] {
  if (state.winner !== null) return [];
  return [
    ...legalPawnMoves(state).map((to): Action => ({ type: 'move', to })),
    ...legalWalls(state).map((w): Action => ({ type: 'wall', x: w.x, y: w.y, o: w.o })),
  ];
}

/** 元の状態は変えず、新しい状態を返す。反則なら理由を返す */
export function applyAction(state: GameState, action: Action): ApplyResult {
  if (state.winner !== null) return { ok: false, reason: '勝負はついている' };
  const next: PlayerTurn = state.turn === 0 ? 1 : 0;

  if (action.type === 'move') {
    if (!legalPawnMoves(state).some((p) => samePos(p, action.to))) return { ok: false, reason: '動けないマス' };
    const pawns: [Pos, Pos] = [state.pawns[0], state.pawns[1]];
    pawns[state.turn] = { x: action.to.x, y: action.to.y };
    const won = action.to.y === goalRow(state.size, state.turn);
    return { ok: true, state: { ...state, pawns, turn: won ? state.turn : next, winner: won ? state.turn : null } };
  }

  const wall: Wall = { x: action.x, y: action.y, o: action.o };
  const problem = wallProblem(state, wall);
  if (problem !== null) return { ok: false, reason: problem };
  const wallsLeft: [number, number] = [state.wallsLeft[0], state.wallsLeft[1]];
  wallsLeft[state.turn] -= 1;
  return { ok: true, state: { ...state, walls: [...state.walls, wall], wallsLeft, turn: next } };
}

type PlayerTurn = 0 | 1;
