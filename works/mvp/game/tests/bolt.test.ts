import { describe, expect, it } from 'vitest';
import { RARITIES, createRng } from '../src';
import { BOLT_COUNT, boltPoints, planBolts, pointsToPath } from '../src/view/bolt';
import { BAND_HEIGHT_PX, CUTIN_TIMING } from '../src/view/cutin';

const LAYOUT = { width: 800, height: 900, bandTop: 324, bandHeight: 124 };

describe('稲妻の形', () => {
  it('始点と終点は動かず、点は 2^depth + 1 個', () => {
    const from = { x: 10, y: 20 };
    const to = { x: 700, y: 60 };
    for (const depth of [0, 1, 4, 5]) {
      const pts = boltPoints(createRng(depth + 1), from, to, depth, 30);
      expect(pts).toHaveLength(2 ** depth + 1);
      expect(pts[0]).toEqual(from);
      expect(pts[pts.length - 1]).toEqual(to);
    }
  });

  it('ずれ幅は、指定した大きさの 2 倍を超えない（画面外へ大きく飛び出さない）', () => {
    const jitter = 40;
    for (let seed = 1; seed <= 50; seed++) {
      const pts = boltPoints(createRng(seed), { x: 0, y: 100 }, { x: 600, y: 100 }, 5, jitter);
      for (const p of pts) {
        expect(Number.isFinite(p.x) && Number.isFinite(p.y)).toBe(true);
        expect(Math.abs(p.y - 100)).toBeLessThanOrEqual(jitter * 2);
        expect(p.x).toBeGreaterThanOrEqual(0 - 1e-9);
        expect(p.x).toBeLessThanOrEqual(600 + 1e-9);
      }
    }
  });

  it('同じ種なら同じ形、違う種なら違う形', () => {
    const a = pointsToPath(boltPoints(createRng(1), { x: 0, y: 0 }, { x: 100, y: 0 }, 4, 20));
    const b = pointsToPath(boltPoints(createRng(1), { x: 0, y: 0 }, { x: 100, y: 0 }, 4, 20));
    const c = pointsToPath(boltPoints(createRng(2), { x: 0, y: 0 }, { x: 100, y: 0 }, 4, 20));
    expect(a).toBe(b);
    expect(a).not.toBe(c);
    expect(a.startsWith('M')).toBe(true);
  });
});

describe('稲妻の計画', () => {
  it('レア度が高いほど本数が多い', () => {
    const counts = RARITIES.map((r) => BOLT_COUNT[r]);
    expect(counts).toEqual([...counts].sort((a, b) => a - b));
    expect(new Set(counts).size).toBe(4);
    for (const r of RARITIES) {
      const t = CUTIN_TIMING[r];
      expect(planBolts(r, createRng(5), LAYOUT, t.totalMs, t.impactMs)).toHaveLength(BOLT_COUNT[r]);
    }
  });

  it('光るタイミングは、演出の長さの中に収まり、光り終わりも演出の中', () => {
    for (const r of RARITIES) {
      const t = CUTIN_TIMING[r];
      for (let seed = 1; seed <= 20; seed++) {
        for (const b of planBolts(r, createRng(seed), LAYOUT, t.totalMs, t.impactMs)) {
          expect(b.delayMs).toBeGreaterThanOrEqual(0);
          expect(b.delayMs + b.durMs).toBeLessThanOrEqual(t.totalMs);
          expect(b.width).toBeGreaterThan(0);
          expect(b.d.startsWith('M')).toBe(true);
        }
      }
    }
  });

  it('画面の上下から落ちる稲妻は、EPIC 以上だけ', () => {
    const touchesEdge = (r: (typeof RARITIES)[number]) => {
      const t = CUTIN_TIMING[r];
      let found = false;
      for (let seed = 1; seed <= 30; seed++) {
        for (const b of planBolts(r, createRng(seed), LAYOUT, t.totalMs, t.impactMs)) {
          const first = b.d.split(' ').slice(0, 2).join(' '); // 'Mx y'
          if (first.endsWith(' 0.0') || first.endsWith(` ${LAYOUT.height.toFixed(1)}`)) found = true;
        }
      }
      return found;
    };
    expect(touchesEdge('UNCOMMON')).toBe(false);
    expect(touchesEdge('RARE')).toBe(false);
    expect(touchesEdge('EPIC')).toBe(true);
    expect(touchesEdge('LEGENDARY')).toBe(true);
  });
});

describe('カットインの長さ', () => {
  it('レア度が高いほど長く、帯も大きい', () => {
    const totals = RARITIES.map((r) => CUTIN_TIMING[r].totalMs);
    expect(totals).toEqual([...totals].sort((a, b) => a - b));
    const bands = RARITIES.map((r) => BAND_HEIGHT_PX[r]);
    expect(bands).toEqual([...bands].sort((a, b) => a - b));
  });

  it('名前が決まってから、1.2 秒以上は画面に残る（読める）', () => {
    for (const r of RARITIES) {
      const t = CUTIN_TIMING[r];
      expect(t.impactMs).toBeGreaterThan(0);
      expect(t.totalMs - t.impactMs).toBeGreaterThanOrEqual(1200);
    }
  });
});
