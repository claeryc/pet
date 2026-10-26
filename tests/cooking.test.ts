import { describe, expect, it } from 'vitest';
import { CONFIG } from '../src/game/config';
import type { Food } from '../src/game/actions';
import { foodCount } from '../src/game/economy';
import { cook, haveAll, ingredientsFor, INGREDIENTS, matchRecipe, RECIPES } from '../src/game/cooking';
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
      expect(food(r.id).cookedOnly).toBe(true);
      expect(r.ingredients.length).toBeGreaterThan(0);
      expect(r.ingredients.length).toBeLessThanOrEqual(CONFIG.cooking.slots);
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
