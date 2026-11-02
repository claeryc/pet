// Sniff and dig (Play > Sniff and dig). It takes over the whole screen, the
// room stepping aside, from top to bottom:
//
//   1. The board: a strip of today's place over a six by six patch of its
//      ground, as big as fits. Signs in the strip, no words: a chest with
//      how many treasures are still buried, and at the cove a pip per dig
//      until the tide comes in. Your pet is out on the ground, one square
//      big. Tap a square and it trots over (round the holes, or hopping
//      them when going round is much further), stands beside the square and
//      digs it. A hole shows how many treasures are buried right next to it,
//      warmer colours for more. The line the tide covers next looks wet.
//   2. The day's digs: a spade for each one left, a hole for each one used.
//   3. Today's places as little pictures, the one you're digging at raised.
//      A tick on a place that's all dug up, a lock on one that isn't open.
//   4. [Back] [Sniff (1)]: the pet noses about, then runs to a square with
//      treasure in it and leaves a paw print there.
//
// The rules are on the "How it works" card, and live in src/game/dig.ts.

import { STRINGS } from '../strings';
import { CONFIG } from '../game/config';
import type { FoodId } from '../game/actions';
import type { DigSpot, GameState, Pet } from '../game/state';
import type { Expression } from '../game/expression-order';
import {
  CELLS, canDigAt, digsLeft, flooded, reachable, sniffsLeft, spotOf, tideIn, treasureAt, warmth, wetNext, SIZE,
  type DigResult,
} from '../game/dig';
import { getPlace, parseFind } from '../game/journeys';
import { isAway, hasBackpack } from '../game/presence';
import { localDay } from '../game/economy';
import { findIconOf, HEART_ICONS, ITEM_ICONS, LOCK_ICON } from './icons';
import { drawPlace, drawPlaceSparkle } from '../render/places';
import { drawPetStanding } from '../render/canvas';
import { PALETTE } from '../render/palette';
import type { SpriteSheet } from '../render/sprites';

export interface DigCallbacks {
  onDigToday: () => void; // rolls today's spots if the day has changed
  onDig: (place: string, cell: number) => DigResult | null;
  onSniff: (place: string) => number | null; // the cell the pet points at
}

export interface DigSetup extends DigCallbacks {
  onExit: () => void;
  toast: (message: string) => void;
  petLook: () => { sheet?: SpriteSheet; hat?: SpriteSheet }; // the pet out on the ground
}

export interface DigScene {
  row: HTMLElement; // the buttons, shown in place of the normal button row
  panel: HTMLElement; // shown in place of the stat bars
  start: () => void;
  stop: () => void;
  active: () => boolean;
  update: (state: GameState, now: number) => void;
}

const T = STRINGS.dig;
const D = CONFIG.dig;
export const placeName = (id: string): string => T.places[id] ?? id;

// The strip of the place over the ground, in room pixels.
const STRIP_W = 64;
const STRIP_H = 18;
// The pet's walk: one square, one hop over a hole (a little longer for
// each square further), one dig and one sniff.
const STEP_MS = 190;
const HOP_MS = 330;
const HOP_EXTRA_MS = 90;
const DIG_MS = 650;
const SNIFF_MS = 700;
const SNUFFLE_MS = 800; // nosing about before it runs off to sniff
// Going round a hole costs a square; hopping one costs this many.
const HOP_COST = 3.5;
const START = (SIZE - 1) * SIZE + Math.floor((SIZE - 1) / 2); // bottom middle

const col = (c: number) => c % SIZE;
const line = (c: number) => Math.floor(c / SIZE);

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

// Restarts a one-off CSS animation.
function bump(e: Element | null | undefined, className: string): void {
  if (!e) return;
  e.classList.remove(className);
  void (e as HTMLElement).offsetWidth;
  e.classList.add(className);
}

// The icon and name of something buried ("honey", "seed:pumpkin", "gold:12").
function findIcon(entry: string): string {
  return findIconOf(parseFind(entry, 1));
}
function findName(entry: string): string {
  const f = parseFind(entry, 1);
  if (f.kind === 'gold') return `${f.count} ${T.gold}`;
  if (f.kind === 'material') return STRINGS.crafting.material[f.id] ?? f.id;
  if (f.kind === 'part') return STRINGS.crafting.parts[f.id] ?? f.id;
  const name = STRINGS.foods[f.id as FoodId] ?? f.id;
  return f.kind === 'seed' ? STRINGS.garden.seedName(name) : name;
}

