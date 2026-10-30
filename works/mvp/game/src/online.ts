import { applyAction, stateHash } from './index';
import type { Action, AttackId, GameState, PlayerId } from './index';

/**
 * オンライン対戦の通信層。ippai-games の中継サーバー（Cloudflare Workers）をそのまま使う。
 * 中継は、2 人 1 組のルーム（4 桁の数字）で、メッセージを届けるだけ。ゲームの判定は、両方のブラウザが、同じルールで行う。
 * 送るのは、手（act）だけ。手を送るときに、打ったあとの状態のハッシュも付けて、受け取った側が、同じ状態になったかを確かめる。
 * 画面には依存しない（テストでは、偽の WebSocket を渡す）。
 */

/** ippai-games の中継（ippai-games と同じものを使う） */
export const DEFAULT_RELAY_URL = 'wss://ippai-games-relay.maru777-jp.workers.dev';

const PROTOCOL = 1;

/** URL の ?relay=ws://localhost:8787 で、接続先を一時的に変えられる。使えない値なら、既定を使う */
export function relayUrl(search: string = window.location.search): string {
  const q = new URLSearchParams(search).get('relay');
  const url = q !== null && /^wss?:\/\//.test(q) ? q : DEFAULT_RELAY_URL;
  return url.replace(/\/$/, '');
}

export function isRoomCode(text: string): boolean {
  return /^\d{4}$/.test(text);
}

/** 4 桁の数字のルームコードを作る（先頭が 0 でも、4 桁） */
export function newRoomCode(random: () => number = Math.random): string {
  return String(Math.floor(random() * 10000)).padStart(4, '0');
}

/** 手や状態のやりとり（中継の d の中身）。ここに無い形は、捨てる */
export type OnlineMsg =
  /** 部屋を作った人が、対局の種と、WEAPON の あり / なし を決めて知らせる */
  | { readonly k: 'start'; readonly seed: number; readonly weapons: boolean }
  /** 選んだ WEAPON */
  | { readonly k: 'pick'; readonly id: AttackId }
  /** 打った手と、打ったあとの状態のハッシュ */
  | { readonly k: 'act'; readonly a: Action; readonly h: string }
  /** 対局をやめた */
  | { readonly k: 'bye' };

const ATTACK_IDS: readonly string[] = ['atkMeteor', 'atkLaser', 'atkShock', 'atkFreeze', 'atkBomb', 'atkSwarm', 'atkPlunder', 'atkSwap', 'atkGale', 'atkMines'];

function isObj(v: unknown): v is Record<string, unknown> {
  return typeof v === 'object' && v !== null;
}

/** 受け取った d を、メッセージに直す。形が違えば null */
export function parseMsg(d: unknown): OnlineMsg | null {
  if (!isObj(d)) return null;
  switch (d['k']) {
    case 'start': {
      const seed = d['seed'];
      if (typeof seed !== 'number' || !Number.isInteger(seed) || seed <= 0 || seed > 0xffffffff || typeof d['weapons'] !== 'boolean') return null;
      return { k: 'start', seed, weapons: d['weapons'] };
    }
    case 'pick':
      return typeof d['id'] === 'string' && ATTACK_IDS.includes(d['id']) ? { k: 'pick', id: d['id'] as AttackId } : null;
    case 'act':
      return isObj(d['a']) && typeof d['a']['type'] === 'string' && typeof d['h'] === 'string' ? { k: 'act', a: d['a'] as unknown as Action, h: d['h'] } : null;
    case 'bye':
      return { k: 'bye' };
    default:
      return null;
  }
}

/** 相手の手を受け取って、状態を進める。反則・順番違い・状態のずれは、理由を返す */
export function applyRemote(state: GameState, remoteSeat: PlayerId, a: Action, h: string): { ok: true; state: GameState } | { ok: false; reason: string } {
  if (state.winner !== null) return { ok: false, reason: '勝負はついている' };
  if (state.turn !== remoteSeat) return { ok: false, reason: '相手の番ではない' };
  let r;
  try {
    r = applyAction(state, a);
  } catch {
    return { ok: false, reason: '手の形が正しくない' };
  }
  if (!r.ok) return { ok: false, reason: r.reason };
  if (stateHash(r.state) !== h) return { ok: false, reason: '状態がずれた' };
  return { ok: true, state: r.state };
}

/** 中継との接続。使うのは、WebSocket のうち、これだけ */
export interface SocketLike {
  readonly readyState: number;
  onmessage: ((e: { data: unknown }) => void) | null;
  onclose: ((e: { reason?: string; wasClean?: boolean }) => void) | null;
  onerror: (() => void) | null;
  send(data: string): void;
  close(): void;
}

export type SocketFactory = (url: string) => SocketLike;

const OPEN = 1;

export class Room {
  seat = -1;
  /** 自分が入った時点で、すでに部屋にいた人の数 */
  peers = 0;
  open = false;
  onwelcome: ((seat: number, peers: number) => void) | null = null;
  onpeerjoin: (() => void) | null = null;
  onpeerleave: (() => void) | null = null;
  onmessage: ((m: OnlineMsg) => void) | null = null;
  onclose: ((reason: string) => void) | null = null;
  private ws: SocketLike;

  constructor(
    readonly code: string,
    base: string = relayUrl(),
    make: SocketFactory = (url) => new WebSocket(url) as unknown as SocketLike,
  ) {
    this.ws = make(`${base}/room/${code}`);
    this.ws.onmessage = (e) => this.recv(e.data);
    this.ws.onclose = (e) => {
      this.open = false;
      this.onclose?.(e.reason || (e.wasClean === true ? 'closed' : 'lost'));
    };
    this.ws.onerror = () => undefined; // 詳細は onclose で受ける
  }

  private recv(raw: unknown): void {
    let m: unknown;
    try {
      m = typeof raw === 'string' ? JSON.parse(raw) : null;
    } catch {
      return;
    }
    if (!isObj(m) || m['v'] !== PROTOCOL) return;
    if (m['t'] === 'welcome' && typeof m['seat'] === 'number') {
      this.seat = m['seat'];
      this.peers = typeof m['peers'] === 'number' ? m['peers'] : 0;
      this.open = true;
      this.onwelcome?.(this.seat, this.peers);
    } else if (m['t'] === 'peer-join') this.onpeerjoin?.();
    else if (m['t'] === 'peer-leave') this.onpeerleave?.();
    else if (m['t'] === 'msg') {
      const msg = parseMsg(m['d']);
      if (msg !== null) this.onmessage?.(msg);
    }
  }

  send(d: OnlineMsg): void {
    if (this.ws.readyState === OPEN) this.ws.send(JSON.stringify({ v: PROTOCOL, t: 'msg', d }));
  }

  close(): void {
    this.onclose = null;
    this.open = false;
    this.ws.close();
  }
}
