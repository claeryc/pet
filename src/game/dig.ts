// Sniff and dig (Play > Dig): a little treasure hunt each day.
//
// Every day there are four spots to dig at: the Meadow, and three of the
// journey places (open ones first; a place that isn't open yet shows as a
// locked card). Each spot is a small patch of ground with a few treasures
// buried in it. You get a handful of digs a day, shared between the spots.
// A hole with nothing in it shows how many treasures are buried in the
// eight squares around it, so each dig helps aim the next one, like
// Minesweeper the other way round. Each spot also has a sniff: the pet
// points its nose at a square with something in it.
//
// Spots have 1 or 2 stars, and now and then one is a rare 3-star spot with
// a 3-star find and the place's ingredient in the ground. Treasures you
// don't get to stay buried, and are there again the next day the place
// comes up.
//
// Each place digs a little differently:
//   - the woods have roots you can't dig through;
//   - at the cove the tide comes in from one side (a different one each
//     day) and covers another row every couple of digs, so that side is
//     worth digging first;
//   - the market has lost coins, one more treasure that's always gold;
//   - on the hill the stars help: one more sniff.
//
// It costs no energy, and never gives energy or star fragments: it's a
// nice daily extra, not a way around resting. The numbers live in
// CONFIG.dig, and the screen in src/ui/dig.ts.

import { CONFIG } from './config';
import { localDay } from './economy';
import { seededRoll } from './growth';
import { foodStars, getPlace, giveFind, MEADOW, parseFind, PLACES, placeOpen } from './journeys';
import { canPlayMinigames } from './stats';
import { isAway } from './presence';
import { simulate } from './simulate';
import type { BlockReason } from './actions';
import type { Dig, DigSpot, DigTreasure, Find, GameState, TideSide } from './state';

const D = CONFIG.dig;
export const SIZE = D.size;
export const CELLS = SIZE * SIZE;
const SIDES: readonly TideSide[] = ['top', 'right', 'bottom', 'left'];

type Tier = 1 | 2 | 3;
const findsAt = (place: string, stars: Tier): readonly string[] =>
  (D.finds as Record<string, Record<Tier, readonly string[]>>)[place]?.[stars] ?? D.finds.meadow[stars];

// A place's ingredient, if it has one (the Meadow doesn't).
export const ingredientOf = (place: string): string | null => getPlace(place)?.ingredient ?? null;

// ---- Today's spots ----

// The four places for `day`: the Meadow first, then three of the journey
// places, open ones before locked ones, in a shuffled order for the day.
export function placesFor(state: GameState, day: string): string[] {
  const order = PLACES.map((p) => ({ id: p.id, open: placeOpen(state, p), roll: seededRoll('dig', `${day}:order:${p.id}`) }))
    .sort((a, b) => Number(b.open) - Number(a.open) || a.roll - b.roll);
  return [MEADOW, ...order.slice(0, D.spots - 1).map((p) => p.id)];
}

export function isOpenPlace(state: GameState, place: string): boolean {
  if (place === MEADOW) return true;
  const p = getPlace(place);
  return !!p && placeOpen(state, p);
}

// Which of the day's places is the rare one, if any.
function rarePlace(day: string, places: string[]): string | null {
  if (seededRoll('dig', `${day}:rare`) >= D.rareChance) return null;
  return places[Math.floor(seededRoll('dig', `${day}:rare-place`) * places.length)];
}

// The cells in a row (top/bottom) or column (left/right) `line` steps in
// from `side`.
export function lineCells(side: TideSide, line: number): number[] {
  const out: number[] = [];
  for (let i = 0; i < SIZE; i++) {
    if (side === 'top') out.push(line * SIZE + i);
    else if (side === 'bottom') out.push((SIZE - 1 - line) * SIZE + i);
    else if (side === 'left') out.push(i * SIZE + line);
    else out.push(i * SIZE + (SIZE - 1 - line));
  }
  return out;
}

