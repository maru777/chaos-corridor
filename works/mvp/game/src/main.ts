import {
  ABILITIES,
  RARITIES,
  abilityDef,
  applyAction,
  isTrapSkill,
  attackDef,
  dealGame,
  emptyCells,
  legalActions,
  legalAttacks,
  legalDiagonalMoves,
  legalLeapMoves,
  legalPawnMoves,
  newGame,
  novaSecondMoves,
  reclaimableWalls,
  riftTargets,
  seizeTargets,
  shortWallSpec,
  stateHash,
  voidTargets,
  wallProblem,
  WALLS_PER_PLAYER,
} from './index';
import type { AbilityId, Action, AttackId, GameState, Orientation, PlayerId, Pos, Rarity, Trap, TrapKind, WallSpec } from './index';
import { LEVEL_NAMES, chooseAction, levelStars } from './cpu';
import { createRng } from './rng';
import { seatOfA, tossFirst } from './toss';
import { BoardView } from './view/board3d';
import { CUTIN_TIMING, playCutIn } from './view/cutin';
import { cellToWorld, nearestCell, nearestShortSlot, nearestWallSlot, wallToWorld } from './view/layout';
import { showPop } from './view/popsfx';
import { playMoveSfx, playSfx, playTrapSfx, playUiSfx, playTitleSfx, playWallSfx } from './view/sfx';
import { shout, stopVoice } from './view/voice';
import './ui/ui.css';
import './ui/scenes.css';
import './ui/persona.css';
import './ui/shop.css';
import './ui/result.css';
import './ui/pcard.css';
import './ui/log.css';
import { visibleCards } from './ui/hand';
import { abilityIconSvg, attackIconSvg } from './ui/icons';
import type { MatchChoice } from './ui/opening';
import { createShell } from './ui/shell';
import { coverScreen, revealScreen } from './ui/curtain';
import { playDraws } from './ui/draw';
import { showResult } from './ui/result';
import { fillEffect } from './ui/effecttext';
import { attachTip } from './ui/tip';
import { renderShop } from './ui/shop';
import { showToss } from './ui/toss';
import { loadLog, loadWallet, saveLog, saveWallet } from './save';
import { pickAttack } from './ui/attackpick';
import { TRAP_BURST_MS, showTrapBurst } from './ui/trapburst';
import { addEntry } from './matchlog';
import type { MatchEntry } from './matchlog';
import { renderLog } from './ui/log';
import { currentSkin, earn, goldFor } from './shop';
import type { Wallet } from './shop';

/** 操作のモード。nova1 / nova2 は、超新星の 1 回目・2 回目の行き先を選ぶ。reclaim / aegis / void は、壁を選ぶ */
type CellTrapMode = 'trapStun' | 'trapBack' | 'trapConfiscate' | 'trapSeal' | 'trapShove';
type WallPickMode = 'reclaim' | 'aegis' | 'void' | 'rift' | 'seize';
/**
 * trapShove2 は、強制移動の罠の「飛ばす向き」を選ぶ段階（罠を置くマスを選んだあと、隣のマスで向きを決める）。
 * trapGhost は、見えない壁を置く場所を選ぶ（壁と同じ置き方）。atkLaser / atkBomb は、攻撃技の狙いを選ぶ。
 */
type Mode = 'move' | 'wall' | 'diagonal' | 'leap' | 'nova1' | 'nova2' | WallPickMode | CellTrapMode | 'trapShove2' | 'trapGhost' | 'atkLaser' | 'atkBomb';

function isWallPick(m: Mode): m is WallPickMode {
  return m === 'reclaim' || m === 'aegis' || m === 'void' || m === 'rift' || m === 'seize';
}

function isCellTrap(m: Mode): m is CellTrapMode {
  return m === 'trapStun' || m === 'trapBack' || m === 'trapConfiscate' || m === 'trapSeal' || m === 'trapShove';
}

/** そのモードが使っている能力（ふつうの移動・壁・攻撃技のときは null） */
function modeAbility(m: Mode): AbilityId | null {
  if (m === 'move' || m === 'wall' || m === 'atkLaser' || m === 'atkBomb') return null;
  if (m === 'nova1' || m === 'nova2') return 'nova';
  return m === 'trapShove2' ? 'trapShove' : m;
}

/** 押したらすぐ使う（場所を選ばない）能力 */
const INSTANT_ABILITIES: ReadonlySet<AbilityId> = new Set<AbilityId>(['jam', 'meteor', 'gravity', 'stasis', 'triwall', 'invert', 'supply', 'gate', 'thunder']);

/** 罠が起きたときに知らせる言葉 */
const TRAP_TEXT: Readonly<Record<TrapKind, string>> = {
  stun: '罠だ！ 1 回休み',
  back: '罠だ！ 元のマスに戻された',
  shove: '罠だ！ 飛ばされた',
  confiscate: '罠だ！ 壁を 1 枚失った',
  seal: '罠だ！ 次の手番、Skill と攻撃技が使えない',
};

function el<T extends HTMLElement>(id: string): T {
  const e = document.getElementById(id);
  if (!e) throw new Error(`#${id} が見つからない`);
  return e as T;
}

const NAMES = ['先手', '後手'] as const;

function newSeed(): number {
  return Math.floor(Math.random() * 0xffffffff);
}

const params = new URLSearchParams(location.search);
// URL に ?seed=数字 を付けると、その種で始まる（同じ手札を再現できる。確認や不具合の再現用）
const seedParam = Number(params.get('seed'));
let seed = Number.isInteger(seedParam) && seedParam > 0 ? seedParam : newSeed();
/** それぞれが選んだ攻撃技（攻撃技なしのときは、どちらも null） */
let chosenAttacks: [AttackId | null, AttackId | null] = [null, null];
let state: GameState = newGame(seed, chosenAttacks);
let log: Action[] = [];
/** 罠の強制移動で、罠を置くマスに選んだところ */
let trapCell: Pos | null = null;
/** 手札で選んでいる（次のタップで撃つ）攻撃技 */
let armedAttack = false;
let mode: Mode = 'move';
let orient: Orientation = 'h';
let ghost: WallSpec | null = null;
/** 超新星の 1 回目に選んだマス（2 回目を選ぶまで覚えておく） */
let novaFirst: Pos | null = null;
/** 短い壁（三連壁）を置くモードか。短い壁を持っているときだけ切り替えられる */
let shortMode = false;
/** 手札を見ているか（手番が替わると、また伏せる）。相手に見せないための決まり */
let lastTurn: PlayerId = 0;
/** 対戦の形（CPU か、二人で）と、CPU の強さ。参加者 A（あなた / プレイヤー1）の席。CPU が座っている席（CPU 戦でなければ null） */
let vs: 'cpu' | 'local' = 'local';
let cpuLevel = 5;
/** 攻撃技あり（CPU 戦の設定。「同じ相手で、やりなおす」でも引き継ぐ） */
let attacksOn = false;
let seatA: PlayerId = 0;
let cpuSeat: PlayerId | null = null;
/** コイントスの最中は、操作を受け付けない */
let tossing = false;
let cpuReadyAt = 0;

