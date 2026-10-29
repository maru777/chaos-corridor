import type { Rarity } from '../abilities';

/**
 * 雷（LEGENDARY の属性）の稲妻の形とタイミングを決める。描画から切り離した計算だけなので、テストできる。
 * 稲妻は、線の中点を少しずつずらしていく方法（中点変位）でギザギザにする。
 */

export interface Point {
  readonly x: number;
  readonly y: number;
}

/** from から to へ向かう稲妻の折れ線。点は 2^depth + 1 個。jitter はいちばん大きいずれ幅 */
export function boltPoints(rng: () => number, from: Point, to: Point, depth: number, jitter: number): Point[] {
  const dx = to.x - from.x;
  const dy = to.y - from.y;
  const len = Math.hypot(dx, dy) || 1;
  const nx = -dy / len;
  const ny = dx / len;
  let points: Point[] = [from, to];
  let amp = jitter;
  for (let d = 0; d < depth; d++) {
    const next: Point[] = [];
    for (let i = 0; i < points.length - 1; i++) {
      const a = points[i] as Point;
      const b = points[i + 1] as Point;
      const off = (rng() - 0.5) * 2 * amp;
      next.push(a, { x: (a.x + b.x) / 2 + nx * off, y: (a.y + b.y) / 2 + ny * off });
    }
    next.push(points[points.length - 1] as Point);
    points = next;
    amp /= 2;
  }
  return points;
}

export function pointsToPath(points: readonly Point[]): string {
  return points.map((p, i) => `${i === 0 ? 'M' : 'L'}${p.x.toFixed(1)} ${p.y.toFixed(1)}`).join(' ');
}

export interface BoltSpec {
  /** SVG の path の d */
  readonly d: string;
  /** カットインが始まってから光るまで */
  readonly delayMs: number;
  /** 光っている長さ */
  readonly durMs: number;
  /** 線の太さ（px） */
  readonly width: number;
}

export interface BoltLayout {
  readonly width: number;
  readonly height: number;
  /** 帯の上端の位置（px）と高さ */
  readonly bandTop: number;
  readonly bandHeight: number;
}

/**
 * 雷が落ちる時刻（カットインが始まってから）。「ドドドン」の 3 発と、最後の特大の 1 発。
 * 3D の揺れ・効果音も、これに合わせる。帯は、これが全部終わってから出る。
 */
export const THUNDER_HITS_MS: readonly number[] = [150, 420, 690, 1100];

/** 雷が落ちる位置（画面の幅に対する割合）。中央付近 */
const THUNDER_X: readonly number[] = [0.5, 0.4, 0.6, 0.5];

export interface StrikeSpec {
  readonly main: BoltSpec;
  readonly branches: readonly BoltSpec[];
  /** 画面が光る時刻 */
  readonly flashDelayMs: number;
}

export interface ThunderPlan {
  /** 最初に、画面の中央へ落ちる大きな雷（3 発。だんだん太く） */
  readonly strikes: readonly StrikeSpec[];
  /** そのあと、帯の縁を走る小さな電気 */
  readonly crackles: readonly BoltSpec[];
}

const CRACKLE_COUNT = 14;

/** 雷の計画。大きな雷は、画面の中央付近に、上から落ちる */
export function planThunder(rng: () => number, layout: BoltLayout, totalMs: number, impactMs: number): ThunderPlan {
  const landY = layout.height * 0.5;
  const last = THUNDER_HITS_MS.length - 1;
  const strikes = THUNDER_HITS_MS.map((t, i): StrikeSpec => {
    const x = (THUNDER_X[i] ?? 0.5) * layout.width;
    const from = { x: x + (rng() - 0.5) * layout.width * 0.06, y: -20 };
    const to = { x: x + (rng() - 0.5) * layout.width * 0.04, y: landY };
    const points = boltPoints(rng, from, to, 6, layout.width * 0.06 + 12);
    // 最後の 1 発は、特別に太く長い
    const main: BoltSpec = { d: pointsToPath(points), delayMs: t, durMs: i === last ? 650 : 420, width: i === last ? 16 : 5 + i * 2 };
    const branches = [0, 1].map((): BoltSpec => {
      const p = points[Math.floor(points.length * (0.35 + rng() * 0.4))] as Point;
      const dir = rng() < 0.5 ? -1 : 1;
      const end = { x: p.x + dir * layout.width * (0.15 + rng() * 0.2), y: p.y + layout.height * (0.05 + rng() * 0.1) };
      return { d: pointsToPath(boltPoints(rng, p, end, 4, layout.width * 0.025)), delayMs: t + 30, durMs: 340, width: 2.5 };
    });
    return { main, branches, flashDelayMs: t };
  });

  const span = Math.max(1, (totalMs - impactMs) * 0.75);
  const crackles: BoltSpec[] = [];
  for (let i = 0; i < CRACKLE_COUNT; i++) {
    const y = rng() < 0.5 ? layout.bandTop : layout.bandTop + layout.bandHeight;
    const len = layout.width * (0.18 + rng() * 0.3);
    const x0 = rng() * (layout.width - len);
    const from = { x: x0, y: y + (rng() - 0.5) * 8 };
    const to = { x: x0 + len, y: y + (rng() - 0.5) * 8 };
    crackles.push({
      d: pointsToPath(boltPoints(rng, from, to, 5, layout.bandHeight * 0.18 + 6)),
      delayMs: Math.max(0, impactMs - 250 + Math.pow(rng(), 1.6) * span),
      durMs: 160 + rng() * 160,
      width: 1.5 + rng() * 1.5,
    });
  }
  return { strikes, crackles };
}

/** 雷を使うのは LEGENDARY だけ */
export function usesThunder(rarity: Rarity): boolean {
  return rarity === 'LEGENDARY';
}
