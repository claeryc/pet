// Meeting other pets (Play > Meet). The friend comes over and stands next
// to your pet in the room, and a panel slides up over the stat bars, like
// Percy's boxes:
//
//   (o) Pip                            ♥♥♥♡♡
//       [Today ●●○]                 ⧗ 2h 40m
//   [ ♥ Mingle: 50% chance of a little one ]   (or [Add friend] for a guest)
//
// The button row becomes [Close] [Gift] [Meet]. Gift opens like Feed does:
// a list of the food you have, each with how much friendship it's worth. Pets come over one at a time (see
// stepVisits), so it's always whoever is visiting now.
//
// The rules (scores, caps, who can mingle) live in src/game/friends.ts.

import { STRINGS } from '../strings';
import { CONFIG } from '../game/config';
import type { Food, FoodId } from '../game/actions';
import { foodCount, localDay } from '../game/economy';
import { characterSheet } from '../game/growth';
import { giftTenths, hearts, isFriend, littleOneChance, mingleBlock, visitor } from '../game/friends';
import type { Friend, GameState } from '../game/state';
import { HEART_ICONS, ITEM_ICONS, STAT_ICONS } from './icons';
import { createDrawer, type DrawerOption } from './drawer';
import { formatDuration } from './time';

export interface MeetCallbacks {
  onMeet: (id: string) => boolean; // true if they played (not refused)
  onGift: (id: string, food: FoodId) => void;
  onMingle: (id: string) => void;
  onAdd: () => void; // add the guest as a friend
  onExit: () => void;
  toast: (message: string) => void;
  characterImage: (sheet: string) => string | undefined;
}

export interface MeetPanel {
  row: HTMLElement; // the buttons, shown in place of the normal button row
  panel: HTMLElement; // shown in place of the stat bars
  start: () => void;
  stop: () => void;
  active: () => boolean;
  update: (state: GameState, now: number) => void;
  // Who's over to play, while open, and whether hearts are floating up.
  scene: () => { friend: Friend; hearts: boolean } | null;
}

// How long the panel takes to slide in and out (matches .meet in style.css).
export const MEET_OUT_MS = 450;
// How long hearts float up after the pets play.
const HEARTS_MS = 2600;

const DAY = 86_400_000;

function el<K extends keyof HTMLElementTagNameMap>(tag: K, className: string, text?: string): HTMLElementTagNameMap[K] {
  const e = document.createElement(tag);
  e.className = className;
  if (text !== undefined) e.textContent = text;
  return e;
}

// Five hearts, each filling up from left to right a tenth at a time.
export function heartRow(score: number): HTMLElement {
  const row = el('span', 'heart-row');
  const h = hearts(score);
  for (let i = 0; i < 5; i++) {
    const fill = Math.max(0, Math.min(1, h - i));
    row.append(heartIcon(fill));
  }
  row.setAttribute('role', 'img');
  row.setAttribute('aria-label', STRINGS.friends.hearts(h));
  row.title = STRINGS.friends.hearts(h);
  return row;
}

// One heart, `fill` (0 to 1) of it full: an empty heart with a full one
// on top, cut off above the fill line (see .heart in style.css).
export function heartIcon(fill: number): HTMLElement {
  const heart = el('span', 'heart');
  heart.innerHTML = HEART_ICONS.empty + HEART_ICONS.full;
  heart.style.setProperty('--fill', String(fill));
  return heart;
}

