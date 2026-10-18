// Cravings. Now and then the pet would love one particular thing: a fish, a
// crop, a dish or a Shop treat. It shows in a thought bubble over its head
// (no messages), and feeding it that food gives a little extra joy, Care
// and gold. Ignoring it costs nothing; it just passes after a while.
//
// The pet only craves something you can get before the craving passes:
//   - food you have right now,
//   - Shop food (you can always buy it),
//   - a fish you've caught before (3-star fish only if you have one),
//   - a crop in a pot that will be ripe in time,
//   - a dish you've cooked before, if you can get each ingredient this way.
// So it never asks for a dragon fruit that's two days from ripe.
//
// Like Percy's orders, cravings run on real time inside simulate(): one
// that's still going when you come back is waiting in its bubble.

import { CONFIG } from './config';
import type { Food, FoodId } from './actions';
import { foodCount } from './economy';
import { RECIPES } from './cooking';
import { plotStage, timeLeft } from './garden';
import { seededRoll } from './growth';
import { clampStat, isNight } from './stats';
import type { GameState } from './state';

const HOUR = 3_600_000;
const C = CONFIG.craving;
const FOODS = CONFIG.foods as readonly Food[];

const getFood = (id: string) => FOODS.find((f) => f.id === id);
const fromShop = (f: Food) => !f.caughtOnly && !f.grownOnly && !f.cookedOnly;

// Can you get this food by time `by`?
export function gettable(state: GameState, id: string, by: number, now: number): boolean {
  const food = getFood(id);
  if (!food) return false;
  if (foodCount(state, id as FoodId) > 0) return true;
  if (fromShop(food)) return true;
  if (food.caughtOnly) return state.caught.includes(id) && (food.stars ?? 1) < 3;
  if (food.grownOnly) {
    return state.garden.some(
      (p) => p.crop === id && (plotStage(p) === 'ready' || (plotStage(p) === 'growing' && now + timeLeft(p, now) <= by)),
    );
  }
  if (id === CONFIG.cooking.mess || !state.recipesFound.includes(id)) return false;
  const recipe = RECIPES.find((r) => r.id === id);
  return !!recipe && recipe.ingredients.every((i) => gettable(state, i, by, now));
}

// Everything the pet could crave right now, in groups like Percy's: Shop
// treats, fish, crops and dishes. Never the free rice ball or a Mushy mess.
export function cravingPool(state: GameState, now: number): string[][] {
  const by = now + C.lastsHours * HOUR;
  const ok = (f: Food) =>
    f.price > 0 && f.id !== CONFIG.cooking.mess && f.id !== state.craving.last && gettable(state, f.id, by, now);
  return [
    FOODS.filter((f) => fromShop(f) && ok(f)),
    FOODS.filter((f) => f.caughtOnly && ok(f)),
    FOODS.filter((f) => f.grownOnly && ok(f)),
    FOODS.filter((f) => f.cookedOnly && ok(f)),
  ].map((g) => g.map((f) => f.id as string));
}

// Picks a craving: first a group (so a pantry full of Shop treats doesn't
// crowd out the rest), then a food in it. The same moment always gives the
// same pick, so it can be tested.
export function pickCraving(state: GameState, now: number): string | null {
  const groups = cravingPool(state, now).filter((g) => g.length > 0);
  if (groups.length === 0) return null;
  const group = groups[Math.floor(seededRoll(state.pet.id, `craving-group:${now}`) * groups.length)];
  return group[Math.floor(seededRoll(state.pet.id, `craving:${now}`) * group.length)];
}

// Moves cravings along to time `now`: one that has passed goes away, and a
// new one comes once it's time, while the pet is awake in the daytime.
export function stepCraving(state: GameState, now: number): GameState {
  let craving = state.craving;
  if (craving.food && now >= craving.until) {
    craving = { ...craving, food: null, nextAt: craving.until + C.nextAfterHours * HOUR };
  }
  const { pet } = state;
  if (!craving.food && now >= craving.nextAt && pet.stage !== 'egg' && !pet.asleep && !isNight(now)) {
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
  const pet = {
    ...state.pet,
    stats: { ...state.pet.stats, happiness: clampStat(state.pet.stats.happiness + reward.happiness) },
    careScore: clampStat(state.pet.careScore + reward.care),
  };
  return {
    state: {
      ...state,
      pet,
      gold: state.gold + reward.gold,
      craving: { ...state.craving, food: null, nextAt: now + C.nextAfterHours * HOUR },
    },
    tip: reward.gold,
  };
}
