// Journeys (Play > Journeys, or the Journeys tile in the menu). Like
// fishing or the garden, it takes over the spot of the stat bars and the
// button row:
//
//   1. The board: "Where to today?" and a rack of postcards, two by two:
//      the three trips on offer and tonight's night trip, each with a
//      picture of the place and a stamp with how long and 1 to 3 stars.
//      Tapping one turns it over: a note from your pet saying what it
//      might bring home, the finds as stamps and when it's back as the
//      postmark. The Holiday chip top right shows the Holiday instead.
//      Buttons: [Back] [Get ready].
//   2. Get ready: who's going and their lunch, on one screen. At the top a
//      chip for each pet at home and Percy, ticked if they're coming. Below,
//      a wooden bento box seen from above: two foods go in the big
//      compartment, a drink in the small one at the top and a charm in the
//      one below, and the pet's tummy and energy show now and when it's
//      back home. What you have (Food, Drinks and Charms tabs) sits at the
//      bottom, with "Same as last time" first once a pet has been on a
//      trip. Tapping something in the box takes it out again. With two
//      going, their names over the stats switch between the two boxes.
//      Buttons: [Back] [Set off].
//   3. Set off: the wooden lid slides over bit by bit, the trip's label
//      goes on, and off they go.
//
// The rules live in src/game/journeys.ts.

import { STRINGS } from '../strings';
import { CONFIG } from '../game/config';
import type { Food, FoodId } from '../game/actions';
import type { GameState, Offer, Pet, Rarity } from '../game/state';
import { sheetFor } from '../game/growth';
import { foodCount } from '../game/economy';
import {
  CHARMS, MEADOW, NIGHT, cantGo, cantHoliday, charmCount, getPlace, holidayTickets, isDrink, offerAt, offerHours, percyFree, planTrip,
  placeLevel, PLACES, potsDryingBy, tripPreview, type Packed,
} from '../game/journeys';
import { hasBackpack, isAway } from '../game/presence';
import { HEART_ICONS, ITEM_ICONS, STAT_ICONS } from './icons';
import { drawPlace } from '../render/places';
import { BENTO_HEIGHT, BENTO_WIDTH, drawBento, LID_FRAMES, lidCover } from './bento';
import { category, type Entry } from './shop';
import { formatClock, formatDayClock, formatDuration } from './time';

export interface JourneysCallbacks {
  // The pets in the line-up set off, each with its lunch; true if they went.
  onSetOff: (slot: number, party: Packed[], percy: boolean) => boolean;
  onCallHome: (pet: string) => void;
  onOpenBackpack: (pet: string) => void;
  onHoliday: (days: number) => boolean; // everyone goes on a Holiday; true if they went
}

export interface JourneysSetup extends JourneysCallbacks {
  onExit: () => void;
  onWater: () => void; // out to the garden, to water before going
  onShop: () => void; // to the Shop's Journeys tab, for a Holiday ticket
  toast: (message: string) => void;
  characterImage: (sheet: string) => string | undefined;
}

export interface JourneysScene {
  row: HTMLElement; // the buttons, shown in place of the normal button row
  panel: HTMLElement; // shown in place of the stat bars
  sheet: HTMLElement; // the info card or the lunch tiles, just above the buttons
  start: () => void;
  stop: () => void;
  active: () => boolean;
  update: (state: GameState, now: number) => void;
}

// One pet's lunchbox: the big compartment, the drink and the charm.
interface Box {
  food: FoodId[];
  drink: FoodId | null;
  charm: string | null;
}

// How long the stat bars wait to fill back up after Journeys closes.
export const JOURNEYS_OUT_MS = 300;
// How long the closed lunchbox shows, label on, before they set off.
const LID_HOLD_MS = 650;

const J = CONFIG.journeys;
const HOUR = 3_600_000;
const FOODS = CONFIG.foods as readonly Food[];
const GEMS: Record<Rarity, number> = { common: 1, rare: 2, epic: 3 };
// A place's picture on a postcard, in the scene's own pixels (scaled up
// with CSS, like the room).
const PLACE_W = 64;
const PLACE_H = 48;
const placeName = (id: string) => STRINGS.journeys.places[id] ?? id;
const placeIcon = (id: string) => ITEM_ICONS[`place_${id}`] ?? ITEM_ICONS.journey;
// The Holiday ticket's spot on the board (after the night ticket).
const HOLIDAY = 4;
// "Stroll", or "Night trip" for the night ticket.
const tripName = (o: Offer) => (o.night ? STRINGS.journeys.night : STRINGS.journeys.trips[o.rarity]);

// How long until a pet is back, short enough for the line-up: whole and
// half hours ("1h", "1.5h", "0.5h"), and minutes under half an hour.
export function shortLeft(ms: number): string {
  const minutes = Math.max(0, Math.ceil(ms / 60_000));
  if (minutes < 30) return `${Math.max(1, minutes)}m`;
  return `${Math.ceil(minutes / 30) / 2}h`;
}

function el<K extends keyof HTMLElementTagNameMap>(tag: K, className: string, text?: string): HTMLElementTagNameMap[K] {
  const e = document.createElement(tag);
  e.className = className;
  if (text !== undefined) e.textContent = text;
  return e;
}

function icon(svg: string, className: string): HTMLElement {
  const e = el('span', className);
  e.innerHTML = svg;
  e.setAttribute('aria-hidden', 'true');
  return e;
}

// 1, 2 or 3 little diamonds for a rarity.
function gems(rarity: Rarity): HTMLElement {
  const row = el('span', 'trip-gems');
  for (let i = 0; i < GEMS[rarity]; i++) row.append(el('i', 'trip-gem'));
  return row;
}

