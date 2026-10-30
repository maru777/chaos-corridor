def sub(p, a, b, cnt=1):
    s = open(p, encoding='utf-8').read()
    assert a in s, (p, a[:60])
    open(p, 'w', encoding='utf-8').write(s.replace(a, b, cnt))


# draw.ts: wait for a tap so the effect can be read; tooltip on the parked card
p = 'src/ui/draw.ts'
sub(p, "import { fillEffect } from './effecttext';", "import { fillEffect } from './effecttext';\nimport { attachTip } from './tip';")
sub(p, "  slab.append(effect);", "  slab.append(effect, el('b', 'dn-tap', '▶ タップで次へ'));")
sub(p, """  await sleep(Math.max(0, t.revealMs - 700) * k);
  root.classList.remove('shake', 'dim');
  await sleep(t.holdMs * k);""", """  await sleep(Math.max(0, t.revealMs - 700) * k);
  root.classList.remove('shake', 'dim');
  // 効果を読めるように、タップするまで、そのまま見せる（うっかり飛ばさないよう、少し待ってから、受けつける）
  await sleep(500);
  await new Promise<void>((resolve) => root.addEventListener('click', () => resolve(), { once: true }));""")
sub(p, "  card.classList.add('dparked');", "  card.classList.add('dparked');\n  attachTip(card, id); // 上に置いたカードにも、マウスを乗せると、説明が出る")

# main.ts: tooltip on cards shown in the player cards
p = 'src/main.ts'
s = open(p, encoding='utf-8').read()
i = s.index('function miniCard(')
j = s.index('\n}\n', i)
body = s[i:j]
print(body)
