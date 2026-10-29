// Sniff and dig (Play > Sniff and dig). Like Journeys, it takes over the
// spot of the stat bars and the button row:
//
//   1. Where to dig: today's four spots as postcards on a rack, two by two,
//      the same postcards as the Journeys board. Each has a picture of the
//      place, a stamp with its stars and a line on how it digs. A rare
//      3-star spot fills its card with the place inside the twinkly frame,
//      with the place's own touch moving over it, like a 3-star trip. A
//      place that isn't open yet is the back of a card saying when it
//      opens. Tapping a spot turns it over: a note from your pet on what
//      might be buried there, the finds as stamps and the digs left as the
//      postmark. Buttons: [Back] [Start digging].
//   2. The patch of ground: six by six squares, as big as fits on the
//      screen. The place's name is at the top, with the day's digs as
//      little spades on the right (a hole for each one used). Tap a square
//      to pick it, then Dig. A hole shows how many treasures are buried
//      right next to it, warmer colours for more. Sniff has the pet point
//      at a treasure (a paw on the square). At the cove a chip says when
//      the tide comes in next, and the line it covers next looks wet. The
//      rules are on the "How it works" card, so the line under the ground
//      only says what the last dig or sniff turned up.
//      Buttons: [Back] [Sniff (1)] [Dig].
//
// The rules live in src/game/dig.ts.

import { STRINGS } from '../strings';
import { CONFIG } from '../game/config';
import type { FoodId } from '../game/actions';
import type { DigSpot, GameState, Pet } from '../game/state';
import {
  CELLS, canDigAt, digsLeft, flooded, reachable, sniffsLeft, spotOf, spotPreview, tideIn, treasureAt, warmth, wetNext, SIZE,
  type DigResult,
} from '../game/dig';
import { getPlace, parseFind } from '../game/journeys';
import { isAway, hasBackpack } from '../game/presence';
import { localDay } from '../game/economy';
import { findIconOf, HEART_ICONS, ITEM_ICONS, LOCK_ICON, STAT_ICONS } from './icons';
import { drawPlace } from '../render/places';
import { EPIC_H, PLACE_H, PLACE_W, sparkle, twinkles } from './journeys';

export interface DigCallbacks {
  onDigToday: () => void; // rolls today's spots if the day has changed
  onDig: (place: string, cell: number) => DigResult | null;
  onSniff: (place: string) => number | null; // the cell the pet points at
}

