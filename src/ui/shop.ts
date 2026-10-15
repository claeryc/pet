// The Shop and Inventory pages inside the gear menu. They only show things
// and pass button presses on; the rules (prices, owning, wearing) live in
// src/game/economy.ts.

import { STRINGS } from '../strings';
import { CONFIG } from '../game/config';
import { HATS, foodCount } from '../game/economy';
import type { GameState } from '../game/state';
import type { FoodId } from '../game/actions';
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

function section(title: string): HTMLElement {
  const h = document.createElement('h3');
  h.className = 'shop-section';
  h.textContent = title;
  return h;
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

export function shopPage(state: GameState, cb: ShopCallbacks): HTMLElement[] {
  const items: HTMLElement[] = [section(STRINGS.shop.food)];
  for (const f of CONFIG.foods) {
    if (f.price === 0) continue; // free food isn't sold
    items.push(
      row(ITEM_ICONS[f.id], STRINGS.foods[f.id], STRINGS.shop.have(foodCount(state, f.id)),
        priceButton(f.price, state.gold, () => cb.onBuyFood(f.id))),
    );
  }
  items.push(section(STRINGS.shop.hats));
  for (const h of HATS) {
    const owned = state.inventory.hats.includes(h.id);
    items.push(
      row(hatIcon(cb.hatImage(h.id)), h.name, owned ? STRINGS.shop.owned : '',
        owned ? label(STRINGS.shop.owned) : priceButton(h.price, state.gold, () => cb.onBuyHat(h.id))),
    );
  }
  return items;
}

export function inventoryPage(state: GameState, cb: ShopCallbacks): HTMLElement[] {
  const items: HTMLElement[] = [section(STRINGS.inventory.hats)];
  const owned = HATS.filter((h) => state.inventory.hats.includes(h.id));
  if (owned.length === 0) items.push(label(STRINGS.inventory.noHats));
  for (const h of owned) {
    const wearing = state.pet.hat === h.id;
    items.push(
      row(hatIcon(cb.hatImage(h.id)), h.name, wearing ? STRINGS.inventory.wearing : '',
        button(wearing ? STRINGS.inventory.takeOff : STRINGS.inventory.wear,
          () => cb.onWearHat(wearing ? null : h.id), wearing ? 'shop-btn shop-btn-soft' : 'shop-btn')),
    );
  }
  items.push(section(STRINGS.inventory.food));
  for (const f of CONFIG.foods) {
    const count = foodCount(state, f.id);
    if (count === 0) continue;
    items.push(row(ITEM_ICONS[f.id], STRINGS.foods[f.id], '', label(count === Infinity ? STRINGS.shop.free : `× ${count}`)));
  }
  return items;
}
