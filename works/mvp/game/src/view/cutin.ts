import type { Rarity } from '../abilities';
import { createRng } from '../rng';
import { planBolts } from './bolt';

/**
 * 能力を使ったときのカットイン（画面いっぱいの文字の演出）。HTML と CSS で作る。
 * レア度が高いほど、長く・大きく・派手になる。名前が読めるよう、見せ場のあとも 1.2 秒以上は画面に残す。
 * 見た目は index.html の `.cutin` の CSS にある。ここは要素を作って、終わったら消すだけ。
 */

export interface CutInTiming {
  /** 全体の長さ（ミリ秒） */
  readonly totalMs: number;
  /** 見せ場（名前が決まる・光る瞬間）までの時間 */
  readonly impactMs: number;
  /** 飛び散る粒の数 */
  readonly particles: number;
}

export const CUTIN_TIMING: Readonly<Record<Rarity, CutInTiming>> = {
  UNCOMMON: { totalMs: 1800, impactMs: 400, particles: 0 },
  RARE: { totalMs: 2400, impactMs: 600, particles: 0 },
  EPIC: { totalMs: 3200, impactMs: 850, particles: 36 },
  LEGENDARY: { totalMs: 4600, impactMs: 1500, particles: 80 },
};

/** 帯の高さ（px）。CSS の変数にも渡し、稲妻の位置の計算にも使う */
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
  /** 使った人（色が変わる） */
  readonly player: 0 | 1;
}

const SVG_NS = 'http://www.w3.org/2000/svg';

function el<K extends keyof HTMLElementTagNameMap>(tag: K, className: string, text?: string): HTMLElementTagNameMap[K] {
  const e = document.createElement(tag);
  e.className = className;
  if (text !== undefined) e.textContent = text;
  return e;
}

/** 電気（稲妻）。太い光の線と、細い白い芯の 2 本を重ねる */
function buildBolts(rarity: Rarity, timing: CutInTiming): SVGSVGElement {
  const w = window.innerWidth;
  const h = window.innerHeight;
  const svg = document.createElementNS(SVG_NS, 'svg');
  svg.setAttribute('class', 'cutin-bolts');
  svg.setAttribute('viewBox', `0 0 ${w} ${h}`);
  const specs = planBolts(
    rarity,
    createRng(Math.floor(Math.random() * 0xffffffff)),
    { width: w, height: h, bandTop: h * BAND_TOP_RATIO, bandHeight: BAND_HEIGHT_PX[rarity] },
    timing.totalMs,
    timing.impactMs,
  );
  for (const s of specs) {
    const g = document.createElementNS(SVG_NS, 'g');
    g.setAttribute('class', 'bolt');
    g.style.setProperty('--bd', `${Math.round(s.durMs)}ms`);
    g.style.setProperty('--bdelay', `${Math.round(s.delayMs)}ms`);
    for (const kind of ['glow', 'core'] as const) {
      const path = document.createElementNS(SVG_NS, 'path');
      path.setAttribute('class', `bolt-${kind}`);
      path.setAttribute('d', s.d);
      path.setAttribute('stroke-width', String(kind === 'glow' ? s.width * 3 : s.width));
      g.appendChild(path);
    }
    svg.appendChild(g);
  }
  return svg;
}

/** カットインを出し、終わったら消して、約束（Promise）を果たす */
export function playCutIn(container: HTMLElement, opts: CutInOptions): Promise<void> {
  const timing = CUTIN_TIMING[opts.rarity];
  const root = el('div', `cutin ${opts.rarity.toLowerCase()}`);
  root.dataset['player'] = String(opts.player);
  root.style.setProperty('--dur', `${timing.totalMs}ms`);
  root.style.setProperty('--impact', `${timing.impactMs}ms`);
  root.style.setProperty('--band-h', `${BAND_HEIGHT_PX[opts.rarity]}px`);

  const band = el('div', 'cutin-band');
  band.append(el('span', 'cutin-rarity', opts.rarity), el('strong', 'cutin-name', opts.name), el('small', 'cutin-reading', `《${opts.reading}》`));
  root.append(el('div', 'cutin-dim'), el('div', 'cutin-edge'), band, buildBolts(opts.rarity, timing), el('div', 'cutin-flash'));

  for (let i = 0; i < timing.particles; i++) {
    const p = el('span', 'cutin-p');
    const angle = Math.random() * Math.PI * 2;
    const dist = 25 + Math.random() * 55; // 画面の幅・高さに対する割合（vmin）
    p.style.setProperty('--dx', `${Math.cos(angle) * dist}vmin`);
    p.style.setProperty('--dy', `${Math.sin(angle) * dist * 0.7}vmin`);
    p.style.setProperty('--s', String(0.5 + Math.random() * 1.2));
    root.appendChild(p);
  }

  container.appendChild(root);
  return new Promise((resolve) => {
    window.setTimeout(() => {
      root.remove();
      resolve();
    }, timing.totalMs);
  });
}
