import { describe, expect, it } from 'vitest';
import {
  ABILITIES,
  RARITY_WEIGHT,
  applyAction,
  createRng,
  drawAbilities,
  initialState,
  legalActions,
  legalDiagonalMoves,
  legalLeapMoves,
  legalPawnMoves,
  meteorProblem,
  meteorTarget,
  newGame,
  stateHash,
  wallProblem,
} from '../src';
import type { AbilityDef, AbilityId, Action, GameState, Wall } from '../src';

function W(x: number, y: number, o: 'h' | 'v', owner: 0 | 1 = 0): Wall {
  return { x, y, o, owner };
}

/** 能力を指定して始める（ガチャを通さない） */
function withAbilities(first: AbilityId[], second: AbilityId[], patch: Partial<GameState> = {}): GameState {
  return { ...initialState(9, 10, [first, second]), ...patch };
}

describe('能力のデータ', () => {
  it('技名は漫画のような「XXXのYYY」の漢字、読みは英語 2 語。説明とレア度もそろっていて、id と名前が重ならない', () => {
    const ids = new Set(ABILITIES.map((a) => a.id));
    expect(ids.size).toBe(ABILITIES.length);
    expect(new Set(ABILITIES.map((a) => a.name)).size).toBe(ABILITIES.length);
    for (const a of ABILITIES) {
      expect(a.name).toMatch(/^[一-鿿]{1,3}の[一-鿿]{1,3}$/);
      expect(a.reading).toMatch(/^[A-Z][a-z]+ [A-Z][a-z]+$/);
      expect(a.text.length).toBeGreaterThan(0);
      expect(RARITY_WEIGHT[a.rarity]).toBeGreaterThan(0);
    }
  });
});

describe('ガチャ', () => {
  it('同じ種なら同じ結果、違う種なら（たいてい）違う結果', () => {
    expect(newGame(123)).toEqual(newGame(123));
    const hashes = new Set(Array.from({ length: 30 }, (_, i) => stateHash(newGame(i + 1))));
    expect(hashes.size).toBeGreaterThan(1);
  });

  it('1 人に 2 個、同じ能力は重ならない', () => {
    for (let seed = 1; seed <= 200; seed++) {
      const s = newGame(seed);
      for (const list of s.abilities) {
        expect(list).toHaveLength(2);
        expect(new Set(list).size).toBe(2);
      }
    }
  });

  it('出やすさは、レア度の重みに従う（高いレア度ほど出にくい）', () => {
    const pool: AbilityDef[] = [
      { id: 'diagonal', name: '斜行', reading: 'a', rarity: 'UNCOMMON', text: 't' },
      { id: 'reclaim', name: '回収', reading: 'b', rarity: 'RARE', text: 't' },
      { id: 'jam', name: '妨害', reading: 'c', rarity: 'LEGENDARY', text: 't' },
    ];
    const rng = createRng(2024);
    const count: Record<AbilityId, number> = { diagonal: 0, reclaim: 0, jam: 0, leap: 0, meteor: 0 };
    for (let i = 0; i < 6000; i++) count[drawAbilities(rng, 1, pool)[0] as AbilityId]++;
    expect(count.diagonal).toBeGreaterThan(count.reclaim);
    expect(count.reclaim).toBeGreaterThan(count.jam);
    // 理論値: 60 : 28 : 2 → 約 67% : 31% : 2%
    expect(count.diagonal / 6000).toBeGreaterThan(0.6);
    expect(count.jam / 6000).toBeLessThan(0.05);
  });

  it('引ける数より多く求めても、あるぶんだけ返す', () => {
    expect(drawAbilities(createRng(1), 10)).toHaveLength(ABILITIES.length);
  });
});

