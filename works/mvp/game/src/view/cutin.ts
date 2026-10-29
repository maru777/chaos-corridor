import type { Rarity } from '../abilities';

/**
 * 能力を使ったときのカットイン（画面いっぱいの文字の演出）。HTML と CSS で作る。
 * レア度が高いほど、長く・大きく・派手になる。
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
  UNCOMMON: { totalMs: 1000, impactMs: 350, particles: 0 },
  RARE: { totalMs: 1500, impactMs: 550, particles: 0 },
  EPIC: { totalMs: 2100, impactMs: 800, particles: 36 },
  LEGENDARY: { totalMs: 3200, impactMs: 1500, particles: 80 },
};

export interface CutInOptions {
  readonly name: string;
  readonly reading: string;
  readonly rarity: Rarity;
  /** 使った人（色が変わる） */
  readonly player: 0 | 1;
}

function el<K extends keyof HTMLElementTagNameMap>(tag: K, className: string, text?: string): HTMLElementTagNameMap[K] {
  const e = document.createElement(tag);
  e.className = className;
  if (text !== undefined) e.textContent = text;
  return e;
}

/** カットインを出し、終わったら消して、約束（Promise）を果たす */
export function playCutIn(container: HTMLElement, opts: CutInOptions): Promise<void> {
  const timing = CUTIN_TIMING[opts.rarity];
  const root = el('div', `cutin ${opts.rarity.toLowerCase()}`);
  root.dataset['player'] = String(opts.player);
  root.style.setProperty('--dur', `${timing.totalMs}ms`);
  root.style.setProperty('--impact', `${timing.impactMs}ms`);

  const band = el('div', 'cutin-band');
  band.append(el('span', 'cutin-rarity', opts.rarity), el('strong', 'cutin-name', opts.name), el('small', 'cutin-reading', `《${opts.reading}》`));
  root.append(el('div', 'cutin-dim'), el('div', 'cutin-edge'), band, el('div', 'cutin-flash'));

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
