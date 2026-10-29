import { describe, expect, it } from 'vitest';
import { PLANETS } from '../src/view/planets';

describe('背景の惑星', () => {
  it('サイズ違いが 5 つ以上あり、大きい物から小さい物まで、幅がある（最大が最小の 4 倍以上）', () => {
    expect(PLANETS.length).toBeGreaterThanOrEqual(5);
    const radii = PLANETS.map((p) => p.radius);
    expect(new Set(radii).size).toBe(radii.length);
    expect(Math.max(...radii) / Math.min(...radii)).toBeGreaterThanOrEqual(4);
  });

  it('輪のある惑星が 1 つ以上ある。輪は、惑星より外側にあり、内側より外側のほうが大きい', () => {
    const ringed = PLANETS.filter((p) => p.ring);
    expect(ringed.length).toBeGreaterThanOrEqual(1);
    for (const p of ringed) {
      expect(p.ring!.inner).toBeGreaterThan(1);
      expect(p.ring!.outer).toBeGreaterThan(p.ring!.inner);
    }
  });

  it('どれも、盤から遠い奥（z が -30 より奥）で、盤の下（y が負）にあり、互いに重ならない', () => {
    for (const p of PLANETS) {
      expect(p.pos[2]).toBeLessThan(-30);
      expect(p.pos[1]).toBeLessThan(0);
    }
    for (let i = 0; i < PLANETS.length; i++) {
      for (let j = i + 1; j < PLANETS.length; j++) {
        const a = PLANETS[i]!;
        const b = PLANETS[j]!;
        const dist = Math.hypot(a.pos[0] - b.pos[0], a.pos[1] - b.pos[1], a.pos[2] - b.pos[2]);
        const ringA = (a.ring ? a.ring.outer : 1) * a.radius;
        const ringB = (b.ring ? b.ring.outer : 1) * b.radius;
        expect(dist).toBeGreaterThan(ringA + ringB);
      }
    }
  });

  it('色は 0〜1 の範囲で、惑星ごとに縞の色が違う。名前も重ならない', () => {
    for (const p of PLANETS) {
      for (const c of [...p.colA, ...p.colB, ...p.rim]) {
        expect(c).toBeGreaterThanOrEqual(0);
        expect(c).toBeLessThanOrEqual(1);
      }
      expect(p.bandFreq).toBeGreaterThan(0);
      expect(p.spin).toBeGreaterThan(0);
    }
    expect(new Set(PLANETS.map((p) => p.colA.join(','))).size).toBe(PLANETS.length);
    expect(new Set(PLANETS.map((p) => p.name)).size).toBe(PLANETS.length);
  });
});
