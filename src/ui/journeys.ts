// Journeys (Play > Journeys, or the Journeys tile in the menu). Like
// fishing or the garden, it takes over the spot of the stat bars and the
// button row:
//
//   1. The board: the three trips on offer as tickets, the size of the stat
//      bars. A coloured band shows the rarity with 1, 2 or 3 gems (green,
//      blue, a shiny purple). Tapping one shows its info card below: the
//      place, how long, when it's back, what it can bring home, what it
//      uses on the way, and Percy's switch at the top right.
//      Buttons: [Back] [Pack a lunch].
//   2. The lunchbox: a wooden bento box seen from above. Two foods go in
//      the big compartment, a drink in the small one at the top and a charm
//      in the one below, and the pet's tummy and energy show now and when
//      it's back home. The Lunch panel opens from the bottom with what you
//      have (Food, Drinks and Charms tabs). Tapping something in the box
//      takes it out again. Buttons: [Back] [Lunch] [Close the lid].
//   3. Lid on: the wooden lid with the trip's label. Tap the box (or Open)
//      to change the lunch. Buttons: [Open] [Set off].
//
// The rules live in src/game/journeys.ts.

import { STRINGS } from '../strings';
import { CONFIG } from '../game/config';
import type { Food, FoodId } from '../game/actions';
import type { GameState, Offer, Pet, Rarity } from '../game/state';
import { foodCount } from '../game/economy';
import {
  CHARMS, cantGo, charmCount, getPlace, isDrink, percyFree, planTrip, PLACES, potsDryingBy, tripHours, tripPreview,
} from '../game/journeys';
import { hasBackpack, isAway } from '../game/presence';
import { ITEM_ICONS, STAT_ICONS } from './icons';
import { createDrawer } from './drawer';
import { BENTO_HEIGHT, BENTO_WIDTH, drawBento } from './bento';
import { category, type Entry } from './shop';
import { formatClock, formatDuration } from './time';

export interface JourneysCallbacks {
  // The pet you're looking after sets off; true if it went.
  onSetOff: (slot: number, lunch: FoodId[], percy: boolean, charm: string | null) => boolean;
  onCallHome: (pet: string) => void;
  onOpenBackpack: (pet: string) => void;
}

export interface JourneysSetup extends JourneysCallbacks {
  onExit: () => void;
  onWater: () => void; // out to the garden, to water before going
  toast: (message: string) => void;
}

export interface JourneysScene {
  row: HTMLElement; // the buttons, shown in place of the normal button row
  panel: HTMLElement; // shown in place of the stat bars
  start: () => void;
  stop: () => void;
  active: () => boolean;
  update: (state: GameState, now: number) => void;
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
  // What's picked: a trip, the lunch and Percy, and which step it's on.
  let stage: 'board' | 'pack' | 'closed' = 'board';
  let slot: number | null = null;
  let food: FoodId[] = []; // the big compartment
  let drink: FoodId | null = null;
  let charm: string | null = null;
  let percy = false;
  let tab: 'food' | 'drink' | 'charm' = 'food';
  const lunch = (): FoodId[] => (drink ? [...food, drink] : [...food]);
  let shownKey = '';

  const panel = el('div', 'journeys');
  panel.hidden = true;

  // The button row. Each step shows its own buttons.
  const row = el('div', 'actions journeys-row');
  row.hidden = true;
  const back = el('button', 'btn btn-soft', T.back);
  const pack = el('button', 'btn', T.packLunch);
  const closeLid = el('button', 'btn', T.closeLid);
  const openLid = el('button', 'btn btn-soft', T.openLid);
  const go = el('button', 'btn', T.go);

  // The Lunch panel: tabs, the food you have as tiles, and Close the lid.
  const lunchContent = el('div', 'lunch-panel');
  const lunchDrawer = createDrawer({
    id: 'lunch',
    label: T.lunch,
    content: lunchContent,
    row,
    comingSoon: '',
    beforeOpen: () => null,
    onBlocked: cb.toast,
  });
  row.append(back, openLid, lunchDrawer.el, pack, closeLid, go);

  const pet = (): Pet | null => state?.pet ?? null;
  const offer = (): Offer | null => (state && slot !== null ? state.journeys.offers[slot] ?? null : null);
  const plan = () => {
    const p = pet();
    const o = offer();
    return p && o ? planTrip(p, o.rarity, lunch()) : null;
  };

