import { DIRS, bothHavePath, goalRow, hasPathToGoal, inBounds, isBlocked, wallSegments } from './board';
import { createRng } from './rng';
import type { AbilityId, Action, ApplyResult, GameState, Meteor, Orientation, PlayerId, Pos, Wall, WallSpec } from './types';

export const BOARD_SIZE = 9;
export const WALLS_PER_PLAYER = 10;
/** 隕石で通れなくなったマスが、元に戻るまでに、落とされた相手が動く回数 */
export const METEOR_TURNS = 3;
/** 三連壁（能力）で手に入る、短い壁の枚数 */
export const SHORT_WALLS_PER_USE = 3;

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
    shortWalls: [0, 0],
    turn: 0,
    winner: null,
    abilities,
    wallBlocked: [false, false],
    meteors: [],
  };
}

function samePos(a: Pos, b: Pos): boolean {
  return a.x === b.x && a.y === b.y;
}

function otherPlayer(p: PlayerId): PlayerId {
  return p === 0 ? 1 : 0;
}

function sameWall(a: WallSpec, b: WallSpec): boolean {
  return a.x === b.x && a.y === b.y && a.o === b.o && a.half === b.half;
}

/** そのマスが、隕石で通れなくなっているか */
export function isMeteorAt(state: Pick<GameState, 'meteors'>, p: Pos): boolean {
  return state.meteors.some((m) => samePos(m, p));
}

/** 手番のコマが動ける先（ジャンプ・斜め越えを含む。隕石のマスには入れない） */
export function legalPawnMoves(state: GameState): Pos[] {
  const me = state.pawns[state.turn];
  const foe = state.pawns[otherPlayer(state.turn)];
  const out: Pos[] = [];
  for (const d of DIRS) {
    const n = { x: me.x + d.x, y: me.y + d.y };
    if (!inBounds(state.size, n) || isBlocked(state.walls, me, n) || isMeteorAt(state, n)) continue;
    if (!samePos(n, foe)) {
      out.push(n);
      continue;
    }
    const jump = { x: n.x + d.x, y: n.y + d.y };
    if (inBounds(state.size, jump) && !isBlocked(state.walls, n, jump) && !isMeteorAt(state, jump)) {
      out.push(jump);
      continue;
    }
    for (const side of DIRS) {
      if (side.x * d.x + side.y * d.y !== 0) continue;
      const diag = { x: n.x + side.x, y: n.y + side.y };
      if (inBounds(state.size, diag) && !isBlocked(state.walls, n, diag) && !isMeteorAt(state, diag)) out.push(diag);
    }
  }
  return out;
}

/**
 * 斜行（能力）で動ける先。斜めのマスに、壁にふさがれていない道（横→縦、または縦→横）が 1 つでもあればよい。
 * 途中のマスに相手のコマがいる道や、隕石のマスを通る道は通れない。
 */
export function legalDiagonalMoves(state: GameState): Pos[] {
  const me = state.pawns[state.turn];
  const foe = state.pawns[otherPlayer(state.turn)];
  const out: Pos[] = [];
  for (const dx of [-1, 1]) {
    for (const dy of [-1, 1]) {
      const to = { x: me.x + dx, y: me.y + dy };
      if (!inBounds(state.size, to) || samePos(to, foe) || isMeteorAt(state, to)) continue;
      const viaX = { x: me.x + dx, y: me.y };
      const viaY = { x: me.x, y: me.y + dy };
      const routeX = !samePos(viaX, foe) && !isMeteorAt(state, viaX) && !isBlocked(state.walls, me, viaX) && !isBlocked(state.walls, viaX, to);
      const routeY = !samePos(viaY, foe) && !isMeteorAt(state, viaY) && !isBlocked(state.walls, me, viaY) && !isBlocked(state.walls, viaY, to);
      if (routeX || routeY) out.push(to);
    }
  }
  return out;
}

/**
 * 跳躍（能力）で動ける先。上下左右のどれかへ、まっすぐ 2 マス先。間にある壁・コマ・隕石は、すべて飛び越える。
 * 着地するマスに、相手のコマや隕石があってはいけない。
 * 壁で囲まれた、出口のない場所には着地できない（自分が、ゴールへの道を失って、対局が終わらなくなるため）。
 */
