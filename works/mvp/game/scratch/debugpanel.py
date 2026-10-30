def sub(p, a, b, cnt=1):
    s = open(p, encoding='utf-8').read()
    assert a in s, (p, a[:60])
    open(p, 'w', encoding='utf-8').write(s.replace(a, b, cnt))


p = 'src/main.ts'

# 1. 勝負がついても、盤の位置・大きさを変えない（下の表示の高さが変わっても、動かさない）
sub(p, """function uiInsets(): { top: number; bottom: number } {
  const h = window.innerHeight;""", """let lastInsets: { top: number; bottom: number } | null = null;

function uiInsets(): { top: number; bottom: number } {
  // 勝負がついたあとは、下の表示（残りの手札）の高さが変わって、盤が大きくなったり、下がったりして見えるので、直前の値のままにする
  if (state.winner !== null && lastInsets !== null) return lastInsets;
  const h = window.innerHeight;""")
sub(p, "  return { top: Math.max(0, top), bottom: Math.max(0, h - bottomEdge) };\n}", "  lastInsets = { top: Math.max(0, top), bottom: Math.max(0, h - bottomEdge) };\n  return lastInsets;\n}")
# a new match must measure again
sub(p, "  armedAbility = null;\n  awarded = false;", "  armedAbility = null;\n  awarded = false;\n  lastInsets = null;")

# 2. デバッグパネル: いろいろな挙動を、すぐ確認できるボタン
sub(p, "  panel.append(title('カットインを試す（何回でも）'), previewRow, title('実際の能力で使うときの演出'), select, label, labelAll);", """  // ---- 場面・結果・Gold の確認（対局に影響しない演出は、そのまま出す） ----
  const mkRow = (items: readonly (readonly [string, () => void])[]) => {
    const row = document.createElement('div');
    row.className = 'row';
    for (const [text, fn] of items) {
      const b = document.createElement('button');
      b.textContent = text;
      b.addEventListener('click', fn);
      row.appendChild(b);
    }
    return row;
  };
  const sampleOf = (r: Rarity): AbilityId => (ABILITIES.find((a) => a.rarity === r) as { id: AbilityId }).id;
  const tossRow = mkRow([
    ['コイン: 自分が先手', () => void showToss({ a: 'あなた', b: 'CPU ★★★☆☆ 策士', first: 0, firstSeat: NAMES[0], secondSeat: NAMES[1] }).then((h) => h())],
    ['コイン: 自分が後手', () => void showToss({ a: 'あなた', b: 'CPU ★★★☆☆ 策士', first: 1, firstSeat: NAMES[0], secondSeat: NAMES[1] }).then((h) => h())],
  ]);
  const drawRow = mkRow(
    RARITIES.map((r, i) => [`引く ${i + 1}`, () => void playDraws([sampleOf(r), sampleOf(RARITIES[(i + 1) % 4] as Rarity)], newSeed(), async () => undefined, 'CPU も 2 枚引いた').then((h) => h())] as const),
  );
  const sampleResult = (won: boolean) => () =>
    showResult({ won, gained: goldFor(cpuLevel, won), total: wallet.gold, foe: `CPU ${levelStars(cpuLevel)} ${LEVEL_NAMES[cpuLevel - 1] ?? ''}`, onAgain: () => undefined, onMenu: () => undefined });
  const resultRow = mkRow([
    ['勝ち画面', sampleResult(true)],
    ['負け画面', sampleResult(false)],
  ]);
  const forceRow = mkRow([
    ['自分が勝った状態', () => forceWinner(true)],
    ['自分が負けた状態', () => forceWinner(false)],
  ]);
  const goldRow = mkRow([
    ['+1,000 G', () => debugGold(1000)],
    ['+10,000 G', () => debugGold(10000)],
    ['Gold を 0 に', () => debugGold(-wallet.gold)],
  ]);
  panel.append(title('カットインを試す（何回でも）'), previewRow, title('実際の能力で使うときの演出'), select, label, labelAll);
  panel.append(title('コイントス'), tossRow, title('技を引く演出（レア度ごと）'), drawRow, title('結果の画面（見た目だけ）'), resultRow);
  panel.append(title('勝敗を、いまの対局につける（CPU 戦で、結果・Gold まで）'), forceRow, title('Gold'), goldRow);""")
sub(p, "function buildDebugPanel(): void {", """/** デバッグ: いまの対局を、自分の勝ち（または負け）にして、結果の流れ（画面・Gold）まで確認する */
function forceWinner(iWin: boolean): void {
  const mine: PlayerId = cpuSeat === null ? 0 : seatA;
  const other: PlayerId = mine === 0 ? 1 : 0;
  state = { ...state, winner: iWin ? mine : other };
  refresh();
}

function debugGold(delta: number): void {
  wallet = { ...wallet, gold: Math.max(0, wallet.gold + delta) };
  saveWallet(wallet);
  renderShopUi();
}

function buildDebugPanel(): void {""")
sub(p, "  RARITIES,\n  abilityDef,", "  ABILITIES,\n  RARITIES,\n  abilityDef,")