export interface DigSetup extends DigCallbacks {
  onExit: () => void;
  toast: (message: string) => void;
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
const RARITY = ['common', 'common', 'rare', 'epic'];
export const placeName = (id: string): string => T.places[id] ?? id;
const placeIcon = (id: string) => ITEM_ICONS[`place_${id}`] ?? ITEM_ICONS.dig;

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

// The icon and name of something buried ("honey", "seed:pumpkin", "gold:12").
function findIcon(entry: string): string {
  const f = parseFind(entry, 1);
  return findIconOf(f);
}
function findName(entry: string): string {
  const f = parseFind(entry, 1);
  if (f.kind === 'gold') return `${f.count} ${T.gold}`;
  if (f.kind === 'material') return STRINGS.crafting.material[f.id] ?? f.id;
  if (f.kind === 'part') return STRINGS.crafting.parts[f.id] ?? f.id;
  const name = STRINGS.foods[f.id as FoodId] ?? f.id;
  return f.kind === 'seed' ? STRINGS.garden.seedName(name) : name;
}

// The line under a place's name: how it digs.
function twist(spot: DigSpot): string {
  if (spot.stars === 3) return T.rareTwist;
  const t = T.twist[spot.place as keyof typeof T.twist] ?? T.twist.meadow;
  return typeof t === 'function' ? t(T.sides[spot.tide ?? 'left']) : t;
}

export function createDig(cb: DigSetup): DigScene {
  let state: GameState | null = null;
  let now = 0;
  let active = false;
  let stage: 'board' | 'field' = 'board';
  let picked: string | null = null; // the place picked (its card turned over)
  let flipped: string | null = null; // the card already turned over, so a redraw doesn't flip it again
  let cell: number | null = null; // the square picked to dig
  let message = ''; // what the last dig or sniff turned up
  let fresh: number | null = null; // the hole just dug, to pop in
  let shownKey = '';

  const panel = el('div', 'journeys dig');
  panel.hidden = true;
  const row = el('div', 'actions journeys-row dig-row');
  row.hidden = true;
  const back = el('button', 'btn btn-soft', T.back);
  const start = el('button', 'btn', T.start);
  const sniffBtn = el('button', 'btn btn-alt dig-sniff');
  const digBtn = el('button', 'btn', T.dig);
  row.append(back, start, sniffBtn, digBtn);

  const allPets = (s: GameState): Pet[] => [s.pet, ...s.housemates];
  const fanOf = (s: GameState, place: string): string | null =>
    allPets(s).find((p) => !isAway(p) && p.condition !== 'passed' && p.favouritePlace === place)?.name ?? null;
  const spot = (): DigSpot | undefined => (state && picked ? spotOf(state, picked) : undefined);

  back.addEventListener('click', () => {
    if (stage === 'field') {
      stage = 'board';
      cell = null;
      message = '';
      render(true);
      return;
    }
    if (picked) {
      picked = null;
      flipped = null;
      render(true);
      return;
    }
    stop();
    cb.onExit();
  });
  start.addEventListener('click', () => {
    if (!state) return;
    if (!picked || !spot()) return cb.toast(T.blocked.noSpot);
    stage = 'field';
    cell = null;
    message = '';
    render(true);
  });
  sniffBtn.addEventListener('click', () => {
    const sp = spot();
    if (!sp || !state) return;
    const at = cb.onSniff(sp.place);
    if (at === null) return;
    cell = at;
    message = T.sniffed(state.pet.name);
    render(true);
  });
  digBtn.addEventListener('click', () => {
    const sp = spot();
    if (!sp || !state) return;
    if (cell === null) return cb.toast(T.blocked.pickCell);
    const result = cb.onDig(sp.place, cell);
    if (!result) return;
    fresh = cell;
    cell = null;
    const after = state && spotOf(state, sp.place);
    message = result.flooded
      ? T.splash
      : result.find
        ? ''
        : result.warmth
          ? T.warm(result.warmth)
          : T.cold;
    if (state && digsLeft(state) === 0 && after && reachable(after).length) message = T.lastDig;
    render(true);
  });

  // ---- 1. Where to dig ----

  // A little picture of a place, from the same scenes as the trips. A
  // rare spot's picture fills the card, with the place's touch moving.
  function placeArt(place: string, rare: boolean): HTMLCanvasElement {
    const c = el('canvas', 'trip-pc-art');
    c.width = PLACE_W;
    c.height = rare ? EPIC_H : PLACE_H;
    const ctx = c.getContext('2d');
    if (ctx) drawPlace(ctx, place, PLACE_W, c.height, false, 0);
    if (rare) sparkle(c, place);
    return c;
  }

  const stamp = (sp: DigSpot) => el('span', 'trip-pc-stamp', '★'.repeat(sp.stars));

  // One spot to dig at.
  function postcard(s: GameState, sp: DigSpot): HTMLButtonElement {
    const rare = sp.stars === 3;
    const b = el('button', `trip-pc dig-pc${rare ? ' is-epic' : ''}`);
    b.dataset.rarity = RARITY[sp.stars];
    b.append(placeArt(sp.place, rare));
    if (rare) b.append(el('span', 'trip-pc-strip'));
    const done = !reachable(sp).length;
    b.append(stamp(sp), el('b', '', placeName(sp.place)), el('small', '', done ? T.dugUp : twist(sp)));
    if (rare) twinkles(b);
    if (done) b.classList.add('is-done');
    const fan = fanOf(s, sp.place);
    if (fan) {
      const heart = el('span', 'trip-pc-fav');
      heart.append(icon(HEART_ICONS.full, 'trip-pc-fav-icon'), T.fanShort(fan));
      b.append(heart);
    }
    b.setAttribute('aria-label', `${placeName(sp.place)}, ${'★'.repeat(sp.stars)}. ${done ? T.dugUp : twist(sp)}`);
    b.addEventListener('click', () => {
      picked = sp.place;
      render(true);
    });
    return b;
  }

  // A place that isn't open yet: the back of a card, and what opens it.
  function locked(place: string): HTMLElement {
    const card = el('div', 'trip-pc is-waiting dig-pc-locked');
    const opens = getPlace(place)?.opens ?? 'start';
    card.append(icon(LOCK_ICON, 'trip-pc-wait-icon'), el('b', '', placeName(place)), el('small', '', T.locked[opens] ?? ''));
    return card;
  }

  // The picked spot's card, turned over: a note from your pet about what
  // might be buried there, the finds as stamps and the digs left.
  function postcardBack(s: GameState, sp: DigSpot): HTMLElement {
    const wrap = el('div', 'trip-flip');
    const rare = sp.stars === 3;
    const card = el('button', `trip-pc-card${rare ? ' is-epic' : ''}`);
    card.dataset.rarity = RARITY[sp.stars];
    const front = el('span', 'trip-pc-front');
    front.append(placeArt(sp.place, rare), stamp(sp));
    if (rare) twinkles(front);
    const back = el('span', 'trip-pc-back');
    const preview = spotPreview(sp);
    const writer = fanOf(s, sp.place) ?? s.pet.name;
    const lines: string[] = [];
    const tw = T.noteTwist[sp.place as keyof typeof T.noteTwist] ?? T.noteTwist.meadow;
    lines.push(typeof tw === 'function' ? tw(T.sides[sp.tide ?? 'left']) : tw);
    const ingredient = preview.ingredient ? STRINGS.foods[preview.ingredient as FoodId] : null;
    const maybe = [
      ...(ingredient && !preview.ingredientSure ? [ingredient] : []),
      ...preview.foods.slice(0, 2).map((f) => STRINGS.foods[f as FoodId] ?? f),
      ...(preview.seeds ? [T.seeds] : []),
      ...(preview.gold ? [T.gold] : []),
    ];
    if (ingredient && preview.ingredientSure) lines.push(T.noteSure(ingredient));
    if (maybe.length) lines.push(T.noteMaybe(maybe.length > 1 ? `${maybe.slice(0, -1).join(', ')} ${T.or} ${maybe[maybe.length - 1]}` : maybe[0]));
    const stamps = el('span', 'trip-pc-stamps');
    const add = (svg: string, label: string, sure: boolean) => {
      const st = el('span', `trip-pc-find${sure ? '' : ' is-maybe'}`);
      st.append(icon(svg, 'trip-pc-find-icon'));
      st.title = label;
      stamps.append(st);
    };
    if (preview.ingredient) add(ITEM_ICONS[preview.ingredient] ?? '', ingredient ?? '', preview.ingredientSure);
    for (const f of preview.foods.slice(0, 2)) add(ITEM_ICONS[f] ?? '', STRINGS.foods[f as FoodId] ?? f, false);
    if (preview.seeds) add(ITEM_ICONS.seed_carrot, T.seeds, false);
    if (preview.gold) add(STAT_ICONS.gold, T.gold, false);
    const note = el('span', 'trip-pc-note');
    const title = el('span', '');
    title.append(el('b', '', placeName(sp.place)), ` · ${T.noteKind}`);
    note.append(title);
    for (const line of lines) note.append(el('span', '', line));
    note.append(el('span', 'trip-pc-sign', T.noteSign(writer)));
    const mark = el('span', 'trip-pc-postmark');
    mark.append(el('small', '', T.postmark), el('b', '', `${digsLeft(s)}/${D.digsPerDay}`));
    back.append(note, stamps, mark);
    card.append(front, back);
    card.setAttribute('aria-label', `${placeName(sp.place)}. ${lines.join(' ')} ${T.flipBack}`);
    card.addEventListener('click', () => {
      picked = null;
      flipped = null;
      render(true);
    });
    if (flipped === sp.place) card.classList.add('is-flipped');
    else requestAnimationFrame(() => requestAnimationFrame(() => card.classList.add('is-flipped')));
    flipped = sp.place;
    wrap.append(card, el('p', 'trip-note', T.flipBack));
    return wrap;
  }

  // The digs left, top right.
  function digsChip(s: GameState): HTMLElement {
    const chip = el('span', 'trip-holiday-chip dig-chip');
    chip.append(icon(ITEM_ICONS.dig, 'trip-cost-icon'), T.digsChip(digsLeft(s), D.digsPerDay));
    return chip;
  }

  function board(s: GameState): HTMLElement[] {
    const head = el('div', 'trip-head');
    head.append(el('b', '', T.rackTitle), digsChip(s));
    const sp = spot();
    if (sp) return [head, postcardBack(s, sp)];
    const rack = el('div', 'trip-rack');
    for (const place of s.dig.places) {
      const at = spotOf(s, place);
      rack.append(at ? postcard(s, at) : locked(place));
    }
    return [head, rack];
  }

  // ---- 2. The patch of ground ----

  function field(s: GameState, sp: DigSpot): HTMLElement[] {
    // The place, and the day's digs top right: a spade for each one left,
    // a hole for each one used.
    const head = el('div', 'dig-head');
    const kicker = el('span', 'dig-kicker');
    kicker.append(icon(placeIcon(sp.place), 'dig-kicker-icon'), T.kicker(placeName(sp.place)));
    const digs = el('span', 'dig-digs');
    digs.setAttribute('role', 'img');
    digs.setAttribute('aria-label', T.digsChip(digsLeft(s), D.digsPerDay));
    for (let i = 0; i < D.digsPerDay; i++) {
      digs.append(i < s.dig.used ? icon(ITEM_ICONS.digUsed, 'dig-spade is-used') : icon(ITEM_ICONS.digLeft, 'dig-spade'));
    }
    head.append(kicker, digs);

    // What's still buried here, and at the cove how many digs until the
    // tide comes in again.
    const sub = el('div', 'dig-sub');
    const left = reachable(sp).length;
    sub.append(el('span', 'dig-pill', left ? T.left(left) : T.allFound));
    if (sp.tide) {
      const n = tideIn(sp);
      const bar = el('span', 'dig-tide');
      bar.append(el('span', '', n === null ? T.tideFull : `${T.arrows[sp.tide]} ${T.tideIn(n)}`));
      if (n !== null) for (let i = 0; i < D.tideEvery; i++) bar.append(el('i', i < D.tideEvery - n ? 'is-on' : ''));
      sub.append(bar);
    }
    const out: HTMLElement[] = [head, sub];

    const grid = el('div', `dig-field${sp.tide ? ` is-sand is-tide-${sp.tide}` : ''}${sp.place === 'woods' ? ' is-woods' : ''}`);
    grid.setAttribute('role', 'grid');
    grid.style.setProperty('--dig-size', String(SIZE));
    const sea = flooded(sp);
    const wet = new Set(wetNext(sp));
    for (let c = 0; c < CELLS; c++) {
      const sq = el('button', 'dig-cell');
      const t = treasureAt(sp, c);
      const label = T.cell(Math.floor(c / SIZE) + 1, (c % SIZE) + 1);
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
        if (c === fresh) sq.classList.add('is-fresh');
      } else if (sp.roots.includes(c)) {
        sq.classList.add('is-root');
        what = T.cellRoot;
      } else if (sea.has(c)) {
        sq.classList.add('is-sea');
        what = T.cellSea;
      } else {
        if (wet.has(c)) sq.classList.add('is-wet');
        if (sp.sniffed.includes(c)) {
          sq.classList.add('is-sniffed');
          sq.append(icon(ITEM_ICONS.paw, 'dig-cell-icon'));
          what = T.cellSniffed;
        }
        if (c === cell) sq.classList.add('is-picked');
      }
      sq.setAttribute('aria-label', what ? `${label}, ${what}` : label);
      if (canDigAt(sp, c)) {
        sq.setAttribute('aria-pressed', String(c === cell));
        sq.addEventListener('click', () => {
          cell = cell === c ? null : c;
          render(true);
        });
      } else {
        sq.disabled = true;
      }
      grid.append(sq);
    }
    // The ground takes whatever room is left on the screen.
    const fit = el('div', 'dig-fit');
    fit.append(grid);
    out.push(fit);
    fresh = null;

    const p = el('p', 'trip-note dig-hint', message || T.hint);
    p.setAttribute('aria-live', 'polite');
    out.push(p);
    return out;
  }