export function legalLeapMoves(state: GameState): Pos[] {
  const me = state.pawns[state.turn];
  const foe = state.pawns[otherPlayer(state.turn)];
  const out: Pos[] = [];
  for (const d of DIRS) {
    const to = { x: me.x + d.x * 2, y: me.y + d.y * 2 };
    if (!inBounds(state.size, to) || samePos(to, foe) || isMeteorAt(state, to)) continue;
    if (hasPathToGoal(state.size, state.walls, to, goalRow(state.size, state.turn), state.meteors)) out.push(to);
  }
  return out;
}

/**
 * 超新星（能力）の 2 回目に動ける先。1 回目で動いたあとの位置から、ふつうに動ける先。
 * 1 回目でゴール行に着いたら勝負がつくので、2 回目はない（空）。
 */
export function novaSecondMoves(state: GameState, first: Pos): Pos[] {
  if (first.y === goalRow(state.size, state.turn)) return [];
  const pawns: [Pos, Pos] = [state.pawns[0], state.pawns[1]];
  pawns[state.turn] = first;
  return legalPawnMoves({ ...state, pawns });
}

/** 隕石（能力）が落ちる場所: 相手のコマの、ゴールへ向かう側のすぐ前のマス。なければ null（相手がゴール行にいるとき） */
export function meteorTarget(state: GameState): Pos | null {
  const foe = otherPlayer(state.turn);
  const foePos = state.pawns[foe];
  const dy = Math.sign(goalRow(state.size, foe) - foePos.y);
  if (dy === 0) return null;
  const target = { x: foePos.x, y: foePos.y + dy };
  return inBounds(state.size, target) ? target : null;
}

/** 隕石を落とせない理由。落とせるなら null。落としたあとも、どちらのコマも、ゴールへの道が残る必要がある */
export function meteorProblem(state: GameState): string | null {
  const target = meteorTarget(state);
  if (target === null) return '落とす場所がない';
  if (samePos(target, state.pawns[state.turn])) return '自分のコマがいるマスには落とせない';
  if (isMeteorAt(state, target)) return 'すでに隕石がある';
  if (!bothHavePath(state, state.walls, [target])) return 'ゴールへの道がなくなる';
  return null;
}

/** 引力（能力）で、相手のコマが引き戻される先: ゴールと反対の向きに 1 マス。なければ null */
export function gravityTarget(state: GameState): Pos | null {
  const foe = otherPlayer(state.turn);
  const foePos = state.pawns[foe];
  const dy = Math.sign(goalRow(state.size, foe) - foePos.y);
  if (dy === 0) return null;
  const target = { x: foePos.x, y: foePos.y - dy };
  return inBounds(state.size, target) ? target : null;
}

/** 相手を引き戻せない理由。引き戻せるなら null。壁・盤の端・自分のコマ・隕石があると使えない */
export function gravityProblem(state: GameState): string | null {
  const target = gravityTarget(state);
  if (target === null) return '引き戻す先がない';
  if (isBlocked(state.walls, state.pawns[otherPlayer(state.turn)], target)) return '壁にふさがれている';
  if (samePos(target, state.pawns[state.turn])) return '自分のコマがいる';
  if (isMeteorAt(state, target)) return '隕石がある';
  return null;
}

/**
 * 壁を、盤のその位置に置けるか（置く人の残り枚数は見ない）。盤の外・重なり・ゴールへの道を調べる。
 * 短い壁は、1 マス分だけをふさぐので、ほかの壁と同じ 1 マスを使うと重なる。長い壁どうしは、十字に交差できない。
 */
export function wallFits(state: GameState, walls: readonly WallSpec[], wall: WallSpec): string | null {
  const max = state.size - 2;
  if (wall.x < 0 || wall.y < 0 || wall.x > max || wall.y > max) return '盤の外';
  const used = new Set(walls.flatMap((w) => wallSegments(w)));
  if (wallSegments(wall).some((s) => used.has(s))) return '壁が重なる';
  if (wall.half === undefined && walls.some((w) => w.half === undefined && w.x === wall.x && w.y === wall.y && w.o !== wall.o)) return '壁が重なる';
  if (!bothHavePath(state, [...walls, wall])) return 'ゴールへの道がなくなる';
  return null;
}

