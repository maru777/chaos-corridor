import { describe, expect, it } from 'vitest';
import {
  ATTACKS,
  applyAction,
  bothHavePath,
  dealGame,
  initialState,
  isMeteorAt,
  legalActions,
  legalAttacks,
  legalPawnMoves,
  newGame,
  stateHash,
} from '../src';
import type { AbilityId, Action, AttackId, GameState, Trap, Wall } from '../src';

function W(x: number, y: number, o: 'h' | 'v', owner: 0 | 1 = 0, extra: Partial<Wall> = {}): Wall {
  return { x, y, o, owner, ...extra };
}

function make(first: AbilityId[], second: AbilityId[], patch: Partial<GameState> = {}): GameState {
  return { ...initialState(9, 10, [first, second]), ...patch };
}

function withAttack(first: AttackId | null, second: AttackId | null, patch: Partial<GameState> = {}): GameState {
  return { ...initialState(9, 10, [[], []], [first, second], 7), ...patch };
}

function ok(s: GameState, a: Action): GameState {
  const r = applyAction(s, a);
  if (!r.ok) throw new Error(r.reason);
  return r.state;
}

const trap = (x: number, y: number, kind: Trap['kind'], owner: 0 | 1 = 1, extra: Partial<Trap> = {}): Trap => ({ x, y, kind, owner, ...extra });

describe('罠（Skill）', () => {
  it('空きマスに仕掛けられる。コマのいるマス・罠のあるマスには置けない', () => {
    const s = make(['trapStun'], []);
    const after = ok(s, { type: 'ability', id: 'trapStun', at: { x: 2, y: 5 } });
    expect(after.traps).toEqual([trap(2, 5, 'stun', 0)]);
    expect(after.abilities[0]).toEqual([]);
    // 罠を仕掛けても、手番は続く（使ったことが、相手に分からないように）
    expect(after.turn).toBe(0);
    expect(applyAction(s, { type: 'ability', id: 'trapStun', at: s.pawns[1] }).ok).toBe(false);
    const withTrap = make(['trapStun'], [], { traps: [trap(2, 5, 'back', 1)] });
    expect(applyAction(withTrap, { type: 'ability', id: 'trapStun', at: { x: 2, y: 5 } }).ok).toBe(false);
  });

  it('足止め: 相手が踏むと 1 回休み。自分の手番が 2 回続く。罠は消える', () => {
    const s = make([], [], { turn: 1, traps: [trap(4, 3, 'stun', 0)], pawns: [{ x: 4, y: 6 }, { x: 4, y: 2 }] });
    const after = ok(s, { type: 'move', to: { x: 4, y: 3 } });
    expect(after.traps).toEqual([]);
    expect(after.turn).toBe(0);
    const next = ok(after, { type: 'move', to: { x: 4, y: 5 } });
    expect(next.turn).toBe(0); // 相手（後手）が休み、続けて自分
    expect(next.skip).toEqual([0, 0]);
  });

  it('持ち主のコマは、自分の罠を踏んでも何も起きない', () => {
    const s = make([], [], { traps: [trap(4, 5, 'stun', 0)], pawns: [{ x: 4, y: 6 }, { x: 4, y: 2 }] });
    const after = ok(s, { type: 'move', to: { x: 4, y: 5 } });
    expect(after.traps).toHaveLength(1);
    expect(after.skip).toEqual([0, 0]);
  });

  it('逆行: 動く前のマスに戻される（その手番は無駄になる）', () => {
    const s = make([], [], { turn: 1, traps: [trap(4, 3, 'back', 0)], pawns: [{ x: 4, y: 6 }, { x: 4, y: 2 }] });
    const after = ok(s, { type: 'move', to: { x: 4, y: 3 } });
    expect(after.pawns[1]).toEqual({ x: 4, y: 2 });
    expect(after.traps).toEqual([]);
    expect(after.turn).toBe(0);
  });

  it('疾風: 指定した向きへ最大 2 マス飛ばされる。壁の手前で止まる', () => {
    const s = make([], [], { turn: 1, traps: [trap(4, 3, 'shove', 0, { dx: 1, dy: 0 })], pawns: [{ x: 4, y: 6 }, { x: 4, y: 2 }] });
    expect(ok(s, { type: 'move', to: { x: 4, y: 3 } }).pawns[1]).toEqual({ x: 6, y: 3 });
    const walled = { ...s, walls: [W(5, 2, 'v', 0)] };
    expect(ok(walled, { type: 'move', to: { x: 4, y: 3 } }).pawns[1]).toEqual({ x: 5, y: 3 });
  });

  it('強奪: 踏んだ人の手元の壁が 1 枚減る（0 より下がらない）', () => {
    const s = make([], [], { turn: 1, traps: [trap(4, 3, 'confiscate', 0)], pawns: [{ x: 4, y: 6 }, { x: 4, y: 2 }] });
    expect(ok(s, { type: 'move', to: { x: 4, y: 3 } }).wallsLeft).toEqual([10, 9]);
    const none = { ...s, wallsLeft: [10, 0] as [number, number] };
    expect(ok(none, { type: 'move', to: { x: 4, y: 3 } }).wallsLeft).toEqual([10, 0]);
  });

  it('封印: 次の手番は Skill も攻撃技も使えない。その手番が終わると解ける', () => {
    const s = make([], ['stasis'], { turn: 1, traps: [trap(4, 3, 'seal', 0)], pawns: [{ x: 4, y: 6 }, { x: 4, y: 2 }], attacks: [null, 'atkFreeze'] });
    const sealed = ok(ok(s, { type: 'move', to: { x: 4, y: 3 } }), { type: 'move', to: { x: 4, y: 5 } });
    expect(sealed.sealed).toEqual([false, true]);
    expect(legalActions(sealed).some((a) => a.type === 'ability' || a.type === 'attack')).toBe(false);
    expect(applyAction(sealed, { type: 'ability', id: 'stasis' }).ok).toBe(false);
    const free = ok(sealed, { type: 'move', to: { x: 4, y: 4 } });
    expect(free.sealed).toEqual([false, false]);
  });

  it('ゴール行の罠は、勝ちを止めない', () => {
    const s = make([], [], { traps: [trap(4, 0, 'stun', 1)], pawns: [{ x: 4, y: 1 }, { x: 0, y: 2 }] });
    expect(ok(s, { type: 'move', to: { x: 4, y: 0 } }).winner).toBe(0);
  });
});

