import { describe, expect, it } from 'vitest';
import {
  applyAction,
  bothHavePath,
  createRng,
  dealGame,
  inBounds,
  isMeteorAt,
  legalActions,
  newGame,
  randomInt,
  wallSegments,
} from '../src';
import type { Action, GameState } from '../src';

/** ふつうの壁の合計（盤の上と、手元） */
function wallTotal(s: GameState): number {
  return s.walls.filter((w) => w.half === undefined).length + s.wallsLeft[0] + s.wallsLeft[1];
}

function checkInvariants(s: GameState): void {
  expect(inBounds(s.size, s.pawns[0])).toBe(true);
  expect(inBounds(s.size, s.pawns[1])).toBe(true);
  expect(s.pawns[0]).not.toEqual(s.pawns[1]);
  expect(s.wallsLeft[0]).toBeGreaterThanOrEqual(0);
  expect(s.wallsLeft[1]).toBeGreaterThanOrEqual(0);
  // 短い壁は、三連壁を使うたびに 3 枚増えるので、3 の倍数。ふつうの壁の合計は、wallTotal で調べる
  const longOnBoard = s.walls.filter((w) => w.half === undefined).length;
  const shortOnBoard = s.walls.length - longOnBoard;
  expect(s.shortWalls[0]).toBeGreaterThanOrEqual(0);
  expect(s.shortWalls[1]).toBeGreaterThanOrEqual(0);
  expect((shortOnBoard + s.shortWalls[0] + s.shortWalls[1]) % 3).toBe(0);
  expect(s.abilities[0].length).toBeLessThanOrEqual(2);
  expect(s.abilities[1].length).toBeLessThanOrEqual(2);
  // どちらのコマにも、壁と隕石を避けたゴールへの道が残る
  expect(bothHavePath(s, s.walls)).toBe(true);
  // 壁は、どれも、ほかの壁と同じ線分を使わない（重ならない）
  const segs = s.walls.flatMap((w) => wallSegments(w));
  expect(new Set(segs).size).toBe(segs.length);
  // コマは、隕石のマスにいない
  expect(isMeteorAt(s, s.pawns[0])).toBe(false);
  expect(isMeteorAt(s, s.pawns[1])).toBe(false);
  // 罠は、同じマスに 2 つない
  const trapKeys = s.traps.map((t) => `${t.x},${t.y}`);
  expect(new Set(trapKeys).size).toBe(trapKeys.length);
  expect(s.skip[0]).toBeGreaterThanOrEqual(0);
  expect(s.skip[1]).toBeGreaterThanOrEqual(0);
}

describe('ボット同士の大量対局', () => {
  it('ランダムに 100 局回して、規則違反・道の消失・クラッシュが 1 件もない', { timeout: 120_000 }, () => {
    let finished = 0;
    let abilityUses = 0;
    let attackUses = 0;
    for (let seed = 1; seed <= 100; seed++) {
      const rng = createRng(seed);
      // 偶数の種は、攻撃技あり（候補の先頭を選ぶ）。奇数は攻撃技なし
      const offers = dealGame(seed).offers;
      let state = newGame(seed, seed % 2 === 0 ? [offers[0][seed % 3] ?? null, offers[1][(seed >> 1) % 3] ?? null] : [null, null]);
      let total = wallTotal(state);
      for (let turn = 0; turn < 250 && state.winner === null; turn++) {
        // 壁の多い対局や、能力をよく使う対局も作るため、選び方を混ぜる
        const actions = legalActions(state);
        const walls = actions.filter((a) => a.type === 'wall');
        const moves = actions.filter((a) => a.type === 'move');
        const abilities = actions.filter((a) => a.type === 'ability');
        const attacks = actions.filter((a) => a.type === 'attack');
        let pool: Action[] = actions;
        if (attacks.length > 0 && rng() < 0.2) pool = attacks;
        else if (abilities.length > 0 && rng() < 0.25) pool = abilities;
        else if (seed % 2 === 0 && walls.length > 0 && rng() < 0.7) pool = walls;
        const action = pool[randomInt(rng, pool.length)] as Action;
        expect(moves.length).toBeGreaterThan(0);
        const r = applyAction(state, action);
        expect(r.ok).toBe(true);
        if (!r.ok) throw new Error(r.reason);
        if (action.type === 'ability') abilityUses++;
        if (action.type === 'attack') attackUses++;
        const hadTrap = state.traps.length > 0;
        state = r.state;
        checkInvariants(state);
        // 壁の合計は、補給で 1 枚増え、強奪の罠で 1 枚減る以外は変わらない
        const now = wallTotal(state);
        if (action.type === 'ability' && action.id === 'supply') expect(now - total).toBe(1);
        else if (hadTrap) expect([0, -1]).toContain(now - total);
        else expect(now - total).toBe(0);
        total = now;
      }
      if (state.winner !== null) finished++;
    }
    expect(finished).toBeGreaterThan(0);
    expect(abilityUses).toBeGreaterThan(50);
    expect(attackUses).toBeGreaterThan(10);
  });
});
