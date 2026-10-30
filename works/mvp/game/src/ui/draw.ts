import { abilityDef } from '../abilities';
import type { Rarity } from '../abilities';
import type { AbilityId } from '../types';
import { createRng } from '../rng';
import { playCardRainSfx, playDartSfx, playSfx, playWallSfx } from '../view/sfx';
import { shout } from '../view/voice';
import { drawTiming, planDraw } from './drawplan';
import { abilityIconSvg } from './icons';

/**
 * 技を引く演出。裏向きのカードが降ってきて、ダーツが 1 枚に刺さり、めくれる。レア度が高いほど、ためが長く、派手になる。
 * 結果（どの技か）は、呼ぶ側が先に決めている。ここは、見せるだけ。計画（散らし方・時間）は drawplan.ts。
 */

const sleep = (ms: number) => new Promise<void>((r) => window.setTimeout(r, ms));
const reduced = () => window.matchMedia('(prefers-reduced-motion: reduce)').matches;

function el<K extends keyof HTMLElementTagNameMap>(tag: K, cls: string, text?: string): HTMLElementTagNameMap[K] {
  const e = document.createElement(tag);
  e.className = cls;
  if (text !== undefined) e.textContent = text;
  return e;
}

const DART_SVG =
  '<svg viewBox="0 0 30 120" width="30" height="120" aria-hidden="true"><path d="M15 0 L19 40 L11 40 Z" fill="#d8dde6" stroke="#05030f" stroke-width="3" stroke-linejoin="round"/><rect x="10" y="40" width="10" height="34" rx="3" fill="#d4001a" stroke="#05030f" stroke-width="3"/><path d="M15 70 L2 112 L15 100 L28 112 Z" fill="#fff" stroke="#05030f" stroke-width="3" stroke-linejoin="round"/></svg>';

/** 表のカード（手札のカードと同じ見た目） */
function faceCard(id: AbilityId): HTMLElement {
  const def = abilityDef(id);
  const c = el('div', `acard ${def.rarity.toLowerCase()} draw-face`);
  const rar = el('span', 'acard-rar', def.rarity);
  const plate = el('span', 'acard-plate');
  plate.innerHTML = abilityIconSvg(id); // コードで作った SVG（外部の入力ではない）
  c.append(rar, plate, el('strong', '', def.name), el('small', '', def.reading));
  return c;
}

/** レア度ごとの、めくった瞬間の飾り（火花・衝撃・稲妻・光の柱・紙吹雪） */
function burst(fx: HTMLElement, rarity: Rarity, cx: number, cy: number): void {
  const rng = createRng(rarity.length * 977 + 13);
  const sparks = { UNCOMMON: 18, RARE: 28, EPIC: 42, LEGENDARY: 64 }[rarity];
  fx.style.setProperty('--cx', `${cx}px`);
  fx.style.setProperty('--cy', `${cy}px`);
  // 全部のレア度に: 色つきの閃光、放射状の集中線、大きな擬音（派手に）
  fx.append(el('i', 'dflash'), el('i', 'dburstlines'));
  const word = { UNCOMMON: 'パァッ！', RARE: 'キィン！！', EPIC: 'ドゴォン！！', LEGENDARY: 'ズドォォォン！！！' }[rarity];
  fx.appendChild(el('b', 'donomat', word));
  for (let i = 0; i < sparks; i++) {
    const s = el('i', 'dspark');
    const ang = (i / sparks) * Math.PI * 2 + rng() * 0.3;
    const dist = 90 + rng() * (rarity === 'LEGENDARY' ? 260 : 150);
    s.style.setProperty('--dx', `${Math.cos(ang) * dist}px`);
    s.style.setProperty('--dy', `${Math.sin(ang) * dist}px`);
    s.style.setProperty('--sz', `${6 + rng() * 8}px`);
    fx.appendChild(s);
  }
  if (rarity !== 'UNCOMMON') {
    for (let i = 0; i < (rarity === 'RARE' ? 3 : 4); i++) {
      const ring = el('i', 'dring');
      ring.style.setProperty('--rd', `${i * 120}ms`);
      fx.appendChild(ring);
    }
  }
  if (rarity === 'EPIC' || rarity === 'LEGENDARY') {
    const bolts = el('div', 'dbolts');
    const n = rarity === 'EPIC' ? 3 : 5;
    for (let i = 0; i < n; i++) {
      const b = el('i', 'dbolt');
      b.style.setProperty('--bx', `${10 + (i / n) * 80 + rng() * 8}%`);
      b.style.setProperty('--bd', `${i * 70}ms`);
      bolts.appendChild(b);
    }
    fx.appendChild(bolts);
  }
  if (rarity === 'EPIC' || rarity === 'LEGENDARY') {
    if (rarity === 'LEGENDARY') fx.append(el('i', 'dpillar'), el('i', 'drays'), el('i', 'dwhite'));
    for (let i = 0; i < (rarity === 'EPIC' ? 28 : 70); i++) {
      const c = el('i', 'dconfetti');
      c.style.setProperty('--fx', `${rng() * 100}%`);
      c.style.setProperty('--fd', `${rng() * 900}ms`);
      c.style.setProperty('--fs', `${3000 + rng() * 1500}ms`);
      c.style.setProperty('--fr', `${Math.round(rng() * 720)}deg`);
      fx.appendChild(c);
    }
  }
}