/** Gold と持ち物（この端末のブラウザに保存） */
let wallet: Wallet = loadWallet();
/** 勝敗ログ（この端末のブラウザに保存） */
let matchLog: MatchEntry[] = loadLog();
/** デバッグで勝敗をつけたときは、戦績に残さない */
let debugForcedResult = false;
/** この対局の Gold を、もう受け取ったか */
let awarded = false;

/** 手札で選んでいる（次のタップで使う）能力 */
let armedAbility: AbilityId | null = null;
/** デバッグ: 手札を、全部見えるようにする */
let debugShowAll = false;
/** カットインの演出中は、操作を受け付けない */
let busy = false;
/** 演出の通し番号。デバッグで途中から演出を打ち切って出し直しても、古い演出の後始末が新しい演出を壊さないようにする */
let effectToken = 0;
/** デバッグ: 実際の能力でも、この値のレア度の演出を出す（null なら、能力本来のレア度） */
let rarityOverride: Rarity | null = null;
/** デバッグ: 能力を使っても、手札から減らさない（何回でも使える） */
let keepAbilities = false;

const view = new BoardView(el('stage'), state.size);
view.setInsets(uiInsets);
if (new URLSearchParams(location.search).has('debug')) Object.assign(window, { __view: view }); // 確認用（?debug のときだけ）
function applySkin(): void {
  const s = currentSkin(wallet);
  view.setSkin(s.board, [s.piece.colors[0], s.piece.colors[1]]);
}
applySkin();
const cutinsEl = el('cutins');
const statusEl = el('status');
const msgEl = el('msg');
const hashEl = el('hash');
const abilitiesEl = el('abilities');
const handDescEl = el('hand-desc');
const pcardEls = [el('pcard0'), el('pcard1')] as const;
const btnMove = el<HTMLButtonElement>('btn-move');
const btnWall = el<HTMLButtonElement>('btn-wall');
const btnRotate = el<HTMLButtonElement>('btn-rotate');
const btnLength = el<HTMLButtonElement>('btn-length');
const btnUndo = el<HTMLButtonElement>('btn-undo');
const btnReset = el<HTMLButtonElement>('btn-reset');

/** 人の操作を受け付けないか（演出中・コイントス中・CPU の番） */
function locked(): boolean {
  return busy || tossing || (cpuSeat !== null && state.winner === null && state.turn === cpuSeat);
}

/** 画面に手札を出す席。CPU 戦では、CPU の番でも、あなたの手札のまま */
function handSeat(): PlayerId {
  return cpuSeat === null ? state.turn : cpuSeat === 0 ? 1 : 0;
}

function seatLabel(p: PlayerId): string {
  const isA = p === seatA;
  if (vs === 'cpu') return isA ? 'あなた' : `CPU ${levelStars(cpuLevel)} ${LEVEL_NAMES[cpuLevel - 1] ?? ''}`;
  return isA ? 'プレイヤー1' : 'プレイヤー2';
}

/** 画面に出ている表示の高さ（上: プレイヤーカードと状態、下: 手札とボタン）。盤は、これに被らない所に置く */
let lastInsets: { top: number; bottom: number } | null = null;

function uiInsets(): { top: number; bottom: number } {
  // 勝負がついたあとは、下の表示（残りの手札）の高さが変わって、盤が大きくなったり、下がったりして見えるので、直前の値のままにする
  if (state.winner !== null && lastInsets !== null) return lastInsets;
  const h = window.innerHeight;
  const landscape = window.innerWidth / h >= 1.25;
  let top = el('center').getBoundingClientRect().bottom;
  if (!landscape) for (const c of pcardEls) top = Math.max(top, c.getBoundingClientRect().bottom);
  const row = btnMove.getBoundingClientRect().top;
  let bottomEdge = row;
  if (!landscape && abilitiesEl.childElementCount > 0) bottomEdge = Math.min(bottomEdge, abilitiesEl.getBoundingClientRect().top);
  lastInsets = { top: Math.max(0, top), bottom: Math.max(0, h - bottomEdge) };
  return lastInsets;
}

function ghostKey(w: WallSpec | null): string {
  return w === null ? '' : `${w.o}${w.x},${w.y}${w.half ?? ''}`;
}

function say(text: string): void {
  msgEl.textContent = text;
}

/** 盤の座標での、壁の中心。短い壁は、ふさぐ 1 マスの中心 */
function wallCenter(w: WallSpec): { x: number; y: number } {
  const shift = w.half === undefined ? 0.5 : w.half;
  return w.o === 'h' ? { x: w.x + shift, y: w.y + 0.5 } : { x: w.x + 0.5, y: w.y + shift };
}

/** candidates の壁のうち、盤の座標 (bx, by) にいちばん近いもの（遠すぎれば null）。鉄壁かどうかなどの目印は落として、位置だけ返す */
function nearestWallOf(candidates: readonly WallSpec[], bx: number, by: number): WallSpec | null {
  let best: WallSpec | null = null;
  let bestDist = 1.0;
  for (const w of candidates) {
    const c = wallCenter(w);
    const d = Math.hypot(c.x - bx, c.y - by);
    if (d < bestDist) {
      bestDist = d;
      best = w.half === undefined ? { x: w.x, y: w.y, o: w.o } : { x: w.x, y: w.y, o: w.o, half: w.half };
    }
  }
  return best;
}

/** 壁を選ぶモード（回収・鉄壁・虚無）で、選べる壁 */
function pickCandidates(m: WallPickMode): readonly WallSpec[] {
  if (m === 'void') return voidTargets(state);
  if (m === 'rift') return riftTargets(state);
  if (m === 'seize') return seizeTargets(state);
  return reclaimableWalls(state);
}

