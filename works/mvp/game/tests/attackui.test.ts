import { describe, expect, it } from 'vitest';
import { ATTACKS, ABILITIES, applyAction, createRng, dealGame, legalActions, newGame } from '../src';
import type { Action, GameState } from '../src';
import { chooseAction, viewFor } from '../src/cpu';
import { ATTACK_ICON_IDS, ICON_IDS, attackIconSvg } from '../src/ui/icons';
import { clampBurstX } from '../src/ui/trapburst';

describe('アイコン', () => {
  it('全部の攻撃技・Skill にアイコンがある', () => {
    expect([...ATTACK_ICON_IDS].sort()).toEqual(ATTACKS.map((a) => a.id).sort());
    expect([...ICON_IDS].sort()).toEqual(ABILITIES.map((a) => a.id).sort());
    for (const a of ATTACKS) expect(attackIconSvg(a.id)).toContain('<svg');
  });
});

describe('トラップ発動の演出', () => {
  it('文字の中心は、画面の左右の内側に寄せられる', () => {
    expect(clampBurstX(0, 375)).toBeGreaterThan(100);
    expect(clampBurstX(999, 375)).toBeLessThan(275);
    expect(clampBurstX(190, 375)).toBe(190);
  });
});

describe('CPU と見えない物', () => {
  it('相手の罠・見えない壁は、CPU の目からは消える。自分のものは残る', () => {
    const s: GameState = {
      ...newGame(3),
      traps: [{ x: 1, y: 1, owner: 0, kind: 'stun' }, { x: 2, y: 2, owner: 1, kind: 'stun' }],
      walls: [{ x: 3, y: 3, o: 'h', owner: 0, ghost: true }, { x: 5, y: 5, o: 'v', owner: 1, ghost: true }],
    };
    const v = viewFor(s, 1);
    expect(v.traps.map((t) => t.owner)).toEqual([1]);
    expect(v.walls.map((w) => w.owner)).toEqual([1]);
  });

  it('攻撃技・罠のある対局でも、CPU は本当の盤で打てる手を選ぶ（序盤の数手）', () => {
    for (let seed = 1; seed <= 4; seed++) {
      const offers = dealGame(seed).offers;
      let s = newGame(seed, [offers[0][0] ?? null, offers[1][1] ?? null]);
      s = { ...s, traps: [{ x: 4, y: 5, owner: 0, kind: 'stun' }] };
      const rng = createRng(seed);
      for (let i = 0; i < 4 && s.winner === null; i++) {
        const a: Action = chooseAction(s, 1, rng);
        expect(legalActions(s).length).toBeGreaterThan(0);
        const r = applyAction(s, a);
        expect(r.ok).toBe(true);
        if (r.ok) s = r.state;
      }
    }
  }, 60000);
});