  back.addEventListener('click', () => {
    if (stage === 'board') {
      stop();
      cb.onExit();
      return;
    }
    lunchDrawer.close();
    setStage('board');
  });
  pack.addEventListener('click', () => {
    const p = pet();
    if (!p || !state) return;
    if (!offer()) return cb.toast(T.blocked.noOffer(p.name));
    const why = cantGo(p, now);
    if (why) return cb.toast(T.blocked[why](p.name));
    setStage('pack');
    lunchDrawer.open();
  });
  const tryClose = () => {
    const p = pet();
    const result = plan();
    if (!p || !result) return;
    if (!result.enoughFood) return cb.toast(T.blocked.notEnoughFood(p.name));
    if (!result.enoughEnergy) return cb.toast(T.blocked.notEnoughEnergy(p.name));
    lunchDrawer.close();
    setStage('closed');
  };
  closeLid.addEventListener('click', tryClose);
  openLid.addEventListener('click', () => {
    setStage('pack');
    lunchDrawer.open();
  });
  go.addEventListener('click', () => {
    if (slot === null) return;
    if (cb.onSetOff(slot, lunch(), percy, charm)) {
      stop();
      cb.onExit();
    }
  });

  function setStage(next: typeof stage): void {
    stage = next;
    render(true);
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

  function percySwitch(s: GameState): HTMLElement {
    const free = percyFree(s, now);
    const flying = [s.pet, ...s.housemates].some((p) => p.trip?.percy === 'coming');
    if (!free) percy = false;
    const b = el('button', `trip-percy${percy ? ' is-on' : ''}`);
    b.setAttribute('role', 'switch');
    b.setAttribute('aria-checked', String(percy));
    b.append(icon(ITEM_ICONS.percy, 'trip-percy-icon'), el('span', 'trip-percy-name', T.percyName));
    if (free) {
      b.append(el('i', 'trip-switch'));
      b.title = T.percyNote;
      b.setAttribute('aria-label', T.percyNote);
      b.addEventListener('click', () => {
        percy = !percy;
        render(true);
      });
    } else {
      const rest = flying ? T.percyAway : formatDuration(s.journeys.percyFreeAt - now);
      b.append(el('small', 'trip-percy-rest', rest));
      b.disabled = true;
      b.title = flying ? T.percyFlying : T.percyResting(rest);
      b.setAttribute('aria-label', b.title);
    }
    return b;
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
    top.append(tile, name, percySwitch(s));

    // What it can bring home.
    const place = getPlace(o.place);
    const loots = el('div', 'trip-loots');
    if (place) {
      const preview = tripPreview(place, o.rarity, charm);
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

    // Why it can't go yet, if it can't.
    const why = cantGo(p, now);
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

  // ---- 2 and 3. The lunchbox ----

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
      const seal = el('span', 'bento-seal');
      seal.dataset.rarity = o.rarity;
      seal.append(gems(o.rarity));
      const reopen = el('button', 'bento-tap');
      reopen.setAttribute('aria-label', T.openLid);
      reopen.addEventListener('click', () => {
        setStage('pack');
        lunchDrawer.open();
      });
      wrap.append(label, seal, reopen);
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
          lunchTiles(state!);
          lunchDrawer.open();
        });
      }
      return b;
    };
    for (let i = 0; i < J.lunch.food; i++) {
      const id = food[i] ?? null;
      wrap.append(spot(`bento-food bento-food-${i}`, id, STAT_ICONS.hunger, id ? STRINGS.foods[id] : '', () => food.splice(i, 1), 'food'));
    }
    wrap.append(
      spot('bento-drink', drink, STAT_ICONS.energy, drink ? STRINGS.foods[drink] : '', () => (drink = null), 'drink'),
      spot('bento-charm', charm ? `charm_${charm}` : null, ITEM_ICONS.charm_clover, charm ? T.charms[charm]?.name ?? charm : '',
        () => (charm = null), 'charm'),
    );
    return wrap;
  }

  function lunchbox(s: GameState, o: Offer): HTMLElement[] {
    const p = s.pet;
    const head = el('div', 'trip-head');
    const chip = el('span', 'trip-chip');
    chip.dataset.rarity = o.rarity;
    chip.append(icon(placeIcon(o.place), 'trip-cost-icon'), T.tripLine(T.trips[o.rarity], `${tripHours(o.rarity)}h`));
    head.append(el('b', '', stage === 'closed' ? T.readyTitle : T.lunchTitle), chip);
    const result = planTrip(p, o.rarity, lunch());
    const bars = el('div', 'trip-bars');
    bars.append(el('span', 'trip-bars-head', T.nowBack),
      meter(STAT_ICONS.hunger, STRINGS.stats.hunger, p.stats.hunger, result.to.hunger),
      meter(STAT_ICONS.energy, STRINGS.stats.energy, p.stats.energy, result.to.energy));
    // While packing, the Lunch panel sits just under the bars (a short trip
    // shows as a red "!" there), so the notes wait until the lid is on.
    if (stage === 'closed' && charm) bars.append(el('p', 'trip-note', T.charms[charm]?.note ?? ''));
    const out: HTMLElement[] = [head, bento(o), bars];
    if (stage === 'closed') out.push(el('p', 'trip-note', T.tapToOpen));
    return out;
  }

  // The Lunch panel: a tab each for food, drinks and charms, with what you
  // have (less what's packed) as tiles, and Close the lid at the bottom.
  function lunchTiles(s: GameState): void {
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
    const tile = (svg: string, name: string, left: number, gives: string, full: boolean, onPick: () => void) => {
      const b = el('button', `lunch-tile${full ? ' is-full' : ''}`);
      b.append(icon(svg, 'lunch-tile-icon'), el('i', 'lunch-count', left === Infinity ? '∞' : `×${left}`), el('small', '', gives));
      b.title = name;
      b.setAttribute('aria-label', T.packFood(name, left === Infinity ? STRINGS.shop.free : String(left)));
      b.addEventListener('click', () => {
        if (full) return cb.toast(T.spotFull[tab]);
        onPick();
        render(true);
      });
      grid.append(b);
    };
    if (tab === 'charm') {
      for (const c of CHARMS) {
        const left = charmCount(s, c.id) - (charm === c.id ? 1 : 0);
        if (left <= 0) continue;
        tile(ITEM_ICONS[`charm_${c.id}`] ?? '', T.charms[c.id]?.name ?? c.id, left, T.charms[c.id]?.short ?? '', !!charm, () => (charm = c.id));
      }
    } else {
      for (const f of FOODS) {
        if (f.id === CONFIG.cooking.mess || isDrink(f.id) !== (tab === 'drink') || f.hunger + (f.energy ?? 0) <= 0) continue;
        const left = foodCount(s, f.id) - lunch().filter((id) => id === f.id).length;
        if (left <= 0) continue;
        const full = tab === 'drink' ? !!drink : food.length >= J.lunch.food;
        tile(ITEM_ICONS[f.id] ?? '', STRINGS.foods[f.id], left, `+${tab === 'drink' ? f.energy : f.hunger}`, full, () => {
          if (tab === 'drink') drink = f.id;
          else food.push(f.id);
        });
      }
    }
    if (!grid.childElementCount) grid.append(el('p', 'trip-note', T.nothingToPack[tab]));
    const done = el('button', 'btn lunch-done', T.closeLid);
    done.addEventListener('click', tryClose);
    lunchContent.replaceChildren(tabs, grid, done);
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
      if (stage !== 'board') {
        lunchDrawer.close();
        stage = 'board';
      }
    }
    // Packed food you've run out of comes out of the box.
    food = food.filter((id, i) => foodCount(s, id) > food.slice(0, i).filter((f) => f === id).length);
    if (drink && foodCount(s, drink) - food.filter((f) => f === drink).length < 1) drink = null;
    if (charm && charmCount(s, charm) < 1) charm = null;
    const key = JSON.stringify([stage, slot, food, drink, charm, percy, tab, s.inventory.supplies, s.journeys, p.id, p.stage, p.asleep, p.condition, p.tripReadyAt,
      Math.round(p.stats.hunger), Math.round(p.stats.energy), Math.round(p.stats.happiness), Math.round(p.stats.health),
      s.housemates.map((h) => [h.id, h.trip?.backAt, h.trip?.endsAt]), s.inventory.food, Math.floor(now / 60_000)]);
    if (!force && key === shownKey) return;
    shownKey = key;

    const o = offer();
    panel.dataset.stage = stage;
    if (stage === 'board') {
      const parts: HTMLElement[] = [...others(s), board(s)];
      parts.push(o ? infoCard(s, o) : el('p', 'trip-note trip-pick-hint', T.pickHint));
      panel.replaceChildren(...parts);
    } else if (o) {
      panel.replaceChildren(...others(s), ...lunchbox(s, o));
      lunchTiles(s);
    }
    // The buttons for this step.
    back.hidden = stage === 'closed';
    pack.hidden = stage !== 'board';
    lunchDrawer.el.hidden = stage !== 'pack';
    closeLid.hidden = stage !== 'pack';
    openLid.hidden = stage !== 'closed';
    go.hidden = stage !== 'closed';
    const ready = !!o && !cantGo(p, now);
    pack.classList.toggle('is-waiting', !ready);
  }

  function stop(): void {
    if (!active) return;
    active = false;
    lunchDrawer.close();
    row.hidden = true;
    // Gone straight away: the stat bars come back in its place.
    panel.classList.remove('is-in');
    panel.hidden = true;
  }

  return {
    row,
    panel,
    start() {
      active = true;
      stage = 'board';
      slot = null;
      food = [];
      drink = null;
      charm = null;
      percy = false;
      tab = 'food';
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