// tummy or energy: the bar now (striped) and when it's back (solid), with
// the low line it has to stay above. "70 → 36 ✓"
function meter(statIcon: string, name: string, now: number, after: number): HTMLElement {
  const ok = after >= CONFIG.lowStatThreshold;
  const row = el('div', 'trip-meter');
  const track = el('span', 'trip-track');
  const nowFill = el('span', 'trip-fill-now');
  nowFill.style.width = `${Math.round(now)}%`;
  const afterFill = el('span', 'trip-fill-after');
  afterFill.style.width = `${Math.round(after)}%`;
  const line = el('span', 'trip-lowline');
  line.style.left = `${CONFIG.lowStatThreshold}%`;
  track.append(nowFill, afterFill, line);
  const text = el('span', `trip-meter-text ${ok ? 'is-ok' : 'is-short'}`, `${Math.round(now)} → ${Math.round(after)} ${ok ? '✓' : '!'}`);
  row.append(icon(statIcon, 'trip-meter-icon'), track, text);
  row.setAttribute('role', 'img');
  row.setAttribute('aria-label', STRINGS.journeys.meter(name, Math.round(now), Math.round(after)));
  return row;
}

export function createJourneys(cb: JourneysSetup): JourneysScene {
  const T = STRINGS.journeys;
  let state: GameState | null = null;
  let now = 0;
  let active = false;
  // What's picked: a trip, who's going with their lunches, Percy, and
  // which step it's on.
  // 'closed' is the moment the lid is on, just before they set off.
  let stage: 'board' | 'pack' | 'closed' = 'board';
  let slot: number | null = null;
  let going: string[] = []; // pet ids, in the order they were picked
  let boxes = new Map<string, Box>(); // each pet's lunchbox
  let who = ''; // whose box is on show
  let percy = false;
  let tab: 'food' | 'drink' | 'charm' = 'food';
  const box = (): Box => {
    let b = boxes.get(who);
    if (!b) boxes.set(who, (b = { food: [], drink: null, charm: null }));
    return b;
  };
  const lunchOf = (b: Box): FoodId[] => (b.drink ? [...b.food, b.drink] : [...b.food]);
  const lunch = (): FoodId[] => lunchOf(box());
  // Everything packed in every box going (to count what's left).
  const packed = (): FoodId[] => going.flatMap((id) => (boxes.has(id) ? lunchOf(boxes.get(id)!) : []));
  const charmsPacked = (id: string) => going.filter((p) => boxes.get(p)?.charm === id).length;
  let shownKey = '';
  let lidMoving = false; // the lid is going on or coming off

  const panel = el('div', 'journeys');
  panel.hidden = true;

  // At the bottom, above the buttons: the trip's info card on the board,
  // what you have to pack while packing.
  const sheet = el('div', 'journeys-sheet');
  sheet.hidden = true;
  const lunchContent = el('div', 'lunch-panel');

  // The button row. Each step shows its own buttons.
  const row = el('div', 'actions journeys-row');
  row.hidden = true;
  const back = el('button', 'btn btn-soft', T.back);
  const getReady = el('button', 'btn', T.getReady);
  const go = el('button', 'btn', T.go);
  const holiday = el('button', 'btn', T.holidayGo);
  row.append(back, getReady, holiday, go);

  const allPets = (s: GameState): Pet[] => [s.pet, ...s.housemates];
  // Pets at home, who could be in the line-up.
  const homePets = (s: GameState): Pet[] => allPets(s).filter((p) => !isAway(p) && p.condition !== 'passed');
  const pet = (): Pet | null => (state && allPets(state).find((p) => p.id === who)) ?? null;
  const offer = (): Offer | null => (state && slot !== null && slot !== HOLIDAY ? offerAt(state, slot) : null);
  let days = J.holiday.days[0] as number; // how long a Holiday is, as picked

  back.addEventListener('click', () => {
    // A trip picked: back to all the postcards first.
    if (stage === 'board' && slot !== null) {
      slot = null;
      flipped = null;
      render(true);
      return;
    }
    if (stage === 'board') {
      stop();
      cb.onExit();
      return;
    }
    if (stage === 'pack') setStage('board');
  });
  getReady.addEventListener('click', () => {
    if (!state) return;
    if (!offer()) return cb.toast(T.blocked.noOffer(state.pet.name));
    const can = homePets(state).filter((p) => !cantGo(p, now));
    if (!can.length) {
      const why = cantGo(state.pet, now)!;
      return cb.toast(T.blocked[why](state.pet.name));
    }
    // Who goes, to start with: whoever was picked last time and still
    // can, or else the pet you're looking after (or the other one).
    going = going.filter((id) => can.some((p) => p.id === id));
    if (!going.length) going = [can[0].id];
    who = going[0];
    setStage('pack');
  });
  // Set off: every box is checked first (showing the one that's short),
  // then the lid goes on and off they go.
  go.addEventListener('click', () => {
    if (!state || slot === null || stage !== 'pack') return;
    const o = offer();
    if (!o) return;
    if (!going.length) return cb.toast(T.blocked.nobody(state.pet.name));
    for (const id of going) {
      const p = allPets(state).find((h) => h.id === id);
      if (!p) continue;
      const why = cantGo(p, now);
      const plan = planTrip(p, o, lunchOf(boxes.get(id) ?? { food: [], drink: null, charm: null }));
      const short = why ?? (!plan.enoughFood ? 'notEnoughFood' : !plan.enoughEnergy ? 'notEnoughEnergy' : null);
      if (!short) continue;
      if (who !== id) {
        who = id;
        render(true);
      }
      return cb.toast(T.blocked[short](p.name));
    }
    moveLid(() => {
      const party = going.map((id) => {
        const b = boxes.get(id) ?? { food: [], drink: null, charm: null };
        return { pet: id, lunch: lunchOf(b), charm: b.charm };
      });
      if (cb.onSetOff(slot!, party, percy)) {
        stop();
        cb.onExit();
      } else {
        setStage('pack');
      }
    });
  });
  holiday.addEventListener('click', () => {
    if (!state) return;
    const why = cantHoliday(state);
    if (why) return cb.toast(T.blocked[why.blocked](allPets(state).find((p) => p.id === why.pet)?.name ?? state.pet.name));
    if (cb.onHoliday(days)) {
      stop();
      cb.onExit();
    }
  });
  function setStage(next: typeof stage): void {
    stage = next;
    render(true);
  }

  // The lid slides over the box a few pixels at a time, covering what's
  // packed along with it. The label goes on once it's shut, and after a
  // moment `done` runs.
  function moveLid(done: () => void): void {
    if (lidMoving) return;
    const canvas = panel.querySelector<HTMLCanvasElement>('.bento-canvas');
    const items = panel.querySelector<HTMLElement>('.bento-items');
    const finish = () => {
      lidMoving = false;
      row.classList.remove('is-busy');
      done();
    };
    lidMoving = true;
    row.classList.add('is-busy');
    if (!canvas || !items || matchMedia('(prefers-reduced-motion: reduce)').matches) {
      lidMoving = false;
      setStage('closed');
      lidMoving = true;
      setTimeout(finish, LID_HOLD_MS);
      return;
    }
    let frame = 0;
    const step = () => {
      const cover = frame / LID_FRAMES;
      drawBento(canvas, false, cover);
      items.style.clipPath = `inset(${(lidCover(cover) / BENTO_HEIGHT) * 100}% 0 0 0)`;
      if (frame++ < LID_FRAMES) {
        setTimeout(step, 45);
        return;
      }
      lidMoving = false;
      setStage('closed');
      lidMoving = true;
      setTimeout(finish, LID_HOLD_MS);
    };
    step();
  }

  // ---- 1. The board: postcards of the places ----

  // The name of a pet at home whose favourite place this is, if any.
  const fanOf = (s: GameState, place: string): string | null => homePets(s).find((p) => p.favouritePlace === place)?.name ?? null;
  // The trip whose postcard has already turned over (so a redraw doesn't
  // flip it again).
  let flipped: number | null = null;

  // The rack: a postcard for each trip on offer, two by two, and tonight's
  // night trip last (or a card saying when it comes). Over it, the title
  // and the Holiday tickets. A picked trip's postcard turns over in its
  // place to show what it might bring home.
  function board(s: GameState): HTMLElement[] {
    const head = el('div', 'trip-head');
    head.append(el('b', '', T.rackTitle), holidayChip(s));
    const o = offer();
    if (o && slot !== null) return [head, postcardBack(s, o, slot)];
    if (slot === HOLIDAY) return [head, holidayCard(s)];
    const rack = el('div', 'trip-rack');
    const pick = (i: number) => () => {
      slot = i;
      render(true);
    };
    s.journeys.offers.forEach((offer, i) => {
      rack.append(offer ? postcard(offer, pick(i), fanOf(s, offer.place)) : waiting(T.nextOffer(formatDuration(s.journeys.refillAt[i] - now))));
    });
    const night = s.journeys.night;
    rack.append(night ? postcard(night, pick(NIGHT), fanOf(s, night.place)) : waiting(T.nightSoon(nightAt()), true));
    return [head, rack];
  }

  // The time the night trip comes up today, as "20:00".
  const nightAt = (): string => {
    const d = new Date(now);
    d.setHours(J.night.fromHour, 0, 0, 0);
    return formatClock(d.getTime());
  };

  // A little picture of a place, from the same scenes the trip shows.
  function placeArt(place: string, night: boolean): HTMLCanvasElement {
    const c = el('canvas', 'trip-pc-art');
    c.width = PLACE_W;
    c.height = PLACE_H;
    const ctx = c.getContext('2d');
    if (ctx) drawPlace(ctx, place, PLACE_W, PLACE_H, night, 0);
    return c;
  }

  // The stamp in a postcard's corner: how long, and 1 to 3 stars (a moon
  // for the night trip).
  function stamp(o: Offer): HTMLElement {
    return el('span', 'trip-pc-stamp', `${offerHours(o)}h ${o.night ? '☾' : '★'.repeat(GEMS[o.rarity])}`);
  }

  // One trip on offer: the place, its name and the kind of trip.
  function postcard(o: Offer, onPick: () => void, fan: string | null): HTMLButtonElement {
    const b = el('button', `trip-pc${o.night ? ' is-night' : ''}`);
    b.dataset.rarity = o.rarity;
    b.append(placeArt(o.place, !!o.night), stamp(o), el('b', '', placeName(o.place)), el('small', '', o.night ? T.nightBoard : tripName(o)));
    if (fan) {
      const heart = el('span', 'trip-pc-fav');
      heart.append(icon(HEART_ICONS.full, 'trip-pc-fav-icon'), T.favouriteShort(fan));
      b.append(heart);
    }
    b.setAttribute('aria-label', `${T.offer(tripName(o), placeName(o.place))}, ${T.hours(offerHours(o))}${fan ? `, ${T.favourite(fan)}` : ''}`);
    b.addEventListener('click', onPick);
    return b;
  }

  // A spot with nothing in it yet: the back of a card, and when that changes.
  function waiting(text: string, night = false): HTMLElement {
    const card = el('div', `trip-pc is-waiting${night ? ' is-night' : ''}`);
    card.append(night ? el('i', 'trip-pc-moon', '☾') : icon(STAT_ICONS.hourglass, 'trip-pc-wait-icon'), el('small', '', text));
    return card;
  }

  // The Holiday tickets you have, top right. Tapping it shows the Holiday.
  function holidayChip(s: GameState): HTMLButtonElement {
    const b = el('button', `trip-holiday-chip${slot === HOLIDAY ? ' is-on' : ''}`);
    b.setAttribute('aria-pressed', String(slot === HOLIDAY));
    b.append(icon(HEART_ICONS.full, 'trip-cost-icon'), T.holidayChip(holidayTickets(s)));
    b.addEventListener('click', () => {
      slot = slot === HOLIDAY ? null : HOLIDAY;
      render(true);
    });
    return b;
  }

  // The picked trip's postcard, turned over: a note from your pet about
  // what it might bring home, the finds as stamps (the ones it might not
  // find as shadows with a "?"), and when it's back as the postmark. Tap
  // it to turn it back over.
  function postcardBack(s: GameState, o: Offer, at: number): HTMLElement {
    const wrap = el('div', 'trip-flip');
    const card = el('button', `trip-pc-card${o.night ? ' is-night' : ''}`);
    card.dataset.rarity = o.rarity;
    const front = el('span', 'trip-pc-front');
    front.append(placeArt(o.place, !!o.night), stamp(o));
    const back = el('span', 'trip-pc-back');
    const hours = offerHours(o);
    const writer = fanOf(s, o.place) ?? (homePets(s).find((p) => !cantGo(p, now)) ?? s.pet).name;
    const place = getPlace(o.place);
    const stamps = el('span', 'trip-pc-stamps');
    const lines: string[] = [o.night ? T.noteNight : T.noteHours(T.hours(hours))];
    if (place) {
      const preview = tripPreview(place, o.rarity, boxes.get(who)?.charm ?? null);
      const food = STRINGS.foods[preview.ingredient as FoodId];
      lines.push(T.noteFind(food, preview.ingredientSure, preview.gold, preview.seeds));
      lines.push(preview.threeStar > 0 ? T.noteStar(Math.round(preview.threeStar * 100)) : T.noteFinds(preview.finds.min, preview.finds.max));
      const add = (svg: string, label: string, sure: boolean) => {
        const st = el('span', `trip-pc-find${sure ? '' : ' is-maybe'}`);
        st.append(icon(svg, 'trip-pc-find-icon'));
        st.title = sure ? label : T.maybe(label);
        stamps.append(st);
      };
      add(ITEM_ICONS[preview.ingredient] ?? '', food, preview.ingredientSure);
      if (preview.gold) add(STAT_ICONS.gold, T.goldFind, false);
      if (preview.seeds) add(ITEM_ICONS.seed_carrot, T.seeds, false);
    }
    stamps.append(el('span', 'trip-pc-find is-wide', stamp(o).textContent ?? ''));
    const note = el('span', 'trip-pc-note');
    const title = el('span', '');
    title.append(el('b', '', placeName(o.place)), ` · ${o.night ? T.night : tripName(o)}`);
    note.append(title);
    for (const line of lines) note.append(el('span', '', line));
    note.append(el('span', 'trip-pc-sign', T.noteSign(writer)));
    const mark = el('span', 'trip-pc-postmark');
    mark.append(el('small', '', T.postmark), el('b', '', formatDayClock(now + hours * HOUR, now)));
    back.append(note, stamps, mark);
    card.append(front, back);
    card.setAttribute('aria-label', `${T.offer(tripName(o), placeName(o.place))}. ${lines.join(' ')} ${T.backAt(formatDayClock(now + hours * HOUR, now))}. ${T.flipBack}`);
    card.addEventListener('click', () => {
      slot = null;
      flipped = null;
      render(true);
    });
    // It turns over when first picked, and stays turned over after that.
    if (flipped === at) card.classList.add('is-flipped');
    else requestAnimationFrame(() => requestAnimationFrame(() => card.classList.add('is-flipped')));
    flipped = at;
    wrap.append(card, el('p', 'trip-note', T.flipBack));

    // Why it can't go yet, if nobody can.
    const p = s.pet;
    const why = homePets(s).some((h) => !cantGo(h, now)) ? null : cantGo(p, now);
    if (why) {
      const text = why === 'wait' ? T.wait(formatDuration(p.tripReadyAt - now)) : T.blocked[why](p.name);
      wrap.append(el('p', 'trip-card-warn', text));
    }
    // Pots that will dry out with nobody home to water them.
    const dry = potsDryingBy(s, now + hours * HOUR);
    if (dry > 0 && !why) {
      const line = el('p', 'trip-card-dry');
      line.append(icon(STAT_ICONS.drop, 'trip-cost-icon'), T.dryPots(dry, p.name));
      const water = el('button', 'shop-btn shop-btn-soft', T.water);
      water.addEventListener('click', () => {
        stop();
        cb.onWater();
      });
      line.append(water);
      wrap.append(line);
    }
    return wrap;
  }

  // What a Holiday is, how long, and who goes.
  function holidayCard(s: GameState): HTMLElement {
    const card = el('div', 'trip-card is-holiday');
    const top = el('div', 'trip-card-top');
    const tile = el('span', 'trip-card-tile is-art');
    tile.append(placeArt(MEADOW, false));
    const name = el('div', 'trip-card-name');
    name.append(el('b', '', T.holiday), el('span', '', T.holidayTicketsLeft(holidayTickets(s))),
      el('span', '', T.backAt(formatDayClock(now + days * 24 * HOUR, now))));
    top.append(tile, name);
    const picker = el('div', 'trip-days');
    const none = holidayTickets(s) <= 0;
    for (const d of J.holiday.days) {
      const b = el('button', `trip-day${d === days && !none ? ' is-on' : ''}`, T.holidayDays(d));
      b.disabled = none;
      b.setAttribute('aria-pressed', String(d === days));
      b.addEventListener('click', () => {
        days = d;
        render(true);
      });
      picker.append(b);
    }
    card.append(top, el('p', 'trip-card-note', T.holidayNote), picker);
    // No ticket: a way to the Shop, rather than a red line.
    if (none) {
      const shop = el('button', 'trip-card-shop', T.holidayGetTicket);
      shop.addEventListener('click', () => {
        stop();
        cb.onShop();
      });
      card.append(shop);
      return card;
    }
    const why = cantHoliday(s);
    if (why) {
      const who = allPets(s).find((p) => p.id === why.pet)?.name ?? s.pet.name;
      card.append(el('p', 'trip-card-warn', T.blocked[why.blocked](who)));
    }
    return card;
  }

  // ---- 2. Getting ready: who's going ----

  function portrait(p: Pet, className: string): HTMLElement {
    const pic = el('span', className);
    const url = cb.characterImage(sheetFor(p));
    if (url) {
      const img = el('span', 'portrait');
      img.style.backgroundImage = `url('${url}')`;
      pic.append(img);
    }
    return pic;
  }

  // A chip in the party row: a picture, a name and a tick. One that can't
  // go is faded, with why (or how long) in place of the tick.
  function partyChip(pic: HTMLElement, name: string, on: boolean, blocked: string | null, onTap: () => void): HTMLElement {
    const b = el('button', `party-chip${on ? ' is-on' : ''}`);
    b.setAttribute('role', 'checkbox');
    b.setAttribute('aria-checked', String(on));
    b.append(pic, el('b', 'party-name', name));
    if (blocked) {
      b.append(el('small', 'party-why', blocked));
      b.disabled = true;
      b.title = blocked;
    } else {
      b.append(el('i', 'party-tick', on ? '✓' : ''));
      b.addEventListener('click', onTap);
    }
    return b;
  }

  // Everyone at home who could come, then Percy. A pet out on another
  // journey is left out: its trip is behind the note on the wall.
  function party(s: GameState): HTMLElement {
    const list = el('div', 'party');
    for (const p of homePets(s)) {
      const why = cantGo(p, now);
      const on = !why && going.includes(p.id);
      const blocked = why ? (why === 'wait' ? formatDuration(p.tripReadyAt - now) : T.cantGoShort[why] ?? T.blocked[why](p.name)) : null;
      list.append(partyChip(portrait(p, 'party-pic'), p.name, on, blocked, () => {
        going = on ? going.filter((id) => id !== p.id) : [...going, p.id];
        // Show the box of the one just added (or the one still going).
        who = on ? going[0] ?? '' : p.id;
        render(true);
      }));
    }
    const free = percyFree(s, now);
    if (!free) percy = false;
    const flying = allPets(s).some((p) => p.trip?.percy === 'coming');
    const rest = free ? null : flying ? T.percyAway : formatDuration(s.journeys.percyFreeAt - now);
    const chip = partyChip(icon(ITEM_ICONS.percy, 'party-pic'), T.percyName, percy, rest, () => {
      percy = !percy;
      render(true);
    });
    chip.title = free ? T.percyNote : flying ? T.percyFlying : T.percyResting(rest!);
    list.append(chip);
    return list;
  }

  function tripChip(o: Offer): HTMLElement {
    const chip = el('span', 'trip-chip');
    chip.dataset.rarity = o.rarity;
    chip.append(icon(placeIcon(o.place), 'trip-cost-icon'), T.tripLine(tripName(o), `${offerHours(o)}h`));
    return chip;
  }

  // ---- 3 and 4. The lunchbox ----

  // Where the food sits in the open box: the big compartment, then the two
  // small ones (fractions of the canvas, see drawBento).
  function bento(o: Offer): HTMLElement {
    const wrap = el('div', `bento${stage === 'closed' ? ' is-closed' : ''}`);
    const canvas = el('canvas', 'bento-canvas');
    canvas.style.aspectRatio = `${BENTO_WIDTH} / ${BENTO_HEIGHT}`;
    drawBento(canvas, stage === 'closed');
    wrap.append(canvas);
    if (stage === 'closed') {
      const label = el('div', 'bento-label');
      label.dataset.rarity = o.rarity;
      const head = el('span', 'bento-label-top');
      head.append(icon(placeIcon(o.place), 'bento-label-icon'));
      label.append(head, el('b', '', placeName(o.place)), el('small', '', `${offerHours(o)}h`));
      wrap.append(label);
      return wrap;
    }
    // A spot in the box: what's in it (tap to take it out), or a faint
    // picture of what goes there (tap to pack something).
    const spot = (className: string, id: string | null, hint: string, label: string, take: () => void, want: typeof tab) => {
      const b = el('button', `bento-spot ${className}${id ? '' : ' is-empty'}`);
      if (id) {
        b.append(icon(ITEM_ICONS[id] ?? '', 'bento-spot-icon'));
        b.setAttribute('aria-label', T.inLunch(label));
        b.title = label;
        b.addEventListener('click', () => {
          take();
          render(true);
        });
      } else {
        b.append(icon(hint, 'bento-spot-hint'));
        b.setAttribute('aria-label', T.emptySpot[want]);
        b.addEventListener('click', () => {
          tab = want;
          render(true);
        });
      }
      return b;
    };
    const items = el('div', 'bento-items');
    const { food } = box();
    for (let i = 0; i < J.lunch.food; i++) {
      const id = food[i] ?? null;
      items.append(spot(`bento-food bento-food-${i}`, id, STAT_ICONS.hunger, id ? STRINGS.foods[id] : '', () => food.splice(i, 1), 'food'));
    }
    const { drink, charm } = box();
    items.append(
      spot('bento-drink', drink, STAT_ICONS.energy, drink ? STRINGS.foods[drink] : '', () => (box().drink = null), 'drink'),
      spot('bento-charm', charm ? `charm_${charm}` : null, ITEM_ICONS.charm_clover, charm ? T.charms[charm]?.name ?? charm : '',
        () => (box().charm = null), 'charm'),
    );
    wrap.append(items);
    return wrap;
  }

  function lunchbox(s: GameState, o: Offer): HTMLElement[] {
    const p = pet() ?? s.pet;
    const { charm } = box();
    const head = el('div', 'trip-head');
    // Getting ready, who's going sits where the title would be.
    head.append(stage === 'closed' ? el('b', '', T.readyTitle) : party(s), tripChip(o));
    const result = planTrip(p, o, lunch());
    const bars = el('div', 'trip-bars');
    // Whose box it is, top left. With two going, both names, to switch boxes.
    const barsHead = el('div', 'trip-bars-top');
    const names = el('span', 'trip-bars-names');
    for (const id of going.length > 1 && stage === 'pack' ? going : [p.id]) {
      const h = allPets(s).find((x) => x.id === id);
      if (!h) continue;
      if (going.length < 2 || stage !== 'pack') {
        names.append(el('b', 'trip-bars-name', h.name));
        continue;
      }
      const b = el('button', `trip-bars-name${id === who ? ' is-on' : ''}`, h.name);
      b.setAttribute('aria-pressed', String(id === who));
      b.addEventListener('click', () => {
        who = id;
        render(true);
      });
      names.append(b);
    }
    barsHead.append(names, el('span', 'trip-bars-head', T.nowBack));
    bars.append(barsHead,
      meter(STAT_ICONS.hunger, STRINGS.stats.hunger, p.stats.hunger, result.to.hunger),
      meter(STAT_ICONS.energy, STRINGS.stats.energy, p.stats.energy, result.to.energy));
    // While packing, the Lunch panel sits just under the bars (a short trip
    // shows as a red "!" there), so the notes wait until the lid is on.
    if (stage === 'closed' && charm) bars.append(el('p', 'trip-note', T.charms[charm]?.note ?? ''));
    return [head, bento(o), bars];
  }

  // The spot in the open box where the last thing packed went.
  function landing(): HTMLElement | null {
    const b = box();
    const at = tab === 'charm' ? '.bento-charm' : tab === 'drink' ? '.bento-drink' : `.bento-food-${b.food.length - 1}`;
    return panel.querySelector<HTMLElement>(`${at} .bento-spot-icon`);
  }

  // What you picked jumps from its tile into its spot in the box, in a
  // little arc, and lands with a bounce.
  function jumpIn(svg: string, from: DOMRect): void {
    const target = landing();
    if (!target || matchMedia('(prefers-reduced-motion: reduce)').matches) return;
    const to = target.getBoundingClientRect();
    const flier = icon(svg, 'lunch-flier');
    Object.assign(flier.style, { left: `${from.left}px`, top: `${from.top}px`, width: `${from.width}px`, height: `${from.height}px` });
    document.body.append(flier);
    target.style.visibility = 'hidden';
    const dx = to.left + to.width / 2 - (from.left + from.width / 2);
    const dy = to.top + to.height / 2 - (from.top + from.height / 2);
    const scale = to.width / from.width;
    const hop = Math.min(-60, dy * 0.25 - 60); // the top of the arc, above the higher end
    const move = flier.animate([
      { transform: 'translate(0, 0) scale(1) rotate(0deg)' },
      { transform: `translate(${dx * 0.5}px, ${dy * 0.5 + hop}px) scale(${(1 + scale) / 2 + 0.2}) rotate(-12deg)`, offset: 0.45 },
      { transform: `translate(${dx}px, ${dy}px) scale(${scale}) rotate(0deg)` },
    ], { duration: 480, easing: 'cubic-bezier(0.3, 0, 0.6, 1)' });
    const land = () => {
      flier.remove();
      target.style.visibility = '';
      target.animate([
        { transform: 'scale(1.25, 0.75)' }, { transform: 'scale(0.9, 1.12)' }, { transform: 'scale(1)' },
      ], { duration: 260, easing: 'ease-out' });
    };
    move.onfinish = land;
    move.oncancel = land;
  }

  // What you can pack: a tab each for food, drinks and charms, with what
  // you have (less what's packed) as tiles in one row you swipe along, the
  // most filling (or the strongest drink) first. Packing something keeps
  // the row where it was; a new tab or box starts it at the beginning.
  function lunchTiles(s: GameState): void {
    const shown = lunchContent.querySelector<HTMLElement>('.lunch-grid');
    const keepScroll = shown && shown.dataset.for === `${who}:${tab}` ? shown.scrollLeft : 0;
    const tabs = el('div', 'lunch-tabs');
    const tabList = [['food', STAT_ICONS.hunger, T.foodTab], ['drink', STAT_ICONS.energy, T.drinkTab], ['charm', ITEM_ICONS.charm_clover, T.charmTab]] as const;
    for (const [id, svg, text] of tabList) {
      const t = el('button', `lunch-tab${tab === id ? ' is-on' : ''}`);
      t.setAttribute('aria-pressed', String(tab === id));
      t.append(icon(svg, 'trip-cost-icon'), text);
      t.addEventListener('click', () => {
        tab = id;
        lunchTiles(s);
      });
      tabs.append(t);
    }
    const grid = el('div', 'lunch-grid');
    grid.dataset.for = `${who}:${tab}`;
    const tile = (svg: string, name: string, left: number, gives: string, full: boolean, onPick: () => void) => {
      const b = el('button', `lunch-tile${full ? ' is-full' : ''}`);
      b.append(icon(svg, 'lunch-tile-icon'), el('i', 'lunch-count', left === Infinity ? '∞' : `×${left}`), el('small', '', gives));
      b.title = name;
      b.setAttribute('aria-label', T.packFood(name, left === Infinity ? STRINGS.shop.free : String(left)));
      b.addEventListener('click', () => {
        if (full) return cb.toast(T.spotFull[tab]);
        const from = b.querySelector('.lunch-tile-icon')!.getBoundingClientRect();
        onPick();
        render(true);
        jumpIn(svg, from);
      });
      grid.append(b);
    };
    const same = sameAsLast(s);
    if (same) {
      const b = el('button', 'lunch-tile lunch-same');
      b.append(el('b', '', T.sameLunch));
      b.addEventListener('click', () => {
        boxes.set(who, same);
        render(true);
      });
      grid.append(b);
    }
    if (tab === 'charm') {
      for (const c of CHARMS) {
        const left = charmCount(s, c.id) - charmsPacked(c.id);
        if (left <= 0) continue;
        tile(ITEM_ICONS[`charm_${c.id}`] ?? '', T.charms[c.id]?.name ?? c.id, left, T.charms[c.id]?.short ?? '', !!box().charm, () => (box().charm = c.id));
      }
    } else {
      const gives = (f: Food) => (tab === 'drink' ? f.energy ?? 0 : f.hunger);
      for (const f of [...FOODS].sort((a, b) => gives(b) - gives(a))) {
        if (f.id === CONFIG.cooking.mess || isDrink(f.id) !== (tab === 'drink') || f.hunger + (f.energy ?? 0) <= 0) continue;
        const left = foodCount(s, f.id) - packed().filter((id) => id === f.id).length;
        if (left <= 0) continue;
        const b = box();
        const full = tab === 'drink' ? !!b.drink : b.food.length >= J.lunch.food;
        tile(ITEM_ICONS[f.id] ?? '', STRINGS.foods[f.id], left, `+${gives(f)}`, full, () => {
          if (tab === 'drink') b.drink = f.id;
          else b.food.push(f.id);
        });
      }
    }
    if (grid.childElementCount === (same ? 1 : 0)) grid.append(el('p', 'trip-note', T.nothingToPack[tab]));
    lunchContent.replaceChildren(tabs, grid);
    grid.scrollLeft = keepScroll;
  }

  // What the pet on show took last time, as far as you still have it (less
  // what's in the other box): null if there's nothing to fill, or it's
  // packed already.
  function sameAsLast(s: GameState): Box | null {
    const last = pet()?.lastLunch;
    if (!last) return null;
    const others = going.filter((id) => id !== who).map((id) => boxes.get(id)).filter((b): b is Box => !!b);
    const used = (id: FoodId) => others.flatMap(lunchOf).filter((f) => f === id).length;
    const next: Box = { food: [], drink: null, charm: null };
    for (const id of last.lunch as FoodId[]) {
      const left = foodCount(s, id) - used(id) - lunchOf(next).filter((f) => f === id).length;
      if (left <= 0) continue;
      if (isDrink(id)) next.drink ??= id;
      else if (next.food.length < J.lunch.food) next.food.push(id);
    }
    if (last.charm && charmCount(s, last.charm) - others.filter((b) => b.charm === last.charm).length > 0) next.charm = last.charm;
    if (!next.food.length && !next.drink && !next.charm) return null;
    const now = box();
    const key = (b: Box) => JSON.stringify([[...b.food].sort(), b.drink, b.charm]);
    return key(next) === key(now) ? null : next;
  }

  // Other pets home with a backpack, in a line each. (One out on a
  // journey only shows in the line-up: its trip is behind the note on the
  // wall at home.)
  function others(s: GameState): HTMLElement[] {
    return s.housemates.filter(hasBackpack).map((p) => {
      const line = el('div', 'trip-other');
      const trip = p.trip!;
      line.append(icon(ITEM_ICONS.journey, 'trip-cost-icon'), el('span', '', T.home(p.name, placeName(trip.place))));
      const b = el('button', 'shop-btn', T.openBackpack);
      b.addEventListener('click', () => cb.onOpenBackpack(p.id));
      line.append(b);
      return line;
    });
  }

  // Redraws when something on show changed (or `force`).
  function render(force = false): void {
    const s = state;
    if (!s) return;
    const p = s.pet;
    // The offer picked went (another pet took it): back to the board.
    if (slot !== null && slot !== HOLIDAY && !offerAt(s, slot)) {
      slot = null;
      if (stage !== 'board') stage = 'board';
    }
    // A pet that's gone off (or passed) leaves the line-up.
    going = going.filter((id) => homePets(s).some((h) => h.id === id));
    if (stage === 'closed' && !going.length) stage = 'board';
    // Packed things you've run out of come out of the boxes.
    const used = new Map<string, number>();
    const keep = (id: string, have: number) => {
      const n = used.get(id) ?? 0;
      if (n >= have) return false;
      used.set(id, n + 1);
      return true;
    };
    for (const id of going) {
      const b = boxes.get(id);
      if (!b) continue;
      b.food = b.food.filter((f) => keep(f, foodCount(s, f)));
      if (b.drink && !keep(b.drink, foodCount(s, b.drink))) b.drink = null;
      if (b.charm && !keep(`charm:${b.charm}`, charmCount(s, b.charm))) b.charm = null;
    }
    const key = JSON.stringify([stage, slot, going, who, going.map((id) => boxes.get(id) ?? null), percy, tab, s.inventory.supplies, s.journeys,
      allPets(s).map((h) => [h.id, h.stage, h.asleep, h.condition, h.tripReadyAt, Math.round(h.stats.hunger), Math.round(h.stats.energy),
        Math.round(h.stats.happiness), Math.round(h.stats.health), h.trip?.backAt, h.trip?.endsAt]),
      s.inventory.food, Math.floor(now / 60_000)]);
    if (lidMoving || (!force && key === shownKey)) return;
    shownKey = key;

    const o = offer();
    panel.dataset.stage = stage;
    if (stage === 'board') {
      panel.replaceChildren(...others(s), ...board(s));
      if (!o && slot !== HOLIDAY) panel.append(el('p', 'trip-note trip-pick-hint', T.pickHint));
      sheet.replaceChildren();
    } else if (o) {
      if (!going.includes(who)) who = going[0] ?? s.pet.id;
      panel.replaceChildren(...others(s), ...lunchbox(s, o));
      if (stage === 'pack') {
        lunchTiles(s);
        // Put back in only when it isn't up yet: moving it would play the
        // slide-up again on every pick.
        if (sheet.firstElementChild !== lunchContent) sheet.replaceChildren(lunchContent);
      } else {
        sheet.replaceChildren();
      }
    }
    sheet.hidden = !sheet.childElementCount;
    // The buttons for this step.
    back.hidden = stage === 'closed';
    getReady.hidden = stage !== 'board' || slot === HOLIDAY;
    holiday.hidden = stage !== 'board' || slot !== HOLIDAY;
    holiday.classList.toggle('is-waiting', !!cantHoliday(s));
    go.hidden = stage === 'board';
    const ready = !!o && homePets(s).some((h) => !cantGo(h, now));
    getReady.classList.toggle('is-waiting', !ready);
    go.classList.toggle('is-waiting', !going.length);
  }

  function stop(): void {
    if (!active) return;
    active = false;
    row.hidden = true;
    sheet.hidden = true;
    // Gone straight away: the stat bars come back in its place.
    panel.classList.remove('is-in');
    panel.hidden = true;
  }

  return {
    row,
    panel,
    sheet,
    start() {
      active = true;
      stage = 'board';
      slot = null;
      going = [];
      boxes = new Map();
      who = '';
      percy = false;
      tab = 'food';
      sheet.replaceChildren();
      row.hidden = false;
      panel.hidden = false;
      render(true);
      void panel.offsetHeight;
      panel.classList.add('is-in');
    },
    stop,
    active: () => active,
    update(next, at) {
      state = next;
      now = at;
      if (!active) return;
      // The pet you're looking after went off (or nobody's home): done.
      if (isAway(next.pet) || hasBackpack(next.pet)) {
        stop();
        cb.onExit();
        return;
      }
      render();
    },
  };
}

