// The Shop and Wardrobe pages inside the gear menu. They only show things
// and pass button presses on; the rules (prices, owning, wearing) live in
// src/game/economy.ts.

import { STRINGS } from '../strings';
import { CONFIG } from '../game/config';
import { HATS, baitCount, revivalStars, canBuyPot, foodCount, limitedInStock, limitedLeft, localDay } from '../game/economy';
import { CURTAINS, WALLPAPERS, inUse, ownsDecor, type Decor, type DecorKind } from '../game/decor';
import type { GameState } from '../game/state';
import type { Food, FoodId } from '../game/actions';
import { FRAGMENT_ICON, ITEM_ICONS, STAT_ICONS } from './icons';
import { SEEDS_FOR_SALE, SUPPLIES, priceOf, seedCount, supplyCount, type ShopItem } from '../game/garden';
import { CHARMS, charmCount, percyFree } from '../game/journeys';
import { isUnlocked } from '../game/unlocks';
import { formatDuration } from './time';

export interface ShopCallbacks {
  onBuyFood: (food: FoodId) => void;
  onBuyHat: (hat: string) => void;
  onBuyGardenItem: (item: ShopItem) => void;
  onWearHat: (hat: string | null) => void;
  onBuyBait: () => void;
  onBuyCharm: (charm: string) => void; // a charm for the journey lunchbox
  onBuyPot: () => void;
  onBuyDecor: (kind: DecorKind, id: string) => void;
  onUseDecor: (kind: DecorKind, id: string | null) => void;
  onBuyPack: (productId: string) => void; // Revival Stars, with real money
  onWakePercy: () => void; // ends Percy's rest after a journey, for gold
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
export function row(icon: string, name: string, note: string, action: HTMLElement): HTMLElement {
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

// A small hourglass left of the price, for items that are only in today.
function stockIcon(): HTMLElement {
  const el = document.createElement('span');
  el.className = 'shop-stock';
  el.innerHTML = STAT_ICONS.hourglass;
  el.setAttribute('aria-hidden', 'true');
  return el;
}

export function label(text: string): HTMLElement {
  const el = document.createElement('span');
  el.className = 'shop-label';
  el.textContent = text;
  return el;
}

// One item in a category: its full row, and its little picture for the
// folded-up grid. `mark` highlights the picture (e.g. the hat being worn),
// `faded` dims it (e.g. a hat you already own, in the Shop), and `count`
// shows a small number in its corner (how many of a food you have).
// `tier` colours its outline and fill (an achievement's bronze, silver or
// gold).
export interface Entry {
  icon: string;
  row: HTMLElement;
  count?: string;
  tier?: string;
  mark?: boolean;
  faded?: boolean;
}

// A category such as "Food" or "Hats". Folded up (the default) it shows
// only the items' pictures in a small grid; tap the title, or any picture,
// to unfold it into the full rows. `open` remembers which categories are
// unfolded, so they stay that way when the page redraws after buying.
export function category(id: string, title: string, entries: Entry[], open: Set<string>, empty?: string): HTMLElement {
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
    if (e.tier) b.dataset.tier = e.tier;
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

// A wallpaper or curtains: its price until it's yours, then Use (or, for
// curtains in use, Take down).
function decorEntry(state: GameState, d: Decor, cb: ShopCallbacks): Entry {
  const owned = ownsDecor(state, d.kind, d.id);
  const using = inUse(state, d.kind, d.id);
  const icon = ITEM_ICONS[`${d.kind}_${d.id}`] ?? '';
  const name = (d.kind === 'wallpaper' ? STRINGS.shop.wallpapers : STRINGS.shop.curtains)[d.id] ?? d.id;
  let action: HTMLElement;
  if (!owned) action = priceButton(d.price, state.gold, () => cb.onBuyDecor(d.kind, d.id));
  else if (using && d.kind === 'curtains') action = button(STRINGS.shop.takeDown, () => cb.onUseDecor(d.kind, null), 'shop-btn shop-btn-soft');
  else if (using) action = label(STRINGS.shop.inUse);
  else action = button(STRINGS.shop.use, () => cb.onUseDecor(d.kind, d.id));
  return { icon, mark: using, row: row(icon, name, using ? STRINGS.shop.inUse : owned ? STRINGS.shop.owned : '', action) };
}

// The Shop's categories, in order. Other screens can open the Shop at one.
export type ShopCategory = 'revival' | 'food' | 'garden' | 'fishing' | 'journeys' | 'room' | 'hats';

// Food the Shop sells: only plain ingredients (the energy drink only on its days).
export const soldInShop = (f: Food) => f.price > 0 && !f.caughtOnly && !f.grownOnly && !f.cookedOnly && !f.foundOnly;

export function shopPage(state: GameState, cb: ShopCallbacks, open: Set<string>): HTMLElement[] {
  const now = state.lastUpdated;
  const food: Entry[] = CONFIG.foods
    .filter(soldInShop)
    .filter((f: Food) => !f.limited || limitedInStock(localDay(now)))
    .map((f: Food) => {
      const left = f.limited ? limitedLeft(state, now) : Infinity;
      const action = left <= 0
        ? label(STRINGS.shop.soldOut)
        : priceButton(f.price, state.gold, () => cb.onBuyFood(f.id));
      // Limited items say how many are left today instead of how many you have.
      const note = f.limited
        ? STRINGS.shop.left(left, CONFIG.economy.limited.perDay)
        : STRINGS.shop.have(foodCount(state, f.id));
      const el = row(ITEM_ICONS[f.id], STRINGS.foods[f.id], note, action);
      if (f.limited) el.insertBefore(stockIcon(), action);
      return { icon: ITEM_ICONS[f.id], count: countBadge(foodCount(state, f.id)), row: el };
    });
  const hats: Entry[] = HATS.map((h) => {
    const owned = state.inventory.hats.includes(h.id);
    return {
      icon: hatIcon(cb.hatImage(h.id)),
      faded: owned,
      row: row(hatIcon(cb.hatImage(h.id)), h.name, owned ? STRINGS.shop.owned : '',
        owned ? label(STRINGS.shop.owned) : priceButton(h.price, state.gold, () => cb.onBuyHat(h.id))),
    };
  });
  // Seeds you can buy, then fertilizer and plant cure.
  const gardenItems: { item: ShopItem; icon: string; name: string; note: string; count: number }[] = [
    ...SEEDS_FOR_SALE.map((id) => ({
      item: { kind: 'seed', id } as ShopItem,
      icon: ITEM_ICONS[`seed_${id}`],
      name: STRINGS.garden.seedName(STRINGS.foods[id]),
      note: STRINGS.shop.have(seedCount(state, id)),
      count: seedCount(state, id),
    })),
    ...SUPPLIES.map((id) => ({
      item: { kind: 'supply', id } as ShopItem,
      icon: ITEM_ICONS[id],
      name: STRINGS.garden.supplies[id],
      note: `${STRINGS.garden.supplyNotes[id]}. ${STRINGS.shop.have(supplyCount(state, id))}`,
      count: supplyCount(state, id),
    })),
  ];
  const garden: Entry[] = gardenItems.map((g) => ({
    icon: g.icon,
    count: countBadge(g.count),
    row: row(g.icon, g.name, g.note, priceButton(priceOf(g.item), state.gold, () => cb.onBuyGardenItem(g.item))),
  }));
  // One more pot, until the garden is as big as it gets.
  if (canBuyPot(state)) {
    garden.push({
      icon: ITEM_ICONS.gardenPot,
      row: row(ITEM_ICONS.gardenPot, STRINGS.shop.extraPot, STRINGS.shop.extraPotNote,
        priceButton(CONFIG.garden.extraPotPrice, state.gold, cb.onBuyPot)),
    });
  }
  const fishing: Entry[] = [{
    icon: ITEM_ICONS.bait,
    count: countBadge(baitCount(state)),
    row: row(ITEM_ICONS.bait, STRINGS.shop.bait, STRINGS.shop.baitNote(baitCount(state)),
      priceButton(CONFIG.fishing.bait.price, state.gold, cb.onBuyBait)),
  }];
  // Percy rests after coming along on a journey: gold wakes him up early.
  const resting = !percyFree(state, now);
  // Charms for the lunchbox, used up on one trip.
  const journeys: Entry[] = isUnlocked(state, 'journeys') ? [{
    icon: ITEM_ICONS.percy,
    faded: !resting,
    row: row(ITEM_ICONS.percy, STRINGS.journeys.percyRest,
      resting ? STRINGS.journeys.percyRestNote(formatDuration(state.journeys.percyFreeAt - now)) : STRINGS.journeys.percyReady,
      resting ? priceButton(CONFIG.journeys.percy.resetPrice, state.gold, cb.onWakePercy) : label(STRINGS.journeys.ready)),
  }, ...CHARMS.map((c) => {
    const text = STRINGS.journeys.charms[c.id];
    const have = charmCount(state, c.id);
    return {
      icon: ITEM_ICONS[`charm_${c.id}`] ?? '',
      count: countBadge(have),
      row: row(ITEM_ICONS[`charm_${c.id}`] ?? '', text?.name ?? c.id, STRINGS.journeys.charmShopNote(text?.note ?? '', have),
        priceButton(c.price, state.gold, () => cb.onBuyCharm(c.id))),
    };
  })] : [];
  const room: Entry[] = [...WALLPAPERS, ...CURTAINS].map((d) => decorEntry(state, d, cb));
  // Revival Stars: the star fragments collected so far (free, from good
  // care), then stars to keep in your pocket, bought with real money.
  const note = STRINGS.shop.revivalNote(revivalStars(state));
  const { perStar, careDaysPerFragment } = CONFIG.revival.fragments;
  const pieces = state.fragments.pieces;
  const revival: Entry[] = [
    {
      icon: FRAGMENT_ICON,
      count: countBadge(pieces),
      row: row(FRAGMENT_ICON, STRINGS.shop.fragments, STRINGS.shop.fragmentsNote(state.fragments.careDays, careDaysPerFragment), label(STRINGS.shop.fragmentsCount(pieces, perStar))),
    },
    ...CONFIG.store.map((p) => ({
      icon: ITEM_ICONS[p.item],
      row: row(ITEM_ICONS[p.item], STRINGS.shop.revivalPack(p.count), note, button(p.price, () => cb.onBuyPack(p.id))),
    })),
  ];
  return [
    category('revival', STRINGS.shop.revivalTitle, revival, open),
    category('food', STRINGS.shop.food, food, open),
    category('garden', STRINGS.shop.garden, garden, open),
    category('fishing', STRINGS.shop.fishing, fishing, open),
    ...(journeys.length > 0 ? [category('journeys', STRINGS.shop.journeys, journeys, open)] : []),
    category('room', STRINGS.shop.room, room, open),
    category('hats', STRINGS.shop.hats, hats, open),
  ];
}

// The Wardrobe (hold the pet to open it): the hats you own, to put on or
// take off.
export function wardrobePage(state: GameState, cb: ShopCallbacks): HTMLElement[] {
  const owned = HATS.filter((h) => state.inventory.hats.includes(h.id));
  if (owned.length === 0) return [label(STRINGS.wardrobe.noHats)];
  return owned.map((h) => {
    const wearing = state.pet.hat === h.id;
    return row(hatIcon(cb.hatImage(h.id)), h.name, wearing ? STRINGS.wardrobe.wearing : '',
      button(wearing ? STRINGS.wardrobe.takeOff : STRINGS.wardrobe.wear,
        () => cb.onWearHat(wearing ? null : h.id), wearing ? 'shop-btn shop-btn-soft' : 'shop-btn'));
  });
}
