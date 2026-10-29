import { describe, expect, it } from 'vitest';
import { RARITIES, createRng } from '../src';
import { THUNDER_HITS_MS, boltPoints, planThunder, pointsToPath, usesThunder } from '../src/view/bolt';
import { BAND_HEIGHT_PX, CUTIN_TIMING } from '../src/view/cutin';

const LAYOUT = { width: 800, height: 900, bandTop: 324, bandHeight: 240 };
const LEG = CUTIN_TIMING.LEGENDARY;

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

describe('雷の計画（LEGENDARY）', () => {
  it('雷を使うのは LEGENDARY だけ', () => {
    expect(RARITIES.filter(usesThunder)).toEqual(['LEGENDARY']);
  });

  it('最初に、決まった時刻に、画面の中央付近へ落ちる。最後の 1 発がいちばん太い', () => {
    for (let seed = 1; seed <= 30; seed++) {
      const plan = planThunder(createRng(seed), LAYOUT, LEG.totalMs, LEG.impactMs);
      expect(plan.strikes).toHaveLength(THUNDER_HITS_MS.length);
      plan.strikes.forEach((s, i) => {
        expect(s.main.delayMs).toBe(THUNDER_HITS_MS[i]);
        expect(s.flashDelayMs).toBe(THUNDER_HITS_MS[i]);
        expect(s.branches.length).toBeGreaterThan(0);
        // 始点は画面の上、終点は画面の中央付近（幅の 25%〜75%、高さの半分）
        const nums = s.main.d.match(/-?\d+(\.\d+)?/g)?.map(Number) ?? [];
        const [x0, y0] = [nums[0] as number, nums[1] as number];
        const [x1, y1] = [nums[nums.length - 2] as number, nums[nums.length - 1] as number];
        expect(y0).toBeLessThanOrEqual(0);
        expect(Math.abs(y1 - LAYOUT.height / 2)).toBeLessThan(1);
        expect(x1).toBeGreaterThan(LAYOUT.width * 0.25);
        expect(x1).toBeLessThan(LAYOUT.width * 0.75);
        expect(x0).toBeGreaterThan(0);
      });
      const widths = plan.strikes.map((s) => s.main.width);
      expect(widths[widths.length - 1]).toBe(Math.max(...widths));
    }
  });

  it('雷が全部落ちきってから、帯が出る（帯の出始めが、最後の雷より後）', () => {
    const last = THUNDER_HITS_MS[THUNDER_HITS_MS.length - 1] as number;
    const plan = planThunder(createRng(3), LAYOUT, LEG.totalMs, LEG.impactMs);
    const lastStrike = plan.strikes[plan.strikes.length - 1];
    expect(lastStrike?.main.delayMs).toBe(last);
    expect(LEG.bandDelayMs).toBeGreaterThanOrEqual(last + (lastStrike?.main.durMs ?? 0));
    expect(LEG.impactMs).toBeGreaterThan(LEG.bandDelayMs);
  });

  it('光るタイミングは、演出の長さの中に収まる', () => {
    for (let seed = 1; seed <= 30; seed++) {
      const plan = planThunder(createRng(seed), LAYOUT, LEG.totalMs, LEG.impactMs);
      const all = [...plan.strikes.flatMap((s) => [s.main, ...s.branches]), ...plan.crackles];
      for (const b of all) {
        expect(b.delayMs).toBeGreaterThanOrEqual(0);
        expect(b.delayMs + b.durMs).toBeLessThanOrEqual(LEG.totalMs);
        expect(b.width).toBeGreaterThan(0);
        expect(b.d.startsWith('M')).toBe(true);
      }
    }
  });

  it('帯の縁を走る電気は、帯が出てから光る', () => {
    const plan = planThunder(createRng(9), LAYOUT, LEG.totalMs, LEG.impactMs);
    expect(plan.crackles.length).toBeGreaterThan(0);
    for (const c of plan.crackles) expect(c.delayMs).toBeGreaterThanOrEqual(LEG.bandDelayMs);
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

  it('帯が出てから名前が決まるまで、0.4 秒以上はある（帯が見えてから名前が出る）', () => {
    for (const r of RARITIES) {
      const t = CUTIN_TIMING[r];
      expect(t.bandDelayMs).toBeLessThan(t.impactMs);
    }
    expect(LEG.impactMs - LEG.bandDelayMs).toBeGreaterThanOrEqual(400);
  });
});
