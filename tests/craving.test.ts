import { describe, expect, it } from 'vitest';
import { CONFIG } from '../src/game/config';
import { cravingPool, cravingTip, pickCraving, satisfyCraving, stepCraving } from '../src/game/craving';
import { feed } from '../src/game/actions';
import { simulate } from '../src/game/simulate';
import type { GameState } from '../src/game/state';
import { newTeen } from './helpers';

const HOUR = 3_600_000;
const START = new Date(2026, 0, 1, 10, 0).getTime(); // 10am: awake and daytime
const C = CONFIG.craving;

const flat = (s: GameState) => cravingPool(s).flat();

describe('Cravings', () => {
  it('never craves the free rice ball, a Mushy mess, or things you have never had', () => {
    const s = newTeen(START);
    s.inventory.food = { mushyMess: 2, salmon: 1 }; // salmon from nowhere doesn't count as caught
    expect(flat(s)).toEqual(['strawberry', 'warmMilk', 'cookie']); // Shop treats only
  });

  it('craves anything you have caught, grown or cooked, even with none in the pantry', () => {
    const s = newTeen(START);
    s.caught = ['shrimp', 'lobster'];
    s.grown = ['dragonFruit'];
    s.recipesFound = ['salmonSushi', 'mushyMess'];
    s.inventory.food = {};
    expect(cravingPool(s)).toEqual([
      ['strawberry', 'warmMilk', 'cookie'],
      ['shrimp', 'lobster'],
      ['dragonFruit'],
      ['salmonSushi'],
    ]);
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
    expect(result.craved).toBe(C.reward.gold[0]); // a Shop cookie: the smallest tip
    expect(result.state.gold).toBe(s.gold + C.reward.gold[0]);
    expect(result.state.pet.stats.happiness).toBe(plain.state.pet.stats.happiness + C.reward.happiness);
    expect(result.state.pet.careScore).toBeCloseTo(plain.state.pet.careScore + C.reward.care);
    expect(result.state.craving.food).toBeNull();
    expect(result.state.craving.nextAt).toBe(START + C.nextAfterHours * HOUR);
  });

  it('gives a bigger tip for rarer food', () => {
    expect(cravingTip('cookie')).toBe(C.reward.gold[0]);
    expect(cravingTip('shrimp')).toBe(C.reward.gold[1]);
    expect(cravingTip('pumpkinSoup')).toBe(C.reward.gold[2]);
    expect(cravingTip('lobster')).toBe(C.reward.gold[3]);
    expect(C.reward.gold[3]).toBeGreaterThan(C.reward.gold[1]);
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
