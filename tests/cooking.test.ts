import { describe, expect, it } from 'vitest';
import { CONFIG } from '../src/game/config';
import type { Food } from '../src/game/actions';
import { foodCount } from '../src/game/economy';
import {
  cook, COUNTED_RECIPES, couldBeRecipe, hasStation, haveAll, ingredientsFor, INGREDIENTS, inSeason, matchRecipe,
  MAX_POT_SLOTS, portions, potSlots, recipeOpen, RECIPES, stationOf, type Recipe,
} from '../src/game/cooking';
import { STRINGS } from '../src/strings';
import { ITEM_ICONS } from '../src/ui/icons';
import { newTeen } from './helpers';

const START = new Date(2026, 0, 1, 10, 0).getTime();
const foods = CONFIG.foods as readonly Food[];
const food = (id: string) => foods.find((f) => f.id === id)!;

function withFood(stock: Record<string, number>) {
  const s = newTeen(START);
  s.inventory.food = { ...stock };
  return s;
}

describe('recipes', () => {
  it('every recipe makes a cooked dish and uses real ingredients', () => {
    for (const r of RECIPES) {
      expect(food(r.id).source).toBe('cooked');
      expect(r.ingredients.length).toBeGreaterThan(0);
      expect(r.ingredients.length).toBeLessThanOrEqual(MAX_POT_SLOTS);
      for (const id of r.ingredients) expect(INGREDIENTS).toContain(id);
    }
  });

  it('no two recipes use the same mix', () => {
    const keys = RECIPES.map((r) => [...r.ingredients].sort().join(','));
    expect(new Set(keys).size).toBe(keys.length);
  });

  it('every dish is worth more than eating its ingredients one by one', () => {
    for (const r of RECIPES) {
      const raw = r.ingredients.map(food);
      const sum = (k: 'hunger' | 'happiness' | 'health') => raw.reduce((t, f) => t + f[k], 0);
      const dish = food(r.id);
      expect(dish.hunger + dish.happiness + dish.health).toBeGreaterThan(sum('hunger') + sum('happiness') + sum('health'));
    }
  });

  it('every dish is worth more gold than its ingredients', () => {
    for (const r of RECIPES) {
      const price = r.ingredients.reduce((t, id) => t + food(id).price, 0);
      expect(food(r.id).price, r.id).toBeGreaterThan(price);
    }
  });

  it('every dish is priced by the worth rule', () => {
    // Ingredients' prices added up, times the rule for how many go in
    // (nothing for a prep station), shared over how many it makes.
    for (const r of RECIPES) {
      const sum = r.ingredients.reduce((t, id) => t + food(id).price, 0);
      const prep = (CONFIG.cooking.stations[stationOf(r)] as { prep?: boolean }).prep;
      const times = prep ? 1 : CONFIG.cooking.worth[r.ingredients.length as 1 | 2 | 3 | 4];
      expect(food(r.id).price, r.id).toBe(Math.round((sum * times) / (r.makes ?? 1)));
    }
  });

  it('the worth rule pays more for every extra ingredient past two', () => {
    const w = CONFIG.cooking.worth;
    expect(w[1]).toBe(w[2]);
    expect(w[3]).toBeGreaterThan(w[2]);
    expect(w[4]).toBeGreaterThan(w[3]);
  });

  it('a 3-ingredient dish pays better than any smaller one', () => {
    // Gold made over what the ingredients are worth.
    const gain = (r: (typeof RECIPES)[number]) => food(r.id).price / r.ingredients.reduce((t, id) => t + food(id).price, 0);
    const big = RECIPES.filter((r) => r.ingredients.length === 3).map(gain);
    const small = RECIPES.filter((r) => r.ingredients.length < 3).map(gain);
    expect(Math.min(...big)).toBeGreaterThan(Math.max(...small));
  });

  it('every food but a Mushy mess says what kind of food it is', () => {
    for (const f of foods) if (f.id !== CONFIG.cooking.mess) expect(f.tags.length, f.id).toBeGreaterThan(0);
  });

  it('every dish has a name and an icon', () => {
    for (const id of [...RECIPES.map((r) => r.id), CONFIG.cooking.mess]) {
      expect(STRINGS.foods[id as keyof typeof STRINGS.foods]).toBeTruthy();
      expect(ITEM_ICONS[id]).toBeTruthy();
    }
  });

  it('matches a mix in any order', () => {
    expect(matchRecipe(['riceBall', 'salmon'])?.id).toBe('salmonSushi');
    expect(matchRecipe(['salmon', 'riceBall'])?.id).toBe('salmonSushi');
    expect(matchRecipe(['lobster', 'shrimp', 'salmon'])?.id).toBe('seafoodPlatter');
  });

  it("doesn't match a mix with extra or missing food", () => {
    expect(matchRecipe(['salmon', 'salmon'])).toBeNull();
    expect(matchRecipe(['riceBall', 'salmon', 'cookie'])).toBeNull();
    expect(matchRecipe([])).toBeNull();
  });
});

