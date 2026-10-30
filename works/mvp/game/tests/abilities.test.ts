import { describe, expect, it } from 'vitest';
import {
  ABILITIES,
  RARITY_WEIGHT,
  applyAction,
  createRng,
  drawAbilities,
  initialState,
  legalActions,
  bothHavePath,
  chaosResult,
  gravityProblem,
  gravityTarget,
  invertedBoard,
  legalDiagonalMoves,
  legalLeapMoves,
  legalPawnMoves,
  legalWalls,
  meteorProblem,
  meteorTarget,
  newGame,
  novaSecondMoves,
  shortWallSpec,
  stateHash,
  voidTargets,
  wallProblem,
  wallSegments,
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
    const count = Object.fromEntries(ABILITIES.map((a) => [a.id, 0])) as Record<AbilityId, number>;
    for (let i = 0; i < 6000; i++) count[drawAbilities(rng, 1, pool)[0] as AbilityId]++;
    expect(count.diagonal).toBeGreaterThan(count.reclaim);
    expect(count.reclaim).toBeGreaterThan(count.jam);
    // 理論値: 46 : 31 : 7（この 3 つだけを比べると）→ 約 55% : 37% : 8%
    expect(count.diagonal / 6000).toBeGreaterThan(0.5);
    expect(count.jam / 6000).toBeLessThan(0.12);
  });

  it('引ける数より多く求めても、あるぶんだけ返す', () => {
    expect(drawAbilities(createRng(1), 100)).toHaveLength(ABILITIES.length);
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

  it('壁で囲まれた、出口のない場所には、跳べない（ゴールへの道を失わないように）', () => {
    // (4,2) のマスを、上下左右の壁で囲む。ここに跳ぶと、ゴールへ進めなくなる
    const walls = [W(3, 1, 'h', 1), W(4, 2, 'h', 1), W(3, 2, 'v', 1), W(4, 1, 'v', 1)];
    const s = withAbilities(['leap'], [], { pawns: [{ x: 4, y: 4 }, { x: 0, y: 0 }], walls });
    const targets = legalLeapMoves(s);
    expect(targets.some((p) => p.x === 4 && p.y === 2)).toBe(false);
    expect(targets.some((p) => p.x === 4 && p.y === 6)).toBe(true);
    expect(applyAction(s, { type: 'ability', id: 'leap', to: { x: 4, y: 2 } }).ok).toBe(false);
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

describe('能力の一覧', () => {
  it('24 個。レア度は UNCOMMON 6・RARE 7・EPIC 7・LEGENDARY 4', () => {
    expect(ABILITIES).toHaveLength(24);
    const by = (r: string) => ABILITIES.filter((a) => a.rarity === r).length;
    expect([by('UNCOMMON'), by('RARE'), by('EPIC'), by('LEGENDARY')]).toEqual([6, 7, 7, 4]);
  });

  it('どの能力も、手札に入れれば、使える場面がある（使える行動が 1 つ以上）', () => {
    for (const a of ABILITIES) {
      // 転位の門は、中央の列にいると使えない
      const mine = a.id === 'gate' ? { x: 3, y: 6 } : { x: 4, y: 6 };
      const s = withAbilities([a.id], [], { walls: [W(3, 3, 'h', 0), W(5, 5, 'v', 1)], pawns: [mine, { x: 4, y: 2 }] });
      expect(legalActions(s).some((x) => x.type === 'ability' && x.id === a.id)).toBe(true);
    }
  });
});

describe('不滅の城壁（鉄壁）', () => {
  it('自分の壁 1 枚が鉄壁になり、能力が減り、手番が替わる', () => {
    const s = withAbilities(['aegis'], [], { walls: [W(6, 6, 'v', 0)] });
    const r = applyAction(s, { type: 'ability', id: 'aegis', wall: { x: 6, y: 6, o: 'v' } });
    if (!r.ok) throw new Error(r.reason);
    expect(r.state.walls[0]?.iron).toBe(true);
    expect(r.state.abilities[0]).toEqual([]);
    expect(r.state.turn).toBe(1);
  });

  it('相手の壁は、鉄壁にできない', () => {
    const s = withAbilities(['aegis'], [], { walls: [W(6, 6, 'v', 1)] });
    expect(applyAction(s, { type: 'ability', id: 'aegis', wall: { x: 6, y: 6, o: 'v' } }).ok).toBe(false);
  });

  it('鉄壁は、虚無でも、回収でも、消せない・戻せない', () => {
    const iron: Wall = { ...W(6, 6, 'v', 0), iron: true };
    const withVoid = withAbilities(['void', 'reclaim'], ['void'], { walls: [iron] });
    expect(applyAction(withVoid, { type: 'ability', id: 'void', wall: { x: 6, y: 6, o: 'v' } }).ok).toBe(false);
    expect(applyAction(withVoid, { type: 'ability', id: 'reclaim', wall: { x: 6, y: 6, o: 'v' } }).ok).toBe(false);
    expect(voidTargets(withVoid)).toHaveLength(0);
    // すでに鉄壁なので、もう一度は、鉄壁にできない
    const again = withAbilities(['aegis'], [], { walls: [iron] });
    expect(applyAction(again, { type: 'ability', id: 'aegis', wall: { x: 6, y: 6, o: 'v' } }).ok).toBe(false);
  });

  it('鉄壁の違いが、ハッシュに出る', () => {
    const a = withAbilities([], [], { walls: [W(6, 6, 'v', 0)] });
    const b = withAbilities([], [], { walls: [{ ...W(6, 6, 'v', 0), iron: true }] });
    expect(stateHash(a)).not.toBe(stateHash(b));
  });
});

describe('星爆の連舞（超新星）', () => {
  it('1 手番に 2 回動く。能力が減り、手番が替わる', () => {
    const s = withAbilities(['nova'], []);
    const r = applyAction(s, { type: 'ability', id: 'nova', first: { x: 4, y: 7 }, second: { x: 4, y: 6 } });
    if (!r.ok) throw new Error(r.reason);
    expect(r.state.pawns[0]).toEqual({ x: 4, y: 6 });
    expect(r.state.abilities[0]).toEqual([]);
    expect(r.state.turn).toBe(1);
  });

  it('1 回目で動けない・2 回目が足りない・2 回目に動けない、は反則', () => {
    const s = withAbilities(['nova'], []);
    expect(applyAction(s, { type: 'ability', id: 'nova', first: { x: 4, y: 6 }, second: { x: 4, y: 5 } }).ok).toBe(false);
    expect(applyAction(s, { type: 'ability', id: 'nova', first: { x: 4, y: 7 } }).ok).toBe(false);
    expect(applyAction(s, { type: 'ability', id: 'nova', first: { x: 4, y: 7 }, second: { x: 4, y: 5 } }).ok).toBe(false);
  });

  it('2 回目は、1 回目で動いた先から、ふつうに動ける先（相手のコマの飛び越えも）', () => {
    const s = withAbilities(['nova'], [], { pawns: [{ x: 4, y: 6 }, { x: 4, y: 4 }] });
    // 1 回目 (4,5) へ → 目の前に相手がいるので、2 回目は、飛び越えて (4,3)
    expect(novaSecondMoves(s, { x: 4, y: 5 }).some((p) => p.x === 4 && p.y === 3)).toBe(true);
    // 壁があれば、動けない
    const walled = withAbilities(['nova'], [], { pawns: [{ x: 4, y: 6 }, { x: 0, y: 0 }], walls: [W(3, 4, 'h', 1)] });
    expect(novaSecondMoves(walled, { x: 4, y: 5 }).some((p) => p.x === 4 && p.y === 4)).toBe(false);
  });

  it('1 回目でゴール行に着けば、2 回目なしで勝つ', () => {
    const s = withAbilities(['nova'], [], { pawns: [{ x: 2, y: 1 }, { x: 8, y: 8 }] });
    expect(novaSecondMoves(s, { x: 2, y: 0 })).toEqual([]);
    const r = applyAction(s, { type: 'ability', id: 'nova', first: { x: 2, y: 0 } });
    expect(r.ok && r.state.winner).toBe(0);
  });

  it('2 回目でゴール行に着いても勝つ', () => {
    const s = withAbilities(['nova'], [], { pawns: [{ x: 2, y: 2 }, { x: 8, y: 8 }] });
    const r = applyAction(s, { type: 'ability', id: 'nova', first: { x: 2, y: 1 }, second: { x: 2, y: 0 } });
    expect(r.ok && r.state.winner).toBe(0);
  });

  it('使える行動の一覧に、1 回目と 2 回目の組み合わせが出る', () => {
    const s = withAbilities(['nova'], []);
    const novas = legalActions(s).filter((a) => a.type === 'ability' && a.id === 'nova');
    expect(novas.length).toBeGreaterThan(5);
  });
});

describe('虚無の断罪（虚無）', () => {
  it('壁 1 枚を消し、その壁は、持ち主の手元に戻る（相手の壁も、自分の壁も消せる）', () => {
    const s = withAbilities(['void'], [], { walls: [W(3, 3, 'h', 1), W(6, 6, 'v', 0)], wallsLeft: [9, 9] });
    const r = applyAction(s, { type: 'ability', id: 'void', wall: { x: 3, y: 3, o: 'h' } });
    if (!r.ok) throw new Error(r.reason);
    expect(r.state.walls).toHaveLength(1);
    expect(r.state.wallsLeft).toEqual([9, 10]); // 持ち主（後手）に戻る
    expect(r.state.abilities[0]).toEqual([]);
    expect(r.state.turn).toBe(1);
    const own = applyAction(s, { type: 'ability', id: 'void', wall: { x: 6, y: 6, o: 'v' } });
    expect(own.ok && own.state.wallsLeft).toEqual([10, 9]);
  });

  it('短い壁を消すと、持ち主の短い壁が戻る', () => {
    const short: Wall = { x: 4, y: 7, o: 'h', half: 0, owner: 1 };
    const s = withAbilities(['void'], [], { walls: [short], shortWalls: [0, 1] });
    const r = applyAction(s, { type: 'ability', id: 'void', wall: { x: 4, y: 7, o: 'h', half: 0 } });
    expect(r.ok && r.state.shortWalls).toEqual([0, 2]);
  });

  it('壁がない所は消せない。壁がなければ、使える行動に出ない', () => {
    const s = withAbilities(['void'], []);
    expect(applyAction(s, { type: 'ability', id: 'void', wall: { x: 3, y: 3, o: 'h' } }).ok).toBe(false);
    expect(legalActions(s).some((a) => a.type === 'ability' && a.id === 'void')).toBe(false);
  });
});

describe('重力の鎖（引力）', () => {
  it('相手のコマを、ゴールと反対の向きに 1 マス引き戻す（後手は上へ、先手は下へ）', () => {
    const s = withAbilities(['gravity'], [], { pawns: [{ x: 4, y: 8 }, { x: 4, y: 3 }] });
    expect(gravityTarget(s)).toEqual({ x: 4, y: 2 });
    const r = applyAction(s, { type: 'ability', id: 'gravity' });
    if (!r.ok) throw new Error(r.reason);
    expect(r.state.pawns[1]).toEqual({ x: 4, y: 2 });
    expect(r.state.abilities[0]).toEqual([]);
    expect(r.state.turn).toBe(1);
    const second = withAbilities([], ['gravity'], { turn: 1, pawns: [{ x: 4, y: 5 }, { x: 4, y: 0 }] });
    expect(gravityTarget(second)).toEqual({ x: 4, y: 6 });
  });

  it('壁・盤の端・自分のコマ・隕石があると、使えない（使える行動にも出ない）', () => {
    const wall = withAbilities(['gravity'], [], { pawns: [{ x: 4, y: 8 }, { x: 4, y: 3 }], walls: [W(3, 2, 'h', 1)] });
    expect(gravityProblem(wall)).toBe('壁にふさがれている');
    const edge = withAbilities(['gravity'], [], { pawns: [{ x: 4, y: 8 }, { x: 4, y: 0 }] });
    expect(gravityProblem(edge)).toBe('引き戻す先がない');
    const mine = withAbilities(['gravity'], [], { pawns: [{ x: 4, y: 2 }, { x: 4, y: 3 }] });
    expect(gravityProblem(mine)).toBe('自分のコマがいる');
    const meteor = withAbilities(['gravity'], [], { pawns: [{ x: 4, y: 8 }, { x: 4, y: 3 }], meteors: [{ x: 4, y: 2, victim: 1, turnsLeft: 2 }] });
    expect(gravityProblem(meteor)).toBe('隕石がある');
    for (const s of [wall, edge, mine, meteor]) {
      expect(applyAction(s, { type: 'ability', id: 'gravity' }).ok).toBe(false);
      expect(legalActions(s).some((a) => a.type === 'ability' && a.id === 'gravity')).toBe(false);
    }
  });
});

describe('氷刻の静止（時停）', () => {
  it('相手の手番を飛ばし、続けて自分がもう一度動く。相手の電波妨害は解け、隕石の残りは減る', () => {
    const s = withAbilities(['stasis'], [], { wallBlocked: [false, true], meteors: [{ x: 1, y: 1, victim: 1, turnsLeft: 2 }] });
    const r = applyAction(s, { type: 'ability', id: 'stasis' });
    if (!r.ok) throw new Error(r.reason);
    expect(r.state.turn).toBe(0); // 手番は、自分のまま
    expect(r.state.abilities[0]).toEqual([]);
    expect(r.state.wallBlocked).toEqual([false, false]);
    expect(r.state.meteors[0]?.turnsLeft).toBe(1);
    // 続けて動ける
    expect(applyAction(r.state, { type: 'move', to: { x: 4, y: 7 } }).ok).toBe(true);
  });

  it('相手の隕石が 1 回で切れるときは、消える', () => {
    const s = withAbilities(['stasis'], [], { meteors: [{ x: 1, y: 1, victim: 1, turnsLeft: 1 }] });
    const r = applyAction(s, { type: 'ability', id: 'stasis' });
    expect(r.ok && r.state.meteors).toEqual([]);
  });
});

describe('三重の結界（三連壁・短い壁）', () => {
  it('使うと、短い壁を 3 枚持つ（ふつうの壁の残りは変わらない）', () => {
    const s = withAbilities(['triwall'], []);
    const r = applyAction(s, { type: 'ability', id: 'triwall' });
    if (!r.ok) throw new Error(r.reason);
    expect(r.state.shortWalls).toEqual([3, 0]);
    expect(r.state.wallsLeft).toEqual([10, 10]);
    expect(r.state.turn).toBe(1);
  });

  it('短い壁は、1 マス分だけをふさぎ、ふつうの壁の残りを減らさず、短い壁の残りを減らす', () => {
    const s = withAbilities([], [], { shortWalls: [3, 0] });
    const r = applyAction(s, { type: 'wall', x: 4, y: 7, o: 'h', half: 0 });
    if (!r.ok) throw new Error(r.reason);
    expect(r.state.walls[0]).toEqual({ x: 4, y: 7, o: 'h', half: 0, owner: 0 });
    expect(r.state.shortWalls).toEqual([2, 0]);
    expect(r.state.wallsLeft).toEqual([10, 10]);
    // 列 4 だけがふさがれる。列 5 は通れる
    const back = { ...r.state, turn: 0 as const, pawns: [{ x: 4, y: 8 }, { x: 0, y: 0 }] as GameState['pawns'] };
    expect(legalPawnMoves(back).some((p) => p.x === 4 && p.y === 7)).toBe(false);
    const side = { ...back, pawns: [{ x: 5, y: 8 }, { x: 0, y: 0 }] as GameState['pawns'] };
    expect(legalPawnMoves(side).some((p) => p.x === 5 && p.y === 7)).toBe(true);
  });

  it('短い壁の残りがなければ置けない。ふつうの壁は、短い壁の残りがなくても置ける', () => {
    const s = withAbilities([], []);
    expect(applyAction(s, { type: 'wall', x: 4, y: 7, o: 'h', half: 0 }).ok).toBe(false);
    expect(applyAction(s, { type: 'wall', x: 4, y: 7, o: 'h' }).ok).toBe(true);
  });

  it('同じ 1 マスを指す別の書き方（x=3, half=1 と x=4, half=0）は、置くと 1 通りにそろう（ハッシュがずれない）', () => {
    const s = withAbilities([], [], { shortWalls: [3, 0] });
    const a = applyAction(s, { type: 'wall', x: 3, y: 7, o: 'h', half: 1 });
    const b = applyAction(s, { type: 'wall', x: 4, y: 7, o: 'h', half: 0 });
    if (!a.ok || !b.ok) throw new Error('置けない');
    expect(a.state.walls).toEqual(b.state.walls);
    expect(stateHash(a.state)).toBe(stateHash(b.state));
    const v1 = applyAction(s, { type: 'wall', x: 2, y: 3, o: 'v', half: 1 });
    const v2 = applyAction(s, { type: 'wall', x: 2, y: 4, o: 'v', half: 0 });
    expect(v1.ok && v2.ok && stateHash(v1.state) === stateHash(v2.state)).toBe(true);
  });

  it('同じ 1 マスは、重ねて置けない。長い壁と同じ 1 マスも重なる。長い壁どうしの十字は禁止のまま', () => {
    const base = withAbilities([], [], { shortWalls: [3, 0], walls: [{ x: 4, y: 7, o: 'h', half: 0, owner: 1 }] });
    // 列 4 を、別の表し方（x=3, half=1）で置こうとしても、同じ 1 マスなので重なる
    expect(wallProblem(base, { x: 3, y: 7, o: 'h', half: 1 })).toBe('壁が重なる');
    // 隣の列 5 は置ける
    expect(wallProblem(base, { x: 5, y: 7, o: 'h', half: 0 })).toBeNull();
    // 長い壁 (4,7) は、列 4・5 をふさぐので、列 4 の短い壁と重なる
    expect(wallProblem(base, { x: 4, y: 7, o: 'h' })).toBe('壁が重なる');
    const longWall = withAbilities([], [], { shortWalls: [3, 0], walls: [W(4, 7, 'h', 1)] });
    expect(wallProblem(longWall, { x: 5, y: 7, o: 'h', half: 0 })).toBe('壁が重なる');
    expect(wallProblem(longWall, { x: 6, y: 7, o: 'h', half: 0 })).toBeNull();
    expect(wallProblem(longWall, { x: 4, y: 7, o: 'v' })).toBe('壁が重なる'); // 長い壁どうしの十字
  });

  it('短い壁を持っているときだけ、置ける短い壁が一覧に出る（盤の端のマスも）', () => {
    const none = withAbilities([], []);
    expect(legalWalls(none).some((w) => w.half !== undefined)).toBe(false);
    const has = withAbilities([], [], { shortWalls: [3, 0] });
    const shorts = legalWalls(has).filter((w) => w.half !== undefined);
    expect(shorts).toHaveLength(2 * 8 * 9);
    expect(shortWallSpec('h', 3, 8, 9)).toEqual({ x: 7, y: 3, o: 'h', half: 1 });
    expect(shortWallSpec('v', 2, 0, 9)).toEqual({ x: 2, y: 0, o: 'v', half: 0 });
  });

  it('短い壁を戻す（回収）と、短い壁の残りが戻る', () => {
    const s = withAbilities(['reclaim'], [], { walls: [{ x: 4, y: 7, o: 'h', half: 0, owner: 0 }], shortWalls: [2, 0] });
    const r = applyAction(s, { type: 'ability', id: 'reclaim', wall: { x: 4, y: 7, o: 'h', half: 0 } });
    expect(r.ok && r.state.shortWalls).toEqual([3, 0]);
    expect(r.ok && r.state.wallsLeft).toEqual([10, 10]);
  });

  it('短い壁も、ゴールへの道をなくす置き方はできない', () => {
    // 後手が左上の隅 (0,0)。出口は (0,1) と (1,0)→… のうち、長い壁で 1〜8 列をふさぎ、(0,1) だけが出口
    const walls: Wall[] = [W(1, 0, 'h', 0), W(3, 0, 'h', 0), W(5, 0, 'h', 0), W(7, 0, 'h', 0)];
    const s = withAbilities([], [], { shortWalls: [3, 0], pawns: [{ x: 4, y: 8 }, { x: 0, y: 0 }], walls });
    expect(wallProblem(s, { x: 0, y: 0, o: 'h', half: 0 })).toBe('ゴールへの道がなくなる');
  });
});

describe('混沌の創世（混沌）', () => {
  const walls: Wall[] = [
    W(0, 2, 'h', 0),
    W(2, 2, 'h', 1),
    W(4, 4, 'v', 0),
    W(6, 5, 'h', 1),
    { x: 3, y: 6, o: 'v', half: 0, owner: 1 },
    { ...W(5, 1, 'h', 0), iron: true },
  ];
  const base = withAbilities(['chaos'], [], { walls, wallsLeft: [8, 8], shortWalls: [0, 1], pawns: [{ x: 4, y: 7 }, { x: 4, y: 1 }] });

  it('同じ種なら、同じ結果。種が違えば、たいてい違う並びになる', () => {
    expect(chaosResult(base, 7)).toEqual(chaosResult(base, 7));
    const layouts = new Set(Array.from({ length: 10 }, (_, i) => JSON.stringify(chaosResult(base, i + 1).walls)));
    expect(layouts.size).toBeGreaterThan(1);
  });

  it('鉄壁は動かない。ほかの壁は、枚数・持ち主・長さの種類を保ち、置けなかった分は手元に戻る', () => {
    for (let seed = 1; seed <= 20; seed++) {
      const r = chaosResult(base, seed);
      expect(r.walls.filter((w) => w.iron)).toEqual([{ ...W(5, 1, 'h', 0), iron: true }]);
      const placed = r.walls.filter((w) => !w.iron);
      const returnedLong = r.wallsLeft[0] + r.wallsLeft[1] - 16;
      const returnedShort = r.shortWalls[0] + r.shortWalls[1] - 1;
      expect(placed.length + returnedLong + returnedShort).toBe(5);
      // 持ち主ごとの数
      const owners = (list: readonly Wall[]) => [list.filter((w) => w.owner === 0).length, list.filter((w) => w.owner === 1).length];
      expect(owners(placed)[0]).toBe(owners(base.walls.filter((w) => !w.iron))[0]! - (r.wallsLeft[0] - 8) - (r.shortWalls[0] - 0));
    }
  });

  it('置き直したあとも、壁は重ならず、どちらのコマにも、ゴールへの道が残る', () => {
    for (let seed = 1; seed <= 30; seed++) {
      const r = chaosResult(base, seed);
      const segs = r.walls.flatMap((w) => wallSegments(w));
      expect(new Set(segs).size).toBe(segs.length);
      expect(bothHavePath(base, r.walls)).toBe(true);
    }
  });

  it('使うと、壁が置き直され、能力が減り、手番が替わる。動かせる壁がないと使えない', () => {
    const r = applyAction(base, { type: 'ability', id: 'chaos', seed: 5 });
    if (!r.ok) throw new Error(r.reason);
    expect(r.state.abilities[0]).toEqual([]);
    expect(r.state.turn).toBe(1);
    const empty = withAbilities(['chaos'], [], { walls: [{ ...W(5, 1, 'h', 0), iron: true }] });
    expect(applyAction(empty, { type: 'ability', id: 'chaos', seed: 1 }).ok).toBe(false);
    expect(legalActions(empty).some((a) => a.type === 'ability' && a.id === 'chaos')).toBe(false);
  });
});

describe('天地の逆転（天地反転）', () => {
  const state = withAbilities(['invert'], [], {
    pawns: [{ x: 4, y: 6 }, { x: 3, y: 2 }],
    walls: [W(1, 2, 'h', 0), { x: 2, y: 4, o: 'v', half: 0, owner: 1 }, { ...W(6, 6, 'v', 1), iron: true }],
    meteors: [{ x: 2, y: 5, victim: 0, turnsLeft: 2 }],
  });

  it('盤を 180 度回す: 壁・隕石は反転し、コマは位置を入れ替える（回したあとの位置）', () => {
    const b = invertedBoard(state);
    expect(b.pawns).toEqual([{ x: 5, y: 6 }, { x: 4, y: 2 }]);
    expect(b.walls[0]).toEqual({ x: 6, y: 5, o: 'h', owner: 0 });
    expect(b.walls[1]).toEqual({ x: 5, y: 4, o: 'v', half: 0, owner: 1 });
    expect(b.walls[2]).toEqual({ x: 1, y: 1, o: 'v', owner: 1, iron: true });
    expect(b.meteors).toEqual([{ x: 6, y: 3, victim: 0, turnsLeft: 2 }]);
  });

  it('2 回回すと、元に戻る', () => {
    const once = invertedBoard(state);
    const twice = invertedBoard({ ...state, ...once });
    expect(twice.pawns).toEqual(state.pawns);
    expect(twice.walls).toEqual(state.walls);
    expect(twice.meteors).toEqual(state.meteors);
  });

  it('使うと、能力が減り、手番が替わり、回したあとも、ゴールへの道が残る', () => {
    const r = applyAction(state, { type: 'ability', id: 'invert' });
    if (!r.ok) throw new Error(r.reason);
    expect(r.state.abilities[0]).toEqual([]);
    expect(r.state.turn).toBe(1);
    expect(r.state.winner).toBeNull();
    expect(bothHavePath(r.state, r.state.walls)).toBe(true);
  });

  it('壁がなくても、使える（コマの位置が入れ替わる）', () => {
    const plain = withAbilities(['invert'], [], { pawns: [{ x: 4, y: 6 }, { x: 4, y: 3 }] });
    const r = applyAction(plain, { type: 'ability', id: 'invert' });
    expect(r.ok && r.state.pawns).toEqual([{ x: 4, y: 5 }, { x: 4, y: 2 }]);
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
