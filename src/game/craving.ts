// Cravings. Now and then the pet would love one particular thing: a fish, a
// crop, a dish or a Shop treat. It shows in a thought bubble over its head
// (no messages), and feeding it that food gives a little extra joy, Care
// and gold (more gold for rarer food). Ignoring it costs nothing; it just
// passes after a while.
//
// The pet craves anything you've had before, whether you have one now or
// not: a fish you've caught, a crop you've grown, a dish you've cooked, or
// a Shop treat. A pumpkin craving is easy with pumpkins in the pantry and
// out of reach without, so keeping a varied pantry pays off.
//
// Like Percy's orders, cravings run on real time inside simulate(): one
// that's still going when you come back is waiting in its bubble.

import { CONFIG } from './config';
import { addTally } from './achievements';
import type { Food } from './actions';
import { seededRoll } from './growth';
import { clampStat, isNight } from './stats';
import type { GameState } from './state';
import { isAway } from './presence';

const HOUR = 3_600_000;
const C = CONFIG.craving;
const FOODS = CONFIG.foods as readonly Food[];

// Shop food that's always in (not the energy drink, which only comes some days).
const fromShop = (f: Food) => !f.caughtOnly && !f.grownOnly && !f.cookedOnly && !f.foundOnly && !f.limited;

// Everything the pet could crave, in groups like Percy's: Shop treats,
// fish, crops and dishes. Never the free rice ball, a Mushy mess, or the
// same thing twice in a row.
export function cravingPool(state: GameState): string[][] {
  const ok = (f: Food) => f.price > 0 && f.id !== CONFIG.cooking.mess && f.id !== state.craving.last;
  return [
    FOODS.filter((f) => fromShop(f) && ok(f)),
    FOODS.filter((f) => f.caughtOnly && ok(f) && state.caught.includes(f.id)),
    FOODS.filter((f) => f.grownOnly && ok(f) && (state.grown ?? []).includes(f.id)),
    FOODS.filter((f) => f.cookedOnly && ok(f) && state.recipesFound.includes(f.id)),
  ].map((g) => g.map((f) => f.id as string));
}

// The gold tip for feeding a craving, by the food's stars.
export function cravingTip(food: string): number {
  const stars = (FOODS.find((f) => f.id === food)?.stars ?? 0) as 0 | 1 | 2 | 3;
  return C.reward.gold[stars];
}

// Picks a craving: first a group (so a pantry full of Shop treats doesn't
// crowd out the rest), then a food in it. The same moment always gives the
// same pick, so it can be tested.
export function pickCraving(state: GameState, now: number): string | null {
  const groups = cravingPool(state).filter((g) => g.length > 0);
  if (groups.length === 0) return null;
  const group = groups[Math.floor(seededRoll(state.pet.id, `craving-group:${now}`) * groups.length)];
  return group[Math.floor(seededRoll(state.pet.id, `craving:${now}`) * group.length)];
}

// Moves cravings along to time `now`: one that has passed goes away, and a
// new one comes once it's time, while the pet is awake in the daytime. A
// pet that has just hatched gets a little while to settle in (and a name)
// before its first one.
export function stepCraving(state: GameState, now: number): GameState {
  let craving = state.craving;
  // A pet that passed away doesn't crave anything.
  if (craving.food && (now >= craving.until || state.pet.condition === 'passed' || isAway(state.pet))) {
    craving = { ...craving, food: null, nextAt: craving.until + C.nextAfterHours * HOUR };
  }
  const { pet } = state;
  const settlingIn = !pet.named || (pet.stage === 'baby' && now - pet.stageStartedAt < C.firstAfterHatchHours * HOUR);
  if (!craving.food && now >= craving.nextAt && pet.stage !== 'egg' && pet.condition !== 'passed' && !settlingIn && !pet.asleep && !isNight(now) && !isAway(pet)) {
    const food = pickCraving({ ...state, craving }, now);
    if (food) craving = { ...craving, food, until: now + C.lastsHours * HOUR, last: food };
  }
  return craving === state.craving ? state : { ...state, craving };
}

// The pet just ate `food`. If that's what it was craving, it gets the
// extra joy, Care and gold, and the bubble goes away. Returns the gold tip
// (0 if it wasn't the craving).
export function satisfyCraving(state: GameState, food: string, now: number): { state: GameState; tip: number } {
  if (!state.craving.food || state.craving.food !== food) return { state, tip: 0 };
  const { reward } = C;
  const tip = cravingTip(food);
  const pet = {
    ...state.pet,
    stats: { ...state.pet.stats, happiness: clampStat(state.pet.stats.happiness + reward.happiness) },
    careScore: clampStat(state.pet.careScore + reward.care),
  };
  const treated: GameState = {
    ...state,
    pet,
    gold: state.gold + tip,
    craving: { ...state.craving, food: null, nextAt: now + C.nextAfterHours * HOUR },
  };
  return { state: addTally(treated, 'cravings'), tip };
}
