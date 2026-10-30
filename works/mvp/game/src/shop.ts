/**
 * ショップと Gold。盤にも画面にも依存しない、純粋な計算だけ（テストできる）。
 * Gold は、CPU に勝つともらえる。CPU が強いほど多い。負けても、少しもらえる。
 */

export type Slot = 'board' | 'piece';

/** 盤の見た目（色）。数字は 0xRRGGBB */
export interface BoardSkin {
  readonly tile: number;
  readonly tileEmissive: number;
  readonly rim: number;
}

/** コマの見た目: 先手・後手の色 */
export interface PieceSkin {
  readonly colors: readonly [number, number];
}

export interface ShopItem {
  readonly id: string;
  readonly slot: Slot;
  readonly name: string;
  readonly price: number;
  readonly board?: BoardSkin;
  readonly piece?: PieceSkin;
}

export const ITEMS: readonly ShopItem[] = [
  { id: 'board-space', slot: 'board', name: '宇宙の板', price: 0, board: { tile: 0x22408a, tileEmissive: 0x0a1a48, rim: 0xbcd4ff } },
  { id: 'board-crimson', slot: 'board', name: '紅蓮の板', price: 1500, board: { tile: 0x8a1a2a, tileEmissive: 0x3a0510, rim: 0xff9a9a } },
  { id: 'board-jade', slot: 'board', name: '翠玉の板', price: 2000, board: { tile: 0x1c6a4a, tileEmissive: 0x063a24, rim: 0x9affc8 } },
  { id: 'board-silver', slot: 'board', name: '白銀の板', price: 3000, board: { tile: 0x6a7388, tileEmissive: 0x20263a, rim: 0xffffff } },
  { id: 'piece-orb', slot: 'piece', name: '黄と桃の珠', price: 0, piece: { colors: [0xffc928, 0xff4fb8] } },
  { id: 'piece-aurora', slot: 'piece', name: '極光の珠', price: 500, piece: { colors: [0x4dffb8, 0xff7a4d] } },
  { id: 'piece-flame', slot: 'piece', name: '業火の珠', price: 1000, piece: { colors: [0xff5a2a, 0x7ad0ff] } },
  { id: 'piece-royal', slot: 'piece', name: '王家の珠', price: 1500, piece: { colors: [0xb98cff, 0xffe27a] } },
];

export const DEFAULT_BOARD = 'board-space';
export const DEFAULT_PIECE = 'piece-orb';

export interface Wallet {
  readonly gold: number;
  readonly owned: readonly string[];
  readonly equipped: { readonly board: string; readonly piece: string };
}

export const START_WALLET: Wallet = { gold: 0, owned: [DEFAULT_BOARD, DEFAULT_PIECE], equipped: { board: DEFAULT_BOARD, piece: DEFAULT_PIECE } };

export function itemById(id: string): ShopItem | undefined {
  return ITEMS.find((i) => i.id === id);
}

/** 勝ったときの Gold（CPU の段階 1〜5）。インフレ感を出すため、大きめの数 */
const GOLD_WIN = [100, 200, 350, 550, 800] as const;
/** 負けたときは、勝ったときの 3 割 */
const LOSE_RATE = 0.3;

export function goldFor(level: number, won: boolean): number {
  const i = Math.min(GOLD_WIN.length, Math.max(1, Math.round(level))) - 1;
  const win = GOLD_WIN[i] as number;
  return won ? win : Math.round(win * LOSE_RATE);
}

export type ShopResult = { readonly ok: true; readonly wallet: Wallet } | { readonly ok: false; readonly reason: string };

export function buy(w: Wallet, id: string): ShopResult {
  const item = itemById(id);
  if (item === undefined) return { ok: false, reason: 'そんな品はない' };
  if (w.owned.includes(id)) return { ok: false, reason: 'もう持っている' };
  if (w.gold < item.price) return { ok: false, reason: 'Gold が足りない' };
  return { ok: true, wallet: { ...w, gold: w.gold - item.price, owned: [...w.owned, id] } };
}

export function equip(w: Wallet, id: string): ShopResult {
  const item = itemById(id);
  if (item === undefined) return { ok: false, reason: 'そんな品はない' };
  if (!w.owned.includes(id)) return { ok: false, reason: 'まだ持っていない' };
  return { ok: true, wallet: { ...w, equipped: { ...w.equipped, [item.slot]: id } } };
}

export function earn(w: Wallet, amount: number): Wallet {
  return { ...w, gold: w.gold + Math.max(0, Math.round(amount)) };
}

/** 保存された値を、安全に読む。壊れていたり、知らない品が入っていたりしたら、初期値に戻す（落ちない） */
export function parseWallet(raw: unknown): Wallet {
  if (typeof raw !== 'object' || raw === null) return START_WALLET;
  const o = raw as Record<string, unknown>;
  const gold = typeof o['gold'] === 'number' && Number.isFinite(o['gold']) && o['gold'] >= 0 ? Math.floor(o['gold']) : 0;
  const ownedRaw = Array.isArray(o['owned']) ? o['owned'].filter((x): x is string => typeof x === 'string' && itemById(x) !== undefined) : [];
  const owned = [...new Set([DEFAULT_BOARD, DEFAULT_PIECE, ...ownedRaw])];
  const eq = typeof o['equipped'] === 'object' && o['equipped'] !== null ? (o['equipped'] as Record<string, unknown>) : {};
  const pick = (slot: Slot, fallback: string): string => {
    const id = eq[slot];
    return typeof id === 'string' && owned.includes(id) && itemById(id)?.slot === slot ? id : fallback;
  };
  return { gold, owned, equipped: { board: pick('board', DEFAULT_BOARD), piece: pick('piece', DEFAULT_PIECE) } };
}

/** いま身につけている見た目 */
export function currentSkin(w: Wallet): { board: BoardSkin; piece: PieceSkin } {
  const board = itemById(w.equipped.board)?.board ?? (itemById(DEFAULT_BOARD)?.board as BoardSkin);
  const piece = itemById(w.equipped.piece)?.piece ?? (itemById(DEFAULT_PIECE)?.piece as PieceSkin);
  return { board, piece };
}
