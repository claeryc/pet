import { describe, expect, it } from 'vitest';
import { CONFIG } from '../src/game/config';
import type { Food } from '../src/game/actions';
import { foodCount, buyGardenItem } from '../src/game/economy';
import { simulate } from '../src/game/simulate';
import { cook, couldBeRecipe } from '../src/game/cooking';
import {
  addSeed,
  clearPlot,
  compost,
  cure,
  diesAt,
  fertilize,
  fertilizerReady,
  findSeed,
  growPlot,
  harvest,
  moisture,
  needsTending,
  pickSeed,
  plant,
  plotStage,
  rollFor,
  seedCount,
  supplyCount,
  timeLeft,
  water,
} from '../src/game/garden';
import { migrate, SAVE_VERSION } from '../src/storage/storage';
import { STRINGS } from '../src/strings';
import { ITEM_ICONS } from '../src/ui/icons';
import type { GameState } from '../src/game/state';
import { newTeen } from './helpers';
import { collectPoop, poopCount, poopNow } from '../src/game/hygiene';

const START = new Date(2026, 0, 1, 10, 0).getTime();
const HOUR = 3_600_000;
const G = CONFIG.garden;

// Luck values whose first sickness roll always passes or always fails,
// found by trying, so the tests don't depend on Math.random().
const findLuck = (test: (r: number) => boolean) => {
  for (let i = 1; i < 1000; i++) if (test(rollFor(i / 1000, 0))) return i / 1000;
  throw new Error('no luck found');
};
const HEALTHY_LUCK = findLuck((r) => r >= G.sickChance); // never sick on the first roll
const SICK_LUCK = findLuck((r) => r < G.sickChanceFertilized); // sick even when fertilized

function withSeeds(seeds: Record<string, number> = { carrot: 1, pumpkin: 1, dragonFruit: 1 }): GameState {
  const s = newTeen(START);
  s.inventory.seeds = { ...seeds };
  return s;
}

// Plants a carrot in pot 0 and waters it, at START.
function wateredCarrot(luck = HEALTHY_LUCK): GameState {
  let s = plant(withSeeds(), 0, 'carrot', START, luck).state;
  s = water(s, 0, START, false, luck).state;
  return s;
}

describe('crops', () => {
  it('grow in 16, 32 and 48 hours and are 1, 2 and 3 stars', () => {
    expect(G.crops.map((c) => [c.id, c.hours])).toEqual([['carrot', 16], ['pumpkin', 32], ['dragonFruit', 48]]);
    const stars = (id: string) => (CONFIG.foods as readonly Food[]).find((f) => f.id === id)!.stars;
    expect(G.crops.map((c) => stars(c.id))).toEqual([1, 2, 3]);
  });

  it('are grown, not sold, and only carrot seeds are in the Shop', () => {
    for (const c of G.crops) {
      const food = (CONFIG.foods as readonly Food[]).find((f) => f.id === c.id)!;
      expect(food.source).toBe('grown');
    }
    expect(G.crops.filter((c) => c.seedPrice > 0).map((c) => c.id)).toEqual(['carrot']);
  });

  it('each crop and fish goes into at least two recipes', () => {
    for (const id of ['carrot', 'pumpkin', 'dragonFruit', 'shrimp', 'salmon', 'lobster']) {
      const uses = CONFIG.cooking.recipes.filter((r) => (r.ingredients as readonly string[]).includes(id));
      expect(uses.length, id).toBeGreaterThanOrEqual(2);
    }
  });

  it('everything new has a name and an icon', () => {
    for (const c of G.crops) {
      expect(STRINGS.foods[c.id]).toBeTruthy();
      expect(ITEM_ICONS[c.id]).toBeTruthy();
      expect(ITEM_ICONS[`seed_${c.id}`]).toBeTruthy();
    }
    for (const id of ['garden', 'fertilizer', 'plantCure', 'plantSprout', 'plantGrowing', 'plantSick', 'plantDead', 'poop', 'homemadeFertilizer']) {
      expect(ITEM_ICONS[id], id).toBeTruthy();
    }
  });
});

