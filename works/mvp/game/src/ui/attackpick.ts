import { ATTACKS, attackDef } from '../attacks';
import type { AttackId } from '../types';
import { fillEffect } from './effecttext';
import { attackIconSvg } from './icons';

/**
 * 攻撃技を選ぶ場面。配られた 3 つのうち 1 つを選ぶ（お互いに、公開で持つ攻撃技）。
 * カードをタップすると、説明が出る。「これにする」で決まる。
 */

export interface AttackPicked {
  readonly id: AttackId;
  /** 場面を消す（暗転の裏で呼ぶ） */
  readonly hide: () => void;
}

export function pickAttack(offers: readonly AttackId[], beforeStart: () => Promise<void> = () => Promise.resolve()): Promise<AttackPicked> {
  const root = document.createElement('div');
  root.id = 'attackpick';
  root.className = 'overlay';
  const bg = document.createElement('div');
  bg.className = 'toss-bg';
  for (const c of ['toss-slash s1', 'toss-slash s2', 'toss-dots']) {
    const i = document.createElement('i');
    i.className = c;
    bg.appendChild(i);
  }
  const title = document.createElement('p');
  title.className = 'toss-title ap-title';
  title.textContent = '攻撃技を選ぶ（お互いに、公開で持つ）';
  const row = document.createElement('div');
  row.className = 'ap-row';
  const desc = document.createElement('div');
  desc.className = 'ap-desc';
  const ok = document.createElement('button');
  ok.className = 'res-btn primary ap-ok';
  ok.textContent = 'これにする';
  ok.disabled = true;
  root.append(bg, title, row, desc, ok);
  document.body.appendChild(root);

  let chosen: AttackId | null = null;
  const cards = new Map<AttackId, HTMLButtonElement>();
  for (const id of offers) {
    const def = attackDef(id);
    const b = document.createElement('button');
    b.className = 'ap-card';
    const plate = document.createElement('span');
    plate.className = 'ap-plate';
    plate.innerHTML = attackIconSvg(id); // アイコンは、コードで作った SVG（外部の入力ではない）
    const name = document.createElement('strong');
    name.textContent = def.name;
    const reading = document.createElement('small');
    reading.textContent = def.reading;
    b.append(plate, name, reading);
    b.addEventListener('click', () => {
      chosen = id;
      for (const [k, c] of cards) c.setAttribute('aria-pressed', String(k === id));
      fillEffect(desc, def.text);
      ok.disabled = false;
    });
    cards.set(id, b);
    row.appendChild(b);
  }

  return new Promise((resolve) => {
    ok.addEventListener('click', () => {
      if (chosen === null) return;
      resolve({ id: chosen, hide: () => root.remove() });
    });
    void beforeStart();
  });
}

/** 攻撃技の一覧（図鑑に出す用）。定義の順 */
export const ATTACK_LIST = ATTACKS;
