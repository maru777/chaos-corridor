import re


def sub(p, a, b, cnt=1):
    s = open(p, encoding='utf-8').read()
    assert a in s, (p, a[:60])
    open(p, 'w', encoding='utf-8').write(s.replace(a, b, cnt))


# abilities.ts: labels
p = 'src/abilities.ts'
s = open(p, encoding='utf-8').read()


def fix(m):
    t = m.group(1)
    t = t.replace('\\n手番: ', '\\n手番：').replace('\\n条件: ', '\\n制約：')
    return "text: '効果：" + t + "'"


s = re.sub(r"text: '([^']*\\n手番: [^']*)'", fix, s)
open(p, 'w', encoding='utf-8').write(s)

# main.ts: description box
p = 'src/main.ts'
sub(p, "      handDescEl.textContent = armedAbility === id ? `${def.text}（もう一度タップで使う）` : def.text;", "      fillEffect(handDescEl, def.text, armedAbility === id ? '→ もう一度タップで使う' : undefined);")
sub(p, "      handDescEl.textContent = `${def.text}（もう一度タップで使う）`;", "      fillEffect(handDescEl, def.text, '→ もう一度タップで使う');")
sub(p, "import { renderShop } from './ui/shop';", "import { fillEffect } from './ui/effecttext';\nimport { renderShop } from './ui/shop';")
# draw.ts
p = 'src/ui/draw.ts'
sub(p, "el('b', 'dn-read', def.reading), el('b', 'dn-text', def.text));", "el('b', 'dn-read', def.reading));\n  const effect = el('b', 'dn-text');\n  fillEffect(effect, def.text);\n  slab.append(effect);")
sub(p, "import { abilityIconSvg } from './icons';", "import { fillEffect } from './effecttext';\nimport { abilityIconSvg } from './icons';")
# codex.ts
p = 'src/ui/codex.ts'
sub(p, "el('p', 'codex-text', a.text),", "effectParagraph(a.text),")
s = open(p, encoding='utf-8').read()
s = s.replace("import ", "import { fillEffect } from './effecttext';\nimport ", 1)
s += """
/** 説明（効果・手番・制約）の段落 */
function effectParagraph(text: string): HTMLParagraphElement {
  const p = document.createElement('p');
  p.className = 'codex-text';
  fillEffect(p, text);
  return p;
}
"""
open(p, 'w', encoding='utf-8').write(s)
