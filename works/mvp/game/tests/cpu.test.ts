import { describe, expect, it } from 'vitest';
import { CPU_LEVELS, chooseAction, evaluate, levelSpec, levelStars, shortestPath } from '../src/cpu';
import { newGame } from '../src/game';
import { createRng } from '../src/rng';
import { applyAction, legalActions } from '../src/rules';
import type { GameState } from '../src/types';

/** a が先手（席 0）、b が後手で、1 局。勝った席を返す（打ち切りは null） */
function play(seed: number, levels: readonly [number, number], maxPlies = 160): 0 | 1 | null {
  let s: GameState = newGame(seed);
  const rng = createRng(seed + 7);
  for (let i = 0; i < maxPlies && s.winner === null; i++) {
    const a = chooseAction(s, levels[s.turn], rng);
    const r = applyAction(s, a);
    if (!r.ok) throw new Error(`反則手: ${JSON.stringify(a)} ${r.reason}`);
    s = r.state;
  }
  return s.winner;
}

describe('CPU', () => {
  it('段階は 5 まであり、強いほど深く読む（または、うっかりが少ない）', () => {
    expect(CPU_LEVELS).toBe(5);
    for (let l = 2; l <= 5; l++) {
      const a = levelSpec(l - 1);
      const b = levelSpec(l);
      expect(b.depth >= a.depth).toBe(true);
      expect(b.depth > a.depth || b.beam >= a.beam || b.slip < a.slip).toBe(true);
    }
    expect(levelSpec(0).depth).toBe(levelSpec(1).depth); // 範囲外は、端に丸める
    expect(levelSpec(99).depth).toBe(levelSpec(5).depth);
    expect(levelStars(1)).toBe('★☆☆☆☆');
    expect(levelStars(5)).toBe('★★★★★');
  });

  it('初期状態の最短の道は、9 マス（8 歩）', () => {
    const s = newGame(1);
    expect(shortestPath(s, 0)?.length).toBe(9);
    expect(evaluate(s, 0)).toBeCloseTo(evaluate(s, 1) * -1 + 0, 5);
  });

  it('どの段階でも、反則手を出さない（序盤の数手を、全段階で）', () => {
    for (let level = 1; level <= CPU_LEVELS; level++) {
      let s = newGame(100 + level);
      const rng = createRng(level);
      for (let i = 0; i < 4 && s.winner === null; i++) {
        const a = chooseAction(s, level, rng);
        expect(legalActions(s).some((x) => JSON.stringify(x) === JSON.stringify(a))).toBe(true);
        const r = applyAction(s, a);
        expect(r.ok).toBe(true);
        if (r.ok) s = r.state;
      }
    }
  }, 60000);

  it('同じ状態・同じ乱数なら、同じ手を選ぶ', () => {
    const s = newGame(5);
    for (const level of [1, 3, 5]) {
      expect(chooseAction(s, level, createRng(9))).toEqual(chooseAction(s, level, createRng(9)));
    }
  });

  it('ゴールに 1 歩で着けるなら、着く（うっかりのない段階）', () => {
    let s = newGame(3);
    s = { ...s, pawns: [{ x: 4, y: 1 }, s.pawns[1]], abilities: [[], []] };
    for (const level of [2, 3, 4]) {
      const a = chooseAction(s, level, () => 0.99);
      const r = applyAction(s, a);
      expect(r.ok && r.state.winner === 0).toBe(true);
    }
  });

  it('止まらずに終わる: CPU 同士の対局を、いくつか（強い段階も）', () => {
    for (const [seed, lv] of [[1, [1, 2]], [2, [3, 1]], [3, [4, 5]]] as const) {
      expect(() => play(seed, lv, 80)).not.toThrow();
    }
  }, 120000);

  it('強い方が勝ちやすい: ★5 は★1 に勝ち越し、★3 は★1 に負け越さない（先手後手を入れ替えて。配られる Skill で、結果は多少ぶれる）', () => {
    const wins = (strong: number, weak: number) => {
      let w = 0;
      for (let g = 0; g < 3; g++) {
        const seed = 40 + g;
        if (play(seed, [strong, weak]) === 0) w++;
        if (play(seed, [weak, strong]) === 1) w++;
      }
      return w;
    };
    expect(wins(5, 1)).toBeGreaterThanOrEqual(4);
    expect(wins(3, 1)).toBeGreaterThanOrEqual(3);
  }, 400000);
});
