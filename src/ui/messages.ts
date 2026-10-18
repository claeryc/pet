// The Messages page inside the gear menu. Two tabs: Mail and Friends.
//
// Mail starts with Percy's order as it stands right now (what he wants,
// what's in each box and the time left until pickup, with a button out to
// Percy), or when he'll be back with the next one. Below it, every
// earlier message, newest first: orders announced and picked up, the pet
// hatching and growing up, visitors, little ones and new things to try.
//
// Friends shows whoever is over now, with a Hang out button (out to
// Play > Meet), then your other friends, each with its hearts, an Invite
// button (once a day, when nobody's over) and a way to say goodbye.

import { STRINGS } from '../strings';
import { characterSheet, getCharacter, getVariant } from '../game/growth';
import { CONFIG } from '../game/config';
import type { Friend } from '../game/state';
import { heartRow } from './meet';
import { canInvite, visitor } from '../game/friends';
import { isFull, orderTier } from '../game/delivery';
import { isUnlocked, type UnlockId } from '../game/unlocks';
import type { GameState, Message } from '../game/state';
import type { FoodId } from '../game/actions';
import { ITEM_ICONS, STAT_ICONS, UNKNOWN_ICON } from './icons';
import { formatDuration, formatWhen } from './time';

export type MessagesTab = 'mail' | 'friends';

export interface MessagesActions {
  onTab: (tab: MessagesTab) => void;
  onOpenDelivery: () => void;
  onOpenMeet: () => void;
  onRemoveFriend: (friend: string) => void;
  onInvite: (friend: string) => boolean;
  characterImage: (sheet: string) => string | undefined;
}

function el<K extends keyof HTMLElementTagNameMap>(tag: K, className: string, text?: string): HTMLElementTagNameMap[K] {
  const e = document.createElement(tag);
  e.className = className;
  if (text !== undefined) e.textContent = text;
  return e;
}

const foodName = (id: string) => STRINGS.foods[id as FoodId] ?? id;
const items = (boxes: { food: string; want: number }[]) =>
  boxes.map((b) => STRINGS.delivery.item(b.want, foodName(b.food))).join(', ');

// What a message says.
function text(m: Message): string {
  switch (m.kind) {
    case 'order':
      return STRINGS.delivery.announced(items(m.boxes));
    case 'pickup':
      return STRINGS.delivery.pickedUp(m.boxes.filter(isFull).length, m.gold) +
        (m.seed ? STRINGS.delivery.leftSeed(foodName(m.seed), '') : '');
    case 'unlocked':
      return STRINGS.unlocked[m.id as UnlockId] ?? '';
    case 'growth': {
      if (m.stage === 'baby') return STRINGS.messages.hatched;
      if (m.stage === 'teen') return STRINGS.growth.teen(m.name);
      const c = getCharacter(m.character);
      const name = STRINGS.characterName(c?.name ?? '?', getVariant(c, m.variant)?.name);
      return STRINGS.growth.adult(m.name, name, STRINGS.stars(c?.stars ?? 1));
    }
    case 'visitor': {
      if (m.friend) return STRINGS.messages.friendVisit(m.name);
      const c = getCharacter(m.character);
      return STRINGS.messages.visitor(m.name, STRINGS.characterName(c?.name ?? '?', getVariant(c, m.variant)?.name));
    }
    case 'littleOne':
      return STRINGS.messages.littleOne(m.name, m.friend);
  }
}

// [ Mail | Friends ]
function tabs(tab: MessagesTab, cb: MessagesActions): HTMLElement {
  const sw = el('div', 'tree-switch');
  sw.setAttribute('role', 'group');
  sw.setAttribute('aria-label', STRINGS.messages.title);
  for (const t of ['mail', 'friends'] as const) {
    const b = el('button', 'tree-switch-btn', STRINGS.messages[t]);
    b.setAttribute('aria-pressed', String(tab === t));
    b.addEventListener('click', () => tab !== t && cb.onTab(t));
    sw.append(b);
  }
  return sw;
}

// Percy's order as it stands, or when the next one comes.
function liveOrder(state: GameState, now: number, cb: MessagesActions): HTMLElement | null {
  const order = state.delivery.order;
  if (!order) {
    if (!isUnlocked(state, 'delivery')) return null;
    const card = el('div', 'mail-live idle');
    card.innerHTML = ITEM_ICONS.percy;
    card.append(el('p', 'mail-live-wait', STRINGS.delivery.nextOrder(formatDuration(state.delivery.nextAt - now))));
    return card;
  }
  const card = el('div', 'mail-live');
  card.dataset.tier = orderTier(order.boxes);
  const head = el('div', 'mail-live-head');
  const title = el('b', '', STRINGS.messages.order);
  const when = el('span', 'mail-live-when');
  when.innerHTML = STAT_ICONS.hourglass;
  when.append(STRINGS.delivery.pickupIn(formatDuration(order.pickupAt - now)));
  head.append(title, when);
  const list = el('div', 'mail-live-boxes');
  for (const b of order.boxes) {
    const chip = el('span', 'mail-live-box');
    chip.dataset.fill = isFull(b) ? 'full' : b.have > 0 ? 'some' : 'empty';
    chip.innerHTML = ITEM_ICONS[b.food] ?? '';
    chip.append(`${b.have}/${b.want}`);
    chip.title = foodName(b.food);
    list.append(chip);
  }
  const open = el('button', 'shop-btn mail-live-open', STRINGS.messages.open);
  open.addEventListener('click', cb.onOpenDelivery);
  list.append(open);
  card.append(head, list);
  return card;
}

