import type { Rarity } from '../abilities';
import type { BoltLayout, BoltSpec } from './bolt';

/**
 * 属性ごとの演出（風・水・闇）の形とタイミングを決める。雷は bolt.ts。
 * 描画から切り離した計算だけなので、テストできる。
 *
 * UNCOMMON = 風（緑）、RARE = 水（青）、EPIC = 闇（紫）、LEGENDARY = 雷（金）。
 *
 * 風と闇は、演出の間ずっと動き続ける（繰り返し）。delayMs は「始まるまでの待ち」ではなく、
 * 繰り返しの中のどこから始めるか（位相）として使う。そのため、最初から動いている粒が混ざる。
 */

export type ElementId = 'wind' | 'water' | 'dark' | 'thunder';

export const ELEMENT_OF: Readonly<Record<Rarity, { readonly id: ElementId; readonly label: string }>> = {
  UNCOMMON: { id: 'wind', label: '風' },
  RARE: { id: 'water', label: '水' },
  EPIC: { id: 'dark', label: '闇' },
  LEGENDARY: { id: 'thunder', label: '雷' },
};

/** 動く粒（葉・泡・もや・火の粉）。(x, y) から (x+dx, y+dy) へ動く */
export interface Particle {
  readonly x: number;
  readonly y: number;
  readonly dx: number;
  readonly dy: number;
  readonly size: number;
  readonly rot: number;
  readonly delayMs: number;
  readonly durMs: number;
}

export interface FxTiming {
  readonly totalMs: number;
  readonly impactMs: number;
}

/** 範囲 [lo, hi] の乱数 */
function between(rng: () => number, lo: number, hi: number): number {
  return lo + rng() * (hi - lo);
}

/** 見せ場の少し前から、終わりの手前までの、ランダムな時刻 */
function when(rng: () => number, t: FxTiming, beforeMs: number, afterMs: number): number {
  return Math.max(0, Math.min(t.totalMs - 100, t.impactMs - beforeMs + rng() * (beforeMs + afterMs)));
}

// ---- 風 ----

/** 風の刃（三日月形）。左から右へ、画面を高速で横切る */
export interface Blade {
  readonly d: string;
  /** 動く距離（px）。画面の外から外へ抜ける */
  readonly dx: number;
  readonly delayMs: number;
  readonly durMs: number;
}

export interface WindPlan {
  /** 帯を横切って流れ続ける風の筋 */
  readonly streaks: readonly BoltSpec[];
  /** 画面を横切る風の刃 */
  readonly blades: readonly Blade[];
  /** 波打ちながら風に舞う葉 */
  readonly leaves: readonly Particle[];
}

/** 三日月形の風の刃。(x0, y) の尾から、右へ len の先端まで。thick は反りの大きさ（外側の弧の高さ） */
export function crescentPath(x0: number, y: number, len: number, thick: number): string {
  const x1 = x0 + len;
  const xm = x0 + len * 0.5;
  return `M${x0.toFixed(1)} ${y.toFixed(1)} Q${xm.toFixed(1)} ${(y - thick).toFixed(1)} ${x1.toFixed(1)} ${y.toFixed(1)} Q${xm.toFixed(1)} ${(y - thick * 0.28).toFixed(1)} ${x0.toFixed(1)} ${y.toFixed(1)} Z`;
}