describe('罠系の Skill は、手番を使わない', () => {
  it('仕掛けたあと、続けて動ける。電波妨害・隕石の残りは、手番が終わるまで変わらない', () => {
    const s = make(['trapStun', 'trapSeal'], [], { wallBlocked: [true, false], meteors: [{ x: 0, y: 4, victim: 0, turnsLeft: 2 }] });
    const a = ok(s, { type: 'ability', id: 'trapStun', at: { x: 2, y: 5 } });
    const b = ok(a, { type: 'ability', id: 'trapSeal', at: { x: 3, y: 5 } });
    expect(b.turn).toBe(0);
    expect(b.wallBlocked).toEqual([true, false]);
    expect(b.meteors[0]?.turnsLeft).toBe(2);
    expect(b.traps).toHaveLength(2);
    const moved = ok(b, { type: 'move', to: { x: 4, y: 7 } });
    expect(moved.turn).toBe(1);
  });
});

describe('見えない壁（虚像の壁）', () => {
  const base = () => make(['trapGhost'], [], { pawns: [{ x: 4, y: 6 }, { x: 4, y: 2 }] });

  it('手元の壁を 1 枚使って置く。相手には見えず、動ける先に数えられる', () => {
    const placed = ok(base(), { type: 'ability', id: 'trapGhost', wall: { x: 4, y: 2, o: 'h' } });
    expect(placed.turn).toBe(0); // 手番は続く
    expect(placed.walls).toEqual([{ x: 4, y: 2, o: 'h', owner: 0, ghost: true }]);
    expect(placed.wallsLeft).toEqual([9, 10]);
    // 相手（後手）のコマ (4,2) から見ると、下 (4,3) へ動ける（壁が見えない）
    expect(legalPawnMoves({ ...placed, turn: 1 }).some((p) => p.x === 4 && p.y === 3)).toBe(true);
  });

  it('ぶつかると、手番だけ使って、壁が姿を現す。コマは動かない', () => {
    const placed = { ...ok(base(), { type: 'ability', id: 'trapGhost', wall: { x: 4, y: 2, o: 'h' } }), turn: 1 as const };
    const bumped = ok(placed, { type: 'move', to: { x: 4, y: 3 } });
    expect(bumped.pawns[1]).toEqual({ x: 4, y: 2 });
    expect(bumped.walls[0]?.ghost).toBe(false);
    expect(bumped.turn).toBe(0);
    // 姿を現したあとは、動ける先から外れる
    const again = ok(bumped, { type: 'move', to: { x: 4, y: 5 } });
    expect(legalPawnMoves(again).some((p) => p.x === 4 && p.y === 3)).toBe(false);
  });

  it('置いた本人には、ずっと見えている。道がなくなる置き方はできない', () => {
    const placed = ok(base(), { type: 'ability', id: 'trapGhost', wall: { x: 4, y: 2, o: 'h' } });
    const mine = { ...placed, turn: 0 as const };
    expect(legalPawnMoves(mine).length).toBeGreaterThan(0);
    const closing = make(['trapGhost'], [], { pawns: [{ x: 0, y: 8 }, { x: 4, y: 2 }], walls: [W(0, 7, 'h'), W(1, 7, 'v')] });
    expect(applyAction(closing, { type: 'ability', id: 'trapGhost', wall: { x: 0, y: 7, o: 'v' } }).ok).toBe(false);
  });
});

