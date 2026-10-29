import type { Rarity } from '../abilities';

/**
 * 能力を使ったときの、3D 画面側の演出の強さ（光のにじみ・ズーム・揺れ・スロー）を、時間から計算する。
 * 描画から切り離した計算だけなので、テストできる。レア度が高いほど派手になる。
 */

export interface ImpactFrame {
  /** 光のにじみ（ブルーム）に足す強さ */
  readonly glow: number;
  /** 視野角をせばめる角度（度）。大きいほどズームイン */
  readonly zoomDeg: number;
  /** カメラの揺れの大きさ */
  readonly shake: number;
  /** 時間の進み方。1 が通常、小さいほどスロー */
  readonly timeScale: number;
}

interface Profile {
  readonly glow: number;
  readonly glowDur: number;
  readonly zoom: number;
  /** true: 衝撃の瞬間に向けてじわじわ寄っていく。false: 衝撃の瞬間だけ寄る */
  readonly zoomBuildUp: boolean;
  readonly shake: number;
  readonly shakeDur: number;
  readonly slow?: { readonly factor: number; readonly extraMs: number };
}

export const IMPACT_PROFILES: Readonly<Record<Rarity, Profile>> = {
  UNCOMMON: { glow: 0.3, glowDur: 300, zoom: 0, zoomBuildUp: false, shake: 0, shakeDur: 0 },
  RARE: { glow: 0.6, glowDur: 400, zoom: 1.5, zoomBuildUp: false, shake: 0, shakeDur: 0 },
  EPIC: { glow: 1.0, glowDur: 500, zoom: 3, zoomBuildUp: false, shake: 0.12, shakeDur: 500 },
  LEGENDARY: { glow: 1.8, glowDur: 800, zoom: 8, zoomBuildUp: true, shake: 0.22, shakeDur: 700, slow: { factor: 0.25, extraMs: 500 } },
};

/** この時間を過ぎたら、演出は終わり（すべて 0 に戻る） */
export const IMPACT_TAIL_MS = 1600;

function pulse(elapsed: number, start: number, dur: number): number {
  if (dur <= 0 || elapsed < start || elapsed > start + dur) return 0;
  return Math.sin((Math.PI * (elapsed - start)) / dur);
}

function smooth(t: number): number {
  const c = Math.min(1, Math.max(0, t));
  return c * c * (3 - 2 * c);
}

/**
 * elapsedMs: 演出を始めてからの時間、impactMs: 衝撃の瞬間（カットインの見せ場）までの時間。
 * reduced が true（OS の「視差効果を減らす」設定）のときは、揺れ・ズーム・スローをなくし、光も弱める。
 */
export function impactFrame(rarity: Rarity, elapsedMs: number, impactMs: number, reduced = false): ImpactFrame {
  const p = IMPACT_PROFILES[rarity];
  const glow = p.glow * pulse(elapsedMs, impactMs - 100, p.glowDur);
  if (reduced) return { glow: glow * 0.3, zoomDeg: 0, shake: 0, timeScale: 1 };

  let z: number;
  if (p.zoomBuildUp) z = elapsedMs < impactMs ? smooth(elapsedMs / impactMs) : Math.max(0, 1 - (elapsedMs - impactMs) / 600);
  else z = pulse(elapsedMs, impactMs - 100, 500);

  const shakeT = elapsedMs - impactMs;
  const shake = p.shakeDur > 0 && shakeT >= 0 && shakeT < p.shakeDur ? p.shake * (1 - shakeT / p.shakeDur) : 0;
  const slowing = p.slow !== undefined && elapsedMs < impactMs + p.slow.extraMs;
  return { glow, zoomDeg: p.zoom * z, shake, timeScale: slowing && p.slow ? p.slow.factor : 1 };
}