export function planWind(rng: () => number, layout: BoltLayout): WindPlan {
  const streaks: BoltSpec[] = [];
  for (let i = 0; i < 22; i++) {
    const y = between(rng, layout.bandTop - 50, layout.bandTop + layout.bandHeight + 50);
    const x0 = -0.15 * layout.width;
    const x1 = 1.15 * layout.width;
    const c1y = y + between(rng, -34, 34);
    const c2y = y + between(rng, -34, 34);
    const y1 = y + between(rng, -20, 20);
    const d = `M${x0.toFixed(1)} ${y.toFixed(1)} C${(layout.width * 0.3).toFixed(1)} ${c1y.toFixed(1)} ${(layout.width * 0.65).toFixed(1)} ${c2y.toFixed(1)} ${x1.toFixed(1)} ${y1.toFixed(1)}`;
    streaks.push({ d, delayMs: between(rng, 0, 900), durMs: between(rng, 650, 1200), width: i % 4 === 0 ? between(rng, 0.8, 1.2) : between(rng, 1.6, 3) });
  }
  const blades: Blade[] = [];
  for (let i = 0; i < 9; i++) {
    const len = between(rng, 140, 320);
    blades.push({
      d: crescentPath(-len, between(rng, layout.bandTop - 60, layout.bandTop + layout.bandHeight + 60), len, between(rng, 18, 42)),
      dx: layout.width + len * 2,
      delayMs: between(rng, 0, 1200),
      durMs: between(rng, 420, 760),
    });
  }
  const leaves: Particle[] = [];
  for (let i = 0; i < 16; i++) {
    leaves.push({
      x: -50,
      y: between(rng, layout.bandTop - 90, layout.bandTop + layout.bandHeight + 90),
      dx: layout.width + 100,
      dy: between(rng, 14, 46), // 波打つ高さ
      size: between(rng, 10, 22),
      rot: between(rng, 0, 360),
      delayMs: between(rng, 0, 1800),
      durMs: between(rng, 1300, 2200),
    });
  }
  return { streaks, blades, leaves };
}

// ---- 水 ----

export interface Ripple {
  readonly cx: number;
  readonly cy: number;
  readonly maxR: number;
  readonly delayMs: number;
  readonly durMs: number;
}

export interface WaterPlan {
  /** 見せ場で、帯の中心から広がる波紋 */
  readonly ripples: readonly Ripple[];
  /** 帯の下から昇る泡 */
  readonly bubbles: readonly Particle[];
}

export function planWater(rng: () => number, layout: BoltLayout, t: FxTiming): WaterPlan {
  const cx = layout.width / 2;
  const cy = layout.bandTop + layout.bandHeight / 2;
  const ripples: Ripple[] = [0, 1, 2].map((i) => ({
    cx,
    cy,
    maxR: layout.width * (0.4 + i * 0.05),
    delayMs: Math.max(0, t.impactMs - 100 + i * 220),
    durMs: 1100,
  }));
  const bubbles: Particle[] = [];
  for (let i = 0; i < 20; i++) {
    bubbles.push({
      x: rng() * layout.width,
      y: layout.bandTop + layout.bandHeight - between(rng, 0, layout.bandHeight * 0.4),
      dx: between(rng, -20, 20),
      dy: -between(rng, 120, 260),
      size: between(rng, 6, 18),
      rot: 0,
      delayMs: when(rng, t, 400, 700),
      durMs: between(rng, 1100, 1700),
    });
  }
  return { ripples, bubbles };
}

/** 横に流れる波の線。totalWidth の長さぶん、半波長ごとに山と谷を交互に描く（左へ 1 波長ずらすと同じ形に戻る） */
export function wavePath(totalWidth: number, y: number, amp: number, wavelength: number): string {
  const half = wavelength / 2;
  const segments = Math.ceil(totalWidth / half);
  let d = `M0 ${y.toFixed(1)}`;
  for (let i = 0; i < segments; i++) {
    const x = i * half;
    const control = y + (i % 2 === 0 ? -amp : amp);
    d += ` Q${(x + half / 2).toFixed(1)} ${control.toFixed(1)} ${(x + half).toFixed(1)} ${y.toFixed(1)}`;
  }
  return d;
}

// ---- 闇 ----

export interface MagicCircle {
  /** 同心円の半径 */
  readonly rings: readonly number[];
  /** 六芒星（逆向きの 2 つの三角形）の path */
  readonly star: string;
  /** 外周の目盛り（短い線）の path */
  readonly ticks: string;
  readonly tickCount: number;
}

