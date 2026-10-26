// The Shop and Wardrobe pages inside the gear menu. They only show things
// and pass button presses on; the rules (prices, owning, wearing) live in
// src/game/economy.ts.

import { STRINGS } from '../strings';
import { CONFIG } from '../game/config';
import { HATS, baitCount, fortuneCookies, revivalStars, canBuyPot, foodCount, limitedInStock, limitedLeft, localDay, dailySpecial, ownsSpecial, priceToday, hasBigJar, riceJarSize, getHat } from '../game/economy';
import { earnedFrom } from '../game/regulars';
import { CURTAINS, FURNITURE, WALLPAPERS, inUse, ownsDecor, type Decor, type DecorKind } from '../game/decor';
import type { GameState } from '../game/state';
import type { Food, FoodId } from '../game/actions';
import { FRAGMENT_ICON, ITEM_ICONS, STAT_ICONS } from './icons';
import { SEEDS_FOR_SALE, SUPPLIES, canCompost, priceOf, seedCount, supplyCount, type ShopItem } from '../game/garden';
import { poopCount } from '../game/hygiene';
import { CHARMS, charmCount, percyFree } from '../game/journeys';
import { isUnlocked } from '../game/unlocks';
import { formatDuration } from './time';
import { ownsFamilyHome } from '../game/rooms';

