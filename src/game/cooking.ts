// The rules of cooking. The screen side (the pot, the pantry and the recipe
// book) lives in src/ui/cooking.ts; this file only decides what a mix of
// ingredients makes and what cooking it does to the inventory.
//
// How it works: put up to potSlots() foods in the pot and tap Cook. The ingredients are used up. If they match a recipe (in any order)
// you get that dish and the recipe goes in your recipe book; any other mix
// makes a Mushy mess, which still fills the tummy a little. A single food
// that isn't a recipe on its own isn't cooked at all.
//
// Every recipe is made at a station. Every kitchen has the pot and the
// cutting board (where a fish is cut into a fillet with a little timing
// game); the others (an oven, a mill) are kitchen items you'll own in
// `state.kitchen`, and their recipes stay closed until you do. Kitchen
// items also include the bigger pot (four spots) and double batch (cook
// two of a dish at once).

import { CONFIG } from './config';
import { addTally } from './achievements';
import { addXp, perk } from './skills';
import { canAfford, foodCount, type ShopResult } from './economy';
import type { FoodId } from './actions';
import type { GameState } from './state';

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

const STATIONS = CONFIG.cooking.stations as Record<Station, { starter?: boolean; prep?: boolean; timed?: boolean }>;

export const stationOf = (recipe: Recipe): Station => recipe.station ?? 'pot';
// A prep station (the cutting board) gets food ready for cooking: what it
// makes is worth just its ingredients, and it isn't a dish.
export const isPrep = (station: Station): boolean => !!STATIONS[station].prep;

export function hasKitchen(state: GameState, item: KitchenItem): boolean {
  return state.kitchen.includes(item);
}

// True if you have the station: the pot and the board always, the rest
// once bought.
export function hasStation(state: GameState, station: Station): boolean {
  return !!STATIONS[station].starter || hasKitchen(state, station as KitchenItem);
}

// A kitchen item's price in the Shop, or null if it isn't sold.
export function kitchenPrice(item: KitchenItem): number | null {
  return (CONFIG.cooking.kitchen[item] as { price?: number }).price ?? null;
}

// The kitchen items the Shop sells, in config order.
export const KITCHEN_FOR_SALE = (Object.keys(CONFIG.cooking.kitchen) as KitchenItem[]).filter((id) => kitchenPrice(id) !== null);