describe('追加 Skill', () => {
  it('静寂の補給: 手元の壁が 1 枚増える', () => {
    expect(ok(make(['supply'], []), { type: 'ability', id: 'supply' }).wallsLeft).toEqual([11, 10]);
  });

  it('転位の門: 同じ行の左右反対側へ跳ぶ。中央の列では使えない', () => {
    const s = make(['gate'], [], { pawns: [{ x: 2, y: 6 }, { x: 4, y: 2 }] });
    expect(ok(s, { type: 'ability', id: 'gate' }).pawns[0]).toEqual({ x: 6, y: 6 });
    expect(applyAction(make(['gate'], []), { type: 'ability', id: 'gate' }).ok).toBe(false);
  });

  it('大地の亀裂: 壁の向きが入れ替わる。重なるときは回せない', () => {
    const s = make(['rift'], [], { walls: [W(3, 3, 'h', 1)] });
    const after = ok(s, { type: 'ability', id: 'rift', wall: { x: 3, y: 3, o: 'h' } });
    expect(after.walls[0]).toMatchObject({ x: 3, y: 3, o: 'v', owner: 1 });
    const blocked = make(['rift'], [], { walls: [W(3, 3, 'h', 1), W(3, 3, 'v', 1, { half: 0 })] });
    expect(legalActions(blocked).some((a) => a.type === 'ability' && a.id === 'rift')).toBe(false);
  });

  it('奪取の手: 相手の壁が自分の壁になる（自分の壁は選べない）', () => {
    const s = make(['seize'], [], { walls: [W(3, 3, 'h', 1), W(6, 6, 'v', 0)] });
    const after = ok(s, { type: 'ability', id: 'seize', wall: { x: 3, y: 3, o: 'h' } });
    expect(after.walls.find((w) => w.x === 3)?.owner).toBe(0);
    expect(applyAction(s, { type: 'ability', id: 'seize', wall: { x: 6, y: 6, o: 'v' } }).ok).toBe(false);
  });

  it('天空の雷霆: 相手のコマの周りの壁・隕石・罠を壊し、壁は持ち主に戻る。鉄壁は壊れない', () => {
    const s = make(['thunder'], [], {
      pawns: [{ x: 4, y: 6 }, { x: 4, y: 2 }],
      walls: [W(3, 2, 'v', 1, { half: undefined }), W(6, 6, 'v', 0), W(0, 1, 'h', 1, { iron: true })],
      wallsLeft: [10, 9],
      meteors: [{ x: 5, y: 3, victim: 0, turnsLeft: 2 }],
      traps: [trap(3, 1, 'stun', 1)],
    });
    const after = ok(s, { type: 'ability', id: 'thunder' });
    expect(after.walls.map((w) => w.x).sort()).toEqual([0, 6]);
    expect(after.meteors).toEqual([]);
    expect(after.traps).toEqual([]);
    expect(after.wallsLeft).toEqual([10, 10]);
  });
});

