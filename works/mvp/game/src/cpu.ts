import { DIRS, goalRow, inBounds, isBlocked } from './board';
import { applyAction, legalActions, viewWalls } from './rules';
import type { Action, GameState, PlayerId, Pos, WallSpec } from './types';

/**
 * CPU。盤にも画面にも依存しない、純粋な関数。同じ状態・同じ乱数なら、同じ手を選ぶ。
 * 全ての合法手（legalActions）から選ぶので、反則手は出さない。
 * 強さ（1〜10）は、先を読む手数・候補の数・うっかり（ランダムに外す確率）で決める。
 */

export const CPU_LEVELS = 5;

export interface LevelSpec {
  /** 先を読む手数 */
  readonly depth: number;
  /** 1 手ごとに、深く調べる候補の数 */
  readonly beam: number;
  /** うっかり: 上位の候補から、ランダムに選ぶ確率 */
  readonly slip: number;
  /** 考える時間の上限（ミリ秒）。超えたら、そこまでに読めた結果で決める */
  readonly timeMs: number;
}

/** ★1〜★5。1 手先だけを見る段階（以前の Lv1〜5）は、弱すぎて意味がないので、なくした */
const LEVELS: readonly LevelSpec[] = [
  { depth: 2, beam: 6, slip: 0, timeMs: 1500 }, // ★1: 2 手読み（候補を絞る）
  { depth: 2, beam: 12, slip: 0, timeMs: 1500 }, // ★2: 2 手読み
  { depth: 3, beam: 8, slip: 0, timeMs: 2500 }, // ★3: 3 手読み
  { depth: 3, beam: 12, slip: 0, timeMs: 3000 }, // ★4: 3 手読み（候補を広く）
  { depth: 4, beam: 10, slip: 0, timeMs: 3500 }, // ★5: 4 手読み
];

export function levelSpec(level: number): LevelSpec {
  const i = Math.min(CPU_LEVELS, Math.max(1, Math.round(level))) - 1;
  return LEVELS[i] as LevelSpec;
}

export const LEVEL_NAMES: readonly string[] = ['見習い', 'ベテラン', '策士', '達人', '魔王'];

/** 段階の表示: ★☆☆☆☆ 〜 ★★★★★ */
export function levelStars(level: number): string {
  const n = Math.min(CPU_LEVELS, Math.max(1, Math.round(level)));
  return '★'.repeat(n) + '☆'.repeat(CPU_LEVELS - n);
}

const WIN = 1_000_000;

/** pawn がゴール行に着くまでの最短の歩数（コマと能力は無視。壁と、通れないマス（隕石）は避ける）。着けなければ Infinity */
export function shortestPath(state: GameState, player: PlayerId): Pos[] | null {
  const size = state.size;
  const from = state.pawns[player];
  const goalY = goalRow(size, player);
  const blocked = new Set<number>(state.meteors.map((m) => m.y * size + m.x));
  const prev = new Map<number, number>();
  const start = from.y * size + from.x;
  prev.set(start, -1);
  const queue: number[] = [start];
  for (let i = 0; i < queue.length; i++) {
    const k = queue[i] as number;
    const cur = { x: k % size, y: Math.floor(k / size) };
    if (cur.y === goalY) {
      const path: Pos[] = [];
      for (let c = k; c !== -1; c = prev.get(c) as number) path.push({ x: c % size, y: Math.floor(c / size) });
      return path.reverse();
    }
    for (const d of DIRS) {
      const next = { x: cur.x + d.x, y: cur.y + d.y };
      if (!inBounds(size, next) || isBlocked(state.walls, cur, next)) continue;
      const nk = next.y * size + next.x;
      if (prev.has(nk) || blocked.has(nk)) continue;
      prev.set(nk, k);
      queue.push(nk);
    }
  }
  return null;
}

function dist(state: GameState, player: PlayerId): number {
  const p = shortestPath(state, player);
  return p === null ? 99 : p.length - 1;
}

