import { abilityDef } from '../abilities';
import type { AbilityId } from '../types';
import { fillEffect } from './effecttext';

/**
 * 技の説明のふきだし。カードにマウスを乗せる（またはフォーカス・指で触れる）と、そのカードの横に出て、外すと消える。
 * 手札・上のプレイヤーカードの使った技・技を引いたあとに上に置いたカードで、同じように使う。
 */

let tipEl: HTMLElement | null = null;

function tip(): HTMLElement {
  if (tipEl === null) {
    tipEl = document.createElement('div');
    tipEl.id = 'tip';
    tipEl.hidden = true;
    document.body.appendChild(tipEl);
  }
  return tipEl;
}

export function hideTip(): void {
  tip().hidden = true;
}

/** target の近く（下に余裕がなければ上）に、技 id の説明を出す */
export function showTip(target: HTMLElement, id: AbilityId): void {
  const def = abilityDef(id);
  const box = tip();
  box.replaceChildren();
  const head = document.createElement('b');
  head.className = `tip-head ${def.rarity.toLowerCase()}`;
  head.textContent = `${def.name}  ${def.reading}`;
  const body = document.createElement('span');
  body.className = 'tip-body';
  fillEffect(body, def.text);
  box.append(head, body);
  box.hidden = false;
  const r = target.getBoundingClientRect();
  const w = box.offsetWidth;
  const h = box.offsetHeight;
  const x = Math.min(window.innerWidth - w - 8, Math.max(8, r.left + r.width / 2 - w / 2));
  const below = r.bottom + 8 + h <= window.innerHeight;
  const y = below ? r.bottom + 8 : Math.max(8, r.top - h - 8);
  box.style.left = `${x}px`;
  box.style.top = `${y}px`;
}

/** target に、触れたら説明が出て、外れたら消えるようにする */
export function attachTip(target: HTMLElement, id: AbilityId): void {
  target.addEventListener('mouseenter', () => showTip(target, id));
  target.addEventListener('mouseleave', hideTip);
  target.addEventListener('focus', () => showTip(target, id));
  target.addEventListener('blur', hideTip);
  target.addEventListener('touchstart', () => showTip(target, id), { passive: true });
  target.addEventListener('touchend', () => window.setTimeout(hideTip, 1600), { passive: true });
}