describe('cooking', () => {
  it('uses up the ingredients and adds the dish', () => {
    const out = cook(withFood({ salmon: 2, warmMilk: 1 }), ['salmon', 'warmMilk']);
    expect(out.blocked).toBeUndefined();
    if (out.blocked) return;
    expect(out.dish).toBe('fishSoup');
    expect(out.state.inventory.food.salmon).toBe(1);
    expect(out.state.inventory.food.warmMilk).toBe(0);
    expect(out.state.inventory.food.fishSoup).toBe(1);
  });

  it('uses rice balls from the pantry like any other food', () => {
    const out = cook(withFood({ riceBall: 1, shrimp: 1 }), ['riceBall', 'shrimp']);
    if (out.blocked) throw new Error(out.blocked);
    expect(out.dish).toBe('shrimpOnigiri');
    expect(foodCount(out.state, 'riceBall')).toBe(0);
  });

  it('learns a recipe the first time, and only once', () => {
    const first = cook(withFood({ shrimp: 2 }), ['shrimp']);
    if (first.blocked) throw new Error(first.blocked);
    expect(first.discovered).toBe(true);
    expect(first.state.recipesFound).toEqual(['grilledShrimp']);
    const again = cook(first.state, ['shrimp']);
    if (again.blocked) throw new Error(again.blocked);
    expect(again.discovered).toBe(false);
    expect(again.state.recipesFound).toEqual(['grilledShrimp']);
    expect(again.state.inventory.food.grilledShrimp).toBe(2);
  });

  it('makes a Mushy mess from a mix that is no recipe, and learns nothing', () => {
    const out = cook(withFood({ cookie: 1, salmon: 1 }), ['cookie', 'salmon']);
    if (out.blocked) throw new Error(out.blocked);
    expect(out.dish).toBe('mushyMess');
    expect(out.recipe).toBeNull();
    expect(out.discovered).toBe(false);
    expect(out.state.recipesFound).toEqual([]);
    expect(out.state.inventory.food.cookie).toBe(0);
  });

  it('a Mushy mess is worse than a free rice ball', () => {
    expect(food('mushyMess').hunger).toBeLessThan(food('riceBall').hunger);
  });

  it('refuses an empty pot, too much food, food you lack, or dishes', () => {
    const s = withFood({ shrimp: 1, salmon: 1, lobster: 1, cookie: 1, grilledShrimp: 1 });
    expect(cook(s, []).blocked).toBe('emptyPot');
    expect(cook(s, ['shrimp', 'salmon', 'lobster', 'cookie']).blocked).toBe('tooMany');
    expect(cook(s, ['shrimp', 'shrimp']).blocked).toBe('noFood');
    expect(cook(s, ['grilledShrimp']).blocked).toBe('notIngredient');
    expect(cook(s, ['shrimp', 'shrimp']).state).toBe(s);
  });

  it('counts what you have for each ingredient of a recipe', () => {
    const s = withFood({ cookie: 1, strawberry: 0 });
    const shortcake = RECIPES.find((r) => r.id === 'berryShortcake')!;
    expect(ingredientsFor(s, shortcake)).toEqual([
      { id: 'cookie', need: 1, have: 1 },
      { id: 'strawberry', need: 1, have: 0 },
      { id: 'warmMilk', need: 1, have: 0 },
    ]);
    expect(haveAll(s, shortcake.ingredients)).toBe(false);
    expect(haveAll(s, ['cookie'])).toBe(true);
    expect(haveAll(s, ['cookie', 'riceBall'])).toBe(false);
  });
});

