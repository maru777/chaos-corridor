import { ITEMS, buy, equip } from '../shop';
import type { ShopItem, Wallet } from '../shop';

/** ショップの画面。買う・身につけるの結果は、onChange で、新しい持ち物として返す（保存は呼ぶ側） */

function hex(c: number): string {
  return `#${c.toString(16).padStart(6, '0')}`;
}

function swatch(item: ShopItem): HTMLElement {
  const s = document.createElement('span');
  s.className = `swatch ${item.slot}`;
  if (item.board !== undefined) {
    s.style.background = hex(item.board.tile);
    s.style.boxShadow = `inset 0 0 0 4px ${hex(item.board.rim)}`;
  } else if (item.piece !== undefined) {
    s.style.background = `radial-gradient(circle at 30% 50%, ${hex(item.piece.colors[0])} 0 22%, transparent 24%), radial-gradient(circle at 70% 50%, ${hex(item.piece.colors[1])} 0 22%, transparent 24%), #14102e`;
  }
  return s;
}

export function renderShop(body: HTMLElement, goldEl: HTMLElement, w: Wallet, onChange: (next: Wallet) => void): void {
  goldEl.textContent = `${w.gold.toLocaleString('ja-JP')} G`;
  body.replaceChildren();
  const groups: readonly { slot: ShopItem['slot']; title: string }[] = [
    { slot: 'board', title: '盤の見た目' },
    { slot: 'piece', title: 'コマの見た目' },
  ];
  for (const g of groups) {
    const h = document.createElement('h3');
    h.className = 'shop-h';
    h.textContent = g.title;
    const list = document.createElement('div');
    list.className = 'shop-list';
    for (const item of ITEMS.filter((i) => i.slot === g.slot)) {
      const owned = w.owned.includes(item.id);
      const on = w.equipped[item.slot] === item.id;
      const row = document.createElement('div');
      row.className = `shop-item${on ? ' on' : ''}`;
      const name = document.createElement('strong');
      name.textContent = item.name;
      const price = document.createElement('small');
      price.textContent = owned ? (on ? '身につけている' : '持っている') : `${item.price.toLocaleString('ja-JP')} G`;
      const btn = document.createElement('button');
      btn.className = 'shop-btn';
      if (on) {
        btn.textContent = '装備中';
        btn.disabled = true;
      } else if (owned) {
        btn.textContent = '装備する';
        btn.addEventListener('click', () => {
          const r = equip(w, item.id);
          if (r.ok) onChange(r.wallet);
        });
      } else {
        btn.textContent = '買う';
        btn.disabled = w.gold < item.price;
        btn.addEventListener('click', () => {
          const r = buy(w, item.id);
          if (r.ok) onChange(r.wallet);
        });
      }
      const info = document.createElement('span');
      info.className = 'shop-info';
      info.append(name, price);
      row.append(swatch(item), info, btn);
      list.appendChild(row);
    }
    body.append(h, list);
  }
}
