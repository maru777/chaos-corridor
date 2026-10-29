import type { Pos } from '../types';

/** 画面の座標と盤の座標の変換（描画から切り離した計算だけ。テストできる） */

export interface Point2 {
  readonly x: number;
  readonly z: number;
}

function offset(size: number): number {
  return (size - 1) / 2;
}

/** マス (x, y) の中心の、3D 空間での位置。盤の中心が原点 */
export function cellToWorld(size: number, x: number, y: number): Point2 {
  return { x: x - offset(size), z: y - offset(size) };
}

/** 壁の交点 (x, y) の壁の中心。4 マスの角に当たる */
export function wallToWorld(size: number, x: number, y: number): Point2 {
  return cellToWorld(size, x + 0.5, y + 0.5);
}

/** 3D 空間の位置を、盤の座標（マスの中心が整数）に直す */
export function worldToBoard(size: number, wx: number, wz: number): { bx: number; by: number } {
  return { bx: wx + offset(size), by: wz + offset(size) };
}

/** 盤の座標から、いちばん近いマス。盤の外（半マス以上外）なら null */
export function nearestCell(size: number, bx: number, by: number): Pos | null {
  // + 0 は、-0 を 0 にそろえるため（状態のハッシュや比較で別物にならないように）
  const x = Math.round(bx) + 0;
  const y = Math.round(by) + 0;
  if (x < 0 || y < 0 || x >= size || y >= size) return null;
  return { x, y };
}

/**
 * 短い壁（1 マス分）の置き場所: 向き o の壁が通る線（line）と、その線の上の何番目のマス（c）か。
 * h は、行 line と line+1 の間の、列 c。v は、列 line と line+1 の間の、行 c。
 */
export function nearestShortSlot(size: number, bx: number, by: number, o: 'h' | 'v'): { line: number; c: number } {
  const clamp = (v: number, hi: number) => Math.min(hi, Math.max(0, v));
  const along = o === 'h' ? bx : by;
  const across = o === 'h' ? by : bx;
  return { line: clamp(Math.round(across - 0.5) + 0, size - 2), c: clamp(Math.round(along) + 0, size - 1) };
}

/** 盤の座標から、いちばん近い壁の交点（0..size-2 に収める） */
export function nearestWallSlot(size: number, bx: number, by: number): Pos {
  const clamp = (v: number) => Math.min(size - 2, Math.max(0, v));
  return { x: clamp(Math.round(bx - 0.5)), y: clamp(Math.round(by - 0.5)) };
}
