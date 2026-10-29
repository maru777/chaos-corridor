import type { Rarity } from '../abilities';

/**
 * カットインの「電気が走る」稲妻の形と出るタイミングを決める。描画から切り離した計算だけなので、テストできる。
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

/** 稲妻の本数。レア度が高いほど多い */
export const BOLT_COUNT: Readonly<Record<Rarity, number>> = {
  UNCOMMON: 4,
  RARE: 8,
  EPIC: 16,
  LEGENDARY: 30,
};

/**
 * 稲妻を計画する。
 * - 帯の縁を走る稲妻（全レア度）
 * - 画面の上下から帯へ落ちる稲妻（EPIC 以上）
 * 見せ場（impactMs）の少し前から、終わりに向けて、見せ場の近くほど多く光る。
 */
export function planBolts(rarity: Rarity, rng: () => number, layout: BoltLayout, totalMs: number, impactMs: number): BoltSpec[] {
  const out: BoltSpec[] = [];
  const strikes = rarity === 'EPIC' || rarity === 'LEGENDARY';
  const span = Math.max(1, (totalMs - impactMs) * 0.75);
  for (let i = 0; i < BOLT_COUNT[rarity]; i++) {
    const delayMs = Math.max(0, impactMs - 250 + Math.pow(rng(), 1.6) * span);
    const durMs = 160 + rng() * 160;
    let from: Point;
    let to: Point;
    let jitter: number;
    let width: number;
    if (strikes && rng() < 0.45) {
      const x = rng() * layout.width;
      from = rng() < 0.6 ? { x, y: 0 } : { x, y: layout.height };
      to = { x: x + (rng() - 0.5) * layout.width * 0.3, y: layout.bandTop + layout.bandHeight * (0.2 + rng() * 0.6) };
      jitter = layout.width * 0.05 + 10;
      width = 2 + rng() * 2.5;
    } else {
      const y = rng() < 0.5 ? layout.bandTop : layout.bandTop + layout.bandHeight;
      const len = layout.width * (0.18 + rng() * 0.3);
      const x0 = rng() * (layout.width - len);
      from = { x: x0, y: y + (rng() - 0.5) * 8 };
      to = { x: x0 + len, y: y + (rng() - 0.5) * 8 };
      jitter = layout.bandHeight * 0.18 + 6;
      width = 1.5 + rng() * 1.5;
    }
    out.push({ d: pointsToPath(boltPoints(rng, from, to, 5, jitter)), delayMs, durMs, width });
  }
  return out;
}
