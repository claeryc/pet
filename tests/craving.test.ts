import { describe, expect, it } from 'vitest';
import { CONFIG } from '../src/game/config';
import { cravingPool, gettable, pickCraving, satisfyCraving, stepCraving } from '../src/game/craving';
import { feed } from '../src/game/actions';
import { simulate } from '../src/game/simulate';
import { growMs } from '../src/game/garden';
import type { GameState } from '../src/game/state';
import { newTeen } from './helpers';

const HOUR = 3_600_000;
const START = new Date(2026, 0, 1, 10, 0).getTime(); // 10am: awake and daytime
const C = CONFIG.craving;

const flat = (s: GameState, now = START) => cravingPool(s, now).flat();

describe('Cravings', () => {
  it('never craves the free rice ball, a Mushy mess, or things you have never got', () => {
    const s = newTeen(START);
    s.inventory.food = { mushyMess: 2 };
    expect(flat(s)).toEqual(['strawberry', 'warmMilk', 'cookie']); // Shop treats only
  });

  it('craves fish you have caught, but a 3-star fish only if you have one', () => {
    const s = newTeen(START);
    s.caught = ['shrimp', 'lobster'];
    expect(flat(s)).toContain('shrimp');
    expect(flat(s)).not.toContain('lobster');
    s.inventory.food.lobster = 1;
    expect(flat(s)).toContain('lobster');
  });

  it('only craves a crop that is in the pantry or ripe before the craving passes', () => {
    const s = newTeen(START);
    s.grown = ['carrot', 'dragonFruit'];
    // A dragon fruit two days from ripe: not something to crave.
    s.garden[0] = { ...s.garden[0], crop: 'dragonFruit', growth: 0 };
    expect(flat(s)).not.toContain('dragonFruit');
    // Nearly ripe: ripe within the craving, so it's fair game.
    s.garden[0] = { ...s.garden[0], growth: growMs('dragonFruit') - HOUR };
    expect(flat(s)).toContain('dragonFruit');
    // A sick plant doesn't grow, so it doesn't count.
    s.garden[0] = { ...s.garden[0], sickSince: START };
    expect(flat(s)).not.toContain('dragonFruit');
    s.inventory.food.carrot = 1;
    expect(flat(s)).toContain('carrot');
  });

  it('craves a dish you have cooked only if you can get every ingredient', () => {
    const s = newTeen(START);
    s.recipesFound = ['salmonSushi', 'carrotSoup'];
    // Salmon sushi needs a salmon: not caught yet. Carrot soup needs a carrot: none.
    expect(flat(s)).not.toContain('salmonSushi');
    expect(flat(s)).not.toContain('carrotSoup');
    s.caught = ['salmon'];
    s.inventory.food.carrot = 1;
    expect(flat(s)).toContain('salmonSushi');
    expect(flat(s)).toContain('carrotSoup');
    // Having the dish itself is always enough.
    const t = newTeen(START);
    t.recipesFound = ['dragonFruitTart'];
    t.inventory.food.dragonFruitTart = 1;
    expect(gettable(t, 'dragonFruitTart', START, START)).toBe(true);
  });

  it('does not crave the same thing twice in a row', () => {
    const s = newTeen(START);
    s.craving.last = 'cookie';
    expect(flat(s)).not.toContain('cookie');
  });

  it('comes while awake in the daytime, passes after a while, then comes back', () => {
    let s = stepCraving(newTeen(START), START);
    const food = s.craving.food;
    expect(food).not.toBeNull();
    expect(s.craving.until).toBe(START + C.lastsHours * HOUR);
    // Still there an hour later.
    expect(stepCraving(s, START + HOUR).craving.food).toBe(food);
    // Passes, and the next one waits.
    s = stepCraving(s, START + C.lastsHours * HOUR);
    expect(s.craving.food).toBeNull();
    expect(s.craving.nextAt).toBe(START + (C.lastsHours + C.nextAfterHours) * HOUR);
    s = stepCraving(s, s.craving.nextAt);
    expect(s.craving.food).not.toBeNull();
    expect(s.craving.food).not.toBe(food);
  });

  it('does not start while the pet is an egg, asleep or it is night', () => {
    const egg = newTeen(START);
    egg.pet.stage = 'egg';
    expect(stepCraving(egg, START).craving.food).toBeNull();
    const asleep = newTeen(START);
    asleep.pet.asleep = true;
    expect(stepCraving(asleep, START).craving.food).toBeNull();
    const night = new Date(2026, 0, 1, 23, 0).getTime();
    expect(stepCraving(newTeen(night), night).craving.food).toBeNull();
  });

  it('runs inside simulate, like Percy', () => {
    const s = simulate(newTeen(START), START + 10 * 60_000);
    expect(s.craving.food).not.toBeNull();
  });

  it('feeding the craved food gives extra joy, Care and gold, and clears the bubble', () => {
    const s = newTeen(START);
    s.inventory.food = { cookie: 2 };
    s.pet.stats.happiness = 40;
    s.craving = { food: 'cookie', until: START + 6 * HOUR, nextAt: 0, last: 'cookie' };
    const plain = feed({ ...s, craving: { ...s.craving, food: 'strawberry' } }, START, 'cookie');
    expect(plain.craved).toBeUndefined();
    const result = feed(s, START, 'cookie');
    expect(result.craved).toBe(C.reward.gold);
    expect(result.state.gold).toBe(s.gold + C.reward.gold);
    expect(result.state.pet.stats.happiness).toBe(plain.state.pet.stats.happiness + C.reward.happiness);
    expect(result.state.pet.careScore).toBeCloseTo(plain.state.pet.careScore + C.reward.care);
    expect(result.state.craving.food).toBeNull();
    expect(result.state.craving.nextAt).toBe(START + C.nextAfterHours * HOUR);
  });

  it('satisfyCraving ignores other food', () => {
    const s = newTeen(START);
    s.craving = { food: 'cookie', until: START + HOUR, nextAt: 0, last: 'cookie' };
    expect(satisfyCraving(s, 'strawberry', START)).toEqual({ state: s, tip: 0 });
  });

  it('picks the same craving for the same moment', () => {
    const s = newTeen(START);
    s.caught = ['shrimp', 'salmon'];
    expect(pickCraving(s, START)).toBe(pickCraving(s, START));
  });
});
