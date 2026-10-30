import { describe, expect, it } from 'vitest';
import { applyAction, createRng, dealGame, legalActions, newGame, randomInt, stateHash } from '../src';
import type { Action, GameState } from '../src';
import { Room, applyRemote, isRoomCode, newRoomCode, parseMsg, relayUrl } from '../src/online';
import type { SocketLike } from '../src/online';

class FakeSocket implements SocketLike {
  readyState = 1;
  onmessage: ((e: { data: unknown }) => void) | null = null;
  onclose: ((e: { reason?: string; wasClean?: boolean }) => void) | null = null;
  onerror: (() => void) | null = null;
  sent: string[] = [];
  send(d: string): void {
    this.sent.push(d);
  }
  close(): void {
    this.readyState = 3;
  }
  push(obj: unknown): void {
    this.onmessage?.({ data: JSON.stringify(obj) });
  }
}

describe('ルームコード・接続先', () => {
  it('4 桁の数字だけがコードになる。作るコードは、先頭が 0 でも 4 桁', () => {
    expect(isRoomCode('0042')).toBe(true);
    for (const bad of ['', '123', '12345', 'abcd', '12 3']) expect(isRoomCode(bad)).toBe(false);
    expect(newRoomCode(() => 0.0042)).toBe('0042');
    expect(isRoomCode(newRoomCode())).toBe(true);
  });

  it('接続先は、既定のほか、?relay= で上書きできる。ws:// か wss:// 以外は、使わない', () => {
    expect(relayUrl('')).toContain('wss://');
    expect(relayUrl('?relay=ws://localhost:8787/')).toBe('ws://localhost:8787');
    expect(relayUrl('?relay=javascript:alert(1)')).toContain('wss://');
  });
});

describe('メッセージの検証', () => {
  it('正しい形だけを通す', () => {
    expect(parseMsg({ k: 'start', seed: 5, weapons: true })).toEqual({ k: 'start', seed: 5, weapons: true });
    expect(parseMsg({ k: 'pick', id: 'atkLaser' })).toEqual({ k: 'pick', id: 'atkLaser' });
    expect(parseMsg({ k: 'act', a: { type: 'move', to: { x: 1, y: 2 } }, h: 'abc' })?.k).toBe('act');
    expect(parseMsg({ k: 'bye' })).toEqual({ k: 'bye' });
  });

  it('形が違うものは、捨てる', () => {
    for (const bad of [null, 5, 'x', {}, { k: 'start', seed: -1, weapons: true }, { k: 'start', seed: 1.5, weapons: true }, { k: 'start', seed: 5 }, { k: 'pick', id: 'nope' }, { k: 'act', a: 3, h: 'x' }, { k: 'act', a: { type: 'move' } }, { k: 'zzz' }]) {
      expect(parseMsg(bad)).toBeNull();
    }
  });
});

describe('Room（偽の中継で）', () => {
  it('welcome で座席を受け取り、相手の入退室・メッセージを知らせる。形の違う d は捨てる', () => {
    const sock = new FakeSocket();
    const room = new Room('1234', 'ws://x', () => sock);
    const log: string[] = [];
    room.onwelcome = (seat, peers) => log.push(`welcome ${seat} ${peers}`);
    room.onpeerjoin = () => log.push('join');
    room.onpeerleave = () => log.push('leave');
    room.onmessage = (m) => log.push(`msg ${m.k}`);
    sock.push({ v: 1, t: 'welcome', seat: 1, peers: 1 });
    sock.push({ v: 1, t: 'peer-join', seat: 0 });
    sock.push({ v: 1, t: 'msg', from: 0, d: { k: 'bye' } });
    sock.push({ v: 1, t: 'msg', from: 0, d: { k: 'unknown' } });
    sock.push({ v: 2, t: 'peer-leave', seat: 0 }); // 版が違う
    sock.push({ v: 1, t: 'peer-leave', seat: 0 });
    expect(log).toEqual(['welcome 1 1', 'join', 'msg bye', 'leave']);
    expect(room.seat).toBe(1);
    room.send({ k: 'bye' });
    expect(JSON.parse(sock.sent[0] as string)).toEqual({ v: 1, t: 'msg', d: { k: 'bye' } });
  });

  it('切れたら、理由つきで知らせる。自分で閉じたときは、知らせない', () => {
    const sock = new FakeSocket();
    const room = new Room('1234', 'ws://x', () => sock);
    let reason = '';
    room.onclose = (r) => (reason = r);
    sock.onclose?.({ wasClean: false });
    expect(reason).toBe('lost');
    const s2 = new FakeSocket();
    const r2 = new Room('1234', 'ws://x', () => s2);
    let called = false;
    r2.onclose = () => (called = true);
    r2.close();
    s2.onclose?.({ wasClean: true });
    expect(called).toBe(false);
  });
});

describe('手の受け渡しと同期', () => {
  it('2 つの画面が、手だけを送り合っても、毎手、同じ状態になる（攻撃技・罠あり、100 手）', () => {
    const seed = 12;
    const offers = dealGame(seed).offers;
    const attacks: [typeof offers[0][0] | null, typeof offers[1][0] | null] = [offers[0][0] ?? null, offers[1][1] ?? null];
    let a: GameState = newGame(seed, attacks);
    let b: GameState = newGame(seed, attacks);
    const rng = createRng(3);
    for (let i = 0; i < 100 && a.winner === null; i++) {
      const mover = a.turn;
      const acts = legalActions(a);
      const act = acts[randomInt(rng, acts.length)] as Action;
      const r = applyAction(a, act);
      if (!r.ok) throw new Error(r.reason);
      a = r.state;
      // 相手の画面へは、手とハッシュだけが渡る（JSON を通して）
      const wire = JSON.parse(JSON.stringify({ a: act, h: stateHash(a) })) as { a: Action; h: string };
      const got = applyRemote(b, mover, wire.a, wire.h);
      if (!got.ok) throw new Error(`${i} 手目: ${got.reason}`);
      b = got.state;
      expect(stateHash(b)).toBe(stateHash(a));
    }
  });

  it('順番違い・反則・ハッシュのずれ・壊れた手は、はじく', () => {
    const s = newGame(1);
    const ok = applyAction(s, { type: 'move', to: { x: 4, y: 7 } });
    if (!ok.ok) throw new Error('setup');
    const h = stateHash(ok.state);
    expect(applyRemote(s, 0, { type: 'move', to: { x: 4, y: 7 } }, h).ok).toBe(true);
    expect(applyRemote(s, 1, { type: 'move', to: { x: 4, y: 7 } }, h)).toEqual({ ok: false, reason: '相手の番ではない' });
    expect(applyRemote(s, 0, { type: 'move', to: { x: 4, y: 7 } }, 'deadbeef')).toEqual({ ok: false, reason: '状態がずれた' });
    expect(applyRemote(s, 0, { type: 'move', to: { x: 0, y: 0 } }, h).ok).toBe(false);
    expect(applyRemote(s, 0, { type: 'nonsense' } as unknown as Action, h).ok).toBe(false);
    expect(applyRemote({ ...s, winner: 0 }, 0, { type: 'move', to: { x: 4, y: 7 } }, h).ok).toBe(false);
  });
});
