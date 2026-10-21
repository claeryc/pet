// Journeys (Play > Journeys, or the Journeys tile in the menu). Like
// fishing or the garden, it takes over the spot of the stat bars and the
// button row:
//
//   1. The board: the three trips on offer as tickets, the size of the stat
//      bars. A coloured band shows the rarity with 1, 2 or 3 gems (green,
//      blue, a shiny purple). Tapping one shows its info card at the bottom,
//      just above the buttons: the place, how long, when it's back, what it
//      can bring home and what it uses on the way.
//      Buttons: [Back] [Line up].
//   2. The line-up: who's going. A list like the board, with a row for
//      each pet at home (one, or both together) and Percy last, each with
//      a tick.
//      Buttons: [Back] [Pack a lunch].
//   3. The lunchbox: a wooden bento box seen from above. Two foods go in
//      the big compartment, a drink in the small one at the top and a charm
//      in the one below, and the pet's tummy and energy show now and when
//      it's back home. What you have (Food, Drinks and Charms tabs) sits at
//      the bottom. Tapping something in the box takes it out again.
//      The pet's name is at the top of its stats. Buttons: [Back]
//      [Close the lid]. With two going, each packs its own box in turn.
//   4. Lid on: the wooden lid slides over bit by bit and the trip's label
//      goes on. Tap the box (or Open) to change the lunch.
//      Buttons: [Open] [Set off], or [Open] [Next lunchbox] after the first
//      of two.
//
// The rules live in src/game/journeys.ts.

import { STRINGS } from '../strings';
import { CONFIG } from '../game/config';
import type { Food, FoodId } from '../game/actions';
import type { GameState, Offer, Pet, Rarity } from '../game/state';
import { sheetFor } from '../game/growth';
import { foodCount } from '../game/economy';
import {
  CHARMS, cantGo, charmCount, getPlace, isDrink, percyFree, planTrip, PLACES, potsDryingBy, tripHours, tripPreview,
  type Packed,
} from '../game/journeys';
import { hasBackpack, isAway } from '../game/presence';
import { ITEM_ICONS, STAT_ICONS } from './icons';
import { BENTO_HEIGHT, BENTO_WIDTH, drawBento, LID_FRAMES, lidCover } from './bento';
import { category, type Entry } from './shop';
import { formatClock, formatDuration } from './time';

export interface JourneysCallbacks {
  // The pets in the line-up set off, each with its lunch; true if they went.
  onSetOff: (slot: number, party: Packed[], percy: boolean) => boolean;
  onCallHome: (pet: string) => void;
  onOpenBackpack: (pet: string) => void;
}

