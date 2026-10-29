import { burstPath } from './fxplan';
import { createRng } from '../rng';

/**
 * ふだんの操作に出る、漫画の擬音（壁を置く =「ドン!」、コマが動く =「タッ!」、勝負がつく =「ドォォォン!!」）。
 * カットインの擬音と同じ、とげとげの爆発の中に、縁取りした文字を入れる。操作はじゃましない（すぐ消える）。
 */

export type PopKind = 'wall' | 'move' | 'win';

export const POP_TEXT: Readonly<Record<PopKind, string>> = {
  wall: 'ドン!',
  move: 'タッ!',
  win: 'ドォォォン!!',
};

const POP_SIZE: Readonly<Record<PopKind, number>> = { wall: 40, move: 30, win: 96 };
const POP_DUR_MS: Readonly<Record<PopKind, number>> = { wall: 650, move: 520, win: 1700 };
/** 爆発の大きさは、文字の大きさのこの倍（CSS の `.cutin-sfx` と同じ） */
const BURST_RATIO = 3.4;

export interface PopLayout {
  readonly text: string;
  readonly x: number;
  readonly y: number;
  readonly size: number;
  readonly rotDeg: number;
  readonly durMs: number;
}

/**
 * 擬音の位置と大きさ。画面からはみ出さないようにそろえる。
 * 壁・コマは、その場所の少し上に出す（本物が隠れないように）。勝負がついたときは、画面の上寄りの中央。
 */
export function popLayout(kind: PopKind, x: number, y: number, width: number, height: number, rng: () => number): PopLayout {
  const size = Math.max(22, POP_SIZE[kind] * Math.min(1, width / 720));
  const half = (size * BURST_RATIO) / 2;
  const cx = kind === 'win' ? width / 2 : x;
  const cy = kind === 'win' ? height * 0.3 : y - size * 0.9;
  return {
    text: POP_TEXT[kind],
    x: Math.min(width - half, Math.max(half, cx)),
    y: Math.min(height - half, Math.max(half, cy)),
    size,
    rotDeg: (rng() - 0.5) * 20,
    durMs: POP_DUR_MS[kind],
  };
}

const SVG_NS = 'http://www.w3.org/2000/svg';

/** 擬音を出す。color は、爆発の色（使った人の色など） */
export function showPop(container: HTMLElement, kind: PopKind, x: number, y: number, color: string): void {
  const rng = createRng(Math.floor(Math.random() * 0xffffffff));
  const l = popLayout(kind, x, y, window.innerWidth, window.innerHeight, rng);
  const box = document.createElement('div');
  box.className = 'cutin-sfx pop';
  box.style.setProperty('--x', `${l.x.toFixed(1)}px`);
  box.style.setProperty('--y', `${l.y.toFixed(1)}px`);
  box.style.setProperty('--rot', `${l.rotDeg.toFixed(1)}deg`);
  box.style.setProperty('--size', `${l.size.toFixed(1)}px`);
  box.style.setProperty('--delay', '0ms');
  box.style.setProperty('--d', `${l.durMs}ms`);
  box.style.setProperty('--rc', color);
  const svg = document.createElementNS(SVG_NS, 'svg');
  svg.setAttribute('class', 'cutin-burst');
  svg.setAttribute('viewBox', '-100 -100 200 200');
  const path = document.createElementNS(SVG_NS, 'path');
  path.setAttribute('d', burstPath(rng, 98, 62, 13));
  svg.appendChild(path);
  const text = document.createElement('span');
  text.className = 'cutin-sfx-text';
  text.textContent = l.text;
  box.append(svg, text);
  container.appendChild(box);
  window.setTimeout(() => box.remove(), l.durMs + 50);
}
