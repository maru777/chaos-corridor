import { describe, expect, it } from 'vitest';
import { applyAction, initialState, legalPawnMoves, wallProblem } from '../src';
import type { GameState, Wall } from '../src';

/** テスト用の壁（先手が置いたことにする） */
function W(x: number, y: number, o: 'h' | 'v'): Wall {
  return { x, y, o, owner: 0 };
}

function withState(patch: Partial<GameState>): GameState {
  return { ...initialState(), ...patch };
}

function sortPos(list: { x: number; y: number }[]) {
  return [...list].sort((a, b) => a.y - b.y || a.x - b.x);
}

describe('初期状態', () => {
  it('コマは中央の両端、壁は 10 枚ずつ、先手番', () => {
    const s = initialState();
    expect(s.pawns[0]).toEqual({ x: 4, y: 8 });
    expect(s.pawns[1]).toEqual({ x: 4, y: 0 });
    expect(s.wallsLeft).toEqual([10, 10]);
    expect(s.turn).toBe(0);
    expect(s.winner).toBeNull();
  });
});

describe('コマの移動', () => {
  it('初期位置から 3 方向に動ける（盤の端は出られない）', () => {
    expect(sortPos(legalPawnMoves(initialState()))).toEqual(
      sortPos([
        { x: 4, y: 7 },
        { x: 3, y: 8 },
        { x: 5, y: 8 },
      ]),
    );
  });

  it('壁でふさがれた方向には動けない', () => {
    const s = withState({ walls: [W(4, 7, 'h')] });
    expect(legalPawnMoves(s).some((p) => p.x === 4 && p.y === 7)).toBe(false);
    const s2 = withState({ walls: [W(3, 7, 'h')] });
    expect(legalPawnMoves(s2).some((p) => p.x === 4 && p.y === 7)).toBe(false);
  });

  it('相手が隣にいて、その先が空いていれば、まっすぐ飛び越える', () => {
    const s = withState({ pawns: [{ x: 4, y: 5 }, { x: 4, y: 4 }] });
    expect(legalPawnMoves(s).some((p) => p.x === 4 && p.y === 3)).toBe(true);
    expect(legalPawnMoves(s).some((p) => p.x === 4 && p.y === 4)).toBe(false);
  });

  it('飛び越える先に壁があれば、斜めに動ける', () => {
    const s = withState({
      pawns: [{ x: 4, y: 5 }, { x: 4, y: 4 }],
      walls: [W(4, 3, 'h')],
    });
    const moves = legalPawnMoves(s);
    expect(moves.some((p) => p.x === 4 && p.y === 3)).toBe(false);
    expect(moves.some((p) => p.x === 3 && p.y === 4)).toBe(true);
    expect(moves.some((p) => p.x === 5 && p.y === 4)).toBe(true);
  });

  it('飛び越える先が盤の外なら、斜めに動ける', () => {
    const s = withState({ pawns: [{ x: 4, y: 1 }, { x: 4, y: 0 }], turn: 0 });
    const moves = legalPawnMoves(s);
    expect(moves.some((p) => p.x === 3 && p.y === 0)).toBe(true);
    expect(moves.some((p) => p.x === 5 && p.y === 0)).toBe(true);
  });

  it('動けないマスを指定すると反則', () => {
    const r = applyAction(initialState(), { type: 'move', to: { x: 4, y: 5 } });
    expect(r.ok).toBe(false);
  });
});

describe('壁', () => {
  it('置くと残り枚数が減り、手番が替わる', () => {
    const r = applyAction(initialState(), { type: 'wall', x: 0, y: 0, o: 'h' });
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(r.state.wallsLeft).toEqual([9, 10]);
      expect(r.state.turn).toBe(1);
      expect(r.state.walls).toHaveLength(1);
    }
  });

  it('重なる・交差する壁、盤の外の壁は置けない', () => {
    const base = withState({ walls: [W(3, 3, 'h')] });
    expect(wallProblem(base, { x: 3, y: 3, o: 'h' })).not.toBeNull();
    expect(wallProblem(base, { x: 4, y: 3, o: 'h' })).not.toBeNull();
    expect(wallProblem(base, { x: 2, y: 3, o: 'h' })).not.toBeNull();
    expect(wallProblem(base, { x: 3, y: 3, o: 'v' })).not.toBeNull();
    expect(wallProblem(base, { x: 5, y: 3, o: 'h' })).toBeNull();
    expect(wallProblem(base, { x: 8, y: 0, o: 'h' })).not.toBeNull();
    expect(wallProblem(base, { x: 0, y: -1, o: 'v' })).not.toBeNull();
  });

  it('縦の壁どうしの重なりも見つける', () => {
    const base = withState({ walls: [W(3, 3, 'v')] });
    expect(wallProblem(base, { x: 3, y: 4, o: 'v' })).not.toBeNull();
    expect(wallProblem(base, { x: 3, y: 2, o: 'v' })).not.toBeNull();
    expect(wallProblem(base, { x: 3, y: 5, o: 'v' })).toBeNull();
  });

  it('残り 0 枚では置けない', () => {
    const s = withState({ wallsLeft: [0, 10] });
    expect(wallProblem(s, { x: 0, y: 0, o: 'h' })).not.toBeNull();
  });

  it('ゴールへの道を完全にふさぐ壁は置けない', () => {
    // 後手のコマが左上の隅 (0,0) にいて、足元に横壁がある。右の出口 (1,0)→(2,0) を縦壁でふさぐと閉じ込められる
    const walls: Wall[] = [W(0, 0, 'h')];
    const s = withState({ walls, pawns: [{ x: 4, y: 8 }, { x: 0, y: 0 }] });
    expect(wallProblem(s, { x: 1, y: 0, o: 'v' })).toBe('ゴールへの道がなくなる');
    // 出口が残る壁なら置ける
    expect(wallProblem(s, { x: 5, y: 5, o: 'v' })).toBeNull();
  });
});

describe('勝敗', () => {
  it('ゴール行に着くと勝ちが決まり、以後は操作できない', () => {
    const s = withState({ pawns: [{ x: 0, y: 1 }, { x: 8, y: 8 }] });
    const r = applyAction(s, { type: 'move', to: { x: 0, y: 0 } });
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.state.winner).toBe(0);
    expect(applyAction(r.state, { type: 'wall', x: 0, y: 0, o: 'h' }).ok).toBe(false);
  });
});

describe('元の状態を壊さない', () => {
  it('applyAction は入力の状態を変更しない', () => {
    const s = initialState();
    const snapshot = JSON.stringify(s);
    applyAction(s, { type: 'wall', x: 0, y: 0, o: 'h' });
    applyAction(s, { type: 'move', to: { x: 4, y: 7 } });
    expect(JSON.stringify(s)).toBe(snapshot);
  });
});
