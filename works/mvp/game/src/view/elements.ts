import type { Rarity } from '../abilities';
import { createRng } from '../rng';
import { planThunder } from './bolt';
import type { BoltLayout, BoltSpec } from './bolt';
import { magicCircle, planDark, planWater, planWind, wavePath } from './fxplan';
import type { FxTiming, Particle } from './fxplan';

/**
 * 属性ごとの演出の要素（風・水・闇・雷）を作る。形とタイミングは bolt.ts / fxplan.ts が決め、
 * ここは DOM と SVG の要素にするだけ。動きは index.html の CSS（`.fx-*`）にある。
 *
 * back: 帯の後ろに置くもの（魔法陣・霧・蔓）。front: 帯の前に置くもの。
 * どちらも `.fx-layer` に包み、演出の始めと終わりでふわっと現れて消える。
 */

const SVG_NS = 'http://www.w3.org/2000/svg';

export interface ElementLayers {
  readonly back: readonly Element[];
  readonly front: readonly Element[];
}

function svgRoot(layout: BoltLayout): SVGSVGElement {
  const svg = document.createElementNS(SVG_NS, 'svg');
  svg.setAttribute('class', 'cutin-fx');
  svg.setAttribute('viewBox', `0 0 ${layout.width} ${layout.height}`);
  return svg;
}

function svgChild<K extends keyof SVGElementTagNameMap>(parent: Element, tag: K, attrs: Record<string, string>): SVGElementTagNameMap[K] {
  const e = document.createElementNS(SVG_NS, tag);
  for (const [k, v] of Object.entries(attrs)) e.setAttribute(k, v);
  parent.appendChild(e);
  return e;
}

function box(className: string, vars: Record<string, string>): HTMLDivElement {
  const d = document.createElement('div');
  d.className = className;
  for (const [k, v] of Object.entries(vars)) d.style.setProperty(k, v);
  return d;
}

function layer(...children: Element[]): HTMLDivElement {
  const d = document.createElement('div');
  d.className = 'fx-layer';
  d.append(...children);
  return d;
}

const ms = (n: number) => `${Math.round(n)}ms`;
const px = (n: number) => `${n.toFixed(1)}px`;

/** 光る線（太い光の線と、細い白い芯の 2 本）。雷に使う */
function boltGroup(svg: SVGSVGElement, spec: BoltSpec, className: string): void {
  const g = svgChild(svg, 'g', { class: className });
  g.style.setProperty('--bd', ms(spec.durMs));
  g.style.setProperty('--bdelay', ms(spec.delayMs));
  for (const kind of ['glow', 'core'] as const) {
    svgChild(g, 'path', { class: `bolt-${kind}`, d: spec.d, 'stroke-width': String(kind === 'glow' ? spec.width * 3 : spec.width) });
  }
}

function particle(className: string, p: Particle): HTMLDivElement {
  return box(className, {
    '--x': px(p.x),
    '--y': px(p.y),
    '--dx': px(p.dx),
    '--dy': px(p.dy),
    '--size': px(p.size),
    '--rot': `${Math.round(p.rot)}deg`,
    '--delay': ms(p.delayMs),
    '--d': ms(p.durMs),
  });
}

/** 流れる線（pathLength を 1 にして、線の一部だけが先へ走っていくように見せる） */
function runningPath(svg: Element, className: string, s: BoltSpec): void {
  const path = svgChild(svg, 'path', { class: className, d: s.d, pathLength: '1', 'stroke-width': String(s.width) });
  path.style.setProperty('--delay', ms(s.delayMs));
  path.style.setProperty('--d', ms(s.durMs));
}

function wind(layout: BoltLayout, rng: () => number): ElementLayers {
  const plan = planWind(rng, layout);
  const svg = svgRoot(layout);
  for (const s of plan.streaks) runningPath(svg, 'fx-streak', s);
  // 風の刃: 三日月形が、画面の外から外へ、高速で横切る
  for (const b of plan.blades) {
    const blade = svgChild(svg, 'path', { class: 'fx-blade', d: b.d });
    blade.style.setProperty('--dx', px(b.dx));
    blade.style.setProperty('--d', ms(b.durMs));
    blade.style.setProperty('--delay', ms(b.delayMs));
  }
  // 葉は、外側が横へ流れ、内側が波打って回る
  const leaves = plan.leaves.map((p) => {
    const outer = particle('fx-leaf', { ...p, dy: 0 });
    const inner = box('fx-leaf-body', { '--amp': px(p.dy) });
    outer.appendChild(inner);
    return outer;
  });
  return { back: [], front: [layer(svg, ...leaves)] };
}