async function drawOne(root: HTMLElement, id: AbilityId, nth: number, total: number, seed: number): Promise<void> {
  const def = abilityDef(id);
  const rarity = def.rarity;
  const t = drawTiming(rarity);
  const k = reduced() ? 0.25 : 1;
  const plan = planDraw(rarity, createRng(seed));
  const field = root.querySelector('.draw-field') as HTMLElement;
  const fx = root.querySelector('.draw-fx') as HTMLElement;
  const title = root.querySelector('.draw-title') as HTMLElement;
  const slab = root.querySelector('.draw-name') as HTMLElement;
  field.classList.remove('punch', 'fade');
  field.replaceChildren();
  fx.replaceChildren();
  slab.replaceChildren();
  slab.classList.remove('show');
  root.dataset['rarity'] = rarity.toLowerCase();
  root.classList.remove('dim', 'shake', 'build');
  title.textContent = `技を引く　${nth} / ${total}`;

  // 1. 裏向きのカードが降ってくる
  const cards: HTMLElement[] = plan.cards.map((c) => {
    const d = el('div', 'dcard');
    d.style.cssText = `left:${c.x}%;top:${c.y}%;--rot:${c.rot}deg;--delay:${c.delay * k}ms;--fall:${c.fall * Math.max(k, 0.4)}ms`;
    d.appendChild(el('span', 'dback'));
    field.appendChild(d);
    return d;
  });
  playCardRainSfx(plan.cards.map((c) => (c.delay + c.fall) * Math.max(k, 0.4)));
  await sleep(t.rainMs * k);

  // 2. 好きなカードをタップする（結果は、どれを選んでも、種で先に決まっている）。ダーツが飛んで、そのカードに刺さる
  const prompt = root.querySelector('.draw-prompt') as HTMLElement;
  prompt.textContent = '好きなカードをタップ！';
  prompt.classList.add('show');
  const picked = await new Promise<number>((resolve) => {
    cards.forEach((c, i) => {
      c.classList.add('pickable');
      c.addEventListener('click', () => resolve(i), { once: true });
    });
  });
  prompt.classList.remove('show');
  for (const c of cards) c.classList.remove('pickable');
  const target = cards[picked] as HTMLElement;
  const fr = root.getBoundingClientRect();
  const tr = target.getBoundingClientRect();
  const cx = tr.left + tr.width / 2 - fr.left;
  const cy = tr.top + tr.height / 2 - fr.top;
  const dart = el('div', 'ddart');
  dart.innerHTML = DART_SVG;
  playDartSfx(t.dartMs * k);
  field.appendChild(dart);
  const startX = cx + (cx < fr.width / 2 ? -1 : 1) * fr.width * 0.28;
  const startY = fr.height + 140;
  if (!reduced()) {
    dart.animate(
      [
        { transform: `translate(${startX - 15}px, ${startY}px) rotate(${cx < startX ? 14 : -14}deg) scale(1.4)` },
        { transform: `translate(${cx - 15}px, ${cy - 6}px) rotate(0deg) scale(1)` },
      ],
      { duration: t.dartMs, easing: 'cubic-bezier(0.5, 0, 0.9, 0.5)', fill: 'forwards' },
    );
  } else {
    dart.style.transform = `translate(${cx - 15}px, ${cy - 6}px)`;
  }
  await sleep(t.dartMs * k);
  playWallSfx(0); // 刺さった音
  target.classList.add('stuck');
  dart.classList.add('stuck');
  for (const c of cards) if (c !== target) c.classList.add('dull');

  // 3. ため（レア度が高いほど長い。暗くなり、カードが震え、光がもれる）
  playSfx(rarity, (t.buildMs * k) / 1000 + 0.05);
  if (t.buildMs > 0) {
    root.classList.add('dim');
    target.classList.add('trembling');
    if (rarity === 'EPIC' || rarity === 'LEGENDARY') root.classList.add('build');
    await sleep(t.buildMs * k);
  }

  // 4. めくる
  shout(def.shout ?? def.name, rarity, 150);
  const reveal = el('div', 'dreveal');
  const inner = el('div', 'dreveal-in');
  inner.append(el('span', 'dback'), faceCard(id));
  reveal.appendChild(inner);
  field.appendChild(reveal);
  const dx = cx - fr.width / 2;
  const dy = cy - fr.height * 0.44;
  target.style.visibility = 'hidden';
  dart.style.visibility = 'hidden';
  root.classList.remove('build');
  burst(fx, rarity, fr.width / 2, fr.height * 0.44);
  root.classList.add('shake');
  field.classList.add('punch');
  if (!reduced()) {
    // 決まったカードは、画面の幅に収まる範囲で、できるだけ大きく見せる
    const base = { UNCOMMON: 2.2, RARE: 2.4, EPIC: 2.6, LEGENDARY: 2.9 }[rarity];
    const scale = Math.min(base, (fr.width * 0.86) / 112);
    reveal.animate(
      [
        { transform: `translate(${dx}px, ${dy}px) scale(1)` },
        { transform: `translate(${dx * 0.3}px, ${dy * 0.3 - 30}px) scale(${scale * 0.8})`, offset: 0.35 },
        { transform: `translate(0, 0) scale(${scale})` },
      ],
      { duration: 520, easing: 'cubic-bezier(0.2, 0.9, 0.3, 1.2)', fill: 'forwards' },
    );
    inner.animate([{ transform: 'rotateY(0deg)' }, { transform: 'rotateY(180deg)' }], {
      duration: rarity === 'LEGENDARY' ? 700 : 480,
      delay: 260,
      easing: 'cubic-bezier(0.3, 0, 0.2, 1)',
      fill: 'forwards',
    });
  } else {
    inner.style.transform = 'rotateY(180deg)';
    reveal.style.transform = 'scale(2)';
  }
  await sleep(700 * Math.max(k, 0.3));
  // 技名の札
  slab.append(el('b', 'dn-rarity', def.rarity), el('b', 'dn-name', def.name), el('b', 'dn-read', def.reading), el('b', 'dn-text', def.text));
  slab.classList.add('show');
  await sleep(Math.max(0, t.revealMs - 700) * k);
  root.classList.remove('shake', 'dim');
  await sleep(t.holdMs * k);
  // 引いたカードは、上に置きっぱなしにする（2 枚目を引くあいだも、残る）
  const parkedLayer = root.querySelector('.draw-parked') as HTMLElement;
  const card = faceCard(id);
  card.classList.add('dparked');
  card.style.left = `${nth === 1 ? 32 : 68}%`;
  parkedLayer.appendChild(card);
  if (!reduced()) {
    const r = card.getBoundingClientRect();
    const mx = fr.left + fr.width / 2 - (r.left + r.width / 2);
    const my = fr.top + fr.height * 0.44 - (r.top + r.height / 2);
    card.animate([{ transform: `translate(${mx}px, ${my}px) scale(3.2)` }, { transform: 'translate(0, 0) scale(1)' }], { duration: 420, easing: 'cubic-bezier(0.2, 0.9, 0.3, 1.1)' });
  }
  reveal.classList.add('out');
  field.classList.add('fade'); // 残ったカードは、薄くして、引いたカードを目立たせる
  slab.classList.remove('show');
  fx.replaceChildren();
  await sleep(280 * Math.max(k, 0.3));
}