/** 壁を置けない理由。置けるなら null */
export function wallProblem(state: GameState, wall: WallSpec): string | null {
  if (state.wallBlocked[state.turn]) return '電波妨害で、この手番は壁を置けない';
  if (wall.half !== undefined) {
    if (state.shortWalls[state.turn] <= 0) return '短い壁の残りがない';
  } else if (state.wallsLeft[state.turn] <= 0) {
    return '壁の残りがない';
  }
  return wallFits(state, state.walls, wall);
}

/** 短い壁（1 マス分）。o の向きで、線 line の、列（h）または行（v）c をふさぐ */
export function shortWallSpec(o: Orientation, line: number, c: number, size: number): WallSpec {
  const anchor = Math.min(c, size - 2);
  const half = (c - anchor) as 0 | 1;
  return o === 'h' ? { x: anchor, y: line, o, half } : { x: line, y: anchor, o, half };
}

/** 手番の人が置ける壁をすべて返す（短い壁を持っていれば、短い壁も） */
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
  if (state.shortWalls[state.turn] > 0) {
    for (const o of ['h', 'v'] as const) {
      for (let line = 0; line < state.size - 1; line++) {
        for (let c = 0; c < state.size; c++) {
          const wall = shortWallSpec(o, line, c, state.size);
          if (wallProblem(state, wall) === null) out.push(wall);
        }
      }
    }
  }
  return out;
}

/** 手番の人が、回収や鉄壁で扱える壁: 自分の壁のうち、鉄壁でないもの */
export function reclaimableWalls(state: GameState): Wall[] {
  return state.walls.filter((w) => w.owner === state.turn && !w.iron);
}

/** 虚無（能力）で消せる壁: 鉄壁でない、すべての壁（相手の壁も自分の壁も） */
export function voidTargets(state: GameState): Wall[] {
  return state.walls.filter((w) => !w.iron);
}

// ---- 天地反転（盤を 180 度回す）----

function rotatePos(size: number, p: Pos): Pos {
  return { x: size - 1 - p.x, y: size - 1 - p.y };
}

/** 壁を 180 度回す。長い壁は交点の位置が反転し、短い壁は、ふさぐ 1 マスが反転する */
function rotateWall(size: number, w: Wall): Wall {
  if (w.half === undefined) return { ...w, x: size - 2 - w.x, y: size - 2 - w.y };
  if (w.o === 'h') {
    const col = size - 1 - (w.x + w.half);
    const x = Math.min(col, size - 2);
    return { ...w, x, y: size - 2 - w.y, half: (col - x) as 0 | 1 };
  }
  const row = size - 1 - (w.y + w.half);
  const y = Math.min(row, size - 2);
  return { ...w, x: size - 2 - w.x, y, half: (row - y) as 0 | 1 };
}

/**
 * 盤全体（壁・隕石）を 180 度回す。コマは、位置を入れ替える（先手のコマは、後手のコマが回った先に、その逆も）。
 * 回したあとも、どちらのコマも、ゴールへの道が残る（盤とコマを同時に回す形なので、必ず残る）。
 */
export function invertedBoard(state: GameState): Pick<GameState, 'pawns' | 'walls' | 'meteors'> {
  const s = state.size;
  return {
    pawns: [rotatePos(s, state.pawns[1]), rotatePos(s, state.pawns[0])],
    walls: state.walls.map((w) => rotateWall(s, w)),
    meteors: state.meteors.map((m) => ({ ...m, ...rotatePos(s, m) })),
  };
}

// ---- 混沌（壁を全部置き直す）----

/** 混沌で動かせる壁（鉄壁でないもの） */
export function chaosMovableWalls(state: GameState): Wall[] {
  return state.walls.filter((w) => !w.iron);
}

