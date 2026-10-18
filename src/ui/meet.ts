// Meeting other pets (Play > Meet). The friend comes over and stands next
// to your pet in the room, and a panel slides up over the stat bars, like
// Percy's boxes:
//
//   (o) (o) (o) (o)                   <- everyone you can meet; tap one
//   Pip                                ♥♥♥♡♡
//   Visiting · leaves in 5h   ·   Met 1 of 3 today
//   [ ♥ Mingle: 50% chance of a little one ]   (or [Add friend] for a guest)
//
// The button row becomes [Close] [Gift] [Meet]. Gift swaps the Mingle line
// for the food you could give. The portraits stay put, in the same order
// (the wanderer visiting now first, then your friends by hearts), and the
// one you picked gets a pink ring.
//
// The rules (scores, caps, who can mingle) live in src/game/friends.ts.

import { STRINGS } from '../strings';
import { CONFIG } from '../game/config';
import type { Food, FoodId } from '../game/actions';
import { foodCount, localDay } from '../game/economy';
import { characterSheet } from '../game/growth';
import { hearts, isFriend, littleOneChance, meetable, mingleBlock } from '../game/friends';
import type { Friend, GameState } from '../game/state';
import { HEART_ICONS, ITEM_ICONS } from './icons';
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
  start: (id?: string) => void; // open, at this friend if given
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

// Five hearts, filled in by halves.
export function heartRow(score: number): HTMLElement {
  const row = el('span', 'heart-row');
  const h = hearts(score);
  for (let i = 0; i < 5; i++) {
    const kind = h >= i + 1 ? 'full' : h >= i + 0.5 ? 'half' : 'empty';
    row.insertAdjacentHTML('beforeend', HEART_ICONS[kind]);
  }
  row.setAttribute('role', 'img');
  row.setAttribute('aria-label', STRINGS.friends.hearts(h));
  row.title = STRINGS.friends.hearts(h);
  return row;
}