// ---- The travel journal (in the Collection) ----

// A postcard per place: a little picture of it with a stamp for the
// longest trip taken there (1, 2 or 3 gems), its name, its level and how
// many trips. Tap one to open its page in the travel journal. Places nobody
// has been to yet are a faded "?".
export function journalCategory(state: GameState, open: Set<string>, onJournal?: (place: string) => void): HTMLElement {
  const T = STRINGS.journeys;
  const entries: Entry[] = PLACES.map((p) => {
    const page = state.journeys.journal[p.id];
    const visited = !!page && page.trips > 0;
    const card = el(visited && onJournal ? 'button' : 'div', `postcard${visited ? '' : ' is-new'}`);
    card.dataset.place = p.id;
    const pic = el('span', 'postcard-pic');
    if (visited) {
      const best = page.best ?? 'common';
      const stamp = el('span', 'postcard-stamp');
      stamp.dataset.rarity = best;
      stamp.append(gems(best));
      stamp.title = T.rarities[best];
      pic.append(el('span', 'postcard-ground'), icon(placeIcon(p.id), 'postcard-place'), stamp);
      if (onJournal) card.addEventListener('click', () => onJournal(p.id));
    } else {
      pic.textContent = '?';
    }
    const note = visited ? T.levelLine(T.levels[placeLevel(page.trips)], T.tripCount(page.trips)) : T.notVisited;
    card.append(pic, el('b', '', placeName(p.id)), el('small', '', note));
    return { icon: visited ? placeIcon(p.id) : ITEM_ICONS.unknown, row: card, faded: !visited };
  });
  const count = entries.filter((e) => !e.faded).length;
  const section = category('journal', STRINGS.collection.count(T.journal, count, entries.length), entries, open);
  section.classList.add('journal-cat');
  return section;
}