/** 魔法陣の形。cx, cy を中心に、半径 r の円周に六芒星と目盛りを置く */
export function magicCircle(cx: number, cy: number, r: number): MagicCircle {
  const at = (radius: number, deg: number) => ({
    x: cx + radius * Math.cos(((deg - 90) * Math.PI) / 180),
    y: cy + radius * Math.sin(((deg - 90) * Math.PI) / 180),
  });
  const triangle = (offset: number) =>
    [0, 120, 240]
      .map((deg, i) => {
        const p = at(r * 0.86, deg + offset);
        return `${i === 0 ? 'M' : 'L'}${p.x.toFixed(1)} ${p.y.toFixed(1)}`;
      })
      .join(' ') + ' Z';
  const tickCount = 36;
  let ticks = '';
  for (let i = 0; i < tickCount; i++) {
    const a = at(r * 0.93, i * (360 / tickCount));
    const b = at(r, i * (360 / tickCount));
    ticks += `M${a.x.toFixed(1)} ${a.y.toFixed(1)} L${b.x.toFixed(1)} ${b.y.toFixed(1)} `;
  }
  return { rings: [r, r * 0.9, r * 0.42], star: `${triangle(0)} ${triangle(60)}`, ticks: ticks.trim(), tickCount };
}

export interface Fog {
  /** 霧のかたまりの大きさ（px） */
  readonly size: number;
  /** 中心からの距離（px）。この半径で、まわりをゆっくり回る */
  readonly orbit: number;
  readonly startDeg: number;
  /** 1 周する時間 */
  readonly spinMs: number;
}

export interface DarkPlan {
  /** 帯の下から立ち昇り続ける、紫のもや */
  readonly wisps: readonly Particle[];
  /** 勢いよく昇る火の粉 */
  readonly embers: readonly Particle[];
  /** 画面の下の左右から、這い上がる闇の蔓（つる） */
  readonly tendrils: readonly BoltSpec[];
  /** 画面をゆっくり回る、うねる霧 */
  readonly fogs: readonly Fog[];
}

export function planDark(rng: () => number, layout: BoltLayout): DarkPlan {
  const wisps: Particle[] = [];
  for (let i = 0; i < 26; i++) {
    wisps.push({
      x: rng() * layout.width,
      y: layout.bandTop + layout.bandHeight + between(rng, 0, 90),
      dx: between(rng, -50, 50),
      dy: -between(rng, 200, 380),
      size: between(rng, 50, 130),
      rot: 0,
      delayMs: between(rng, 0, 2000),
      durMs: between(rng, 1600, 2600),
    });
  }
  const embers: Particle[] = [];
  for (let i = 0; i < 24; i++) {
    embers.push({
      x: rng() * layout.width,
      y: layout.bandTop + layout.bandHeight * between(rng, 0.4, 1.1),
      dx: between(rng, -30, 30),
      dy: -between(rng, 140, 340),
      size: between(rng, 3, 8),
      rot: 0,
      delayMs: between(rng, 0, 1600),
      durMs: between(rng, 900, 1500),
    });
  }
  const tendrils: BoltSpec[] = [];
  for (let i = 0; i < 9; i++) {
    const fromLeft = i % 2 === 0;
    const x0 = fromLeft ? between(rng, -0.02, 0.3) * layout.width : between(rng, 0.7, 1.02) * layout.width;
    const x1 = x0 + (fromLeft ? 1 : -1) * between(rng, 0.1, 0.4) * layout.width;
    const y1 = layout.bandTop + between(rng, -0.1, 1.1) * layout.bandHeight;
    const d = `M${x0.toFixed(1)} ${layout.height} C${(x0 + between(rng, -120, 120)).toFixed(1)} ${(layout.height * 0.82).toFixed(1)} ${(x1 + between(rng, -120, 120)).toFixed(1)} ${((layout.height + y1) / 2).toFixed(1)} ${x1.toFixed(1)} ${y1.toFixed(1)}`;
    tendrils.push({ d, delayMs: between(rng, 0, 1400), durMs: between(rng, 1500, 2300), width: between(rng, 4, 9) });
  }
  const fogs: Fog[] = [0, 1, 2].map((i) => ({
    size: Math.min(layout.width, layout.height) * (0.55 + i * 0.1),
    orbit: layout.width * (0.12 + i * 0.07),
    startDeg: i * 120,
    spinMs: 5200 + i * 1800,
  }));
  return { wisps, embers, tendrils, fogs };
}