describe('the kitchen', () => {
  const fake = (more: Partial<Recipe>): Recipe => ({ id: 'grilledShrimp', ingredients: ['shrimp'], ...more });
  const day = (m: number, d: number) => new Date(2026, m - 1, d, 12).getTime();

  it('starts with just the pot', () => {
    const s = withFood({});
    expect(s.kitchen).toEqual([]);
    expect(hasStation(s, 'pot')).toBe(true);
    expect(hasStation(s, 'oven')).toBe(false);
    expect(potSlots(s)).toBe(CONFIG.cooking.slots);
  });

  it('the bigger pot takes one more food', () => {
    const s = { ...withFood({ shrimp: 1, salmon: 1, lobster: 1, cookie: 1 }), kitchen: ['biggerPot'] };
    expect(potSlots(s)).toBe(4);
    // Four foods that are no recipe make a Mushy mess instead of being refused.
    const out = cook(s, ['shrimp', 'salmon', 'lobster', 'cookie']);
    if (out.blocked) throw new Error(out.blocked);
    expect(out.dish).toBe('mushyMess');
  });

  it('only matches recipes made at the station you cook at', () => {
    expect(matchRecipe(['shrimp'], 'pot')?.id).toBe('grilledShrimp');
    expect(matchRecipe(['shrimp'], 'oven')).toBeNull();
    expect(couldBeRecipe(['shrimp'], 'oven')).toBe(false);
  });

  it('a recipe needs its station', () => {
    const s = withFood({});
    expect(recipeOpen(s, fake({}))).toBe(true);
    expect(recipeOpen(s, fake({ station: 'oven' }))).toBe(false);
    expect(recipeOpen({ ...s, kitchen: ['oven'] }, fake({ station: 'oven' }))).toBe(true);
  });

  it('a seasonal recipe is only open in its window, which can wrap round the new year', () => {
    const spring = fake({ unlock: { from: '03-20', to: '04-10' } });
    expect(inSeason(spring, day(3, 20))).toBe(true);
    expect(inSeason(spring, day(4, 10))).toBe(true);
    expect(inSeason(spring, day(4, 11))).toBe(false);
    const winter = fake({ unlock: { from: '12-15', to: '01-05' } });
    expect(inSeason(winter, day(12, 31))).toBe(true);
    expect(inSeason(winter, day(1, 5))).toBe(true);
    expect(inSeason(winter, day(2, 1))).toBe(false);
  });

  it('seasonal recipes are left out of the count', () => {
    expect(COUNTED_RECIPES.every((r) => !r.unlock)).toBe(true);
    expect(COUNTED_RECIPES.length).toBe(RECIPES.filter((r) => !r.unlock).length);
  });

  it('a recipe makes its own number, and Second helping adds one', () => {
    const s = withFood({});
    expect(portions(s, fake({}), 1)).toBe(1);
    expect(portions(s, fake({ makes: 2 }), 1)).toBe(2);
    const skilled = { ...s, keeper: { ...s.keeper, skills: { secondHelping: 1 } } };
    expect(portions(skilled, fake({ makes: 2 }), 0)).toBe(3);
  });
});