/** 状態の良さ（me から見て。大きいほど良い）。ゴールまでの歩数の差を中心に、残りの壁・手札も少し見る */
export function evaluate(state: GameState, me: PlayerId): number {
  const foe: PlayerId = me === 0 ? 1 : 0;
  if (state.winner === me) return WIN;
  if (state.winner === foe) return -WIN;
  let s = (dist(state, foe) - dist(state, me)) * 10;
  s += (state.wallsLeft[me] - state.wallsLeft[foe]) * 1.2;
  s += (state.shortWalls[me] - state.shortWalls[foe]) * 0.4;
  s += (state.abilities[me].length - state.abilities[foe].length) * 1.0;
  if (state.wallBlocked[foe]) s += 2;
  if (state.wallBlocked[me]) s -= 2;
  // 休まされている回数は、1 手番ぶんの重さ（歩数の差 1 は 10 点なので、ほぼ 1 歩ぶん）
  s += (state.skip[foe] - state.skip[me]) * 8;
  // 攻撃技は、撃つまでが持ち札。自分の罠は、これから効く
  s += ((state.attacks[me] !== null && !state.attackUsed[me] ? 1 : 0) - (state.attacks[foe] !== null && !state.attackUsed[foe] ? 1 : 0)) * 2;
  s += state.traps.reduce((sum, t) => sum + (t.owner === me ? 1.5 : -1.5), 0);
  if (state.sealed[foe]) s += 2;
  if (state.sealed[me]) s -= 2;
  return s;
}

/**
 * CPU に見えている盤。相手の罠と、相手の見えない壁は、人間と同じく見えない。
 * （ぶつかった壁は、姿を現して見えるようになる）
 */
export function viewFor(state: GameState, player: PlayerId): GameState {
  const hidden = state.walls.some((w) => w.ghost === true && w.owner !== player);
  const traps = state.traps.filter((t) => t.owner === player);
  if (!hidden && traps.length === state.traps.length) return state;
  return { ...state, walls: hidden ? viewWalls(state, player) : state.walls, traps };
}

/** 罠を仕掛ける先は、相手の最短の道の、先のほうのマスに絞る（読む手を減らすため） */
const TRAP_AHEAD = 6;

/** 壁・罠・見えない壁は、動く側の相手の最短の道に関わるものに絞る（読む手を減らすため）。それ以外の手は、そのまま */
function candidates(state: GameState): Action[] {
  const mover = state.turn;
  const foe: PlayerId = mover === 0 ? 1 : 0;
  const path = shortestPath(state, foe);
  const all = legalActions(state);
  if (path === null) return all;
  const onPath = (w: WallSpec) => {
    for (let i = 0; i + 1 < path.length; i++) if (isBlocked([w], path[i] as Pos, path[i + 1] as Pos)) return true;
    return false;
  };
  const ahead = path.slice(1, 1 + TRAP_AHEAD);
  const awayDy = -Math.sign(goalRow(state.size, foe) - state.pawns[foe].y);
  return all.filter((a) => {
    if (a.type === 'wall') return onPath({ x: a.x, y: a.y, o: a.o, ...(a.half === undefined ? {} : { half: a.half }) });
    if (a.type === 'attack' && a.id === 'atkBomb') return Math.abs(a.at.x - state.pawns[foe].x) <= 2 && Math.abs(a.at.y - state.pawns[foe].y) <= 2;
    if (a.type !== 'ability') return true;
    switch (a.id) {
      case 'trapGhost':
        return onPath(a.wall);
      case 'trapStun':
      case 'trapBack':
      case 'trapConfiscate':
      case 'trapSeal':
        return ahead.some((p) => p.x === a.at.x && p.y === a.at.y);
      case 'trapShove':
        return a.dx === 0 && a.dy === awayDy && ahead.some((p) => p.x === a.at.x && p.y === a.at.y);
      default:
        return true;
    }
  });
}

interface Child {
  readonly action: Action;
  readonly state: GameState;
  readonly score: number;
}

class Timeout extends Error {}

