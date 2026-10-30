def sub(p, a, b, cnt=1):
    s = open(p, encoding='utf-8').read()
    assert a in s, (p, a[:60])
    open(p, 'w', encoding='utf-8').write(s.replace(a, b, cnt))


sub('index.html', '    <!-- 技を引く演出（ダーツ） -->', '''    <div id="shop" class="overlay modal" hidden>
      <div class="modal-box" role="dialog" aria-label="ショップ">
        <header><h2>ショップ</h2><span id="shop-gold" class="gold-chip"></span><button id="shop-close">とじる</button></header>
        <div class="modal-body" id="shop-body"></div>
      </div>
    </div>

    <!-- 技を引く演出（ダーツ） -->''')
sub('src/ui/opening.ts', "readonly id: 'cpu' | 'resume'", "readonly id: 'cpu' | 'shop' | 'resume'")
sub('src/ui/opening.ts', "    { id: 'codex'", "    { id: 'shop', label: 'ショップ', primary: false },\n    { id: 'codex'")
sub('tests/ui.test.ts', "toEqual(['cpu', 'codex', 'rules']);", "toEqual(['cpu', 'shop', 'codex', 'rules']);")
sub('tests/ui.test.ts', "toEqual(['resume', 'cpu', 'codex', 'rules', 'restart']);", "toEqual(['resume', 'cpu', 'shop', 'codex', 'rules', 'restart']);")
p = 'src/ui/shell.ts'
sub(p, "  readonly onRestart:", "  /** ショップを開くとき、中身を作る */\n  readonly renderShop: () => void;\n  readonly onRestart:")
sub(p, "  const levels = byId('levels');\n", "  const levels = byId('levels');\n  const shop = byId('shop');\n")
sub(p, "    if (m === levels) {", "    if (m === shop) opts.renderShop();\n    if (m === levels) {")
sub(p, "      case 'codex':\n        openModal(codex);", "      case 'shop':\n        openModal(shop);\n        break;\n      case 'codex':\n        openModal(codex);")
sub(p, "  byId('levels-close')", "  byId('shop-close').addEventListener('click', () => closeModal(shop));\n  byId('levels-close')")
sub(p, "for (const m of [codex, rules, levels]) {", "for (const m of [codex, rules, levels, shop]) {")
sub(p, "    if (!levels.hidden) closeModal(levels);", "    if (!shop.hidden) closeModal(shop);\n    else if (!levels.hidden) closeModal(levels);")
sub(p, "!rules.hidden || !levels.hidden,", "!rules.hidden || !levels.hidden || !shop.hidden,")
p = 'src/main.ts'
sub(p, "import { showToss } from './ui/toss';", "import { renderShop } from './ui/shop';\nimport { showToss } from './ui/toss';\nimport { loadWallet, saveWallet } from './save';\nimport { currentSkin, earn, goldFor } from './shop';\nimport type { Wallet } from './shop';")
sub(p, "/** 手札で選んでいる", """/** Gold と持ち物（この端末のブラウザに保存） */
let wallet: Wallet = loadWallet();
/** この対局の Gold を、もう受け取ったか */
let awarded = false;

/** 手札で選んでいる""")
sub(p, "view.setInsets(uiInsets);", """view.setInsets(uiInsets);
function applySkin(): void {
  const s = currentSkin(wallet);
  view.setSkin(s.board, [s.piece.colors[0], s.piece.colors[1]]);
}
applySkin();""")
sub(p, "  renderPlayerCards();\n  renderHand();\n  view.relayout();", """  if (state.winner !== null && cpuSeat !== null && !awarded) {
    // CPU に勝てば多く、負けても少し、Gold がもらえる
    awarded = true;
    const g = goldFor(cpuLevel, state.winner === seatA);
    wallet = earn(wallet, g);
    saveWallet(wallet);
    say(`${g.toLocaleString('ja-JP')} G 獲得！（所持 ${wallet.gold.toLocaleString('ja-JP')} G）`);
  }
  renderPlayerCards();
  renderHand();
  view.relayout();""")
sub(p, "  armedAbility = null;\n  lastTurn = state.turn;\n  const first = tossFirst(seed);", "  armedAbility = null;\n  awarded = false;\n  lastTurn = state.turn;\n  const first = tossFirst(seed);")
sub(p, "const shell = createShell({", """function renderShopUi(): void {
  renderShop(el('shop-body'), el('shop-gold'), wallet, (next) => {
    wallet = next;
    saveWallet(wallet);
    applySkin();
    renderShopUi();
  });
}

const shell = createShell({
  renderShop: renderShopUi,""")
