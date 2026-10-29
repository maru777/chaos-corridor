import type { Rarity } from '../abilities';
import { buildElementLayers } from './elements';
import { ELEMENT_OF } from './fxplan';

/**
 * 能力を使ったときのカットイン（画面いっぱいの文字の演出）。HTML と CSS で作る。
 * レア度が高いほど、長く・大きく・派手になり、レア度ごとに色と属性が変わる。
 *   UNCOMMON = 風（緑）、RARE = 水（青）、EPIC = 闇（紫）、LEGENDARY = 雷（金）。
 * 名前が読めるよう、見せ場のあとも 1.2 秒以上は画面に残す。
 * 見た目は index.html の `.cutin` の CSS にある。ここは要素を作って、終わったら消すだけ。
 */

export interface CutInTiming {
  /** 全体の長さ（ミリ秒） */
  readonly totalMs: number;
  /** 見せ場（名前が決まる・光る瞬間）までの時間 */
  readonly impactMs: number;
  /** 飛び散る粒の数 */
  readonly particles: number;
  /** 帯が出始めるまでの時間（LEGENDARY は、先に雷が落ちる） */
  readonly bandDelayMs: number;
}

export const CUTIN_TIMING: Readonly<Record<Rarity, CutInTiming>> = {
  UNCOMMON: { totalMs: 1800, impactMs: 400, particles: 0, bandDelayMs: 0 },
  RARE: { totalMs: 2400, impactMs: 600, particles: 0, bandDelayMs: 0 },
  EPIC: { totalMs: 3200, impactMs: 850, particles: 36, bandDelayMs: 0 },
  // 雷が「ドドドン」と落ちきってから（約 1.7 秒）帯が出て、そのあとで名前が決まる
  LEGENDARY: { totalMs: 5800, impactMs: 2500, particles: 80, bandDelayMs: 1750 },
};

/** 帯の高さ（px）。CSS の変数にも渡し、演出の位置の計算にも使う */
export const BAND_HEIGHT_PX: Readonly<Record<Rarity, number>> = {
  UNCOMMON: 86,
  RARE: 124,
  EPIC: 180,
  LEGENDARY: 240,
};

/** 帯の上端の位置（画面の高さに対する割合）。CSS の `.cutin-band { top }` と同じ */
export const BAND_TOP_RATIO = 0.36;

export interface CutInOptions {
  readonly name: string;
  readonly reading: string;
  readonly rarity: Rarity;
  /** 使った人 */
  readonly player: 0 | 1;
}

const PLAYER_LABEL = ['先手', '後手'] as const;

function el<K extends keyof HTMLElementTagNameMap>(tag: K, className: string, text?: string): HTMLElementTagNameMap[K] {
  const e = document.createElement(tag);
  e.className = className;
  if (text !== undefined) e.textContent = text;
  return e;
}

/** カットインを出し、終わったら消して、約束（Promise）を果たす */
export function playCutIn(container: HTMLElement, opts: CutInOptions): Promise<void> {
  const timing = CUTIN_TIMING[opts.rarity];
  const element = ELEMENT_OF[opts.rarity];
  const root = el('div', `cutin ${opts.rarity.toLowerCase()} el-${element.id}`);
  root.dataset['player'] = String(opts.player);
  root.style.setProperty('--dur', `${timing.totalMs}ms`);
  root.style.setProperty('--impact', `${timing.impactMs}ms`);
  root.style.setProperty('--band-delay', `${timing.bandDelayMs}ms`);
  root.style.setProperty('--band-h', `${BAND_HEIGHT_PX[opts.rarity]}px`);
  root.style.setProperty('--chars', String(Math.max(2, opts.name.length)));

  const w = window.innerWidth;
  const h = window.innerHeight;
  const layers = buildElementLayers(opts.rarity, timing, { width: w, height: h, bandTop: h * BAND_TOP_RATIO, bandHeight: BAND_HEIGHT_PX[opts.rarity] });

  // 上の行: 使った人（その人の色）・レア度・属性
  const tag = el('span', 'cutin-rarity');
  tag.append(el('span', 'cutin-player', PLAYER_LABEL[opts.player]), ` ・ ${opts.rarity} ・ ${element.label}`);
  // 帯の塗りと文字は別の層にする。重ね順（下から）: 暗転・縁・後ろの効果・帯の塗り・前の効果・粒・文字・閃光
  // 文字を、風や雷などの効果より手前に置いて、効果が文字に重ならないようにする
  const text = el('div', 'cutin-text');
  text.append(tag, el('strong', 'cutin-name', opts.name), el('small', 'cutin-reading', `《${opts.reading}》`));

  const particles: HTMLElement[] = [];
  for (let i = 0; i < timing.particles; i++) {
    const p = el('span', 'cutin-p');
    const angle = Math.random() * Math.PI * 2;
    const dist = 25 + Math.random() * 55; // 画面の幅・高さに対する割合（vmin）
    p.style.setProperty('--dx', `${Math.cos(angle) * dist}vmin`);
    p.style.setProperty('--dy', `${Math.sin(angle) * dist * 0.7}vmin`);
    p.style.setProperty('--s', String(0.5 + Math.random() * 1.2));
    particles.push(p);
  }

  root.append(
    el('div', 'cutin-dim'),
    el('div', 'cutin-edge'),
    ...layers.back,
    el('div', 'cutin-band'),
    ...layers.front,
    ...particles,
    text,
    el('div', 'cutin-flash'),
  );

  container.appendChild(root);
  return new Promise((resolve) => {
    window.setTimeout(() => {
      root.remove();
      resolve();
    }, timing.totalMs);
  });
}
