import { DIRS, inBounds, isBlocked } from './board';
import { createRng } from './rng';
import type { GameState, Meteor, PlayerId, Pos, Trap, TrapKind, Wall } from './types';

/** 攻撃技・Skill が「壊す」物の扱い（壁・隕石・罠）。ルール本体（rules.ts）から使う、盤の上の物の検索と取り除き */

export const TRAP_KINDS: readonly TrapKind[] = ['stun', 'back', 'shove', 'confiscate', 'seal'];

/** レーザーが 1 回で壊せる物の数 */
export const LASER_MAX_HITS = 3;
/** 隕石群が落とす隕石の数 */
export const SWARM_COUNT = 3;
/** 地雷原が撒く罠の数 */
export const MINES_COUNT = 3;
/** 略奪で奪う壁の枚数 */
export const PLUNDER_COUNT = 2;
/** 凍結で休ませる回数 */
export const FREEZE_TURNS = 2;
/** 烈風・強制移動で飛ばす最大のマス数 */
export const PUSH_STEPS = 2;

export type Hit =
  | { readonly kind: 'wall'; readonly wall: Wall }
  | { readonly kind: 'meteor'; readonly meteor: Meteor }
  | { readonly kind: 'trap'; readonly trap: Trap };

export function samePos(a: Pos, b: Pos): boolean {
  return a.x === b.x && a.y === b.y;
}

/** 壁が、そのマスの 4 辺のどれかをふさいでいるか */
export function wallTouchesCell(wall: Wall, cell: Pos): boolean {
  return DIRS.some((d) => isBlocked([wall], cell, { x: cell.x + d.x, y: cell.y + d.y }));
}

/** そのマスを中心にした 3×3（盤の外は除く） */
export function cellsAround(size: number, c: Pos): Pos[] {
  const out: Pos[] = [];
  for (let dy = -1; dy <= 1; dy++) {
    for (let dx = -1; dx <= 1; dx++) {
      const p = { x: c.x + dx, y: c.y + dy };
      if (inBounds(size, p)) out.push(p);
    }
  }
  return out;
}

/** 横一列（row）か縦一列（col）のマス */
export function lineCells(size: number, axis: 'row' | 'col', index: number): Pos[] {
  const out: Pos[] = [];
  for (let i = 0; i < size; i++) out.push(axis === 'row' ? { x: i, y: index } : { x: index, y: i });
  return out;
}

/** マスの中にある壊せる物。鉄壁は壊れない */
export function hitsInCells(state: Pick<GameState, 'walls' | 'meteors' | 'traps'>, cells: readonly Pos[]): Hit[] {
  const hits: Hit[] = [];
  for (const wall of state.walls) {
    if (!wall.iron && cells.some((c) => wallTouchesCell(wall, c))) hits.push({ kind: 'wall', wall });
  }
  for (const meteor of state.meteors) if (cells.some((c) => samePos(c, meteor))) hits.push({ kind: 'meteor', meteor });
  for (const trap of state.traps) if (cells.some((c) => samePos(c, trap))) hits.push({ kind: 'trap', trap });
  return hits;
}

/**
 * レーザーが壊す物。その列にある物のうち、相手の物を先に、そのあと自分の物を、列の若い順に、最大 3 つ。
 * 隕石はどちらの物でもない（相手の物と同じ扱い）。
 */
export function laserHits(state: Pick<GameState, 'size' | 'walls' | 'meteors' | 'traps'>, me: PlayerId, axis: 'row' | 'col', index: number): Hit[] {
  const cells = lineCells(state.size, axis, index);
  const order = (h: Hit): number => {
    const cellIndex = (p: Pos) => (axis === 'row' ? p.x : p.y);
    if (h.kind === 'wall') {
      const i = cells.findIndex((c) => wallTouchesCell(h.wall, c));
      return i;
    }
    const p = h.kind === 'meteor' ? h.meteor : h.trap;
    return cellIndex(p);
  };
  const mine = (h: Hit): number => (h.kind === 'wall' ? (h.wall.owner === me ? 1 : 0) : h.kind === 'trap' ? (h.trap.owner === me ? 1 : 0) : 0);
  return hitsInCells(state, cells)
    .sort((a, b) => mine(a) - mine(b) || order(a) - order(b))
    .slice(0, LASER_MAX_HITS);
}

/** 壊した物を取り除く。壁は持ち主の手元（ふつうの壁か、短い壁）に戻る */
export function removeHits(
  state: Pick<GameState, 'walls' | 'meteors' | 'traps' | 'wallsLeft' | 'shortWalls'>,
  hits: readonly Hit[],
): Pick<GameState, 'walls' | 'meteors' | 'traps' | 'wallsLeft' | 'shortWalls'> {
  const wallsLeft: [number, number] = [state.wallsLeft[0], state.wallsLeft[1]];
  const shortWalls: [number, number] = [state.shortWalls[0], state.shortWalls[1]];
  const gone = new Set<unknown>();
  for (const h of hits) {
    if (h.kind === 'wall') {
      gone.add(h.wall);
      if (h.wall.half === undefined) wallsLeft[h.wall.owner] += 1;
      else shortWalls[h.wall.owner] += 1;
    } else if (h.kind === 'meteor') gone.add(h.meteor);
    else gone.add(h.trap);
  }
  return {
    walls: state.walls.filter((w) => !gone.has(w)),
    meteors: state.meteors.filter((m) => !gone.has(m)),
    traps: state.traps.filter((t) => !gone.has(t)),
    wallsLeft,
    shortWalls,
  };
}

/** ランダムな攻撃の乱数。対局の種と手数だけで決まるので、両者の画面で同じ結果になる */
export function attackRng(state: Pick<GameState, 'rngSeed' | 'ply'>): () => number {
  return createRng((state.rngSeed ^ Math.imul(state.ply + 1, 0x9e3779b1)) >>> 0);
}

/** 罠・隕石を置ける空きマス（コマ・隕石・罠がないマス） */
export function emptyCells(state: Pick<GameState, 'size' | 'pawns' | 'meteors' | 'traps'>): Pos[] {
  const out: Pos[] = [];
  for (let y = 0; y < state.size; y++) {
    for (let x = 0; x < state.size; x++) {
      const p = { x, y };
      if (state.pawns.some((q) => samePos(q, p)) || state.meteors.some((m) => samePos(m, p)) || state.traps.some((t) => samePos(t, p))) continue;
      out.push(p);
    }
  }
  return out;
}
