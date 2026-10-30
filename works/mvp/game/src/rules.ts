import { DIRS, bothHavePath, goalRow, hasPathToGoal, inBounds, isBlocked, wallSegments } from './board';
import { FREEZE_TURNS, MINES_COUNT, PLUNDER_COUNT, PUSH_STEPS, SWARM_COUNT, TRAP_KINDS, attackRng, cellsAround, emptyCells, hitsInCells, laserHits, removeHits, samePos, wallTouchesCell } from './extras';
import { createRng } from './rng';
import type { AbilityId, Action, ApplyResult, AttackAction, AttackId, GameState, Meteor, Orientation, PlayerId, Pos, Trap, TrapKind, Wall, WallSpec } from './types';

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
  attacks: readonly [AttackId | null, AttackId | null] = [null, null],
  rngSeed = 0,
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
    traps: [],
    attacks,
    attackUsed: [false, false],
    skip: [0, 0],
    sealed: [false, false],
    ply: 0,
    rngSeed,
  };
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

/**
 * その人に見えている壁。相手の見えない壁（罠の Skill）は、ぶつかって姿を現すまで、見えない。
 * 動ける先の判定（画面の光るマス、CPU の読み）は、この壁で行う。
 */
export function viewWalls(state: Pick<GameState, 'walls'>, viewer: PlayerId): readonly Wall[] {
  return state.walls.some((w) => w.ghost === true && w.owner !== viewer) ? state.walls.filter((w) => !(w.ghost === true && w.owner !== viewer)) : state.walls;
}

/** 手番のコマが動ける先（ジャンプ・斜め越えを含む。隕石のマスには入れない）。walls は、判定に使う壁（ふつうは手番の人に見えている壁） */
export function legalPawnMoves(state: GameState, walls: readonly WallSpec[] = viewWalls(state, state.turn)): Pos[] {
  const me = state.pawns[state.turn];
  const foe = state.pawns[otherPlayer(state.turn)];
  const out: Pos[] = [];
  for (const d of DIRS) {
    const n = { x: me.x + d.x, y: me.y + d.y };
    if (!inBounds(state.size, n) || isBlocked(walls, me, n) || isMeteorAt(state, n)) continue;
    if (!samePos(n, foe)) {
      out.push(n);
      continue;
    }
    const jump = { x: n.x + d.x, y: n.y + d.y };
    if (inBounds(state.size, jump) && !isBlocked(walls, n, jump) && !isMeteorAt(state, jump)) {
      out.push(jump);
      continue;
    }
    for (const side of DIRS) {
      if (side.x * d.x + side.y * d.y !== 0) continue;
      const diag = { x: n.x + side.x, y: n.y + side.y };
      if (inBounds(state.size, diag) && !isBlocked(walls, n, diag) && !isMeteorAt(state, diag)) out.push(diag);
    }
  }
  return out;
}

/**
 * 斜行（能力）で動ける先。斜めのマスに、壁にふさがれていない道（横→縦、または縦→横）が 1 つでもあればよい。
 * 途中のマスに相手のコマがいる道や、隕石のマスを通る道は通れない。
 */
