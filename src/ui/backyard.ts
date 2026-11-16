// The Backyard (Play > Garden). Built like the workbench: one long yard
// you walk along (swipe, or tap the tab at the edge or the stop peeking
// in; see src/ui/walk.ts), with a ledge along the bottom holding the
// controls for the stop you're at. Everything you tap is in the bottom
// half of the screen.
//
//  - Garden: the pet and the pots (the room, drawn as the garden), and on
//    the ledge the garden's own panel (src/ui/garden.ts): the pot tabs,
//    the sunflower and its meters. The garden's buttons are the button row.
//  - Beehive (once it's built): the skep, showing how much honey is
//    waiting (src/render/backyard.ts). The ledge has a meter per day of
//    honey and beeswax and a round Collect button.
//  - Perch (once it's built): Percy's dovecote, with Percy asleep, ready or
//    away. The ledge says which, with a round button to wake him up (for
//    gold) or to go to Journeys when he's ready.
//
// A stop that needs you (a full hive, Percy ready) gets a red dot on its
// edge tab.

import { STRINGS } from '../strings';
import { CONFIG } from '../game/config';
import { hiveBuilt, hiveNextAt, hiveStock, perchBuilt } from '../game/crafting';
import { percyFree } from '../game/journeys';
import type { Pet } from '../game/state';
import type { GameState } from '../game/state';
import { drawHive, drawPerch, onHive, onPercy, YARD_HEIGHT, YARD_WIDTH, type PercyAtPerch } from '../render/backyard';
import { createWalk } from './walk';
import { createLift } from './lift';
import { CRAFT_ART, ITEM_ICONS, STAT_ICONS } from './icons';
import { formatIn } from './time';

const T = STRINGS.backyard;
const HOLDS = CONFIG.crafting.hive.holds;
const WAKE_PRICE = CONFIG.journeys.percy.resetPrice;

export type Stop = 'garden' | 'hive' | 'perch';
const STOPS: readonly Stop[] = ['garden', 'hive', 'perch'];

export interface BackyardCallbacks {
  onCollect: () => void;
  onWakePercy: () => void;
  onJourneys: () => void;
  onExit: () => void;
  // A tap on the garden, in room pixels (to pick a pot).
  onGardenTap: (x: number, y: number) => void;
  // Which row of buttons to show: the garden's, or the Backyard's [Close].
  onStop: (stop: Stop) => void;
  gardenRow: HTMLElement; // the garden's buttons (its Plant panel lifts the ledge)
  roomCanvas: () => HTMLCanvasElement;
  roomBox: () => DOMRect;
  isNight: () => boolean;
}

export interface Backyard {
  frame: HTMLElement; // the yard, over the room and the stat bars
  row: HTMLElement; // [Close], at the beehive and the perch
  gardenSlot: HTMLElement; // where the garden's panel goes, on the ledge
  pourSlot: HTMLElement; // where the garden's pour meter goes, over the ledge
  start: () => void;
  stop: () => void;
  active: () => boolean;
  at: () => Stop;
  fit: (drawer: HTMLElement) => void; // a panel in the garden's row opened
  update: (state: GameState, now: number) => void;
}

// Where Percy is: away on a trip, resting after one, or ready to go.
export function percyAtPerch(state: GameState, now: number): PercyAtPerch {
  if ([state.pet, ...state.housemates].some((p: Pet) => p.trip?.percy === 'coming')) return 'away';
  return percyFree(state, now) ? 'ready' : 'resting';
}

// Whether a stop wants you there (a red dot on its tab, and the badge in
// Play).
export function stopNeedsYou(state: GameState, now: number, stop: Stop): boolean {
  if (stop === 'hive') return hiveBuilt(state) && hiveStock(state) >= HOLDS;
  void now;
  return false;
}

const el = (tag: string, className: string, text?: string): HTMLElement => {
  const e = document.createElement(tag);
  e.className = className;
  if (text !== undefined) e.textContent = text;
  return e;
};

