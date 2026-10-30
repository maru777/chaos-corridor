def sub(p, a, b, cnt=1):
    s = open(p, encoding='utf-8').read()
    assert a in s, (p, a[:60])
    open(p, 'w', encoding='utf-8').write(s.replace(a, b, cnt))


p = 'src/ui/draw.ts'
sub(p, "    el('div', 'draw-parked'),\n    el('div', 'draw-fx'),", "    el('div', 'draw-fx'),\n    el('div', 'draw-top'),\n    el('div', 'draw-parked'),")
sub(p, "  field.classList.remove('punch', 'fade');\n  field.replaceChildren();", "  field.classList.remove('punch', 'fade');\n  field.replaceChildren();\n  (root.querySelector('.draw-top') as HTMLElement).replaceChildren();")
sub(p, "  field.appendChild(reveal);", "  // 決まったカードは、エフェクト（閃光・集中線・紙吹雪）より、手前の層に置く\n  (root.querySelector('.draw-top') as HTMLElement).appendChild(reveal);")
