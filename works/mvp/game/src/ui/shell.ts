import { createRng } from '../rng';
import { burstPath } from '../view/fxplan';
import { renderCodex } from './codex';
import { SLAM_MS, menuItems, nextPhase } from './opening';
import type { MenuItem, OpeningEvent, OpeningPhase } from './opening';
import { RULES } from './rules';

/**
 * オープニング（タイトル）・メニュー・技一覧・あそびかたの、画面の出し入れ。
 * 流れ自体（どの状態から、どこへ進むか）は opening.ts にあり、ここは、それを画面につなぐだけ。
 */

export interface ShellOptions {
  /** true なら、オープニングを飛ばして、すぐ対局（確認用の URL で使う） */
  readonly skipOpening: boolean;
  /** ロゴが落ちる瞬間に呼ばれる（効果音を鳴らす。ユーザーが押した直後なので、音を出せる） */
  readonly onSlam: () => void;
  /** 「はじめる」が押されたとき */
  readonly onStart: () => void;
  /** 「最初からやりなおす」が押されたとき */
  readonly onRestart: () => void;
}

export interface Shell {
  /** オープニング・メニュー・技一覧・あそびかたの、どれかが出ているか（出ている間は、盤を操作させない） */
  isOpen(): boolean;
  openMenu(): void;
}

function byId<T extends HTMLElement>(id: string): T {
  const e = document.getElementById(id);
  if (!e) throw new Error(`#${id} が見つからない`);
  return e as T;
}

export function createShell(opts: ShellOptions): Shell {
  const root = byId('opening');
  const menu = byId('op-menu');
  const codex = byId('codex');
  const rules = byId('rules');

  let phase: OpeningPhase = opts.skipOpening ? 'closed' : 'splash';
  let started = opts.skipOpening;
  let slamTimer: number | undefined;

  // ロゴの「ドン!!」の爆発の形（毎回同じ形）
  byId('op-burst-path').setAttribute('d', burstPath(createRng(7), 98, 62, 13));

  // あそびかたの文章を作る
  const rulesBody = byId('rules-body');
  for (const section of RULES) {
    const box = document.createElement('section');
    box.className = 'rules-section';
    const h = document.createElement('h3');
    h.textContent = section.title;
    const ul = document.createElement('ul');
    for (const line of section.lines) {
      const li = document.createElement('li');
      li.textContent = line;
      ul.appendChild(li);
    }
    box.append(h, ul);
    rulesBody.appendChild(box);
  }

  function setPhase(next: OpeningPhase): void {
    phase = next;
    root.dataset['phase'] = next;
    if (next === 'menu') renderMenu();
  }

  function dispatch(event: OpeningEvent): void {
    const next = nextPhase(phase, event);
    if (next === phase) return;
    window.clearTimeout(slamTimer);
    setPhase(next);
    if (next === 'slam') {
      opts.onSlam();
      slamTimer = window.setTimeout(() => dispatch('slamDone'), SLAM_MS);
    }
  }

  function openModal(m: HTMLElement): void {
    if (m === codex) renderCodex(byId('codex-body'));
    m.hidden = false;
  }

  function closeModal(m: HTMLElement): void {
    m.hidden = true;
  }

  function choose(item: MenuItem): void {
    switch (item.id) {
      case 'start':
        started = true;
        dispatch('start');
        opts.onStart();
        break;
      case 'resume':
        dispatch('resume');
        break;
      case 'restart':
        opts.onRestart();
        dispatch('resume');
        break;
      case 'codex':
        openModal(codex);
        break;
      case 'rules':
        openModal(rules);
        break;
    }
  }

  function renderMenu(): void {
    menu.replaceChildren();
    for (const item of menuItems(started)) {
      const b = document.createElement('button');
      b.className = `op-btn${item.primary ? ' primary' : ''}`;
      b.textContent = item.label;
      b.addEventListener('click', () => choose(item));
      menu.appendChild(b);
    }
  }

  // ロゴの画面や、演出の最中は、どこを押しても進む
  root.addEventListener('click', () => {
    if (phase === 'splash' || phase === 'slam') dispatch('tap');
  });

  byId('codex-close').addEventListener('click', () => closeModal(codex));
  byId('rules-close').addEventListener('click', () => closeModal(rules));
  for (const m of [codex, rules]) {
    m.addEventListener('click', (e) => {
      if (e.target === m) closeModal(m); // 枠の外を押したら閉じる
    });
  }

  window.addEventListener('keydown', (e) => {
    if (e.key !== 'Escape') return;
    if (!codex.hidden) closeModal(codex);
    else if (!rules.hidden) closeModal(rules);
    else if (phase === 'menu' && started) dispatch('resume');
  });

  setPhase(phase);

  return {
    isOpen: () => phase !== 'closed' || !codex.hidden || !rules.hidden,
    openMenu: () => dispatch('openMenu'),
  };
}