export function buyKitchen(state: GameState, item: KitchenItem): ShopResult {
  const price = kitchenPrice(item);
  if (price === null) return { state };
  if (hasKitchen(state, item)) return { state, blocked: 'alreadyOwned' };
  if (!canAfford(state, price)) return { state, blocked: 'notEnoughGold' };
  return { state: { ...state, gold: state.gold - price, kitchen: [...state.kitchen, item] } };
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

// The kitchen item a recipe still needs: its station, or a pot big enough
// for it. Null if you have what it takes.
export function recipeNeeds(state: GameState, recipe: Recipe): KitchenItem | null {
  const station = stationOf(recipe);
  if (!hasStation(state, station)) return station as KitchenItem;
  if (station === 'pot' && recipe.ingredients.length > potSlots(state)) return 'biggerPot';
  return null;
}

// True if you can cook a recipe right now: you have what it needs, and
// it's in season.
export function recipeOpen(state: GameState, recipe: Recipe): boolean {
  return recipeNeeds(state, recipe) === null && inSeason(recipe, state.lastUpdated);
}

// How many foods go on a station at once: the pot's spots, or as many as
// the station's biggest recipe takes (one fish on the board).
export function stationSlots(state: GameState, station: Station): number {
  if (station === 'pot') return potSlots(state);
  return Math.max(1, ...RECIPES.filter((r) => stationOf(r) === station).map((r) => r.ingredients.length));
}

// How many batches a cooking can make: two with double batch, else one.
export function maxBatch(state: GameState, station: Station): number {
  return station === 'pot' && hasKitchen(state, 'doubleBatch') ? 2 : 1;
}
// The foods that can go on a station: every food one of its recipes uses,
// in the order of CONFIG.foods.
export function ingredientsAt(station: Station): readonly FoodId[] {
  return CONFIG.foods
    .map((f) => f.id as FoodId)
    .filter((id) => RECIPES.some((r) => stationOf(r) === station && r.ingredients.includes(id)));
}
// The foods that can go in the pot.
export const INGREDIENTS: readonly FoodId[] = ingredientsAt('pot');

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

// True if you have everything a list of foods needs (`batch` times over).
export function haveAll(state: GameState, items: readonly FoodId[], batch = 1): boolean {
  return [...tally(items)].every(([id, need]) => foodCount(state, id) >= need * batch);
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
// with a lucky Second helping (never when prepping). `luck` is 0-1, as in
// cook() below.
export function portions(state: GameState, recipe: Recipe, luck: number): number {
  const lucky = !isPrep(stationOf(recipe)) && luck < perk(state, 'secondHelping');
  return (recipe.makes ?? 1) + (lucky ? 1 : 0);
}

export type CookBlock = 'emptyPot' | 'tooMany' | 'notIngredient' | 'noFood' | 'needMore' | 'closed' | 'noBatch';

export interface CookOptions {
  station?: Station; // where it's cooked (the pot if not given)
  batch?: number; // 2 cooks two batches at once (needs double batch)
  perfect?: boolean; // a perfect cut on the cutting board (Keeper XP)
}

export type CookResult =
  | {
    state: GameState;
    dish: FoodId;
    count: number; // how many were made (Second helping can add one a batch)
    recipe: Recipe | null;
    discovered: boolean;
    saved: FoodId | null; // an ingredient a Mushy mess gave back (Waste not)
    blocked?: undefined;
  }
  | { state: GameState; blocked: CookBlock };

// Cooks what's on a station (the pot unless `opts.station` says): uses up
// the ingredients and puts the dish (or a Mushy mess) in the inventory.
// With `opts.batch` 2 (double batch) it uses everything twice and makes
// two batches. `luck` (0-1, Math.random() in the game; one per batch, or
// one for all) is rolled for the Kitchen skills: a recipe might make one
// more (Second helping), and a Mushy mess might give an ingredient back
// (Waste not). Cutting on the board isn't cooking: it makes no Mushy
// mess, counts as no dish, and a perfect cut gives a little Keeper XP.
export function cook(state: GameState, items: readonly FoodId[], luck: number | readonly number[] = 1, opts: CookOptions = {}): CookResult {
  const station = opts.station ?? 'pot';
  const batch = opts.batch ?? 1;
  const rolls = typeof luck === 'number' ? [luck] : luck;
  const roll = (i: number) => rolls[i] ?? rolls[0] ?? 1;
  if (items.length === 0) return { state, blocked: 'emptyPot' };
  if (items.length > stationSlots(state, station)) return { state, blocked: 'tooMany' };
  if (!items.every((id) => ingredientsAt(station).includes(id))) return { state, blocked: 'notIngredient' };
  if (batch < 1 || batch > maxBatch(state, station)) return { state, blocked: 'noBatch' };
  if (!haveAll(state, items, batch)) return { state, blocked: 'noFood' };
  const recipe = matchRecipe(items, station);
  // One food on its own isn't cooked unless it's a recipe by itself, and
  // the board only cuts what it has a recipe for.
  if (!recipe && (items.length === 1 || isPrep(station))) return { state, blocked: 'needMore' };
  // A recipe you can't make yet (out of season, say) isn't cooked at all,
  // rather than turning into a Mushy mess.
  if (recipe && !recipeOpen(state, recipe)) return { state, blocked: 'closed' };

  const food = { ...state.inventory.food };
  for (const [id, need] of tally(items)) {
    if (foodCount(state, id) !== Infinity) food[id] = (food[id] ?? 0) - need * batch; // free food never runs out
  }
  const dish: FoodId = recipe?.id ?? (CONFIG.cooking.mess as FoodId);
  let count = 0;
  for (let i = 0; i < batch; i++) count += recipe ? portions(state, recipe, roll(i)) : 1;
  food[dish] = (food[dish] ?? 0) + count;
  const luck0 = roll(0);
  // The ingredient given back is the first one that isn't free.
  const saved = !recipe && luck0 < perk(state, 'wasteNot')
    ? (items.find((id) => foodCount(state, id) !== Infinity) ?? null)
    : null;
  if (saved) food[saved] = (food[saved] ?? 0) + 1;
  const discovered = recipe !== null && !knowsRecipe(state, recipe.id);
  const cooked: GameState = {
    ...state,
    inventory: { ...state.inventory, food },
    recipesFound: discovered ? [...state.recipesFound, recipe.id] : state.recipesFound,
  };
  const prep = isPrep(station);
  const counted = !recipe ? cooked
    : prep ? addXp(cooked, opts.perfect ? CONFIG.cooking.cutting.perfectXp : 0)
    : addTally(cooked, 'dishes', count);
  return {
    state: counted,
    dish,
    count,
    recipe,
    discovered,
    saved,
  };
}
