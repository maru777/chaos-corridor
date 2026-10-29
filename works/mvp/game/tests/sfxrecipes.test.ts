import { describe, expect, it } from 'vitest';
import { createRng } from '../src';
import { MOVE_RECIPES, WALL_RECIPES, pickVariant, pitchJitter, playerPitch } from '../src/view/sfxrecipes';
import type { SfxRecipe } from '../src/view/sfxrecipes';

const all: readonly [string, readonly SfxRecipe[]][] = [
  ['移動', MOVE_RECIPES],
  ['壁', WALL_RECIPES],
];

describe('効果音の作り方（データ）', () => {
  it('移動も壁も、複数の音がある（移動 5 種類以上、壁 5 種類以上）。名前は重ならない', () => {
    expect(MOVE_RECIPES.length).toBeGreaterThanOrEqual(5);
    expect(WALL_RECIPES.length).toBeGreaterThanOrEqual(5);
    for (const [, recipes] of all) expect(new Set(recipes.map((r) => r.name)).size).toBe(recipes.length);
  });

  it('どの音も、部品の値が正しい（周波数は正、長さは短い、大きさは 0〜1）', () => {
    for (const [, recipes] of all) {
      for (const r of recipes) {
        expect(r.voices.length).toBeGreaterThan(0);
        for (const v of r.voices) {
          expect(v.from).toBeGreaterThan(0);
          expect(v.to).toBeGreaterThan(0);
          expect(v.at).toBeGreaterThanOrEqual(0);
          expect(v.dur).toBeGreaterThan(0);
          expect(v.vol).toBeGreaterThan(0);
          expect(v.vol).toBeLessThanOrEqual(1);
          if (v.kind === 'tone') expect(v.wave).toBeDefined();
        }
      }
    }
  });

  it('操作の邪魔にならない長さ（どの音も 0.5 秒以内に終わる）', () => {
    for (const [, recipes] of all) {
      for (const r of recipes) {
        const end = Math.max(...r.voices.map((v) => v.at + v.dur));
        expect(end).toBeLessThanOrEqual(0.5);
      }
    }
  });

  it('壁の音は、移動の音より、重く（低く）て大きい', () => {
    const lowest = (recipes: readonly SfxRecipe[]) => Math.min(...recipes.flatMap((r) => r.voices.filter((v) => v.kind === 'tone').map((v) => Math.min(v.from, v.to))));
    const loudest = (recipes: readonly SfxRecipe[]) => Math.max(...recipes.flatMap((r) => r.voices.map((v) => v.vol)));
    expect(lowest(WALL_RECIPES)).toBeLessThan(lowest(MOVE_RECIPES));
    expect(loudest(WALL_RECIPES)).toBeGreaterThan(loudest(MOVE_RECIPES));
  });
});

describe('ランダムな選び方', () => {
  it('前回と同じ音は選ばない（何回やっても）', () => {
    const rng = createRng(1);
    let last = -1;
    for (let i = 0; i < 2000; i++) {
      const next = pickVariant(6, last, rng);
      expect(next).not.toBe(last);
      expect(next).toBeGreaterThanOrEqual(0);
      expect(next).toBeLessThan(6);
      last = next;
    }
  });

  it('すべての音が、まんべんなく選ばれる', () => {
    const rng = createRng(2);
    const counts = new Array<number>(6).fill(0);
    let last = -1;
    for (let i = 0; i < 6000; i++) {
      last = pickVariant(6, last, rng);
      counts[last] = (counts[last] ?? 0) + 1;
    }
    for (const c of counts) {
      expect(c).toBeGreaterThan(800);
      expect(c).toBeLessThan(1200);
    }
  });

  it('音が 1 つだけなら、それを返す', () => {
    expect(pickVariant(1, 0, createRng(1))).toBe(0);
    expect(pickVariant(0, -1, createRng(1))).toBe(0);
  });

  it('高さのばらつきは ±6% 以内。先手は高め、後手は低め', () => {
    const rng = createRng(3);
    for (let i = 0; i < 500; i++) {
      const j = pitchJitter(rng);
      expect(j).toBeGreaterThanOrEqual(0.94 - 1e-9);
      expect(j).toBeLessThanOrEqual(1.06 + 1e-9);
    }
    expect(playerPitch(0)).toBeGreaterThan(playerPitch(1));
  });
});
