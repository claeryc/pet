// The rules of the fishing mini-game. The screen side (buttons, the catch
// bar, timers) lives in src/ui/fishing.ts; this file only decides what
// counts as a good catch and what it does to the game.
//
// How a catch works: after a bite you tap Reel in, and a bar appears with a
// green stripe somewhere on it, yellow on both sides of the green, red
// beyond that, and blue everywhere else. The dot starts at the left end.
// Holding Pull drags it right, letting go lets it drift back left, and the
// coloured stripe slides a little to one side every few seconds. While the
// dot is on a coloured stripe the catch meter fills; on blue it drains.
// Fill it and the fish is landed, graded by where the dot spent its time
// (see reelGrade and CONFIG.fishing.catchChance). Let it empty and the fish
// swims off.

import { CONFIG } from './config';
import { addTally, countUp } from './achievements';
import { localDay } from './economy';
import { simulate } from './simulate';
import { canPlayMinigames, clampStat } from './stats';
import { withPet, type ActionResult } from './actions';
import type { GameState } from './state';
import { isAway } from './presence';
import { addXp, perk, type ReelPerks } from './skills';

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
// `widen` stretches the green stripe (the Steady hands skill).
function reaches(widen = 1) {
  const w = CONFIG.fishing.zoneWidths;
  const perfect = (w.perfect * widen) / 2;
  const good = perfect + w.good;
  const weak = good + w.weak;
  return { perfect, good, weak };
}

// The zones around a centre spot on the bar, kept fully on it.
export function zonesAround(center: number, widen = 1): CatchZones {
  const r = reaches(widen);
  const c = Math.min(1 - r.weak, Math.max(r.weak, center));
  const span = (half: number) => ({ start: c - half, end: c + half });
  return { perfect: span(r.perfect), good: span(r.good), weak: span(r.weak) };
}

// Puts the zones at a random spot on the bar, always fully on it.
// `random` is a number from 0 to 1 (Math.random() in the game).
export function placeZones(random: number): CatchZones {
  const r = reaches();
  return zonesAround(r.weak + random * (1 - 2 * r.weak));
}

// Which zone a spot on the bar (0-1) falls in.
export function gradeAt(zones: CatchZones, position: number): CatchGrade {
  const inside = (z: { start: number; end: number }) => position >= z.start && position <= z.end;
  if (inside(zones.perfect)) return 'perfect';
  if (inside(zones.good)) return 'good';
  if (inside(zones.weak)) return 'weak';
  return 'miss';
}

// Everything about one reel-in, from the moment the bar shows up.
export interface Reel {
  elapsedMs: number;
  marker: number; // where the dot is (0-1)
  speed: number; // how fast the dot moves, in bars per second (+ is right)
  center: number; // where the middle of the zones is right now
  from: number; // the centre it's sliding away from...
  to: number; // ...and the one it's sliding to
  shiftedAt: number; // when the latest slide started (elapsedMs)
  nextShiftAt: number; // when the next one starts
  meter: number; // the catch meter (0-1)
  widen: number; // how much wider the green stripe is (skills)
  timeIn: Record<CatchGrade, number>; // ms the dot spent in each zone
}

function shiftGap(random: number): number {
  const { min, max } = CONFIG.fishing.reel.shiftEverySeconds;
  return (min + random * (max - min)) * 1000;
}

// Where the zones slide to next: a bit to the left or right of `center`
// (`random` 0-1 picks the side and how far), staying on the bar.
export function nextCenter(center: number, random: number, widen = 1): number {
  const { min, max } = CONFIG.fishing.reel.shiftBy;
  const r = reaches(widen);
  const left = random < 0.5;
  const by = min + ((left ? random : random - 0.5) * 2) * (max - min);
  let to = center + (left ? -by : by);
  // Bounce off the ends instead of piling up against them.
  if (to < r.weak || to > 1 - r.weak) to = center + (left ? by : -by);
  return Math.min(1 - r.weak, Math.max(r.weak, to));
}

