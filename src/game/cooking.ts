// The rules of cooking. The screen side (the pot, the pantry and the recipe
// book) lives in src/ui/cooking.ts; this file only decides what a mix of
// ingredients makes and what cooking it does to the inventory.
//
// How it works: put up to CONFIG.cooking.slots foods in the pot and tap
// Cook. The ingredients are used up. If they match a recipe (in any order)
// you get that dish and the recipe goes in your recipe book; any other mix
// makes a Mushy mess, which still fills the tummy a little.

import { CONFIG } from './config';
import { foodCount } from './economy';
import type { FoodId } from './actions';
import type { GameState } from './state';

export interface Recipe {
  id: FoodId; // the dish it makes
  ingredients: readonly FoodId[];
}

export const RECIPES = CONFIG.cooking.recipes as readonly Recipe[];
export const INGREDIENTS = CONFIG.cooking.ingredients as readonly FoodId[];

// The same list of foods in a fixed order, so mixes can be compared.
const sorted = (items: readonly FoodId[]) => [...items].sort().join(',');

// The recipe these foods make, or null if they don't make one.
export function matchRecipe(items: readonly FoodId[]): Recipe | null {
  const key = sorted(items);
  return RECIPES.find((r) => sorted(r.ingredients) === key) ?? null;
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

export type CookBlock = 'emptyPot' | 'tooMany' | 'notIngredient' | 'noFood';

export type CookResult =
  | { state: GameState; dish: FoodId; recipe: Recipe | null; discovered: boolean; blocked?: undefined }
  | { state: GameState; blocked: CookBlock };

// Cooks what's in the pot: uses up the ingredients and puts the dish (or a
// Mushy mess) in the inventory.
export function cook(state: GameState, items: readonly FoodId[]): CookResult {
  if (items.length === 0) return { state, blocked: 'emptyPot' };
  if (items.length > CONFIG.cooking.slots) return { state, blocked: 'tooMany' };
  if (!items.every((id) => INGREDIENTS.includes(id))) return { state, blocked: 'notIngredient' };
  if (!haveAll(state, items)) return { state, blocked: 'noFood' };

  const food = { ...state.inventory.food };
  for (const [id, need] of tally(items)) {
    if (foodCount(state, id) !== Infinity) food[id] = (food[id] ?? 0) - need; // free food never runs out
  }
  const recipe = matchRecipe(items);
  const dish: FoodId = recipe?.id ?? (CONFIG.cooking.mess as FoodId);
  food[dish] = (food[dish] ?? 0) + 1;
  const discovered = recipe !== null && !knowsRecipe(state, recipe.id);
  return {
    state: {
      ...state,
      inventory: { ...state.inventory, food },
      recipesFound: discovered ? [...state.recipesFound, recipe.id] : state.recipesFound,
    },
    dish,
    recipe,
    discovered,
  };
}
