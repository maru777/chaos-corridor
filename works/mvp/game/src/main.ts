import {
  RARITIES,
  abilityDef,
  applyAction,
  legalActions,
  legalDiagonalMoves,
  legalLeapMoves,
  legalPawnMoves,
  newGame,
  reclaimableWalls,
  stateHash,
  wallProblem,
} from './index';
import type { AbilityId, Action, GameState, Orientation, PlayerId, Rarity, WallSpec } from './index';
import { BoardView } from './view/board3d';
import { CUTIN_TIMING, playCutIn } from './view/cutin';
import { cellToWorld, nearestCell, nearestWallSlot, wallToWorld } from './view/layout';
import { showPop } from './view/popsfx';
import { playMoveSfx, playSfx, playWallSfx } from './view/sfx';
import { shout, stopVoice } from './view/voice';

type Mode = 'move' | 'wall' | 'diagonal' | 'leap' | 'reclaim';

function el<T extends HTMLElement>(id: string): T {
  const e = document.getElementById(id);
  if (!e) throw new Error(`#${id} が見つからない`);
  return e as T;
}

const NAMES = ['先手（黄）', '後手（桃）'] as const;

function newSeed(): number {
  return Math.floor(Math.random() * 0xffffffff);
}

// URL に ?seed=数字 を付けると、その種で始まる（同じ手札を再現できる。確認や不具合の再現用）
const seedParam = Number(new URLSearchParams(location.search).get('seed'));
let seed = Number.isInteger(seedParam) && seedParam > 0 ? seedParam : newSeed();
let state: GameState = newGame(seed);
let log: Action[] = [];
let mode: Mode = 'move';
let orient: Orientation = 'h';
let ghost: WallSpec | null = null;
/** カットインの演出中は、操作を受け付けない */
let busy = false;
/** 演出の通し番号。デバッグで途中から演出を打ち切って出し直しても、古い演出の後始末が新しい演出を壊さないようにする */
let effectToken = 0;
/** デバッグ: 実際の能力でも、この値のレア度の演出を出す（null なら、能力本来のレア度） */
let rarityOverride: Rarity | null = null;
/** デバッグ: 能力を使っても、手札から減らさない（何回でも使える） */
let keepAbilities = false;

const view = new BoardView(el('stage'), state.size);
const cutinsEl = el('cutins');
const statusEl = el('status');
const msgEl = el('msg');
const hashEl = el('hash');
const abilitiesEl = el('abilities');
const btnMove = el<HTMLButtonElement>('btn-move');
const btnWall = el<HTMLButtonElement>('btn-wall');
const btnRotate = el<HTMLButtonElement>('btn-rotate');
const btnUndo = el<HTMLButtonElement>('btn-undo');
const btnReset = el<HTMLButtonElement>('btn-reset');

function ghostKey(w: WallSpec | null): string {
  return w === null ? '' : `${w.o}${w.x},${w.y}`;
}

function say(text: string): void {
  msgEl.textContent = text;
}

function nearestOwnWall(bx: number, by: number): WallSpec | null {
  let best: WallSpec | null = null;
  let bestDist = 1.0;
  for (const w of reclaimableWalls(state)) {
    const d = Math.hypot(w.x + 0.5 - bx, w.y + 0.5 - by);
    if (d < bestDist) {
      bestDist = d;
      best = { x: w.x, y: w.y, o: w.o };
    }
  }
  return best;
}

function updatePreview(clientX: number, clientY: number): void {
  if (state.winner !== null || (mode !== 'wall' && mode !== 'reclaim')) {
    ghost = null;
    view.setGhost(null, false);
    return;
  }
  const p = view.pick(clientX, clientY);
  if (p === null) return;
  if (mode === 'wall') {
    const slot = nearestWallSlot(state.size, p.bx, p.by);
    ghost = { x: slot.x, y: slot.y, o: orient };
    view.setGhost(ghost, wallProblem(state, ghost) === null);
  } else {
    ghost = nearestOwnWall(p.bx, p.by);
    view.setGhost(ghost, true);
  }
}

