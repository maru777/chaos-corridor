import { describe, expect, it } from 'vitest';
import { createRng } from '../src';
import { POP_TEXT, popLayout } from '../src/view/popsfx';
import { MOVE_RECIPES, WALL_RECIPES } from '../src/view/sfxrecipes';

describe('ふだんの操作の擬音', () => {
  it('壁は「ドン!」、コマは「タッ!」、勝負がついたら「ドォォォン!!」', () => {
    expect(POP_TEXT.wall).toBe('ドン!');
    expect(POP_TEXT.move).toBe('タッ!');
    expect(POP_TEXT.win).toBe('ドォォォン!!');
  });

  it('鳴らした効果音の名前を渡すと、その名前に「!」を付けた文字になる。渡さなければ、決まった文字', () => {
    expect(popLayout('move', 400, 500, 800, 900, createRng(1), 'コツ').text).toBe('コツ!');
    expect(popLayout('wall', 400, 500, 800, 900, createRng(1), 'ガンッ').text).toBe('ガンッ!');
    expect(popLayout('wall', 400, 500, 800, 900, createRng(1)).text).toBe(POP_TEXT.wall);
  });

  it('すべての効果音の名前が、擬音の文字になれる（空でなく、短い）', () => {
    for (const r of [...MOVE_RECIPES, ...WALL_RECIPES]) {
      const t = popLayout('move', 400, 500, 800, 900, createRng(1), r.name).text;
      expect(t.endsWith('!')).toBe(true);
      expect(t.length).toBeGreaterThan(1);
      expect(t.length).toBeLessThanOrEqual(6);
    }
  });

  it('壁・コマは、その場所の少し上に出る（本物が隠れない）', () => {
    const wall = popLayout('wall', 400, 500, 800, 900, createRng(1));
    const move = popLayout('move', 400, 500, 800, 900, createRng(1));
    expect(wall.y).toBeLessThan(500);
    expect(move.y).toBeLessThan(500);
    expect(wall.x).toBe(400);
  });

  it('画面の端でも、爆発がはみ出さない', () => {
    for (const [x, y] of [[0, 0], [800, 900], [5, 880], [790, 10], [-50, 2000]] as const) {
      for (const kind of ['wall', 'move', 'win'] as const) {
        const l = popLayout(kind, x, y, 800, 900, createRng(2));
        const half = (l.size * 3.4) / 2;
        expect(l.x - half).toBeGreaterThanOrEqual(-1e-6);
        expect(l.x + half).toBeLessThanOrEqual(800 + 1e-6);
        expect(l.y - half).toBeGreaterThanOrEqual(-1e-6);
        expect(l.y + half).toBeLessThanOrEqual(900 + 1e-6);
      }
    }
  });

  it('勝負がついたときは、画面の上寄りの中央に、いちばん大きく、いちばん長く出る', () => {
    const win = popLayout('win', 0, 0, 800, 900, createRng(3));
    expect(win.x).toBe(400);
    expect(win.y).toBe(270);
    const wall = popLayout('wall', 400, 500, 800, 900, createRng(3));
    expect(win.size).toBeGreaterThan(wall.size);
    expect(win.durMs).toBeGreaterThan(wall.durMs);
  });

  it('狭い画面では小さくなるが、小さくなりすぎない', () => {
    const narrow = popLayout('wall', 180, 300, 360, 700, createRng(4));
    const wide = popLayout('wall', 400, 500, 800, 900, createRng(4));
    expect(narrow.size).toBeLessThan(wide.size);
    expect(narrow.size).toBeGreaterThanOrEqual(22);
  });
});