export function legalDiagonalMoves(state: GameState, walls: readonly WallSpec[] = viewWalls(state, state.turn)): Pos[] {
  const me = state.pawns[state.turn];
  const foe = state.pawns[otherPlayer(state.turn)];
  const out: Pos[] = [];
  for (const dx of [-1, 1]) {
    for (const dy of [-1, 1]) {
      const to = { x: me.x + dx, y: me.y + dy };
      if (!inBounds(state.size, to) || samePos(to, foe) || isMeteorAt(state, to)) continue;
      const viaX = { x: me.x + dx, y: me.y };
      const viaY = { x: me.x, y: me.y + dy };
      const routeX = !samePos(viaX, foe) && !isMeteorAt(state, viaX) && !isBlocked(walls, me, viaX) && !isBlocked(walls, viaX, to);
      const routeY = !samePos(viaY, foe) && !isMeteorAt(state, viaY) && !isBlocked(walls, me, viaY) && !isBlocked(walls, viaY, to);
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
export function novaSecondMoves(state: GameState, first: Pos, walls: readonly WallSpec[] = viewWalls(state, state.turn)): Pos[] {
  if (first.y === goalRow(state.size, state.turn)) return [];
  const pawns: [Pos, Pos] = [state.pawns[0], state.pawns[1]];
  pawns[state.turn] = first;
  return legalPawnMoves({ ...state, pawns }, walls);
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
  const seen = viewWalls(state, state.turn);
  return state.walls.filter((w) => !w.iron && seen.includes(w));
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
export function invertedBoard(state: GameState): Pick<GameState, 'pawns' | 'walls' | 'meteors' | 'traps'> {
  const s = state.size;
  return {
    pawns: [rotatePos(s, state.pawns[1]), rotatePos(s, state.pawns[0])],
    walls: state.walls.map((w) => rotateWall(s, w)),
    meteors: state.meteors.map((m) => ({ ...m, ...rotatePos(s, m) })),
    traps: state.traps.map((t) => ({ ...t, ...rotatePos(s, t), ...(t.dx === undefined || t.dy === undefined ? {} : { dx: -t.dx, dy: -t.dy }) })),
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

// ---- 罠・攻撃技・追加 Skill ----

/** 罠を置ける空きマスか（コマ・隕石・罠がないマス） */
export function trapProblem(state: GameState, at: Pos): string | null {
  if (!inBounds(state.size, at)) return '盤の外';
  if (state.pawns.some((p) => samePos(p, at))) return 'コマがいるマスには置けない';
  if (isMeteorAt(state, at)) return '隕石があるマスには置けない';
  if (state.traps.some((t) => samePos(t, at))) return 'すでに罠がある';
  return null;
}

/**
 * コマを、向き (dx, dy) へ最大 steps マス押す。壁・盤の端・もう一方のコマ・隕石の手前で止まる。
 * 押された先の位置を返す（動けなければ、元の位置）。
 */
export function pushPawn(state: GameState, who: PlayerId, dx: number, dy: number, steps: number = PUSH_STEPS): Pos {
  let cur = state.pawns[who];
  const other = state.pawns[otherPlayer(who)];
  for (let i = 0; i < steps; i++) {
    const next = { x: cur.x + dx, y: cur.y + dy };
    if (!inBounds(state.size, next) || isBlocked(state.walls, cur, next) || samePos(next, other) || isMeteorAt(state, next)) break;
    cur = next;
  }
  return cur;
}

/** 烈風（攻撃技）で相手が押される向き: ゴールと反対 */
function galeDir(state: GameState): Pos | null {
  const foe = otherPlayer(state.turn);
  const dy = Math.sign(goalRow(state.size, foe) - state.pawns[foe].y);
  return dy === 0 ? null : { x: 0, y: -dy };
}

/** 転位の門（Skill）で跳ぶ先: 同じ行の、左右反対側。行けない理由があれば null */
export function gateTarget(state: GameState): Pos | null {
  const me = state.pawns[state.turn];
  const to = { x: state.size - 1 - me.x, y: me.y };
  if (to.x === me.x) return null;
  if (samePos(to, state.pawns[otherPlayer(state.turn)]) || isMeteorAt(state, to)) return null;
  if (!hasPathToGoal(state.size, state.walls, to, goalRow(state.size, state.turn), state.meteors)) return null;
  return to;
}

/** 大地の亀裂（Skill）で壁を回したあとの形（長い壁だけ）。回せなければ null */
export function riftResult(state: GameState, target: Wall): WallSpec | null {
  if (target.half !== undefined) return null;
  const turned: WallSpec = { x: target.x, y: target.y, o: target.o === 'h' ? 'v' : 'h' };
  const rest = state.walls.filter((w) => w !== target);
  return wallFits(state, rest, turned) === null ? turned : null;
}

/** 大地の亀裂・奪取の手で選べる壁: 見えている、鉄壁でない壁（亀裂は長い壁だけ、奪取は相手の壁だけ） */
export function riftTargets(state: GameState): Wall[] {
  return voidTargets(state).filter((w) => riftResult(state, w) !== null);
}

export function seizeTargets(state: GameState): Wall[] {
  return voidTargets(state).filter((w) => w.owner !== state.turn);
}

function wallRef(w: Wall): WallSpec {
  return { x: w.x, y: w.y, o: w.o, ...(w.half === undefined ? {} : { half: w.half }) };
}

/** 隕石を落とせるマス（コマがいるか、隕石・道の面で問題のないマス）。メテオ・隕石群が選ぶ候補 */
function strikeCells(state: GameState, extra: readonly Pos[], withPawns: boolean): Pos[] {
  const out: Pos[] = [];
  for (let y = 0; y < state.size; y++) {
    for (let x = 0; x < state.size; x++) {
      const c = { x, y };
      const pawn = state.pawns.some((p) => samePos(p, c));
      if (pawn) {
        if (withPawns) out.push(c);
        continue;
      }
      if (isMeteorAt(state, c) || extra.some((e) => samePos(e, c))) continue;
      if (bothHavePath(state, state.walls, [...extra, c])) out.push(c);
    }
  }
  return out;
}

/** 攻撃技を撃てない理由。撃てるなら null */
export function attackProblem(state: GameState, action: AttackAction): string | null {
  return attackOutcome(state, action).error ?? null;
}

type AttackPatch = Partial<
  Pick<GameState, 'walls' | 'meteors' | 'traps' | 'wallsLeft' | 'shortWalls' | 'pawns' | 'skip'>
>;

/** 攻撃技の結果（盤の変化）。state の手番の人が撃つ。反則なら error */
export function attackOutcome(state: GameState, action: AttackAction): { error?: string; patch?: AttackPatch } {
  const me = state.turn;
  const foe = otherPlayer(me);
  if (state.attacks[me] !== action.id) return { error: 'その攻撃技を持っていない' };
  if (state.attackUsed[me]) return { error: 'その攻撃技は使い終わっている' };
  if (state.sealed[me]) return { error: '封印されていて、使えない' };
  const skip: [number, number] = [state.skip[0], state.skip[1]];
  switch (action.id) {
    case 'atkMeteor': {
      const rng = attackRng(state);
      const cells = strikeCells(state, [], true);
      const c = cells[Math.floor(rng() * cells.length)];
      if (!c) return { error: '落とす場所がない' };
      const removed = removeHits(state, hitsInCells(state, [c]).filter((h) => h.kind !== 'meteor'));
      const who = state.pawns.findIndex((p) => samePos(p, c));
      if (who >= 0) skip[who] = (skip[who] ?? 0) + 1;
      const meteors = who >= 0 ? removed.meteors : [...removed.meteors, { x: c.x, y: c.y, victim: foe, turnsLeft: METEOR_TURNS }];
      return { patch: { ...removed, meteors, skip } };
    }
    case 'atkLaser': {
      if (action.index < 0 || action.index >= state.size) return { error: '盤の外' };
      const hits = laserHits(state, me, action.axis, action.index);
      if (hits.length === 0) return { error: 'その列に壊せる物がない' };
      return { patch: removeHits(state, hits) };
    }
    case 'atkShock': {
      const hits = hitsInCells(state, cellsAround(state.size, state.pawns[me]));
      if (hits.length === 0) return { error: '周りに壊せる物がない' };
      return { patch: removeHits(state, hits) };
    }
    case 'atkFreeze':
      skip[foe] += FREEZE_TURNS;
      return { patch: { skip } };
    case 'atkBomb': {
      if (!inBounds(state.size, action.at)) return { error: '盤の外' };
      const hits = hitsInCells(state, cellsAround(state.size, action.at));
      if (hits.length === 0) return { error: 'その範囲に壊せる物がない' };
      return { patch: removeHits(state, hits) };
    }
    case 'atkSwarm': {
      const rng = attackRng(state);
      const placed: Pos[] = [];
      for (let i = 0; i < SWARM_COUNT; i++) {
        const cells = strikeCells(state, placed, false);
        const c = cells[Math.floor(rng() * cells.length)];
        if (!c) break;
        placed.push(c);
      }
      if (placed.length === 0) return { error: '落とす場所がない' };
      const removed = removeHits(state, placed.flatMap((c) => hitsInCells(state, [c]).filter((h) => h.kind === 'trap')));
      return { patch: { ...removed, meteors: [...removed.meteors, ...placed.map((c): Meteor => ({ x: c.x, y: c.y, victim: foe, turnsLeft: METEOR_TURNS }))] } };
    }
    case 'atkPlunder': {
      const n = Math.min(PLUNDER_COUNT, state.wallsLeft[foe]);
      if (n <= 0) return { error: '相手の手元に壁がない' };
      const wallsLeft: [number, number] = [state.wallsLeft[0], state.wallsLeft[1]];
      wallsLeft[foe] -= n;
      wallsLeft[me] += n;
      return { patch: { wallsLeft } };
    }
    case 'atkSwap': {
      const pawns: [Pos, Pos] = [state.pawns[1], state.pawns[0]];
      if (pawns[0].y === goalRow(state.size, 0) || pawns[1].y === goalRow(state.size, 1)) return { error: 'ゴール行に着いてしまうので、入れ替えられない' };
      if (!bothHavePath({ ...state, pawns }, state.walls)) return { error: 'ゴールへの道がなくなる' };
      return { patch: { pawns } };
    }
    case 'atkGale': {
      const dir = galeDir(state);
      if (dir === null) return { error: '相手がゴール行にいる' };
      const to = pushPawn(state, foe, dir.x, dir.y);
      if (samePos(to, state.pawns[foe])) return { error: '相手を動かせない' };
      const pawns: [Pos, Pos] = [state.pawns[0], state.pawns[1]];
      pawns[foe] = to;
      return { patch: { pawns } };
    }
    case 'atkMines': {
      const rng = attackRng(state);
      const cells = emptyCells(state);
      const traps: Trap[] = [...state.traps];
      for (let i = 0; i < MINES_COUNT && cells.length > 0; i++) {
        const c = cells.splice(Math.floor(rng() * cells.length), 1)[0] as Pos;
        const kind = TRAP_KINDS[Math.floor(rng() * TRAP_KINDS.length)] as TrapKind;
        if (kind === 'shove') {
          const d = DIRS[Math.floor(rng() * DIRS.length)] as Pos;
          traps.push({ x: c.x, y: c.y, owner: me, kind, dx: d.x, dy: d.y });
        } else traps.push({ x: c.x, y: c.y, owner: me, kind });
      }
      if (traps.length === state.traps.length) return { error: '置く場所がない' };
      return { patch: { traps } };
    }
  }
}

export function legalAttacks(state: GameState): AttackAction[] {
  const me = state.turn;
  const id = state.attacks[me];
  if (id === null || state.attackUsed[me] || state.sealed[me]) return [];
  const out: AttackAction[] = [];
  const add = (a: AttackAction) => {
    if (attackOutcome(state, a).error === undefined) out.push(a);
  };
  switch (id) {
    case 'atkLaser':
      for (const axis of ['row', 'col'] as const) for (let index = 0; index < state.size; index++) add({ type: 'attack', id, axis, index });
      break;
    case 'atkBomb':
      for (let y = 0; y < state.size; y++) for (let x = 0; x < state.size; x++) add({ type: 'attack', id, at: { x, y } });
      break;
    default:
      add({ type: 'attack', id });
  }
  return out;
}

/** 手番の人が、いま撃てる攻撃技があるか */
export function canAttack(state: GameState): boolean {
  return legalAttacks(state).length > 0;
}

export function legalActions(state: GameState): Action[] {
  if (state.winner !== null) return [];
  const out: Action[] = [
    ...legalPawnMoves(state).map((to): Action => ({ type: 'move', to })),
    ...legalWalls(state).map(
      (w): Action => (w.half === undefined ? { type: 'wall', x: w.x, y: w.y, o: w.o } : { type: 'wall', x: w.x, y: w.y, o: w.o, half: w.half }),
    ),
    ...legalAttacks(state),
  ];
  if (state.sealed[state.turn]) return out;
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
        for (const w of reclaimableWalls(state)) out.push({ type: 'ability', id, wall: wallRef(w) });
        break;
      case 'void':
        for (const w of voidTargets(state)) out.push({ type: 'ability', id, wall: wallRef(w) });
        break;
      case 'rift':
        for (const w of riftTargets(state)) out.push({ type: 'ability', id, wall: wallRef(w) });
        break;
      case 'seize':
        for (const w of seizeTargets(state)) out.push({ type: 'ability', id, wall: wallRef(w) });
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
      case 'gate':
        if (gateTarget(state) !== null) out.push({ type: 'ability', id });
        break;
      case 'thunder':
        if (thunderHits(state).length > 0) out.push({ type: 'ability', id });
        break;
      case 'trapStun':
      case 'trapBack':
      case 'trapConfiscate':
      case 'trapSeal':
        for (const at of emptyCells(state)) out.push({ type: 'ability', id, at });
        break;
      case 'trapShove':
        for (const at of emptyCells(state)) for (const d of DIRS) out.push({ type: 'ability', id, at, dx: d.x, dy: d.y });
        break;
      case 'trapGhost':
        for (const w of legalWalls(state)) if (w.half === undefined) out.push({ type: 'ability', id, wall: w });
        break;
      case 'stasis':
      case 'triwall':
      case 'invert':
      case 'supply':
        out.push({ type: 'ability', id });
        break;
    }
  }
  return out;
}

/** 天空の雷霆（Skill）が壊す物: 相手のコマの周り 3×3 */
export function thunderHits(state: GameState) {
  return hitsInCells(state, cellsAround(state.size, state.pawns[otherPlayer(state.turn)]));
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

/** ぶつかった（見えない壁に動きをさえぎられた）とき、姿を現す壁: 動こうとした人とその隣のマスの辺をふさぐ、相手の見えない壁 */
function revealedGhosts(state: GameState, mover: PlayerId): readonly Wall[] {
  const foeGhosts = state.walls.filter((w) => w.ghost === true && w.owner !== mover);
  const spots = [state.pawns[mover], state.pawns[otherPlayer(mover)]];
  const near = foeGhosts.filter((g) => spots.some((s) => wallTouchesCell(g, s)));
  const reveal = new Set<Wall>(near.length > 0 ? near : foeGhosts);
  return state.walls.map((w) => (reveal.has(w) ? { ...w, ghost: false } : w));
}

/**
 * 元の状態は変えず、新しい状態を返す。反則なら理由を返す。
 * 能力・攻撃技を使うと、その手番を使う（1 手番に 1 つの行動）。1 つの能力は 1 局に 1 回。
 * 手番が終わると、その人にかかっていた電波妨害・封印は解け、その人にかかっていた隕石の残りが 1 減る。
 * 休まされている人の手番は、飛ばされる。
 */
export function applyAction(state: GameState, action: Action): ApplyResult {
  const r = applyCore(state, action);
  if (!r.ok) return r;
  return { ok: true, state: settle(r.state, state) };
}

/** 手数を進め、休まされている人の手番を飛ばす */
function settle(next: GameState, prev: GameState): GameState {
  const skip: [number, number] = [next.skip[0], next.skip[1]];
  const wallBlocked: [boolean, boolean] = [next.wallBlocked[0], next.wallBlocked[1]];
  const sealed: [boolean, boolean] = [next.sealed[0], next.sealed[1]];
  let meteors = next.meteors;
  let turn = next.turn;
  while (next.winner === null && skip[turn] > 0) {
    skip[turn] -= 1;
    wallBlocked[turn] = false;
    sealed[turn] = false;
    meteors = tickMeteors(meteors, turn);
    turn = otherPlayer(turn);
  }
  return { ...next, walls: revealNearGhosts(next), skip, wallBlocked, sealed, meteors, turn, ply: prev.ply + 1 };
}

/**
 * 見えない壁は、相手のコマが、壁に接するマス（壁の周囲 1 マス）に入ると、姿を現す（そのあとは、ずっと見える）。
 * 1 回の手で 2 歩動く Skill などでは、入る前に壁にぶつかることもある（ぶつかっても姿を現す）。
 */
export function revealNearGhosts(state: Pick<GameState, 'walls' | 'pawns'>): readonly Wall[] {
  if (!state.walls.some((w) => w.ghost === true)) return state.walls;
  return state.walls.map((w) => (w.ghost === true && wallTouchesCell(w, state.pawns[otherPlayer(w.owner)]) ? { ...w, ghost: false } : w));
}

function applyCore(state: GameState, action: Action): ApplyResult {
  if (state.winner !== null) return { ok: false, reason: '勝負はついている' };
  const me = state.turn;
  const foe = otherPlayer(me);

  const wallBlocked: [boolean, boolean] = [state.wallBlocked[0], state.wallBlocked[1]];
  wallBlocked[me] = false;
  const sealed: [boolean, boolean] = [state.sealed[0], state.sealed[1]];
  const wasSealed = sealed[me];
  sealed[me] = false;
  const meteors = tickMeteors(state.meteors, me);
  const base = { wallBlocked, sealed, meteors };

  /** 手番を相手に渡して終える。変わったところだけ patch で渡す */
  const done = (patch: Partial<GameState>): ApplyResult => ({ ok: true, state: { ...state, ...base, turn: foe, ...patch } });

  /** 動いた先に、相手の罠があれば踏む */
  const moveTo = (to: Pos, abilities: GameState['abilities'], from: Pos = state.pawns[me]): ApplyResult => {
    const pawns: [Pos, Pos] = [state.pawns[0], state.pawns[1]];
    pawns[me] = { x: to.x, y: to.y };
    const patch: { -readonly [K in keyof GameState]?: GameState[K] } = { pawns, abilities };
    const goal = goalRow(state.size, me);
    let won = to.y === goal;
    const trap = won ? undefined : state.traps.find((t) => samePos(t, to) && t.owner !== me);
    if (trap) {
      patch.traps = state.traps.filter((t) => t !== trap);
      switch (trap.kind) {
        case 'stun': {
          const skip: [number, number] = [state.skip[0], state.skip[1]];
          skip[me] += 1;
          patch.skip = skip;
          break;
        }
        case 'back':
          pawns[me] = from;
          break;
        case 'shove': {
          pawns[me] = pushPawn({ ...state, pawns, meteors }, me, trap.dx ?? 0, trap.dy ?? 0);
          won = pawns[me].y === goal;
          break;
        }
        case 'confiscate': {
          const wallsLeft: [number, number] = [state.wallsLeft[0], state.wallsLeft[1]];
          wallsLeft[me] = Math.max(0, wallsLeft[me] - 1);
          patch.wallsLeft = wallsLeft;
          break;
        }
        case 'seal':
          sealed[me] = true;
          break;
      }
    }
    return done({ ...patch, turn: won ? me : foe, winner: won ? me : null });
  };

  /** 見えない壁にさえぎられて、動けなかった（手番だけ使う。Skill は使ったことにならない） */
  const bump = (): ApplyResult => done({ walls: revealedGhosts(state, me) });

  if (action.type === 'move') {
    if (!legalPawnMoves(state).some((p) => samePos(p, action.to))) return { ok: false, reason: '動けないマス' };
    if (!legalPawnMoves(state, state.walls).some((p) => samePos(p, action.to))) return bump();
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
    return done({ walls: [...state.walls, placed], wallsLeft, shortWalls });
  }

  if (action.type === 'attack') {
    const out = attackOutcome(state, action);
    if (out.error !== undefined || out.patch === undefined) return { ok: false, reason: out.error ?? '撃てない' };
    const attackUsed: [boolean, boolean] = [state.attackUsed[0], state.attackUsed[1]];
    attackUsed[me] = true;
    return done({ ...out.patch, attackUsed });
  }

  // Skill
  if (wasSealed) return { ok: false, reason: '封印されていて、Skill が使えない' };
  const mine = state.abilities[me];
  const index = mine.indexOf(action.id);
  if (index < 0) return { ok: false, reason: 'その能力を持っていない' };
  const rest = mine.filter((_, i) => i !== index);
  const abilities: [readonly AbilityId[], readonly AbilityId[]] = [state.abilities[0], state.abilities[1]];
  abilities[me] = rest;
  const wallsLeft: [number, number] = [state.wallsLeft[0], state.wallsLeft[1]];
  const shortWalls: [number, number] = [state.shortWalls[0], state.shortWalls[1]];

  switch (action.id) {
    case 'diagonal': {
      if (!legalDiagonalMoves(state).some((p) => samePos(p, action.to))) return { ok: false, reason: '斜めに動けないマス' };
      if (!legalDiagonalMoves(state, state.walls).some((p) => samePos(p, action.to))) return bump();
      return moveTo(action.to, abilities);
    }

    case 'leap':
      if (!legalLeapMoves(state).some((p) => samePos(p, action.to))) return { ok: false, reason: '跳べないマス' };
      return moveTo(action.to, abilities);

    case 'nova': {
      if (!legalPawnMoves(state).some((p) => samePos(p, action.first))) return { ok: false, reason: '1 回目に動けないマス' };
      if (!legalPawnMoves(state, state.walls).some((p) => samePos(p, action.first))) return bump();
      if (action.first.y === goalRow(state.size, me)) return moveTo(action.first, abilities);
      const second = action.second;
      if (!second) return { ok: false, reason: '2 回目の行き先がない' };
      if (!novaSecondMoves(state, action.first).some((p) => samePos(p, second))) return { ok: false, reason: '2 回目に動けないマス' };
      if (!novaSecondMoves(state, action.first, state.walls).some((p) => samePos(p, second))) return bump();
      return moveTo(second, abilities);
    }

    case 'reclaim': {
      const target = reclaimableWalls(state).find((w) => sameWall(w, action.wall));
      if (!target) return { ok: false, reason: '戻せる自分の壁がない' };
      giveBack(target, wallsLeft, shortWalls);
      return done({ walls: state.walls.filter((w) => w !== target), wallsLeft, shortWalls, abilities });
    }

    case 'aegis': {
      const target = reclaimableWalls(state).find((w) => sameWall(w, action.wall));
      if (!target) return { ok: false, reason: '鉄壁にできる自分の壁がない' };
      const walls = state.walls.map((w) => (w === target ? { ...w, iron: true } : w));
      return done({ walls, abilities });
    }

    case 'void': {
      const target = voidTargets(state).find((w) => sameWall(w, action.wall));
      if (!target) return { ok: false, reason: '消せる壁がない（鉄壁は消せない）' };
      giveBack(target, wallsLeft, shortWalls);
      return done({ walls: state.walls.filter((w) => w !== target), wallsLeft, shortWalls, abilities });
    }

    case 'meteor': {
      const problem = meteorProblem(state);
      const target = meteorTarget(state);
      if (problem !== null || target === null) return { ok: false, reason: problem ?? '落とす場所がない' };
      const fallen: Meteor = { x: target.x, y: target.y, victim: foe, turnsLeft: METEOR_TURNS };
      return done({ abilities, meteors: [...meteors, fallen] });
    }

    case 'gravity': {
      const problem = gravityProblem(state);
      const target = gravityTarget(state);
      if (problem !== null || target === null) return { ok: false, reason: problem ?? '引き戻す先がない' };
      const pawns: [Pos, Pos] = [state.pawns[0], state.pawns[1]];
      pawns[foe] = target;
      return done({ pawns, abilities });
    }

    case 'stasis': {
      // 相手の手番を飛ばす。相手の手番が 1 回終わったものとして、相手の電波妨害・封印は解け、相手の隕石の残りは減る
      wallBlocked[foe] = false;
      sealed[foe] = false;
      return { ok: true, state: { ...state, abilities, wallBlocked, sealed, meteors: tickMeteors(meteors, foe), turn: me } };
    }

    case 'triwall': {
      shortWalls[me] += SHORT_WALLS_PER_USE;
      return done({ abilities, shortWalls });
    }

    case 'chaos': {
      if (chaosMovableWalls(state).length === 0) return { ok: false, reason: '動かせる壁がない' };
      const result = chaosResult(state, action.seed);
      return done({ ...result, abilities });
    }

    case 'invert': {
      const board = invertedBoard({ ...state, meteors });
      return { ok: true, state: { ...state, ...board, abilities, wallBlocked, sealed, turn: foe } };
    }

    case 'jam':
      if (state.wallBlocked[foe]) return { ok: false, reason: '相手はすでに壁を封じられている' };
      wallBlocked[foe] = true;
      return done({ abilities });

    case 'supply':
      wallsLeft[me] += 1;
      return done({ abilities, wallsLeft });

    case 'gate': {
      const to = gateTarget(state);
      if (to === null) return { ok: false, reason: '門をくぐれない' };
      return moveTo(to, abilities);
    }

    case 'thunder': {
      const hits = thunderHits(state);
      if (hits.length === 0) return { ok: false, reason: '壊せる物がない' };
      return done({ ...removeHits(state, hits), abilities });
    }

    case 'rift': {
      const target = riftTargets(state).find((w) => sameWall(w, action.wall));
      if (!target) return { ok: false, reason: '回せる壁がない' };
      const turned = riftResult(state, target);
      if (turned === null) return { ok: false, reason: '回せない' };
      return done({ walls: state.walls.map((w) => (w === target ? { ...w, o: turned.o } : w)), abilities });
    }

    case 'seize': {
      const target = seizeTargets(state).find((w) => sameWall(w, action.wall));
      if (!target) return { ok: false, reason: '奪える相手の壁がない' };
      return done({ walls: state.walls.map((w) => (w === target ? { ...w, owner: me, ghost: false } : w)), abilities });
    }

    case 'trapStun':
    case 'trapBack':
    case 'trapConfiscate':
    case 'trapSeal': {
      const problem = trapProblem(state, action.at);
      if (problem !== null) return { ok: false, reason: problem };
      const kind: TrapKind = action.id === 'trapStun' ? 'stun' : action.id === 'trapBack' ? 'back' : action.id === 'trapConfiscate' ? 'confiscate' : 'seal';
      // 罠を仕掛けるのは、手番を使わない（使うと、罠を使ったことが相手に分かってしまうため）。手番は、そのまま続く
      return { ok: true, state: { ...state, abilities, traps: [...state.traps, { x: action.at.x, y: action.at.y, owner: me, kind }] } };
    }

    case 'trapShove': {
      const problem = trapProblem(state, action.at);
      if (problem !== null) return { ok: false, reason: problem };
      if (Math.abs(action.dx) + Math.abs(action.dy) !== 1) return { ok: false, reason: '飛ばす向きが正しくない' };
      return { ok: true, state: { ...state, abilities, traps: [...state.traps, { x: action.at.x, y: action.at.y, owner: me, kind: 'shove', dx: action.dx, dy: action.dy }] } };
    }

    case 'trapGhost': {
      const wall: WallSpec = { x: action.wall.x, y: action.wall.y, o: action.wall.o };
      if (state.wallBlocked[me]) return { ok: false, reason: '電波妨害で、この手番は壁を置けない' };
      if (state.wallsLeft[me] <= 0) return { ok: false, reason: '壁の残りがない' };
      const problem = wallFits(state, state.walls, wall);
      if (problem !== null) return { ok: false, reason: problem };
      wallsLeft[me] -= 1;
      return { ok: true, state: { ...state, abilities, wallsLeft, walls: [...state.walls, { ...wall, owner: me, ghost: true }] } };
    }
  }
}
