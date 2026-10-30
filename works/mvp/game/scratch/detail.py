import re


def sub(p, a, b, cnt=1):
    s = open(p, encoding='utf-8').read()
    assert a in s, (p, a[:60])
    open(p, 'w', encoding='utf-8').write(s.replace(a, b, cnt))


TEXTS = {
    '斜めに 1 マス動く（手番を使う）': '斜めに 1 マス動く。\\n手番: 使う（動いたら相手の番）。\\n条件: 斜めの先が盤の内で、相手のコマ・隕石がないこと。横→縦、または縦→横の道のどちらかに、壁・相手のコマ・隕石がないこと。',
    '置いた自分の壁を 1 枚戻す。鉄壁は戻せない（手番を使う）': '盤上の自分の壁を 1 枚、手元に戻す。\\n手番: 使う。\\n条件: 自分が置いた壁があること。鉄壁は戻せない。',
    '相手の次の手番では、壁を置けなくする（手番を使う）': '相手が次の番に、壁を置けなくする（動くことだけできる）。\\n手番: 使う。\\n条件: 相手が、すでに壁を封じられていないこと。',
    '壁を越えて、まっすぐ 2 マス先へ跳ぶ（手番を使う）': '壁・コマ・隕石を飛び越えて、上下左右のどれかへ、まっすぐ 2 マス先へ跳ぶ。\\n手番: 使う。\\n条件: 着地するマスが盤の内で、相手のコマも隕石もないこと。',
    '相手の前のマスに隕石を落とし、相手が 3 回動くまで、そのマスを通行不可にする（手番を使う）': '相手のコマの、ゴール側のすぐ前のマスに隕石を落とす。相手が 3 回動くまで、そのマスは通れない。\\n手番: 使う。\\n条件: 相手がゴール行にいないこと。そのマスに、自分のコマも隕石もないこと。落としても、どちらにもゴールへの道が残ること。',
    '自分の壁 1 枚を鉄壁にする。虚無で消されず、回収でも戻せなくなる（手番を使う）': '盤上の自分の壁 1 枚を鉄壁にする。虚無で消されず、回収でも戻せなくなる。\\n手番: 使う。\\n条件: 鉄壁でない自分の壁があること。',
    '1 手番に 2 回動く（手番を使う）': '1 手番に、ふつうの動きを 2 回する。1 回目でゴールに着けば、その時点で勝ち。\\n手番: 使う（2 回動いて、相手の番）。\\n条件: 1 回目も 2 回目も、ふつうに動ける先であること。',
    '盤上の壁 1 枚を消す。消した壁は、持ち主の手元に戻る。鉄壁は消せない（手番を使う）': '盤上の壁を 1 枚消す（相手の壁も、自分の壁も）。消した壁は、持ち主の手元に戻る。\\n手番: 使う。\\n条件: 鉄壁でない壁があること。',
    '相手のコマを、ゴールと反対の向きに 1 マス引き戻す。壁・端・コマ・隕石があると使えない（手番を使う）': '相手のコマを、ゴールと反対の向きに 1 マス引き戻す。\\n手番: 使う。\\n条件: 相手がゴール行にいないこと。引き戻す先が盤の内で、壁・自分のコマ・隕石がないこと。',
    '相手を 1 手番休ませる。続けて自分がもう一度動く（手番を使う）': '相手を 1 手番休ませる。\\n手番: 技そのものは手番を使わず、続けて自分がもう一度動ける。\\n条件: いつでも使える。',
    '1 マス分の短い壁を、3 枚置けるようになる。壁を置くときに、短い壁を選べる（手番を使う）': '1 マス分の短い壁を、3 枚置けるようになる。壁を置くときに、短い壁を選べる。\\n手番: 使う（この手番には、壁は置かない）。\\n条件: いつでも使える。',
    '盤上の壁（鉄壁以外）を、すべてランダムに置き直す。どちらのコマにも、ゴールへの道は残る（手番を使う）': '盤上の壁（鉄壁以外）を、すべてランダムに置き直す。どちらにも、ゴールへの道は残る。\\n手番: 使う。\\n条件: 鉄壁でない壁が 1 枚以上あること。',
    '盤を 180 度回す。壁と隕石は反転し、コマは、位置を入れ替える（手番を使う）': '盤を 180 度回す。壁と隕石は反転し、コマは位置を入れ替える。\\n手番: 使う。\\n条件: いつでも使える。',
}
p = 'src/abilities.ts'
for old, new in TEXTS.items():
    sub(p, "text: '" + old + "'", "text: '" + new + "'")

# per-card remaining X/X
p = 'src/main.ts'
sub(p, "leftTag.textContent = spent.has(i) ? '残り 0 回' : '残り 1 回';", "leftTag.textContent = spent.has(i) ? '残り 0/1' : '残り 1/1';")
# hide description when the pointer leaves
sub(p, "    b.addEventListener('mouseenter', showDesc);\n    b.addEventListener('focus', showDesc);", "    b.addEventListener('mouseenter', showDesc);\n    b.addEventListener('focus', showDesc);\n    // カーソルが外れたら、説明は消す\n    const hideDesc = () => {\n      handDescEl.textContent = '';\n    };\n    b.addEventListener('mouseleave', hideDesc);\n    b.addEventListener('blur', hideDesc);")
# opponent / own pcard hand: used cards face-up, others face-down
sub(p, """    const shown = visibleCards(state, p, false, debugShowAll);
    if (shown !== null) for (const id of shown) hand.appendChild(miniCard(id));
    else for (let i = 0; i < handCount(state, p); i++) hand.appendChild(div('mini-back'));
    if (handCount(state, p) === 0) hand.appendChild(document.createTextNode('なし'));""", """    // 使った技は、表向きで見える（相手が使ったカードも）。使うまでは、裏向き
    const dealt = newGame(seed).abilities[p];
    const rest = [...state.abilities[p]];
    for (const id of dealt) {
      const at = rest.indexOf(id);
      if (at >= 0) {
        rest.splice(at, 1);
        hand.appendChild(debugShowAll ? miniCard(id) : div('mini-back'));
      } else {
        const used = miniCard(id);
        used.classList.add('used');
        hand.appendChild(used);
      }
    }""")
PYEOF_MARK = None
