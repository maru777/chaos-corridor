import { playLoseSfx, playWinSfx } from '../view/sfx';

/**
 * 勝負がついたときの画面。勝ちは、金色の閃光と紙吹雪で「VICTORY!」。負けは、赤い閃光、ひび割れ、揺れで「DEFEAT…」。
 * どちらも、獲得した Gold が、数えながら増える。ここは、見せるだけ（Gold の計算は shop.ts）。
 */

export interface ResultView {
  readonly won: boolean;
  /** 今回の獲得 Gold と、受け取ったあとの所持 Gold */
  readonly gained: number;
  readonly total: number;
  /** 相手の呼び名（例: CPU ★★★☆☆ 策士） */
  readonly foe: string;
  readonly onAgain: () => void;
  readonly onMenu: () => void;
}

function el<K extends keyof HTMLElementTagNameMap>(tag: K, cls: string, text?: string): HTMLElementTagNameMap[K] {
  const e = document.createElement(tag);
  e.className = cls;
  if (text !== undefined) e.textContent = text;
  return e;
}

const fmt = (n: number) => n.toLocaleString('ja-JP');

/** 数を、0 から目標まで、数えながら増やす */
function countUp(target: HTMLElement, to: number, ms: number, prefix: string): void {
  const reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  if (reduce || to === 0) {
    target.textContent = `${prefix}${fmt(to)} G`;
    return;
  }
  const t0 = performance.now();
  const step = (now: number) => {
    const k = Math.min(1, (now - t0) / ms);
    const eased = 1 - Math.pow(1 - k, 3);
    target.textContent = `${prefix}${fmt(Math.round(to * eased))} G`;
    if (k < 1 && target.isConnected) requestAnimationFrame(step);
  };
  requestAnimationFrame(step);
}

/** ひび割れ（ぎざぎざの線）。負けの画面に走る */
function cracks(): SVGSVGElement {
  const ns = 'http://www.w3.org/2000/svg';
  const svg = document.createElementNS(ns, 'svg');
  svg.setAttribute('class', 'res-cracks');
  svg.setAttribute('viewBox', '0 0 100 100');
  svg.setAttribute('preserveAspectRatio', 'none');
  const lines = [
    '50,38 44,30 47,22 40,12 43,0',
    '50,38 58,31 55,23 64,15 62,0',
    '50,38 40,44 30,40 22,48 8,44 0,50',
    '50,38 60,45 70,41 80,50 100,46',
    '50,38 47,52 52,64 46,76 50,100',
    '47,52 36,58 28,70 18,74 10,100',
    '52,64 64,70 72,82 84,86 90,100',
  ];
  lines.forEach((pts, i) => {
    const p = document.createElementNS(ns, 'polyline');
    p.setAttribute('points', pts);
    p.setAttribute('class', 'res-crack');
    p.style.setProperty('--d', `${i * 60}ms`);
    svg.appendChild(p);
  });
  return svg;
}

export function showResult(v: ResultView): () => void {
  const root = document.getElementById('result');
  if (root === null) return () => undefined;
  root.className = `overlay ${v.won ? 'win' : 'lose'}`;
  root.hidden = false;
  const bg = el('div', 'res-bg');
  bg.append(el('i', 'res-slash a'), el('i', 'res-slash b'), el('i', 'res-dots'), el('i', 'res-rays'));
  const flash = el('i', 'res-flash');
  const word = el('div', 'res-word');
  const big = el('b', 'res-big', v.won ? 'VICTORY!' : 'DEFEAT…');
  const sub = el('b', 'res-sub', v.won ? '勝利！' : '敗北…');
  word.append(big, sub);
  const vs = el('div', 'res-vs', `${v.won ? 'vs' : 'vs'} ${v.foe}`);
  const gold = el('div', 'res-gold');
  const gain = el('b', 'res-gain', '+0 G');
  const total = el('small', 'res-total', `所持 ${fmt(v.total - v.gained)} G`);
  gold.append(gain, total);
  const buttons = el('div', 'res-buttons');
  const again = el('button', 'res-btn primary', 'もう一度');
  const menu = el('button', 'res-btn', 'メニュー');
  buttons.append(again, menu);
  const fx = el('div', 'res-fx');
  if (v.won) {
    for (let i = 0; i < 70; i++) {
      const c = el('i', 'res-confetti');
      c.style.setProperty('--x', `${Math.random() * 100}%`);
      c.style.setProperty('--d', `${Math.random() * 1200}ms`);
      c.style.setProperty('--s', `${2600 + Math.random() * 1800}ms`);
      c.style.setProperty('--r', `${Math.round(Math.random() * 900)}deg`);
      fx.appendChild(c);
    }
    for (let i = 0; i < 3; i++) {
      const ring = el('i', 'res-ring');
      ring.style.setProperty('--d', `${i * 160}ms`);
      fx.appendChild(ring);
    }
  } else {
    fx.appendChild(cracks());
    for (let i = 0; i < 26; i++) {
      const s = el('i', 'res-shard');
      s.style.setProperty('--x', `${Math.random() * 100}%`);
      s.style.setProperty('--d', `${200 + Math.random() * 900}ms`);
      s.style.setProperty('--s', `${1400 + Math.random() * 1400}ms`);
      s.style.setProperty('--w', `${10 + Math.random() * 22}px`);
      fx.appendChild(s);
    }
  }
  root.replaceChildren(bg, fx, flash, word, vs, gold, buttons);
  if (v.won) playWinSfx();
  else playLoseSfx();
  window.setTimeout(() => countUp(gain, v.gained, 1100, '+'), 1100);
  window.setTimeout(() => {
    total.textContent = `所持 ${fmt(v.total)} G`;
  }, 2300);
  const hide = () => {
    root.hidden = true;
    root.replaceChildren();
  };
  again.addEventListener('click', () => {
    hide();
    v.onAgain();
  });
  menu.addEventListener('click', () => {
    hide();
    v.onMenu();
  });
  return hide;
}