// One spot for `place` on `day`. `leftovers` go back in the ground first.
// `fan` is true when a pet at home loves this place (one more sniff).
export function rollSpot(day: string, place: string, rare: boolean, leftovers: readonly { find: string; stars: number }[], fan = false): DigSpot {
  const roll = (label: string) => seededRoll('dig', `${day}:${place}:${label}`);
  const stars: Tier = rare ? 3 : roll('stars') < D.twoStarChance ? 2 : 1;
  const tide = place === 'cove' ? SIDES[Math.floor(roll('tide') * SIDES.length)] : null;
  // Cells in a shuffled order: roots take the first few, treasures the next.
  const cells = [...Array(CELLS).keys()].map((c) => ({ c, r: roll(`cell:${c}`) })).sort((a, b) => a.r - b.r).map((x) => x.c);
  const roots = place === 'woods' ? cells.splice(0, D.roots) : [];
  const finds: { find: string; stars: number }[] = [...leftovers];
  const ingredient = ingredientOf(place);
  if (ingredient && (rare || roll('ingredient') < D.ingredientChance)) finds.push({ find: ingredient, stars: foodStars(ingredient) });
  const pick = (tier: Tier, label: string) => {
    const list = findsAt(place, tier);
    return { find: list[Math.floor(roll(label) * list.length)], stars: tier };
  };
  // The best one has the spot's stars; the rest are 1 star, or now and
  // then 2 at a 2- or 3-star spot.
  const count = D.treasures + (rare ? 1 : 0);
  if (finds.length < count) finds.push(pick(stars, 'top'));
  for (let i = 0; finds.length < count; i++) finds.push(pick(stars > 1 && roll(`tier:${i}`) < D.twoStarChance ? 2 : 1, `pick:${i}`));
  if (place === 'market') {
    for (let i = 0; i < D.marketGold; i++) finds.push({ find: findsAt('market', 1).find((f) => f.startsWith('gold:')) ?? 'gold:10', stars: 1 });
  }
  const treasures: DigTreasure[] = finds.map((f, i) => ({ cell: cells[i], ...f }));
  const sniffs = D.sniffs + (place === 'hill' ? 1 : 0) + (fan ? 1 : 0);
  return { place, stars, treasures, dug: [], sniffed: [], sniffs, roots, tide };
}

// Rolls today's spots when the day has changed, putting what was left in
// the ground aside for next time. Also rolls a spot for a place that has
// opened since this morning.
export function digToday(state: GameState, now: number): GameState {
  const day = localDay(now);
  let dig: Dig = state.dig;
  const fans = new Set([state.pet, ...state.housemates].filter((p) => !isAway(p) && p.condition !== 'passed').map((p) => p.favouritePlace));
  if (dig.day !== day) {
    const leftovers: Dig['leftovers'] = { ...dig.leftovers };
    for (const spot of dig.spots) {
      const left = spot.treasures.filter((t) => !spot.dug.includes(t.cell)).map(({ find, stars }) => ({ find, stars }));
      if (left.length) leftovers[spot.place] = [...(leftovers[spot.place] ?? []), ...left].slice(0, D.keepLeftovers);
    }
    dig = { day, places: placesFor(state, day), spots: [], used: 0, leftovers };
  }
  const rare = rarePlace(day, dig.places);
  for (const place of dig.places) {
    if (dig.spots.some((s) => s.place === place) || !isOpenPlace(state, place)) continue;
    const back = dig.leftovers[place] ?? [];
    const { [place]: _, ...rest } = dig.leftovers;
    dig = { ...dig, spots: [...dig.spots, rollSpot(day, place, place === rare, back, fans.has(place))], leftovers: rest };
  }
  return dig === state.dig ? state : { ...state, dig };
}

// ---- Reading a spot ----

export const digsLeft = (state: GameState): number => Math.max(0, D.digsPerDay - state.dig.used);
export const spotOf = (state: GameState, place: string): DigSpot | undefined => state.dig.spots.find((s) => s.place === place);
export const treasureAt = (spot: DigSpot, cell: number): DigTreasure | undefined => spot.treasures.find((t) => t.cell === cell);

// How many treasures are buried in the eight squares around `cell`.
export function warmth(spot: DigSpot, cell: number): number {
  const x = cell % SIZE;
  const y = Math.floor(cell / SIZE);
  let n = 0;
  for (let dy = -1; dy <= 1; dy++) {
    for (let dx = -1; dx <= 1; dx++) {
      const nx = x + dx;
      const ny = y + dy;
      if ((dx || dy) && nx >= 0 && ny >= 0 && nx < SIZE && ny < SIZE && treasureAt(spot, ny * SIZE + nx)) n++;
    }
  }
  return n;
}

// How many rows or columns the tide covers now, and how many more digs
// here until it covers the next (null once it's all the way in).
export function tideLines(spot: DigSpot): number {
  return spot.tide ? Math.min(D.tideLines, Math.floor(spot.dug.length / D.tideEvery)) : 0;
}
export function tideIn(spot: DigSpot): number | null {
  if (!spot.tide || tideLines(spot) >= D.tideLines) return null;
  return D.tideEvery - (spot.dug.length % D.tideEvery);
}

// Cells under the sea: the covered lines, except holes already dug.
export function flooded(spot: DigSpot): Set<number> {
  const out = new Set<number>();
  if (!spot.tide) return out;
  for (let line = 0; line < tideLines(spot); line++) for (const c of lineCells(spot.tide, line)) if (!spot.dug.includes(c)) out.add(c);
  return out;
}

