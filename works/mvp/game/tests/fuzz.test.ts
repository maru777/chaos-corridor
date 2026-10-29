import { describe, expect, it } from 'vitest';
import {
  applyAction,
  bothHavePath,
  createRng,
  inBounds,
  legalActions,
  newGame,
  randomInt,
} from '../src';
import type { Action, GameState } from '../src';

function checkInvariants(s: GameState): void {
  expect(inBounds(s.size, s.pawns[0])).toBe(true);
  expect(inBounds(s.size, s.pawns[1])).toBe(true);
  expect(s.pawns[0]).not.toEqual(s.pawns[1]);
  expect(s.wallsLeft[0]).toBeGreaterThanOrEqual(0);
  expect(s.wallsLeft[1]).toBeGreaterThanOrEqual(0);
  expect(s.walls.length + s.wallsLeft[0] + s.wallsLeft[1]).toBe(20);
  expect(s.abilities[0].length).toBeLessThanOrEqual(2);
  expect(s.abilities[1].length).toBeLessThanOrEqual(2);
  expect(bothHavePath(s, s.walls)).toBe(true);
  const keys = new Set(s.walls.map((w) => `${w.x},${w.y}`));
  expect(keys.size).toBe(s.walls.length);
}

describe('ボット同士の大量対局', () => {
  it('ランダムに 100 局回して、規則違反・道の消失・クラッシュが 1 件もない', { timeout: 120_000 }, () => {
    let finished = 0;
    let abilityUses = 0;
    for (let seed = 1; seed <= 100; seed++) {
      const rng = createRng(seed);
      let state = newGame(seed);
      for (let turn = 0; turn < 250 && state.winner === null; turn++) {
        // 壁の多い対局や、能力をよく使う対局も作るため、選び方を混ぜる
        const actions = legalActions(state);
        const walls = actions.filter((a) => a.type === 'wall');
        const moves = actions.filter((a) => a.type === 'move');
        const abilities = actions.filter((a) => a.type === 'ability');
        let pool: Action[] = actions;
        if (abilities.length > 0 && rng() < 0.25) pool = abilities;
        else if (seed % 2 === 0 && walls.length > 0 && rng() < 0.7) pool = walls;
        const action = pool[randomInt(rng, pool.length)] as Action;
        expect(moves.length).toBeGreaterThan(0);
        const r = applyAction(state, action);
        expect(r.ok).toBe(true);
        if (!r.ok) throw new Error(r.reason);
        if (action.type === 'ability') abilityUses++;
        state = r.state;
        checkInvariants(state);
      }
      if (state.winner !== null) finished++;
    }
    expect(finished).toBeGreaterThan(0);
    expect(abilityUses).toBeGreaterThan(50);
  });
});
