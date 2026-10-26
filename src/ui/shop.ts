// The Shop and Wardrobe pages inside the gear menu. They only show things
// and pass button presses on; the rules (prices, owning, wearing) live in
// src/game/economy.ts.
//
// The Shop is a little stall: a striped awning over its name and purse,
// folder tabs for its parts, and cards with a picture, a name and one
// button. A raised button is something you can do (a price, Use, Wear);
// flat text is just how things are (Owned, In use). Tapping a card's
// picture opens its sheet, and a hat or a decoration on a sheet is tried
// on in the room above before you buy it. Real money only ever shows on
// the Star counter's fragment packs; everything else is gold or star
// fragments.

import { STRINGS } from '../strings';
import { CONFIG } from '../game/config';
import { HATS, baitCount, fortuneCookies, revivalStars, canBuyPot, foodCount, limitedInStock, limitedLeft, localDay, dailySpecial, ownsSpecial, priceToday, hasBigJar, riceJarSize, getHat } from '../game/economy';
import { earnedFrom } from '../game/regulars';
import { CURTAINS, FURNITURE, SPOTS, WALLPAPERS, getDecor, inUse, ownsDecor, piecesFor, type Decor, type DecorKind } from '../game/decor';
import type { GameState } from '../game/state';
import type { Food, FoodId } from '../game/actions';
import { FRAGMENT_ICON, ITEM_ICONS, MENU_ICONS, STAT_ICONS } from './icons';
import { SEEDS_FOR_SALE, SUPPLIES, canCompost, priceOf, seedCount, supplyCount, type ShopItem } from '../game/garden';
import { poopCount } from '../game/hygiene';
import { CHARMS, charmCount, holidayTickets, percyFree } from '../game/journeys';
import { isUnlocked } from '../game/unlocks';
import { formatDuration } from './time';
import { ownsFamilyHome } from '../game/rooms';
import { CURTAINS as CURTAIN_COLOURS, WALLPAPERS as WALL_PATTERNS } from '../render/room';
import { PALETTE } from '../render/palette';

// What the room above shows while a sheet is open: a hat on the pet, or a
// decoration up in the room, before it's bought.
export interface ShopPreview {
  kind: 'hat' | DecorKind;
  id: string;
}