  function render(force = false): void {
    const s = state;
    if (!s) return;
    if (s.dig.day !== localDay(now)) {
      // A new day while it's open: today's spots, from the start.
      cb.onDigToday();
      stage = 'board';
      picked = null;
      flipped = null;
      return;
    }
    if (picked && !spotOf(s, picked)) picked = null;
    if (stage === 'field' && !picked) stage = 'board';
    const key = JSON.stringify([stage, picked, cell, message, s.dig, allPets(s).map((p) => [p.id, p.favouritePlace, isAway(p)])]);
    if (!force && key === shownKey) return;
    shownKey = key;
    panel.dataset.stage = stage;
    const sp = spot();
    if (stage === 'field' && sp) panel.replaceChildren(...field(s, sp));
    else panel.replaceChildren(...board(s));
    start.hidden = stage !== 'board';
    start.classList.toggle('is-waiting', !sp);
    sniffBtn.hidden = digBtn.hidden = stage !== 'field';
    if (sp) {
      const n = sniffsLeft(sp);
      sniffBtn.replaceChildren(icon(ITEM_ICONS.paw, 'dig-btn-icon'), T.sniff(n));
      sniffBtn.classList.toggle('is-waiting', n === 0 || !reachable(sp).filter((t) => !sp.sniffed.includes(t.cell)).length);
      digBtn.classList.toggle('is-waiting', cell === null || digsLeft(s) === 0);
    }
  }

  function stop(): void {
    if (!active) return;
    active = false;
    row.hidden = true;
    panel.classList.remove('is-in');
    panel.hidden = true;
  }

  return {
    row,
    panel,
    start() {
      active = true;
      stage = 'board';
      picked = null;
      flipped = null;
      cell = null;
      message = '';
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
      if (isAway(next.pet) || hasBackpack(next.pet)) {
        stop();
        cb.onExit();
        return;
      }
      render();
    },
  };
}