describe('斜行（ダイアゴナル）', () => {
  it('斜めに動け、能力を 1 つ使い、手番が替わる', () => {
    const s = withAbilities(['diagonal'], []);
    const r = applyAction(s, { type: 'ability', id: 'diagonal', to: { x: 3, y: 7 } });
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.state.pawns[0]).toEqual({ x: 3, y: 7 });
    expect(r.state.abilities[0]).toEqual([]);
    expect(r.state.turn).toBe(1);
  });

  it('1 局に 1 回だけ（使い切ったら使えない）', () => {
    const s = withAbilities(['diagonal'], []);
    const r = applyAction(s, { type: 'ability', id: 'diagonal', to: { x: 3, y: 7 } });
    if (!r.ok) throw new Error(r.reason);
    const back = { ...r.state, turn: 0 as const };
    expect(applyAction(back, { type: 'ability', id: 'diagonal', to: { x: 2, y: 6 } }).ok).toBe(false);
  });

  it('持っていない能力は使えない', () => {
    const r = applyAction(initialState(), { type: 'ability', id: 'diagonal', to: { x: 3, y: 7 } });
    expect(r.ok).toBe(false);
  });

  it('盤の端や、まっすぐのマスには動けない', () => {
    const s = withAbilities(['diagonal'], []);
    const targets = legalDiagonalMoves(s);
    expect(targets).toHaveLength(2); // 下段なので、上の斜め 2 つだけ
    expect(applyAction(s, { type: 'ability', id: 'diagonal', to: { x: 4, y: 7 } }).ok).toBe(false);
  });

  it('横→縦の道も縦→横の道も壁でふさがれていると、その斜めには動けない', () => {
    // (4,8) から (3,7) へ。横の道は (3,8)→(3,7) を横壁 (2,7) がふさぐ。縦の道は (4,7)→(3,7) を縦壁 (3,7) がふさぐ
    const s = withAbilities(['diagonal'], [], { walls: [W(2, 7, 'h'), W(3, 7, 'v')] });
    const targets = legalDiagonalMoves(s);
    expect(targets.some((p) => p.x === 3 && p.y === 7)).toBe(false);
    expect(targets.some((p) => p.x === 5 && p.y === 7)).toBe(true);
  });

  it('道が 1 つでも開いていれば動ける', () => {
    const s = withAbilities(['diagonal'], [], { walls: [W(2, 7, 'h')] }); // 横の道だけふさがれる
    expect(legalDiagonalMoves(s).some((p) => p.x === 3 && p.y === 7)).toBe(true);
  });

  it('途中のマスに相手がいる道は通れない', () => {
    const s = withAbilities(['diagonal'], [], { pawns: [{ x: 4, y: 5 }, { x: 4, y: 4 }] });
    // (4,5) から (3,4) へ: 縦の道は (4,4) に相手がいて通れない。横の道 (3,5)→(3,4) は開いている
    expect(legalDiagonalMoves(s).some((p) => p.x === 3 && p.y === 4)).toBe(true);
    const blocked = withAbilities(['diagonal'], [], {
      pawns: [{ x: 4, y: 5 }, { x: 4, y: 4 }],
      walls: [W(2, 4, 'h')], // (3,5)→(3,4) をふさぐ
    });
    expect(legalDiagonalMoves(blocked).some((p) => p.x === 3 && p.y === 4)).toBe(false);
  });

  it('斜行でゴール行に着けば、勝つ', () => {
    const s = withAbilities(['diagonal'], [], { pawns: [{ x: 4, y: 1 }, { x: 8, y: 8 }] });
    const r = applyAction(s, { type: 'ability', id: 'diagonal', to: { x: 3, y: 0 } });
    expect(r.ok && r.state.winner).toBe(0);
  });
});

describe('回収（リクレイム）', () => {
  it('自分の壁を戻すと、壁が盤から消えて、残り枚数が 1 増える', () => {
    const s = withAbilities(['reclaim'], [], { walls: [W(3, 3, 'h', 0)], wallsLeft: [9, 10] });
    const r = applyAction(s, { type: 'ability', id: 'reclaim', wall: { x: 3, y: 3, o: 'h' } });
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.state.walls).toHaveLength(0);
    expect(r.state.wallsLeft).toEqual([10, 10]);
    expect(r.state.abilities[0]).toEqual([]);
    expect(r.state.turn).toBe(1);
  });

  it('相手の壁は戻せない', () => {
    const s = withAbilities(['reclaim'], [], { walls: [W(3, 3, 'h', 1)], wallsLeft: [10, 9] });
    expect(applyAction(s, { type: 'ability', id: 'reclaim', wall: { x: 3, y: 3, o: 'h' } }).ok).toBe(false);
  });

  it('壁がない所や、持っていない能力では使えない', () => {
    const s = withAbilities(['reclaim'], []);
    expect(applyAction(s, { type: 'ability', id: 'reclaim', wall: { x: 0, y: 0, o: 'h' } }).ok).toBe(false);
    const none = withAbilities([], [], { walls: [W(3, 3, 'h', 0)], wallsLeft: [9, 10] });
    expect(applyAction(none, { type: 'ability', id: 'reclaim', wall: { x: 3, y: 3, o: 'h' } }).ok).toBe(false);
  });

  it('実際に壁を置いてから戻せる（置いた人が持ち主になる）', () => {
    const s = withAbilities(['reclaim'], []);
    const placed = applyAction(s, { type: 'wall', x: 2, y: 2, o: 'v' });
    if (!placed.ok) throw new Error(placed.reason);
    expect(placed.state.walls[0]?.owner).toBe(0);
    const foeMoves = applyAction(placed.state, { type: 'move', to: { x: 4, y: 1 } });
    if (!foeMoves.ok) throw new Error(foeMoves.reason);
    const r = applyAction(foeMoves.state, { type: 'ability', id: 'reclaim', wall: { x: 2, y: 2, o: 'v' } });
    expect(r.ok).toBe(true);
  });
});

