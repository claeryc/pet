// The rules of cooking. The screen side (the pot, the pantry and the recipe
// book) lives in src/ui/cooking.ts; this file only decides what a mix of
// ingredients makes and what cooking it does to the inventory.
//
// How it works: put up to potSlots() foods in the pot and tap Cook. The ingredients are used up. If they match a recipe (in any order)
// you get that dish and the recipe goes in your recipe book; any other mix
// makes a Mushy mess, which still fills the tummy a little. A single food
// that isn't a recipe on its own isn't cooked at all.
//
// Every recipe is made at a station. Only the pot is in the game so far;
// the others (an oven, a cutting board, a mill) are kitchen items you'll
// own in `state.kitchen`, and their recipes stay closed until you do.

import { CONFIG } from './config';
import { addTally } from './achievements';
import { foodCount } from './economy';
import type { FoodId } from './actions';
import type { GameState } from './state';
import { perk } from './skills';

export type Station = keyof typeof CONFIG.cooking.stations;
export type KitchenItem = keyof typeof CONFIG.cooking.kitchen;

export interface Recipe {
  id: FoodId; // the dish it makes
  ingredients: readonly FoodId[];
  station?: Station; // where it's made (the pot if not given)
  makes?: number; // how many one cooking makes (1 if not given)
  // Only open between these days of the year ("MM-DD", both included, on
  // the device's calendar). A window can wrap round the new year.
  unlock?: { from: string; to: string };
}

export const RECIPES = CONFIG.cooking.recipes as readonly Recipe[];
// The recipes the recipe book counts (and Master Chef needs): every one
// but the seasonal ones, which come and go.
export const COUNTED_RECIPES = RECIPES.filter((r) => !r.unlock);

export const stationOf = (recipe: Recipe): Station => recipe.station ?? 'pot';

export function hasKitchen(state: GameState, item: KitchenItem): boolean {
  return state.kitchen.includes(item);
}

// True if you have the station: the pot always, the rest once bought.
export function hasStation(state: GameState, station: Station): boolean {
  return station === 'pot' || hasKitchen(state, station as KitchenItem);
}

// How many foods the pot takes.
export function potSlots(state: GameState): number {
  return hasKitchen(state, 'biggerPot') ? CONFIG.cooking.kitchen.biggerPot.slots : CONFIG.cooking.slots;
}

// The most any pot can take, for laying out its spots.
export const MAX_POT_SLOTS = Math.max(CONFIG.cooking.slots, CONFIG.cooking.kitchen.biggerPot.slots);

