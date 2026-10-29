import { describe, expect, it } from 'vitest';
import { cellToWorld, nearestCell, nearestShortSlot, nearestWallSlot, wallToWorld, worldToBoard } from '../src/view/layout';

describe('座標変換', () => {
  it('中央のマスは原点、角のマスは対称な位置', () => {
    expect(cellToWorld(9, 4, 4)).toEqual({ x: 0, z: 0 });
    expect(cellToWorld(9, 0, 0)).toEqual({ x: -4, z: -4 });
    expect(cellToWorld(9, 8, 8)).toEqual({ x: 4, z: 4 });
  });

  it('壁の中心は、4 マスの角（隣り合うマスの真ん中）', () => {
    expect(wallToWorld(9, 0, 0)).toEqual({ x: -3.5, z: -3.5 });
    expect(wallToWorld(9, 7, 7)).toEqual({ x: 3.5, z: 3.5 });
  });

  it('マスの位置を盤の座標に戻すと、元のマスになる', () => {
    for (let y = 0; y < 9; y++) {
      for (let x = 0; x < 9; x++) {
        const w = cellToWorld(9, x, y);
        const b = worldToBoard(9, w.x, w.z);
        expect(nearestCell(9, b.bx, b.by)).toEqual({ x, y });
      }
    }
  });

  it('盤の外はマスにならない', () => {
    expect(nearestCell(9, -0.6, 3)).toBeNull();
    expect(nearestCell(9, 3, 8.6)).toBeNull();
    expect(nearestCell(9, -0.4, 8.4)).toEqual({ x: 0, y: 8 });
  });

  it('短い壁の置き場所: 横は「行の間の線」と「列」、縦は「列の間の線」と「行」。盤の端に収まる', () => {
    expect(nearestShortSlot(9, 3.1, 3.5, 'h')).toEqual({ line: 3, c: 3 });
    expect(nearestShortSlot(9, 3.1, 3.5, 'v')).toEqual({ line: 3, c: 4 }); // 縦は、x が線、y が行（3.5 → 4 に丸まる）
    expect(nearestShortSlot(9, -2, 20, 'h')).toEqual({ line: 7, c: 0 });
    expect(nearestShortSlot(9, 20, -2, 'h')).toEqual({ line: 0, c: 8 });
    expect(nearestShortSlot(9, 8, 8, 'v')).toEqual({ line: 7, c: 8 });
  });

  it('壁の交点は、マスの間にいちばん近いものになり、盤の端に収まる', () => {
    expect(nearestWallSlot(9, 3.5, 3.5)).toEqual({ x: 3, y: 3 });
    expect(nearestWallSlot(9, 3.9, 3.1)).toEqual({ x: 3, y: 3 });
    expect(nearestWallSlot(9, 4.1, 3.1)).toEqual({ x: 4, y: 3 });
    expect(nearestWallSlot(9, -3, 20)).toEqual({ x: 0, y: 7 });
    expect(nearestWallSlot(9, 20, -3)).toEqual({ x: 7, y: 0 });
  });
});

import { cameraRig, projectBoard, safeArea } from '../src/view/layout';

describe('カメラ: 盤を、安全な範囲いっぱいに大きく', () => {
  const aspects = [0.46, 0.56, 0.75, 0.99, 1.0, 1.33, 1.78, 2.2];

  it('どの縦横比でも、盤の四隅（縁の外側まで）が、安全な範囲に収まる（はみ出さない）', () => {
    for (const aspect of aspects) {
      const rig = cameraRig(aspect);
      const safe = safeArea(aspect);
      for (const p of projectBoard(rig.pos, aspect)) {
        expect(Math.abs(p.x)).toBeLessThanOrEqual(safe.x + 1e-6);
        const y = p.y + rig.shiftNdc;
        expect(y).toBeLessThanOrEqual(safe.top + 1e-6);
        expect(y).toBeGreaterThanOrEqual(safe.bottom - 1e-6);
      }
    }
  });

  it('できるだけ大きい（横か縦の、どちらかが、安全な範囲を 98% 以上使う）', () => {
    for (const aspect of aspects) {
      const rig = cameraRig(aspect);
      const safe = safeArea(aspect);
      const pts = projectBoard(rig.pos, aspect);
      const w = Math.max(...pts.map((p) => p.x)) - Math.min(...pts.map((p) => p.x));
      const h = Math.max(...pts.map((p) => p.y)) - Math.min(...pts.map((p) => p.y));
      const useW = w / (2 * safe.x);
      const useH = h / (safe.top - safe.bottom);
      expect(Math.max(useW, useH)).toBeGreaterThan(0.98);
    }
  });

  it('縦長（スマホ）の盤は、横幅の 85% 以上を使う', () => {
    for (const aspect of [0.46, 0.56, 0.75]) {
      const rig = cameraRig(aspect);
      const pts = projectBoard(rig.pos, aspect);
      const w = Math.max(...pts.map((p) => p.x)) - Math.min(...pts.map((p) => p.x));
      expect(w / 2).toBeGreaterThan(0.85);
    }
  });

  it('横長（パソコン）の盤は、高さの 50% 以上を使う', () => {
    for (const aspect of [1.33, 1.78, 2.2]) {
      const rig = cameraRig(aspect);
      const pts = projectBoard(rig.pos, aspect);
      const h = Math.max(...pts.map((p) => p.y)) - Math.min(...pts.map((p) => p.y));
      expect(h / 2).toBeGreaterThan(0.5);
    }
  });

  it('値が有限で、カメラは盤の上（y が正）、手前（z が正）にある', () => {
    for (const aspect of aspects) {
      const rig = cameraRig(aspect);
      expect(rig.pos.every(Number.isFinite)).toBe(true);
      expect(Number.isFinite(rig.shiftNdc)).toBe(true);
      expect(rig.pos[1]).toBeGreaterThan(0);
      expect(rig.pos[2]).toBeGreaterThan(0);
    }
  });
});