function messageRow(m: Message, now: number): HTMLElement {
  const row = el('div', `shop-row mail-row kind-${m.kind}`);
  if (m.kind === 'pickup') row.dataset.tier = m.tier;
  const icon = el('span', 'drawer-option-icon');
  icon.innerHTML =
    m.kind === 'order' || m.kind === 'pickup' ? ITEM_ICONS.parcel
    : m.kind === 'visitor' || m.kind === 'littleOne' ? ITEM_ICONS.meet
    : ITEM_ICONS.letter;
  const body = el('span', 'shop-row-text');
  body.append(el('b', '', text(m)), el('small', '', formatWhen(m.at, now, STRINGS.messages.today, STRINGS.messages.yesterday)));
  row.append(icon, body);
  return row;
}

export function messagesPage(state: GameState, now: number, tab: MessagesTab, cb: MessagesActions): HTMLElement[] {
  const out: HTMLElement[] = [tabs(tab, cb)];
  if (tab === 'friends') {
    out.push(...friendsTab(state, now, cb));
    return out;
  }
  const live = liveOrder(state, now, cb);
  if (live) out.push(live);
  if (state.messages.length === 0) {
    out.push(el('p', 'mail-empty', STRINGS.messages.empty));
    return out;
  }
  out.push(el('h3', 'shop-section', STRINGS.messages.earlier));
  out.push(...state.messages.map((m) => messageRow(m, now)));
  return out;
}

// One friend: picture, name and what it is, hearts, and buttons.
function friendRow(f: Friend, state: GameState, now: number, cb: MessagesActions): HTMLElement {
  const over = visitor(state)?.id === f.id;
  const guest = state.visit.guest?.id === f.id;
  const row = el('div', `shop-row friend-row${over ? ' is-guest' : ''}`);
  const pic = el('span', 'drawer-option-icon friend-pic');
  const url = cb.characterImage(characterSheet(f.character, f.variant));
  pic.innerHTML = url ? `<span class="portrait" style="background-image:url('${url}')"></span>` : UNKNOWN_ICON;
  const body = el('span', 'shop-row-text');
  const c = getCharacter(f.character);
  const what = STRINGS.characterName(c?.name ?? '?', getVariant(c, f.variant)?.name);
  body.append(
    el('b', 'friend-name', f.name),
    heartRow(f.score),
    el('small', '', over ? `${what}  ·  ${STRINGS.friends.visiting(formatDuration(state.visit.until - now))}` : what),
  );
  // Hang out with whoever is over; invite anyone else (quieter when
  // someone's already over or today's invite is used, and a tap says why).
  const free = state.visit.until === 0 && canInvite(state, now);
  const button = over
    ? el('button', 'shop-btn friend-hang', STRINGS.friends.hangOut)
    : el('button', `shop-btn friend-hang${free ? '' : ' shop-btn-soft'}`, STRINGS.friends.invite);
  button.addEventListener('click', () => {
    if (over || cb.onInvite(f.id)) cb.onOpenMeet();
  });
  row.append(pic, body, button);
  if (!guest) {
    // Saying goodbye is rare, so it's a small × in the corner.
    const bye = el('button', 'friend-bye', '×');
    bye.title = STRINGS.friends.remove;
    bye.setAttribute('aria-label', `${STRINGS.friends.remove}: ${f.name}`);
    bye.addEventListener('click', () => cb.onRemoveFriend(f.id));
    row.append(bye);
  }
  return row;
}

function friendsTab(state: GameState, now: number, cb: MessagesActions): HTMLElement[] {
  const out: HTMLElement[] = [];
  const over = visitor(state);
  if (over) out.push(el('h3', 'shop-section', STRINGS.messages.visiting), friendRow(over, state, now, cb));
  const wild = state.friends.filter((f) => f.wild).length;
  out.push(el('h3', 'shop-section', STRINGS.messages.yourFriends(wild, CONFIG.friends.maxWild)));
  if (state.friends.length === 0) out.push(el('p', 'mail-empty', STRINGS.messages.friendsEmpty));
  else if (!canInvite(state, now)) out.push(el('p', 'mail-empty friend-hint', STRINGS.messages.inviteTomorrow));
  const others = state.friends.filter((f) => f.id !== over?.id).sort((a, b) => b.score - a.score);
  out.push(...others.map((f) => friendRow(f, state, now, cb)));
  return out;
}