/**
 * 手札を引く演出を、1 枚ずつ見せる。beforeStart は、場面が出る直前に呼ばれる（幕を開ける）。
 * 終わると、場面を消す関数を返す（次の場面の幕の裏で呼ぶ）。
 */
export async function playDraws(ids: readonly AbilityId[], seed: number, beforeStart: () => Promise<void>, note?: string): Promise<() => void> {
  const root = document.getElementById('draw');
  if (root === null) return () => undefined;
  const bg = el('div', 'toss-bg');
  bg.append(el('i', 'toss-slash s1'), el('i', 'toss-slash s2'), el('i', 'toss-dots'));
  root.replaceChildren(
    bg,
    el('div', 'draw-title'),
    el('div', 'draw-field'),
    el('div', 'draw-parked'),
    el('div', 'draw-fx'),
    el('div', 'draw-name'),
    el('div', 'draw-prompt'),
    el('div', 'draw-note'),
  );
  root.hidden = false;
  root.classList.remove('enter');
  await beforeStart();
  root.classList.add('enter');
  for (const [i, id] of ids.entries()) await drawOne(root, id, i + 1, ids.length, (seed + i * 7919) >>> 0);
  // 引いた技を、確かめてから、タップで進む
  const prompt = root.querySelector('.draw-prompt') as HTMLElement;
  prompt.textContent = 'タップで進む';
  prompt.classList.add('show');
  await new Promise<void>((resolve) => root.addEventListener('click', () => resolve(), { once: true }));
  prompt.classList.remove('show');
  if (note !== undefined) {
    (root.querySelector('.draw-field') as HTMLElement).replaceChildren();
    (root.querySelector('.draw-title') as HTMLElement).textContent = '';
    const n = root.querySelector('.draw-note') as HTMLElement;
    n.textContent = note;
    n.classList.add('show');
    await sleep(reduced() ? 300 : 1300);
  }
  return () => {
    root.hidden = true;
  };
}
