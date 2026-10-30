/**
 * 勝敗ログ（戦績）。画面にも保存先にも依存しない、純粋な計算だけ（テストできる）。
 * 保存は save.ts（いまは、この端末のブラウザ内）。
 */

export interface MatchEntry {
  /** 終わった日時（ISO 形式の文字列） */
  readonly at: string;
  /** CPU の強さ（★の数 1〜5） */
  readonly level: number;
  readonly won: boolean;
  /** 自分が先手だったか */
  readonly first: boolean;
  /** 対局の手数（両者の行動の合計） */
  readonly moves: number;
  /** もらった Gold */
  readonly gold: number;
}

export const MAX_ENTRIES = 200;

/** 新しい記録を、先頭に足す。古いものは、上限（200 件）を超えたぶんを捨てる */
export function addEntry(list: readonly MatchEntry[], entry: MatchEntry): MatchEntry[] {
  return [entry, ...list].slice(0, MAX_ENTRIES);
}

export interface LevelStat {
  readonly level: number;
  readonly games: number;
  readonly wins: number;
  /** 勝率（0〜100 の整数）。対局がなければ null */
  readonly rate: number | null;
}

export interface Summary {
  readonly games: number;
  readonly wins: number;
  readonly rate: number | null;
  /** 先手のときの勝率 / 後手のときの勝率 */
  readonly rateFirst: number | null;
  readonly rateSecond: number | null;
  /** いまの連勝（連敗は 0）と、最高の連勝 */
  readonly streak: number;
  readonly bestStreak: number;
  readonly byLevel: readonly LevelStat[];
}

const pct = (w: number, g: number): number | null => (g === 0 ? null : Math.round((w / g) * 100));

export function summarize(list: readonly MatchEntry[], levels = 5): Summary {
  const wins = list.filter((e) => e.won).length;
  const first = list.filter((e) => e.first);
  const second = list.filter((e) => !e.first);
  // 先頭が新しい順。連勝は、新しい方から数える。最高の連勝は、古い方から数える
  let streak = 0;
  for (const e of list) {
    if (!e.won) break;
    streak++;
  }
  let best = 0;
  let run = 0;
  for (const e of [...list].reverse()) {
    run = e.won ? run + 1 : 0;
    best = Math.max(best, run);
  }
  const byLevel: LevelStat[] = [];
  for (let l = 1; l <= levels; l++) {
    const g = list.filter((e) => e.level === l);
    const w = g.filter((e) => e.won).length;
    byLevel.push({ level: l, games: g.length, wins: w, rate: pct(w, g.length) });
  }
  return {
    games: list.length,
    wins,
    rate: pct(wins, list.length),
    rateFirst: pct(first.filter((e) => e.won).length, first.length),
    rateSecond: pct(second.filter((e) => e.won).length, second.length),
    streak,
    bestStreak: best,
    byLevel,
  };
}

/** 保存された値を、安全に読む。壊れた記録は捨てる（落ちない） */
export function parseLog(raw: unknown): MatchEntry[] {
  if (!Array.isArray(raw)) return [];
  const out: MatchEntry[] = [];
  for (const e of raw) {
    if (typeof e !== 'object' || e === null) continue;
    const o = e as Record<string, unknown>;
    if (
      typeof o['at'] === 'string' &&
      typeof o['level'] === 'number' &&
      Number.isInteger(o['level']) &&
      o['level'] >= 1 &&
      o['level'] <= 5 &&
      typeof o['won'] === 'boolean' &&
      typeof o['first'] === 'boolean' &&
      typeof o['moves'] === 'number' &&
      typeof o['gold'] === 'number'
    ) {
      out.push({ at: o['at'], level: o['level'], won: o['won'], first: o['first'], moves: Math.max(0, Math.floor(o['moves'])), gold: Math.max(0, Math.floor(o['gold'])) });
    }
  }
  return out.slice(0, MAX_ENTRIES);
}
