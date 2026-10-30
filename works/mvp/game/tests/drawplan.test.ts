import { describe, expect, it } from 'vitest';
import { RARITIES } from '../src/abilities';
import { createRng } from '../src/rng';
import { RAIN_COUNT, drawTiming, drawTotalMs, planDraw } from '../src/ui/drawplan';

describe('技を引く演出の計画', () => {
  it('カードは大量にあり、位置は場の中に収まる', () => {
    for (let seed = 1; seed <= 50; seed++) {
      const p = planDraw('RARE', createRng(seed));
      expect(p.cards.length).toBe(RAIN_COUNT);
      expect(RAIN_COUNT).toBeGreaterThanOrEqual(30);
      for (const c of p.cards) {
        expect(c.x).toBeGreaterThan(6);
        expect(c.x).toBeLessThan(94);
        expect(c.y).toBeGreaterThan(20);
        expect(c.y).toBeLessThan(90);
        expect(c.delay).toBeGreaterThanOrEqual(0);
        expect(c.fall).toBeGreaterThan(0);
      }
    }
  });

  it('同じ乱数なら、同じ計画。違う乱数なら、散らし方が変わる', () => {
    expect(planDraw('RARE', createRng(5))).toEqual(planDraw('RARE', createRng(5)));
    expect(planDraw('RARE', createRng(5)).cards).not.toEqual(planDraw('RARE', createRng(6)).cards);
  });

  it('レア度が高いほど、ためも演出も長い。レジェンドがいちばん長い', () => {
    for (let i = 1; i < RARITIES.length; i++) {
      const lo = RARITIES[i - 1] as (typeof RARITIES)[number];
      const hi = RARITIES[i] as (typeof RARITIES)[number];
      expect(drawTiming(hi).buildMs).toBeGreaterThanOrEqual(drawTiming(lo).buildMs);
      expect(drawTiming(hi).revealMs).toBeGreaterThan(drawTiming(lo).revealMs);
      expect(drawTotalMs(hi)).toBeGreaterThan(drawTotalMs(lo));
    }
    expect(drawTotalMs('LEGENDARY')).toBeLessThan(10000);
  });
});
