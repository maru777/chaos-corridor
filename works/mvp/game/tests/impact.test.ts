import { describe, expect, it } from 'vitest';
import { RARITIES } from '../src';
import { THUNDER_HITS_MS } from '../src/view/bolt';
import { IMPACT_TAIL_MS, impactFrame } from '../src/view/impact';

const IMPACT = 2500;

describe('衝撃の演出の強さ', () => {
  it('どのレア度も、終わった後は全部 0（時間の進みは通常）に戻る', () => {
    for (const r of RARITIES) {
      const f = impactFrame(r, IMPACT + IMPACT_TAIL_MS + 1, IMPACT);
      expect(f.glow).toBe(0);
      expect(f.zoomDeg).toBe(0);
      expect(f.shake).toBe(0);
      expect(f.timeScale).toBe(1);
    }
  });

  it('どの時点でも、値は有限で、負にならない', () => {
    for (const r of RARITIES) {
      for (let t = 0; t <= 4000; t += 25) {
        const f = impactFrame(r, t, IMPACT);
        for (const v of [f.glow, f.zoomDeg, f.shake]) {
          expect(Number.isFinite(v)).toBe(true);
          expect(v).toBeGreaterThanOrEqual(0);
        }
        expect(f.timeScale).toBeGreaterThan(0);
        expect(f.timeScale).toBeLessThanOrEqual(1);
      }
    }
  });

  it('レア度が高いほど、衝撃の瞬間の光・揺れが強い', () => {
    const at = (r: (typeof RARITIES)[number]) => impactFrame(r, IMPACT + 1, IMPACT);
    // 光は、衝撃のまわりで最も強くなった値（ピーク）で比べる
    const peak = (r: (typeof RARITIES)[number]) => Math.max(...Array.from({ length: 100 }, (_, i) => impactFrame(r, IMPACT - 100 + i * 10, IMPACT).glow));
    const glows = RARITIES.map((r) => peak(r));
    expect(glows).toEqual([...glows].sort((a, b) => a - b));
    expect(new Set(glows).size).toBe(4);
    expect(at('UNCOMMON').shake).toBe(0);
    expect(at('RARE').shake).toBe(0);
    expect(at('EPIC').shake).toBeGreaterThan(0);
    expect(at('LEGENDARY').shake).toBeGreaterThan(at('EPIC').shake);
  });

  it('LEGENDARY だけが、スローになり、衝撃に向けてじわじわズームする', () => {
    for (const r of ['UNCOMMON', 'RARE', 'EPIC'] as const) expect(impactFrame(r, 500, IMPACT).timeScale).toBe(1);
    expect(impactFrame('LEGENDARY', 500, IMPACT).timeScale).toBeLessThan(1);
    const early = impactFrame('LEGENDARY', 200, IMPACT).zoomDeg;
    const mid = impactFrame('LEGENDARY', 600, IMPACT).zoomDeg;
    const peak = impactFrame('LEGENDARY', IMPACT, IMPACT).zoomDeg;
    expect(early).toBeLessThan(mid);
    expect(mid).toBeLessThan(peak);
    expect(impactFrame('LEGENDARY', IMPACT + 400, IMPACT).timeScale).toBeLessThan(1);
    expect(impactFrame('LEGENDARY', IMPACT + 700, IMPACT).timeScale).toBe(1);
  });

  it('「視差効果を減らす」設定では、揺れ・ズーム・スローをなくし、光も弱める', () => {
    for (const r of RARITIES) {
      for (let t = 0; t <= 3000; t += 50) {
        const normal = impactFrame(r, t, IMPACT);
        const reduced = impactFrame(r, t, IMPACT, true);
        expect(reduced.shake).toBe(0);
        expect(reduced.zoomDeg).toBe(0);
        expect(reduced.timeScale).toBe(1);
        expect(reduced.glow).toBeLessThanOrEqual(normal.glow);
      }
    }
  });
});
