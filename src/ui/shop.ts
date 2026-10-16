// The Shop and Inventory pages inside the gear menu. They only show things
// and pass button presses on; the rules (prices, owning, wearing) live in
// src/game/economy.ts.

import { STRINGS } from '../strings';
import { CONFIG } from '../game/config';
import { HATS, foodCount } from '../game/economy';
import type { GameState } from '../game/state';
import type { Food, FoodId } from '../game/actions';
import { ITEM_ICONS, STAT_ICONS } from './icons';

export interface ShopCallbacks {
  onBuyFood: (food: FoodId) => void;
  onBuyHat: (hat: string) => void;
  onWearHat: (hat: string | null) => void;
  // The picture of a hat, as a URL (from its sprite sheet), if loaded.
  hatImage: (hat: string) => string | undefined;
}

// "[coin] 120"
export function goldPill(gold: number): HTMLElement {
  const el = document.createElement('span');
  el.className = 'gold-pill';
  el.title = STRINGS.gold.label;
  el.innerHTML = STAT_ICONS.gold;
  el.append(STRINGS.gold.amount(gold));
  return el;
}

function hatIcon(url: string | undefined): string {
  // Shows the large version (the right half of the hat's sheet).
  return url ? `<span class="hat-icon" style="background-image:url('${url}')"></span>` : '';
}

// One row: [icon] [name / small note] [button or label]
function row(icon: string, name: string, note: string, action: HTMLElement): HTMLElement {
  const el = document.createElement('div');
  el.className = 'shop-row';
  const i = document.createElement('span');
  i.className = 'drawer-option-icon';
  i.innerHTML = icon;
  const text = document.createElement('span');
  text.className = 'shop-row-text';
  const n = document.createElement('b');
  n.textContent = name;
  const small = document.createElement('small');
  small.textContent = note;
  text.append(n, small);
  el.append(i, text, action);
  return el;
}

function button(content: string | HTMLElement, onClick: () => void, className = 'shop-btn'): HTMLButtonElement {
  const b = document.createElement('button');
  b.className = className;
  b.append(content);
  b.addEventListener('click', onClick);
  return b;
}

function priceButton(price: number, gold: number, onClick: () => void): HTMLButtonElement {
  const b = button(goldPill(price), onClick);
  b.classList.toggle('too-pricey', gold < price); // still tappable, so it can say why
  return b;
}

function label(text: string): HTMLElement {
  const el = document.createElement('span');
  el.className = 'shop-label';
  el.textContent = text;
  return el;
}

// One item in a category: its full row, and its little picture for the
// folded-up grid. `mark` highlights the picture (e.g. the hat being worn),
// `faded` dims it (e.g. a hat you already own, in the Shop), and `count`
// shows a small number in its corner (how many of a food you have).
interface Entry {
  icon: string;
  row: HTMLElement;
  count?: string;
  mark?: boolean;
  faded?: boolean;
}

// A category such as "Food" or "Hats". Folded up (the default) it shows
// only the items' pictures in a small grid; tap the title, or any picture,
// to unfold it into the full rows. `open` remembers which categories are
// unfolded, so they stay that way when the page redraws after buying.
function category(id: string, title: string, entries: Entry[], open: Set<string>, empty?: string): HTMLElement {
  const el = document.createElement('section');
  el.className = 'shop-cat';

  const head = document.createElement('button');
  head.className = 'shop-cat-head';
  head.innerHTML = `<span></span><span class="shop-cat-chevron" aria-hidden="true"></span>`;
  head.firstElementChild!.textContent = title;

  const grid = document.createElement('div');
  grid.className = 'shop-cat-grid';
  for (const e of entries) {
    const b = document.createElement('button');
    b.className = 'shop-cat-tile';
    b.innerHTML = e.icon;
    b.classList.toggle('mark', !!e.mark);
    b.classList.toggle('faded', !!e.faded);
    if (e.count) {
      const c = document.createElement('span');
      c.className = 'shop-cat-count';
      c.textContent = e.count;
      b.append(c);
    }
    const name = e.row.querySelector('b')?.textContent ?? '';
    b.title = name;
    b.setAttribute('aria-label', name);
    b.addEventListener('click', () => setOpen(true));
    grid.append(b);
  }

  const rows = document.createElement('div');
  rows.className = 'shop-cat-rows';
  rows.append(...entries.map((e) => e.row));

  el.append(head);
  if (entries.length === 0 && empty) el.append(label(empty));
  else el.append(grid, rows);

  function setOpen(isOpen: boolean): void {
    if (isOpen) open.add(id);
    else open.delete(id);
    el.classList.toggle('is-open', isOpen);
    head.setAttribute('aria-expanded', String(isOpen));
  }
  head.addEventListener('click', () => setOpen(!open.has(id)));
  setOpen(open.has(id));
  return el;
}

// The number in a picture's corner: nothing for none, ∞ for free food.
function countBadge(count: number): string | undefined {
  if (count === 0) return undefined;
  return count === Infinity ? '∞' : String(count);
}

export function shopPage(state: GameState, cb: ShopCallbacks, open: Set<string>): HTMLElement[] {
  const food: Entry[] = CONFIG.foods
    .filter((f: Food) => f.price > 0 && !f.caughtOnly) // free and caught food isn't sold
    .map((f) => ({
      icon: ITEM_ICONS[f.id],
      count: countBadge(foodCount(state, f.id)),
      row: row(ITEM_ICONS[f.id], STRINGS.foods[f.id], STRINGS.shop.have(foodCount(state, f.id)),
        priceButton(f.price, state.gold, () => cb.onBuyFood(f.id))),
    }));
  const hats: Entry[] = HATS.map((h) => {
    const owned = state.inventory.hats.includes(h.id);
    return {
      icon: hatIcon(cb.hatImage(h.id)),
      faded: owned,
      row: row(hatIcon(cb.hatImage(h.id)), h.name, owned ? STRINGS.shop.owned : '',
        owned ? label(STRINGS.shop.owned) : priceButton(h.price, state.gold, () => cb.onBuyHat(h.id))),
    };
  });
  return [
    category('food', STRINGS.shop.food, food, open),
    category('hats', STRINGS.shop.hats, hats, open),
  ];
}

export function inventoryPage(state: GameState, cb: ShopCallbacks, open: Set<string>): HTMLElement[] {
  const hats: Entry[] = HATS.filter((h) => state.inventory.hats.includes(h.id)).map((h) => {
    const wearing = state.pet.hat === h.id;
    return {
      icon: hatIcon(cb.hatImage(h.id)),
      mark: wearing,
      row: row(hatIcon(cb.hatImage(h.id)), h.name, wearing ? STRINGS.inventory.wearing : '',
        button(wearing ? STRINGS.inventory.takeOff : STRINGS.inventory.wear,
          () => cb.onWearHat(wearing ? null : h.id), wearing ? 'shop-btn shop-btn-soft' : 'shop-btn')),
    };
  });
  const food: Entry[] = CONFIG.foods
    .map((f) => ({ f, count: foodCount(state, f.id) }))
    .filter(({ count }) => count > 0)
    .map(({ f, count }) => ({
      icon: ITEM_ICONS[f.id],
      count: countBadge(count),
      row: row(ITEM_ICONS[f.id], STRINGS.foods[f.id], '', label(count === Infinity ? STRINGS.shop.free : `× ${count}`)),
    }));
  return [
    category('hats', STRINGS.inventory.hats, hats, open, STRINGS.inventory.noHats),
    category('food', STRINGS.inventory.food, food, open, STRINGS.inventory.noFood),
  ];
}