function hasAbility(id: AbilityId): boolean {
  return state.abilities[state.turn].includes(id);
}

function renderAbilities(): void {
  abilitiesEl.replaceChildren();
  if (state.winner !== null) return;
  const mine = state.abilities[state.turn];
  if (mine.length === 0) {
    const none = document.createElement('span');
    none.className = 'ability-none';
    none.textContent = '使える能力なし';
    abilitiesEl.appendChild(none);
    return;
  }
  // 今の盤で、実際に使える能力（使える行動が 1 つでもあるもの）
  const usable = new Set<AbilityId>();
  for (const a of legalActions(state)) if (a.type === 'ability') usable.add(a.id);
  for (const id of mine) {
    const def = abilityDef(id);
    const b = document.createElement('button');
    b.className = `ability ${def.rarity.toLowerCase()}`;
    b.title = def.text;
    b.setAttribute('aria-pressed', String(mode === id));
    const name = document.createElement('strong');
    name.textContent = def.name;
    const reading = document.createElement('small');
    reading.textContent = `《${def.reading}》`;
    b.append(name, reading);
    // 今は使えない能力（例: すでに封じている相手への電波妨害、道がなくなる隕石）は、押せなくする
    if (!usable.has(id)) b.disabled = true;
    b.addEventListener('click', () => useAbility(id));
    abilitiesEl.appendChild(b);
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
  if (busy) return;
  const def = abilityDef(id);
  // 場所を選ばない能力は、押したらすぐ使う
  if (id === 'jam' || id === 'meteor') {
    play({ type: 'ability', id });
    return;
  }
  mode = mode === id ? 'move' : id;
  say(mode === id ? def.text : '');
  if (mode === 'reclaim' && reclaimableWalls(state).length === 0) {
    mode = 'move';
    say('戻せる自分の壁がない');
  }
  refresh();
}

function refresh(): void {
  ghost = null;
  view.setGhost(null, false);
  if (state.winner !== null || (mode === 'wall' && state.wallBlocked[state.turn])) mode = mode === 'wall' ? 'move' : mode;
  if ((mode === 'diagonal' || mode === 'leap' || mode === 'reclaim') && !hasAbility(mode)) mode = 'move';
  let markers: readonly { x: number; y: number }[] = [];
  if (state.winner === null) {
    if (mode === 'move') markers = legalPawnMoves(state);
    else if (mode === 'diagonal') markers = legalDiagonalMoves(state);
    else if (mode === 'leap') markers = legalLeapMoves(state);
  }
  view.setState(state, markers);
  if (state.winner !== null) {
    statusEl.textContent = `${NAMES[state.winner]}の勝ち`;
    statusEl.dataset.turn = String(state.winner);
  } else {
    const blocked = state.wallBlocked[state.turn] ? '　【壁封じ中】' : '';
    statusEl.textContent = `${NAMES[state.turn]}の番　壁 残り ${state.wallsLeft[state.turn]}${blocked}`;
    statusEl.dataset.turn = String(state.turn);
  }
  btnMove.setAttribute('aria-pressed', String(mode === 'move'));
  btnWall.setAttribute('aria-pressed', String(mode === 'wall'));
  btnWall.disabled = state.winner === null && state.wallBlocked[state.turn];
  btnRotate.textContent = `壁の向き: ${orient === 'h' ? '横' : '縦'}`;
  btnUndo.disabled = log.length === 0;
  hashEl.textContent = `状態 ${stateHash(state)}　種 ${seed}　${log.length} 手`;
  renderAbilities();
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
  if (mode === 'diagonal' || mode === 'leap' || mode === 'reclaim') mode = 'move';
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
    runEffect(def.name, def.reading, rarityOverride ?? def.rarity, mover, refresh, def.shout);
    return;
  }
  state = r.state;
  log = [...log, action];
  refresh();
  popFor(action, mover);
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
  if (state.winner !== null) showPop(pops, 'win', 0, 0, '#ffd46a');
}