describe('planting', () => {
  it('uses a seed and starts with dry soil', () => {
    const r = plant(withSeeds({ carrot: 2 }), 1, 'carrot', START, 0.5);
    expect(r.blocked).toBeUndefined();
    expect(seedCount(r.state, 'carrot')).toBe(1);
    expect(plotStage(r.state.garden[1])).toBe('growing');
    expect(moisture(r.state.garden[1], START)).toBe(0);
  });

  it("needs a seed and an empty pot", () => {
    expect(plant(withSeeds({}), 0, 'carrot', START, 0.5).blocked).toBe('noSeed');
    const s = plant(withSeeds({ carrot: 2 }), 0, 'carrot', START, 0.5).state;
    expect(plant(s, 0, 'carrot', START, 0.5).blocked).toBe('notEmpty');
    expect(plant(s, 7, 'carrot', START, 0.5).blocked).toBe('noPlot');
  });
});

describe('growing', () => {
  it('a watered carrot is ready after 16 hours', () => {
    let s = wateredCarrot();
    // Keep it watered so it never gets sick.
    for (let h = 7; h < 16; h += 7) s = water(simulate(s, START + h * HOUR), 0, START + h * HOUR, false, HEALTHY_LUCK).state;
    expect(plotStage(simulate(s, START + 15.5 * HOUR).garden[0])).toBe('growing');
    expect(plotStage(simulate(s, START + 16 * HOUR).garden[0])).toBe('ready');
  });

  it('keeps growing while the game is closed', () => {
    const s = wateredCarrot();
    const later = simulate(s, START + 4 * HOUR);
    expect(timeLeft(later.garden[0], START + 4 * HOUR)).toBeCloseTo(12 * HOUR, -3);
  });

  it('soil stays moist for 8 hours, 10% longer after a perfect pour', () => {
    const s = plant(withSeeds(), 0, 'carrot', START, 0.5).state;
    const normal = water(s, 0, START, false, 0.5).state.garden[0];
    const perfect = water(s, 0, START, true, 0.5).state.garden[0];
    expect(normal.moistUntil - START).toBe(8 * HOUR);
    expect(perfect.moistUntil - START).toBeCloseTo(8.8 * HOUR);
    expect(moisture(normal, START + 4 * HOUR)).toBeCloseTo(0.5);
  });

  it('fertilizer makes it grow 25% faster for 6 hours, once at a time', () => {
    let s = wateredCarrot();
    s.inventory.supplies = { fertilizer: 2 };
    s = fertilize(s, 0, START).state;
    expect(supplyCount(s, 'fertilizer')).toBe(1);
    expect(fertilize(s, 0, START + HOUR).blocked).toBe('alreadyFertilized');
    const plot = growPlot(s.garden[0], START, START + 6 * HOUR);
    expect(plot.growth).toBeCloseTo(7.5 * HOUR);
    expect(fertilize(wateredCarrot(), 0, START).blocked).toBe('noFertilizer');
  });

  it('picked-up poop makes fertilizer, 3 to a bag', () => {
    let s = wateredCarrot();
    s.inventory.supplies = {};
    // Three poops on the floor, picked up one by one, are kept.
    for (let i = 0; i < 3; i++) s = poopNow(s, START);
    for (const slot of [0, 1, 2]) s = collectPoop(s, s.pet.id, slot);
    expect(poopCount(s)).toBe(G.poopPerFertilizer);
    expect(fertilizerReady(s)).toBe(1);
    const made = compost(s).state;
    expect(poopCount(made)).toBe(0);
    expect(supplyCount(made, 'fertilizer')).toBe(1);
    expect(compost(made).blocked).toBe('notEnoughPoop');
  });

  it('Fertilize makes a bag from poop when you are out', () => {
    let s = wateredCarrot();
    s.inventory.supplies = { poop: 4 };
    const r = fertilize(s, 0, START);
    expect(r.composted).toBe(true);
    expect(poopCount(r.state)).toBe(1);
    expect(supplyCount(r.state, 'fertilizer')).toBe(0);
    expect(r.state.garden[0].fertilizedUntil).toBe(START + G.fertilizer.hours * HOUR);
    // A bought bag is used first, and the poop is kept.
    s.inventory.supplies = { poop: 4, fertilizer: 1 };
    const bought = fertilize(s, 0, START);
    expect(bought.composted).toBe(false);
    expect(poopCount(bought.state)).toBe(4);
    // Not enough poop is the same as no fertilizer.
    s.inventory.supplies = { poop: 2 };
    expect(fertilize(s, 0, START).blocked).toBe('noFertilizer');
  });

  // Finishing while fertilized used to leave some plants a hair short of
  // ready, stuck at "1h" for good.
  it('a plant that finishes while fertilized is ready, whatever the timing', () => {
    const base = { ...wateredCarrot().garden[0], moistUntil: START + 100 * HOUR, rollsFrom: START + 100 * HOUR };
    for (let k = 0; k < 200; k++) {
      const t = START + k * 7919;
      const growth = 16 * HOUR - HOUR - k * 0.25 - 1;
      const plot = growPlot({ ...base, growth, fertilizedUntil: t + 6 * HOUR }, t, t + 6 * HOUR);
      expect(plotStage(plot)).toBe('ready');
    }
  });

  it('a plant already left a hair short of ready finishes', () => {
    const plot = { ...wateredCarrot().garden[0], growth: 16 * HOUR - 0.0001, moistUntil: START + 9 * HOUR };
    expect(plotStage(growPlot(plot, START + HOUR, START + 2 * HOUR))).toBe('ready');
  });
});