/**
 * 鉄壁以外の壁を、種（seed）で決まる乱数で、すべて置き直す。同じ種なら、同じ結果になる。
 * 1 枚ずつ、置ける場所（重ならず、どちらのコマにも道が残る場所）からランダムに選ぶ。
 * どこにも置けない壁は、持ち主の手元に戻る（壁の合計は変わらない）。
 */
export function chaosResult(state: GameState, seed: number): Pick<GameState, 'walls' | 'wallsLeft' | 'shortWalls'> {
  const rng = createRng(seed);
  const movable = [...chaosMovableWalls(state)];
  for (let i = movable.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [movable[i], movable[j]] = [movable[j] as Wall, movable[i] as Wall];
  }
  const placed: Wall[] = state.walls.filter((w) => w.iron);
  const wallsLeft: [number, number] = [state.wallsLeft[0], state.wallsLeft[1]];
  const shortWalls: [number, number] = [state.shortWalls[0], state.shortWalls[1]];
  for (const w of movable) {
    const isShort = w.half !== undefined;
    const candidates: WallSpec[] = [];
    const lines = state.size - 1;
    for (const o of ['h', 'v'] as const) {
      for (let line = 0; line < lines; line++) {
        if (isShort) {
          for (let c = 0; c < state.size; c++) {
            const spec = shortWallSpec(o, line, c, state.size);
            if (wallFits(state, placed, spec) === null) candidates.push(spec);
          }
        } else {
          for (let k = 0; k < lines; k++) {
            const spec: WallSpec = o === 'h' ? { x: k, y: line, o } : { x: line, y: k, o };
            if (wallFits(state, placed, spec) === null) candidates.push(spec);
          }
        }
      }
    }
    const pick = candidates[Math.floor(rng() * candidates.length)];
    if (pick) placed.push({ ...pick, owner: w.owner });
    else if (isShort) shortWalls[w.owner] += 1;
    else wallsLeft[w.owner] += 1;
  }
  return { walls: placed, wallsLeft, shortWalls };
}

export function legalActions(state: GameState): Action[] {
  if (state.winner !== null) return [];
  const out: Action[] = [
    ...legalPawnMoves(state).map((to): Action => ({ type: 'move', to })),
    ...legalWalls(state).map(
      (w): Action => (w.half === undefined ? { type: 'wall', x: w.x, y: w.y, o: w.o } : { type: 'wall', x: w.x, y: w.y, o: w.o, half: w.half }),
    ),
  ];
  for (const id of state.abilities[state.turn]) {
    switch (id) {
      case 'diagonal':
        for (const to of legalDiagonalMoves(state)) out.push({ type: 'ability', id, to });
        break;
      case 'leap':
        for (const to of legalLeapMoves(state)) out.push({ type: 'ability', id, to });
        break;
      case 'nova':
        for (const first of legalPawnMoves(state)) {
          if (first.y === goalRow(state.size, state.turn)) out.push({ type: 'ability', id, first });
          else for (const second of novaSecondMoves(state, first)) out.push({ type: 'ability', id, first, second });
        }
        break;
      case 'reclaim':
      case 'aegis':
        for (const w of reclaimableWalls(state)) out.push({ type: 'ability', id, wall: { x: w.x, y: w.y, o: w.o, ...(w.half === undefined ? {} : { half: w.half }) } });
        break;
      case 'void':
        for (const w of voidTargets(state)) out.push({ type: 'ability', id, wall: { x: w.x, y: w.y, o: w.o, ...(w.half === undefined ? {} : { half: w.half }) } });
        break;
      case 'meteor':
        if (meteorProblem(state) === null) out.push({ type: 'ability', id });
        break;
      case 'gravity':
        if (gravityProblem(state) === null) out.push({ type: 'ability', id });
        break;
      case 'jam':
        if (!state.wallBlocked[otherPlayer(state.turn)]) out.push({ type: 'ability', id });
        break;
      case 'chaos':
        if (chaosMovableWalls(state).length > 0) for (const seed of [1, 2, 3]) out.push({ type: 'ability', id, seed });
        break;
      case 'stasis':
      case 'triwall':
      case 'invert':
        out.push({ type: 'ability', id });
        break;
    }
  }
  return out;
}