// A fresh reel: the dot at the left end, the zones at a random spot.
// `perks` are the fishing skills (none by default).
export function startReel(random: number, perks: ReelPerks = { widen: 1, meterStart: CONFIG.fishing.reel.meterStart }): Reel {
  const r = reaches(perks.widen);
  const center = r.weak + random * (1 - 2 * r.weak);
  return {
    elapsedMs: 0,
    marker: 0,
    speed: 0,
    center,
    from: center,
    to: center,
    shiftedAt: 0,
    nextShiftAt: shiftGap(random),
    meter: perks.meterStart,
    widen: perks.widen,
    timeIn: { perfect: 0, good: 0, weak: 0, miss: 0 },
  };
}

export function reelZones(reel: Reel): CatchZones {
  return zonesAround(reel.center, reel.widen);
}

// Moves the reel on by `dtMs`. `held` is whether Pull is held down, and
// `random` (0-1) is only used when the zones start a new slide.
export function stepReel(reel: Reel, held: boolean, dtMs: number, random: number): Reel {
  const c = CONFIG.fishing.reel;
  const dt = Math.min(dtMs, 50) / 1000; // a long hiccup counts as one short step
  const elapsedMs = reel.elapsedMs + dt * 1000;

  // The dot: pulled right while held, drifting back left when let go.
  let speed = reel.speed + (held ? c.pull : -c.drift) * dt;
  speed = Math.max(-c.maxSpeed, Math.min(c.maxSpeed, speed));
  let marker = reel.marker + speed * dt;
  if (marker <= 0 || marker >= 1) {
    marker = Math.max(0, Math.min(1, marker));
    speed = 0;
  }

  // The zones: every few seconds they glide a little to one side.
  let { from, to, shiftedAt, nextShiftAt } = reel;
  if (elapsedMs >= nextShiftAt) {
    from = reel.center;
    to = nextCenter(reel.center, random, reel.widen);
    shiftedAt = elapsedMs;
    nextShiftAt = elapsedMs + shiftGap(random);
  }
  const glide = Math.min(1, (elapsedMs - shiftedAt) / (c.glideSeconds * 1000));
  const eased = glide * glide * (3 - 2 * glide);
  const center = from + (to - from) * eased;

  // The meter fills while the dot is on a coloured zone, drains on blue.
  // For the first moments (while the dot travels over from the left end)
  // it doesn't drain, and that time doesn't count against the grade.
  const grade = gradeAt(zonesAround(center, reel.widen), marker);
  const grace = elapsedMs <= c.graceSeconds * 1000;
  const change = grade !== 'miss' ? c.fill : grace ? 0 : -c.drain;
  const meter = Math.max(0, Math.min(1, reel.meter + change * dt));
  const counts = !grace || grade === 'perfect';
  const timeIn = counts ? { ...reel.timeIn, [grade]: reel.timeIn[grade] + dt * 1000 } : reel.timeIn;

  return { ...reel, elapsedMs, marker, speed, center, from, to, shiftedAt, nextShiftAt, meter, timeIn };
}

// 'landed' once the meter is full, 'lost' once it's empty, else null.
export function reelOutcome(reel: Reel): 'landed' | 'lost' | null {
  if (reel.meter >= 1) return 'landed';
  if (reel.meter <= 0) return 'lost';
  return null;
}

