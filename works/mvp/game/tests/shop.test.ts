import { describe, expect, it } from 'vitest';
import { ITEMS, START_WALLET, buy, currentSkin, earn, equip, goldFor, itemById, parseWallet } from '../src/shop';

describe('Gold', () => {
  it('強い CPU に勝つほど、多くもらえる。負けても、少しもらえる（勝ちの 3 割）', () => {
    for (let l = 2; l <= 5; l++) expect(goldFor(l, true)).toBeGreaterThan(goldFor(l - 1, true));
    expect(goldFor(1, true)).toBe(100);
    expect(goldFor(5, true)).toBe(800);
    expect(goldFor(5, false)).toBe(240);
    expect(goldFor(3, false)).toBeLessThan(goldFor(3, true));
    expect(goldFor(3, false)).toBeGreaterThan(0);
  });

  it('範囲外の段階は、端に丸める', () => {
    expect(goldFor(0, true)).toBe(goldFor(1, true));
    expect(goldFor(99, true)).toBe(goldFor(5, true));
  });
});

describe('ショップ', () => {
  it('買うと、Gold が減って、持ち物が増える。足りなければ、買えない', () => {
    const rich = earn(START_WALLET, 2000);
    const r = buy(rich, 'board-crimson');
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(r.wallet.gold).toBe(500);
      expect(r.wallet.owned).toContain('board-crimson');
    }
    expect(buy(START_WALLET, 'board-crimson').ok).toBe(false);
  });

  it('同じ品は、2 度買えない。知らない品も買えない', () => {
    const rich = earn(START_WALLET, 9999);
    const once = buy(rich, 'piece-flame');
    expect(once.ok).toBe(true);
    if (once.ok) expect(buy(once.wallet, 'piece-flame').ok).toBe(false);
    expect(buy(rich, 'nothing').ok).toBe(false);
  });

  it('持っている品だけ、身につけられる。枠（盤・コマ）ごとに 1 つ', () => {
    expect(equip(START_WALLET, 'board-jade').ok).toBe(false);
    const w = buy(earn(START_WALLET, 5000), 'board-jade');
    expect(w.ok).toBe(true);
    if (!w.ok) return;
    const e = equip(w.wallet, 'board-jade');
    expect(e.ok).toBe(true);
    if (e.ok) {
      expect(e.wallet.equipped.board).toBe('board-jade');
      expect(e.wallet.equipped.piece).toBe('piece-orb');
      expect(currentSkin(e.wallet).board).toEqual(itemById('board-jade')?.board);
    }
  });

  it('品の値段は、10 倍のインフレ値で、初期の 2 つは無料', () => {
    expect(itemById('board-space')?.price).toBe(0);
    expect(itemById('piece-orb')?.price).toBe(0);
    expect(ITEMS.filter((i) => i.slot === 'board').length).toBeGreaterThanOrEqual(3);
    expect(ITEMS.filter((i) => i.slot === 'piece').length).toBeGreaterThanOrEqual(3);
    for (const i of ITEMS) expect(Number.isInteger(i.price) && i.price >= 0).toBe(true);
  });
});

describe('保存された値の読み込み', () => {
  it('壊れた値や、知らない品は、落ちずに初期値へ戻る', () => {
    expect(parseWallet(null)).toEqual(START_WALLET);
    expect(parseWallet('x')).toEqual(START_WALLET);
    expect(parseWallet({ gold: -5, owned: ['zzz'], equipped: { board: 'zzz', piece: 5 } })).toEqual(START_WALLET);
  });

  it('正しい値は、そのまま読める。持っていない品を身につけていたら、初期の品に戻す', () => {
    const ok = parseWallet({ gold: 1234, owned: ['board-jade'], equipped: { board: 'board-jade', piece: 'piece-flame' } });
    expect(ok.gold).toBe(1234);
    expect(ok.equipped.board).toBe('board-jade');
    expect(ok.equipped.piece).toBe('piece-orb');
    expect(ok.owned).toContain('piece-orb');
  });
});