function updatePreview(clientX: number, clientY: number): void {
  if (state.winner !== null || (mode !== 'wall' && mode !== 'trapGhost' && !isWallPick(mode))) {
    ghost = null;
    view.setGhost(null, false);
    return;
  }
  const p = view.pick(clientX, clientY);
  if (p === null) return;
  if (mode === 'wall' || mode === 'trapGhost') {
    if (mode === 'wall' && shortMode && state.shortWalls[state.turn] > 0) {
      const s = nearestShortSlot(state.size, p.bx, p.by, orient);
      ghost = shortWallSpec(orient, s.line, s.c, state.size);
    } else {
      const slot = nearestWallSlot(state.size, p.bx, p.by);
      ghost = { x: slot.x, y: slot.y, o: orient };
    }
    view.setGhost(ghost, wallProblem(state, ghost) === null);
  } else if (isWallPick(mode)) {
    ghost = nearestWallOf(pickCandidates(mode), p.bx, p.by);
    view.setGhost(ghost, true);
  }
}

function hasAbility(id: AbilityId): boolean {
  return state.abilities[state.turn].includes(id);
}

/** レア度の色（CSS の変数名）。結果の表示で使う */
function rarityClass(id: AbilityId): string {
  return abilityDef(id).rarity.toLowerCase();
}

/** 小さなアイコンの札（プレイヤーカード・結果の表示用）。レア度の色の面に、アイコン */
function miniCard(id: AbilityId): HTMLSpanElement {
  const s = document.createElement('span');
  s.className = 'mini-card';
  s.style.background = `var(--c-${rarityClass(id)})`;
  s.style.color = '#05030f';
  s.title = abilityDef(id).name;
  attachTip(s, id); // マウスを乗せると、説明が出る（使った技は、相手のものも見られる）
  s.innerHTML = abilityIconSvg(id); // アイコンは、コードで作った SVG（外部の入力ではない）
  return s;
}

function div(className: string, text?: string): HTMLDivElement {
  const d = document.createElement('div');
  d.className = className;
  if (text !== undefined) d.textContent = text;
  return d;
}

/** 手札の中の、攻撃技のカード（公開）。Skill と同じく、タップで選び、もう一度タップで撃つ */
function attackCard(id: AttackId, seat: PlayerId): HTMLButtonElement {
  const def = attackDef(id);
  const used = state.attackUsed[seat];
  const b = document.createElement('button');
  b.className = 'acard legendary attack';
  b.setAttribute('aria-pressed', String(armedAttack || mode === 'atkLaser' || mode === 'atkBomb'));
  b.setAttribute('aria-label', `攻撃技 ${def.name}。${def.text}`);
  const rar = document.createElement('span');
  rar.className = 'acard-rar';
  rar.textContent = 'ATTACK';
  const plate = document.createElement('span');
  plate.className = 'acard-plate';
  plate.innerHTML = attackIconSvg(id); // アイコンは、コードで作った SVG（外部の入力ではない）
  const name = document.createElement('strong');
  name.textContent = def.name;
  const reading = document.createElement('small');
  reading.textContent = def.reading;
  const leftTag = document.createElement('span');
  leftTag.className = 'acard-left';
  leftTag.textContent = used ? '残り 0/1' : '残り 1/1';
  b.append(rar, plate, name, reading, leftTag);
  if (used) {
    b.disabled = true;
    b.classList.add('spent');
  } else if (state.turn === seat && legalAttacks(state).length === 0) b.disabled = true;
  const showDesc = () => fillEffect(handDescEl, def.text, armedAttack ? '→ もう一度タップで撃つ' : undefined);
  b.addEventListener('pointerdown', showDesc);
  b.addEventListener('mouseenter', showDesc);
  b.addEventListener('focus', showDesc);
  const hideDesc = () => {
    handDescEl.textContent = '';
  };
  b.addEventListener('mouseleave', hideDesc);
  b.addEventListener('blur', hideDesc);
  b.addEventListener('click', () => {
    if (locked()) return;
    if (armedAttack) {
      armedAttack = false;
      useAttack(id);
      return;
    }
    armedAbility = null;
    armedAttack = true;
    renderHand();
    fillEffect(handDescEl, def.text, '→ もう一度タップで撃つ');
  });
  return b;
}

/** 手札。手番の人の手札は、いつも見える。相手の手札は、枚数だけ（上のプレイヤーカード） */
function renderHand(): void {
  abilitiesEl.replaceChildren();
  handDescEl.textContent = '';
  if (state.winner !== null) {
    // 勝負がついたので、両方の残りの手札を見せる（種明かし）
    for (const p of [0, 1] as const) {
      const cards = visibleCards(state, p, false);
      if (cards === null || cards.length === 0) continue;
      const row = div('result-hand', `${NAMES[p]}の残り Skill`);
      for (const id of cards) row.appendChild(miniCard(id));
      abilitiesEl.appendChild(row);
    }
    return;
  }
  const seat = handSeat();
  const left = state.abilities[seat];
  // 配られた手札（使ったものも、灰色で残す）。使った枚数は、配られた手札と今の手札の差
  const cards = debugShowAll ? left : newGame(seed).abilities[seat];
  const remaining = [...left];
  const spent = new Set<number>();
  cards.forEach((id, i) => {
    const at = remaining.indexOf(id);
    if (at < 0) spent.add(i);
    else remaining.splice(at, 1);
  });
  // 今の盤で、実際に使える技（使える行動が 1 つでもあるもの）
  const usable = new Set<AbilityId>();
  if (state.turn === seat) for (const a of legalActions(state)) if (a.type === 'ability') usable.add(a.id);
  else for (const id of left) usable.add(id);
  const mineAttack = state.attacks[seat];
  if (mineAttack !== null) abilitiesEl.appendChild(attackCard(mineAttack, seat));
  for (const [i, id] of cards.entries()) {
    const def = abilityDef(id);
    const b = document.createElement('button');
    b.className = `acard ${def.rarity.toLowerCase()}`;
    b.setAttribute('aria-pressed', String(armedAbility === id || modeAbility(mode) === id));
    b.setAttribute('aria-label', `${def.name}。${def.text}`);
    const rar = document.createElement('span');
    rar.className = 'acard-rar';
    rar.textContent = def.rarity;
    const plate = document.createElement('span');
    plate.className = 'acard-plate';
    plate.innerHTML = abilityIconSvg(id); // アイコンは、コードで作った SVG（外部の入力ではない）
    const name = document.createElement('strong');
    name.textContent = def.name;
    const reading = document.createElement('small');
    reading.textContent = def.reading;
    // 残り回数は、カードごとに書く（1 枚は、1 局に 1 回）
    const leftTag = document.createElement('span');
    leftTag.className = 'acard-left';
    leftTag.textContent = spent.has(i) ? '残り 0/1' : '残り 1/1';
    b.append(rar, plate, name, reading, leftTag);
    // 今は使えない技（例: すでに封じている相手への電波妨害、道がなくなる隕石）は、押せなくする
    if (spent.has(i)) {
      b.disabled = true;
      b.classList.add('spent');
      b.setAttribute('aria-label', `${def.name}。使用済み`);
    } else if (!usable.has(id)) b.disabled = true;
    const showDesc = () => {
      fillEffect(handDescEl, def.text, armedAbility === id ? '→ もう一度タップで使う' : undefined);
    };
    // 触れている間は、効果の説明を出す。タップで選び、同じカードをもう一度タップで使う
    b.addEventListener('pointerdown', showDesc);
    b.addEventListener('mouseenter', showDesc);
    b.addEventListener('focus', showDesc);
    // カーソルが外れたら、説明は消す
    const hideDesc = () => {
      handDescEl.textContent = '';
    };
    b.addEventListener('mouseleave', hideDesc);
    b.addEventListener('blur', hideDesc);
    b.addEventListener('click', () => {
      if (locked()) return;
      if (armedAbility === id) {
        armedAbility = null;
        useAbility(id);
        return;
      }
      armedAttack = false;
      armedAbility = id;
      renderHand();
      fillEffect(handDescEl, def.text, '→ もう一度タップで使う');
    });
    abilitiesEl.appendChild(b);
  }
}

