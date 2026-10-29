import type { Rarity } from '../abilities';
import { THUNDER_HITS_MS } from './bolt';
import { buildElementLayers } from './elements';
import { ELEMENT_OF, burstPath, planOnomatopoeia, zigzagBandPath } from './fxplan';
import { createRng } from '../rng';

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

/** 帯のギザギザの、とげの高さ（px）。レア度が高いほど、鋭く大きい */
export const BAND_ZIGZAG_AMP: Readonly<Record<Rarity, number>> = {
  UNCOMMON: 8,
  RARE: 10,
  EPIC: 13,
  LEGENDARY: 16,
};

const SVG_NS = 'http://www.w3.org/2000/svg';

function svgEl<K extends keyof SVGElementTagNameMap>(parent: Element, tag: K, attrs: Record<string, string>): SVGElementTagNameMap[K] {
  const e = document.createElementNS(SVG_NS, tag);
  for (const [k, v] of Object.entries(attrs)) e.setAttribute(k, v);
  parent.appendChild(e);
  return e;
}

/** ギザギザの帯（漫画のコマ割りのような、とげとげの黒縁）。黒縁・色の塗り・内側の細い線の 3 枚を重ねる */
function buildJaggedBand(rarity: Rarity, width: number): SVGSVGElement {
  const h = BAND_HEIGHT_PX[rarity];
  const step = Math.min(34, Math.max(18, width / 22));
  const amp = BAND_ZIGZAG_AMP[rarity];
  const svg = document.createElementNS(SVG_NS, 'svg');
  svg.setAttribute('class', 'cutin-band-art');
  svg.setAttribute('viewBox', `0 0 ${width} ${h}`);
  svg.setAttribute('preserveAspectRatio', 'none');
  const grad = svgEl(svg, 'linearGradient', { id: 'band-grad', x1: '0', x2: '1', y1: '0', y2: '0' });
  const stops: [string, number][] = [['0', 70], ['0.5', 34], ['1', 70]];
  for (const [offset, mix] of stops) {
    const stop = svgEl(grad, 'stop', { offset });
    stop.style.stopColor = `color-mix(in srgb, var(--rc) ${mix}%, #03040c)`;
  }
  const outer = zigzagBandPath(width, h, step, amp, 7);
  svgEl(svg, 'path', { class: 'band-edge', d: outer });
  svgEl(svg, 'path', { class: 'band-fill', d: outer });
  svgEl(svg, 'path', { class: 'band-line', d: zigzagBandPath(width, h, step, amp * 0.8, 16) });
  return svg;
}

/** 擬音（ドン!! など）。とげとげの爆発の中に、縁取りした文字を入れる */
function buildOnomatopoeia(rarity: Rarity, timing: CutInTiming, w: number, h: number): HTMLElement[] {
  const rng = createRng(Math.floor(Math.random() * 0xffffffff));
  const plan = planOnomatopoeia(
    rng,
    { width: w, height: h, bandTop: h * BAND_TOP_RATIO, bandHeight: BAND_HEIGHT_PX[rarity] },
    rarity,
    timing.impactMs,
    THUNDER_HITS_MS,
  );
  return plan.map((s) => {
    const box = el('div', 'cutin-sfx');
    box.style.setProperty('--x', `${s.x.toFixed(1)}px`);
    box.style.setProperty('--y', `${s.y.toFixed(1)}px`);
    box.style.setProperty('--rot', `${s.rotDeg.toFixed(1)}deg`);
    box.style.setProperty('--size', `${s.size.toFixed(1)}px`);
    box.style.setProperty('--delay', `${Math.round(s.delayMs)}ms`);
    box.style.setProperty('--d', `${Math.round(s.durMs)}ms`);
    const svg = document.createElementNS(SVG_NS, 'svg');
    svg.setAttribute('class', 'cutin-burst');
    svg.setAttribute('viewBox', '-100 -100 200 200');
    svgEl(svg, 'path', { d: burstPath(rng, 98, 62, 13) });
    box.append(svg, el('span', 'cutin-sfx-text', s.text));
    return box;
  });
}

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

  // 上の行: 使った人（その人の色）とレア度。属性の名前は書かない（演出の見た目で伝わるため）
  const tag = el('span', 'cutin-rarity');
  tag.append(el('span', 'cutin-player', PLAYER_LABEL[opts.player]), ` ・ ${opts.rarity}`);
  // 帯の塗りと文字は別の層にする。重ね順（下から）:
  //   暗転・網点・縁・集中線・後ろの効果・ギザギザの帯・前の効果・粒・擬音・文字・閃光
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

  // 集中線: 名前が決まる瞬間に走る。雷は、最後の特大の 1 発でも走る
  const speeds = [el('div', 'cutin-speed')];
  speeds[0]?.style.setProperty('--delay', `${Math.max(0, timing.impactMs - 100)}ms`);
  if (opts.rarity === 'LEGENDARY') {
    const big = el('div', 'cutin-speed');
    big.style.setProperty('--delay', `${THUNDER_HITS_MS[THUNDER_HITS_MS.length - 1] ?? 0}ms`);
    speeds.push(big);
  }

  const band = el('div', 'cutin-band');
  band.appendChild(buildJaggedBand(opts.rarity, w));

  root.append(
    el('div', 'cutin-dim'),
    el('div', 'cutin-halftone'),
    el('div', 'cutin-edge'),
    ...speeds,
    ...layers.back,
    band,
    ...layers.front,
    ...particles,
    ...buildOnomatopoeia(opts.rarity, timing, w, h),
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