export function createMeet(cb: MeetCallbacks): MeetPanel {
  let state: GameState | null = null;
  let now = 0;
  let active = false;
  let outTimer = 0;
  let selected: string | null = null;
  let gifting = false;
  let heartsUntil = 0;

  const panel = el('div', 'meet');
  panel.hidden = true;

  // Who to meet: one portrait each, in a row that scrolls if it's long.
  const picker = el('div', 'meet-picker');
  picker.setAttribute('role', 'radiogroup');
  picker.setAttribute('aria-label', STRINGS.friends.who);
  const head = el('div', 'meet-head');
  const name = el('b', 'meet-name');
  const heartSlot = el('span', 'meet-hearts');
  head.append(name, heartSlot);
  const sub = el('p', 'meet-sub');

  // The Mingle line, or Add friend for a guest.
  const mingle = el('button', 'meet-mingle');
  const add = el('button', 'shop-btn meet-add', STRINGS.friends.add);
  // The gift picker.
  const gifts = el('div', 'meet-gifts');
  const empty = el('p', 'meet-empty');
  panel.append(picker, head, sub, mingle, add, gifts, empty);

  const row = el('div', 'actions meet-row');
  row.hidden = true;
  const close = el('button', 'btn btn-soft', STRINGS.friends.close);
  const gift = el('button', 'btn btn-soft meet-gift-btn', STRINGS.friends.gift);
  const meetBtn = el('button', 'btn', STRINGS.friends.meet);
  row.append(close, gift, meetBtn);

  const list = () => (state ? meetable(state) : []);
  const current = (): Friend | null => list().find((f) => f.id === selected) ?? list()[0] ?? null;

  function pick(id: string): void {
    if (id === selected) return;
    selected = id;
    gifting = false;
    heartsUntil = 0;
    render();
  }

  // Rebuilt only when the people in it change, so it doesn't jump about
  // or lose its scroll position every minute.
  let pickerKey = '';
  function renderPicker(all: Friend[], on: Friend | null): void {
    const key = all.map((f) => `${f.id}:${f.character}:${f.variant}`).join(',');
    if (key !== pickerKey) {
      pickerKey = key;
      picker.replaceChildren(
        ...all.map((f) => {
          const b = el('button', 'meet-pick');
          b.dataset.id = f.id;
          b.setAttribute('role', 'radio');
          b.setAttribute('aria-label', f.name);
          b.title = f.name;
          const url = cb.characterImage(characterSheet(f.character, f.variant));
          if (url) {
            const pic = el('span', 'portrait');
            pic.style.backgroundImage = `url('${url}')`;
            b.append(pic);
          }
          b.addEventListener('click', () => pick(f.id));
          return b;
        }),
      );
    }
    picker.hidden = all.length === 0;
    for (const b of picker.children as HTMLCollectionOf<HTMLElement>) {
      const chosen = b.dataset.id === on?.id;
      b.setAttribute('aria-checked', String(chosen));
      b.classList.toggle('is-guest', state?.visit.guest?.id === b.dataset.id);
      if (chosen && picker.scrollWidth > picker.clientWidth) b.scrollIntoView({ block: 'nearest', inline: 'nearest' });
    }
  }
  close.addEventListener('click', () => {
    stop();
    cb.onExit();
  });
  meetBtn.addEventListener('click', () => {
    const f = current();
    if (f && cb.onMeet(f.id)) heartsUntil = performance.now() + HEARTS_MS;
  });
  gift.addEventListener('click', () => {
    gifting = !gifting;
    render();
  });
  mingle.addEventListener('click', () => {
    const f = current();
    if (f) cb.onMingle(f.id);
  });
  add.addEventListener('click', cb.onAdd);

  // Food you could give: anything you have that isn't free.
  function giftButtons(f: Friend): void {
    if (!state) return;
    const foods = (CONFIG.foods as readonly Food[]).filter((food) => food.price > 0 && foodCount(state!, food.id) > 0);
    gifts.replaceChildren();
    empty.hidden = foods.length > 0;
    empty.textContent = STRINGS.friends.noGifts;
    for (const food of foods) {
      const b = el('button', 'meet-gift');
      b.innerHTML = ITEM_ICONS[food.id] ?? '';
      b.append(el('small', '', String(foodCount(state, food.id))));
      const label = STRINGS.foods[food.id as FoodId];
      b.title = label;
      b.setAttribute('aria-label', `${STRINGS.friends.gift}: ${label}`);
      b.addEventListener('click', () => cb.onGift(f.id, food.id));
      gifts.append(b);
    }
  }

  function render(): void {
    if (!state) return;
    const f = current();
    const all = list();
    renderPicker(all, f);
    meetBtn.disabled = gift.disabled = !f;
    gift.setAttribute('aria-pressed', String(gifting));
    if (!f) {
      name.textContent = '';
      heartSlot.replaceChildren();
      sub.textContent = '';
      mingle.hidden = add.hidden = gifts.hidden = true;
      empty.hidden = false;
      empty.textContent = STRINGS.friends.nobody;
      return;
    }
    selected = f.id;
    name.textContent = f.name;
    heartSlot.replaceChildren(heartRow(f.score));
    const guest = state.visit.guest?.id === f.id;
    const metToday = f.day === localDay(now) ? f.metToday : 0;
    const where = guest ? STRINGS.friends.visiting(formatDuration(state.visit.until - now)) : STRINGS.friends.wildFriend;
    sub.textContent = `${where}  ·  ${STRINGS.friends.metToday(Math.min(metToday, CONFIG.friends.meet.perDay), CONFIG.friends.meet.perDay)}`;

    gifts.hidden = !gifting;
    if (gifting) {
      mingle.hidden = add.hidden = true;
      giftButtons(f);
      return;
    }
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
    gifting = false;
    panel.classList.remove('is-in');
    clearTimeout(outTimer);
    outTimer = window.setTimeout(() => (panel.hidden = true), MEET_OUT_MS);
  }

  return {
    row,
    panel,
    start(id) {
      active = true;
      if (id) selected = id;
      gifting = false;
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