describe('getting sick', () => {
  it('a dry plant may get sick after 6 dry hours, and stops growing', () => {
    const s = wateredCarrot(SICK_LUCK); // moist until +8h, first roll at +14h
    expect(plotStage(simulate(s, START + 13.9 * HOUR).garden[0])).toBe('growing');
    const sick = simulate(s, START + 14 * HOUR).garden[0];
    expect(plotStage(sick)).toBe('sick');
    expect(sick.sickSince).toBe(START + 14 * HOUR);
    // No more growing while sick.
    const later = simulate(s, START + 20 * HOUR).garden[0];
    expect(later.growth).toBeCloseTo(14 * HOUR);
  });

  it('a lucky plant stays healthy on that roll', () => {
    const s = wateredCarrot(HEALTHY_LUCK);
    const plot = simulate(s, START + 14 * HOUR).garden[0];
    expect(plotStage(plot)).toBe('growing');
    expect(plot.rolls).toBe(1);
  });

  it('a plant kept watered never gets sick', () => {
    let s = wateredCarrot(SICK_LUCK);
    for (let h = 8; h < 16; h += 8) s = water(simulate(s, START + h * HOUR), 0, START + h * HOUR, false, SICK_LUCK).state;
    expect(plotStage(simulate(s, START + 16 * HOUR).garden[0])).toBe('ready');
  });

  it('is less likely to get sick while fertilized', () => {
    // A luck whose first roll lands between the two chances.
    const between = findLuck((r) => r >= G.sickChanceFertilized && r < G.sickChance);
    const plain = plant(withSeeds(), 0, 'carrot', START, between).state;
    const fed = { ...plain, inventory: { ...plain.inventory, supplies: { fertilizer: 1 } } };
    // Planted dry: the first roll is at +6h, while fertilizer (from +1h) still works.
    const fertilized = fertilize(fed, 0, START + HOUR).state;
    expect(plotStage(simulate(plain, START + 6 * HOUR).garden[0])).toBe('sick');
    expect(plotStage(simulate(fertilized, START + 6 * HOUR).garden[0])).toBe('growing');
  });

  it('cure heals it, and it carries on growing', () => {
    let s = simulate(wateredCarrot(SICK_LUCK), START + 15 * HOUR);
    s.inventory.supplies = { plantCure: 1 };
    expect(fertilize(s, 0, START + 15 * HOUR).blocked).toBe('notGrowing');
    const r = cure(s, 0, START + 15 * HOUR);
    expect(r.blocked).toBeUndefined();
    expect(supplyCount(r.state, 'plantCure')).toBe(0);
    expect(plotStage(r.state.garden[0])).toBe('growing');
    // The next roll is a full 6 hours away, so watering now keeps it safe.
    const watered = water(r.state, 0, START + 15 * HOUR, false, HEALTHY_LUCK).state;
    expect(plotStage(simulate(watered, START + 17 * HOUR).garden[0])).toBe('ready');
    expect(cure(watered, 0, START + 15 * HOUR).blocked).toBe('notSick');
  });

  it('needs plant cure to cure', () => {
    const s = simulate(wateredCarrot(SICK_LUCK), START + 15 * HOUR);
    expect(cure(s, 0, START + 15 * HOUR).blocked).toBe('noCure');
  });

  it('dies after 3 days sick, and can be cleared', () => {
    const s = wateredCarrot(SICK_LUCK);
    const sickAt = START + 14 * HOUR;
    expect(diesAt(simulate(s, sickAt).garden[0])).toBe(sickAt + 72 * HOUR);
    expect(plotStage(simulate(s, sickAt + 71 * HOUR).garden[0])).toBe('sick');
    const dead = simulate(s, sickAt + 72 * HOUR);
    expect(plotStage(dead.garden[0])).toBe('dead');
    expect(water(dead, 0, sickAt + 72 * HOUR, false, 0.5).blocked).toBe('nothingToWater');
    const cleared = clearPlot(dead, 0);
    expect(plotStage(cleared.state.garden[0])).toBe('empty');
    expect(clearPlot(cleared.state, 0).blocked).toBe('notDead');
  });

  it('turns out the same however often the game catches up', () => {
    const s = wateredCarrot(0.123);
    let stepped = s;
    for (let h = 1; h <= 60; h++) stepped = simulate(stepped, START + h * HOUR);
    const once = simulate(s, START + 60 * HOUR);
    expect(stepped.garden[0].sickSince).toBe(once.garden[0].sickSince);
    expect(stepped.garden[0].growth).toBeCloseTo(once.garden[0].growth, -2);
  });
});