function replay(forSeed: number, actions: readonly Action[]): GameState {
  let s = newGame(forSeed);
  for (const a of actions) {
    const r = applyAction(s, a);
    if (!r.ok) throw new Error(`再生で反則: ${r.reason}`);
    s = r.state;
  }
  return s;
}

function setMode(next: Mode): void {
  if (busy) return;
  mode = next;
  say('');
  refresh();
}

const stage = el('stage');
let keyAtDown = '';

stage.addEventListener('pointermove', (e) => {
  if (!busy) updatePreview(e.clientX, e.clientY);
});

stage.addEventListener('pointerdown', (e) => {
  if (busy) return;
  keyAtDown = ghostKey(ghost);
  updatePreview(e.clientX, e.clientY);
});

stage.addEventListener('pointerup', (e) => {
  if (busy || state.winner !== null) return;
  if (mode === 'move' || mode === 'diagonal' || mode === 'leap') {
    const p = view.pick(e.clientX, e.clientY);
    if (p === null) return;
    const cell = nearestCell(state.size, p.bx, p.by);
    if (cell === null) return;
    play(mode === 'move' ? { type: 'move', to: cell } : { type: 'ability', id: mode, to: cell });
    return;
  }
  // 壁・回収: マウスは予告が出ているのでそのまま確定。タッチは 1 回目で予告、同じ場所をもう一度押すと確定
  if (ghost !== null && ghostKey(ghost) === keyAtDown) {
    if (mode === 'wall') play({ type: 'wall', x: ghost.x, y: ghost.y, o: ghost.o });
    else play({ type: 'ability', id: 'reclaim', wall: ghost });
  } else if (ghost !== null) {
    const problem = mode === 'wall' ? wallProblem(state, ghost) : null;
    say(problem === null ? 'もう一度押すと決まる' : `置けない: ${problem}`);
  }
});

btnMove.addEventListener('click', () => setMode('move'));
btnWall.addEventListener('click', () => setMode('wall'));
btnRotate.addEventListener('click', () => {
  if (busy) return;
  orient = orient === 'h' ? 'v' : 'h';
  refresh();
});
btnUndo.addEventListener('click', () => {
  if (busy || log.length === 0) return;
  log = log.slice(0, -1);
  state = replay(seed, log);
  mode = 'move';
  say('');
  refresh();
});
btnReset.addEventListener('click', () => {
  if (busy) return;
  seed = newSeed();
  state = newGame(seed);
  log = [];
  mode = 'move';
  say('');
  refresh();
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
  const auto = new Option('能力本来のレア度', '');
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
  label.append(check, '能力を使っても減らさない');

  panel.append(title('カットインを試す（何回でも）'), previewRow, title('実際の能力で使うときの演出'), select, label);

  const toggle = (open: boolean) => {
    panel.hidden = !open;
    btn.setAttribute('aria-pressed', String(open));
  };
  btn.addEventListener('click', () => toggle(Boolean(panel.hidden)));
  toggle(new URLSearchParams(location.search).has('debug'));

  window.addEventListener('keydown', (e) => {
    if (panel.hidden) return;
    const rarity = RARITIES[Number(e.key) - 1];
    if (rarity !== undefined) debugEffect(rarity);
  });
}
buildDebugPanel();

window.addEventListener('keydown', (e) => {
  if (busy) return;
  if (e.key === 'r' || e.key === 'R') {
    orient = orient === 'h' ? 'v' : 'h';
    refresh();
  } else if (e.key === ' ') {
    e.preventDefault();
    setMode(mode === 'wall' ? 'move' : 'wall');
  }
});

refresh();