/** 落とされた相手（mover）が 1 回動いたので、その人の隕石の残りを 1 減らし、0 になったものを消す */
function tickMeteors(meteors: readonly Meteor[], mover: PlayerId): Meteor[] {
  return meteors.map((m) => (m.victim === mover ? { ...m, turnsLeft: m.turnsLeft - 1 } : m)).filter((m) => m.turnsLeft > 0);
}

/** 壁を盤から外したので、持ち主の手元（ふつうの壁か、短い壁）に戻す */
function giveBack(wall: Wall, wallsLeft: [number, number], shortWalls: [number, number]): void {
  if (wall.half === undefined) wallsLeft[wall.owner] += 1;
  else shortWalls[wall.owner] += 1;
}

/**
 * 元の状態は変えず、新しい状態を返す。反則なら理由を返す。
 * 能力を使うと、その手番を使う（1 手番に 1 つの行動）。1 つの能力は 1 局に 1 回。
 * 手番が終わると、その人にかかっていた電波妨害は解け、その人にかかっていた隕石の残りが 1 減る。
 */
export function applyAction(state: GameState, action: Action): ApplyResult {
  if (state.winner !== null) return { ok: false, reason: '勝負はついている' };
  const me = state.turn;
  const foe = otherPlayer(me);

  const wallBlocked: [boolean, boolean] = [state.wallBlocked[0], state.wallBlocked[1]];
  wallBlocked[me] = false;
  const meteors = tickMeteors(state.meteors, me);

  const moveTo = (to: Pos, abilities: GameState['abilities']): ApplyResult => {
    const pawns: [Pos, Pos] = [state.pawns[0], state.pawns[1]];
    pawns[me] = { x: to.x, y: to.y };
    const won = to.y === goalRow(state.size, me);
    return {
      ok: true,
      state: { ...state, pawns, abilities, wallBlocked, meteors, turn: won ? me : foe, winner: won ? me : null },
    };
  };

  if (action.type === 'move') {
    if (!legalPawnMoves(state).some((p) => samePos(p, action.to))) return { ok: false, reason: '動けないマス' };
    return moveTo(action.to, state.abilities);
  }

  if (action.type === 'wall') {
    // 短い壁は、同じ 1 マスを指す別の書き方（x=3, half=1 と x=4, half=0 など）を、1 通りにそろえる（ハッシュがずれないように）
    const wall: WallSpec =
      action.half === undefined
        ? { x: action.x, y: action.y, o: action.o }
        : action.o === 'h'
          ? shortWallSpec('h', action.y, action.x + action.half, state.size)
          : shortWallSpec('v', action.x, action.y + action.half, state.size);
    const problem = wallProblem(state, wall);
    if (problem !== null) return { ok: false, reason: problem };
    const wallsLeft: [number, number] = [state.wallsLeft[0], state.wallsLeft[1]];
    const shortWalls: [number, number] = [state.shortWalls[0], state.shortWalls[1]];
    if (wall.half === undefined) wallsLeft[me] -= 1;
    else shortWalls[me] -= 1;
    const placed: Wall = { ...wall, owner: me };
    return { ok: true, state: { ...state, walls: [...state.walls, placed], wallsLeft, shortWalls, wallBlocked, meteors, turn: foe } };
  }

  // 能力
  const mine = state.abilities[me];
  const index = mine.indexOf(action.id);
  if (index < 0) return { ok: false, reason: 'その能力を持っていない' };
  const rest = mine.filter((_, i) => i !== index);
  const abilities: [readonly AbilityId[], readonly AbilityId[]] = [state.abilities[0], state.abilities[1]];
  abilities[me] = rest;
  const wallsLeft: [number, number] = [state.wallsLeft[0], state.wallsLeft[1]];
  const shortWalls: [number, number] = [state.shortWalls[0], state.shortWalls[1]];

  switch (action.id) {
    case 'diagonal':
      if (!legalDiagonalMoves(state).some((p) => samePos(p, action.to))) return { ok: false, reason: '斜めに動けないマス' };
      return moveTo(action.to, abilities);

    case 'leap':
      if (!legalLeapMoves(state).some((p) => samePos(p, action.to))) return { ok: false, reason: '跳べないマス' };
      return moveTo(action.to, abilities);

    case 'nova': {
      if (!legalPawnMoves(state).some((p) => samePos(p, action.first))) return { ok: false, reason: '1 回目に動けないマス' };
      if (action.first.y === goalRow(state.size, me)) return moveTo(action.first, abilities); // 1 回目でゴール
      const second = action.second;
      if (!second) return { ok: false, reason: '2 回目の行き先がない' };
      if (!novaSecondMoves(state, action.first).some((p) => samePos(p, second))) return { ok: false, reason: '2 回目に動けないマス' };
      return moveTo(second, abilities);
    }

    case 'reclaim': {
      const target = reclaimableWalls(state).find((w) => sameWall(w, action.wall));
      if (!target) return { ok: false, reason: '戻せる自分の壁がない' };
      giveBack(target, wallsLeft, shortWalls);
      return {
        ok: true,
        state: { ...state, walls: state.walls.filter((w) => w !== target), wallsLeft, shortWalls, abilities, wallBlocked, meteors, turn: foe },
      };
    }

    case 'aegis': {
      const target = reclaimableWalls(state).find((w) => sameWall(w, action.wall));
      if (!target) return { ok: false, reason: '鉄壁にできる自分の壁がない' };
      const walls = state.walls.map((w) => (w === target ? { ...w, iron: true } : w));
      return { ok: true, state: { ...state, walls, abilities, wallBlocked, meteors, turn: foe } };
    }

    case 'void': {
      const target = voidTargets(state).find((w) => sameWall(w, action.wall));
      if (!target) return { ok: false, reason: '消せる壁がない（鉄壁は消せない）' };
      giveBack(target, wallsLeft, shortWalls);
      return {
        ok: true,
        state: { ...state, walls: state.walls.filter((w) => w !== target), wallsLeft, shortWalls, abilities, wallBlocked, meteors, turn: foe },
      };
    }

    case 'meteor': {
      const problem = meteorProblem(state);
      const target = meteorTarget(state);
      if (problem !== null || target === null) return { ok: false, reason: problem ?? '落とす場所がない' };
      const fallen: Meteor = { x: target.x, y: target.y, victim: foe, turnsLeft: METEOR_TURNS };
      return { ok: true, state: { ...state, abilities, wallBlocked, meteors: [...meteors, fallen], turn: foe } };
    }

    case 'gravity': {
      const problem = gravityProblem(state);
      const target = gravityTarget(state);
      if (problem !== null || target === null) return { ok: false, reason: problem ?? '引き戻す先がない' };
      const pawns: [Pos, Pos] = [state.pawns[0], state.pawns[1]];
      pawns[foe] = target;
      return { ok: true, state: { ...state, pawns, abilities, wallBlocked, meteors, turn: foe } };
    }

    case 'stasis': {
      // 相手の手番を飛ばす。相手の手番が 1 回終わったものとして、相手の電波妨害は解け、相手の隕石の残りは減る
      wallBlocked[foe] = false;
      return { ok: true, state: { ...state, abilities, wallBlocked, meteors: tickMeteors(meteors, foe), turn: me } };
    }

    case 'triwall': {
      shortWalls[me] += SHORT_WALLS_PER_USE;
      return { ok: true, state: { ...state, abilities, shortWalls, wallBlocked, meteors, turn: foe } };
    }

    case 'chaos': {
      if (chaosMovableWalls(state).length === 0) return { ok: false, reason: '動かせる壁がない' };
      const result = chaosResult(state, action.seed);
      return { ok: true, state: { ...state, ...result, abilities, wallBlocked, meteors, turn: foe } };
    }

    case 'invert': {
      const board = invertedBoard({ ...state, meteors });
      return { ok: true, state: { ...state, ...board, abilities, wallBlocked, turn: foe } };
    }

    case 'jam':
      if (state.wallBlocked[foe]) return { ok: false, reason: '相手はすでに壁を封じられている' };
      wallBlocked[foe] = true;
      return { ok: true, state: { ...state, abilities, wallBlocked, meteors, turn: foe } };
  }
}
