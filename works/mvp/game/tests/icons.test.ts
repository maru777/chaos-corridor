import { describe, expect, it } from 'vitest';
import { ABILITIES } from '../src';
import { ICON_IDS, abilityIconSvg } from '../src/ui/icons';

describe('技のアイコン', () => {
  it('すべての技に、アイコンがある（足し忘れがない）', () => {
    expect(new Set(ICON_IDS)).toEqual(new Set(ABILITIES.map((a) => a.id)));
  });

  it('どのアイコンも、64×64 の SVG で、図形がある。スクリプトや外部の読み込みはない', () => {
    for (const a of ABILITIES) {
      const svg = abilityIconSvg(a.id);
      expect(svg.startsWith('<svg ')).toBe(true);
      expect(svg.endsWith('</svg>')).toBe(true);
      expect(svg).toContain('viewBox="0 0 64 64"');
      expect(/<(path|circle|rect|line)\b/.test(svg)).toBe(true);
      expect(svg).not.toMatch(/<script|onload|onerror|href=|xlink/i);
    }
  });

  it('アイコンどうしは、別の絵（同じ絵が使い回されていない）', () => {
    const all = ABILITIES.map((a) => abilityIconSvg(a.id));
    expect(new Set(all).size).toBe(all.length);
  });

  it('主役の形は、レア度の色（currentColor）で塗れる', () => {
    for (const a of ABILITIES) expect(abilityIconSvg(a.id)).toContain('currentColor');
  });

  it('数値が壊れていない（NaN や undefined が混ざっていない）', () => {
    for (const a of ABILITIES) expect(abilityIconSvg(a.id)).not.toMatch(/NaN|undefined|Infinity/);
  });
});
