import { applyAction, initialState, legalPawnMoves, stateHash, wallProblem } from './index';
import type { Action, GameState, Orientation, Wall } from './index';
import { BoardView } from './view/board3d';
import { nearestCell, nearestWallSlot } from './view/layout';

type Mode = 'move' | 'wall';

function el<T extends HTMLElement>(id: string): T {
  const e = document.getElementById(id);
  if (!e) throw new Error(`#${id} が見つからない`);
  return e as T;
}

const NAMES = ['先手（青）', '後手（桃）'] as const;

let state: GameState = initialState();
let log: Action[] = [];
let mode: Mode = 'move';
let orient: Orientation = 'h';
let ghost: Wall | null = null;

const view = new BoardView(el('stage'), state.size);
const statusEl = el('status');
const msgEl = el('msg');
const hashEl = el('hash');
const btnMove = el<HTMLButtonElement>('btn-move');
const btnWall = el<HTMLButtonElement>('btn-wall');
const btnRotate = el<HTMLButtonElement>('btn-rotate');
const btnUndo = el<HTMLButtonElement>('btn-undo');
const btnReset = el<HTMLButtonElement>('btn-reset');

function ghostKey(w: Wall | null): string {
  return w === null ? '' : `${w.o}${w.x},${w.y}`;
}

function say(text: string): void {
  msgEl.textContent = text;
}

function updateGhost(clientX: number, clientY: number): void {
  if (mode !== 'wall' || state.winner !== null) {
    ghost = null;
    view.setGhost(null, false);
    return;
  }
  const p = view.pick(clientX, clientY);
  if (p === null) return;
  const slot = nearestWallSlot(state.size, p.bx, p.by);
  ghost = { x: slot.x, y: slot.y, o: orient };
  view.setGhost(ghost, wallProblem(state, ghost) === null);
}

function refresh(): void {
  ghost = null;
  view.setGhost(null, false);
  view.setState(state, state.winner === null && mode === 'move' ? legalPawnMoves(state) : []);
  if (state.winner !== null) {
    statusEl.textContent = `${NAMES[state.winner]}の勝ち`;
    statusEl.dataset.turn = String(state.winner);
  } else {
    statusEl.textContent = `${NAMES[state.turn]}の番　壁 残り ${state.wallsLeft[state.turn]}`;
    statusEl.dataset.turn = String(state.turn);
  }
  btnMove.setAttribute('aria-pressed', String(mode === 'move'));
  btnWall.setAttribute('aria-pressed', String(mode === 'wall'));
  btnRotate.textContent = `壁の向き: ${orient === 'h' ? '横' : '縦'}`;
  btnUndo.disabled = log.length === 0;
  hashEl.textContent = `状態 ${stateHash(state)}　${log.length} 手`;
}

function play(action: Action): void {
  const r = applyAction(state, action);
  if (!r.ok) {
    say(`置けない: ${r.reason}`);
    return;
  }
  state = r.state;
  log = [...log, action];
  say('');
  refresh();
}

function replay(actions: readonly Action[]): GameState {
  let s = initialState();
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

stage.addEventListener('pointermove', (e) => updateGhost(e.clientX, e.clientY));

stage.addEventListener('pointerdown', (e) => {
  keyAtDown = ghostKey(ghost);
  updateGhost(e.clientX, e.clientY);
});

stage.addEventListener('pointerup', (e) => {
  if (state.winner !== null) return;
  if (mode === 'move') {
    const p = view.pick(e.clientX, e.clientY);
    if (p === null) return;
    const cell = nearestCell(state.size, p.bx, p.by);
    if (cell !== null) play({ type: 'move', to: cell });
    return;
  }
  // 壁: マウスは予告が出ているのでそのまま置く。タッチは 1 回目で予告、同じ場所をもう一度押すと置く
  if (ghost !== null && ghostKey(ghost) === keyAtDown) {
    play({ type: 'wall', x: ghost.x, y: ghost.y, o: ghost.o });
  } else if (ghost !== null) {
    const problem = wallProblem(state, ghost);
    say(problem === null ? 'もう一度押すと置く' : `置けない: ${problem}`);
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
  state = replay(log);
  say('');
  refresh();
});
btnReset.addEventListener('click', () => {
  state = initialState();
  log = [];
  say('');
  refresh();
});

window.addEventListener('keydown', (e) => {
  if (e.key === 'r' || e.key === 'R') {
    orient = orient === 'h' ? 'v' : 'h';
    refresh();
  } else if (e.key === ' ') {
    e.preventDefault();
    setMode(mode === 'move' ? 'wall' : 'move');
  }
});

refresh();
