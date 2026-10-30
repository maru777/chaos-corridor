import { describe, expect, it } from 'vitest';
import { ABILITIES } from '../src/abilities';
import { parseEffect } from '../src/ui/effecttext';

describe('技の説明（効果・手番・制約）', () => {
  it('見出しと本文に分けられる', () => {
    expect(parseEffect('効果：斜めに動く。\n手番：使う。\n制約：なし。')).toEqual([
      { label: '効果', body: '斜めに動く。' },
      { label: '手番', body: '使う。' },
      { label: '制約', body: 'なし。' },
    ]);
  });

  it('見出しのない行は、そのまま本文になる', () => {
    expect(parseEffect('もう一度タップで使う')).toEqual([{ label: null, body: 'もう一度タップで使う' }]);
  });

  it('全ての技が、効果・手番・制約の順で、3 行そろっている（「条件」は使わない）', () => {
    for (const a of ABILITIES) {
      const lines = parseEffect(a.text);
      expect(lines.map((l) => l.label)).toEqual(['効果', '手番', '制約']);
      for (const l of lines) expect(l.body.length).toBeGreaterThan(0);
      expect(a.text).not.toContain('条件');
    }
  });

  it('制約・効果の文言に、障害物の種類（壁・隕石など）を並べない。「障害物」と書く（新しい障害物が増えても、書き直さなくて済む）', () => {
    for (const a of ABILITIES) {
      // 隕石は、「隕石」の技そのものの説明にだけ出てよい。壁は、壁をあつかう技にだけ出てよい
      const lines = parseEffect(a.text);
      const restrict = lines.find((l) => l.label === '制約')?.body ?? '';
      expect(restrict).not.toMatch(/壁・|・隕石|隕石・|相手のコマ・/);
      if (a.id !== 'meteor' && a.id !== 'invert' && a.id !== 'thunder') expect(a.text).not.toContain('隕石');
    }
  });
});