// The cells the tide covers next (to show them wet), if it's coming.
export function wetNext(spot: DigSpot): number[] {
  if (!spot.tide || tideIn(spot) === null) return [];
  return lineCells(spot.tide, tideLines(spot)).filter((c) => !spot.dug.includes(c));
}

export const canDigAt = (spot: DigSpot, cell: number): boolean =>
  cell >= 0 && cell < CELLS && !spot.dug.includes(cell) && !spot.roots.includes(cell) && !flooded(spot).has(cell);

// Treasures still in the ground that you can get to today.
export const reachable = (spot: DigSpot): DigTreasure[] => spot.treasures.filter((t) => canDigAt(spot, t.cell));
export const found = (spot: DigSpot): DigTreasure[] => spot.treasures.filter((t) => spot.dug.includes(t.cell));
export const sniffsLeft = (spot: DigSpot): number => Math.max(0, spot.sniffs - spot.sniffed.length);

// What a spot might have in it, for the back of its card: the ingredient
// (sure at a rare spot), and whether there's gold or seeds to be found.
export function spotPreview(spot: DigSpot): { ingredient: string | null; ingredientSure: boolean; gold: boolean; seeds: boolean; foods: string[] } {
  const tiers = ([1, 2, 3] as Tier[]).filter((t) => t <= spot.stars);
  const all = tiers.flatMap((t) => findsAt(spot.place, t));
  return {
    ingredient: ingredientOf(spot.place),
    ingredientSure: spot.stars === 3,
    gold: all.some((f) => f.startsWith('gold:')) || spot.place === 'market',
    seeds: all.some((f) => f.startsWith('seed:')),
    foods: [...new Set(all.filter((f) => !f.includes(':')))],
  };
}

// ---- Digging ----

export type DigBlock = BlockReason | 'noDigs' | 'cantDig' | 'noSniffs' | 'noSpot';

export interface DigResult {
  state: GameState;
  blocked?: DigBlock;
  find?: Find; // what was in the hole
  warmth?: number; // the number in an empty hole
  flooded?: boolean; // the tide just came in over another line
}

function check(state: GameState, now: number): { state: GameState; blocked?: BlockReason } {
  const s = digToday(simulate(state, now), now);
  if (isAway(s.pet)) return { state: s, blocked: 'away' };
  if (s.pet.stage === 'egg') return { state: s, blocked: 'egg' };
  if (s.pet.condition === 'passed') return { state: s, blocked: 'passed' };
  if (s.pet.asleep) return { state: s, blocked: 'asleep' };
  if (!canPlayMinigames(s.pet, now)) return { state: s, blocked: 'resting' };
  return { state: s };
}

function withSpot(state: GameState, spot: DigSpot, used = state.dig.used): GameState {
  return { ...state, dig: { ...state.dig, used, spots: state.dig.spots.map((s) => (s.place === spot.place ? spot : s)) } };
}

// Digs at `cell` in the spot at `place`. Uses one of the day's digs.
export function dig(state: GameState, now: number, place: string, cell: number): DigResult {
  const c = check(state, now);
  if (c.blocked) return c;
  let s = c.state;
  const spot = spotOf(s, place);
  if (!spot) return { state: s, blocked: 'noSpot' };
  if (digsLeft(s) <= 0) return { state: s, blocked: 'noDigs' };
  if (!canDigAt(spot, cell)) return { state: s, blocked: 'cantDig' };
  const before = tideLines(spot);
  const next: DigSpot = { ...spot, dug: [...spot.dug, cell] };
  s = withSpot(s, next, s.dig.used + 1);
  const t = treasureAt(spot, cell);
  const rose = tideLines(next) > before;
  if (!t) return { state: s, warmth: warmth(spot, cell), flooded: rose };
  const find = parseFind(t.find, t.stars);
  return { state: giveFind(s, find), find, flooded: rose };
}

// The pet sniffs about the spot and points at a treasure you can still get
// to (one it hasn't pointed at yet). Doesn't use a dig.
export function sniff(state: GameState, now: number, place: string): DigResult & { cell?: number } {
  const c = check(state, now);
  if (c.blocked) return c;
  const s = c.state;
  const spot = spotOf(s, place);
  if (!spot) return { state: s, blocked: 'noSpot' };
  if (sniffsLeft(spot) <= 0) return { state: s, blocked: 'noSniffs' };
  const left = reachable(spot).filter((t) => !spot.sniffed.includes(t.cell));
  if (!left.length) return { state: s, blocked: 'noSniffs' };
  // One of the two best ones it can smell.
  const pickFrom = left.sort((a, b) => b.stars - a.stars);
  const cell = pickFrom[Math.floor(seededRoll('dig', `${s.dig.day}:${place}:sniff:${spot.sniffed.length}`) * Math.min(2, pickFrom.length))].cell;
  return { state: withSpot(s, { ...spot, sniffed: [...spot.sniffed, cell] }), cell };
}