/**
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
      } else if (isTrapSkill(id) && state.winner === null && cpuSeat !== null && p === cpuSeat && !debugShowAll) {
        // 相手が使った罠系の Skill は、表向きにしない（罠を使ったことが、分からないように）
        const back = div('mini-back used');
        cards.appendChild(back);
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

    // ATTACK: 攻撃技は、お互いに公開（撃ったあとは、灰色）
    const atk = state.attacks[p];
    if (atk !== null) {
      const row = div('prow');
      const chip = div(`pattack${state.attackUsed[p] ? ' used' : ''}`);
      chip.innerHTML = attackIconSvg(atk); // アイコンは、コードで作った SVG（外部の入力ではない）
      const name = document.createElement('span');
      name.textContent = attackDef(atk).name;
      chip.appendChild(name);
      chip.title = attackDef(atk).text;
      row.append(div('pchip', 'ATTACK'), chip);
      card.appendChild(row);
    }
  }
}

/** カットイン・効果音・3D の演出をまとめて出す。見せ場（impact）で onImpact を呼び、終わると操作を再開する */
function runEffect(name: string, reading: string, rarity: Rarity, player: PlayerId, onImpact?: () => void, spoken?: string): void {
  const token = ++effectToken;
  stopVoice();
  cutinsEl.replaceChildren(); // 演出中に出し直したときは、前の演出を消す
  busy = true;
  const timing = CUTIN_TIMING[rarity];
  playSfx(rarity, timing.impactMs / 1000);
  // 技名を声に出す。名前が決まる少し前に始めると、決まる瞬間に重なる
  shout(spoken ?? name, rarity, timing.impactMs - 150);
  view.playImpact(rarity, timing.impactMs);
  window.setTimeout(() => {
    if (token === effectToken) onImpact?.();
  }, timing.impactMs);
  void playCutIn(cutinsEl, { name, reading, rarity, player }).then(() => {
    if (token !== effectToken) return;
    busy = false;
    refresh();
  });
}

function useAbility(id: AbilityId): void {
  if (locked()) return;
  const def = abilityDef(id);
  // 場所を選ばない能力は、押したらすぐ使う。混沌は、乱数の種も、操作の記録に残す（同じ結果を再現できるように）
  if (INSTANT_ABILITIES.has(id)) {
    play({ type: 'ability', id } as Action);
    return;
  }
  if (id === 'chaos') {
    play({ type: 'ability', id, seed: newSeed() });
    return;
  }
  // 場所や壁を選ぶ能力: もう一度押すと、選ぶのをやめる
  novaFirst = null;
  if (modeAbility(mode) === id) {
    mode = 'move';
    say('');
  } else {
    mode = id === 'nova' ? 'nova1' : (id as Mode);
    trapCell = null;
    // 効果の説明は、カードの上に出ているので、ここでは繰り返さない
    say(isWallPick(mode) ? '対象の壁を選ぶ' : isCellTrap(mode) ? '罠を仕掛けるマスを選ぶ' : mode === 'trapGhost' ? '見えない壁を置く場所を選ぶ' : '行き先のマスを選ぶ');
    if (isWallPick(mode) && pickCandidates(mode).length === 0) {
      mode = 'move';
      say(
        id === 'void' ? '消せる壁がない' : id === 'aegis' ? '鉄壁にできる自分の壁がない' : id === 'rift' ? '回せる壁がない' : id === 'seize' ? '奪える相手の壁がない' : '戻せる自分の壁がない',
      );
    }
  }
  refresh();
}

/** 攻撃技を撃つ。狙いを選ぶもの（レーザー・爆撃）は、狙うマスを選ぶ。ほかは、すぐ撃つ */
function useAttack(id: AttackId): void {
  if (locked()) return;
  if (id === 'atkLaser' || id === 'atkBomb') {
    if (mode === id) {
      mode = 'move';
      say('');
    } else {
      mode = id;
      say(id === 'atkLaser' ? '撃つ列のマスを選ぶ（「向き」ボタンで、横一列 / 縦一列）' : '爆撃の中心のマスを選ぶ');
    }
    refresh();
    return;
  }
  play({ type: 'attack', id });
}

