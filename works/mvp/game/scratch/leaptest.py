def sub(p, a, b, cnt=1):
    s = open(p, encoding='utf-8').read()
    assert a in s, (p, a[:60])
    open(p, 'w', encoding='utf-8').write(s.replace(a, b, cnt))


p = 'tests/abilities.test.ts'
sub(p, "  it('使うと、跳んだ先に動き、能力が減り、手番が替わる。ゴール行に着けば勝つ', () => {", """  it('壁で囲まれた、出口のない場所には、跳べない（ゴールへの道を失わないように）', () => {
    // (4,2) のマスを、上下左右の壁で囲む。ここに跳ぶと、ゴールへ進めなくなる
    const walls = [W(3, 1, 'h', 1), W(4, 2, 'h', 1), W(3, 2, 'v', 1), W(4, 1, 'v', 1)];
    const s = withAbilities(['leap'], [], { pawns: [{ x: 4, y: 4 }, { x: 0, y: 0 }], walls });
    const targets = legalLeapMoves(s);
    expect(targets.some((p) => p.x === 4 && p.y === 2)).toBe(false);
    expect(targets.some((p) => p.x === 4 && p.y === 6)).toBe(true);
    expect(applyAction(s, { type: 'ability', id: 'leap', to: { x: 4, y: 2 } }).ok).toBe(false);
  });

  it('使うと、跳んだ先に動き、能力が減り、手番が替わる。ゴール行に着けば勝つ', () => {""")
sub(p, "    // 理論値: 60 : 28 : 2 → 約 67% : 31% : 2%\n    expect(count.diagonal / 6000).toBeGreaterThan(0.6);\n    expect(count.jam / 6000).toBeLessThan(0.05);", "    // 理論値: 46 : 31 : 7（この 3 つだけを比べると）→ 約 55% : 37% : 8%\n    expect(count.diagonal / 6000).toBeGreaterThan(0.5);\n    expect(count.jam / 6000).toBeLessThan(0.12);")
