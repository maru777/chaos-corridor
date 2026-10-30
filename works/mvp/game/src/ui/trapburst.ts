import type { TrapKind } from '../types';

/**
 * 「トラップ発動！」の演出。ペルソナのような、黒・赤・白の斜めの帯が、画面を横切る。
 *   白いフラッシュ → 赤い帯と黒い帯が左から滑り込む → 大きな斜体の文字が「ドン」と決まる → 右へ抜ける
 * 罠を踏んだマスには、赤い輪を出して、どこで起きたかを示す。
 */

/** 演出の長さ（ミリ秒）。CSS の animation と同じにする */
export const TRAP_BURST_MS = 1500;

const KIND_CHAR: Readonly<Record<TrapKind, string>> = { stun: '休', back: '戻', shove: '飛', confiscate: '奪', seal: '封' };

/** 画面の幅の中で、中心の x が収まる範囲に寄せる */
export function clampBurstX(x: number, width: number): number {
  const margin = Math.min(width * 0.36, 160);
  return Math.min(width - margin, Math.max(margin, x));
}

function part(tag: 'div' | 'b' | 'small' | 'span' | 'i', cls: string, text?: string): HTMLElement {
  const e = document.createElement(tag);
  e.className = cls;
  if (text !== undefined) e.textContent = text;
  return e;
}

export function showTrapBurst(root: HTMLElement, x: number, y: number, kind: TrapKind, detail: string): void {
  const el = part('div', `trap-burst ${kind}`);
  const ring = part('i', 'tb-ring');
  ring.style.left = `${x}px`;
  ring.style.top = `${y}px`;
  const stage = part('div', 'tb-stage');
  const red = part('div', 'tb-red');
  const black = part('div', 'tb-black');
  const mark = part('span', 'tb-mark', KIND_CHAR[kind]);
  const en = part('small', 'tb-en', 'TRAP ACTIVATED');
  const title = part('b', 'tb-title', 'トラップ発動！');
  const sub = part('small', 'tb-sub', detail);
  stage.append(red, black, mark, en, title, sub);
  el.append(part('i', 'tb-flash'), ring, stage);
  root.appendChild(el);
  window.setTimeout(() => el.remove(), TRAP_BURST_MS);
}
