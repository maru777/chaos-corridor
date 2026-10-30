import { describe, expect, it } from 'vitest';
import { MAX_ENTRIES, addEntry, parseLog, summarize } from '../src/matchlog';
import type { MatchEntry } from '../src/matchlog';

const e = (won: boolean, level = 3, first = true): MatchEntry => ({ at: '2026-10-30T10:00:00.000Z', level, won, first, moves: 40, gold: won ? 350 : 105 });

describe('勝敗ログ', () => {
  it('新しい記録が先頭に入り、200 件を超えた古い記録は捨てる', () => {
    let list: MatchEntry[] = [];
    for (let i = 0; i < MAX_ENTRIES + 10; i++) list = addEntry(list, { ...e(true), moves: i });
    expect(list).toHaveLength(MAX_ENTRIES);
    expect(list[0]?.moves).toBe(MAX_ENTRIES + 9);
  });

  it('勝率・先手後手別・強さ別・連勝を数える', () => {
    // 新しい順: 勝, 勝, 負（★3 先手）, 勝（★1 後手）
    const list = [e(true), e(true), e(false), e(true, 1, false)];
    const s = summarize(list);
    expect(s.games).toBe(4);
    expect(s.wins).toBe(3);
    expect(s.rate).toBe(75);
    expect(s.rateFirst).toBe(67);
    expect(s.rateSecond).toBe(100);
    expect(s.streak).toBe(2);
    expect(s.bestStreak).toBe(2);
    expect(s.byLevel[0]).toEqual({ level: 1, games: 1, wins: 1, rate: 100 });
    expect(s.byLevel[2]).toEqual({ level: 3, games: 3, wins: 2, rate: 67 });
    expect(s.byLevel[4]?.rate).toBeNull();
  });

  it('記録がないときは、勝率が null（0% と区別する）', () => {
    const s = summarize([]);
    expect(s.games).toBe(0);
    expect(s.rate).toBeNull();
    expect(s.streak).toBe(0);
  });

  it('保存された値が壊れていても、落ちない（壊れた記録だけ捨てる）', () => {
    expect(parseLog(null)).toEqual([]);
    expect(parseLog('x')).toEqual([]);
    const ok = e(true);
    expect(parseLog([ok, { at: 5 }, null, { ...ok, level: 9 }, { ...ok, won: 'yes' }])).toEqual([ok]);
  });
});