function water(layout: BoltLayout, t: FxTiming, rng: () => number): ElementLayers {
  const plan = planWater(rng, layout, t);
  const svg = svgRoot(layout);
  const wavelength = 160;
  for (const y of [layout.bandTop, layout.bandTop + layout.bandHeight]) {
    const g = svgChild(svg, 'g', { class: 'fx-wave' });
    g.style.setProperty('--wl', px(wavelength));
    svgChild(g, 'path', { d: wavePath(layout.width + wavelength * 2, y, 9, wavelength) });
  }
  const ripples = plan.ripples.map((r) =>
    box('fx-ripple', { '--x': px(r.cx), '--y': px(r.cy), '--size': px(r.maxR * 2), '--delay': ms(r.delayMs), '--d': ms(r.durMs) }),
  );
  return { back: [], front: [layer(svg, ...ripples, ...plan.bubbles.map((p) => particle('fx-bubble', p)))] };
}

function dark(layout: BoltLayout, t: FxTiming, rng: () => number): ElementLayers {
  const plan = planDark(rng, layout);
  const cx = layout.width / 2;
  const cy = layout.bandTop + layout.bandHeight / 2;

  // うねる霧: 画面の中心を軸に、ゆっくり回る
  const fogs = plan.fogs.map((f) => {
    const orbit = box('fx-fog-orbit', { '--cx': px(cx), '--cy': px(cy), '--spin': ms(f.spinMs), '--start': `${Math.round(f.startDeg)}deg` });
    orbit.appendChild(box('fx-fog', { '--size': px(f.size), '--orbit': px(f.orbit) }));
    return orbit;
  });

  // 闇の蔓: 画面の下の左右から這い上がる
  const vines = svgRoot(layout);
  for (const s of plan.tendrils) runningPath(vines, 'fx-tendril', s);

  // 魔法陣: 浮かび上がり、逆向きに回る 2 層と、広がる脈動の輪
  const circle = magicCircle(cx, cy, Math.min(layout.width * 0.42, layout.bandHeight * 1.6));
  const magic = svgRoot(layout);
  const pop = svgChild(magic, 'g', { class: 'fx-magic' });
  pop.style.setProperty('--delay', ms(Math.max(0, t.impactMs - 450)));
  pop.style.transformOrigin = `${cx}px ${cy}px`;
  const spinA = svgChild(pop, 'g', { class: 'fx-spin' });
  spinA.style.transformOrigin = `${cx}px ${cy}px`;
  circle.rings.forEach((r) => svgChild(spinA, 'circle', { cx: String(cx), cy: String(cy), r: String(r) }));
  svgChild(spinA, 'path', { d: circle.ticks });
  const spinB = svgChild(pop, 'g', { class: 'fx-spin reverse' });
  spinB.style.transformOrigin = `${cx}px ${cy}px`;
  svgChild(spinB, 'path', { d: circle.star });
  for (let i = 0; i < 2; i++) {
    const pulse = svgChild(magic, 'circle', { class: 'fx-pulse', cx: String(cx), cy: String(cy), r: String(circle.rings[0] ?? 100) });
    pulse.style.transformOrigin = `${cx}px ${cy}px`;
    pulse.style.setProperty('--delay', ms(i * 900));
  }

  const wisps = plan.wisps.map((p) => particle('fx-wisp', p));
  const embers = plan.embers.map((p) => particle('fx-ember', p));
  return { back: [layer(...fogs, vines, magic)], front: [layer(...wisps, ...embers)] };
}

function thunder(layout: BoltLayout, t: FxTiming, rng: () => number): ElementLayers {
  const plan = planThunder(rng, layout, t.totalMs, t.impactMs);
  const svg = svgRoot(layout);
  plan.strikes.forEach((s, i) => {
    const big = i === plan.strikes.length - 1;
    boltGroup(svg, s.main, big ? 'bolt strike big' : 'bolt strike');
    for (const b of s.branches) boltGroup(svg, b, 'bolt strike');
  });
  for (const c of plan.crackles) boltGroup(svg, c, 'bolt');
  const flashes = plan.strikes.map((s, i) =>
    box(i === plan.strikes.length - 1 ? 'fx-strike-flash big' : 'fx-strike-flash', { '--delay': ms(s.flashDelayMs) }),
  );
  return { back: [], front: [layer(svg, ...flashes)] };
}

/** レア度の属性に合わせた演出の要素を作る */
export function buildElementLayers(rarity: Rarity, timing: FxTiming, layout: BoltLayout): ElementLayers {
  const rng = createRng(Math.floor(Math.random() * 0xffffffff));
  switch (rarity) {
    case 'UNCOMMON':
      return wind(layout, rng);
    case 'RARE':
      return water(layout, timing, rng);
    case 'EPIC':
      return dark(layout, timing, rng);
    case 'LEGENDARY':
      return thunder(layout, timing, rng);
  }
}
