/**
 * ふだんの操作（コマの移動・壁を置く）の効果音の「作り方」。音そのものは sfx.ts が合成する。
 * ここは、音の部品（高さの変化・長さ・大きさ）をデータにしただけで、ブラウザの音声機能には触れないので、テストできる。
 * 毎回ランダムに選び（同じ音が続かない）、少し高さをずらし、先手と後手で高さを変える。
 */

export type VoiceKind = 'tone' | 'noise';

export interface Voice {
  /** tone: 音程のある音、noise: 風・衝撃のような雑音 */
  readonly kind: VoiceKind;
  /** tone の波形（noise では使わない） */
  readonly wave?: 'sine' | 'triangle' | 'square' | 'sawtooth';
  /** 周波数（Hz）。from から to へ変化する */
  readonly from: number;
  readonly to: number;
  /** 始まる時刻（秒。効果音の開始から） */
  readonly at: number;
  /** 長さ（秒） */
  readonly dur: number;
  /** 大きさ（0〜1） */
  readonly vol: number;
}

export interface SfxRecipe {
  /** 名前（擬音のイメージ） */
  readonly name: string;
  readonly voices: readonly Voice[];
}

const tone = (wave: NonNullable<Voice['wave']>, from: number, to: number, at: number, dur: number, vol: number): Voice => ({
  kind: 'tone',
  wave,
  from,
  to,
  at,
  dur,
  vol,
});
const noise = (from: number, to: number, at: number, dur: number, vol: number): Voice => ({ kind: 'noise', from, to, at, dur, vol });

/** コマが動く音。軽くて短い */
export const MOVE_RECIPES: readonly SfxRecipe[] = [
  { name: 'タッ', voices: [noise(2500, 1200, 0, 0.05, 0.5), tone('sine', 900, 500, 0, 0.07, 0.35)] },
  { name: 'コツ', voices: [tone('triangle', 420, 180, 0, 0.09, 0.5), noise(1800, 900, 0, 0.04, 0.3)] },
  { name: 'ピョン', voices: [tone('sine', 500, 900, 0, 0.1, 0.35), tone('sine', 900, 700, 0.08, 0.08, 0.25)] },
  { name: 'スッ', voices: [noise(800, 4000, 0, 0.14, 0.35)] },
  { name: 'カッ', voices: [tone('square', 1400, 900, 0, 0.04, 0.25), noise(4000, 2500, 0, 0.03, 0.35)] },
  { name: 'ポッ', voices: [tone('sine', 300, 700, 0, 0.08, 0.5)] },
];

/** 壁を置く音。重くて、衝撃がある */
export const WALL_RECIPES: readonly SfxRecipe[] = [
  { name: 'ドン', voices: [tone('sine', 140, 45, 0, 0.22, 0.9), noise(700, 150, 0, 0.18, 0.5)] },
  { name: 'ガンッ', voices: [tone('sine', 180, 55, 0, 0.25, 0.8), noise(3500, 600, 0, 0.12, 0.7), tone('square', 300, 150, 0, 0.08, 0.2)] },
  { name: 'カチッ', voices: [noise(5000, 2000, 0, 0.05, 0.7), tone('triangle', 1100, 700, 0, 0.09, 0.35), tone('sine', 130, 60, 0.02, 0.12, 0.5)] },
  { name: 'ゴッ', voices: [tone('sine', 110, 60, 0, 0.26, 0.8), noise(1200, 300, 0, 0.2, 0.6)] },
  { name: 'キィン', voices: [noise(4500, 1500, 0, 0.06, 0.5), tone('sine', 150, 50, 0, 0.15, 0.6), tone('sine', 1800, 1700, 0.02, 0.35, 0.3), tone('sine', 2700, 2650, 0.02, 0.3, 0.2)] },
  { name: 'ドスッ', voices: [tone('triangle', 200, 70, 0, 0.2, 0.8), noise(500, 120, 0, 0.16, 0.6)] },
];

/** 前回と同じものを除いて、ランダムに 1 つ選ぶ（同じ音が続かない）。count が 1 以下なら 0 */
export function pickVariant(count: number, last: number, rng: () => number): number {
  if (count <= 1) return 0;
  const i = Math.floor(rng() * (count - 1));
  return i >= last ? i + 1 : i;
}

/** 毎回、高さを少しずらす（±6%）。同じ音でも、同じに聞こえにくい */
export function pitchJitter(rng: () => number): number {
  return 1 + (rng() - 0.5) * 0.12;
}

/** 使った人ごとの高さ。先手は高め、後手は低め（どちらの操作か、耳でも分かる） */
export function playerPitch(player: 0 | 1): number {
  return player === 0 ? 1 : 0.84;
}
