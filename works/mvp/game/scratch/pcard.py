def sub(p, a, b, cnt=1):
    s = open(p, encoding='utf-8').read()
    assert a in s, (p, a[:60])
    open(p, 'w', encoding='utf-8').write(s.replace(a, b, cnt))


# ---- 1. 上のプレイヤーカードの作り直し ----
p = 'src/main.ts'
s = open(p, encoding='utf-8').read()
a = s.index("/** 上の、プレイヤーカード:")
b = s.index("  }\n}\n", s.index("function renderPlayerCards")) + len("  }\n}\n")
new = '''/**
 * 上の、プレイヤーカード: 席（先手・後手）と相手の名前、WALL（残りの数を大きく、目盛りつき。短い壁・壁封じのしるし）、
 * SKILL（使った Skill は表向き、まだは裏向き。残り / 配られた数）。手番の人を目立たせる。
 */
function renderPlayerCards(): void {
  for (const p of [0, 1] as const) {
    const card = pcardEls[p];
    card.replaceChildren();
    card.classList.toggle('active', state.winner === null ? state.turn === p : state.winner === p);
    const nameRow = div('pname');
    nameRow.append(div('pseat', NAMES[p]), div('pwho', seatLabel(p)));
    card.appendChild(nameRow);

    // WALL: 残りの数を大きく。短い壁・壁封じは、右にしるし。下に、10 目盛りのゲージ
    const wallRow = div('prow');
    const left = state.wallsLeft[p];
    const num = document.createElement('b');
    num.className = `pnum${left <= 2 ? ' low' : ''}`;
    num.textContent = String(left);
    const max = document.createElement('small');
    max.className = 'pmax';
    max.textContent = `/${WALLS_PER_PLAYER}`;
    wallRow.append(div('pchip', 'WALL'), num, max);
    if (state.shortWalls[p] > 0) wallRow.appendChild(div('tag', `短壁 ${state.shortWalls[p]}`));
    if (state.wallBlocked[p]) wallRow.appendChild(div('tag warn', '壁封じ'));
    card.appendChild(wallRow);
    const gauge = div('pips');
    for (let i = 0; i < WALLS_PER_PLAYER; i++) gauge.appendChild(div(i < left ? 'pip' : 'pip off'));
    card.appendChild(gauge);

    // SKILL: 使った Skill は、表向き（相手のも）。まだ使っていないものは、裏向き
    const skills = div('prow');
    const dealt = newGame(seed).abilities[p];
    const rest = [...state.abilities[p]];
    const cards = div('pcards');
    for (const id of dealt) {
      const at = rest.indexOf(id);
      if (at >= 0) {
        rest.splice(at, 1);
        cards.appendChild(debugShowAll ? miniCard(id) : div('mini-back'));
      } else {
        const used = miniCard(id);
        used.classList.add('used');
        cards.appendChild(used);
      }
    }
    const remain = document.createElement('b');
    remain.className = 'pcount';
    remain.textContent = `${state.abilities[p].length}/${dealt.length}`;
    skills.append(div('pchip', 'SKILL'), cards, remain);
    card.appendChild(skills);
  }
}
'''
s = s[:a] + new + s[b:]
open(p, 'w', encoding='utf-8').write(s)

# ---- 2. 用語: 技・能力・手札 → Skill ----
sub(p, "const row = div('result-hand', `${NAMES[p]}の残りの手札`);", "const row = div('result-hand', `${NAMES[p]}の残り Skill`);")
sub(p, "say('相手が、いま使える技がない（もう使い切った、または、条件に合わない）');", "say('相手が、いま使える Skill がない（もう使い切った、または、制約に合わない）');")
sub(p, "labelAll.append(checkAll, '手札を、全部見る');", "labelAll.append(checkAll, 'Skill を、全部見る');")
sub(p, "const foeRow = mkRow([['相手が技を使う（本物の手札から）', debugFoeSkill]]);", "const foeRow = mkRow([['相手が Skill を使う（本物の手札から）', debugFoeSkill]]);")
sub(p, "title('技を引く演出（レア度ごと）')", "title('Skill を引く演出（レア度ごと）')")
sub(p, "title('相手が技を使ったときの表示')", "title('相手が Skill を使ったときの表示')")
sub(p, "const auto = new Option('能力本来のレア度', '');", "const auto = new Option('Skill 本来のレア度', '');")
sub(p, "label.append(check, '能力を使っても減らさない');", "label.append(check, 'Skill を使っても減らさない');")
sub(p, "title('実際の能力で使うときの演出')", "title('実際の Skill で使うときの演出')")
sub('src/ui/draw.ts', "title.textContent = `技を引く　${nth} / ${total}`;", "title.textContent = `Skill を引く　${nth} / ${total}`;")
sub('src/ui/opening.ts', "label: '技一覧'", "label: 'Skill 一覧'")
sub('index.html', '<button id="btn-codex">技一覧</button>', '<button id="btn-codex">Skill 一覧</button>')
sub('index.html', 'aria-label="技一覧"', 'aria-label="Skill 一覧"')
sub('index.html', '<h2>技一覧</h2>', '<h2>Skill 一覧</h2>')
sub('index.html', '<!-- 技を引く演出（ダーツ） -->', '<!-- Skill を引く演出（ダーツ） -->')
sub('src/abilities.ts', "手番：技そのものは手番を使わず、", "手番：Skill そのものは手番を使わず、")
sub('src/ui/rules.ts', "'能力を 1 つ使う（手番を使う）。',", "'Skill を 1 つ使う（手番を使う）。',")
sub('src/ui/rules.ts', "title: '能力（技）',", "title: 'Skill',")
sub('src/ui/rules.ts', "'始めるとき、運（ガチャ）で、能力を 2 つもらう。同じものは、重ならない。',", "'始めるとき、運（ガチャ）で、Skill を 2 つもらう。同じものは、重ならない。',")
sub('src/ui/rules.ts', "'1 つの能力は、1 局に 1 回だけ使える。使うとカットインが出る。',", "'1 つの Skill は、1 局に 1 回だけ使える（カードごとに、残り 1/1 と出る）。使うとカットインが出る。',")
sub('src/ui/rules.ts', "'全部の技は、メニューの「技一覧」で見られる。',", "'全部の Skill は、メニューの「Skill 一覧」で見られる。',")
sub('src/ui/rules.ts', "'技の説明は、", "'Skill の説明は、")
sub('src/ui/rules.ts', "新しい障害物が増えても、この言葉で書く）。'", "新しい障害物が増えても、この言葉で書く）。'")
sub('src/ui/rules.ts', "title: '手札は、相手に見えない',", "title: 'Skill は、相手に見えない',")
sub('src/ui/rules.ts', "'自分の手札は、いつも見える。',", "'自分の Skill は、いつも見える。',")
sub('src/ui/rules.ts', "'相手の手札は、枚数だけ見える。中身は、使われるまで分からない。',", "'相手の Skill は、裏向きで、枚数だけ見える。使われると、表向きになって、中身が分かる。',")
sub('src/ui/rules.ts', "'能力: 手札の使いたい技を押す。場所を選ぶ技は、盤の上で、場所を押す。',", "'Skill: 使いたいカードを押して選び、もう一度押すと使う。場所を選ぶ Skill は、盤の上で、場所を押す。',")
sub('tests/ui.test.ts', "RULES.some((s) => s.title.includes('手札'))", "RULES.some((s) => s.title.includes('Skill'))")
