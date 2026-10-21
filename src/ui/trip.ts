// The current trip: tap the note in the corner of the room while a pet is
// out on a journey. The room shows the place it went to, with the pet (or both
// pets) there, and the stat bars make way for a little map: a red dashed
// trail from home to the place, red as far as they've got and faded the
// rest of the way, with the pets' pictures on it where they are now.
// The buttons below change to [Close] [Call home] while it's open.
// With two pets on different trips there's a note for each.

import { STRINGS } from '../strings';
import type { GameState, Pet } from '../game/state';
import { sheetFor } from '../game/growth';
import { isAway } from '../game/presence';
import { PALETTE } from '../render/palette';
import { ITEM_ICONS, SKILL_ICONS } from './icons';
import { formatClock, formatDuration } from './time';

export interface TripView {
  panel: HTMLElement; // shown in place of the stat bars
  row: HTMLElement; // [Close] [Call home], in place of the normal buttons
  open: (petId: string) => void; // the trip this pet is on
  close: () => void;
  active: () => boolean;
  update: (state: GameState, now: number) => void;
  // Who's on the trip and where, for the room (null while closed).
  scene: () => { place: string; pets: Pet[] } | null;
}

// The map, in its own little pixels (scaled up with CSS like the room).
const MAP_W = 120;
const MAP_H = 36;
const FROM = { x: 12, y: 25 };
const TO = { x: 108, y: 14 };

// The notes in the corner of the room, one for each trip that's on (two
// pets that went together share one), by the pet it's for, in id order so
// they keep their places.
export function tripNotes(state: GameState): Pet[] {
  const away = [state.pet, ...state.housemates].filter(isAway).sort((a, b) => (a.id < b.id ? -1 : 1));
  return away.filter((p, i) => !away.slice(0, i).some((q) => q.id === p.trip!.with));
}

// How far along a trip is, 0 to 1.
export function tripProgress(pet: Pet, now: number): number {
  const trip = pet.trip;
  if (!trip) return 0;
  const length = trip.endsAt - trip.startedAt;
  if (length <= 0) return 1;
  return Math.min(1, Math.max(0, (now - trip.startedAt) / length));
}

// The trail's pixels from home to the place: a gentle wiggle, one pixel
// after another with no gaps.
function trailPixels(): { x: number; y: number }[] {
  const out: { x: number; y: number }[] = [];
  const steps = 600;
  for (let i = 0; i <= steps; i++) {
    const t = i / steps;
    const x = Math.round(FROM.x + (TO.x - FROM.x) * t);
    const y = Math.round(FROM.y + (TO.y - FROM.y) * t + Math.sin(t * Math.PI * 2.2) * 6 * Math.sin(t * Math.PI));
    const last = out[out.length - 1];
    if (!last || last.x !== x || last.y !== y) out.push({ x, y });
  }
  return out;
}
const TRAIL = trailPixels();

// Where on the map a share of the trip is, as percent across and down.
function trailPoint(share: number): { left: number; top: number } {
  const p = TRAIL[Math.min(TRAIL.length - 1, Math.round(share * (TRAIL.length - 1)))];
  return { left: ((p.x + 1) / MAP_W) * 100, top: ((p.y + 1) / MAP_H) * 100 };
}

