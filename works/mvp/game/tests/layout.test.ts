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
