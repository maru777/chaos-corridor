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

// ---- カメラ: 盤が、画面の「安全な範囲」いっぱいに収まるように、距離と位置を計算で決める ----

/** カメラの視野角（度）。board3d.ts と同じ */
export const CAMERA_FOV = 45;

/** 画面の座標（-1〜1。右と上が正）での、盤を置いてよい範囲。上の表示（プレイヤーカード）と、下の手札・ボタンを避ける */
export interface SafeArea {
  readonly x: number;
  readonly top: number;
  readonly bottom: number;
}

export function safeArea(aspect: number): SafeArea {
  // 縦長（スマホ）: 左右はほぼいっぱい。上は、プレイヤーカード（約 13%）、下は、手札とボタン（約 30%）を避ける
  if (aspect < 1) {
    // 縦長が、ゆるやか（タブレット）になるほど、上の表示が高くなり、下には、余裕ができる。縦長の度合いで、上限・下限をなめらかに変える
    const t = Math.min(1, Math.max(0, (aspect - 0.46) / 0.4));
    return { x: 1, top: 0.74 - t * 0.14, bottom: -0.44 - t * 0.3 };
  }
  // 横長（パソコン）: プレイヤーカードは左右の隅にあるので、上は高く使える。下は、ボタン。手札は左下にあるので、横幅を絞る
  return { x: 0.62, top: 0.8, bottom: -0.86 };
}

export interface CameraRig {
  readonly pos: readonly [number, number, number];
  readonly target: readonly [number, number, number];
  /** 画面の中で、盤の絵を、上（正）か下（負）へずらす量（-1〜1 の座標） */
  readonly shiftNdc: number;
}

const TARGET: readonly [number, number, number] = [0, 0, 0.3];

/** 盤の四隅（縁の外側まで）を、カメラから見た画面の座標（-1〜1）にする */
export function projectBoard(pos: readonly [number, number, number], aspect: number, size = 9): { x: number; y: number }[] {
  const f = [TARGET[0] - pos[0], TARGET[1] - pos[1], TARGET[2] - pos[2]];
  const fl = Math.hypot(f[0] as number, f[1] as number, f[2] as number);
  const fx = (f[0] as number) / fl;
  const fy = (f[1] as number) / fl;
  const fz = (f[2] as number) / fl;
  // 右 = 前 × 上(0,1,0)、上 = 右 × 前
  let rx = fy * 0 - fz * 1;
  let ry = fz * 0 - fx * 0;
  let rz = fx * 1 - fy * 0;
  const rl = Math.hypot(rx, ry, rz);
  rx /= rl;
  ry /= rl;
  rz /= rl;
  const ux = ry * fz - rz * fy;
  const uy = rz * fx - rx * fz;
  const uz = rx * fy - ry * fx;
  const tan = Math.tan((CAMERA_FOV * Math.PI) / 360);
  const half = size / 2 + 0.25;
  return [
    [-half, -half],
    [half, -half],
    [-half, half],
    [half, half],
  ].map(([x, z]) => {
    const vx = (x as number) - pos[0];
    const vy = 0 - pos[1];
    const vz = (z as number) - pos[2];
    const depth = vx * fx + vy * fy + vz * fz;
    return { x: (vx * rx + vy * ry + vz * rz) / depth / (tan * aspect), y: (vx * ux + vy * uy + vz * uz) / depth / tan };
  });
}

/** 画面の縦横比から、カメラの位置を決める。盤が、安全な範囲に、できるだけ大きく収まる距離を探す */
/**
 * 画面に実際に出ている表示（上のプレイヤーカード、下の手札・ボタン）の高さ（ピクセル）から、盤を置いてよい範囲を決める。
 * 表示の大きさは、画面や中身で変わるので、決め打ちにしない。margin は、表示との間のすき間（ピクセル）。
 */
export function safeAreaFromInsets(aspect: number, heightPx: number, topPx: number, bottomPx: number, margin = 8): SafeArea {
  const base = safeArea(aspect);
  const top = 1 - (2 * (topPx + margin)) / heightPx;
  const bottom = -1 + (2 * (bottomPx + margin)) / heightPx;
  // 範囲が狭すぎるときは、決め打ちの値に戻す
  if (!(top - bottom > 0.5)) return base;
  return { x: base.x, top: Math.min(0.97, top), bottom: Math.max(-0.97, bottom) };
}

export function cameraRig(aspect: number, size = 9, safeOverride?: SafeArea, pitchOverrideDeg?: number): CameraRig {
  const pitch = ((pitchOverrideDeg ?? (aspect < 1 ? 80 : 62)) * Math.PI) / 180; // 縦長は真上に近く（押しやすい）、横長は少し寝かせて、奥の宇宙も見せる
  const safe = safeOverride ?? safeArea(aspect);
  const at = (d: number): [number, number, number] => [TARGET[0], TARGET[1] + d * Math.sin(pitch), TARGET[2] + d * Math.cos(pitch)];
  const extent = (d: number) => {
    const pts = projectBoard(at(d), aspect, size);
    const xs = pts.map((p) => p.x);
    const ys = pts.map((p) => p.y);
    return { w: Math.max(...xs) - Math.min(...xs), h: Math.max(...ys) - Math.min(...ys), minY: Math.min(...ys), maxY: Math.max(...ys) };
  };
  const fits = (d: number) => {
    const e = extent(d);
    return e.w <= 2 * safe.x && e.h <= safe.top - safe.bottom;
  };
  let lo = 4;
  let hi = 160;
  for (let i = 0; i < 48; i++) {
    const mid = (lo + hi) / 2;
    if (fits(mid)) hi = mid;
    else lo = mid;
  }
  const e = extent(hi);
  return { pos: at(hi), target: TARGET, shiftNdc: (safe.top + safe.bottom) / 2 - (e.minY + e.maxY) / 2 };
}
