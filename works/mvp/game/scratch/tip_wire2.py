def sub(p, a, b, cnt=1):
    s = open(p, encoding='utf-8').read()
    assert a in s, (p, a[:60])
    open(p, 'w', encoding='utf-8').write(s.replace(a, b, cnt))


p = 'src/main.ts'
sub(p, "  s.title = abilityDef(id).name;\n", "  s.title = abilityDef(id).name;\n  attachTip(s, id); // マウスを乗せると、説明が出る（使った技は、相手のものも見られる）\n")
sub(p, "import { fillEffect } from './ui/effecttext';", "import { fillEffect } from './ui/effecttext';\nimport { attachTip } from './ui/tip';")