export interface JourneysSetup extends JourneysCallbacks {
  onExit: () => void;
  onWater: () => void; // out to the garden, to water before going
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

const J = CONFIG.journeys;
const HOUR = 3_600_000;
const FOODS = CONFIG.foods as readonly Food[];
const GEMS: Record<Rarity, number> = { common: 1, rare: 2, epic: 3 };
const placeName = (id: string) => STRINGS.journeys.places[id] ?? id;
const placeIcon = (id: string) => ITEM_ICONS[`place_${id}`] ?? ITEM_ICONS.journey;

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

// The shine that sweeps over epic things.
function shine(): HTMLElement[] {
  return [el('i', 'trip-sheen'), el('i', 'trip-spark s1', '✦'), el('i', 'trip-spark s2', '✦'), el('i', 'trip-spark s3', '✧')];
}

// One ticket on the board: [gems] [place] Stroll Mossy Woods | 1h COMMON
function ticket(offer: Offer, picked: boolean, onPick: () => void): HTMLButtonElement {
  const T = STRINGS.journeys;
  const b = el('button', `trip-ticket${picked ? ' is-picked' : ''}`);
  b.dataset.rarity = offer.rarity;
  b.setAttribute('aria-pressed', String(picked));
  const band = el('span', 'trip-band');
  band.append(gems(offer.rarity));
  const text = el('span', 'trip-ticket-text');
  text.append(el('b', '', T.trips[offer.rarity]), el('span', '', placeName(offer.place)));
  const stub = el('span', 'trip-stub');
  stub.append(el('b', '', `${tripHours(offer.rarity)}h`), el('small', '', T.rarities[offer.rarity]));
  if (offer.rarity === 'epic') b.append(...shine());
  b.append(band, icon(placeIcon(offer.place), 'trip-ticket-icon'), text, stub);
  b.setAttribute('aria-label', `${T.offer(T.trips[offer.rarity], placeName(offer.place))}, ${T.rarities[offer.rarity]}, ${T.hours(tripHours(offer.rarity))}`);
  b.addEventListener('click', onPick);
  return b;
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
  let stage: 'board' | 'lineup' | 'pack' | 'closed' = 'board';
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
  const lineUp = el('button', 'btn', T.lineUp);
  const pack = el('button', 'btn', T.packLunch);
  const closeLid = el('button', 'btn', T.closeLid);
  const openLid = el('button', 'btn btn-soft', T.openLid);
  const go = el('button', 'btn', T.go);
  const nextBox = el('button', 'btn', T.nextBox);
  row.append(back, openLid, lineUp, pack, closeLid, nextBox, go);

  const allPets = (s: GameState): Pet[] => [s.pet, ...s.housemates];
  // Pets at home, who could be in the line-up.
  const homePets = (s: GameState): Pet[] => allPets(s).filter((p) => !isAway(p) && p.condition !== 'passed');
  const pet = (): Pet | null => (state && allPets(state).find((p) => p.id === who)) ?? null;
  const offer = (): Offer | null => (state && slot !== null ? state.journeys.offers[slot] ?? null : null);

  back.addEventListener('click', () => {
    if (stage === 'board') {
      stop();
      cb.onExit();
      return;
    }
    // Packing the second box: back to the first, lid on.
    const i = going.indexOf(who);
    if (stage === 'pack' && i > 0) {
      who = going[i - 1];
      setStage('closed');
      return;
    }
    setStage(stage === 'pack' ? 'lineup' : 'board');
  });
  nextBox.addEventListener('click', () => {
    const i = going.indexOf(who);
    if (i < 0 || i >= going.length - 1) return;
    who = going[i + 1];
    setStage('pack');
  });
  lineUp.addEventListener('click', () => {
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
    setStage('lineup');
  });
  pack.addEventListener('click', () => {
    if (!state) return;
    if (!going.length) return cb.toast(T.blocked.nobody(state.pet.name));
    for (const p of allPets(state).filter((p) => going.includes(p.id))) {
      const why = cantGo(p, now);
      if (why) return cb.toast(T.blocked[why](p.name));
    }
    who = going[0];
    setStage('pack');
  });
  const tryClose = () => {
    const p = pet();
    const o = offer();
    if (!p || !o) return;
    const result = planTrip(p, o.rarity, lunch());
    if (!result.enoughFood) return cb.toast(T.blocked.notEnoughFood(p.name));
    if (!result.enoughEnergy) return cb.toast(T.blocked.notEnoughEnergy(p.name));
    moveLid(true);
  };
  closeLid.addEventListener('click', tryClose);
  openLid.addEventListener('click', () => moveLid(false));
  go.addEventListener('click', () => {
    if (slot === null) return;
    const party = going.map((id) => {
      const b = boxes.get(id) ?? { food: [], drink: null, charm: null };
      return { pet: id, lunch: lunchOf(b), charm: b.charm };
    });
    if (cb.onSetOff(slot, party, percy)) {
      stop();
      cb.onExit();
    }
  });

  function setStage(next: typeof stage): void {
    stage = next;
    render(true);
  }

  // The lid slides over the box (or off it) a few pixels at a time. Packed
  // things are covered along with it; the label goes on once it's shut.
  function moveLid(shut: boolean): void {
    if (lidMoving) return;
    if (!shut) setStage('pack'); // the open box, with the lid still drawn on top
    const canvas = panel.querySelector<HTMLCanvasElement>('.bento-canvas');
    const items = panel.querySelector<HTMLElement>('.bento-items');
    if (!canvas || !items) return setStage(shut ? 'closed' : 'pack');
    lidMoving = true;
    row.classList.add('is-busy');
    let frame = 0;
    const step = () => {
      const t = frame / LID_FRAMES;
      const cover = shut ? t : 1 - t;
      drawBento(canvas, false, cover);
      items.style.clipPath = `inset(${(lidCover(cover) / BENTO_HEIGHT) * 100}% 0 0 0)`;
      if (frame++ < LID_FRAMES) {
        setTimeout(step, 45);
        return;
      }
      lidMoving = false;
      row.classList.remove('is-busy');
      items.style.clipPath = '';
      if (shut) setStage('closed');
      else render(true);
    };
    step();
  }

  // ---- 1. The board and the trip's info card ----

  function board(s: GameState): HTMLElement {
    const list = el('div', 'trip-board');
    s.journeys.offers.forEach((o, i) => {
      if (!o) {
        const empty = el('div', 'trip-ticket is-empty');
        empty.append(icon(STAT_ICONS.hourglass, 'trip-ticket-icon'), el('span', 'trip-ticket-text', T.nextOffer(formatDuration(s.journeys.refillAt[i] - now))));
        list.append(empty);
        return;
      }
      list.append(ticket(o, i === slot, () => {
        slot = slot === i ? null : i;
        render(true);
      }));
    });
    return list;
  }

  function loot(svg: string, text: string, className = ''): HTMLElement {
    const tile = el('div', `trip-loot ${className}`);
    if (svg) tile.append(icon(svg, 'trip-loot-icon'));
    tile.append(el('small', '', text));
    return tile;
  }

  function infoCard(s: GameState, o: Offer): HTMLElement {
    const p = s.pet;
    const card = el('div', 'trip-card');
    card.dataset.rarity = o.rarity;
    const hours = tripHours(o.rarity);

    const top = el('div', 'trip-card-top');
    const tile = el('span', 'trip-card-tile');
    if (o.rarity === 'epic') tile.append(...shine());
    tile.append(icon(placeIcon(o.place), 'trip-card-place'), gems(o.rarity));
    const name = el('div', 'trip-card-name');
    name.append(el('b', '', placeName(o.place)), el('span', '', T.tripLine(T.trips[o.rarity], T.hours(hours))),
      el('span', '', T.backAt(formatClock(now + hours * HOUR))));
    top.append(tile, name);

    // What it can bring home.
    const place = getPlace(o.place);
    const loots = el('div', 'trip-loots');
    if (place) {
      const preview = tripPreview(place, o.rarity, boxes.get(who)?.charm ?? null);
      loots.append(loot(ITEM_ICONS[preview.ingredient] ?? '', preview.ingredientSure
        ? STRINGS.foods[preview.ingredient as FoodId] : T.maybe(STRINGS.foods[preview.ingredient as FoodId])));
      if (preview.gold) loots.append(loot(STAT_ICONS.gold, T.goldFind));
      if (preview.seeds) loots.append(loot(ITEM_ICONS.seed_carrot, T.seeds));
      loots.append(preview.threeStar > 0
        ? loot('', T.threeStar(Math.round(preview.threeStar * 100)), 'is-star')
        : loot('', T.finds(preview.finds.min, preview.finds.max), 'is-count'));
    }

    // What it uses up on the way.
    const cost = J.cost[o.rarity];
    const costs = el('div', 'trip-card-sec');
    costs.append(el('span', '', T.onTheWay));
    for (const [svg, v] of [[STAT_ICONS.hunger, cost.hunger], [STAT_ICONS.energy, cost.energy]] as const) {
      const chip = el('em', 'trip-cost');
      chip.append(icon(svg, 'trip-cost-icon'), `−${v}`);
      costs.append(chip);
    }
    card.append(top, el('div', 'trip-card-sec', T.bringsHome), loots, costs);

    // Why it can't go yet, if nobody can.
    const why = homePets(s).some((h) => !cantGo(h, now)) ? null : cantGo(p, now);
    if (why) {
      const text = why === 'wait' ? T.wait(formatDuration(p.tripReadyAt - now)) : T.blocked[why](p.name);
      card.append(el('p', 'trip-card-warn', text));
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
      card.append(line);
    }
    return card;
  }

  // ---- 2. The line-up ----

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

  // A row in the line-up, like a ticket: a picture, a name and a tick.
  // One that can't go is faded, with why (or how long) on the right.
  function lineupRow(pic: HTMLElement, name: string, on: boolean, blocked: string | null, onTap: () => void): HTMLElement {
    const b = el('button', `lineup-row${on ? ' is-on' : ''}`);
    b.setAttribute('role', 'checkbox');
    b.setAttribute('aria-checked', String(on));
    b.append(pic, el('b', 'lineup-name', name));
    if (blocked) {
      b.append(el('small', 'lineup-why', blocked));
      b.disabled = true;
      b.title = blocked;
    } else {
      b.append(el('i', 'lineup-tick', on ? '✓' : ''));
      b.addEventListener('click', onTap);
    }
    return b;
  }

  function lineup(s: GameState, o: Offer): HTMLElement[] {
    const head = el('div', 'trip-head');
    head.append(el('b', '', T.lineUpTitle), tripChip(o));
    const list = el('div', 'trip-board lineup-list');
    for (const p of homePets(s)) {
      const why = cantGo(p, now);
      const on = !why && going.includes(p.id);
      const blocked = why ? (why === 'wait' ? formatDuration(p.tripReadyAt - now) : T.cantGoShort[why] ?? T.blocked[why](p.name)) : null;
      list.append(lineupRow(portrait(p, 'lineup-pic'), p.name, on, blocked, () => {
        going = on ? going.filter((id) => id !== p.id) : [...going, p.id];
        render(true);
      }));
    }
    // Percy, last: along or not, unless he's resting.
    const free = percyFree(s, now);
    if (!free) percy = false;
    const flying = allPets(s).some((p) => p.trip?.percy === 'coming');
    const rest = free ? null : flying ? T.percyAway : formatDuration(s.journeys.percyFreeAt - now);
    const row = lineupRow(icon(ITEM_ICONS.percy, 'lineup-pic'), T.percyName, percy, rest, () => {
      percy = !percy;
      render(true);
    });
    row.title = free ? T.percyNote : flying ? T.percyFlying : T.percyResting(rest!);
    list.append(row);
    return [head, list];
  }

  function tripChip(o: Offer): HTMLElement {
    const chip = el('span', 'trip-chip');
    chip.dataset.rarity = o.rarity;
    chip.append(icon(placeIcon(o.place), 'trip-cost-icon'), T.tripLine(T.trips[o.rarity], `${tripHours(o.rarity)}h`));
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
      label.append(head, el('b', '', placeName(o.place)), el('small', '', `${tripHours(o.rarity)}h`));
      const reopen = el('button', 'bento-tap');
      reopen.setAttribute('aria-label', T.openLid);
      reopen.addEventListener('click', () => moveLid(false));
      wrap.append(label, reopen);
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
    head.append(el('b', '', stage === 'closed' ? T.readyTitle : T.lunchTitle), tripChip(o));
    const result = planTrip(p, o.rarity, lunch());
    const bars = el('div', 'trip-bars');
    // Whose box it is, top left.
    const barsHead = el('div', 'trip-bars-top');
    barsHead.append(el('b', 'trip-bars-name', p.name), el('span', 'trip-bars-head', T.nowBack));
    bars.append(barsHead,
      meter(STAT_ICONS.hunger, STRINGS.stats.hunger, p.stats.hunger, result.to.hunger),
      meter(STAT_ICONS.energy, STRINGS.stats.energy, p.stats.energy, result.to.energy));
    // While packing, the Lunch panel sits just under the bars (a short trip
    // shows as a red "!" there), so the notes wait until the lid is on.
    if (stage === 'closed' && charm) bars.append(el('p', 'trip-note', T.charms[charm]?.note ?? ''));
    const out: HTMLElement[] = [head, bento(o), bars];
    if (stage === 'closed') out.push(el('p', 'trip-note', T.tapToOpen));
    return out;
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
    if (!grid.childElementCount) grid.append(el('p', 'trip-note', T.nothingToPack[tab]));
    lunchContent.replaceChildren(tabs, grid);
    grid.scrollLeft = keepScroll;
  }

  // Other pets out on a journey, or home with a backpack, in a line each.
  function others(s: GameState): HTMLElement[] {
    return s.housemates.filter((p) => p.trip).map((p) => {
      const line = el('div', 'trip-other');
      const trip = p.trip!;
      const away = isAway(p);
      line.append(icon(away ? placeIcon(trip.place) : ITEM_ICONS.journey, 'trip-cost-icon'),
        el('span', '', away ? `${T.away(p.name, placeName(trip.place))} · ${T.backAt(formatClock(trip.endsAt))}` : T.home(p.name, placeName(trip.place))));
      const b = el('button', `shop-btn${away ? ' shop-btn-soft' : ''}`, away ? T.callHome : T.openBackpack);
      b.addEventListener('click', () => (away ? cb.onCallHome(p.id) : cb.onOpenBackpack(p.id)));
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
    if (slot !== null && !s.journeys.offers[slot]) {
      slot = null;
      if (stage !== 'board') stage = 'board';
    }
    // A pet that's gone off (or passed) leaves the line-up.
    going = going.filter((id) => homePets(s).some((h) => h.id === id));
    if (stage !== 'board' && stage !== 'lineup' && !going.length) stage = 'lineup';
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
      panel.replaceChildren(...others(s), board(s));
      if (!o) panel.append(el('p', 'trip-note trip-pick-hint', T.pickHint));
      const shown = sheet.firstElementChild as HTMLElement | null;
      const card = o ? infoCard(s, o) : null;
      // A newly picked trip slides up; the same one just refreshes.
      if (card && shown?.dataset.slot !== String(slot)) card.classList.add('is-new');
      if (card) card.dataset.slot = String(slot);
      sheet.replaceChildren(...(card ? [card] : []));
    } else if (o && stage === 'lineup') {
      panel.replaceChildren(...others(s), ...lineup(s, o));
      sheet.replaceChildren();
    } else if (o) {
      if (!going.includes(who)) who = going[0];
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
    lineUp.hidden = stage !== 'board';
    pack.hidden = stage !== 'lineup';
    closeLid.hidden = stage !== 'pack';
    openLid.hidden = stage !== 'closed';
    // Two going: each box in turn, then off they go.
    const last = going.indexOf(who) >= going.length - 1;
    nextBox.hidden = stage !== 'closed' || last;
    go.hidden = stage !== 'closed' || !last;
    const ready = !!o && homePets(s).some((h) => !cantGo(h, now));
    lineUp.classList.toggle('is-waiting', !ready);
    pack.classList.toggle('is-waiting', !going.length);
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
// longest trip taken there (1, 2 or 3 gems), its name and how many trips.
// Places nobody has been to yet are a faded "?".
export function journalCategory(state: GameState, open: Set<string>): HTMLElement {
  const T = STRINGS.journeys;
  const entries: Entry[] = PLACES.map((p) => {
    const page = state.journeys.journal[p.id];
    const visited = !!page && page.trips > 0;
    const card = el('div', `postcard${visited ? '' : ' is-new'}`);
    card.dataset.place = p.id;
    const pic = el('span', 'postcard-pic');
    if (visited) {
      const best = page.best ?? 'common';
      const stamp = el('span', 'postcard-stamp');
      stamp.dataset.rarity = best;
      stamp.append(gems(best));
      stamp.title = T.rarities[best];
      pic.append(el('span', 'postcard-ground'), icon(placeIcon(p.id), 'postcard-place'), stamp);
    } else {
      pic.textContent = '?';
    }
    card.append(pic, el('b', '', placeName(p.id)), el('small', '', visited ? T.tripCount(page.trips) : T.notVisited));
    return { icon: visited ? placeIcon(p.id) : ITEM_ICONS.unknown, row: card, faded: !visited };
  });
  const count = entries.filter((e) => !e.faded).length;
  const section = category('journal', STRINGS.collection.count(T.journal, count, entries.length), entries, open);
  section.classList.add('journal-cat');
  return section;
}