function refresh(): void {
  // 手番が替わったら、手札をまた伏せる（前の人の手札が、次の人に見えないように）
  if (state.turn !== lastTurn) {
    lastTurn = state.turn;
    armedAbility = null;
    armedAttack = false;
  }
  ghost = null;
  view.setGhost(null, false);
  if (state.winner !== null || ((mode === 'wall' || mode === 'trapGhost') && state.wallBlocked[state.turn])) mode = mode === 'wall' || mode === 'trapGhost' ? 'move' : mode;
  if ((mode === 'atkLaser' || mode === 'atkBomb') && legalAttacks(state).length === 0) mode = 'move';
  if (mode !== 'trapShove2') trapCell = null;
  const needed = modeAbility(mode);
  if (needed !== null && !hasAbility(needed)) mode = 'move';
  if (mode !== 'nova2') novaFirst = null;
  if (!(state.shortWalls[state.turn] > 0)) shortMode = false;
  let markers: readonly { x: number; y: number }[] = [];
  if (state.winner === null && !(cpuSeat !== null && state.turn === cpuSeat)) {
    if (mode === 'move' || mode === 'nova1') markers = legalPawnMoves(state);
    else if (mode === 'diagonal') markers = legalDiagonalMoves(state);
    else if (mode === 'leap') markers = legalLeapMoves(state);
    else if (mode === 'nova2' && novaFirst !== null) markers = [novaFirst, ...novaSecondMoves(state, novaFirst)];
    else if (mode === 'trapShove2' && trapCell !== null) {
      const at = trapCell;
      markers = [{ x: at.x, y: at.y - 1 }, { x: at.x, y: at.y + 1 }, { x: at.x - 1, y: at.y }, { x: at.x + 1, y: at.y }].filter(
        (p) => p.x >= 0 && p.y >= 0 && p.x < state.size && p.y < state.size,
      );
    }
  }
  view.setViewer(cpuSeat !== null ? seatA : null);
  view.setState(state, markers);
  if (state.winner !== null) {
    statusEl.textContent = `${NAMES[state.winner]}の勝ち`;
    statusEl.dataset.turn = String(state.winner);
  } else {
    statusEl.textContent = `${NAMES[state.turn]}の番${cpuSeat !== null && state.turn === cpuSeat ? '　CPU 考え中…' : ''}`;
    statusEl.dataset.turn = String(state.turn);
  }
  btnMove.setAttribute('aria-pressed', String(mode === 'move'));
  btnWall.setAttribute('aria-pressed', String(mode === 'wall'));
  btnWall.disabled = state.winner === null && state.wallBlocked[state.turn];
  btnRotate.textContent = mode === 'atkLaser' ? `レーザーの向き: ${orient === 'h' ? '横一列' : '縦一列'}` : `壁の向き: ${orient === 'h' ? '横' : '縦'}`;
  // 短い壁を持っているときだけ、壁の長さを切り替えるボタンを出す
  btnLength.hidden = !(state.winner === null && state.shortWalls[state.turn] > 0);
  btnLength.textContent = `壁の長さ: ${shortMode ? '短（1マス）' : '長（2マス）'}`;
  btnUndo.disabled = log.length === 0;
  hashEl.hidden = !params.has('debug');
  hashEl.textContent = `状態 ${stateHash(state)}　種 ${seed}　${log.length} 手`;
  if (state.winner !== null && cpuSeat !== null && !awarded) {
    // CPU に勝てば多く、負けても少し、Gold がもらえる
    awarded = true;
    const g = goldFor(cpuLevel, state.winner === seatA);
    wallet = earn(wallet, g);
    saveWallet(wallet);
    if (!debugForcedResult) {
      matchLog = addEntry(matchLog, { at: new Date().toISOString(), level: cpuLevel, won: state.winner === seatA, first: seatA === 0, moves: log.length, gold: g });
      saveLog(matchLog);
    }
    const won = state.winner === seatA;
    const foe = `CPU ${levelStars(cpuLevel)} ${LEVEL_NAMES[cpuLevel - 1] ?? ''}`;
    // 最後の一手の演出が落ち着いてから、結果の画面を出す
    window.setTimeout(() => {
      if (state.winner === null) return;
      showResult({ won, gained: g, total: wallet.gold, foe, onAgain: () => resetGame(), onMenu: () => shell.openMenu() });
    }, 1300);
  }
  renderPlayerCards();
  renderHand();
  view.relayout();
}

function play(action: Action): void {
  if (busy) return;
  const r = applyAction(state, action);
  if (!r.ok) {
    say(`できない: ${r.reason}`);
    return;
  }
  const mover = state.turn;
  const before = state;
  say('');
  if (mode !== 'move' && mode !== 'wall') mode = 'move';
  novaFirst = null;
  if (action.type === 'attack') {
    state = r.state;
    log = [...log, action];
    const def = attackDef(action.id);
    runEffect(def.name, def.reading, rarityOverride ?? 'LEGENDARY', mover, refresh, def.shout);
    return;
  }
  if (action.type === 'ability' && isTrapSkill(action.id)) {
    // 罠系の Skill は、演出なし・手番を使わない（使ったことが、相手に知られないように）。続けて、もう一度動ける
    state = r.state;
    log = [...log, action];
    refresh();
    return;
  }
  if (action.type === 'ability') {
    // 状態は確定済み。盤の見た目は、カットインの見せ場で切り替える
    if (keepAbilities) {
      // デバッグ: 手札を減らさず、操作の記録にも入れない（記録の再生で状態がずれないように）
      state = { ...r.state, abilities: before.abilities };
    } else {
      state = r.state;
      log = [...log, action];
    }
    const def = abilityDef(action.id);
    const show = () =>
      runEffect(
        def.name,
        def.reading,
        rarityOverride ?? def.rarity,
        mover,
        () => {
          refresh();
          notifyTrap(before, state, mover, false);
        },
        def.shout,
      );
    // Skill で罠のマスに着いたときは、先に「トラップ発動！」、そのあとに Skill の演出
    const stepped = steppedTrap(before, state);
    if (stepped) {
      busy = true;
      trapBurst(stepped);
      window.setTimeout(show, TRAP_BURST_MS * 0.75);
    } else show();
    return;
  }
  state = r.state;
  log = [...log, action];
  refresh();
  popFor(action, mover);
  notifyTrap(before, state, mover);
}

/** この手で踏まれた罠（なければ undefined） */
function steppedTrap(before: GameState, after: GameState): Trap | undefined {
  return before.traps.find((t) => !after.traps.some((u) => u.x === t.x && u.y === t.y));
}

/** 「トラップ発動！」の演出。罠のあったマスの上に出す（相手の罠も、踏んだ瞬間に姿を見せる） */
function trapBurst(t: Trap): void {
  const w = cellToWorld(state.size, t.x, t.y);
  const p = view.project(w.x, w.z);
  playTrapSfx();
  showTrapBurst(el('pops'), p.x, p.y, t.kind, TRAP_TEXT[t.kind].replace('罠だ！ ', ''));
}