export interface ShopCallbacks {
  onBuyFood: (food: FoodId) => void;
  onBuyHat: (hat: string) => void;
  onBuyGardenItem: (item: ShopItem) => void;
  onWearHat: (hat: string | null) => void;
  onBuyBait: () => void;
  onBuyFortuneCookie: () => void;
  onBuyCharm: (charm: string) => void; // a charm for the journey lunchbox
  onBuyHolidayTicket: () => void; // a Holiday ticket, for star fragments
  onBuyPot: () => void;
  onBuyDecor: (kind: DecorKind, id: string) => void;
  onUseDecor: (kind: DecorKind, id: string | null) => void;
  onTakeDownFurniture: (id: string) => void; // out of the room you're looking at
  onDecorate?: () => void; // pick where each piece goes, in the room
  onBuyBigJar: () => void; // the bigger rice jar, for star fragments
  onBuyPack: (productId: string) => void; // star fragments, with real money
  onBuyFamilyHome: () => void; // the second room, for star fragments
  onMakeStar: () => void; // star fragments into a Revival Star
  onCompost: () => void; // picked-up poop into fertilizer
  onFragmentsHelp: () => void; // what star fragments are, in a card
  onWakePercy: () => void; // ends Percy's rest after a journey, for gold
  onTryOn: (preview: ShopPreview | null) => void; // shows it in the room above, or stops
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

// "[fragment] 145": star fragments, like goldPill.
export function fragmentPill(pieces: number): HTMLElement {
  const pill = document.createElement('span');
  pill.className = 'gold-pill';
  pill.title = STRINGS.shop.fragments;
  pill.innerHTML = FRAGMENT_ICON;
  pill.append(String(pieces));
  return pill;
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

// A category such as "Badges" in the Collection. Folded up (the default)
// it shows only the items' pictures in a small grid; tap the title, or any
// picture, to unfold it into the full rows. `open` remembers which
// categories are unfolded, so they stay that way when the page redraws.
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

// ---------- little helpers for building the page ----------

function el<K extends keyof HTMLElementTagNameMap>(tag: K, className = '', html = ''): HTMLElementTagNameMap[K] {
  const e = document.createElement(tag);
  if (className) e.className = className;
  if (html) e.innerHTML = html;
  return e;
}

function text<K extends keyof HTMLElementTagNameMap>(tag: K, className: string, content: string): HTMLElementTagNameMap[K] {
  const e = el(tag, className);
  e.textContent = content;
  return e;
}

const CHECK = `<svg viewBox="0 0 10 10" aria-hidden="true"><path d="M2 5.5l2 2 4-5" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"/></svg>`;
const BACK = `<svg viewBox="0 0 12 12" aria-hidden="true"><path d="M7.5 2.5L4 6l3.5 3.5" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"/></svg>`;

type Cur = 'gold' | 'frag';

// What a thing costs, on a raised button: pink for gold, lilac for star
// fragments, pale while you can't afford it (still tappable, so it can
// say why). `was` is the usual price, crossed out; `label` a word before
// the price ("Buy"), for the big button on a sheet.
interface Price {
  cur: Cur;
  cost: number;
  was?: number;
  onBuy: () => void;
}

function priceButton(p: Price, have: number, opts: { wide?: boolean; label?: string } = {}): HTMLButtonElement {
  const b = el('button', `shop-buy${p.cur === 'frag' ? ' is-frag' : ''}${have < p.cost ? ' is-short' : ''}${opts.wide ? ' is-wide' : ''}`);
  if (opts.label) b.append(text('span', 'shop-buy-label', opts.label));
  if (p.was) {
    const was = text('s', '', String(p.was));
    was.title = STRINGS.shop.specialNote(p.was);
    b.append(was);
  }
  b.append(el('span', 'shop-ic', p.cur === 'gold' ? STAT_ICONS.gold : FRAGMENT_ICON), String(p.cost));
  b.setAttribute('aria-label', p.cur === 'gold' ? STRINGS.shop.buyGold(p.cost) : STRINGS.shop.buyFragments(p.cost));
  b.addEventListener('click', (e) => {
    e.stopPropagation();
    p.onBuy();
  });
  return b;
}

// A soft, white button: Try it, Use, Take down.
function ghostButton(content: string, onClick: () => void, wide = false): HTMLButtonElement {
  const b = text('button', `shop-buy is-ghost${wide ? ' is-wide' : ''}`, content);
  b.addEventListener('click', (e) => {
    e.stopPropagation();
    onClick();
  });
  return b;
}

// Flat text for how things are: "✓ Owned", "In use", "Sold out".
function fact(content: string, ok = true): HTMLElement {
  const f = el('span', `shop-fact${ok ? ' is-ok' : ''}`, ok ? CHECK : '');
  f.append(content);
  return f;
}

// "Wallpaper ............ 1 of 5"
function section(title: string, right = ''): HTMLElement {
  const s = el('div', 'shop-sec');
  s.append(text('h3', '', title));
  if (right) s.append(text('span', 'shop-sec-count', right));
  return s;
}

function grid(kind: '' | 'small' | 'two', cards: HTMLElement[]): HTMLElement {
  const g = el('div', `shop-grid${kind ? ` is-${kind}` : ''}`);
  g.append(...cards);
  return g;
}

// A pixel picture from rows of letters, like the room's own art.
function pix(rows: string[], colours: Record<string, string>, stretch = false): string {
  let r = '';
  rows.forEach((line, y) => [...line].forEach((ch, x) => {
    const c = colours[ch];
    if (c) r += `<rect x="${x}" y="${y}" width="1.02" height="1.02" fill="${c}"/>`;
  }));
  return `<svg viewBox="0 0 ${rows[0].length} ${rows.length}"${stretch ? ' preserveAspectRatio="none"' : ''} shape-rendering="crispEdges" aria-hidden="true">${r}</svg>`;
}

// A wallpaper as a big swatch, drawn with the room's own pattern.
function wallSwatch(id: string, w = 30, h = 14): string {
  const pattern = WALL_PATTERNS[id];
  if (!pattern) return ITEM_ICONS[`wallpaper_${id}`] ?? '';
  const rows = Array.from({ length: h }, (_, y) => Array.from({ length: w }, (_, x) => pattern(x, y, false)));
  let r = '';
  rows.forEach((line, y) => line.forEach((c, x) => (r += `<rect x="${x}" y="${y}" width="1.02" height="1.02" fill="${c}"/>`)));
  return `<svg viewBox="0 0 ${w} ${h}" preserveAspectRatio="none" shape-rendering="crispEdges" aria-hidden="true">${r}</svg>`;
}

// Curtains, wide: a window with the cloth drawn back on both sides.
function curtainSwatch(id: string): string {
  const [a, b] = CURTAIN_COLOURS[id] ?? [PALETTE.pink, PALETTE.blush];
  return pix([
    'cccccccccccccccccccccccc',
    'ABABAB............BABABA',
    'ABABAB.kkkkkkkkkk.BABABA',
    'ABABAB.kssssksssk.BABABA',
    'ABABAB.kswssksssk.BABABA',
    'ABABA..kssssksssk..ABABA',
    'ABAB...kkkkkkkkkk...BABA',
    'ABAB...kssssksssk...BABA',
    'ABA....ksssskssmk....ABA',
    'AB.....kssssksmmk.....BA',
    'AB.....kkkkkkkkkk.....BA',
    'B......................B',
  ], { A: a, B: b, k: PALETTE.ink, s: PALETTE.sky, w: PALETTE.white, m: PALETTE.mint, c: PALETTE.cocoa });
}

// A pile of star fragments, bigger for bigger packs.
function fragmentPile(size: number): string {
  const spots: [number, number, number][][] = [
    [[22, 18, 30]],
    [[10, 22, 26], [30, 14, 30]],
    [[4, 26, 24], [22, 10, 32], [40, 26, 24], [24, 34, 22]],
  ];
  const pile = spots[Math.min(size, spots.length) - 1];
  return `<span class="shop-pile" aria-hidden="true">${pile.map(([x, y, s]) => `<i style="left:${x}%;top:${y}%;width:${s}px;height:${s}px">${FRAGMENT_ICON}</i>`).join('')}</span>`;
}

// ---------- the things for sale ----------

// One thing on a card, and in its sheet. A card shows `price` until it's
// yours; then `use` (a soft button) or `fact`. The sheet adds `about`,
// `effects` and, for hats and decorations, a try-on in the room above.
interface Item {
  key: string; // which sheet is open, kept while the page redraws
  art: string;
  name: string;
  kind: string; // the small word over the name in its sheet
  about: string;
  tint?: string; // the colour of the plate behind the picture
  count?: number; // how many you have, in the plate's corner
  tag?: string; // a little label on the plate: "3 left", "Craving"
  starTag?: boolean; // the tag in star-fragment lilac
  dim?: boolean;
  price?: Price;
  hearts?: { hearts: number; onTap: () => void }; // only a regular gives it
  // Use, Wear, Take down. `card`: on the card too; `undo`: it takes
  // something away, so it's a soft button on the sheet as well.
  use?: { label: string; onUse: () => void; card?: boolean; undo?: boolean };
  fact?: string;
  effects?: string; // food: what it does, as little stat chips
  preview?: ShopPreview;
}

const TINT = {
  food: '#fff1e6',
  hat: '#fdeef3',
  starHat: '#ece6f8',
  furniture: '#f6efe6',
  garden: '#eaf6e4',
  fishing: '#e6f3fb',
  charm: '#e3f5ea',
  special: '#fff3cc',
} as const;

// The number in a picture's corner: nothing for none.
const countOf = (n: number) => (n > 0 && n !== Infinity ? n : undefined);

const decorName = (kind: DecorKind, id: string) =>
  (kind === 'wallpaper' ? STRINGS.shop.wallpapers : kind === 'curtains' ? STRINGS.shop.curtains : STRINGS.shop.furniture)[id] ?? id;

function decorArt(d: Decor): string {
  if (d.kind === 'wallpaper') return wallSwatch(d.id);
  if (d.kind === 'curtains') return curtainSwatch(d.id);
  return ITEM_ICONS[`furniture_${d.id}`] ?? '';
}

// A wallpaper, curtains or a piece of furniture: its price until it's
// yours, then Use (or, in use, Take down for curtains and furniture).
function decorItem(state: GameState, d: Decor, cb: ShopCallbacks): Item {
  const owned = ownsDecor(state, d.kind, d.id);
  const using = inUse(state, d.kind, d.id);
  const item: Item = {
    key: `${d.kind}:${d.id}`,
    art: decorArt(d),
    name: decorName(d.kind, d.id),
    kind: STRINGS.shop.specialKind[d.kind] ?? '',
    about: d.slot ? STRINGS.shop.furnitureSlot[d.slot] : STRINGS.shop.decorAbout,
    tint: TINT.furniture,
    preview: using ? undefined : { kind: d.kind, id: d.id },
  };
  if (!owned && d.earned && d.kind === 'wallpaper') {
    const from = earnedFrom(d.kind, d.id);
    item.hearts = { hearts: from?.hearts ?? 0, onTap: () => cb.onBuyDecor(d.kind, d.id) };
    if (from) item.about = STRINGS.regulars.earnedNote(STRINGS.regulars.names[from.id] ?? from.id, from.hearts);
  } else if (!owned) {
    const cost = priceToday(state, d.kind, d.id, d.price);
    item.price = { cur: 'gold', cost, was: cost < d.price ? d.price : undefined, onBuy: () => cb.onBuyDecor(d.kind, d.id) };
  } else if (using && d.kind === 'curtains') {
    item.fact = STRINGS.shop.inUse;
    item.use = { label: STRINGS.shop.takeDown, onUse: () => cb.onUseDecor(d.kind, null), undo: true };
  } else if (using && d.kind === 'furniture') {
    item.fact = STRINGS.shop.inUse;
    item.use = { label: STRINGS.shop.takeDown, onUse: () => cb.onTakeDownFurniture(d.id), undo: true };
  } else if (using) item.fact = STRINGS.shop.inUse;
  else item.use = { label: d.kind === 'furniture' ? STRINGS.shop.place : STRINGS.shop.use, onUse: () => cb.onUseDecor(d.kind, d.id), card: true };
  return item;
}

function hatItem(state: GameState, id: string, cb: ShopCallbacks): Item {
  const h = getHat(id)!;
  const owned = state.inventory.hats.includes(h.id);
  const wearing = state.pet.hat === h.id;
  const item: Item = {
    key: `hat:${h.id}`,
    art: hatIcon(cb.hatImage(h.id)),
    name: h.name,
    kind: STRINGS.shop.specialKind.hat,
    about: STRINGS.shop.hatAbout[h.id] ?? '',
    tint: h.fragments ? TINT.starHat : TINT.hat,
    tag: h.fragments ? STRINGS.shop.starHat : undefined,
    starTag: !!h.fragments,
    preview: wearing ? undefined : { kind: 'hat', id: h.id },
  };
  if (!owned) {
    item.price = h.fragments
      ? { cur: 'frag', cost: h.fragments, onBuy: () => cb.onBuyHat(h.id) }
      : { cur: 'gold', cost: priceToday(state, 'hat', h.id, h.price), was: priceToday(state, 'hat', h.id, h.price) < h.price ? h.price : undefined, onBuy: () => cb.onBuyHat(h.id) };
  } else {
    item.fact = wearing ? STRINGS.wardrobe.wearing : STRINGS.shop.owned;
    item.use = wearing
      ? { label: STRINGS.wardrobe.takeOff, onUse: () => cb.onWearHat(null), undo: true }
      : { label: STRINGS.wardrobe.wear, onUse: () => cb.onWearHat(h.id) };
  }
  return item;
}

// What a food does, as little chips: [tummy] +10 [joy] +6.
function foodEffects(f: Food): string {
  const chips: string[] = [];
  for (const stat of ['hunger', 'happiness', 'health', 'energy'] as const) {
    const n = (f as unknown as Record<string, number | undefined>)[stat];
    if (typeof n !== 'number' || n === 0) continue;
    chips.push(`<span class="shop-chip${n < 0 ? ' is-down' : ''}" title="${STRINGS.stats[stat]}">${STAT_ICONS[stat]}${n > 0 ? '+' : ''}${n}</span>`);
  }
  return chips.join('');
}

function foodItem(state: GameState, f: Food, cb: ShopCallbacks, now: number): Item {
  const left = f.limited ? limitedLeft(state, now) : Infinity;
  const have = foodCount(state, f.id);
  const item: Item = {
    key: `food:${f.id}`,
    art: ITEM_ICONS[f.id],
    name: STRINGS.foods[f.id],
    kind: STRINGS.shop.food,
    about: f.limited ? STRINGS.shop.limitedAbout(left, CONFIG.economy.limited.perDay) : STRINGS.shop.have(have),
    tint: f.limited ? TINT.special : TINT.food,
    count: countOf(have),
    tag: f.limited ? (left > 0 ? STRINGS.shop.nLeft(left) : STRINGS.shop.soldOut) : state.craving.food === f.id ? STRINGS.shop.cravingTag : undefined,
    effects: foodEffects(f),
  };
  if (left <= 0) item.fact = STRINGS.shop.soldOut;
  else item.price = { cur: 'gold', cost: f.price, onBuy: () => cb.onBuyFood(f.id) };
  return item;
}

// ---------- cards ----------

function cardAction(item: Item, state: GameState): HTMLElement {
  if (item.price) return priceButton(item.price, item.price.cur === 'gold' ? state.gold : state.fragments.pieces);
  if (item.hearts) {
    const b = text('button', 'shop-buy is-short shop-hearts', '♥'.repeat(item.hearts.hearts) || '?');
    b.addEventListener('click', (e) => {
      e.stopPropagation();
      item.hearts!.onTap();
    });
    return b;
  }
  if (item.use?.card) return ghostButton(item.use.label, item.use.onUse);
  return fact(item.fact ?? '');
}

// The picture on its coloured plate, with how many you have and a tag.
function plate(item: Item): HTMLElement {
  const p = el('div', 'shop-plate', item.art);
  if (item.tint) p.style.setProperty('--tint', item.tint);
  if (item.count) p.append(text('span', 'shop-badge', `×${item.count}`));
  if (item.tag) p.append(text('span', `shop-tag${item.starTag ? ' is-star' : ''}`, item.tag));
  return p;
}

function card(item: Item, state: GameState, open: (key: string) => void): HTMLElement {
  const c = el('div', `shop-card${item.dim ? ' is-dim' : ''}`);
  const look = el('button', 'shop-card-look');
  look.setAttribute('aria-label', item.name);
  look.append(plate(item), text('b', 'shop-name', item.name));
  look.addEventListener('click', () => open(item.key));
  c.append(look, cardAction(item, state));
  return c;
}

// A wallpaper or curtains: the swatch across the card, then name and price.
function swatchCard(item: Item, state: GameState, open: (key: string) => void): HTMLElement {
  const c = el('div', 'shop-swatch');
  const look = el('button', 'shop-swatch-art', item.art);
  look.setAttribute('aria-label', item.name);
  look.addEventListener('click', () => open(item.key));
  const foot = el('div', 'shop-swatch-row');
  foot.append(text('b', '', item.name), cardAction(item, state));
  c.append(look, foot);
  return c;
}

// A card across the page, for one-off things: [picture] [name / note] [button]
function wideCard(art: string, tint: string, name: string, note: string, action: HTMLElement, extra?: HTMLElement): HTMLElement {
  const c = el('div', 'shop-wide');
  const a = el('span', 'shop-wide-art', art);
  a.style.setProperty('--tint', tint);
  const t = el('span', 'shop-wide-text');
  t.append(text('b', '', name), text('small', '', note));
  if (extra) t.append(extra);
  c.append(a, t, action);
  return c;
}

// ---------- the sheet ----------

// An item up close, from the bottom of the panel: the picture big, what it
// is, and one clear button. A hat or decoration is on show in the room
// above while the sheet is open (Take it off stops that).
function sheet(item: Item, state: GameState, view: ShopView, cb: ShopCallbacks, redraw: () => void): HTMLElement {
  const wrap = el('div', `shop-sheet-wrap${view.fresh ? ' is-new' : ''}`);
  view.fresh = false;
  const close = () => {
    view.open = undefined;
    cb.onTryOn(null);
    redraw();
  };
  const scrim = el('button', 'shop-scrim');
  scrim.setAttribute('aria-label', STRINGS.menu.close);
  scrim.addEventListener('click', close);
  const s = el('div', 'shop-sheet');
  s.setAttribute('role', 'dialog');
  s.setAttribute('aria-label', item.name);
  const grab = el('button', 'shop-grab');
  grab.setAttribute('aria-label', STRINGS.menu.close);
  grab.addEventListener('click', close);
  const top = el('div', 'shop-sheet-row');
  const art = el('div', 'shop-sheet-art', item.art);
  if (item.tint) art.style.setProperty('--tint', item.tint);
  const info = el('div', 'shop-sheet-info');
  info.append(text('span', 'shop-kicker', item.kind), text('b', '', item.name));
  if (item.about) info.append(text('p', '', item.about));
  if (item.effects) info.append(el('span', 'shop-chips', item.effects));
  const trying = !!item.preview && view.trying !== false;
  if (trying) info.append(fact(item.preview!.kind === 'hat' ? STRINGS.shop.onPet(state.pet.name) : STRINGS.shop.inRoom));
  top.append(art, info);

  const acts = el('div', 'shop-sheet-acts');
  if (item.preview) {
    acts.append(ghostButton(trying ? STRINGS.shop.takeItOff : STRINGS.shop.tryOn, () => {
      view.trying = !trying;
      cb.onTryOn(view.trying ? item.preview! : null);
      redraw();
    }));
  }
  if (item.price) acts.append(priceButton(item.price, item.price.cur === 'gold' ? state.gold : state.fragments.pieces, { wide: true, label: STRINGS.shop.buy }));
  else if (item.hearts) acts.append(cardAction(item, state));
  else if (item.use) {
    if (item.fact) acts.append(fact(item.fact));
    const use = ghostButton(item.use.label, item.use.onUse, true);
    use.classList.toggle('is-ghost', !!item.use.undo);
    acts.append(use);
  } else acts.append(fact(item.fact ?? ''));
  s.append(grab, top, acts);
  wrap.append(scrim, s);
  // The room above shows it while the sheet is open.
  cb.onTryOn(trying ? item.preview! : null);
  return wrap;
}

// ---------- the pages ----------

// How long until local midnight, when the special changes. Shown in whole
// hours (rounded up), so the Shop only needs redrawing once an hour.
function untilTomorrow(now: number): number {
  const d = new Date(now);
  return new Date(d.getFullYear(), d.getMonth(), d.getDate() + 1).getTime() - now;
}

// The Shop's categories, in order. Other screens can open the Shop at one.
// ('revival' is the Star counter.)
export type ShopCategory = 'today' | 'revival' | 'food' | 'garden' | 'fishing' | 'journeys' | 'room' | 'hats';

// Food the Shop sells: only plain ingredients (the energy drink only on its days).
export const soldInShop = (f: Food) => f.price > 0 && !f.caughtOnly && !f.grownOnly && !f.cookedOnly && !f.foundOnly;

// Which tab is showing, how far the tabs are scrolled sideways and which
// sheet is open. Kept by the menu, so they stay while the page redraws
// after buying something.
export interface ShopView {
  tab: ShopCategory;
  scroll?: number;
  open?: string; // an item's key
  trying?: boolean; // false once Take it off is pressed on the open sheet
  fresh?: boolean; // the sheet has just been opened (it slides up only then)
}

interface Page {
  id: ShopCategory;
  title: string;
  icon: string;
  dot?: boolean; // something new on it (today's special, not yet bought)
  items: Item[]; // everything with a sheet
  body: () => HTMLElement[];
}

// The Shop: the awning, its name and purse, the tabs, then the picked
// tab's cards. Today comes first: the daily special, a craving, and the
// things in short supply. The Star counter comes last, after its own
// night-blue tab.
export function shopPage(state: GameState, cb: ShopCallbacks, view: ShopView, redraw: () => void, onBack: () => void): HTMLElement[] {
  const now = state.lastUpdated;
  const S = STRINGS.shop;
  const open = (key: string) => {
    view.open = key;
    view.trying = undefined;
    view.fresh = true;
    redraw();
  };
  const goTo = (tab: ShopCategory) => {
    view.tab = tab;
    view.open = undefined;
    cb.onTryOn(null);
    redraw();
  };
  const gold = state.gold;
  const pieces = state.fragments.pieces;

  // Food, and the bigger rice jar.
  const foods = CONFIG.foods
    .filter(soldInShop)
    .filter((f: Food) => !f.limited || limitedInStock(localDay(now)))
    .map((f: Food) => foodItem(state, f, cb, now));
  // Fortune cookies, opened before mingling, once friends drop by.
  if (isUnlocked(state, 'meet')) {
    foods.push({
      key: 'fortuneCookie',
      art: ITEM_ICONS.fortuneCookie,
      name: S.fortuneCookie,
      kind: S.food,
      about: S.fortuneCookieNote(fortuneCookies(state)),
      tint: TINT.food,
      count: countOf(fortuneCookies(state)),
      price: { cur: 'gold', cost: CONFIG.fortune.price, onBuy: cb.onBuyFortuneCookie },
    });
  }
  const { bigger } = CONFIG.riceJar;
  const bigJar = () => wideCard(ITEM_ICONS.riceBall, '#f1ecfa', S.bigJar,
    hasBigJar(state) ? S.owned : S.bigJarNote(bigger.extra, riceJarSize(state) + bigger.extra),
    hasBigJar(state) ? fact(S.owned) : priceButton({ cur: 'frag', cost: bigger.fragments, onBuy: cb.onBuyBigJar }, pieces));

  // Hats.
  const hats = HATS.map((h) => hatItem(state, h.id, cb));
  const hatsOwned = HATS.filter((h) => state.inventory.hats.includes(h.id)).length;

  // The garden: seeds, then fertilizer and plant cure, then the homemade
  // fertilizer (crafted from poop) and one more pot.
  const seeds: Item[] = SEEDS_FOR_SALE.map((id) => {
    const item: ShopItem = { kind: 'seed', id };
    return {
      key: `seed:${id}`, art: ITEM_ICONS[`seed_${id}`], name: STRINGS.garden.seedName(STRINGS.foods[id]), kind: S.garden,
      about: STRINGS.shop.have(seedCount(state, id)), tint: TINT.garden, count: countOf(seedCount(state, id)),
      price: { cur: 'gold', cost: priceOf(item), onBuy: () => cb.onBuyGardenItem(item) },
    };
  });
  const supplies: Item[] = SUPPLIES.map((id) => {
    const item: ShopItem = { kind: 'supply', id };
    return {
      key: `supply:${id}`, art: ITEM_ICONS[id], name: STRINGS.garden.supplies[id], kind: S.garden,
      about: `${STRINGS.garden.supplyNotes[id]}. ${S.have(supplyCount(state, id))}`, tint: TINT.garden, count: countOf(supplyCount(state, id)),
      price: { cur: 'gold', cost: priceOf(item), onBuy: () => cb.onBuyGardenItem(item) },
    };
  });
  const homemade = () => {
    const per = CONFIG.garden.poopPerFertilizer;
    const poops = poopCount(state);
    const slots = el('span', 'poop-slots', Array.from({ length: per }, (_, i) =>
      `<span class="poop-slot${i < Math.min(poops, per) ? ' on' : ''}">${ITEM_ICONS.poop}</span>`).join(''));
    slots.setAttribute('role', 'img');
    slots.setAttribute('aria-label', S.poopSlots(poops, per));
    const craft = ghostButton(S.craft, cb.onCompost);
    craft.classList.toggle('is-short', !canCompost(state));
    return wideCard(ITEM_ICONS.homemadeFertilizer, TINT.garden, S.homemade, S.homemadeHave(supplyCount(state, 'fertilizer')), craft, slots);
  };
  const pot = () => wideCard(ITEM_ICONS.gardenPot, TINT.garden, S.extraPot, S.extraPotNote,
    priceButton({ cur: 'gold', cost: CONFIG.garden.extraPotPrice, onBuy: cb.onBuyPot }, gold));

  // Fishing.
  const fishing: Item[] = [{
    key: 'bait', art: ITEM_ICONS.bait, name: S.bait, kind: S.fishing, about: S.baitNote(baitCount(state)),
    tint: TINT.fishing, count: countOf(baitCount(state)),
    price: { cur: 'gold', cost: CONFIG.fishing.bait.price, onBuy: cb.onBuyBait },
  }];

  // Journeys: Percy rests after coming along, and gold wakes him early;
  // charms for the lunchbox, used up on one trip; Holiday tickets.
  const journeysOpen = isUnlocked(state, 'journeys');
  const resting = !percyFree(state, now);
  const charms: Item[] = CHARMS.map((c) => {
    const t = STRINGS.journeys.charms[c.id];
    return {
      key: `charm:${c.id}`, art: ITEM_ICONS[`charm_${c.id}`] ?? '', name: t?.name ?? c.id, kind: S.charm, about: t?.note ?? '',
      tint: TINT.charm, count: countOf(charmCount(state, c.id)),
      price: { cur: 'gold', cost: c.price, onBuy: () => cb.onBuyCharm(c.id) },
    };
  });
  const percy = () => wideCard(ITEM_ICONS.percy, '#e9f6ff', STRINGS.journeys.percyRest,
    resting ? STRINGS.journeys.percyRestNote(formatDuration(state.journeys.percyFreeAt - now)) : STRINGS.journeys.percyReady,
    resting ? priceButton({ cur: 'gold', cost: CONFIG.journeys.percy.resetPrice, onBuy: cb.onWakePercy }, gold) : fact(STRINGS.journeys.ready));
  const holiday = () => wideCard(MENU_ICONS.meadow, '#f1ecfa', STRINGS.journeys.holidayTicket, STRINGS.journeys.holidayShopNote(holidayTickets(state)),
    priceButton({ cur: 'frag', cost: CONFIG.journeys.holiday.fragments, onBuy: cb.onBuyHolidayTicket }, pieces));

  // The room: the Family Home (for star fragments only), then wallpaper,
  // furniture and curtains for the room you're looking at.
  const walls = WALLPAPERS.map((d) => decorItem(state, d, cb));
  const furniture = FURNITURE.map((d) => decorItem(state, d, cb));
  const curtains = CURTAINS.map((d) => decorItem(state, d, cb));
  const ownedOf = (list: Decor[]) => list.filter((d) => ownsDecor(state, d.kind, d.id)).length;
  const familyHome = () => {
    const owned = ownsFamilyHome(state);
    const cost = CONFIG.familyHome.fragments;
    const c = wideCard(ITEM_ICONS.familyHome, '#e9f6ff', STRINGS.familyHome.name, STRINGS.familyHome.shopNote,
      owned ? fact(S.owned) : priceButton({ cur: 'frag', cost, onBuy: cb.onBuyFamilyHome }, pieces));
    c.classList.add('is-home');
    if (!owned && pieces < cost) {
      const more = text('button', 'shop-link', S.needMore(cost - pieces));
      more.addEventListener('click', () => goTo('revival'));
      c.querySelector('.shop-wide-text')!.append(more);
    }
    return c;
  };

  const decorateButton = () => {
    const b = ghostButton(S.decorate, () => cb.onDecorate?.(), true);
    b.classList.add('shop-decorate');
    return b;
  };

  // Today: the special, a craving the Shop can help with, and the things
  // in short supply.
  const special = dailySpecial(state);
  const specialNew = !!special && !ownsSpecial(state, special);
  const specialItem = special && (special.kind === 'hat' ? hatItem(state, special.id, cb) : decorItem(state, getDecor(special.kind, special.id)!, cb));
  const craved = state.craving.food ? foods.find((f) => f.key === `food:${state.craving.food}` && f.price) : undefined;
  const scarce = foods.filter((f) => CONFIG.foods.some((c: Food) => c.limited && f.key === `food:${c.id}`));
  const today = (): HTMLElement[] => {
    const out: HTMLElement[] = [];
    if (special && specialItem) {
      const hero = el('div', 'shop-hero');
      hero.append(text('div', 'shop-ribbon', S.todayOff(Math.round(CONFIG.dailySpecial.off * 100))));
      const r = el('div', 'shop-hero-row');
      const art = el('button', `shop-hero-art${special.kind === 'wallpaper' || special.kind === 'curtains' ? ' is-swatch' : ''}`,
        special.kind === 'wallpaper' ? wallSwatch(special.id, 22, 18) : specialItem.art);
      art.setAttribute('aria-label', specialItem.name);
      art.addEventListener('click', () => open(specialItem.key));
      const info = el('div', 'shop-hero-info');
      const owned = ownsSpecial(state, special);
      info.append(text('b', '', specialItem.name),
        text('small', '', owned ? S.specialOwned : S.specialAbout(S.specialKind[special.kind] ?? '', Math.ceil(untilTomorrow(now) / 3_600_000))));
      const acts = el('div', 'shop-hero-acts');
      if (owned) acts.append(fact(S.owned));
      else {
        if (specialItem.preview) acts.append(ghostButton(S.tryIt, () => open(specialItem.key)));
        acts.append(priceButton({ cur: 'gold', cost: special.price, was: special.was, onBuy: specialItem.price?.onBuy ?? (() => {}) }, gold));
      }
      info.append(acts);
      r.append(art, info);
      hero.append(r);
      out.push(hero);
    }
    if (craved) {
      out.push(section(S.craving(state.pet.name)));
      const c = el('div', 'shop-crave');
      const bubble = el('button', 'shop-bubble', `<span>${craved.art}</span>`);
      bubble.setAttribute('aria-label', craved.name);
      bubble.addEventListener('click', () => open(craved.key));
      const t = el('div', 'shop-wide-text');
      t.append(text('b', '', craved.name), text('small', '', S.cravingNote(craved.count ?? 0)));
      c.append(bubble, t, cardAction(craved, state));
      out.push(c);
    }
    if (scarce.length > 0) {
      out.push(section(S.onlyToday, S.untilMidnight), grid('', scarce.map((f) => card(f, state, open))));
    }
    return out;
  };

  // The Star counter: the fragments you have and how close they are to a
  // Revival Star, then packs of them for real money (the only place real
  // money shows).
  const stars = (): HTMLElement[] => {
    const { perStar, perGoodDay } = CONFIG.fragments;
    const have = el('div', 'shop-stars-have');
    const num = el('div', 'shop-have-num', `<span class="shop-ic">${FRAGMENT_ICON}</span>`);
    num.append(String(pieces), text('small', '', S.fragmentsHave));
    const goal = el('div', 'shop-goal');
    const goalRow = el('div', 'shop-goal-row', `<span class="shop-goal-art">${ITEM_ICONS.revivalStar}</span>`);
    goalRow.append(text('b', '', S.revivalStar), text('span', '', S.fragmentsCount(Math.min(pieces, perStar), perStar)));
    const bar = el('div', 'shop-bar', `<i style="width:${Math.min(100, (pieces / perStar) * 100)}%"></i>`);
    bar.setAttribute('role', 'progressbar');
    bar.setAttribute('aria-valuemin', '0');
    bar.setAttribute('aria-valuemax', String(perStar));
    bar.setAttribute('aria-valuenow', String(Math.min(pieces, perStar)));
    const acts = el('div', 'shop-goal-acts');
    const craft = ghostButton(S.craft, cb.onMakeStar);
    craft.classList.add('is-craft');
    craft.classList.toggle('is-short', pieces < perStar);
    acts.append(ghostButton(S.howItWorks, cb.onFragmentsHelp), craft);
    goal.append(goalRow, bar, text('small', '', S.starNote(revivalStars(state), perGoodDay)), acts);
    have.append(num, goal);
    const packs = el('div', 'shop-packs');
    CONFIG.store.forEach((p, i) => {
      const best = i === CONFIG.store.length - 1;
      const pack = el('div', `shop-pack${best ? ' is-best' : ''}`);
      if (best) pack.append(text('span', 'shop-best', S.bestValue));
      pack.insertAdjacentHTML('beforeend', fragmentPile(i + 1));
      pack.append(text('b', '', String(p.fragments)), text('small', '', best ? S.packExtra : ''));
      const buy = text('button', 'shop-buy is-cash', p.price);
      buy.setAttribute('aria-label', S.packBuy(p.fragments, p.price));
      buy.addEventListener('click', () => cb.onBuyPack(p.id));
      pack.append(buy);
      packs.append(pack);
    });
    return [have, section(S.getFragments), packs, text('p', 'shop-fine', S.realMoney)];
  };

  const pages: Page[] = [
    { id: 'today', title: S.todayTab, icon: MENU_ICONS.todayTag, dot: specialNew, items: [...(specialItem ? [specialItem] : []), ...(craved ? [craved] : []), ...scarce], body: today },
    {
      id: 'food', title: S.food, icon: ITEM_ICONS.strawberry, items: foods,
      body: () => [section(S.treats, S.tapToSee), grid('small', foods.map((f) => card(f, state, open))), section(S.jarTitle), bigJar()],
    },
    {
      id: 'garden', title: S.garden, icon: ITEM_ICONS.gardenPot, items: [...seeds, ...supplies],
      body: () => [
        section(S.seeds), grid('small', seeds.map((f) => card(f, state, open))),
        section(S.supplies), grid('small', supplies.map((f) => card(f, state, open))),
        homemade(), ...(canBuyPot(state) ? [pot()] : []),
      ],
    },
    { id: 'fishing', title: S.fishing, icon: ITEM_ICONS.bait, items: fishing, body: () => [section(S.fishing), grid('', fishing.map((f) => card(f, state, open)))] },
    ...(journeysOpen ? [{
      id: 'journeys', title: S.journeys, icon: ITEM_ICONS.charm_compass, items: charms,
      body: () => [percy(), section(S.charms), grid('', charms.map((f) => card(f, state, open))), section(STRINGS.journeys.holidayTicket), holiday()],
    } as Page] : []),
    {
      id: 'room', title: S.room, icon: ITEM_ICONS[`wallpaper_${WALLPAPERS[1]?.id}`] ?? '', items: [...walls, ...furniture, ...curtains],
      body: () => [
        // Decorate: once there's a piece to put somewhere.
        ...(cb.onDecorate && SPOTS.some((spot) => piecesFor(state, spot).length > 0) ? [decorateButton()] : []),
        familyHome(),
        section(S.wallpaper, S.ofAll(ownedOf(WALLPAPERS), WALLPAPERS.length)), grid('two', walls.map((w) => swatchCard(w, state, open))),
        section(S.furnitureTitle, S.ofAll(ownedOf(FURNITURE), FURNITURE.length)), grid('', furniture.map((f) => card(f, state, open))),
        section(S.curtainsTitle, S.ofAll(ownedOf(CURTAINS), CURTAINS.length)), grid('two', curtains.map((c) => swatchCard(c, state, open))),
      ],
    },
    { id: 'hats', title: S.hats, icon: hatIcon(cb.hatImage(HATS[1]?.id ?? '')), items: hats, body: () => [section(S.hats, S.ofAll(hatsOwned, HATS.length)), grid('', hats.map((h) => card(h, state, open)))] },
    { id: 'revival', title: S.starCounter, icon: FRAGMENT_ICON, items: [], body: stars },
  ];
  const shown = pages.find((p) => p.id === view.tab) ?? pages[0];
  view.tab = shown.id;
  const night = shown.id === 'revival';

  const page = el('div', `shop-page${night ? ' is-night' : ''}`);
  const top = el('div', 'shop-top');
  const awning = el('div', 'shop-awning');
  awning.setAttribute('aria-hidden', 'true');
  const head = el('div', 'shop-head');
  const back = el('button', 'shop-back', BACK);
  back.setAttribute('aria-label', STRINGS.menu.back);
  back.addEventListener('click', onBack);
  const purse = el('div', 'shop-purse');
  const coin = el('span', 'shop-coin', `<span class="shop-ic">${STAT_ICONS.gold}</span>`);
  coin.title = STRINGS.gold.label;
  coin.append(String(gold));
  const frags = el('button', 'shop-coin is-frag', `<span class="shop-ic">${FRAGMENT_ICON}</span>`);
  frags.title = S.fragments;
  frags.setAttribute('aria-label', `${S.fragments}: ${pieces}`);
  frags.append(String(pieces));
  frags.addEventListener('click', () => goTo('revival'));
  purse.append(coin, frags);
  head.append(back, text('h2', '', night ? S.starCounter : S.title), purse);
  top.append(awning, head, shopTabs(pages, view, goTo));

  const body = el('div', 'shop-body');
  body.append(...shown.body());
  page.append(top, body);
  const item = view.open ? pages.flatMap((p) => p.items).find((i) => i.key === view.open) : undefined;
  if (item) page.append(sheet(item, state, view, cb, redraw));
  else {
    view.open = undefined;
    cb.onTryOn(null);
  }
  return [page];
}

// [today][FOOD][garden][fishing][journeys][room][hats][stars]
// Folder tabs with pictures, the picked one white like the page under it.
// They share the width while each can stay at least 36px wide (set in the
// CSS); past that (a small phone, or more tabs) the row scrolls sideways
// instead of the tabs getting too small to tap.
function shopTabs(pages: Page[], view: ShopView, goTo: (tab: ShopCategory) => void): HTMLElement {
  const strip = el('div', 'shop-tabs');
  strip.setAttribute('role', 'group');
  strip.setAttribute('aria-label', STRINGS.shop.title);
  let picked: HTMLElement | null = null;
  for (const p of pages) {
    const b = el('button', `shop-tab${p.id === 'revival' ? ' is-stars' : ''}`, `<span class="shop-tab-icon" aria-hidden="true">${p.icon}</span>`);
    b.title = p.title;
    b.setAttribute('aria-label', p.title);
    b.setAttribute('aria-pressed', String(p.id === view.tab));
    if (p.dot) b.append(el('span', 'shop-tab-dot'));
    if (p.id === view.tab) picked = b;
    b.addEventListener('click', () => {
      if (view.tab !== p.id) goTo(p.id);
    });
    strip.append(b);
  }
  strip.addEventListener('scroll', () => (view.scroll = strip.scrollLeft), { passive: true });
  // Once it's on the page: back to where it was scrolled, with the picked
  // tab in sight (other screens can open the Shop at any category).
  requestAnimationFrame(() => {
    strip.scrollLeft = view.scroll ?? 0;
    if (!picked) return;
    const left = picked.offsetLeft; // the strip is the tabs' offsetParent
    if (left < strip.scrollLeft) strip.scrollLeft = left;
    else if (left + picked.offsetWidth > strip.scrollLeft + strip.clientWidth) strip.scrollLeft = left + picked.offsetWidth - strip.clientWidth;
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