describe('攻撃技', () => {
  it('データ: 10 種類。ぜんぶ 3 行の説明がある', () => {
    expect(ATTACKS).toHaveLength(10);
    for (const a of ATTACKS) expect(a.text.split('\n')).toHaveLength(3);
  });

  it('配り: 同じ種なら同じ候補。重ならない 3 つ。Skill の配りは変わらない', () => {
    const a = dealGame(5);
    expect(dealGame(5)).toEqual(a);
    for (const o of a.offers) expect(new Set(o).size).toBe(3);
    expect(newGame(5).abilities).toEqual(a.abilities);
  });

  it('1 局に 1 回だけ。撃つと手番を使う。持っていない攻撃技・攻撃技なしの設定では撃てない', () => {
    const s = withAttack('atkFreeze', null);
    const after = ok(s, { type: 'attack', id: 'atkFreeze' });
    expect(after.attackUsed).toEqual([true, false]);
    // 相手は 2 回休む: いまの手番を飛ばされて（残り 1）、続けて自分の手番
    expect(after.skip).toEqual([0, 1]);
    expect(after.turn).toBe(0);
    expect(applyAction(after, { type: 'attack', id: 'atkFreeze' }).ok).toBe(false);
    expect(applyAction(withAttack(null, null), { type: 'attack', id: 'atkFreeze' }).ok).toBe(false);
    expect(legalAttacks(withAttack(null, null))).toEqual([]);
  });

  it('レーザー: 列の壁・隕石・罠を、相手の物から先に、最大 3 つ壊す。鉄壁とコマは壊れない', () => {
    const s = withAttack('atkLaser', null, {
      walls: [W(0, 3, 'v', 0), W(2, 3, 'v', 1), W(4, 3, 'v', 1), W(6, 3, 'v', 1), W(7, 3, 'h', 1, { iron: true })],
      wallsLeft: [9, 7],
    });
    const after = ok(s, { type: 'attack', id: 'atkLaser', axis: 'row', index: 3 });
    // 相手の壁 3 枚が先に壊れる
    expect(after.walls.map((w) => `${w.o}${w.x}`).sort()).toEqual(['h7', 'v0']);
    expect(after.wallsLeft).toEqual([9, 10]);
    expect(applyAction(s, { type: 'attack', id: 'atkLaser', axis: 'row', index: 8 }).ok).toBe(false);
  });

  it('衝撃波・爆撃: 範囲の物を壊す。壊せる物がなければ撃てない', () => {
    const walls = [W(3, 5, 'h', 1), W(1, 1, 'v', 1)];
    const pawns: [{ x: number; y: number }, { x: number; y: number }] = [{ x: 4, y: 6 }, { x: 4, y: 1 }];
    const shock = ok(withAttack('atkShock', null, { walls, pawns, wallsLeft: [10, 8] }), { type: 'attack', id: 'atkShock' });
    expect(shock.walls.map((w) => w.x)).toEqual([1]);
    const bomb = ok(withAttack('atkBomb', null, { walls, wallsLeft: [10, 8] }), { type: 'attack', id: 'atkBomb', at: { x: 1, y: 1 } });
    expect(bomb.walls.map((w) => w.x)).toEqual([3]);
    expect(applyAction(withAttack('atkBomb', null), { type: 'attack', id: 'atkBomb', at: { x: 1, y: 1 } }).ok).toBe(false);
    expect(legalAttacks(withAttack('atkShock', null))).toEqual([]);
  });

  it('メテオ: 盤全体のランダム。同じ状態なら、同じ結果。道は必ず残る。コマに当たれば休み', () => {
    let hitPawn = 0;
    let fell = 0;
    for (let seed = 1; seed <= 200; seed++) {
      const s = withAttack('atkMeteor', null, { rngSeed: seed });
      const a = ok(s, { type: 'attack', id: 'atkMeteor' });
      expect(stateHash(ok(s, { type: 'attack', id: 'atkMeteor' }))).toBe(stateHash(a));
      expect(bothHavePath(a, a.walls)).toBe(true);
      if (a.skip[0] + a.skip[1] > 0) hitPawn++;
      if (a.meteors.length === 1) fell++;
    }
    expect(fell).toBeGreaterThan(150);
    expect(hitPawn).toBeGreaterThan(0);
  });

  it('メテオが自分のコマに当たると、自分が休む（相手の手番のあと、飛ばされる）', () => {
    let found = false;
    for (let seed = 1; seed <= 3000 && !found; seed++) {
      const a = ok(withAttack('atkMeteor', null, { rngSeed: seed }), { type: 'attack', id: 'atkMeteor' });
      if (a.skip[0] === 1) {
        found = true;
        const next = ok(a, { type: 'move', to: legalPawnMoves(a)[0] as { x: number; y: number } });
        expect(next.turn).toBe(1); // 相手が動いたあと、自分の手番は飛ばされて、また相手
        expect(next.skip).toEqual([0, 0]);
      }
    }
    expect(found).toBe(true);
  });

  it('流星群: 3 つの隕石。コマのいるマスには落ちない。道は残る', () => {
    for (let seed = 1; seed <= 100; seed++) {
      const a = ok(withAttack('atkSwarm', null, { rngSeed: seed }), { type: 'attack', id: 'atkSwarm' });
      expect(a.meteors).toHaveLength(3);
      expect(new Set(a.meteors.map((m) => `${m.x},${m.y}`)).size).toBe(3);
      expect(a.meteors.some((m) => isMeteorAt({ meteors: [m] }, a.pawns[0]) || isMeteorAt({ meteors: [m] }, a.pawns[1]))).toBe(false);
      expect(bothHavePath(a, a.walls)).toBe(true);
    }
  });

  it('略奪: 相手の手元の壁を 2 枚奪う', () => {
    const after = ok(withAttack('atkPlunder', null), { type: 'attack', id: 'atkPlunder' });
    expect(after.wallsLeft).toEqual([12, 8]);
    expect(applyAction(withAttack('atkPlunder', null, { wallsLeft: [10, 0] }), { type: 'attack', id: 'atkPlunder' }).ok).toBe(false);
  });

  it('運命の交錯: コマの位置が入れ替わる。ゴール行に着いてしまうときは使えない', () => {
    const s = withAttack('atkSwap', null, { pawns: [{ x: 4, y: 6 }, { x: 3, y: 2 }] });
    expect(ok(s, { type: 'attack', id: 'atkSwap' }).pawns).toEqual([{ x: 3, y: 2 }, { x: 4, y: 6 }]);
    expect(applyAction(withAttack('atkSwap', null), { type: 'attack', id: 'atkSwap' }).ok).toBe(false); // 最初の位置だと、入れ替えるとゴール行に着く
    const goal = withAttack('atkSwap', null, { pawns: [{ x: 4, y: 3 }, { x: 4, y: 0 }] });
    expect(applyAction(goal, { type: 'attack', id: 'atkSwap' }).ok).toBe(false);
  });

  it('烈風: 相手を、ゴールと反対の向きに最大 2 マス吹き飛ばす。動かせなければ使えない', () => {
    const s = withAttack('atkGale', null, { pawns: [{ x: 4, y: 6 }, { x: 4, y: 4 }] });
    expect(ok(s, { type: 'attack', id: 'atkGale' }).pawns[1]).toEqual({ x: 4, y: 2 });
    expect(applyAction(withAttack('atkGale', null), { type: 'attack', id: 'atkGale' }).ok).toBe(false);
  });

  it('地雷原: ランダムな罠が 3 つ。自分の罠になる', () => {
    const a = ok(withAttack('atkMines', null), { type: 'attack', id: 'atkMines' });
    expect(a.traps).toHaveLength(3);
    for (const t of a.traps) expect(t.owner).toBe(0);
  });

  it('すべての攻撃技が、いつかは撃てる状況を作れる', () => {
    for (const def of ATTACKS) {
      const s = withAttack(def.id, null, {
        pawns: [{ x: 4, y: 6 }, { x: 4, y: 4 }],
        walls: [W(3, 5, 'h', 1), W(0, 3, 'h', 1)],
        wallsLeft: [10, 8],
      });
      expect(legalAttacks(s).length, def.id).toBeGreaterThan(0);
    }
  });
});

describe('同期（ハッシュ）', () => {
  it('罠・攻撃技・休み・封印・手数が違えば、ハッシュも違う', () => {
    const s = make([], []);
    const hashes = new Set([
      stateHash(s),
      stateHash({ ...s, traps: [trap(1, 1, 'stun', 0)] }),
      stateHash({ ...s, traps: [trap(1, 1, 'shove', 0, { dx: 1, dy: 0 })] }),
      stateHash({ ...s, attacks: ['atkBomb', null] }),
      stateHash({ ...s, attackUsed: [true, false] }),
      stateHash({ ...s, skip: [0, 1] }),
      stateHash({ ...s, sealed: [false, true] }),
      stateHash({ ...s, ply: 3 }),
      stateHash({ ...s, walls: [W(1, 1, 'h', 0, { ghost: true })] }),
      stateHash({ ...s, walls: [W(1, 1, 'h', 0)] }),
    ]);
    expect(hashes.size).toBe(10);
  });
});
