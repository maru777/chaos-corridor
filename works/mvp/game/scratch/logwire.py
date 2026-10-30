def sub(p, a, b, cnt=1):
    s = open(p, encoding='utf-8').read()
    assert a in s, (p, a[:60])
    open(p, 'w', encoding='utf-8').write(s.replace(a, b, cnt))


# 1. うっかりを廃止（★1 は、候補を絞って、★2 と差をつける）
sub('src/cpu.ts', "{ depth: 2, beam: 8, slip: 0.1, timeMs: 1500 }, // ★1: 2 手読み。ときどきうっかり", "{ depth: 2, beam: 6, slip: 0, timeMs: 1500 }, // ★1: 2 手読み（候補を絞る）")

# 2. 保存: 戦績
s = open('src/save.ts', encoding='utf-8').read()
s = s.replace("import { START_WALLET, parseWallet } from './shop';", "import { parseLog } from './matchlog';\nimport type { MatchEntry } from './matchlog';\nimport { START_WALLET, parseWallet } from './shop';")
s += """
const LOG_KEY = 'chaos-corridor.log.v1';

export function loadLog(): MatchEntry[] {
  try {
    const raw = window.localStorage.getItem(LOG_KEY);
    return raw === null ? [] : parseLog(JSON.parse(raw));
  } catch {
    return [];
  }
}

export function saveLog(list: readonly MatchEntry[]): boolean {
  try {
    window.localStorage.setItem(LOG_KEY, JSON.stringify(list));
    return true;
  } catch {
    return false;
  }
}
"""
open('src/save.ts', 'w', encoding='utf-8').write(s)

# 3. メニュー
sub('src/ui/opening.ts', "readonly id: 'cpu' | 'shop' | 'resume'", "readonly id: 'cpu' | 'shop' | 'log' | 'resume'")
sub('src/ui/opening.ts', "    { id: 'shop', label: 'ショップ', primary: false },", "    { id: 'shop', label: 'ショップ', primary: false },\n    { id: 'log', label: '戦績', primary: false },")
sub('tests/ui.test.ts', "toEqual(['cpu', 'shop', 'codex', 'rules']);", "toEqual(['cpu', 'shop', 'log', 'codex', 'rules']);")
sub('tests/ui.test.ts', "toEqual(['resume', 'cpu', 'shop', 'codex', 'rules', 'restart']);", "toEqual(['resume', 'cpu', 'shop', 'log', 'codex', 'rules', 'restart']);")
sub('index.html', '    <div id="shop" class="overlay modal" hidden>', '''    <div id="log" class="overlay modal" hidden>
      <div class="modal-box" role="dialog" aria-label="戦績">
        <header><h2>戦績</h2><button id="log-close">とじる</button></header>
        <div class="modal-body" id="log-body"></div>
      </div>
    </div>

    <div id="shop" class="overlay modal" hidden>''')
p = 'src/ui/shell.ts'
sub(p, "  readonly renderShop: () => void;", "  readonly renderShop: () => void;\n  /** 戦績を開くとき、中身を作る */\n  readonly renderLog: () => void;")
sub(p, "  const shop = byId('shop');\n", "  const shop = byId('shop');\n  const logModal = byId('log');\n")
sub(p, "    if (m === shop) opts.renderShop();", "    if (m === shop) opts.renderShop();\n    if (m === logModal) opts.renderLog();")
sub(p, "      case 'shop':\n        openModal(shop);\n        break;", "      case 'shop':\n        openModal(shop);\n        break;\n      case 'log':\n        openModal(logModal);\n        break;")
sub(p, "  byId('shop-close').addEventListener('click', () => closeModal(shop));", "  byId('shop-close').addEventListener('click', () => closeModal(shop));\n  byId('log-close').addEventListener('click', () => closeModal(logModal));")
sub(p, "for (const m of [codex, rules, levels, shop]) {", "for (const m of [codex, rules, levels, shop, logModal]) {")
sub(p, "    if (!shop.hidden) closeModal(shop);", "    if (!logModal.hidden) closeModal(logModal);\n    else if (!shop.hidden) closeModal(shop);")
sub(p, "!levels.hidden || !shop.hidden,", "!levels.hidden || !shop.hidden || !logModal.hidden,")

# 4. main: 記録と効果音
p = 'src/main.ts'
sub(p, "import { loadWallet, saveWallet } from './save';", "import { loadLog, loadWallet, saveLog, saveWallet } from './save';\nimport { addEntry } from './matchlog';\nimport type { MatchEntry } from './matchlog';\nimport { renderLog } from './ui/log';")
sub(p, "let wallet: Wallet = loadWallet();", "let wallet: Wallet = loadWallet();\n/** 勝敗ログ（この端末のブラウザに保存） */\nlet matchLog: MatchEntry[] = loadLog();\n/** デバッグで勝敗をつけたときは、戦績に残さない */\nlet debugForcedResult = false;")
sub(p, "    wallet = earn(wallet, g);\n    saveWallet(wallet);", "    wallet = earn(wallet, g);\n    saveWallet(wallet);\n    if (!debugForcedResult) {\n      matchLog = addEntry(matchLog, { at: new Date().toISOString(), level: cpuLevel, won, first: seatA === 0, moves: log.length, gold: g });\n      saveLog(matchLog);\n    }")
sub(p, "  state = { ...state, winner: iWin ? mine : other };\n  refresh();", "  debugForcedResult = true;\n  state = { ...state, winner: iWin ? mine : other };\n  refresh();")
sub(p, "  armedAbility = null;\n  awarded = false;\n  lastInsets = null;", "  armedAbility = null;\n  awarded = false;\n  debugForcedResult = false;\n  lastInsets = null;")
sub(p, "const shell = createShell({\n  renderShop: renderShopUi,", "const shell = createShell({\n  renderShop: renderShopUi,\n  renderLog: () => renderLog(el('log-body'), matchLog),")
# 効果音: ボタンを押したとき
sub(p, "import { playMoveSfx, playSfx,", "import { playMoveSfx, playSfx, playUiSfx,") if "import { playMoveSfx, playSfx," in open(p, encoding='utf-8').read() else None
