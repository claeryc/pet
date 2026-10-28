import { describe, expect, it } from 'vitest';
import { CONFIG } from '../src/game/config';
import type { Food } from '../src/game/actions';
import { foodCount } from '../src/game/economy';
import {
  cook, ingredientsAt, isPrep, buyKitchen, maxBatch, recipeNeeds, stationSlots, COUNTED_RECIPES, couldBeRecipe, hasStation, haveAll, ingredientsFor, INGREDIENTS, inSeason, matchRecipe,
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
  // Dishes, not the fillets and tails the cutting board makes.
  const DISHES = RECIPES.filter((r) => !isPrep(stationOf(r)));

  it('every recipe makes a cooked dish (or a prepped food) from real ingredients', () => {
    for (const r of RECIPES) {
      expect(food(r.id).source, r.id).toBe(isPrep(stationOf(r)) ? 'prepped' : 'cooked');
      expect(r.ingredients.length).toBeGreaterThan(0);
      expect(r.ingredients.length).toBeLessThanOrEqual(MAX_POT_SLOTS);
      for (const id of r.ingredients) expect(ingredientsAt(stationOf(r))).toContain(id);
    }
  });

  it('no two recipes at a station use the same mix', () => {
    const keys = RECIPES.map((r) => `${stationOf(r)}:${[...r.ingredients].sort().join(',')}`);
    expect(new Set(keys).size).toBe(keys.length);
  });

  it('a prepped food is worth exactly what it was cut from', () => {
    for (const r of RECIPES.filter((x) => isPrep(stationOf(x)))) {
      const from = food(r.ingredients[0]);
      const made = food(r.id);
      expect(r.ingredients.length).toBe(1);
      expect([made.price, made.hunger, made.happiness, made.health], r.id).toEqual([from.price, from.hunger, from.happiness, from.health]);
    }
  });

  it('every dish is worth more than eating its ingredients one by one', () => {
    for (const r of DISHES) {
      const raw = r.ingredients.map(food);
      const sum = (k: 'hunger' | 'happiness' | 'health') => raw.reduce((t, f) => t + f[k], 0);
      const dish = food(r.id);
      expect(dish.hunger + dish.happiness + dish.health).toBeGreaterThan(sum('hunger') + sum('happiness') + sum('health'));
    }
  });

  it('every dish is worth more gold than its ingredients', () => {
    for (const r of DISHES) {
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
    expect(matchRecipe(['riceBall', 'salmonFillet'])?.id).toBe('salmonSushi');
    expect(matchRecipe(['salmonFillet', 'riceBall'])?.id).toBe('salmonSushi');
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

describe('the cutting board', () => {
  it('every kitchen has one, and it takes one fish', () => {
    const s = withFood({});
    expect(hasStation(s, 'board')).toBe(true);
    expect(stationSlots(s, 'board')).toBe(1);
    expect(ingredientsAt('board')).toEqual(['salmon', 'lobster']);
  });

  it('cuts a salmon into a fillet, with no Mushy mess and no dish counted', () => {
    const s = withFood({ salmon: 2 });
    const out = cook(s, ['salmon'], 0, { station: 'board' });
    if (out.blocked) throw new Error(out.blocked);
    expect(out.dish).toBe('salmonFillet');
    expect(out.count).toBe(1); // Second helping never applies to cutting
    expect(out.state.inventory.food).toMatchObject({ salmon: 1, salmonFillet: 1 });
    expect(out.state.tally.dishes ?? 0).toBe(0);
    expect(out.state.keeper.xp).toBe(s.keeper.xp);
  });

  it('a perfect cut gives a little Keeper XP', () => {
    const s = withFood({ lobster: 1 });
    const out = cook(s, ['lobster'], 1, { station: 'board', perfect: true });
    if (out.blocked) throw new Error(out.blocked);
    expect(out.dish).toBe('lobsterTail');
    expect(out.state.keeper.xp).toBe(s.keeper.xp + CONFIG.cooking.cutting.perfectXp);
  });

  it("won't cut food that isn't for the board", () => {
    const s = withFood({ shrimp: 1, carrot: 1 });
    expect(cook(s, ['shrimp'], 1, { station: 'board' }).blocked).toBe('notIngredient');
    expect(cook(withFood({ salmon: 2 }), ['salmon', 'salmon'], 1, { station: 'board' }).blocked).toBe('tooMany');
  });

  it('salmon sushi now needs a fillet, so a whole salmon makes a mess', () => {
    const out = cook(withFood({ riceBall: 1, salmon: 1 }), ['riceBall', 'salmon']);
    if (out.blocked) throw new Error(out.blocked);
    expect(out.dish).toBe('mushyMess');
  });
});

describe('the bigger pot', () => {
  const chowder = RECIPES.find((r) => r.id === 'seafoodChowder')!;
  const stock = { shrimp: 1, salmon: 1, lobster: 1, warmMilk: 1 };

  it('four-ingredient recipes need it', () => {
    const s = withFood(stock);
    expect(recipeNeeds(s, chowder)).toBe('biggerPot');
    expect(cook(s, chowder.ingredients).blocked).toBe('tooMany');
    const big = { ...s, kitchen: ['biggerPot'] };
    expect(recipeNeeds(big, chowder)).toBeNull();
    const out = cook(big, chowder.ingredients);
    if (out.blocked) throw new Error(out.blocked);
    expect(out.dish).toBe('seafoodChowder');
  });

  it('a four-ingredient dish pays better than any three-ingredient one', () => {
    const gain = (r: Recipe) => food(r.id).price / r.ingredients.reduce((t, id) => t + food(id).price, 0);
    const four = RECIPES.filter((r) => r.ingredients.length === 4).map(gain);
    const three = RECIPES.filter((r) => r.ingredients.length === 3).map(gain);
    expect(four.length).toBeGreaterThan(0);
    expect(Math.min(...four)).toBeGreaterThan(Math.max(...three));
  });
});

describe('double batch', () => {
  it('needs buying, and only works on the pot', () => {
    const s = withFood({ salmon: 2, warmMilk: 2 });
    expect(maxBatch(s, 'pot')).toBe(1);
    expect(cook(s, ['salmon', 'warmMilk'], 1, { batch: 2 }).blocked).toBe('noBatch');
    const owned = { ...s, kitchen: ['doubleBatch'] };
    expect(maxBatch(owned, 'pot')).toBe(2);
    expect(maxBatch(owned, 'board')).toBe(1);
  });

  it('uses two of everything and makes two, rolling Second helping for each', () => {
    const s = { ...withFood({ salmon: 2, warmMilk: 2 }), kitchen: ['doubleBatch'] };
    const out = cook(s, ['salmon', 'warmMilk'], [1, 1], { batch: 2 });
    if (out.blocked) throw new Error(out.blocked);
    expect(out.count).toBe(2);
    expect(out.state.inventory.food).toMatchObject({ salmon: 0, warmMilk: 0, fishSoup: 2 });
    const skilled = { ...s, keeper: { ...s.keeper, skills: { secondHelping: 1 } } };
    const lucky = cook(skilled, ['salmon', 'warmMilk'], [0, 1], { batch: 2 });
    if (lucky.blocked) throw new Error(lucky.blocked);
    expect(lucky.count).toBe(3);
  });

  it("refuses two batches when there's only enough for one", () => {
    const s = { ...withFood({ salmon: 1, warmMilk: 2 }), kitchen: ['doubleBatch'] };
    expect(cook(s, ['salmon', 'warmMilk'], 1, { batch: 2 }).blocked).toBe('noFood');
  });
});

describe('buying for the kitchen', () => {
  it('costs gold, once', () => {
    const s = { ...withFood({}), gold: 1000 };
    const out = buyKitchen(s, 'biggerPot');
    expect(out.blocked).toBeUndefined();
    expect(out.state.gold).toBe(1000 - CONFIG.cooking.kitchen.biggerPot.price);
    expect(out.state.kitchen).toEqual(['biggerPot']);
    expect(buyKitchen(out.state, 'biggerPot').blocked).toBe('alreadyOwned');
    expect(buyKitchen({ ...s, gold: 10 }, 'doubleBatch').blocked).toBe('notEnoughGold');
  });

  it("doesn't sell what has no price yet", () => {
    const s = { ...withFood({}), gold: 5000 };
    expect(buyKitchen(s, 'oven').state).toBe(s);
  });
});

describe('prepped food', () => {
  it('is never a favourite food', async () => {
    const { FAVOURITE_FOODS } = await import('../src/game/likes');
    expect(FAVOURITE_FOODS).not.toContain('salmonFillet');
    expect(FAVOURITE_FOODS).not.toContain('lobsterTail');
  });
});
