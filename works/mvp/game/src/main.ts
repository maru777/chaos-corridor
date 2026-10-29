import { abilityDef, applyAction, legalDiagonalMoves, legalPawnMoves, newGame, reclaimableWalls, stateHash, wallProblem } from './index';
import type { AbilityId, Action, GameState, Orientation, WallSpec } from './index';
import { BoardView } from './view/board3d';
import { nearestCell, nearestWallSlot } from './view/layout';

type Mode = 'move' | 'wall' | 'diagonal' | 'reclaim';

function el<T extends HTMLElement>(id: string): T {
  const e = document.getElementById(id);
  if (!e) throw new Error(`#${id} が見つからない`);
  return e as T;
}

const NAMES = ['先手（青）', '後手（桃）'] as const;

function newSeed(): number {
  return Math.floor(Math.random() * 0xffffffff);
}

let seed = newSeed();
let state: GameState = newGame(seed);
let log: Action[] = [];
let mode: Mode = 'move';
let orient: Orientation = 'h';
let ghost: WallSpec | null = null;

const view = new BoardView(el('stage'), state.size);
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
    if (id === 'jam' && state.wallBlocked[state.turn === 0 ? 1 : 0]) b.disabled = true;
    b.addEventListener('click', () => useAbility(id));
    abilitiesEl.appendChild(b);
  }
}

function useAbility(id: AbilityId): void {
  const def = abilityDef(id);
  if (id === 'jam') {
    play({ type: 'ability', id: 'jam' });
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
  if ((mode === 'diagonal' || mode === 'reclaim') && !hasAbility(mode)) mode = 'move';
  let markers: readonly { x: number; y: number }[] = [];
  if (state.winner === null) {
    if (mode === 'move') markers = legalPawnMoves(state);
    else if (mode === 'diagonal') markers = legalDiagonalMoves(state);
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
  const r = applyAction(state, action);
  if (!r.ok) {
    say(`できない: ${r.reason}`);
    return;
  }
  state = r.state;
  log = [...log, action];
  say('');
  if (mode === 'diagonal' || mode === 'reclaim') mode = 'move';
  refresh();
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
  mode = next;
  say('');
  refresh();
}

const stage = el('stage');
let keyAtDown = '';

stage.addEventListener('pointermove', (e) => updatePreview(e.clientX, e.clientY));

stage.addEventListener('pointerdown', (e) => {
  keyAtDown = ghostKey(ghost);
  updatePreview(e.clientX, e.clientY);
});

stage.addEventListener('pointerup', (e) => {
  if (state.winner !== null) return;
  if (mode === 'move' || mode === 'diagonal') {
    const p = view.pick(e.clientX, e.clientY);
    if (p === null) return;
    const cell = nearestCell(state.size, p.bx, p.by);
    if (cell === null) return;
    play(mode === 'move' ? { type: 'move', to: cell } : { type: 'ability', id: 'diagonal', to: cell });
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
  orient = orient === 'h' ? 'v' : 'h';
  refresh();
});
btnUndo.addEventListener('click', () => {
  if (log.length === 0) return;
  log = log.slice(0, -1);
  state = replay(seed, log);
  mode = 'move';
  say('');
  refresh();
});
btnReset.addEventListener('click', () => {
  seed = newSeed();
  state = newGame(seed);
  log = [];
  mode = 'move';
  say('');
  refresh();
});

window.addEventListener('keydown', (e) => {
  if (e.key === 'r' || e.key === 'R') {
    orient = orient === 'h' ? 'v' : 'h';
    refresh();
  } else if (e.key === ' ') {
    e.preventDefault();
    setMode(mode === 'wall' ? 'move' : 'wall');
  }
});

refresh();
