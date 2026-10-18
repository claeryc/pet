import { describe, expect, it } from 'vitest';
import { CONFIG } from '../src/game/config';
import { feed } from '../src/game/actions';
import { inUse, ownsDecor, useDecor } from '../src/game/decor';
import {
  baitCount,
  buyBait,
  buyDecor,
  buyFood,
  buyPot,
  canBuyPot,
  foodCount,
  limitedInStock,
  limitedLeft,
  localDay,
} from '../src/game/economy';
import { land, pickCatch } from '../src/game/fishing';
import { createNewGame } from '../src/game/state';
import { newTeen } from './helpers';

const DAY = 24 * 3_600_000;
const START = new Date(2026, 0, 1, 10, 0).getTime();
const rich = () => ({ ...createNewGame(START), gold: 10_000 });

// The first day from `from` (at 10am) where the energy drink is in, or out.
function dayWhere(inStock: boolean, from = START): number {
  let t = from;
  while (limitedInStock(localDay(t)) !== inStock) t += DAY;
  return t;
}

describe('the energy drink', () => {
  it('is only in the Shop some days', () => {
    let days = 0;
    for (let i = 0; i < 300; i++) if (limitedInStock(localDay(START + i * DAY))) days++;
    expect(days / 300).toBeGreaterThan(CONFIG.economy.limited.chance - 0.1);
    expect(days / 300).toBeLessThan(CONFIG.economy.limited.chance + 0.1);
  });

  it("can't be bought on a day it's not in", () => {
    const t = dayWhere(false);
    expect(limitedLeft(rich(), t)).toBe(0);
    expect(buyFood(rich(), 'energyDrink', t).blocked).toBe('soldOut');
  });

  it('sells out after a few, and comes back on the next day it is in', () => {
    const t = dayWhere(true);
    let s = rich();
    for (let i = 0; i < CONFIG.economy.limited.perDay; i++) {
      const r = buyFood(s, 'energyDrink', t);
      expect(r.blocked).toBeUndefined();
      s = r.state;
    }
    expect(foodCount(s, 'energyDrink')).toBe(CONFIG.economy.limited.perDay);
    expect(limitedLeft(s, t)).toBe(0);
    expect(buyFood(s, 'energyDrink', t).blocked).toBe('soldOut');
    const later = dayWhere(true, t + DAY);
    expect(limitedLeft(s, later)).toBe(CONFIG.economy.limited.perDay);
  });

  it('gives energy (and costs a little health)', () => {
    let s = newTeen(START);
    s.pet.stats.energy = 20;
    s.pet.stats.health = 80;
    s.inventory.food = { energyDrink: 1 };
    s = feed(s, START, 'energyDrink').state;
    expect(s.pet.stats.energy).toBe(60);
    expect(s.pet.stats.health).toBe(78);
  });
});

describe('fishing bait', () => {
  it('is bought one at a time', () => {
    const s = buyBait(rich()).state;
    expect(baitCount(s)).toBe(1);
    expect(s.gold).toBe(10_000 - CONFIG.fishing.bait.price);
    expect(buyBait({ ...createNewGame(START), gold: 0 }).blocked).toBe('notEnoughGold');
  });

  it('makes rarer fish more likely', () => {
    const lobsters = (baited: boolean) => {
      let n = 0;
      for (let i = 0; i < 100; i++) if (pickCatch('good', i / 100, baited) === 'lobster') n++;
      return n;
    };
    expect(lobsters(true)).toBeGreaterThan(lobsters(false));
  });

  it('a landed fish uses one up, a fish that gets away does not', () => {
    let s = buyBait(buyBait(rich()).state).state;
    const r = land(s, 'perfect', 0, 0.999);
    expect(r.baited).toBe(true);
    expect(baitCount(r.state)).toBe(1);
    s = r.state;
    expect(baitCount(land(s, 'miss', 0, 0).state)).toBe(1);
    const last = land(land(s, 'perfect', 0, 0).state, 'perfect', 0, 0);
    expect(last.baited).toBe(false); // none left for the second
  });
});

describe('the fourth pot', () => {
  it('can be bought once', () => {
    const s = rich();
    expect(s.garden).toHaveLength(CONFIG.garden.plots);
    const r = buyPot(s);
    expect(r.state.garden).toHaveLength(CONFIG.garden.maxPlots);
    expect(r.state.gold).toBe(10_000 - CONFIG.garden.extraPotPrice);
    expect(canBuyPot(r.state)).toBe(false);
    expect(buyPot(r.state).blocked).toBe('alreadyOwned');
  });
});

describe('room decor', () => {
  it('starts with the plain wall and no curtains', () => {
    const s = createNewGame(START);
    expect(ownsDecor(s, 'wallpaper', 'plain')).toBe(true);
    expect(inUse(s, 'wallpaper', 'plain')).toBe(true);
    expect(s.room.curtains).toBeNull();
  });

  it('buying puts it up straight away, and you can swap back', () => {
    let s = buyDecor(rich(), 'wallpaper', 'stars').state;
    expect(ownsDecor(s, 'wallpaper', 'stars')).toBe(true);
    expect(s.room.wallpaper).toBe('stars');
    expect(buyDecor(s, 'wallpaper', 'stars').blocked).toBe('alreadyOwned');
    s = useDecor(s, 'wallpaper', 'plain').state;
    expect(s.room.wallpaper).toBe('plain');
    s = useDecor(s, 'wallpaper', 'stars').state;
    expect(s.room.wallpaper).toBe('stars');
  });

  it("can't use what you haven't bought; curtains can come down", () => {
    let s = rich();
    expect(useDecor(s, 'curtains', 'mint').blocked).toBe('notOwned');
    s = buyDecor(s, 'curtains', 'mint').state;
    expect(s.room.curtains).toBe('mint');
    s = useDecor(s, 'curtains', null).state;
    expect(s.room.curtains).toBeNull();
  });
});