/** 罠を踏んだ・見えない壁にぶつかった・相手が休みになったことを、言葉で知らせる */
function notifyTrap(before: GameState, after: GameState, mover: PlayerId, withBurst = true): void {
  const stepped = steppedTrap(before, after);
  if (stepped) {
    say(TRAP_TEXT[stepped.kind]);
    if (withBurst) trapBurst(stepped);
  }
  else if (after.pawns[mover].x === before.pawns[mover].x && after.pawns[mover].y === before.pawns[mover].y && after.turn !== mover) say('見えない壁にぶつかった！');
  else if (after.winner === null && after.turn === mover && before.turn === mover) say('相手は休み。続けて動ける');
}

const PLAYER_COLOR = ['#ffc928', '#ff4fb8'] as const;

/** 操作に合わせた、漫画の擬音と効果音。壁は「ドン!」、コマは「タッ!」、勝負がついたら「ドォォォン!!」 */
function popFor(action: Action, mover: PlayerId): void {
  const color = PLAYER_COLOR[mover];
  const pops = el('pops');
  if (action.type === 'wall') {
    const w = wallToWorld(state.size, action.x, action.y);
    const p = view.project(w.x, w.z);
    // 鳴らした効果音の名前が、そのまま画面の擬音の文字になる（ドン! ガンッ! カチッ! …）
    showPop(pops, 'wall', p.x, p.y, color, playWallSfx(mover));
  } else if (action.type === 'move') {
    const w = cellToWorld(state.size, action.to.x, action.to.y);
    const p = view.project(w.x, w.z);
    showPop(pops, 'move', p.x, p.y, color, playMoveSfx(mover));
  }
  // CPU 戦は、専用の結果画面を出す（勝ちの擬音が、画面いっぱいに拡大して、見づらかった）。二人で遊ぶときだけ、擬音を出す
  if (state.winner !== null && cpuSeat === null) showPop(pops, 'win', 0, 0, '#ffd46a');
}

function replay(forSeed: number, actions: readonly Action[]): GameState {
  let s = newGame(forSeed, chosenAttacks);
  for (const a of actions) {
    const r = applyAction(s, a);
    if (!r.ok) throw new Error(`再生で反則: ${r.reason}`);
    s = r.state;
  }
  return s;
}

function setMode(next: Mode): void {
  if (locked()) return;
  mode = next;
  say('');
  refresh();
}

/** 超新星の 1 回目: 動けるマスなら、ゴールに着くときはそのまま使い、そうでなければ、2 回目を選ぶ */
function chooseNovaFirst(cell: Pos): void {
  if (!legalPawnMoves(state).some((p) => p.x === cell.x && p.y === cell.y)) {
    say('1 回目に動けないマス');
    return;
  }
  if (cell.y === (state.turn === 0 ? 0 : state.size - 1)) {
    play({ type: 'ability', id: 'nova', first: cell }); // 1 回目でゴール
    return;
  }
  novaFirst = cell;
  mode = 'nova2';
  say('2 回目の行き先を選ぶ（1 回目のマスをもう一度押すと、選び直す）');
  refresh();
}

/** 超新星の 2 回目: 1 回目のマスを押すと、選び直す。動けるマスなら、2 回動く */
function chooseNovaSecond(cell: Pos): void {
  const first = novaFirst;
  if (first === null) return;
  if (cell.x === first.x && cell.y === first.y) {
    novaFirst = null;
    mode = 'nova1';
    say('1 回目の行き先を選ぶ');
    refresh();
    return;
  }
  play({ type: 'ability', id: 'nova', first, second: cell });
}

/** 強制移動の罠: 罠を置くマスを選んだら、次に、飛ばす向き（隣のマス）を選ぶ */
function chooseTrapCell(cell: Pos): void {
  if (!emptyCells(state).some((c) => c.x === cell.x && c.y === cell.y)) {
    say('そのマスには、罠を置けない');
    return;
  }
  trapCell = cell;
  mode = 'trapShove2';
  say('飛ばす向きを選ぶ（光っている隣のマス。罠のマスをもう一度押すと、選び直す）');
  refresh();
}

function chooseTrapDirection(cell: Pos): void {
  const at = trapCell;
  if (at === null) return;
  if (cell.x === at.x && cell.y === at.y) {
    trapCell = null;
    mode = 'trapShove';
    say('罠を仕掛けるマスを選ぶ');
    refresh();
    return;
  }
  const dx = cell.x - at.x;
  const dy = cell.y - at.y;
  if (Math.abs(dx) + Math.abs(dy) !== 1) {
    say('隣のマスで、向きを選ぶ');
    return;
  }
  play({ type: 'ability', id: 'trapShove', at, dx, dy });
}

const stage = el('stage');
let keyAtDown = '';

stage.addEventListener('pointermove', (e) => {
  if (!locked()) updatePreview(e.clientX, e.clientY);
});

stage.addEventListener('pointerdown', (e) => {
  if (locked()) return;
  keyAtDown = ghostKey(ghost);
  updatePreview(e.clientX, e.clientY);
});

stage.addEventListener('pointerup', (e) => {
  if (locked() || state.winner !== null) return;
  if (mode === 'move' || mode === 'diagonal' || mode === 'leap' || mode === 'nova1' || mode === 'nova2' || isCellTrap(mode) || mode === 'trapShove2' || mode === 'atkLaser' || mode === 'atkBomb') {
    const p = view.pick(e.clientX, e.clientY);
    if (p === null) return;
    const cell = nearestCell(state.size, p.bx, p.by);
    if (cell === null) return;
    if (mode === 'move') play({ type: 'move', to: cell });
    else if (mode === 'nova1') chooseNovaFirst(cell);
    else if (mode === 'nova2') chooseNovaSecond(cell);
    else if (mode === 'atkLaser') play({ type: 'attack', id: 'atkLaser', axis: orient === 'h' ? 'row' : 'col', index: orient === 'h' ? cell.y : cell.x });
    else if (mode === 'atkBomb') play({ type: 'attack', id: 'atkBomb', at: cell });
    else if (mode === 'trapShove') chooseTrapCell(cell);
    else if (mode === 'trapShove2') chooseTrapDirection(cell);
    else if (isCellTrap(mode)) play({ type: 'ability', id: mode, at: cell });
    else play({ type: 'ability', id: mode, to: cell });
    return;
  }
  // 壁・回収・鉄壁・虚無: マウスは予告が出ているのでそのまま確定。タッチは 1 回目で予告、同じ場所をもう一度押すと確定
  if (ghost !== null && ghostKey(ghost) === keyAtDown) {
    if (mode === 'wall') play(ghost.half === undefined ? { type: 'wall', x: ghost.x, y: ghost.y, o: ghost.o } : { type: 'wall', x: ghost.x, y: ghost.y, o: ghost.o, half: ghost.half });
    else if (mode === 'trapGhost') play({ type: 'ability', id: 'trapGhost', wall: ghost });
    else if (isWallPick(mode)) play({ type: 'ability', id: mode, wall: ghost });
  } else if (ghost !== null) {
    const problem = mode === 'wall' || mode === 'trapGhost' ? wallProblem(state, ghost) : null;
    say(problem === null ? 'もう一度押すと決まる' : `置けない: ${problem}`);
  }
});

