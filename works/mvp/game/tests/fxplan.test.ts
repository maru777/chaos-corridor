import { describe, expect, it } from 'vitest';
import { RARITIES, createRng } from '../src';
import { CUTIN_TIMING } from '../src/view/cutin';
import { ELEMENT_OF, crescentPath, magicCircle, planDark, planWater, planWind, wavePath } from '../src/view/fxplan';
import type { Particle } from '../src/view/fxplan';
import { VOICE_PARAMS, pickVoice } from '../src/view/voice';

const LAYOUT = { width: 800, height: 900, bandTop: 324, bandHeight: 180 };
const T = { totalMs: 3200, impactMs: 850 };

function finiteParticle(p: Particle): void {
  for (const v of [p.x, p.y, p.dx, p.dy, p.size, p.rot, p.delayMs, p.durMs]) expect(Number.isFinite(v)).toBe(true);
  expect(p.size).toBeGreaterThan(0);
  expect(p.durMs).toBeGreaterThan(0);
  expect(p.delayMs).toBeGreaterThanOrEqual(0);
}

describe('属性', () => {
  it('レア度ごとに、違う属性（風・水・闇・雷）が割り当てられている', () => {
    expect(RARITIES.map((r) => ELEMENT_OF[r].id)).toEqual(['wind', 'water', 'dark', 'thunder']);
    expect(new Set(RARITIES.map((r) => ELEMENT_OF[r].label)).size).toBe(4);
  });
});

describe('風', () => {
  it('筋・風の刃・葉があり、位置と時間が有限。刃は画面の外から外へ抜ける', () => {
    for (let seed = 1; seed <= 10; seed++) {
      const plan = planWind(createRng(seed), LAYOUT);
      expect(plan.streaks.length).toBeGreaterThanOrEqual(15);
      expect(plan.blades.length).toBeGreaterThanOrEqual(6);
      expect(plan.leaves.length).toBeGreaterThanOrEqual(10);
      plan.leaves.forEach(finiteParticle);
      for (const s of plan.streaks) {
        expect(s.d.startsWith('M')).toBe(true);
        expect(s.durMs).toBeGreaterThan(0);
        expect(s.width).toBeGreaterThan(0);
      }
      for (const b of plan.blades) {
        expect(b.d.startsWith('M')).toBe(true);
        expect(b.d.endsWith('Z')).toBe(true);
        expect(b.dx).toBeGreaterThan(LAYOUT.width);
        expect(b.durMs).toBeGreaterThan(0);
        expect(b.delayMs).toBeGreaterThanOrEqual(0);
      }
    }
  });

  it('三日月の刃は、尾から先端までが len で、外側の弧のほうが内側より反っている', () => {
    const d = crescentPath(0, 100, 200, 40);
    expect(d).toBe('M0.0 100.0 Q100.0 60.0 200.0 100.0 Q100.0 88.8 0.0 100.0 Z');
  });
});

describe('水', () => {
  it('波紋は見せ場から広がり、泡は有限', () => {
    const plan = planWater(createRng(1), LAYOUT, T);
    expect(plan.ripples).toHaveLength(3);
    for (const r of plan.ripples) {
      expect(r.delayMs).toBeGreaterThanOrEqual(T.impactMs - 100);
      expect(r.maxR).toBeGreaterThan(0);
    }
    plan.bubbles.forEach(finiteParticle);
  });

  it('波の線は、半波長ごとの区間で、最初は M0', () => {
    const d = wavePath(800, 100, 9, 160);
    expect(d.startsWith('M0 100.0')).toBe(true);
    expect(d.split('Q').length - 1).toBe(Math.ceil(800 / 80));
  });
});

describe('闇', () => {
  it('もや・火の粉・蔓・霧がそろい、有限で、蔓は画面の下から伸びる', () => {
    for (let seed = 1; seed <= 10; seed++) {
      const plan = planDark(createRng(seed), LAYOUT);
      expect(plan.wisps.length).toBeGreaterThanOrEqual(15);
      expect(plan.embers.length).toBeGreaterThanOrEqual(10);
      expect(plan.tendrils.length).toBeGreaterThanOrEqual(6);
      expect(plan.fogs).toHaveLength(3);
      plan.wisps.forEach(finiteParticle);
      plan.embers.forEach(finiteParticle);
      for (const v of plan.tendrils) expect(v.d).toContain(` ${LAYOUT.height} C`);
      for (const f of plan.fogs) {
        expect(f.size).toBeGreaterThan(0);
        expect(f.spinMs).toBeGreaterThan(0);
      }
    }
  });

  it('魔法陣: 目盛りは 36 本、六芒星の頂点は円周上にある', () => {
    const c = magicCircle(400, 300, 200);
    expect(c.tickCount).toBe(36);
    expect(c.rings).toEqual([200, 180, 84]);
    const pts = (c.star.match(/-?\d+(\.\d+)?/g) ?? []).map(Number);
    for (let i = 0; i < pts.length; i += 2) {
      const dist = Math.hypot((pts[i] as number) - 400, (pts[i + 1] as number) - 300);
      expect(dist).toBeCloseTo(200 * 0.86, 0);
    }
  });
});

describe('声（技名を読み上げる）', () => {
  it('レア度が高いほど、低く・ゆっくり・力強い（音量は下がらない）', () => {
    const list = RARITIES.map((r) => VOICE_PARAMS[r]);
    for (let i = 1; i < list.length; i++) {
      const prev = list[i - 1];
      const cur = list[i];
      expect(cur?.pitch).toBeLessThan(prev?.pitch ?? 0);
      expect(cur?.rate).toBeLessThan(prev?.rate ?? 0);
      expect(cur?.volume).toBeGreaterThanOrEqual(prev?.volume ?? 0);
    }
    for (const r of RARITIES) {
      const p = VOICE_PARAMS[r];
      expect(p.rate).toBeGreaterThan(0.1);
      expect(p.rate).toBeLessThanOrEqual(2);
      expect(p.pitch).toBeGreaterThan(0);
      expect(p.pitch).toBeLessThanOrEqual(2);
      expect(p.volume).toBeLessThanOrEqual(1);
    }
  });

  it('声は、日本語のうち、Natural / Online → Google → その他の順に選ぶ。日本語がなければ選ばない', () => {
    const v = (name: string, lang: string) => ({ name, lang });
    expect(pickVoice([v('Alex', 'en-US'), v('Microsoft Haruka', 'ja-JP'), v('Microsoft Nanami Online (Natural)', 'ja-JP')])?.name).toBe('Microsoft Nanami Online (Natural)');
    expect(pickVoice([v('Kyoko', 'ja-JP'), v('Google 日本語', 'ja-JP')])?.name).toBe('Google 日本語');
    expect(pickVoice([v('Kyoko', 'ja-JP')])?.name).toBe('Kyoko');
    expect(pickVoice([v('Alex', 'en-US')])).toBeUndefined();
    expect(pickVoice([])).toBeUndefined();
  });
});

describe('演出のそろい', () => {
  it('どのレア度も、演出の長さの中に、名前が決まる時刻がある', () => {
    for (const r of RARITIES) {
      const t = CUTIN_TIMING[r];
      expect(t.impactMs).toBeLessThan(t.totalMs);
    }
  });
});