// How good a landed catch was, from where the dot spent its time on the
// coloured zones: mostly green is perfect, mostly green and yellow is good.
export function reelGrade(reel: Reel): CatchGrade {
  const { perfect, good, weak } = reel.timeIn;
  const total = perfect + good + weak;
  if (total <= 0) return 'miss';
  const share = CONFIG.fishing.reel.gradeShare;
  if (perfect / total >= share) return 'perfect';
  if ((perfect + good) / total >= share) return 'good';
  return 'weak';
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
  if (isAway(s.pet)) return { state: s, blocked: 'away' };
  if (s.pet.stage === 'egg') return { state: s, blocked: 'egg' };
  if (s.pet.condition === 'passed') return { state: s, blocked: 'passed' };
  if (s.pet.asleep) return { state: s, blocked: 'asleep' };
  if (!canPlayMinigames(s.pet, now)) return { state: s, blocked: 'resting' };
  const cost = CONFIG.fishing.energyPerCast;
  if (s.pet.stats.energy < cost) return { state: s, blocked: 'tooTired' };
  return { state: withPet(s, (pet) => (pet.stats.energy = clampStat(pet.stats.energy - cost))) };
}

// The kinds of fish you can catch (ids of foods in CONFIG.foods).
export type CatchId = keyof typeof CONFIG.fishing.catchOdds.other;

// Which kind of fish bit, from a random number (0-1). A perfect catch
// makes the rarer ones more likely, and so does bait. `lucky` (the Lucky
// line skill) moves that many percent from shrimp to lobster.
export function pickCatch(grade: CatchGrade, random: number, baited = false, lucky = 0): CatchId {
  const table = baited ? CONFIG.fishing.bait.catchOdds : CONFIG.fishing.catchOdds;
  const odds: Record<CatchId, number> = { ...(grade === 'perfect' ? table.perfect : table.other) };
  const moved = Math.min(lucky, odds.shrimp);
  odds.shrimp -= moved;
  odds.lobster += moved;
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
// chance, and `kindRoll` picks which fish it was. A landed fish goes
// into the inventory as food. With bait switched on, a landed fish uses one
// up (a fish that gets away doesn't). Only the first
// `rewardedPerDay` fish each day give Keeper XP (and a chance of a seed,
// see findSeed): `rewarded` says whether this one did.
export function land(
  state: GameState,
  grade: CatchGrade,
  landRoll: number,
  kindRoll: number,
): { state: GameState; caught: CatchId | null; count: number; baited: boolean; rewarded: boolean } {
  if (landRoll >= CONFIG.fishing.catchChance[grade]) return { state, caught: null, count: 0, baited: false, rewarded: false };
  const bait = state.inventory.supplies.bait ?? 0;
  const baited = state.baitOn && bait > 0;
  const caught = pickCatch(grade, kindRoll, baited, perk(state, 'luckyLine'));
  const count = CONFIG.fishing.fishPerCatch;
  const food = { ...state.inventory.food, [caught]: (state.inventory.food[caught] ?? 0) + count };
  const supplies = baited ? { ...state.inventory.supplies, bait: bait - 1 } : state.inventory.supplies;
  const kinds = state.caught.includes(caught) ? state.caught : [...state.caught, caught];
  const today = localDay(state.lastUpdated);
  const before = state.pond.day === today ? state.pond.fish : 0;
  const rewarded = before < CONFIG.fishing.rewardedPerDay;
  let next: GameState = {
    ...state,
    inventory: { ...state.inventory, food, supplies },
    caught: kinds,
    pond: { day: today, fish: before + count },
  };
  // Past the limit the fish still count for the Fishing badge, just
  // without XP.
  next = rewarded ? addTally(next, 'fish', count) : countUp(next, 'fish', count);
  if (grade === 'perfect' && rewarded) next = addXp(next, CONFIG.skills.perfectFishXp);
  return { state: next, caught, count, baited, rewarded };
}

// True when the fish just landed was the first one past the day's limit,
// so the game can say once that the fish are shy now.
export function justGotShy(state: GameState): boolean {
  return state.pond.fish === CONFIG.fishing.rewardedPerDay + CONFIG.fishing.fishPerCatch;
}

// Switches bait on or off for fishing (the little dot in the pond).
export function toggleBait(state: GameState): GameState {
  return { ...state, baitOn: !state.baitOn };
}