export function createMeet(cb: MeetCallbacks): MeetPanel {
  let state: GameState | null = null;
  let now = 0;
  let active = false;
  let outTimer = 0;
  let heartsUntil = 0;

  const panel = el('div', 'meet');
  panel.hidden = true;

  const head = el('div', 'meet-head');
  const pic = el('span', 'portrait meet-pic');
  const name = el('b', 'meet-name');
  const heartSlot = el('span', 'meet-hearts');
  // Under the name: today's meetings that counted, as dots. Under the
  // hearts: the time left with the hourglass.
  const today = el('span', 'meet-today');
  const leaves = el('span', 'meet-leaves');
  head.append(pic, name, heartSlot, today, leaves);

  // The Mingle line, or Add friend for a guest.
  const mingle = el('button', 'meet-mingle');
  const add = el('button', 'shop-btn meet-add', STRINGS.friends.add);
  const empty = el('p', 'meet-empty', STRINGS.friends.nobody);
  panel.append(head, mingle, add, empty);

  const row = el('div', 'actions meet-row');
  row.hidden = true;
  const close = el('button', 'btn btn-soft', STRINGS.friends.close);
  const meetBtn = el('button', 'btn', STRINGS.friends.meet);

  // Gift: the food you have (anything that isn't free), like the Feed list.
  // Each row shows how many you have and the friendship it's worth.
  const giftable = (CONFIG.foods as readonly Food[]).filter((food) => food.price > 0);
  const hasGifts = () => !!state && giftable.some((food) => foodCount(state!, food.id) > 0);
  const giftOptions: DrawerOption[] = giftable.map((food) => {
    // What it's worth in hearts, e.g. "+0.2".
    const worth = giftTenths(food.price) / 10;
    return {
      icon: ITEM_ICONS[food.id] ?? '',
      label: STRINGS.foods[food.id as FoodId],
      effects: [{ icon: HEART_ICONS.full, text: `+${worth}`, title: STRINGS.friends.giftWorth(worth) }],
      onPick: () => {
        const f = current();
        if (f) cb.onGift(f.id, food.id);
        heartsUntil = performance.now() + HEARTS_MS;
      },
    };
  });
  const gift = createDrawer({
    id: 'gift',
    label: STRINGS.friends.gift,
    options: giftOptions,
    row,
    comingSoon: '',
    beforeOpen: () => (!current() ? STRINGS.friends.nobody : hasGifts() ? null : STRINGS.friends.noGifts),
    onBlocked: cb.toast,
  });
  row.append(close, gift.el, meetBtn);

  // Whoever is over. If they leave and someone new comes while the panel
  // is open, the gift list closes and the hearts stop.
  let shown: string | null = null;
  const current = (): Friend | null => (state ? visitor(state) : null);

  close.addEventListener('click', () => {
    stop();
    cb.onExit();
  });
  meetBtn.addEventListener('click', () => {
    const f = current();
    if (f && cb.onMeet(f.id)) heartsUntil = performance.now() + HEARTS_MS;
  });
  mingle.addEventListener('click', () => {
    const f = current();
    if (f) cb.onMingle(f.id);
  });
  add.addEventListener('click', cb.onAdd);

  function render(): void {
    if (!state) return;
    const f = current();
    if ((f?.id ?? null) !== shown) {
      shown = f?.id ?? null;
      gift.close();
      heartsUntil = 0;
    }
    meetBtn.disabled = !f;
    gift.setDim(!f);
    // How many of each food you have; food you're out of is left off.
    giftable.forEach((food, i) => {
      const count = foodCount(state!, food.id);
      gift.setNote(i, `${food.stars ? `${STRINGS.stars(food.stars)}  ` : ''}× ${count}`);
      gift.setHidden(i, count === 0);
    });
    if (!f) {
      name.textContent = '';
      pic.hidden = true;
      heartSlot.replaceChildren();
      today.hidden = leaves.hidden = true;
      mingle.hidden = add.hidden = true;
      empty.hidden = false;
      return;
    }
    name.textContent = f.name;
    const url = cb.characterImage(characterSheet(f.character, f.variant));
    pic.hidden = !url;
    if (url) pic.style.backgroundImage = `url('${url}')`;
    heartSlot.replaceChildren(heartRow(f.score));
    const metToday = f.day === localDay(now) ? f.metToday : 0;
    const left = formatDuration(state.visit.until - now);
    const perDay = CONFIG.friends.meet.perDay;
    const met = Math.min(metToday, perDay);
    today.hidden = leaves.hidden = false;
    leaves.innerHTML = STAT_ICONS.hourglass;
    leaves.append(left);
    leaves.title = STRINGS.friends.visiting(left);
    today.replaceChildren(el('small', '', STRINGS.friends.today));
    for (let i = 0; i < perDay; i++) today.append(el('i', i < met ? 'is-met' : ''));
    today.title = STRINGS.friends.metToday(met, perDay);
    today.setAttribute('aria-label', STRINGS.friends.metToday(met, perDay));
    today.dataset.done = String(met >= perDay);

    empty.hidden = true;
    const known = isFriend(state, f.id);
    add.hidden = known;
    mingle.hidden = !known;
    if (!known) return;
    // The Mingle line says what it would take, or the chance.
    const block = mingleBlock(state, f.id, now);
    mingle.dataset.ready = String(block === null);
    let text: string;
    if (block === null) text = STRINGS.friends.mingleChance(littleOneChance(f.score));
    else if (block === 'hearts') text = STRINGS.friends.mingleHint(CONFIG.friends.mingle.minScore);
    else if (block === 'wait') text = STRINGS.friends.mingleWait(formatDuration(f.mingledAt + CONFIG.friends.mingle.waitDays * DAY - now));
    else text = STRINGS.friends.mingle;
    mingle.innerHTML = HEART_ICONS.full;
    mingle.append(el('span', '', text));
  }

  function stop(): void {
    if (!active) return;
    active = false;
    row.hidden = true;
    gift.close();
    panel.classList.remove('is-in');
    clearTimeout(outTimer);
    outTimer = window.setTimeout(() => (panel.hidden = true), MEET_OUT_MS);
  }

  return {
    row,
    panel,
    start() {
      active = true;
      heartsUntil = 0;
      row.hidden = false;
      clearTimeout(outTimer);
      panel.hidden = false;
      render();
      void panel.offsetHeight;
      panel.classList.add('is-in');
      const f = current();
      if (f) cb.toast(STRINGS.friends.start(f.name));
    },
    stop,
    active: () => active,
    scene: () => {
      const f = active ? current() : null;
      return f ? { friend: f, hearts: performance.now() < heartsUntil } : null;
    },
    update(nextState, at) {
      state = nextState;
      now = at;
      if (active) render();
    },
  };
}