btnMove.addEventListener('click', () => setMode('move'));
btnWall.addEventListener('click', () => setMode('wall'));
btnRotate.addEventListener('click', () => {
  if (locked()) return;
  orient = orient === 'h' ? 'v' : 'h';
  refresh();
});
btnLength.addEventListener('click', () => {
  if (locked()) return;
  shortMode = !shortMode;
  mode = 'wall'; // 長さを選ぶのは、壁を置くとき
  say(shortMode ? '短い壁（1 マス分）で置く' : '');
  refresh();
});
btnUndo.addEventListener('click', () => {
  if (locked() || log.length === 0) return;
  // CPU 戦では、自分の番まで戻す（CPU の手と、自分の手を、いっしょに取り消す）
  let keep = log.length - 1;
  while (keep > 0 && cpuSeat !== null && replay(seed, log.slice(0, keep)).turn !== (cpuSeat === 0 ? 1 : 0)) keep--;
  log = log.slice(0, keep);
  state = replay(seed, log);
  mode = 'move';
  say('');
  refresh();
});
/**
 * 新しい対局。暗転 → コイントス（先手・後手）→ 技を引く（ダーツ）→ 暗転 → 対局、と、場面を順に見せる。
 * 場面は、急に切り替えず、いったん暗転して、幕が斜めに抜けて出る。
 */
async function startMatch(choice: MatchChoice, closeMenu: () => void = () => undefined, animate = true): Promise<void> {
  vs = choice.vs;
  if (choice.vs === 'cpu') {
    cpuLevel = choice.level;
    attacksOn = choice.attacks;
  }
  tossing = true;
  if (animate) await coverScreen();
  closeMenu();
  seed = newSeed();
  chosenAttacks = [null, null];
  state = newGame(seed, chosenAttacks);
  log = [];
  mode = 'move';
  armedAbility = null;
  awarded = false;
  debugForcedResult = false;
  lastInsets = null;
  lastTurn = state.turn;
  const first = tossFirst(seed);
  seatA = seatOfA(first);
  cpuSeat = vs === 'cpu' ? (seatA === 0 ? 1 : 0) : null;
  view.setFlipped(cpuSeat !== null && seatA === 1); // 自分のコマが、いつも手前
  say('');
  refresh();
  if (animate) {
    const hideToss = await showToss(
      { a: seatLabel(seatA), b: seatLabel(seatA === 0 ? 1 : 0), first, firstSeat: NAMES[0], secondSeat: NAMES[1] },
      revealScreen,
    );
    await coverScreen();
    hideToss();
    if (vs === 'cpu') {
      // 引くのは、自分の分だけ。CPU の分は、一言だけ（相手の手札は、見えないまま）
      const mine = state.abilities[seatA];
      const hideDraw = await playDraws(mine, seed, revealScreen, `CPU も ${state.abilities[cpuSeat === null ? 0 : cpuSeat].length} 枚引いた`);
      await coverScreen();
      hideDraw();
    }
  }
  // 攻撃技あり: 配られた 3 つから 1 つ選ぶ（CPU は、乱数で選ぶ）。選んだら、対局の状態に入れる
  if (choice.vs === 'cpu' && choice.attacks) {
    const offers = dealGame(seed).offers;
    const cpuSide: PlayerId = seatA === 0 ? 1 : 0;
    const crng = createRng((seed + 12345) >>> 0);
    const cpuPick = offers[cpuSide][Math.floor(crng() * offers[cpuSide].length)] ?? null;
    let mine: AttackId | null = offers[seatA][0] ?? null;
    if (animate) {
      // 画面は暗転したまま（Skill を引く場面のあと）。選ぶ場面を出して、選んだら、また暗転する
      const picked = await pickAttack(offers[seatA], revealScreen);
      mine = picked.id;
      await coverScreen();
      picked.hide();
    }
    chosenAttacks = seatA === 0 ? [mine, cpuPick] : [cpuPick, mine];
    state = newGame(seed, chosenAttacks);
    lastTurn = state.turn;
  }
  tossing = false;
  refresh();
  if (animate) await revealScreen();
}

function resetGame(closeMenu: () => void = () => undefined): void {
  void startMatch(vs === 'cpu' ? { vs, level: cpuLevel, attacks: attacksOn } : { vs }, closeMenu);
}
btnReset.addEventListener('click', () => {
  if (locked()) return;
  resetGame();
});

// デバッグモード: 右上の DEBUG ボタン（または URL に ?debug）で開く。公開前に外す。
// ・レア度ごとのカットインを、何回でも試せる（演出中でも押し直せる。対局には影響しない）
// ・実際の能力を使ったときの演出のレア度を、好きなものに変えられる
// ・能力を使っても減らさないようにできる（何回でも使える）
/** デバッグで演出だけを試すときの、見本の技名（レア度ごと。「XXXのYYY」と英語 2 語） */
const DEBUG_SAMPLES: Readonly<Record<Rarity, { name: string; reading: string }>> = {
  UNCOMMON: { name: '疾風の双刃', reading: 'Gale Twin' },
  RARE: { name: '蒼氷の螺旋', reading: 'Azure Spiral' },
  EPIC: { name: '深淵の魔弾', reading: 'Abyss Bullet' },
  LEGENDARY: { name: '終焉の雷霆', reading: 'Doom Thunder' },
};

function debugEffect(rarity: Rarity): void {
  const s = DEBUG_SAMPLES[rarity];
  runEffect(s.name, s.reading, rarity, state.turn);
}

/** デバッグ: いまの対局を、自分の勝ち（または負け）にして、結果の流れ（画面・Gold）まで確認する */
function forceWinner(iWin: boolean): void {
  const mine: PlayerId = cpuSeat === null ? 0 : seatA;
  const other: PlayerId = mine === 0 ? 1 : 0;
  debugForcedResult = true;
  state = { ...state, winner: iWin ? mine : other };
  refresh();
}

/**
 * デバッグ: 相手が技を使ったときの表示を見る。いまの対局の、相手（CPU 戦では CPU）の番にして、本物の手札から、使える技を 1 つ使わせる。
 * 相手の色のカットイン、上のプレイヤーカードで、使った技が表向きになる様子、手番の移りが見られる。
 */
