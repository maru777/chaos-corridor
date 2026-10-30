import { LEVEL_NAMES, levelStars } from '../cpu';
import { summarize } from '../matchlog';
import type { MatchEntry } from '../matchlog';

/** 戦績の画面。まとめ（勝率・連勝・強さ別）と、新しい順の一覧（最新 50 件） */

function el<K extends keyof HTMLElementTagNameMap>(tag: K, cls: string, text?: string): HTMLElementTagNameMap[K] {
  const e = document.createElement(tag);
  e.className = cls;
  if (text !== undefined) e.textContent = text;
  return e;
}

const pctText = (r: number | null) => (r === null ? '―' : `${r}%`);

function dateText(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '';
  const p = (n: number) => String(n).padStart(2, '0');
  return `${d.getMonth() + 1}/${d.getDate()} ${p(d.getHours())}:${p(d.getMinutes())}`;
}

export function renderLog(body: HTMLElement, list: readonly MatchEntry[]): void {
  body.replaceChildren();
  const s = summarize(list);
  if (s.games === 0) {
    body.appendChild(el('p', 'log-empty', 'まだ、対局の記録がありません。CPU と対戦すると、ここに残ります。'));
    return;
  }
  const chips = el('div', 'log-chips');
  const chip = (label: string, value: string) => {
    const c = el('div', 'log-chip');
    c.append(el('small', '', label), el('b', '', value));
    return c;
  };
  chips.append(
    chip('対局', `${s.games}`),
    chip('勝ち', `${s.wins}`),
    chip('勝率', pctText(s.rate)),
    chip('連勝中', `${s.streak}`),
    chip('最高の連勝', `${s.bestStreak}`),
    chip('先手の勝率', pctText(s.rateFirst)),
    chip('後手の勝率', pctText(s.rateSecond)),
  );
  body.appendChild(chips);

  const h1 = el('h3', 'shop-h', '強さ別');
  const byLevel = el('div', 'log-levels');
  for (const l of s.byLevel) {
    const row = el('div', 'log-level');
    row.append(el('span', 'log-stars', levelStars(l.level)), el('span', 'log-name', LEVEL_NAMES[l.level - 1] ?? ''), el('b', '', `${l.wins}勝 ${l.games - l.wins}敗`), el('small', '', pctText(l.rate)));
    byLevel.appendChild(row);
  }
  body.append(h1, byLevel);

  const h2 = el('h3', 'shop-h', '最近の対局');
  const rows = el('div', 'log-list');
  for (const e of list.slice(0, 50)) {
    const row = el('div', `log-row ${e.won ? 'won' : 'lost'}`);
    row.append(
      el('b', 'log-result', e.won ? '勝' : '負'),
      el('span', 'log-vs', `${levelStars(e.level)} ${e.first ? '先手' : '後手'}`),
      el('small', 'log-moves', `${e.moves}手`),
      el('span', 'log-gold', `+${e.gold.toLocaleString('ja-JP')} G`),
      el('small', 'log-date', dateText(e.at)),
    );
    rows.appendChild(row);
  }
  body.append(h2, rows);
}