describe('harvesting', () => {
  it('puts the crop in the inventory and empties the pot', () => {
    let s = wateredCarrot();
    for (let h = 7; h < 16; h += 7) s = water(simulate(s, START + h * HOUR), 0, START + h * HOUR, false, HEALTHY_LUCK).state;
    expect(harvest(s, 0).blocked).toBe('notReady');
    s = simulate(s, START + 16 * HOUR);
    const r = harvest(s, 0);
    expect(r.crop).toBe('carrot');
    expect(foodCount(r.state, 'carrot')).toBe(3);
    expect(plotStage(r.state.garden[0])).toBe('empty');
  });
});

describe('the drop on Play', () => {
  it('shows for a dry, sick or ready pot, not a wet growing one or an empty garden', () => {
    expect(needsTending(withSeeds().garden, START)).toBe(false);
    const s = wateredCarrot();
    expect(needsTending(s.garden, START)).toBe(false);
    // Dry once the 8 hours are up.
    expect(needsTending(s.garden, START + 8 * HOUR)).toBe(true);
    expect(needsTending([{ ...s.garden[0], sickSince: START }], START)).toBe(true);
    expect(needsTending([{ ...s.garden[0], growth: 16 * HOUR }], START)).toBe(true);
    // A dead plant isn't something to tend.
    expect(needsTending([{ ...s.garden[0], dead: true, moistUntil: 0 }], START)).toBe(false);
  });
});

