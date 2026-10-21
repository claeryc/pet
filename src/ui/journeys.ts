// The Journeys page inside the gear menu (also opened from Play >
// Journeys). At the top, any pet that's out on a journey (with Call home)
// or back with a backpack to open. Then the three trips on offer: picking
// one opens the lunchbox below it, with what's packed, whether it's enough
// for the trip, Percy, a nudge about pots that will dry out, the Set off
// button and the food you can pack. The rules live in src/game/journeys.ts.

import { STRINGS } from '../strings';
import { CONFIG } from '../game/config';
import type { Food, FoodId } from '../game/actions';
import type { GameState, Pet } from '../game/state';
import { foodCount } from '../game/economy';
import { cantGo, percyFree, planTrip, potsDryingBy, tripHours } from '../game/journeys';
import { hasBackpack, isAway } from '../game/presence';
import { ITEM_ICONS, STAT_ICONS } from './icons';
import { label, row } from './shop';
import { formatClock, formatDuration } from './time';

export interface JourneysCallbacks {
  // The pet you're looking after sets off; true if it went.
  onSetOff: (slot: number, lunch: FoodId[], percy: boolean) => boolean;
  onCallHome: (pet: string) => void;
  onOpenBackpack: (pet: string) => void;
}

// What's picked on the page: a trip, the lunchbox and Percy. Kept by the
// menu while the page redraws.
export interface JourneysView {
  slot: number | null;
  lunch: FoodId[];
  percy: boolean;
}

const J = CONFIG.journeys;
const FOODS = CONFIG.foods as readonly Food[];
const placeName = (id: string) => STRINGS.journeys.places[id] ?? id;
const placeIcon = (id: string) => ITEM_ICONS[`place_${id}`] ?? ITEM_ICONS.journey;

function el<K extends keyof HTMLElementTagNameMap>(tag: K, className: string, text?: string): HTMLElementTagNameMap[K] {
  const e = document.createElement(tag);
  e.className = className;
  if (text !== undefined) e.textContent = text;
  return e;
}

function button(text: string, onClick: () => void, className = 'shop-btn'): HTMLButtonElement {
  const b = el('button', className, text);
  b.addEventListener('click', onClick);
  return b;
}

// A pet that's away (Call home) or home with its backpack (Open).
function petRow(pet: Pet, cb: JourneysCallbacks): HTMLElement {
  const trip = pet.trip!;
  const T = STRINGS.journeys;
  if (isAway(pet)) {
    return row(placeIcon(trip.place), T.away(pet.name, placeName(trip.place)), T.backAt(formatClock(trip.endsAt)),
      button(T.callHome, () => cb.onCallHome(pet.id), 'shop-btn shop-btn-soft'));
  }
  const r = row(ITEM_ICONS.journey, T.home(pet.name, placeName(trip.place)), T.backpackNote,
    button(T.openBackpack, () => cb.onOpenBackpack(pet.id)));
  r.classList.add('journey-backpack');
  return r;
}

// One line of the trip check: a tick when there's enough, a "!" when not.
function check(ok: boolean, yes: string, no: string, icon: string): HTMLElement {
  const line = el('p', `journey-check ${ok ? 'is-ok' : 'is-short'}`);
  const pic = el('span', 'journey-check-icon');
  pic.innerHTML = icon;
  pic.setAttribute('aria-hidden', 'true');
  line.append(pic, `${ok ? '✓' : '!'} ${ok ? yes : no}`);
  return line;
}

// "Tummy +20 · Energy +40"
function foodNote(f: Food): string {
  const parts = [`${STRINGS.stats.hunger} +${f.hunger}`];
  if (f.energy) parts.push(`${STRINGS.stats.energy} +${f.energy}`);
  return parts.join(' · ');
}