export function createBackyard(cb: BackyardCallbacks): Backyard {
  let state: GameState | null = null;
  let now = 0;
  let active = false;
  let at: Stop = 'garden';
  let frameReq = 0;
  let measured = 0;
  let outTimer = 0;

  const frame = el('div', 'kitchen walk-kitchen backyard');
  frame.hidden = true;
  const room = el('div', 'kitchen-room yard-room');
  const ledge = el('div', 'back-counter');
  ledge.setAttribute('aria-hidden', 'true');
  const counter = el('div', 'kitchen-counter');

  // ---- The stops ----
  const canvas = (label: string): HTMLCanvasElement => {
    const c = document.createElement('canvas');
    c.className = 'yard-canvas';
    c.width = YARD_WIDTH;
    c.height = YARD_HEIGHT;
    c.setAttribute('role', 'img');
    c.setAttribute('aria-label', label);
    return c;
  };
  // Where a tap landed, in canvas pixels.
  const pixel = (c: HTMLCanvasElement, e: MouseEvent): [number, number] => {
    const r = c.getBoundingClientRect();
    return [((e.clientX - r.left) / r.width) * YARD_WIDTH, ((e.clientY - r.top) / r.height) * YARD_HEIGHT];
  };

  const gardenScene = el('div', 'kitchen-scene yard-scene');
  const gardenCanvas = canvas(T.stops.garden);
  gardenCanvas.addEventListener('click', (e) => cb.onGardenTap(...pixel(gardenCanvas, e)));
  gardenScene.append(gardenCanvas);

  const hiveScene = el('div', 'kitchen-scene yard-scene');
  const hiveCanvas = canvas(T.hive);
  hiveCanvas.addEventListener('click', (e) => {
    if (onHive(...pixel(hiveCanvas, e))) collect();
  });
  hiveScene.append(hiveCanvas);

  const perchScene = el('div', 'kitchen-scene yard-scene');
  const perchCanvas = canvas(T.perch);
  perchCanvas.addEventListener('click', (e) => {
    if (onPercy(...pixel(perchCanvas, e))) perchAction();
  });
  perchScene.append(perchCanvas);

  // ---- The ledge ----
  const gardenSlot = el('div', 'kitchen-controls yard-controls yard-garden');
  const pourSlot = el('div', 'yard-pour');

  const hiveControls = el('div', 'kitchen-controls yard-controls');
  const hiveInfo = el('div', 'yard-info');
  const hiveName = el('b', 'yard-name', T.hive);
  const pipRow = (label: string, icon: string) => {
    const r = el('div', 'yard-meter');
    r.setAttribute('role', 'meter');
    r.setAttribute('aria-label', label);
    r.setAttribute('aria-valuemin', '0');
    r.setAttribute('aria-valuemax', String(HOLDS));
    const i = el('span', 'yard-meter-icon');
    i.innerHTML = icon;
    const pips = Array.from({ length: HOLDS }, () => el('i', ''));
    r.append(i, el('span', 'yard-meter-name', label), ...pips);
    return {
      r,
      set(n: number) {
        pips.forEach((p, k) => p.classList.toggle('on', k < n));
        r.setAttribute('aria-valuenow', String(n));
      },
    };
  };
  const honeyRow = pipRow(T.honey, ITEM_ICONS.honey ?? '');
  const waxRow = pipRow(T.beeswax, ITEM_ICONS.mat_beeswax ?? '');
  const hiveNote = el('small', 'yard-note');
  hiveInfo.append(hiveName, honeyRow.r, waxRow.r, hiveNote);
  const collectBtn = el('button', 'kitchen-cook yard-go');
  const collectText = el('span', '', T.collect);
  collectBtn.innerHTML = ITEM_ICONS.honey ?? '';
  collectBtn.append(collectText);
  collectBtn.addEventListener('click', collect);
  hiveControls.append(hiveInfo, collectBtn);

  const perchControls = el('div', 'kitchen-controls yard-controls');
  const perchInfo = el('div', 'yard-info');
  const perchName = el('b', 'yard-name', T.perch);
  const perchNote = el('small', 'yard-note');
  perchInfo.append(perchName, perchNote);
  const perchBtn = el('button', 'kitchen-cook yard-go');
  const perchIcon = el('span', 'yard-go-icon');
  const perchText = el('span', '');
  perchBtn.append(perchIcon, perchText);
  perchBtn.addEventListener('click', perchAction);
  perchControls.append(perchInfo, perchBtn);

  room.append(ledge, pourSlot);
  counter.append(gardenSlot, hiveControls, perchControls);
  const scenes: Record<Stop, HTMLElement> = { garden: gardenScene, hive: hiveScene, perch: perchScene };
  const icons: Record<Stop, string> = { garden: ITEM_ICONS.garden, hive: CRAFT_ART.beehive, perch: ITEM_ICONS.percy };
  const walk = createWalk({
    stations: STOPS.map((s) => ({ id: s, icon: icons[s], label: T.stops[s], scene: scenes[s] })),
    pick: (s) => go(s),
    current: () => at,
    frame,
    room,
    swipeOn: [room, counter],
    needs: (s) => (state ? stopNeedsYou(state, now, s) : false),
  });
  frame.append(room, counter);

  // ---- The buttons: [Close] ----
  const row = el('div', 'actions yard-row');
  row.hidden = true;
  const close = el('button', 'btn btn-soft', T.close);
  close.addEventListener('click', () => {
    stop();
    cb.onExit();
  });
  row.append(close);

  const shown = (s: Stop): boolean => !state || s === 'garden' || (s === 'hive' ? hiveBuilt(state) : perchBuilt(state));

  function go(s: Stop): void {
    if (s === at) return;
    at = s;
    render();
    cb.onStop(at);
  }

  function collect(): void {
    if (!state || at !== 'hive') return;
    cb.onCollect();
  }

  function perchAction(): void {
    if (!state || at !== 'perch') return;
    const percy = percyAtPerch(state, now);
    if (percy === 'ready') cb.onJourneys();
    else if (percy === 'resting') cb.onWakePercy();
  }

  function render(): void {
    if (!state) return;
    const s = state;
    if (!shown(at)) at = 'garden';
    walk.render(at, shown);
    frame.dataset.stop = at;
    frame.classList.toggle('night', cb.isNight());
    gardenSlot.hidden = at !== 'garden';
    hiveControls.hidden = at !== 'hive';
    perchControls.hidden = at !== 'perch';
    row.hidden = !active || at === 'garden';

    // The beehive.
    const n = hiveStock(s);
    honeyRow.set(n);
    waxRow.set(n);
    const wait = formatIn(hiveNextAt(now) - now);
    hiveNote.textContent = n >= HOLDS ? T.full : n === 0 ? T.empty(wait) : T.nextIn(wait);
    hiveNote.classList.toggle('good', n >= HOLDS);
    collectBtn.classList.toggle('faded', n === 0);
    collectBtn.setAttribute('aria-label', `${T.collect}: ${n * CONFIG.crafting.hive.honey} ${T.honey}, ${n * CONFIG.crafting.hive.beeswax} ${T.beeswax}`);

    // Percy.
    const percy = percyAtPerch(s, now);
    perchNote.textContent =
      percy === 'ready' ? T.percyReady
      : percy === 'away' ? T.percyAway
      : T.percyResting(formatIn(s.journeys.percyFreeAt - now));
    perchNote.classList.toggle('good', percy === 'ready');
    perchIcon.innerHTML = percy === 'resting' ? STAT_ICONS.gold : ITEM_ICONS.percy;
    perchText.textContent = percy === 'ready' ? T.journeys : percy === 'resting' ? `${T.wake}` : T.away;
    perchBtn.classList.toggle('faded', percy === 'away');
    perchBtn.classList.toggle('pricey', percy === 'resting');
    perchBtn.dataset.price = String(WAKE_PRICE);
    perchBtn.setAttribute('aria-label', percy === 'ready' ? T.journeys : percy === 'resting' ? T.wakeLabel(WAKE_PRICE) : T.percyAway);
  }

  // Draws the stops every frame while the Backyard is open: the garden is
  // the room (which draws itself as the garden), copied over.
  function draw(t: number): void {
    if (!active || !state) return;
    if (t - measured > 400) {
      measured = t;
      measure();
    }
    const night = cb.isNight();
    const g = gardenCanvas.getContext('2d');
    if (g) {
      g.clearRect(0, 0, YARD_WIDTH, YARD_HEIGHT);
      g.drawImage(cb.roomCanvas(), 0, 0, YARD_WIDTH, YARD_HEIGHT);
    }
    if (hiveBuilt(state)) {
      const h = hiveCanvas.getContext('2d');
      if (h) drawHive(h, hiveStock(state), night, t);
    }
    if (perchBuilt(state)) {
      const p = perchCanvas.getContext('2d');
      if (p) drawPerch(p, percyAtPerch(state, now), night, t);
    }
    frameReq = requestAnimationFrame(draw);
  }

  const lift = createLift(frame, cb.gardenRow);
  // Carries the fence and the grass on past the ends of the yard: where
  // they are on the stop you're at, for the room's background.
  function measure(): void {
    const c = scenes[at].querySelector('canvas')!.getBoundingClientRect();
    const r = room.getBoundingClientRect();
    if (!c.height) return;
    // (Scaled while it pops in: measure in the room's own pixels.)
    const scale = r.width / room.offsetWidth || 1;
    const px = c.height / scale / YARD_HEIGHT;
    const top = (c.top - r.top) / scale - room.clientTop;
    room.style.setProperty('--px', `${px}px`);
    room.style.setProperty('--fence', `${top + 20 * px}px`);
    room.style.setProperty('--grass', `${top + 30 * px}px`);
  }
  const reach = () => {
    lift.reach(cb.roomBox());
    requestAnimationFrame(measure);
  };

  function stop(): void {
    if (!active) return;
    active = false;
    cancelAnimationFrame(frameReq);
    removeEventListener('resize', reach);
    row.hidden = true;
    frame.classList.remove('is-in');
    clearTimeout(outTimer);
    outTimer = window.setTimeout(() => (frame.hidden = true), 450);
  }

  return {
    frame,
    row,
    gardenSlot,
    pourSlot,
    start() {
      active = true;
      at = 'garden';
      clearTimeout(outTimer);
      frame.hidden = false;
      render();
      cb.onStop(at);
      void frame.offsetHeight;
      frame.classList.add('is-in');
      cancelAnimationFrame(frameReq);
      frameReq = requestAnimationFrame(draw);
      reach();
      addEventListener('resize', reach);
    },
    stop,
    active: () => active,
    at: () => at,
    fit: (drawer) => lift.fit(drawer),
    update(next, t) {
      state = next;
      now = t;
      if (active) render();
    },
  };
}