// A little wave, for the tide sign.
const WAVE = `<svg viewBox="0 0 9 5" shape-rendering="crispEdges"><path fill="${PALETTE.ocean}" d="M0 2h2v1H0zM2 1h2v1H2zM4 2h1v1H4zM5 3h2v1H5zM7 2h2v1H7zM0 4h9v1H0z"/></svg>`;

// One leg of the pet's walk, square to square. A hop goes over holes,
// roots or sea, from the ground before them to the ground after.
interface Leg { from: number; to: number; hop: boolean; ms: number }
// What it's off to do when it gets there.
interface Job { kind: 'dig' | 'sniff'; cell: number; at?: number }

export function createDig(cb: DigSetup): DigScene {
  let state: GameState | null = null;
  let now = 0;
  let active = false;
  let picked: string | null = null; // the place being dug
  let shownKey = '';
  let fresh: number | null = null; // the hole just dug, to pop in
  let frameId = 0;

  // The pet, out on the ground.
  const pet = { cell: START, legs: [] as Leg[], legAt: 0, facing: 1, dropAt: 0, job: null as Job | null };
  let face: { face: Expression; until: number } | null = null;
  let snuffle: number | null = null; // when it started nosing about
  let hiddenPaw: number | null = null; // a sniffed square it hasn't reached yet

  const panel = el('div', 'journeys dig');
  panel.hidden = true;
  const row = el('div', 'actions journeys-row dig-row');
  row.hidden = true;
  const back = el('button', 'btn btn-soft', T.back);
  const sniffBtn = el('button', 'btn btn-alt dig-sniff');
  row.append(back, sniffBtn);

  // 1. The board.
  const board = el('section', 'dig-board');
  const strip = el('div', 'dig-strip');
  const stripArt = el('canvas', 'dig-strip-art');
  stripArt.width = STRIP_W;
  stripArt.height = STRIP_H;
  const stripCtx = stripArt.getContext('2d');
  if (stripCtx) stripCtx.imageSmoothingEnabled = false;
  const chest = el('span', 'dig-chip dig-chest');
  chest.setAttribute('role', 'img');
  const tide = el('span', 'dig-chip dig-tide');
  tide.setAttribute('role', 'img');
  strip.append(stripArt, chest, tide);
  const fit = el('div', 'dig-fit');
  board.append(strip, fit);
  let grid: HTMLElement = el('div', 'dig-field');

  const petBox = el('div', 'dig-pet');
  const petArt = el('canvas', 'dig-pet-art');
  petArt.width = 32;
  petArt.height = 40;
  const petCtx = petArt.getContext('2d');
  if (petCtx) petCtx.imageSmoothingEnabled = false;
  petBox.append(petArt);
  const shadow = el('i', 'dig-shadow');
  const marker = el('i', 'dig-target');
  marker.hidden = true;

  // 2. The day's digs. 3. Today's places.
  const digs = el('div', 'dig-digs');
  digs.setAttribute('role', 'img');
  const tabs = el('nav', 'dig-tabs');
  tabs.setAttribute('aria-label', T.placesLabel);
  panel.append(board, digs, tabs);
  let tabArts: { place: string; ctx: CanvasRenderingContext2D | null; rare: boolean }[] = [];

  const allPets = (s: GameState): Pet[] => [s.pet, ...s.housemates];
  const fanOf = (s: GameState, place: string): string | null =>
    allPets(s).find((p) => !isAway(p) && p.condition !== 'passed' && p.favouritePlace === place)?.name ?? null;
  const spot = (): DigSpot | undefined => (state && picked ? spotOf(state, picked) : undefined);
  const busy = () => pet.job?.at !== undefined || snuffle !== null;

  back.addEventListener('click', () => {
    stop();
    cb.onExit();
  });

  sniffBtn.addEventListener('click', () => {
    const sp = spot();
    if (!sp || !state || busy()) return;
    pet.legs = [];
    pet.job = null;
    marker.hidden = true;
    snuffle = performance.now();
    const place = sp.place;
    window.setTimeout(() => {
      snuffle = null;
      if (!active || picked !== place) return;
      const at = cb.onSniff(place);
      if (at === null) return;
      hiddenPaw = at;
      render(true);
      walkTo(standFor(at), { kind: 'sniff', cell: at });
    }, SNUFFLE_MS);
  });

  // ---- Where the pet can go ----

  // It walks on untouched ground; holes, roots and the sea it hops.
  const free = (c: number): boolean => {
    const sp = spot();
    return !!sp && !sp.dug.includes(c) && !sp.roots.includes(c) && !flooded(sp).has(c);
  };
  function around(c: number, corners: boolean): number[] {
    const out: number[] = [];
    for (let dr = -1; dr <= 1; dr++) {
      for (let dc = -1; dc <= 1; dc++) {
        if ((!dr && !dc) || (!corners && dr && dc)) continue;
        const r = line(c) + dr;
        const k = col(c) + dc;
        if (r >= 0 && r < SIZE && k >= 0 && k < SIZE) out.push(r * SIZE + k);
      }
    }
    return out;
  }
  function nearestFree(from: number): number {
    let best = from;
    let far = Infinity;
    for (let c = 0; c < CELLS; c++) {
      const d = Math.abs(line(c) - line(from)) + Math.abs(col(c) - col(from));
      if (free(c) && d < far) {
        far = d;
        best = c;
      }
    }
    return best;
  }

  // The cheapest way from `from` to any of `goals`: round the holes when
  // that's not much further, over them when it is.
  function route(from: number, goals: Set<number>): number[] {
    const cost = new Map<number, number>([[from, 0]]);
    const prev = new Map<number, number>();
    const open = [from];
    while (open.length) {
      open.sort((a, b) => cost.get(a)! - cost.get(b)!);
      const c = open.shift()!;
      if (goals.has(c)) {
        const path = [c];
        while (prev.has(path[0])) path.unshift(prev.get(path[0])!);
        return path;
      }
      for (const n of around(c, false)) {
        const step = cost.get(c)! + (free(n) ? 1 : HOP_COST);
        if (step < (cost.get(n) ?? Infinity)) {
          cost.set(n, step);
          prev.set(n, c);
          if (!open.includes(n)) open.push(n);
        }
      }
    }
    return [from];
  }

  // A path as legs: a run of holes is one hop, from ground to ground.
  function legsOf(path: number[]): Leg[] {
    const legs: Leg[] = [];
    let i = 0;
    while (i < path.length - 1) {
      let j = i + 1;
      while (j < path.length - 1 && !free(path[j])) j++;
      const hop = j > i + 1 || !free(path[j]);
      legs.push({ from: path[i], to: path[j], hop, ms: hop ? HOP_MS + (j - i - 1) * HOP_EXTRA_MS : STEP_MS });
      i = j;
    }
    return legs;
  }

  // Squares to stand on while digging `c`: beside it first, then above or
  // below or a corner. The square itself if it's boxed in.
  function standFor(c: number): Set<number> {
    const near = around(c, true).filter(free);
    const sides = near.filter((n) => line(n) === line(c));
    const pick = sides.length ? sides : near;
    return new Set(pick.length ? pick : [c]);
  }

  function walkTo(goals: Set<number>, job: Job): void {
    // A pet mid-step finishes the square it's stepping onto first.
    const leg = pet.legs[0];
    const legs = legsOf(route(leg ? leg.to : pet.cell, goals));
    pet.legs = leg ? [leg, ...legs] : legs;
    if (!leg) pet.legAt = performance.now();
    if (pet.job?.kind === 'sniff' && job.kind !== 'sniff') showPaw();
    pet.job = job;
    placeMarker();
    if (!pet.legs.length) startJob(performance.now());
  }

  function showPaw(): void {
    if (hiddenPaw === null) return;
    hiddenPaw = null;
    render(true);
  }

  function tapCell(c: number): void {
    const s = state;
    const sp = spot();
    if (!s || !sp || busy()) return;
    if (digsLeft(s) <= 0) {
      face = { face: 'pouting', until: performance.now() + 1400 };
      bump(digs, 'is-shake');
      cb.toast(T.blocked.noDigs);
      return;
    }
    if (!canDigAt(sp, c)) return;
    walkTo(standFor(c), { kind: 'dig', cell: c });
  }

  // It's got there: turn to the square and dig it, or sniff at it.
  function startJob(at: number): void {
    const job = pet.job;
    if (!job) return;
    if (col(job.cell) !== col(pet.cell)) pet.facing = col(job.cell) > col(pet.cell) ? 1 : -1;
    job.at = at;
    const place = picked;
    if (job.kind === 'dig') {
      dirt(job.cell);
      window.setTimeout(() => {
        if (active && picked === place) finishDig(job.cell);
      }, DIG_MS);
    } else {
      window.setTimeout(() => {
        if (!active || picked !== place) return;
        pet.job = null;
        face = { face: 'happy', until: performance.now() + 1200 };
        fresh = job.cell;
        marker.hidden = true;
        showPaw();
      }, SNIFF_MS);
    }
  }

  function finishDig(c: number): void {
    const sp = spot();
    pet.job = null;
    marker.hidden = true;
    if (!sp || !state) return;
    const result = cb.onDig(sp.place, c);
    if (!result) return render(true);
    fresh = c;
    const t = performance.now();
    if (result.find) {
      face = { face: 'inLove', until: t + 1800 };
      pop(c, findIconOf(result.find));
      hearts();
      window.setTimeout(() => bump(chest, 'is-bump'), 700);
    } else {
      const w = result.warmth ?? 0;
      face = { face: w >= 2 ? 'happy' : w === 1 ? 'surprised' : 'content', until: t + 1300 };
    }
    render(true);
    if (!result.find) bump(digs.children[state.dig.used - 1], 'is-used-now');
    if (result.flooded) bump(tide, 'is-bump');
    // The tide may have come in under its feet: off it goes to dry land.
    if (!free(pet.cell)) {
      pet.legs = legsOf(route(pet.cell, new Set([nearestFree(pet.cell)])));
      pet.legAt = performance.now();
    }
    const after = spotOf(state, sp.place);
    if (digsLeft(state) === 0 && after && reachable(after).length) cb.toast(T.lastDig);
  }

  // ---- Little things on the ground: dirt, a find, hearts ----

  function cellBox(c: number): { x: number; y: number; w: number } | null {
    const e = grid.children[c] as HTMLElement | undefined;
    if (!e) return null;
    const f = fit.getBoundingClientRect();
    const r = e.getBoundingClientRect();
    return { x: r.left - f.left, y: r.top - f.top, w: r.width };
  }

  // Something that floats up from the ground and goes.
  function float(className: string, svg: string, x: number, y: number, ms: number, delay = 0): HTMLElement {
    const e = icon(svg, className);
    e.style.left = `${x}px`;
    e.style.top = `${y}px`;
    if (delay) e.style.animationDelay = `${delay}ms`;
    fit.append(e);
    window.setTimeout(() => e.remove(), ms + delay);
    return e;
  }

  function pop(c: number, svg: string): void {
    const b = cellBox(c);
    if (b) float('dig-pop', svg, b.x + b.w / 2, b.y + b.w / 2, 1100);
  }

  function hearts(): void {
    const b = cellBox(pet.cell);
    if (!b) return;
    for (let i = 0; i < 3; i++) float('dig-heart', HEART_ICONS.full, b.x + b.w * (0.25 + i * 0.25), b.y - b.w * 0.1, 1200, i * 120);
  }

  function dirt(c: number): void {
    const b = cellBox(c);
    if (!b || matchMedia('(prefers-reduced-motion: reduce)').matches) return;
    for (let i = 0; i < 7; i++) {
      const d = float('dig-dirt', '', b.x + b.w * (0.3 + Math.random() * 0.4), b.y + b.w * 0.55, 420, (i % 3) * 140);
      d.style.setProperty('--dx', `${(Math.random() - 0.5) * b.w * 1.1}px`);
      d.style.setProperty('--dy', `${-b.w * (0.35 + Math.random() * 0.45)}px`);
    }
  }

  // A ring on the square it's on its way to dig.
  function placeMarker(): void {
    const b = pet.job?.kind === 'dig' ? cellBox(pet.job.cell) : null;
    marker.hidden = !b;
    if (!b) return;
    marker.style.left = `${b.x}px`;
    marker.style.top = `${b.y}px`;
    marker.style.width = marker.style.height = `${b.w}px`;
  }

  // ---- Switching places ----

  function pick(place: string, dir = 0): void {
    if (picked === place) return;
    picked = place;
    pet.legs = [];
    pet.job = null;
    snuffle = null;
    hiddenPaw = null;
    face = null;
    pet.cell = free(START) ? START : nearestFree(START);
    pet.dropAt = performance.now() + 120;
    marker.hidden = true;
    board.style.setProperty('--dir', String(dir || 1));
    if (dir) bump(board, 'is-switch');
    render(true);
  }

  // The place to start at: the first one with something still buried.
  function firstPlace(s: GameState): string | null {
    const open = s.dig.places.filter((p) => spotOf(s, p));
    return open.find((p) => reachable(spotOf(s, p)!).length) ?? open[0] ?? null;
  }

  // ---- Drawing ----

  function tabsFor(s: GameState): void {
    tabArts = [];
    const els = s.dig.places.map((place, i) => {
      const sp = spotOf(s, place);
      const rare = sp?.stars === 3;
      const b = el('button', `dig-tab${rare ? ' is-rare' : ''}${sp ? '' : ' is-locked'}`);
      const art = el('canvas', 'dig-tab-art');
      art.width = 64;
      art.height = 40;
      const ctx = art.getContext('2d');
      if (ctx) drawPlace(ctx, place, 64, 48, false, 0);
      b.append(art);
      if (!sp) {
        b.append(icon(LOCK_ICON, 'dig-tab-lock'));
        const opens = getPlace(place)?.opens ?? 'start';
        b.setAttribute('aria-label', `${placeName(place)}. ${T.locked[opens] ?? ''}`);
        b.addEventListener('click', () => cb.toast(T.locked[opens] ?? ''));
        return b;
      }
      tabArts.push({ place, ctx, rare });
      const done = !reachable(sp).length;
      b.append(el('span', 'dig-tab-stars', '★'.repeat(sp.stars)));
      if (done) b.append(el('span', 'dig-tab-done', '✓'));
      const fan = fanOf(s, place);
      if (fan) b.append(icon(HEART_ICONS.full, 'dig-tab-fan'));
      const on = place === picked;
      b.classList.toggle('is-on', on);
      b.classList.toggle('is-done', done);
      b.setAttribute('aria-pressed', String(on));
      b.setAttribute('aria-label', [`${placeName(place)}, ${'★'.repeat(sp.stars)}`, done ? T.allFound : '', fan ? T.fan(fan) : ''].filter(Boolean).join('. '));
      b.addEventListener('click', () => {
        const from = s.dig.places.indexOf(picked ?? '');
        pick(place, i > from ? 1 : -1);
      });
      return b;
    });
    tabs.replaceChildren(...els);
  }

  function fieldFor(sp: DigSpot): HTMLElement {
    const g = el('div', `dig-field${sp.tide ? ` is-sand is-tide-${sp.tide}` : ''}${sp.place === 'woods' ? ' is-woods' : ''}${sp.place === 'hill' ? ' is-hill' : ''}`);
    g.setAttribute('role', 'grid');
    g.style.setProperty('--dig-size', String(SIZE));
    const sea = flooded(sp);
    const wet = new Set(wetNext(sp));
    for (let c = 0; c < CELLS; c++) {
      const sq = el('button', 'dig-cell');
      const t = treasureAt(sp, c);
      const label = T.cell(line(c) + 1, col(c) + 1);
      let what = '';
      if (sp.dug.includes(c)) {
        if (t) {
          sq.classList.add('is-found');
          sq.append(icon(findIcon(t.find), 'dig-cell-icon'));
          what = T.cellFound(findName(t.find));
        } else {
          const w = warmth(sp, c);
          sq.classList.add('is-dug', `w${Math.min(3, w)}`);
          if (w) sq.textContent = String(w);
          what = T.cellDug(w);
        }
      } else if (sp.roots.includes(c)) {
        sq.classList.add('is-root');
        what = T.cellRoot;
      } else if (sea.has(c)) {
        sq.classList.add('is-sea');
        what = T.cellSea;
      } else {
        if (wet.has(c)) sq.classList.add('is-wet');
        if (sp.sniffed.includes(c) && c !== hiddenPaw) {
          sq.classList.add('is-sniffed');
          sq.append(icon(ITEM_ICONS.paw, 'dig-cell-icon'));
          what = T.cellSniffed;
        }
      }
      if (c === fresh) sq.classList.add('is-fresh');
      sq.setAttribute('aria-label', what ? `${label}, ${what}` : label);
      if (canDigAt(sp, c)) sq.addEventListener('click', () => tapCell(c));
      else sq.disabled = true;
      g.append(sq);
    }
    fresh = null;
    return g;
  }

  function render(force = false): void {
    const s = state;
    if (!s) return;
    if (s.dig.day !== localDay(now)) {
      // A new day while it's open: today's places, from the start.
      cb.onDigToday();
      picked = null;
      return;
    }
    if (!picked || !spotOf(s, picked)) {
      const first = firstPlace(s);
      if (!first) return;
      picked = null;
      pick(first);
      return;
    }
    const key = JSON.stringify([picked, hiddenPaw, s.dig, allPets(s).map((p) => [p.id, p.favouritePlace, isAway(p)])]);
    if (!force && key === shownKey) return;
    shownKey = key;
    const sp = spot()!;

    const left = reachable(sp).length;
    chest.replaceChildren(icon(ITEM_ICONS.digChest, 'dig-chip-icon dig-chip-chest'), el('b', '', left ? `×${left}` : '✓'));
    chest.classList.toggle('is-done', !left);
    chest.setAttribute('aria-label', left ? T.left(left) : T.allFound);
    tide.hidden = !sp.tide;
    if (sp.tide) {
      const n = tideIn(sp);
      const on = n === null ? D.tideEvery : D.tideEvery - n;
      tide.replaceChildren(icon(WAVE, 'dig-chip-icon dig-chip-wave'), ...[...Array(D.tideEvery).keys()].map((i) => el('i', i < on ? 'is-on' : '')));
      tide.setAttribute('aria-label', n === null ? T.tideFull : T.tideIn(n));
    }

    grid = fieldFor(sp);
    const extras = [...fit.querySelectorAll('.dig-pop, .dig-dirt, .dig-heart')];
    fit.replaceChildren(grid, marker, shadow, petBox, ...extras);
    placeMarker();

    digs.replaceChildren(...[...Array(D.digsPerDay).keys()].map((i) =>
      icon(i < s.dig.used ? ITEM_ICONS.digUsed : ITEM_ICONS.digLeft, `dig-spade${i < s.dig.used ? ' is-used' : ''}`)));
    digs.setAttribute('aria-label', T.digsChip(digsLeft(s), D.digsPerDay));

    tabsFor(s);

    const n = sniffsLeft(sp);
    sniffBtn.replaceChildren(icon(ITEM_ICONS.paw, 'dig-btn-icon'), el('span', '', T.sniffBtn), el('b', 'dig-count', String(n)));
    sniffBtn.setAttribute('aria-label', T.sniff(n));
    sniffBtn.classList.toggle('is-waiting', n === 0 || !reachable(sp).some((t) => !sp.sniffed.includes(t.cell)));
  }

  // ---- Every frame: the strip, and the pet on the ground ----

  function frame(t: number): void {
    if (!active) return;
    frameId = requestAnimationFrame(frame);
    const sp = spot();
    if (!sp) return;
    if (stripCtx) {
      stripCtx.clearRect(0, 0, STRIP_W, STRIP_H);
      stripCtx.save();
      stripCtx.translate(0, -18);
      drawPlace(stripCtx, sp.place, STRIP_W, 48, false, t);
      if (sp.stars === 3) drawPlaceSparkle(stripCtx, sp.place, STRIP_W, t);
      stripCtx.restore();
    }
    for (const tab of tabArts) {
      if (!tab.rare || !tab.ctx) continue;
      drawPlace(tab.ctx, tab.place, 64, 48, false, t);
      drawPlaceSparkle(tab.ctx, tab.place, 64, t);
    }

    // On to the next leg of the walk when this one's done.
    while (pet.legs.length && t - pet.legAt >= pet.legs[0].ms) {
      pet.legAt += pet.legs[0].ms;
      pet.cell = pet.legs.shift()!.to;
      if (!pet.legs.length) {
        pet.legAt = t;
        startJob(t);
      }
    }
    const leg = pet.legs[0];
    if (leg && col(leg.to) !== col(leg.from)) pet.facing = col(leg.to) > col(leg.from) ? 1 : -1;

    // Where it is, in squares, and how high off the ground.
    let x = col(pet.cell);
    let y = line(pet.cell);
    let lift = 0;
    if (leg) {
      const k = Math.min(1, (t - pet.legAt) / leg.ms);
      x = col(leg.from) + (col(leg.to) - col(leg.from)) * k;
      y = line(leg.from) + (line(leg.to) - line(leg.from)) * k;
      const far = Math.hypot(col(leg.to) - col(leg.from), line(leg.to) - line(leg.from));
      lift = Math.sin(k * Math.PI) * (leg.hop ? 0.45 + 0.15 * (far - 1) : 0.06);
    }
    const c0 = grid.children[0] as HTMLElement | undefined;
    const c1 = grid.children[SIZE + 1] as HTMLElement | undefined;
    if (c0 && c1) {
      const f = fit.getBoundingClientRect();
      const r0 = c0.getBoundingClientRect();
      const pitch = c1.getBoundingClientRect().left - r0.left;
      const w = r0.width;
      const drop = Math.max(0, 1 - (t - pet.dropAt) / 380);
      const cx = r0.left - f.left + x * pitch + w / 2;
      const feet = r0.top - f.top + y * pitch + w * 0.86;
      const width = w * 1.06;
      const height = (width * 40) / 32;
      const up = (lift + drop * drop * 2.2) * pitch;
      const shown = t >= pet.dropAt ? '1' : '0';
      petBox.style.width = `${width}px`;
      petBox.style.height = `${height}px`;
      petBox.style.transform = `translate(${cx - width / 2}px, ${feet - height - up}px) scaleX(${pet.facing})`;
      petBox.style.opacity = shown;
      shadow.style.width = `${w * 0.66 * (1 - Math.min(0.45, up / pitch))}px`;
      shadow.style.transform = `translate(${cx}px, ${feet - w * 0.04}px) translate(-50%, -50%)`;
      shadow.style.opacity = shown;
    }

    // How it looks.
    if (petCtx) {
      const sniffing = snuffle !== null || (pet.job?.kind === 'sniff' && pet.job.at !== undefined);
      const digging = pet.job?.kind === 'dig' && pet.job.at !== undefined;
      const feeling = face && t < face.until ? face.face : null;
      const look: Expression = feeling ?? (sniffing || digging ? 'surprised' : 'content');
      const animation = feeling === 'inLove' ? 'cheerful' : sniffing || digging ? 'eat' : leg ? 'happy' : 'idle';
      const { sheet, hat } = cb.petLook();
      petCtx.clearRect(0, 0, 32, 40);
      drawPetStanding(petCtx, { sheet, hat, animation, face: look }, 0, 40, t);
      // Sniffing: little puffs off its nose.
      if (sniffing) {
        for (let i = 0; i < 3; i++) {
          const k = (t / 700 + i / 3) % 1;
          petCtx.globalAlpha = 1 - k;
          petCtx.fillStyle = PALETTE.white;
          petCtx.fillRect(26 + Math.round(k * 4), Math.round(30 - k * 8 - i), 2, 2);
        }
        petCtx.globalAlpha = 1;
      }
    }
  }

  function stop(): void {
    if (!active) return;
    active = false;
    cancelAnimationFrame(frameId);
    row.hidden = true;
    panel.classList.remove('is-in');
    panel.hidden = true;
  }

  return {
    row,
    panel,
    start() {
      active = true;
      picked = null;
      shownKey = '';
      row.hidden = false;
      panel.hidden = false;
      render(true);
      void panel.offsetHeight;
      panel.classList.add('is-in');
      frameId = requestAnimationFrame(frame);
    },
    stop,
    active: () => active,
    update(next, at) {
      state = next;
      now = at;
      if (!active) return;
      if (isAway(next.pet) || hasBackpack(next.pet)) {
        stop();
        cb.onExit();
        return;
      }
      render();
    },
  };
}
