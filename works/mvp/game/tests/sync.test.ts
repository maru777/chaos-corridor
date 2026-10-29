import { describe, expect, it } from 'vitest';
import { applyAction, createRng, initialState, legalActions, newGame, randomInt, stateHash } from '../src';
import type { Action, GameState } from '../src';

/** 種つきの乱数で、反則でない手だけを選んで 1 局ぶんの操作の記録を作る（能力も含む。最初の能力は種で決まる） */
function playRandomGame(seed: number, maxTurns = 200): { log: Action[]; final: GameState } {
  const rng = createRng(seed);
  let state = newGame(seed);
  const log: Action[] = [];
  for (let i = 0; i < maxTurns && state.winner === null; i++) {
    const actions = legalActions(state);
    expect(actions.length).toBeGreaterThan(0);
    const action = actions[randomInt(rng, actions.length)] as Action;
    const r = applyAction(state, action);
    expect(r.ok).toBe(true);
    if (!r.ok) break;
    state = r.state;
    log.push(action);
  }
  return { log, final: state };
}

function replay(seed: number, log: readonly Action[]): GameState {
  let state = newGame(seed);
  for (const action of log) {
    const r = applyAction(state, action);
    if (!r.ok) throw new Error(`再生で反則: ${r.reason}`);
    state = r.state;
  }
  return state;
}

describe('再生', () => {
  it('同じ操作の記録を再生すると、同じ状態・同じハッシュになる', () => {
    for (let seed = 1; seed <= 20; seed++) {
      const { log, final } = playRandomGame(seed, 80);
      expect(stateHash(replay(seed, log))).toBe(stateHash(final));
    }
  });

  it('同じ種なら、同じ対局になる', () => {
    const a = playRandomGame(777, 80);
    const b = playRandomGame(777, 80);
    expect(b.log).toEqual(a.log);
  });
});

describe('2 つのクライアントの同期', () => {
  it('同じ操作を適用し続けると、毎ターンのハッシュが一致する', () => {
    const { log } = playRandomGame(42, 120);
    let a = newGame(42);
    let b = newGame(42);
    for (const action of log) {
      const ra = applyAction(a, action);
      const rb = applyAction(b, action);
      if (!ra.ok || !rb.ok) throw new Error('反則');
      a = ra.state;
      b = rb.state;
      expect(stateHash(a)).toBe(stateHash(b));
    }
  });

  it('壁の並び順が違っても、同じ壁（位置・向き・持ち主）の盤面ならハッシュは同じ', () => {
    const base = initialState();
    const a = { x: 0, y: 0, o: 'h', owner: 0 } as const;
    const b = { x: 5, y: 5, o: 'v', owner: 1 } as const;
    expect(stateHash({ ...base, walls: [a, b] })).toBe(stateHash({ ...base, walls: [b, a] }));
  });

  it('障害物（壁）の位置が 1 つでも違えばハッシュが変わる＝ずれを検出できる', () => {
    const r1 = applyAction(initialState(), { type: 'wall', x: 3, y: 3, o: 'h' });
    const r2 = applyAction(initialState(), { type: 'wall', x: 3, y: 4, o: 'h' });
    const r3 = applyAction(initialState(), { type: 'wall', x: 3, y: 3, o: 'v' });
    if (!r1.ok || !r2.ok || !r3.ok) throw new Error('反則');
    const hashes = new Set([stateHash(r1.state), stateHash(r2.state), stateHash(r3.state)]);
    expect(hashes.size).toBe(3);
  });

  it('コマの位置・残り壁・手番の違いもハッシュに出る', () => {
    const s = initialState();
    const hs = new Set([
      stateHash(s),
      stateHash({ ...s, pawns: [{ x: 3, y: 8 }, s.pawns[1]] }),
      stateHash({ ...s, wallsLeft: [9, 10] }),
      stateHash({ ...s, turn: 1 }),
    ]);
    expect(hs.size).toBe(4);
  });
});