describe('電波妨害（ジャミング）', () => {
  it('相手は、次の手番に壁を置けないが、動ける。その手番が終わると解ける', () => {
    const s = withAbilities(['jam'], []);
    const r = applyAction(s, { type: 'ability', id: 'jam' });
    if (!r.ok) throw new Error(r.reason);
    expect(r.state.wallBlocked).toEqual([false, true]);
    expect(r.state.turn).toBe(1);

    expect(applyAction(r.state, { type: 'wall', x: 0, y: 0, o: 'h' }).ok).toBe(false);
    expect(legalActions(r.state).some((a) => a.type === 'wall')).toBe(false);

    const moved = applyAction(r.state, { type: 'move', to: { x: 4, y: 1 } });
    if (!moved.ok) throw new Error(moved.reason);
    expect(moved.state.wallBlocked).toEqual([false, false]);
    // 先手の手番に戻る。その次に後手が壁を置ける
    const back = applyAction(moved.state, { type: 'move', to: { x: 4, y: 7 } });
    if (!back.ok) throw new Error(back.reason);
    expect(applyAction(back.state, { type: 'wall', x: 0, y: 0, o: 'h' }).ok).toBe(true);
  });

  it('封じられた手番に、能力を使っても解ける（その手番を使うため）', () => {
    const s = withAbilities(['jam'], ['reclaim']);
    const r = applyAction(s, { type: 'ability', id: 'jam' });
    if (!r.ok) throw new Error(r.reason);
    const after = { ...r.state, walls: [W(1, 1, 'h', 1)], wallsLeft: [10, 9] as [number, number] };
    const used = applyAction(after, { type: 'ability', id: 'reclaim', wall: { x: 1, y: 1, o: 'h' } });
    expect(used.ok && used.state.wallBlocked).toEqual([false, false]);
  });

  it('すでに封じている相手には、重ねて使えない', () => {
    const s = withAbilities(['jam'], [], { wallBlocked: [false, true] });
    expect(applyAction(s, { type: 'ability', id: 'jam' }).ok).toBe(false);
    expect(legalActions(s).some((a) => a.type === 'ability')).toBe(false);
  });

  it('自分にはかからない', () => {
    const s = withAbilities(['jam'], []);
    const r = applyAction(s, { type: 'ability', id: 'jam' });
    expect(r.ok && r.state.wallBlocked[0]).toBe(false);
  });
});