export function journeysPage(
  state: GameState,
  now: number,
  view: JourneysView,
  cb: JourneysCallbacks,
  redraw: () => void,
  onWater: () => void,
): HTMLElement[] {
  const T = STRINGS.journeys;
  const out: HTMLElement[] = [];
  const pets = [state.pet, ...state.housemates];
  for (const p of pets) if (p.trip) out.push(petRow(p, cb));

  // The pet you're looking after, if it's home: when it can go again.
  const pet = state.pet;
  const home = !isAway(pet) && !hasBackpack(pet);
  if (home && now < pet.tripReadyAt) out.push(label(T.wait(formatDuration(pet.tripReadyAt - now))));

  // The board.
  out.push(el('h3', 'shop-section', T.offers));
  state.journeys.offers.forEach((offer, slot) => {
    if (!offer) {
      const wait = row(STAT_ICONS.hourglass, T.nextOffer(formatDuration(state.journeys.refillAt[slot] - now)), '', label(''));
      wait.classList.add('journey-empty');
      out.push(wait);
      return;
    }
    const picked = view.slot === slot;
    const hours = tripHours(offer.rarity);
    const r = row(placeIcon(offer.place), T.offer(T.trips[offer.rarity], placeName(offer.place)),
      T.offerNote(T.rarities[offer.rarity], T.hours(hours), formatClock(now + hours * 3_600_000)),
      button(picked ? T.picked : T.pick, () => {
        view.slot = picked ? null : slot;
        redraw();
      }, picked ? 'shop-btn shop-btn-soft' : 'shop-btn'));
    r.classList.add('journey-offer');
    r.dataset.rarity = offer.rarity;
    if (picked) r.classList.add('is-picked');
    out.push(r);
  });

  const offer = view.slot !== null ? state.journeys.offers[view.slot] : null;
  if (!offer || !home) return out;

  // The lunchbox for the picked trip.
  out.push(el('h3', 'shop-section', T.lunchbox(view.lunch.length, J.lunchSlots)));
  const slots = el('div', 'journey-lunch');
  for (let i = 0; i < J.lunchSlots; i++) {
    const id = view.lunch[i];
    const slot = el('button', `journey-lunch-slot${id ? '' : ' is-empty'}`);
    if (id) {
      slot.innerHTML = ITEM_ICONS[id] ?? '';
      slot.setAttribute('aria-label', T.inLunch(STRINGS.foods[id]));
      slot.title = STRINGS.foods[id];
      slot.addEventListener('click', () => {
        view.lunch.splice(i, 1);
        redraw();
      });
    } else {
      slot.setAttribute('aria-label', T.emptySlot);
      slot.disabled = true;
    }
    slots.append(slot);
  }
  out.push(slots, label(T.lunchHint));

  const plan = planTrip(pet, offer.rarity, view.lunch);
  out.push(
    check(plan.enoughFood, T.enoughFood, T.notEnoughFood, STAT_ICONS.hunger),
    check(plan.enoughEnergy, T.enoughEnergy, T.notEnoughEnergy, STAT_ICONS.energy),
  );

  // Percy: a switch while he's free, or how long he's resting.
  const flying = pets.some((p) => p.trip?.percy === 'coming');
  if (percyFree(state, now)) {
    const field = el('div', 'settings-field journey-percy');
    const toggle = el('label', 'settings-toggle');
    const text = el('span', 'shop-row-text');
    text.append(el('b', '', T.percy), el('small', '', T.percyNote));
    const box = el('input', '');
    box.type = 'checkbox';
    box.setAttribute('role', 'switch');
    box.checked = view.percy;
    box.addEventListener('change', () => {
      view.percy = box.checked;
    });
    toggle.append(text, box);
    field.append(toggle);
    out.push(field);
  } else {
    view.percy = false;
    out.push(label(flying ? T.percyFlying : T.percyResting(formatDuration(state.journeys.percyFreeAt - now))));
  }

  // Pots that will dry out with nobody home to water them.
  const dry = potsDryingBy(state, now + tripHours(offer.rarity) * 3_600_000);
  if (dry > 0) {
    const r = row(STAT_ICONS.drop, T.dryPots(dry, pet.name), '', button(T.water, onWater, 'shop-btn shop-btn-soft'));
    r.classList.add('journey-dry');
    out.push(r);
  }

  const ready = plan.enoughFood && plan.enoughEnergy && !cantGo(pet, now);
  const go = button(T.setOff(pet.name), () => {
    if (cb.onSetOff(view.slot!, [...view.lunch], view.percy)) {
      view.slot = null;
      view.lunch = [];
      view.percy = false;
    }
  }, `shop-btn journey-go${ready ? '' : ' too-pricey'}`); // still tappable, so it can say why
  out.push(go);

  // Food to pack: what you have, minus what's packed already.
  const packed = (id: string) => view.lunch.filter((l) => l === id).length;
  const full = view.lunch.length >= J.lunchSlots;
  for (const f of FOODS) {
    const left = foodCount(state, f.id) - packed(f.id);
    if (left <= 0 || f.id === CONFIG.cooking.mess) continue;
    const count = left === Infinity ? STRINGS.shop.free : `× ${left}`;
    const r = row(ITEM_ICONS[f.id] ?? '', STRINGS.foods[f.id], `${foodNote(f)}  ·  ${count}`,
      button(T.add, () => {
        if (view.lunch.length >= J.lunchSlots) return;
        view.lunch.push(f.id);
        redraw();
      }, full ? 'shop-btn too-pricey' : 'shop-btn'));
    out.push(r);
  }
  return out;
}

// The Travel journal in the Collection: one entry per place, with its
// trips, what was found there and the last postcard.
export function journalNote(state: GameState, place: string, when: (at: number) => string): string | null {
  const page = state.journeys.journal[place];
  if (!page || (page.trips === 0 && page.postcards.length === 0)) return null;
  const found = page.found.map((id) => STRINGS.foods[id as FoodId] ?? id).join(', ');
  const note = STRINGS.journeys.journalNote(page.trips, found);
  const last = page.postcards[0];
  return last ? `${note}. ${STRINGS.journeys.lastPostcard(last.name, when(last.at))}` : note;
}