function children(state: GameState, me: PlayerId): Child[] {
  const out: Child[] = [];
  for (const action of candidates(state)) {
    const r = applyAction(state, action);
    if (r.ok) out.push({ action, state: r.state, score: evaluate(r.state, me) });
  }
  return out;
}

function search(state: GameState, me: PlayerId, depth: number, beam: number, alpha: number, beta: number, deadline: number): number {
  if (state.winner !== null) return evaluate(state, me) + (state.winner === me ? depth : -depth); // 早い勝ちほど良く、遅い負けほど良い
  if (depth === 0) return evaluate(state, me);
  if (Date.now() > deadline) throw new Timeout();
  const maximizing = state.turn === me;
  const kids = children(state, me).sort((a, b) => (maximizing ? b.score - a.score : a.score - b.score)).slice(0, beam);
  if (kids.length === 0) return evaluate(state, me);
  let best = maximizing ? -Infinity : Infinity;
  for (const k of kids) {
    const v = search(k.state, me, depth - 1, beam, alpha, beta, deadline);
    if (maximizing) {
      best = Math.max(best, v);
      alpha = Math.max(alpha, v);
    } else {
      best = Math.min(best, v);
      beta = Math.min(beta, v);
    }
    if (beta <= alpha) break;
  }
  return best;
}

/** CPU の手。rng は 0 以上 1 未満の乱数（種つきのものを渡すと、同じ手になる） */
export function chooseAction(real: GameState, level: number, rng: () => number, now: () => number = Date.now): Action {
  const action = chooseOnView(real, level, rng, now);
  if (applyAction(real, action).ok) return action;
  // 見えない罠・壁と重なったなど、本当の盤では反則だったとき: 本当の盤で打てる手のうち、ゴールに近づく手を選ぶ
  const legal = legalActions(real);
  const me = real.turn;
  const best = legal
    .map((a) => ({ a, r: applyAction(real, a) }))
    .filter((x) => x.r.ok)
    .map((x) => ({ a: x.a, score: x.r.ok ? evaluate(x.r.state, me) : -Infinity }))
    .sort((p, q) => q.score - p.score)[0];
  if (!best) throw new Error('打てる手がない');
  return best.a;
}

function chooseOnView(real: GameState, level: number, rng: () => number, now: () => number): Action {
  const spec = levelSpec(level);
  const me = real.turn;
  const state = viewFor(real, me);
  const all = legalActions(state);
  if (all.length === 0) throw new Error('打てる手がない');
  const kids = children(state, me).sort((a, b) => b.score - a.score);
  if (kids.length === 0) return all[0] as Action;
  // うっかり: 上位 5 つの中から、ランダムに選ぶ
  if (spec.slip > 0 && rng() < spec.slip) return (kids[Math.floor(rng() * Math.min(5, kids.length))] as Child).action;
  if (spec.depth === 1) return pickBest(kids, rng);

  // 読む手数を 2 から増やしていく。時間が切れたら、最後まで読めた手数の結果を使う
  const deadline = now() + spec.timeMs;
  let best: Child[] = kids.slice(0, spec.beam);
  let chosen = pickBest(kids, rng);
  for (let d = 2; d <= spec.depth; d++) {
    try {
      const scored: Child[] = [];
      let alpha = -Infinity;
      for (const k of best) {
        const v = search(k.state, me, d - 1, spec.beam, alpha, Infinity, deadline);
        scored.push({ ...k, score: v });
        if (state.turn === me) alpha = Math.max(alpha, v - 0.001); // 同点も残して、ランダムに選べるように
      }
      chosen = pickBest(scored, rng);
      best = [...scored].sort((a, b) => b.score - a.score);
    } catch (e) {
      if (e instanceof Timeout) break;
      throw e;
    }
  }
  return chosen;
}

function pickBest(kids: readonly Child[], rng: () => number): Action {
  const top = Math.max(...kids.map((k) => k.score));
  const ties = kids.filter((k) => k.score >= top - 1e-9);
  return (ties[Math.floor(rng() * ties.length)] as Child).action;
}