describe('seeds', () => {
  it('are found by luck: 3% per fish, 1% per cuddle', () => {
    const s = newTeen(START);
    expect(findSeed(s, 'fishing', 0.029, 0).seed).toBe('carrot');
    expect(findSeed(s, 'fishing', 0.03, 0).seed).toBeNull();
    expect(findSeed(s, 'play', 0.009, 0.99).seed).toBe('dragonFruit');
    expect(findSeed(s, 'play', 0.01, 0).seed).toBeNull();
    expect(seedCount(findSeed(s, 'play', 0, 0).state, 'carrot')).toBe(1);
  });

  it('rarer seeds are less likely, and more likely after a perfect catch', () => {
    expect(pickSeed(0.55)).toBe('carrot');
    expect(pickSeed(0.75)).toBe('pumpkin');
    expect(pickSeed(0.95)).toBe('dragonFruit');
    expect(pickSeed(0.55, true)).toBe('pumpkin');
    expect(pickSeed(0.85, true)).toBe('dragonFruit');
  });

  it('carrot seeds, fertilizer and plant cure are sold in the Shop', () => {
    let s = newTeen(START);
    s = buyGardenItem(s, { kind: 'seed', id: 'carrot' }).state;
    s = buyGardenItem(s, { kind: 'supply', id: 'fertilizer' }).state;
    s = buyGardenItem(s, { kind: 'supply', id: 'plantCure' }).state;
    expect(s.gold).toBe(CONFIG.economy.startingGold - 10 - 15 - 20);
    expect(seedCount(s, 'carrot')).toBe(1);
    expect(supplyCount(s, 'fertilizer')).toBe(1);
    // Pumpkin seeds can't be bought.
    expect(buyGardenItem(s, { kind: 'seed', id: 'pumpkin' }).state).toBe(s);
    const broke = { ...s, gold: 0 };
    expect(buyGardenItem(broke, { kind: 'seed', id: 'carrot' }).blocked).toBe('notEnoughGold');
  });

  it('addSeed stacks', () => {
    expect(seedCount(addSeed(addSeed(newTeen(START), 'pumpkin'), 'pumpkin', 2), 'pumpkin')).toBe(3);
  });
});

describe('less mushy mess', () => {
  it("one food on its own isn't cooked unless it's a recipe by itself", () => {
    const s = newTeen(START);
    s.inventory.food = { strawberry: 1, shrimp: 1 };
    expect(cook(s, ['strawberry']).blocked).toBe('needMore');
    expect(cook(s, ['shrimp']).blocked).toBeUndefined();
  });

  it('knows when a mix can still become a recipe', () => {
    expect(couldBeRecipe(['carrot'])).toBe(true);
    expect(couldBeRecipe(['carrot', 'pumpkin'])).toBe(true); // hearty stew needs salmon too
    expect(couldBeRecipe(['carrot', 'lobster'])).toBe(true); // lobster fried rice needs rice too
    expect(couldBeRecipe(['carrot', 'dragonFruit'])).toBe(false);
    expect(couldBeRecipe(['shrimp', 'shrimp'])).toBe(false);
  });

  it('hearty stew is cooked now, not bought', () => {
    const stew = (CONFIG.foods as readonly Food[]).find((f) => f.id === 'heartyStew')!;
    expect(stew.source).toBe('cooked');
    const s = newTeen(START);
    s.inventory.food = { carrot: 1, pumpkin: 1, salmon: 1 };
    const r = cook(s, ['salmon', 'carrot', 'pumpkin']);
    expect(r.blocked).toBeUndefined();
    expect(!r.blocked && r.dish).toBe('heartyStew');
  });
});

describe('save version 10', () => {
  it('gives older saves an empty garden', () => {
    const out = migrate({ version: 9, state: { pet: { stage: 'teen' }, inventory: { food: { cookie: 2 }, hats: [] } } });
    expect(out.version).toBe(SAVE_VERSION);
    expect(out.state.garden).toHaveLength(G.plots);
    expect(out.state.inventory).toEqual({ food: { cookie: 2, riceBall: 3 }, hats: [], seeds: {}, supplies: {}, decor: [], bags: [] });
  });
});

describe('the garden room', () => {
  it('tapping a pot in the room picks it', async () => {
    const { potAt } = await import('../src/render/garden');
    expect(potAt(35, 38, 3)).toBe(0);
    expect(potAt(46, 30, 3)).toBe(1);
    expect(potAt(57, 44, 3)).toBe(2);
    expect(potAt(14, 38, 3)).toBe(-1); // the pet
    expect(potAt(46, 5, 3)).toBe(-1); // the sky
  });

  it('two pots stand a little further apart', async () => {
    const { potAt } = await import('../src/render/garden');
    expect([40, 53].map((x) => potAt(x, 38, 2))).toEqual([0, 1]);
    expect(potAt(14, 38, 2)).toBe(-1);
  });
});
