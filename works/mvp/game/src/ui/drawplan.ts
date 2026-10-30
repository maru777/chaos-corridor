import type { Rarity } from '../abilities';

/**
 * 技を引く演出の「計画」。見た目（DOM）から切り離した、決まった結果を返す計算だけ（テストできる）。
 * 裏向きのカードが降ってきて、ダーツが 1 枚に刺さり、めくれる。結果は、乱数の種で先に決まっている。
 * この計画は、ダーツをどのカードに当てるか、カードをどこに散らすか、レア度ごとの時間を決めるだけ。
 */

/** 降ってくる裏向きのカード 1 枚。位置は、場（画面の幅・高さ）に対する % */
export interface RainCard {
  readonly x: number;
  readonly y: number;
  readonly rot: number;
  /** 降り始めるまでの時間（ミリ秒） */
  readonly delay: number;
  /** 落ちる時間（ミリ秒） */
  readonly fall: number;
}

export interface DrawTiming {
  /** カードが降り終わるまで */
  readonly rainMs: number;
  /** ダーツが飛んで刺さるまで */
  readonly dartMs: number;
  /** 刺さってから、めくる前の「ため」（レア度が高いほど長い） */
  readonly buildMs: number;
  /** めくって、演出が終わるまで */
  readonly revealMs: number;
  /** 技名を見せておく時間 */
  readonly holdMs: number;
}

const TIMING: Readonly<Record<Rarity, DrawTiming>> = {
  UNCOMMON: { rainMs: 900, dartMs: 450, buildMs: 0, revealMs: 1000, holdMs: 500 },
  RARE: { rainMs: 900, dartMs: 450, buildMs: 300, revealMs: 1500, holdMs: 600 },
  EPIC: { rainMs: 1000, dartMs: 500, buildMs: 800, revealMs: 2300, holdMs: 700 },
  LEGENDARY: { rainMs: 1100, dartMs: 550, buildMs: 1600, revealMs: 3800, holdMs: 900 },
};

export function drawTiming(rarity: Rarity): DrawTiming {
  return TIMING[rarity];
}

/** 1 枚を引く演出の長さの合計 */
export function drawTotalMs(rarity: Rarity): number {
  const t = TIMING[rarity];
  return t.rainMs + t.dartMs + t.buildMs + t.revealMs + t.holdMs;
}

export const RAIN_COUNT = 12;

export interface DrawPlan {
  readonly cards: readonly RainCard[];
  /** ダーツが刺さるカード（cards の番号） */
  readonly hit: number;
  readonly timing: DrawTiming;
}

/**
 * 場を 4 列 × 3 行に分け、各マスに 1 枚ずつ、少しずらして散らす。ダーツの的は、真ん中の列あたりから選ぶ（めくる動きが見やすい）。
 * rng は 0 以上 1 未満の乱数（種つきのものを渡すと、毎回同じ計画になる）
 */
export function planDraw(rarity: Rarity, rng: () => number): DrawPlan {
  const cols = 4;
  const rows = 3;
  const cells: { c: number; r: number }[] = [];
  for (let r = 0; r < rows; r++) for (let c = 0; c < cols; c++) cells.push({ c, r });
  // 並べ替え（降る順番がばらばらになる）
  for (let i = cells.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [cells[i], cells[j]] = [cells[j] as { c: number; r: number }, cells[i] as { c: number; r: number }];
  }
  const cards = cells.map((cell, i): RainCard => ({
    x: 14 + (cell.c + 0.5) * (72 / cols) + (rng() - 0.5) * 6,
    y: 26 + (cell.r + 0.5) * (46 / rows) + (rng() - 0.5) * 5,
    rot: Math.round((rng() - 0.5) * 50),
    delay: Math.round(i * 55 + rng() * 40),
    fall: Math.round(420 + rng() * 160),
  }));
  const middle = cards.map((c, i) => ({ c, i })).filter(({ c }) => c.x > 30 && c.x < 70);
  const pool = middle.length > 0 ? middle : cards.map((c, i) => ({ c, i }));
  const hit = (pool[Math.floor(rng() * pool.length)] as { i: number }).i;
  return { cards, hit, timing: TIMING[rarity] };
}
