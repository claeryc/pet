import { describe, expect, it } from 'vitest';
import { CONFIG } from '../src/game/config';
import { feed } from '../src/game/actions';
import { buyFood, buyHat, checkIn, earn, foodCount, HATS, wearHat } from '../src/game/economy';
import { createNewGame } from '../src/game/state';
import { newTeen } from './helpers';
import { simulate } from '../src/game/simulate';
import { migrate } from '../src/storage/storage';

const HOUR = 3_600_000;
const START = new Date(2026, 0, 1, 10, 0).getTime();
const rules = CONFIG.economy.checkIn;

describe('gold and the shop', () => {
  it('a new game starts with some gold and food', () => {
    const s = createNewGame(START);
    expect(s.gold).toBe(CONFIG.economy.startingGold);
    expect(foodCount(s, 'strawberry')).toBe(CONFIG.economy.startingFood.strawberry);
    expect(foodCount(s, 'riceBall')).toBe(CONFIG.riceJar.size);
  });

  it('buying food costs gold and adds it to the inventory', () => {
    const s = createNewGame(START);
    const r = buyFood(s, 'warmMilk');
    expect(r.blocked).toBeUndefined();
    expect(r.state.gold).toBe(s.gold - 12);
    expect(foodCount(r.state, 'warmMilk')).toBe(1);
  });

  it("can't buy what you can't afford", () => {
    const s = { ...createNewGame(START), gold: 5 };
    expect(buyFood(s, 'warmMilk').blocked).toBe('notEnoughGold');
    expect(buyFood(s, 'warmMilk').state.gold).toBe(5);
  });

  it('feeding uses up stocked food, rice balls too', () => {
    let s = newTeen(START);
    s.pet.stats.hunger = 20;
    s.inventory.food = { cookie: 1, riceBall: 1 };
    s = feed(s, START, 'cookie').state;
    expect(foodCount(s, 'cookie')).toBe(0);
    expect(feed(s, START, 'cookie').blocked).toBe('noFood');
    s = feed(s, START, 'riceBall').state;
    expect(feed(s, START, 'riceBall').blocked).toBe('noFood');
  });

  it('a hat is bought once, then can be worn and taken off', () => {
    const hat = HATS[0];
    let s = earn(newTeen(START), hat.price);
    expect(wearHat(s, hat.id).blocked).toBe('notOwned');
    s = buyHat(s, hat.id).state;
    expect(s.inventory.hats).toEqual([hat.id]);
    expect(buyHat(s, hat.id).blocked).toBe('alreadyOwned');
    s = wearHat(s, hat.id).state;
    expect(s.pet.hat).toBe(hat.id);
    expect(wearHat(s, null).state.pet.hat).toBeNull();
  });

  it("an egg can't wear a hat", () => {
    const s = earn(createNewGame(START), 1000);
    const owned = buyHat(s, HATS[0].id).state;
    expect(wearHat(owned, HATS[0].id).blocked).toBe('egg');
  });
});

describe('check-in bonus', () => {
  it('gives the daily bonus on the first visit of the day', () => {
    const r = checkIn(createNewGame(START), START);
    expect(r.reward).toBe(rules.firstOfDay);
    expect(checkIn(r.state, START + 60_000).reward).toBe(0); // not again right away
  });

  it('gives a smaller bonus for later visits, up to a daily cap', () => {
    let s = createNewGame(START);
    let total = 0;
    for (let i = 0; i < 10; i++) {
      const r = checkIn(s, START + i * rules.minHoursBetween * HOUR * 0.4); // stays within the same day
      s = r.state;
      total += r.reward;
    }
    expect(s.checkIn.count).toBeLessThanOrEqual(rules.maxPerDay);
    expect(total).toBeLessThanOrEqual(rules.firstOfDay + rules.later * (rules.maxPerDay - 1));
  });

  it('starts fresh the next day', () => {
    let s = createNewGame(START);
    for (let i = 0; i < rules.maxPerDay; i++) s = checkIn(s, START + i * rules.minHoursBetween * HOUR).state;
    expect(checkIn(s, START + 13 * HOUR).reward).toBe(0);
    expect(checkIn(s, START + 24 * HOUR).reward).toBe(rules.firstOfDay);
  });
});

describe('the rice jar', () => {
  const HOUR = 3_600_000;
  const J = CONFIG.riceJar;

  it('adds a free rice ball every few hours until the jar is full', () => {
    let s = newTeen(START);
    s.inventory.food = { riceBall: 0 };
    s = simulate(s, START + 60_000);
    expect(foodCount(s, 'riceBall')).toBe(0);
    expect(s.riceJarAt).not.toBeNull();
    s = simulate(s, START + J.refillHours * HOUR + 60_000);
    expect(foodCount(s, 'riceBall')).toBe(1);
    s = simulate(s, START + 10 * J.refillHours * HOUR);
    expect(foodCount(s, 'riceBall')).toBe(J.size);
    expect(s.riceJarAt).toBeNull();
  });

  it("doesn't refill on top of rice bought in the Shop", () => {
    let s = newTeen(START);
    s.inventory.food = { riceBall: J.size + 2 };
    s = simulate(s, START + 10 * J.refillHours * HOUR);
    expect(foodCount(s, 'riceBall')).toBe(J.size + 2);
    expect(s.riceJarAt).toBeNull();
  });

  it('sells extra rice balls cheaply', () => {
    const r = buyFood(createNewGame(START), 'riceBall');
    expect(r.blocked).toBeUndefined();
    expect(foodCount(r.state, 'riceBall')).toBe(J.size + 1);
  });

  it('gives older saves a full jar', () => {
    const s = createNewGame(START) as any;
    s.inventory.food = { cookie: 1 };
    delete s.riceJarAt;
    const out = migrate({ version: 33, state: s });
    expect(out.version).toBe(34);
    expect(out.state.inventory.food).toEqual({ cookie: 1, riceBall: J.size });
    expect(out.state.riceJarAt).toBeNull();
  });
});
