def sub(p, a, b, cnt=1):
    s = open(p, encoding='utf-8').read()
    assert a in s, (p, a[:60])
    open(p, 'w', encoding='utf-8').write(s.replace(a, b, cnt))


p = 'src/rules.ts'
sub(p, "import { DIRS, bothHavePath, goalRow, inBounds, isBlocked, wallSegments } from './board';", "import { DIRS, bothHavePath, goalRow, hasPathToGoal, inBounds, isBlocked, wallSegments } from './board';")
sub(p, """ * 着地するマスに、相手のコマや隕石があってはいけない。
 */""", """ * 着地するマスに、相手のコマや隕石があってはいけない。
 * 壁で囲まれた、出口のない場所には着地できない（自分が、ゴールへの道を失って、対局が終わらなくなるため）。
 */""")
sub(p, "    if (inBounds(state.size, to) && !samePos(to, foe) && !isMeteorAt(state, to)) out.push(to);", "    if (!inBounds(state.size, to) || samePos(to, foe) || isMeteorAt(state, to)) continue;\n    if (hasPathToGoal(state.size, state.walls, to, goalRow(state.size, state.turn), state.meteors)) out.push(to);")
sub('src/abilities.ts', "制約：着地するマスが盤の内で、障害物がないこと。", "制約：着地するマスが盤の内で、障害物がなく、そこからゴールへの道が残ること。")
