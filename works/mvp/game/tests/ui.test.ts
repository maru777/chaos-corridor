import { describe, expect, it } from 'vitest';
import { ABILITIES, RARITIES, RARITY_WEIGHT, applyAction, initialState, newGame } from '../src';
import type { GameState } from '../src';
import { codexGroups } from '../src/ui/codex';
import { handCount, visibleCards } from '../src/ui/hand';
import { menuItems, nextPhase } from '../src/ui/opening';
import type { OpeningEvent, OpeningPhase } from '../src/ui/opening';
import { RULES } from '../src/ui/rules';

const base: GameState = initialState(9, 10, [['diagonal', 'leap'], ['jam', 'meteor']]);

describe('手札の見え方（相手に見せない）', () => {
  it('ふだんは、どちらの手札も見えない（枚数だけ）', () => {
    expect(visibleCards(base, 0, false)).toBeNull();
    expect(visibleCards(base, 1, false)).toBeNull();
    expect(handCount(base, 0)).toBe(2);
    expect(handCount(base, 1)).toBe(2);
  });

  it('手番の人が「見る」を押すと、その人の手札だけが見える。相手の手札は、見えないまま', () => {
    expect(visibleCards(base, 0, true)).toEqual(['diagonal', 'leap']);
    expect(visibleCards(base, 1, true)).toBeNull();
    const second = { ...base, turn: 1 as const };
    expect(visibleCards(second, 1, true)).toEqual(['jam', 'meteor']);
    expect(visibleCards(second, 0, true)).toBeNull();
  });

  it('手番が替わっても、相手の手札は見えない（見る設定が残っていても）', () => {
    const r = applyAction(base, { type: 'move', to: { x: 4, y: 7 } });
    if (!r.ok) throw new Error(r.reason);
    expect(r.state.turn).toBe(1);
    expect(visibleCards(r.state, 0, true)).toBeNull(); // 前の人の手札は、もう見えない
  });

  it('勝負がついたら、両方の手札が見える（種明かし）', () => {
    const over: GameState = { ...base, winner: 0 };
    expect(visibleCards(over, 0, false)).toEqual(['diagonal', 'leap']);
    expect(visibleCards(over, 1, false)).toEqual(['jam', 'meteor']);
  });

  it('デバッグのときだけ、すべて見える', () => {
    expect(visibleCards(base, 1, false, true)).toEqual(['jam', 'meteor']);
  });

  it('手札を使うと、枚数が減る（相手にも分かる）', () => {
    const r = applyAction(base, { type: 'ability', id: 'jam' });
    expect(r.ok).toBe(false); // 持っていない技
    const d = applyAction(base, { type: 'ability', id: 'diagonal', to: { x: 3, y: 7 } });
    if (!d.ok) throw new Error(d.reason);
    expect(handCount(d.state, 0)).toBe(1);
  });
});

describe('技一覧', () => {
  it('全部の技が、レア度ごとに並ぶ（13 個）', () => {
    const groups = codexGroups();
    expect(groups.map((g) => g.rarity)).toEqual([...RARITIES]);
    expect(groups.flatMap((g) => g.abilities)).toHaveLength(ABILITIES.length);
  });

  it('レア度の確率の合計は 100%。高いレア度ほど低い', () => {
    const groups = codexGroups();
    const sum = groups.reduce((s, g) => s + g.rarityChance, 0);
    expect(sum).toBeCloseTo(100, 0);
    const chances = groups.map((g) => g.rarityChance);
    expect(chances).toEqual([...chances].sort((a, b) => b - a));
    expect(groups[0]?.rarityChance).toBeCloseTo((RARITY_WEIGHT.UNCOMMON / 100) * 100, 1);
  });

  it('1 つの技の確率は、そのレア度の確率を、技の数で割ったもの', () => {
    for (const g of codexGroups()) {
      for (const a of g.abilities) expect(a.chance).toBeCloseTo(g.rarityChance / g.abilities.length, 0);
    }
  });

  it('どの技にも、名前・読み・説明がある', () => {
    for (const g of codexGroups()) {
      for (const a of g.abilities) {
        expect(a.name.length).toBeGreaterThan(0);
        expect(a.reading.length).toBeGreaterThan(0);
        expect(a.text.length).toBeGreaterThan(0);
      }
    }
  });
});

describe('オープニングの流れ', () => {
  const run = (start: OpeningPhase, events: OpeningEvent[]): OpeningPhase => events.reduce(nextPhase, start);

  it('splash →（押す）→ slam →（終わる）→ menu →（はじめる）→ closed', () => {
    expect(run('splash', ['tap', 'slamDone', 'start'])).toBe('closed');
  });

  it('演出の最中に押すと、飛ばして menu へ', () => {
    expect(run('splash', ['tap', 'tap'])).toBe('menu');
  });

  it('始める前は、ロゴの段階で「はじめる」を押しても、進まない', () => {
    expect(run('splash', ['start'])).toBe('splash');
    expect(run('slam', ['start'])).toBe('slam');
  });

  it('対局中に、メニューを開いて、つづけられる', () => {
    expect(run('closed', ['openMenu'])).toBe('menu');
    expect(run('closed', ['openMenu', 'resume'])).toBe('closed');
    expect(run('closed', ['tap', 'start'])).toBe('closed');
  });

  it('メニューのボタンは、始める前と、始めたあとで変わる', () => {
    expect(menuItems(false).map((m) => m.id)).toEqual(['cpu', 'shop', 'log', 'codex', 'rules']);
    expect(menuItems(true).map((m) => m.id)).toEqual(['resume', 'cpu', 'shop', 'log', 'codex', 'rules', 'restart']);
    expect(menuItems(false)[0]?.primary).toBe(true);
  });
});

describe('あそびかた', () => {
  it('節があり、どの節にも見出しと説明がある。手札を見せない説明も入っている', () => {
    expect(RULES.length).toBeGreaterThanOrEqual(4);
    for (const s of RULES) {
      expect(s.title.length).toBeGreaterThan(0);
      expect(s.lines.length).toBeGreaterThan(0);
    }
    expect(RULES.some((s) => s.title.includes('Skill'))).toBe(true);
  });
});

describe('ガチャで、手札は最初から 2 枚', () => {
  it('どの種でも、両者に 2 枚ずつ（相手の枚数が表示できる）', () => {
    for (let seed = 1; seed <= 50; seed++) {
      const s = newGame(seed);
      expect(handCount(s, 0)).toBe(2);
      expect(handCount(s, 1)).toBe(2);
    }
  });
});
