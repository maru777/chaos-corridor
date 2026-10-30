import { START_WALLET, parseWallet } from './shop';
import type { Wallet } from './shop';

/**
 * Gold と持ち物の保存。いまは、この端末のブラウザ（localStorage）に置く。
 * 保存の出し入れは、この 2 つの関数に集めてある。サーバーに保存するときは、ここだけを差し替える。
 * ブラウザの設定によっては、保存できない（読み書きで例外が出る）ので、失敗しても、ゲームは続ける。
 */
const KEY = 'chaos-corridor.wallet.v1';

export function loadWallet(): Wallet {
  try {
    const raw = window.localStorage.getItem(KEY);
    return raw === null ? START_WALLET : parseWallet(JSON.parse(raw));
  } catch {
    return START_WALLET;
  }
}

/** 保存できたかを返す（できなければ、false） */
export function saveWallet(w: Wallet): boolean {
  try {
    window.localStorage.setItem(KEY, JSON.stringify(w));
    return true;
  } catch {
    return false;
  }
}