// The paper, a few tufts and puddles, and the trail.
function drawMap(ctx: CanvasRenderingContext2D, share: number): void {
  ctx.fillStyle = PALETTE.cream;
  ctx.fillRect(0, 0, MAP_W, MAP_H);
  // A soft edge, like an old map.
  ctx.fillStyle = PALETTE.butter;
  ctx.fillRect(0, 0, MAP_W, 1);
  ctx.fillRect(0, MAP_H - 1, MAP_W, 1);
  ctx.fillRect(0, 0, 1, MAP_H);
  ctx.fillRect(MAP_W - 1, 0, 1, MAP_H);
  // Bits of countryside.
  ctx.fillStyle = PALETTE.mint;
  for (const [x, y] of [[30, 6], [48, 29], [70, 5], [86, 27], [22, 31], [100, 30], [58, 12]]) {
    ctx.fillRect(x, y, 1, 2);
    ctx.fillRect(x + 2, y - 1, 1, 3);
  }
  ctx.fillStyle = PALETTE.sky;
  ctx.fillRect(38, 28, 6, 2);
  ctx.fillRect(39, 27, 4, 1);
  ctx.fillRect(78, 8, 5, 2);
  // The trail: dashes two pixels thick, red as far as they've got.
  const reached = share * (TRAIL.length - 1);
  TRAIL.forEach((p, i) => {
    if (i % 6 > 3) return;
    ctx.fillStyle = PALETTE.rose;
    ctx.globalAlpha = i <= reached ? 1 : 0.3;
    ctx.fillRect(p.x, p.y, 2, 2);
  });
  ctx.globalAlpha = 1;
  // An X where the place is.
  ctx.fillStyle = PALETTE.rose;
  for (let i = -2; i <= 2; i++) {
    ctx.fillRect(TO.x + i, TO.y + i, 2, 1);
    ctx.fillRect(TO.x + i, TO.y - i, 2, 1);
  }
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

export interface TripSetup {
  characterImage: (sheet: string) => string | undefined;
  onClose: () => void; // back to the stat bars
  onCallHome: (petId: string) => void; // asks first (see main.ts)
}

export function createTripView({ characterImage, onClose, onCallHome }: TripSetup): TripView {
  const T = STRINGS.journeys;
  const panel = el('div', 'trip-now');
  panel.hidden = true;

  const head = el('div', 'trip-now-head');
  const placeIcon = icon('', 'trip-now-icon');
  const title = el('b', 'trip-now-title');
  const who = el('span', 'trip-now-who');
  const heading = el('span', 'trip-now-heading');
  heading.append(title, who);
  head.append(placeIcon, heading);

  const map = el('div', 'trip-map');
  const canvas = el('canvas', 'trip-map-canvas');
  canvas.width = MAP_W;
  canvas.height = MAP_H;
  canvas.setAttribute('aria-hidden', 'true');
  const ctx = canvas.getContext('2d');
  if (ctx) ctx.imageSmoothingEnabled = false;
  const home = icon(SKILL_ICONS.cozyHome, 'trip-map-end');
  const there = icon('', 'trip-map-end');
  const marker = el('span', 'trip-map-marker');
  map.append(canvas, home, there, marker);
  const start = trailPoint(0);
  home.style.left = `${start.left}%`;
  home.style.top = `${start.top}%`;
  const end = trailPoint(1);
  there.style.left = `${end.left}%`;
  there.style.top = `${end.top}%`;

  const foot = el('div', 'trip-now-foot');
  const back = el('span', 'trip-now-back');
  const left = el('b', 'trip-now-left');
  foot.append(back, left);

  panel.append(head, map, foot);

  const row = el('div', 'actions trip-row');
  row.hidden = true;
  const closeBtn = el('button', 'btn btn-soft', T.tripClose);
  const callBtn = el('button', 'btn', T.callHome);
  row.append(closeBtn, callBtn);

  let open = false;
  let latest: { state: GameState; now: number } | null = null;
  let drawnShare = -1;
  let drawnFaces = '';
  let showing = ''; // the id of the pet whose trip is on show

  // The pets on the trip: that pet, and the one it went with, if any.
  const travellers = (s: GameState): Pet[] => {
    const all = [s.pet, ...s.housemates];
    const pet = all.find((p) => p.id === showing && isAway(p));
    if (!pet) return [];
    const mate = all.find((h) => h !== pet && h.id === pet.trip!.with && isAway(h));
    return mate ? [pet, mate] : [pet];
  };

  function render(): void {
    if (!open || !latest) return;
    const { state, now } = latest;
    const pets = travellers(state);
    const trip = pets[0]?.trip;
    if (!trip) return;
    const place = T.places[trip.place] ?? trip.place;
    placeIcon.innerHTML = ITEM_ICONS[`place_${trip.place}`] ?? ITEM_ICONS.journey;
    there.innerHTML = placeIcon.innerHTML;
    title.textContent = T.offer(T.trips[trip.rarity], place);
    who.textContent = pets.length > 1 ? T.tripWho2(pets[0].name, pets[1].name) : T.tripWho(pets[0].name);
    back.textContent = T.tripBack(formatClock(trip.endsAt));
    const share = tripProgress(pets[0], now);
    left.textContent = share >= 1 ? T.tripAlmost : T.tripLeft(formatDuration(trip.endsAt - now));
    // The trail only changes a pixel at a time, so it's redrawn only then.
    const step = Math.round(share * (TRAIL.length - 1));
    if (ctx && step !== drawnShare) {
      drawnShare = step;
      drawMap(ctx, share);
    }
    const at = trailPoint(share);
    marker.style.left = `${at.left}%`;
    marker.style.top = `${at.top}%`;
    const faces = pets.map((p) => sheetFor(p)).join();
    if (faces !== drawnFaces) {
      drawnFaces = faces;
      marker.replaceChildren(
        ...pets.map((p) => {
          const pic = el('span', 'trip-map-face');
          const url = characterImage(sheetFor(p));
          if (url) pic.style.backgroundImage = `url('${url}')`;
          return pic;
        }),
        el('i', 'trip-map-pin'),
      );
      if (!pets.some((p) => characterImage(sheetFor(p)))) drawnFaces = ''; // try again once the art loads
    }
  }

  const close = () => {
    if (!open) return;
    open = false;
    panel.hidden = true;
    row.hidden = true;
    panel.classList.remove('is-in');
    onClose();
  };
  closeBtn.addEventListener('click', close);
  callBtn.addEventListener('click', () => onCallHome(showing));

  return {
    panel,
    row,
    open(petId) {
      if (open || !latest) return;
      showing = petId;
      if (travellers(latest.state).length === 0) return;
      open = true;
      row.hidden = false;
      drawnShare = -1;
      drawnFaces = '';
      panel.hidden = false;
      panel.classList.remove('is-in');
      void panel.offsetHeight;
      panel.classList.add('is-in');
      render();
    },
    close,
    active: () => open,
    update(state, now) {
      latest = { state, now };
      // Home again (or called home): back to the bars.
      if (open && travellers(state).length === 0) close();
      else render();
    },
    scene() {
      if (!open || !latest) return null;
      const pets = travellers(latest.state);
      const trip = pets[0]?.trip;
      return trip ? { place: trip.place, pets } : null;
    },
  };
}