describe('跳躍（リープ）', () => {
  it('まっすぐ 2 マス先へ跳べる。上下左右の 4 方向（盤の外へは跳べない）', () => {
    const center = withAbilities(['leap'], [], { pawns: [{ x: 4, y: 4 }, { x: 0, y: 0 }] });
    const targets = legalLeapMoves(center);
    expect(targets).toHaveLength(4);
    expect(targets).toEqual(expect.arrayContaining([{ x: 4, y: 2 }, { x: 4, y: 6 }, { x: 2, y: 4 }, { x: 6, y: 4 }]));
    // 下段の中央からは、下へは跳べない（盤の外）。左右と上は跳べる
    const bottom = withAbilities(['leap'], []);
    expect(legalLeapMoves(bottom)).toHaveLength(3);
  });

  it('間の壁・相手のコマ・隕石を飛び越える。着地するマスに、相手や隕石があると跳べない', () => {
    const wall = withAbilities(['leap'], [], { pawns: [{ x: 4, y: 4 }, { x: 0, y: 0 }], walls: [W(3, 3, 'h', 1), W(4, 3, 'h', 1)] });
    expect(legalLeapMoves(wall).some((p) => p.x === 4 && p.y === 2)).toBe(true);
    const foeBetween = withAbilities(['leap'], [], { pawns: [{ x: 4, y: 4 }, { x: 4, y: 3 }] });
    expect(legalLeapMoves(foeBetween).some((p) => p.x === 4 && p.y === 2)).toBe(true);
    const foeLanding = withAbilities(['leap'], [], { pawns: [{ x: 4, y: 4 }, { x: 4, y: 2 }] });
    expect(legalLeapMoves(foeLanding).some((p) => p.x === 4 && p.y === 2)).toBe(false);
    const meteorLanding = withAbilities(['leap'], [], { pawns: [{ x: 4, y: 4 }, { x: 0, y: 0 }], meteors: [{ x: 4, y: 2, victim: 1, turnsLeft: 2 }] });
    expect(legalLeapMoves(meteorLanding).some((p) => p.x === 4 && p.y === 2)).toBe(false);
  });

  it('使うと、跳んだ先に動き、能力が減り、手番が替わる。ゴール行に着けば勝つ', () => {
    const s = withAbilities(['leap'], []);
    const r = applyAction(s, { type: 'ability', id: 'leap', to: { x: 4, y: 6 } });
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.state.pawns[0]).toEqual({ x: 4, y: 6 });
    expect(r.state.abilities[0]).toEqual([]);
    expect(r.state.turn).toBe(1);
    const near = withAbilities(['leap'], [], { pawns: [{ x: 2, y: 2 }, { x: 8, y: 8 }] });
    const win = applyAction(near, { type: 'ability', id: 'leap', to: { x: 2, y: 0 } });
    expect(win.ok && win.state.winner).toBe(0);
  });

  it('持っていない・跳べない場所は、反則', () => {
    expect(applyAction(initialState(), { type: 'ability', id: 'leap', to: { x: 4, y: 6 } }).ok).toBe(false);
    const s = withAbilities(['leap'], []);
    expect(applyAction(s, { type: 'ability', id: 'leap', to: { x: 4, y: 7 } }).ok).toBe(false); // 1 マス先
    expect(applyAction(s, { type: 'ability', id: 'leap', to: { x: 3, y: 6 } }).ok).toBe(false); // 斜め
  });
});

