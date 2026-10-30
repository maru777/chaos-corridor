def sub(p, a, b, cnt=1):
    s = open(p, encoding='utf-8').read()
    assert a in s, (p, a[:60])
    open(p, 'w', encoding='utf-8').write(s.replace(a, b, cnt))


p = 'src/ui/draw.ts'
sub(p, "  const dx = cx - fr.width / 2;\n  const dy = cy - fr.height * 0.44;", """  // 決まったカードは、上に置いたカード（2 枚目のとき）と、下の技名の札の間に収めて、重ならないようにする
  const parkedBottom = nth > 1 ? fr.height * 0.09 + 172 + 12 : fr.height * 0.12;
  const slabTop = fr.height * 0.97 - 250;
  const avail = Math.max(160, slabTop - parkedBottom);
  const centerY = parkedBottom + avail / 2;
  const endDy = centerY - fr.height * 0.42; // めくるカードは、画面の高さの 42% が、もとの中心
  const dx = cx - fr.width / 2;
  const dy = cy - fr.height * 0.42;""")
sub(p, "  burst(fx, rarity, fr.width / 2, fr.height * 0.44);", "  burst(fx, rarity, fr.width / 2, centerY);")
sub(p, "    const scale = Math.min(base, (fr.width * 0.86) / 112);", "    const scale = Math.min(base, (fr.width * 0.86) / 112, avail / 152);")
sub(p, "{ transform: `translate(${dx * 0.3}px, ${dy * 0.3 - 30}px) scale(${scale * 0.8})`, offset: 0.35 },", "{ transform: `translate(${dx * 0.3}px, ${(dy + endDy) / 2 - 30}px) scale(${scale * 0.8})`, offset: 0.35 },")
sub(p, "        { transform: `translate(0, 0) scale(${scale})` },", "        { transform: `translate(0, ${endDy}px) scale(${scale})` },")
sub(p, "    reveal.style.transform = 'scale(2)';", "    reveal.style.transform = `translate(0, ${endDy}px) scale(${Math.min(2, avail / 152)})`;")
sub(p, "const my = fr.top + fr.height * 0.44 - (r.top + r.height / 2);", "const my = fr.top + centerY - (r.top + r.height / 2);")