function debugFoeSkill(): void {
  if (busy || state.winner !== null) return;
  const foe: PlayerId = cpuSeat ?? (state.turn === 0 ? 1 : 0);
  const asFoe: GameState = { ...state, turn: foe };
  const acts = legalActions(asFoe).filter((a) => a.type === 'ability');
  if (acts.length === 0) {
    say('相手が、いま使える Skill がない（もう使い切った、または、制約に合わない）');
    return;
  }
  const act = acts[Math.floor(Math.random() * acts.length)] as Action;
  state = asFoe;
  mode = 'move';
  play(act);
}

function debugGold(delta: number): void {
  wallet = { ...wallet, gold: Math.max(0, wallet.gold + delta) };
  saveWallet(wallet);
  renderShopUi();
}

function buildDebugPanel(): void {
  const panel = el('debug-panel');
  const btn = el<HTMLButtonElement>('btn-debug');
  const title = (text: string) => {
    const h = document.createElement('h4');
    h.textContent = text;
    return h;
  };

  const previewRow = document.createElement('div');
  previewRow.className = 'row';
  RARITIES.forEach((rarity, i) => {
    const b = document.createElement('button');
    b.textContent = `${i + 1} ${rarity}`;
    b.addEventListener('click', () => debugEffect(rarity));
    previewRow.appendChild(b);
  });

  const select = document.createElement('select');
  const auto = new Option('Skill 本来のレア度', '');
  select.add(auto);
  for (const r of RARITIES) select.add(new Option(`${r} の演出にする`, r));
  select.addEventListener('change', () => {
    rarityOverride = (RARITIES.find((r) => r === select.value) ?? null) as Rarity | null;
  });

  const label = document.createElement('label');
  const check = document.createElement('input');
  check.type = 'checkbox';
  check.addEventListener('change', () => {
    keepAbilities = check.checked;
  });
  label.append(check, 'Skill を使っても減らさない');

  const labelAll = document.createElement('label');
  const checkAll = document.createElement('input');
  checkAll.type = 'checkbox';
  checkAll.addEventListener('change', () => {
    debugShowAll = checkAll.checked;
    refresh();
  });
  labelAll.append(checkAll, 'Skill を、全部見る');

  // ---- 場面・結果・Gold の確認（対局に影響しない演出は、そのまま出す） ----
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
  const foeRow = mkRow([['相手が Skill を使う（本物の手札から）', debugFoeSkill]]);
  const forceRow = mkRow([
    ['自分が勝った状態', () => forceWinner(true)],
    ['自分が負けた状態', () => forceWinner(false)],
  ]);
  const goldRow = mkRow([
    ['+1,000 G', () => debugGold(1000)],
    ['+10,000 G', () => debugGold(10000)],
    ['Gold を 0 に', () => debugGold(-wallet.gold)],
  ]);
  panel.append(title('カットインを試す（何回でも）'), previewRow, title('実際の Skill で使うときの演出'), select, label, labelAll);
  panel.append(title('コイントス'), tossRow, title('Skill を引く演出（レア度ごと）'), drawRow, title('結果の画面（見た目だけ）'), resultRow);
  panel.append(title('相手が Skill を使ったときの表示'), foeRow, title('勝敗を、いまの対局につける（CPU 戦で、結果・Gold まで）'), forceRow, title('Gold'), goldRow);

  const toggle = (open: boolean) => {
    panel.hidden = !open;
    btn.setAttribute('aria-pressed', String(open));
  };
  btn.addEventListener('click', () => toggle(Boolean(panel.hidden)));
  toggle(new URLSearchParams(location.search).has('debug'));

  window.addEventListener('keydown', (e) => {
    if (panel.hidden || shell.isOpen()) return;
    const rarity = RARITIES[Number(e.key) - 1];
    if (rarity !== undefined) debugEffect(rarity);
  });
}
buildDebugPanel();

window.addEventListener('keydown', (e) => {
  if (busy || shell.isOpen()) return;
  if (e.key === 'r' || e.key === 'R') {
    orient = orient === 'h' ? 'v' : 'h';
    refresh();
  } else if (e.key === ' ') {
    e.preventDefault();
    setMode(mode === 'wall' ? 'move' : 'wall');
  }
});

// オープニング・メニュー・技一覧・あそびかた。?skip か ?debug が付いていれば、オープニングを飛ばす
function renderShopUi(): void {
  renderShop(el('shop-body'), el('shop-gold'), wallet, (next) => {
    wallet = next;
    saveWallet(wallet);
    applySkin();
    renderShopUi();
  });
}

const shell = createShell({
  renderShop: renderShopUi,
  renderLog: () => renderLog(el('log-body'), matchLog),
  skipOpening: params.has('skip') || params.has('debug'),
  onSlam: playTitleSfx,
  onStart: (choice, closeMenu) => {
    void startMatch(choice, closeMenu);
  },
  onRestart: (closeMenu) => resetGame(closeMenu),
});
el('btn-codex').addEventListener('click', () => shell.openCodex());
el('btn-menu').addEventListener('click', () => {
  if (!busy) shell.openMenu();
});

/** CPU の番になったら、少し待ってから（考えているように見せる）、手を打つ */
function cpuTick(): void {
  const cpuTurn = cpuSeat !== null && state.winner === null && state.turn === cpuSeat;
  if (!cpuTurn || busy || tossing || shell.isOpen()) {
    cpuReadyAt = 0;
    return;
  }
  const now = performance.now();
  if (cpuReadyAt === 0) {
    cpuReadyAt = now + 700;
    return;
  }
  if (now < cpuReadyAt) return;
  cpuReadyAt = 0;
  say('');
  play(chooseAction(state, cpuLevel, createRng((seed + log.length * 7919) >>> 0)));
}
window.setInterval(cpuTick, 150);

// ボタンの効果音: とじる・戻る = 下がる音、決定・開始（目立つボタン）= 上がる 2 音、ほかは短いピッ（押せないボタンは鳴らさない）
document.addEventListener('click', (e) => {
  const b = (e.target as Element | null)?.closest('button');
  if (!b || b.disabled) return;
  if (b.id.endsWith('-close')) playUiSfx('back');
  else if (b.classList.contains('primary') || b.classList.contains('level-btn') || b.classList.contains('res-btn')) playUiSfx('confirm');
  else playUiSfx('tap');
});

refresh();
