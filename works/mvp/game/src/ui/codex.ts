import { ABILITIES, RARITIES, RARITY_WEIGHT } from '../abilities';
import type { Rarity } from '../abilities';
import { abilityIconSvg } from './icons';

/**
 * 技一覧（図鑑）。13 個の技を、レア度ごとに、アイコン・名前・効果・出る確率つきで並べる。
 * 確率は、ガチャの重み（abilities.ts）から計算する。まずレア度が決まり、その中から、同じ確率で 1 つ選ばれる。
 */

export interface CodexAbility {
  readonly id: string;
  readonly name: string;
  readonly reading: string;
  readonly text: string;
  readonly rarity: Rarity;
  /** この技 1 つが出る確率（%、小数 1 桁） */
  readonly chance: number;
}

export interface CodexGroup {
  readonly rarity: Rarity;
  /** そのレア度が出る確率（%、小数 1 桁） */
  readonly rarityChance: number;
  readonly abilities: readonly CodexAbility[];
}

const round1 = (n: number) => Math.round(n * 10) / 10;

export function codexGroups(): CodexGroup[] {
  // 技がないレア度は、ガチャで飛ばされるので、確率の計算にも入れない
  const present = RARITIES.filter((r) => ABILITIES.some((a) => a.rarity === r));
  const total = present.reduce((sum, r) => sum + RARITY_WEIGHT[r], 0);
  return present.map((rarity) => {
    const list = ABILITIES.filter((a) => a.rarity === rarity);
    const rarityPercent = (RARITY_WEIGHT[rarity] / total) * 100;
    return {
      rarity,
      rarityChance: round1(rarityPercent),
      abilities: list.map((a) => ({
        id: a.id,
        name: a.name,
        reading: a.reading,
        text: a.text,
        rarity,
        chance: round1(rarityPercent / list.length),
      })),
    };
  });
}

function el<K extends keyof HTMLElementTagNameMap>(tag: K, className: string, text?: string): HTMLElementTagNameMap[K] {
  const e = document.createElement(tag);
  e.className = className;
  if (text !== undefined) e.textContent = text;
  return e;
}

/** 技一覧を、container の中に作る（作り直すときは、前の中身を消す） */
export function renderCodex(container: HTMLElement): void {
  container.replaceChildren();
  for (const group of codexGroups()) {
    const section = el('section', `codex-group ${group.rarity.toLowerCase()}`);
    const head = el('h3', 'codex-head');
    head.append(el('span', 'codex-rarity', group.rarity), el('span', 'codex-rarity-chance', `出る確率 ${group.rarityChance}%`));
    const grid = el('div', 'codex-grid');
    for (const a of group.abilities) {
      const card = el('article', `codex-card ${a.rarity.toLowerCase()}`);
      const plate = el('span', 'codex-plate');
      plate.innerHTML = abilityIconSvg(a.id as Parameters<typeof abilityIconSvg>[0]); // アイコンは、コードで作った SVG（外部の入力ではない）
      const body = el('div', 'codex-body');
      body.append(el('strong', 'codex-name', a.name), el('small', 'codex-reading', a.reading), el('p', 'codex-text', a.text), el('span', 'codex-chance', `この技 ${a.chance}%`));
      card.append(plate, body);
      grid.appendChild(card);
    }
    section.append(head, grid);
    container.appendChild(section);
  }
}
