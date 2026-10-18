// The rules of the fishing mini-game. The screen side (buttons, the catch
// bar, timers) lives in src/ui/fishing.ts; this file only decides what
// counts as a good catch and what it does to the game.
//
// How a catch works: after a bite you tap Reel in, and a bar appears with a
// red stripe somewhere on it, yellow on both sides of the red, green beyond
// that, and blue everywhere else. A marker sweeps back and forth across the
// bar and you tap Catch to stop it. Where it stops decides the chance of
// landing the fish (see CONFIG.fishing.catchChance).

import { CONFIG } from './config';
import { simulate } from './simulate';
import { canPlayMinigames, clampStat } from './stats';
import { withPet, type ActionResult } from './actions';
import type { GameState } from './state';

export type CatchGrade = 'perfect' | 'good' | 'weak' | 'miss';

// Where the coloured zones sit on the bar, as shares of its width (0 is the
// left end, 1 the right end). Each zone runs from `start` to `end`; the
// blue "miss" area is everything outside `weak`.
export interface CatchZones {
  perfect: { start: number; end: number };
  good: { start: number; end: number };
  weak: { start: number; end: number };
}

// Half the width of each zone measured from the middle of the red stripe.
function reaches() {
  const w = CONFIG.fishing.zoneWidths;
  const perfect = w.perfect / 2;
  const good = perfect + w.good;
  const weak = good + w.weak;
  return { perfect, good, weak };
}

// Puts the zones at a random spot on the bar, always fully on it.
// `random` is a number from 0 to 1 (Math.random() in the game).
export function placeZones(random: number): CatchZones {
  const r = reaches();
  const center = r.weak + random * (1 - 2 * r.weak);
  const span = (half: number) => ({ start: center - half, end: center + half });
  return { perfect: span(r.perfect), good: span(r.good), weak: span(r.weak) };
}

// Which zone a spot on the bar (0-1) falls in.
export function gradeAt(zones: CatchZones, position: number): CatchGrade {
  const inside = (z: { start: number; end: number }) => position >= z.start && position <= z.end;
  if (inside(zones.perfect)) return 'perfect';
  if (inside(zones.good)) return 'good';
  if (inside(zones.weak)) return 'weak';
  return 'miss';
}

// Where the sweeping marker is (0-1) after `elapsedMs`. It starts at the
// left end and bounces between the ends.
export function markerAt(elapsedMs: number): number {
  const sweep = CONFIG.fishing.sweepSeconds * 1000;
  const t = (elapsedMs / sweep) % 2;
  return t <= 1 ? t : 2 - t;
}

// True once the marker has crossed the bar too many times: the fish is gone.
export function sweptOut(elapsedMs: number): boolean {
  return elapsedMs >= CONFIG.fishing.maxSweeps * CONFIG.fishing.sweepSeconds * 1000;
}

// How long to wait for a bite, in milliseconds (random from 0 to 1).
export function biteDelayMs(random: number): number {
  const { min, max } = CONFIG.fishing.biteAfterSeconds;
  return (min + random * (max - min)) * 1000;
}

// Throws the line. Costs a little energy, and is refused when the pet
// can't play mini-games right now.
export function cast(state: GameState, now: number): ActionResult {
  const s = simulate(state, now);
  if (s.pet.stage === 'egg') return { state: s, blocked: 'egg' };
  if (s.pet.asleep) return { state: s, blocked: 'asleep' };
  if (!canPlayMinigames(s.pet, now)) return { state: s, blocked: 'resting' };
  const cost = CONFIG.fishing.energyPerCast;
  if (s.pet.stats.energy < cost) return { state: s, blocked: 'tooTired' };
  return { state: withPet(s, (pet) => (pet.stats.energy = clampStat(pet.stats.energy - cost))) };
}

// The kinds of fish you can catch (ids of foods in CONFIG.foods).
export type CatchId = keyof typeof CONFIG.fishing.catchOdds.other;

// Which kind of fish bit, from a random number (0-1). A perfect catch
// makes the rarer ones more likely, and so does bait.
export function pickCatch(grade: CatchGrade, random: number, baited = false): CatchId {
  const table = baited ? CONFIG.fishing.bait.catchOdds : CONFIG.fishing.catchOdds;
  const odds = grade === 'perfect' ? table.perfect : table.other;
  const entries = Object.entries(odds) as [CatchId, number][];
  const total = entries.reduce((sum, [, p]) => sum + p, 0);
  let roll = random * total;
  for (const [id, p] of entries) {
    if (roll < p) return id;
    roll -= p;
  }
  return entries[entries.length - 1][0];
}

// Tries to land the fish. `landRoll` (0-1) is rolled against the grade's
// chance, and `kindRoll` (0-1) picks which fish it was. A landed fish goes
// into the inventory as food. With bait, a landed fish uses one up (a fish
// that gets away doesn't).
export function land(
  state: GameState,
  grade: CatchGrade,
  landRoll: number,
  kindRoll: number,
): { state: GameState; caught: CatchId | null; count: number; baited: boolean } {
  if (landRoll >= CONFIG.fishing.catchChance[grade]) return { state, caught: null, count: 0, baited: false };
  const bait = state.inventory.supplies.bait ?? 0;
  const baited = bait > 0;
  const caught = pickCatch(grade, kindRoll, baited);
  const count = CONFIG.fishing.fishPerCatch;
  const food = { ...state.inventory.food, [caught]: (state.inventory.food[caught] ?? 0) + count };
  const supplies = baited ? { ...state.inventory.supplies, bait: bait - 1 } : state.inventory.supplies;
  const kinds = state.caught.includes(caught) ? state.caught : [...state.caught, caught];
  return { state: { ...state, inventory: { ...state.inventory, food, supplies }, caught: kinds }, caught, count, baited };
}