describe('隕石（メテオ）', () => {
  it('相手の前のマスに落ちる。先手が使えば、後手の前（下）、後手が使えば、先手の前（上）', () => {
    const first = withAbilities(['meteor'], []);
    expect(meteorTarget(first)).toEqual({ x: 4, y: 1 });
    const second = withAbilities([], ['meteor'], { turn: 1 });
    expect(meteorTarget(second)).toEqual({ x: 4, y: 7 });
  });

  it('落ちたマスは、どちらのコマも入れない。相手が 3 回動くと消える', () => {
    const s = withAbilities(['meteor'], []);
    const r = applyAction(s, { type: 'ability', id: 'meteor' });
    if (!r.ok) throw new Error(r.reason);
    expect(r.state.meteors).toEqual([{ x: 4, y: 1, victim: 1, turnsLeft: 3 }]);
    expect(r.state.abilities[0]).toEqual([]);
    expect(r.state.turn).toBe(1);
    // 後手は、(4,1) へ動けない
    expect(legalPawnMoves(r.state).some((p) => p.x === 4 && p.y === 1)).toBe(false);
    expect(applyAction(r.state, { type: 'move', to: { x: 4, y: 1 } }).ok).toBe(false);

    // 後手が動くたびに残りが減り、3 回目で消える（先手の動きでは減らない）
    let state = r.state;
    const left: number[] = [];
    const moves: Action[] = [
      { type: 'move', to: { x: 3, y: 0 } }, // 後手 1 回目
      { type: 'move', to: { x: 4, y: 7 } }, // 先手
      { type: 'move', to: { x: 2, y: 0 } }, // 後手 2 回目
      { type: 'move', to: { x: 4, y: 6 } }, // 先手
      { type: 'move', to: { x: 1, y: 0 } }, // 後手 3 回目
    ];
    for (const a of moves) {
      const next = applyAction(state, a);
      if (!next.ok) throw new Error(next.reason);
      state = next.state;
      left.push(state.meteors[0]?.turnsLeft ?? 0);
    }
    expect(left).toEqual([2, 2, 1, 1, 0]);
    expect(state.meteors).toEqual([]);
  });

  it('隕石のマスには、先手のコマも入れない（落とした本人も）', () => {
    const state = withAbilities([], [], { pawns: [{ x: 4, y: 2 }, { x: 4, y: 0 }], meteors: [{ x: 4, y: 1, victim: 1, turnsLeft: 3 }] });
    expect(legalPawnMoves(state).some((p) => p.x === 4 && p.y === 1)).toBe(false);
  });

  it('飛び越えの着地先や、斜めの道に隕石があると、そこへは動けない', () => {
    // 先手 (4,5)、相手 (4,4)。まっすぐ飛び越えた先 (4,3) が隕石なら、斜め (3,4) と (5,4) へ動ける
    const s = withAbilities([], [], { pawns: [{ x: 4, y: 5 }, { x: 4, y: 4 }], meteors: [{ x: 4, y: 3, victim: 1, turnsLeft: 2 }] });
    const moves = legalPawnMoves(s);
    expect(moves.some((p) => p.x === 4 && p.y === 3)).toBe(false);
    expect(moves.some((p) => p.x === 3 && p.y === 4)).toBe(true);
    expect(moves.some((p) => p.x === 5 && p.y === 4)).toBe(true);
  });

  it('自分のコマがいるマスや、すでに隕石があるマスには落とせない', () => {
    const mine = withAbilities(['meteor'], [], { pawns: [{ x: 4, y: 1 }, { x: 4, y: 0 }] });
    expect(meteorProblem(mine)).not.toBeNull();
    expect(applyAction(mine, { type: 'ability', id: 'meteor' }).ok).toBe(false);
    const already = withAbilities(['meteor'], [], { meteors: [{ x: 4, y: 1, victim: 1, turnsLeft: 2 }] });
    expect(meteorProblem(already)).not.toBeNull();
  });

  it('落とすとゴールへの道がなくなるときは、落とせない（使える能力の一覧にも出ない）', () => {
    // 後手が左上の隅 (0,0)。1 行目の壁で、(0,1) 以外の出口をふさぐ。(0,1) に落とすと、閉じ込める
    const walls: Wall[] = [W(1, 0, 'h', 0), W(3, 0, 'h', 0), W(5, 0, 'h', 0), W(7, 0, 'h', 0)];
    const s = withAbilities(['meteor'], [], { pawns: [{ x: 4, y: 8 }, { x: 0, y: 0 }], walls });
    expect(meteorTarget(s)).toEqual({ x: 0, y: 1 });
    expect(meteorProblem(s)).toBe('ゴールへの道がなくなる');
    expect(applyAction(s, { type: 'ability', id: 'meteor' }).ok).toBe(false);
    expect(legalActions(s).some((a) => a.type === 'ability' && a.id === 'meteor')).toBe(false);
  });

  it('隕石で通れないマスも、壁を置いたときの「道が残るか」の検査に入る', () => {
    // 後手が (0,0)。壁で、1〜6 列目の出口をふさいであり、出口は 0 列目（(0,1)）と、7・8 列目だけ。
    // 7・8 列目をふさぐ壁 (7,0) は、ふだんは置ける（0 列目が残る）。
    // 0 列目の出口 (0,1) が隕石でふさがれている間は、置くと道がなくなるので、置けない。
    const walls: Wall[] = [W(1, 0, 'h', 0), W(3, 0, 'h', 0), W(5, 0, 'h', 0)];
    const pawns: [{ x: number; y: number }, { x: number; y: number }] = [{ x: 4, y: 8 }, { x: 0, y: 0 }];
    const plain = withAbilities([], [], { pawns, walls });
    expect(wallProblem(plain, { x: 7, y: 0, o: 'h' })).toBeNull();
    const withMeteor = withAbilities([], [], { pawns, walls, meteors: [{ x: 0, y: 1, victim: 1, turnsLeft: 2 }] });
    expect(wallProblem(withMeteor, { x: 7, y: 0, o: 'h' })).toBe('ゴールへの道がなくなる');
  });

  it('隕石の有無が、ハッシュに出る（ずれを検出できる）', () => {
    const a = withAbilities([], []);
    const b = withAbilities([], [], { meteors: [{ x: 4, y: 1, victim: 1, turnsLeft: 3 }] });
    const c = withAbilities([], [], { meteors: [{ x: 4, y: 1, victim: 1, turnsLeft: 2 }] });
    expect(new Set([stateHash(a), stateHash(b), stateHash(c)]).size).toBe(3);
  });
});

describe('能力と同期', () => {
  it('能力の持ち物や封じの違いが、ハッシュに出る（ずれを検出できる）', () => {
    const a = withAbilities(['diagonal'], []);
    const b = withAbilities(['reclaim'], []);
    const c = withAbilities(['diagonal'], [], { wallBlocked: [false, true] });
    expect(new Set([stateHash(a), stateHash(b), stateHash(c)]).size).toBe(3);
  });

  it('壁の持ち主の違いも、ハッシュに出る', () => {
    const a = withAbilities([], [], { walls: [W(3, 3, 'h', 0)] });
    const b = withAbilities([], [], { walls: [W(3, 3, 'h', 1)] });
    expect(stateHash(a)).not.toBe(stateHash(b));
  });
});