export interface ShopCallbacks {
  onBuyFood: (food: FoodId) => void;
  onBuyHat: (hat: string) => void;
  onBuyGardenItem: (item: ShopItem) => void;
  onWearHat: (hat: string | null) => void;
  onBuyBait: () => void;
  onBuyFortuneCookie: () => void;
  onBuyCharm: (charm: string) => void; // a charm for the journey lunchbox
  onBuyPot: () => void;
  onBuyDecor: (kind: DecorKind, id: string) => void;
  onUseDecor: (kind: DecorKind, id: string | null) => void;
  onTakeDownFurniture: (id: string) => void; // out of the room you're looking at
  onBuyBigJar: () => void; // the bigger rice jar, for star fragments
  onBuyPack: (productId: string) => void; // Revival Stars, with real money
  onBuyFamilyHome: (withFragments: boolean) => void; // the second room, for star fragments or money
  onMakeStar: () => void; // star fragments into a Revival Star
  onCompost: () => void; // picked-up poop into fertilizer
  onFragmentsHelp: () => void; // what star fragments are, in a card
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

// "[fragment] 3": a price in star fragments (for things money can't buy).
function fragmentButton(cost: number, have: number, onClick: () => void): HTMLButtonElement {
  const pill = document.createElement('span');
  pill.className = 'gold-pill';
  pill.title = STRINGS.shop.fragments;
  pill.innerHTML = FRAGMENT_ICON;
  pill.append(String(cost));
  const b = button(pill, onClick);
  b.classList.toggle('too-pricey', have < cost);
  return b;
}

// "♥♥♥♥": something only a regular gives (Percy's wallpaper), at that
// many hearts. Greyed out like a price you can't afford, and a tap says
// who gives it.
function earnedButton(kind: 'wallpaper', id: string, onClick: () => void): { button: HTMLButtonElement; note: string } {
  const from = earnedFrom(kind, id);
  const b = button(from ? '♥'.repeat(from.hearts) : '?', onClick, 'shop-btn too-pricey shop-btn-hearts');
  const note = from ? STRINGS.regulars.earnedNote(STRINGS.regulars.names[from.id] ?? from.id, from.hearts) : '';
  return { button: b, note };
}

// "Craft": turns fragments into a star. Greyed out like a price you can't
// afford until there are enough, but still tappable so it can say why.
function craftButton(ready: boolean, onClick: () => void): HTMLButtonElement {
  const b = button(STRINGS.shop.craft, onClick);
  b.classList.toggle('too-pricey', !ready);
  return b;
}

// Star fragments: how many you have and how many a good day gives, with a
// "?" for the details and the Craft button.
function fragmentsRow(pieces: number, perStar: number, cb: ShopCallbacks): HTMLElement {
  const help = button('?', cb.onFragmentsHelp, 'shop-help');
  help.setAttribute('aria-label', STRINGS.shop.fragments);
  const actions = document.createElement('span');
  actions.className = 'shop-row-actions';
  actions.append(help, craftButton(pieces >= perStar, cb.onMakeStar));
  const el = row(FRAGMENT_ICON, STRINGS.shop.fragments, STRINGS.shop.fragmentsNote(pieces, CONFIG.fragments.perGoodDay), actions);
  el.classList.add('shop-row-lines');
  return el;
}

// Homemade fertilizer: how many bags you have (shared with the bought
// ones, it's the same fertilizer), then a poop icon for each poop towards
// the next bag, grey until picked up, and Craft.
function homemadeRow(state: GameState, cb: ShopCallbacks): HTMLElement {
  const per = CONFIG.garden.poopPerFertilizer;
  const poops = poopCount(state);
  const filled = Math.min(poops, per);
  const el = row(ITEM_ICONS.homemadeFertilizer, STRINGS.shop.homemade,
    STRINGS.shop.homemadeHave(supplyCount(state, 'fertilizer')), craftButton(canCompost(state), cb.onCompost));
  const slots = document.createElement('span');
  slots.className = 'poop-slots';
  slots.setAttribute('role', 'img');
  slots.setAttribute('aria-label', STRINGS.shop.poopSlots(poops, per));
  slots.innerHTML = Array.from({ length: per }, (_, i) =>
    `<span class="poop-slot${i < filled ? ' on' : ''}">${ITEM_ICONS.poop}</span>`).join('');
  el.querySelector('.shop-row-text')!.append(slots);
  return el;
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
  const name = decorName(d.kind, d.id);
  let action: HTMLElement;
  let note = using ? STRINGS.shop.inUse : owned ? STRINGS.shop.owned : '';
  // Furniture says where it goes, until it's in the room.
  if (d.slot && !using) note = owned ? `${STRINGS.shop.owned} · ${STRINGS.shop.furnitureSlot[d.slot]}` : STRINGS.shop.furnitureSlot[d.slot];
  if (!owned && d.earned && d.kind === 'wallpaper') {
    const earned = earnedButton(d.kind, d.id, () => cb.onBuyDecor(d.kind, d.id));
    action = earned.button;
    note = earned.note;
  } else if (!owned) action = priceButton(priceToday(state, d.kind, d.id, d.price), state.gold, () => cb.onBuyDecor(d.kind, d.id));
  else if (using && d.kind === 'curtains') action = button(STRINGS.shop.takeDown, () => cb.onUseDecor(d.kind, null), 'shop-btn shop-btn-soft');
  else if (using && d.kind === 'furniture') action = button(STRINGS.shop.takeDown, () => cb.onTakeDownFurniture(d.id), 'shop-btn shop-btn-soft');
  else if (using) action = label(STRINGS.shop.inUse);
  else action = button(d.kind === 'furniture' ? STRINGS.shop.place : STRINGS.shop.use, () => cb.onUseDecor(d.kind, d.id));
  return { icon, mark: using, row: row(icon, name, note, action) };
}

const decorName = (kind: DecorKind, id: string) =>
  (kind === 'wallpaper' ? STRINGS.shop.wallpapers : kind === 'curtains' ? STRINGS.shop.curtains : STRINGS.shop.furniture)[id] ?? id;

// Today's special, above the tabs: one thing at a lower price, with its
// usual price under its name. Once it's yours it says so until tomorrow.
function specialRow(state: GameState, cb: ShopCallbacks): HTMLElement | null {
  const special = dailySpecial(state);
  if (!special) return null;
  const hat = special.kind === 'hat' ? getHat(special.id) : undefined;
  const icon = hat ? hatIcon(cb.hatImage(special.id)) : ITEM_ICONS[`${special.kind}_${special.id}`] ?? '';
  const name = hat ? hat.name : decorName(special.kind as DecorKind, special.id);
  const owned = ownsSpecial(state, special);
  const buy = () => (hat ? cb.onBuyHat(special.id) : cb.onBuyDecor(special.kind as DecorKind, special.id));
  const el = row(icon, `${STRINGS.shop.special}: ${name}`,
    owned ? STRINGS.shop.specialOwned : STRINGS.shop.specialNote(special.was),
    owned ? label(STRINGS.shop.owned) : priceButton(special.price, state.gold, buy));
  el.classList.add('shop-special');
  return el;
}

// The Shop's categories, in order. Other screens can open the Shop at one.
export type ShopCategory = 'revival' | 'food' | 'garden' | 'fishing' | 'journeys' | 'room' | 'hats';

// Food the Shop sells: only plain ingredients (the energy drink only on its days).
export const soldInShop = (f: Food) => f.price > 0 && !f.caughtOnly && !f.grownOnly && !f.cookedOnly && !f.foundOnly;

// The Shop: tabs for the categories, then the picked category's rows.
export function shopPage(state: GameState, cb: ShopCallbacks, view: ShopView, redraw: () => void): HTMLElement[] {
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
  // The bigger rice jar, for star fragments, at the top once it's for sale.
  const { bigger } = CONFIG.riceJar;
  food.unshift({
    icon: ITEM_ICONS.riceBall,
    faded: hasBigJar(state),
    row: row(ITEM_ICONS.riceBall, STRINGS.shop.bigJar,
      hasBigJar(state) ? STRINGS.shop.owned : STRINGS.shop.bigJarNote(bigger.extra, riceJarSize(state) + bigger.extra),
      hasBigJar(state) ? label(STRINGS.shop.owned) : fragmentButton(bigger.fragments, state.fragments.pieces, cb.onBuyBigJar)),
  });
  // Fortune cookies, opened before mingling, once friends drop by.
  if (isUnlocked(state, 'meet')) {
    food.push({
      icon: ITEM_ICONS.fortuneCookie,
      count: countBadge(fortuneCookies(state)),
      row: row(ITEM_ICONS.fortuneCookie, STRINGS.shop.fortuneCookie, STRINGS.shop.fortuneCookieNote(fortuneCookies(state)),
        priceButton(CONFIG.fortune.price, state.gold, cb.onBuyFortuneCookie)),
    });
  }
  const hats: Entry[] = HATS.map((h) => {
    const owned = state.inventory.hats.includes(h.id);
    const buy = h.fragments
      ? fragmentButton(h.fragments, state.fragments.pieces, () => cb.onBuyHat(h.id))
      : priceButton(priceToday(state, 'hat', h.id, h.price), state.gold, () => cb.onBuyHat(h.id));
    const note = owned ? STRINGS.shop.owned : h.fragments ? STRINGS.shop.fragmentsOnly : '';
    return {
      icon: hatIcon(cb.hatImage(h.id)),
      faded: owned,
      row: row(hatIcon(cb.hatImage(h.id)), h.name, note, owned ? label(STRINGS.shop.owned) : buy),
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
  // Homemade fertilizer, crafted from poop you've picked up.
  garden.push({
    icon: ITEM_ICONS.homemadeFertilizer,
    count: countBadge(poopCount(state)),
    row: homemadeRow(state, cb),
  });
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
  // The Family Home first: star fragments or money, side by side.
  const owned = ownsFamilyHome(state);
  const homeActions = document.createElement('span');
  homeActions.className = 'shop-row-actions';
  if (owned) homeActions.append(label(STRINGS.shop.owned));
  else homeActions.append(
    fragmentButton(CONFIG.familyHome.fragments, state.fragments.pieces, () => cb.onBuyFamilyHome(true)),
    button(CONFIG.familyHome.price, () => cb.onBuyFamilyHome(false)),
  );
  const room: Entry[] = [
    { icon: ITEM_ICONS.familyHome, faded: owned, row: row(ITEM_ICONS.familyHome, STRINGS.familyHome.name, STRINGS.familyHome.shopNote, homeActions) },
    ...[...FURNITURE, ...WALLPAPERS, ...CURTAINS].map((d) => decorEntry(state, d, cb)),
  ];
  // Star fragments: the ones collected so far (from good care, or bought),
  // which make a Revival Star once there are enough, then packs of them
  // bought with real money.
  const { perStar } = CONFIG.fragments;
  const pieces = state.fragments.pieces;
  const revival: Entry[] = [
    {
      icon: FRAGMENT_ICON,
      count: countBadge(pieces),
      row: fragmentsRow(pieces, perStar, cb),
    },
    {
      icon: ITEM_ICONS.revivalStar,
      count: countBadge(revivalStars(state)),
      row: row(ITEM_ICONS.revivalStar, STRINGS.shop.revivalStar, STRINGS.shop.revivalNote(revivalStars(state), perStar), label('')),
    },
    ...CONFIG.store.map((p, i) => ({
      icon: FRAGMENT_ICON,
      row: row(FRAGMENT_ICON, STRINGS.shop.fragmentPack(p.fragments),
        i === CONFIG.store.length - 1 ? STRINGS.shop.fragmentPackBest : STRINGS.shop.fragmentPackNote,
        button(p.price, () => cb.onBuyPack(p.id))),
    })),
  ];
  // One category at a time, picked from the tabs at the top. Journeys only
  // shows once it has opened up.
  const tabs: ShopTab[] = [
    { id: 'revival', title: STRINGS.shop.revivalTab, icon: ITEM_ICONS.revivalStar, entries: revival },
    { id: 'food', title: STRINGS.shop.food, icon: ITEM_ICONS.strawberry, entries: food },
    { id: 'garden', title: STRINGS.shop.garden, icon: ITEM_ICONS.gardenPot, entries: garden },
    { id: 'fishing', title: STRINGS.shop.fishing, icon: ITEM_ICONS.bait, entries: fishing },
    ...(journeys.length > 0 ? [{ id: 'journeys', title: STRINGS.shop.journeys, icon: ITEM_ICONS.charm_compass, entries: journeys } as ShopTab] : []),
    { id: 'room', title: STRINGS.shop.room, icon: ITEM_ICONS[`wallpaper_${WALLPAPERS[1]?.id}`] ?? '', entries: room },
    { id: 'hats', title: STRINGS.shop.hats, icon: hatIcon(cb.hatImage(HATS[1]?.id ?? '')), entries: hats },
  ];
  const shown = tabs.find((t) => t.id === view.tab) ?? tabs[0];
  view.tab = shown.id;
  const rows = document.createElement('div');
  rows.className = 'shop-cat-rows';
  rows.append(...shown.entries.map((e) => e.row));
  const special = specialRow(state, cb);
  return [...(special ? [special] : []), shopTabs(tabs, view, redraw), rows];
}

interface ShopTab {
  id: ShopCategory;
  title: string;
  icon: string;
  entries: Entry[];
}

// Which category's tab is showing. Kept by the menu, so it stays while the
// page redraws after buying something.
export interface ShopView {
  tab: ShopCategory;
}

// [ Stars | Food | Garden | ... ]: a strip of chips that scrolls sideways
// when they don't all fit, and stays at the top while the rows scroll.
function shopTabs(tabs: ShopTab[], view: ShopView, redraw: () => void): HTMLElement {
  const strip = document.createElement('div');
  strip.className = 'shop-tabs';
  strip.setAttribute('role', 'group');
  strip.setAttribute('aria-label', STRINGS.shop.title);
  for (const t of tabs) {
    const b = document.createElement('button');
    b.className = 'shop-tab';
    b.setAttribute('aria-pressed', String(t.id === view.tab));
    b.innerHTML = `<span class="shop-tab-icon" aria-hidden="true">${t.icon}</span><span></span>`;
    b.lastElementChild!.textContent = t.title;
    b.addEventListener('click', () => {
      if (view.tab === t.id) return;
      view.tab = t.id;
      redraw();
    });
    strip.append(b);
  }
  // Once it's on the page: slide the strip so the picked tab is in view.
  requestAnimationFrame(() => {
    const on = strip.querySelector<HTMLElement>('[aria-pressed="true"]');
    if (!on) return;
    const left = on.offsetLeft - strip.offsetLeft;
    if (left < strip.scrollLeft) strip.scrollLeft = left - 8;
    else if (left + on.offsetWidth > strip.scrollLeft + strip.clientWidth)
      strip.scrollLeft = left + on.offsetWidth - strip.clientWidth + 8;
  });
  return strip;
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