// True if a seasonal recipe's window includes this moment.
export function inSeason(recipe: Recipe, now: number): boolean {
  if (!recipe.unlock) return true;
  const d = new Date(now);
  const today = `${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
  const { from, to } = recipe.unlock;
  return from <= to ? today >= from && today <= to : today >= from || today <= to;
}

// True if you can cook a recipe right now: you have its station, and it's
// in season.
export function recipeOpen(state: GameState, recipe: Recipe): boolean {
  return hasStation(state, stationOf(recipe)) && inSeason(recipe, state.lastUpdated);
}
// The foods that can go in the pot: every food some recipe uses, in the
// order of CONFIG.foods.
export const INGREDIENTS: readonly FoodId[] = CONFIG.foods
  .map((f) => f.id as FoodId)
  .filter((id) => RECIPES.some((r) => r.ingredients.includes(id)));

// The same list of foods in a fixed order, so mixes can be compared.
const sorted = (items: readonly FoodId[]) => [...items].sort().join(',');

// The recipe these foods make at a station, or null if they don't make one.
export function matchRecipe(items: readonly FoodId[], station: Station = 'pot'): Recipe | null {
  const key = sorted(items);
  return RECIPES.find((r) => stationOf(r) === station && sorted(r.ingredients) === key) ?? null;
}

// How many of each food a list needs, e.g. { shrimp: 2, salmon: 1 }.
function tally(items: readonly FoodId[]): Map<FoodId, number> {
  const need = new Map<FoodId, number>();
  for (const id of items) need.set(id, (need.get(id) ?? 0) + 1);
  return need;
}

// For each different ingredient of a recipe: how many it needs and how many
// you have (free food counts as plenty).
export function ingredientsFor(
  state: GameState,
  recipe: Recipe,
): { id: FoodId; need: number; have: number }[] {
  return [...tally(recipe.ingredients)].map(([id, need]) => ({ id, need, have: foodCount(state, id) }));
}

// True if you have everything a list of foods needs.
export function haveAll(state: GameState, items: readonly FoodId[]): boolean {
  return [...tally(items)].every(([id, need]) => foodCount(state, id) >= need);
}

export function knowsRecipe(state: GameState, id: FoodId): boolean {
  return state.recipesFound.includes(id);
}

// True if these foods are a recipe, or could still become one by adding
// more. When it's false, cooking will only make a Mushy mess.
export function couldBeRecipe(items: readonly FoodId[], station: Station = 'pot'): boolean {
  const have = tally(items);
  return RECIPES.some((r) => {
    if (stationOf(r) !== station) return false;
    const need = tally(r.ingredients);
    return [...have].every(([id, n]) => (need.get(id) ?? 0) >= n);
  });
}

// How many one cooking of a recipe makes: its own number, and one more
// with a lucky Second helping. `luck` is 0-1, as in cook() below.
export function portions(state: GameState, recipe: Recipe, luck: number): number {
  return (recipe.makes ?? 1) + (luck < perk(state, 'secondHelping') ? 1 : 0);
}

export type CookBlock = 'emptyPot' | 'tooMany' | 'notIngredient' | 'noFood' | 'needMore' | 'closed';

export type CookResult =
  | {
    state: GameState;
    dish: FoodId;
    count: number; // how many were made (Second helping can add one)
    recipe: Recipe | null;
    discovered: boolean;
    saved: FoodId | null; // an ingredient a Mushy mess gave back (Waste not)
    blocked?: undefined;
  }
  | { state: GameState; blocked: CookBlock };

// Cooks what's in the pot: uses up the ingredients and puts the dish (or a
// Mushy mess) in the inventory. `luck` (0-1, Math.random() in the game) is
// rolled for the Kitchen skills: a recipe might make 2 (Second helping),
// and a Mushy mess might give an ingredient back (Waste not).
export function cook(state: GameState, items: readonly FoodId[], luck = 1): CookResult {
  if (items.length === 0) return { state, blocked: 'emptyPot' };
  if (items.length > potSlots(state)) return { state, blocked: 'tooMany' };
  if (!items.every((id) => INGREDIENTS.includes(id))) return { state, blocked: 'notIngredient' };
  if (!haveAll(state, items)) return { state, blocked: 'noFood' };
  // One food on its own isn't cooked unless it's a recipe by itself.
  if (items.length === 1 && !matchRecipe(items)) return { state, blocked: 'needMore' };

  const food = { ...state.inventory.food };
  for (const [id, need] of tally(items)) {
    if (foodCount(state, id) !== Infinity) food[id] = (food[id] ?? 0) - need; // free food never runs out
  }
  const recipe = matchRecipe(items);
  // A recipe you can't make yet (out of season, say) isn't cooked at all,
  // rather than turning into a Mushy mess.
  if (recipe && !recipeOpen(state, recipe)) return { state, blocked: 'closed' };
  const dish: FoodId = recipe?.id ?? (CONFIG.cooking.mess as FoodId);
  const count = recipe ? portions(state, recipe, luck) : 1;
  food[dish] = (food[dish] ?? 0) + count;
  // The ingredient given back is the first one that isn't free.
  const saved = !recipe && luck < perk(state, 'wasteNot')
    ? (items.find((id) => foodCount(state, id) !== Infinity) ?? null)
    : null;
  if (saved) food[saved] = (food[saved] ?? 0) + 1;
  const discovered = recipe !== null && !knowsRecipe(state, recipe.id);
  const cooked: GameState = {
    ...state,
    inventory: { ...state.inventory, food },
    recipesFound: discovered ? [...state.recipesFound, recipe.id] : state.recipesFound,
  };
  return {
    state: recipe ? addTally(cooked, 'dishes', count) : cooked,
    dish,
    count,
    recipe,
    discovered,
    saved,
  };
}
