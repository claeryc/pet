import { describe, expect, it } from 'vitest';
import { CONFIG } from '../src/game/config';
import {
  boxReward,
  canOrder,
  fillAll,
  makeOrder,
  orderPay,
  orderPool,
  orderTier,
  pickupDrink,
  pickupSeed,
  pickupTime,
  putInBox,
  stepDelivery,
  takeFromBox,
} from '../src/game/delivery';
import { simulate } from '../src/game/simulate';
import { updateProgress } from '../src/game/unlocks';
import { unreadMail } from '../src/game/messages';
import { harvest } from '../src/game/garden';
import type { GameState, Order } from '../src/game/state';
import type { Food } from '../src/game/actions';
import { newTeen } from './helpers';

const HOUR = 3_600_000;
const START = new Date(2026, 0, 1, 10, 0).getTime();
const D = CONFIG.delivery;

// A teen who has caught shrimp and salmon, grown carrots and cooked
// grilled shrimp, so Percy's orders are open.
function ready(now = START): GameState {
  const s = newTeen(now);
  s.caught = ['shrimp', 'salmon'];
  s.grown = ['carrot'];
  s.recipesFound = ['grilledShrimp', 'mushyMess'];
  return updateProgress(s).state;
}

function withOrder(s: GameState, boxes: { food: string; want: number; have?: number }[]): GameState {
  const order: Order = {
    announcedAt: START,
    pickupAt: START + 24 * HOUR,
    boxes: boxes.map((b) => ({ have: 0, ...b })),
  };
  return { ...s, delivery: { order, nextAt: 0 } };
}

describe("Percy's orders", () => {
  it('only asks for things you caught, grew or cooked, never Shop food or mush', () => {
    const s = ready();
    expect(orderPool(s)).toEqual([['shrimp', 'salmon'], ['carrot'], ['grilledShrimp']]);
    const fresh = newTeen(START);
    fresh.inventory.food = { strawberry: 5 };
    expect(canOrder(fresh)).toBe(false);
    expect(makeOrder(fresh, START)).toBeNull();
  });

  it('opens once there is something to ask for, and announces an order', () => {
    const s = newTeen(START);
    expect(updateProgress(s).state.unlocked).not.toContain('delivery');
    s.caught = ['shrimp'];
    const opened = updateProgress(s).state;
    expect(opened.unlocked).toContain('delivery');
    const next = simulate(opened, START + 2 * 60_000);
    expect(next.delivery.order?.boxes).toEqual([{ food: 'shrimp', want: expect.any(Number), have: 0 }]);
    expect(next.messages[0].kind).toBe('order');
    expect(unreadMail(next)).toBe(1);
  });

  it('makes 1 to 3 boxes from different groups, with amounts by stars', () => {
    for (let seed = 1; seed < 200; seed++) {
      const order = makeOrder(ready(), START, seed)!;
      expect(order.boxes.length).toBeGreaterThanOrEqual(D.boxes.min);
      expect(order.boxes.length).toBeLessThanOrEqual(D.boxes.max);
      const foods = order.boxes.map((b) => b.food);
      expect(new Set(foods).size).toBe(foods.length);
      // Two boxes never both come from fishing while a crop or dish is unused.
      if (foods.length <= 3) expect(foods.filter((f) => f === 'shrimp' || f === 'salmon').length).toBeLessThanOrEqual(1);
      for (const b of order.boxes) {
        const stars = (CONFIG.foods as readonly Food[]).find((f) => f.id === b.food)!.stars as 1 | 2 | 3;
        const [lo, hi] = D.amounts[stars];
        expect(b.want).toBeGreaterThanOrEqual(lo);
        expect(b.want).toBeLessThanOrEqual(hi);
      }
    }
  });

  it('the same seed always makes the same order', () => {
    expect(makeOrder(ready(), START, 42)).toEqual(makeOrder(ready(), START, 42));
  });

  it('picks up about a day later, on the hour, in the daytime', () => {
    const at = (h: number, m = 0) => new Date(2026, 0, 1, h, m).getTime();
    expect(new Date(pickupTime(at(10, 20))).getHours()).toBe(11); // next day, rounded up
    expect(pickupTime(at(10, 20)) - at(10, 20)).toBeLessThan(25 * HOUR);
    expect(new Date(pickupTime(at(2))).getHours()).toBe(D.daytime.from);
    expect(new Date(pickupTime(at(22))).getHours()).toBe(D.daytime.to);
    expect(new Date(pickupTime(at(22))).getDate()).toBe(2);
  });

  it('putting things in a box takes them out of the inventory, and back', () => {
    let s = withOrder(ready(), [{ food: 'carrot', want: 2 }]);
    s.inventory.food = { carrot: 3 };
    s = putInBox(s, 0).state;
    expect(s.inventory.food.carrot).toBe(2);
    expect(s.delivery.order!.boxes[0].have).toBe(1);
    s = putInBox(s, 0).state;
    expect(putInBox(s, 0).blocked).toBe('full');
    s = takeFromBox(s, 0).state;
    expect(s.inventory.food.carrot).toBe(2);
    expect(s.delivery.order!.boxes[0].have).toBe(1);
    s.inventory.food.carrot = 0;
    expect(putInBox(s, 0).blocked).toBe('noFood');
  });

  it('Fill all puts in as much as you have', () => {
    let s = withOrder(ready(), [{ food: 'carrot', want: 3 }, { food: 'shrimp', want: 2 }, { food: 'salmon', want: 1 }]);
    s.inventory.food = { carrot: 5, shrimp: 1 };
    s = fillAll(s).state;
    expect(s.delivery.order!.boxes.map((b) => b.have)).toEqual([3, 1, 0]);
    expect(s.inventory.food).toMatchObject({ carrot: 2, shrimp: 0 });
    expect(fillAll(s).blocked).toBe('noFood');
  });

  it('frames: bronze for one full box, silver for two, gold for all', () => {
    const box = (want: number, have: number) => ({ food: 'carrot', want, have });
    expect(orderTier([box(2, 1), box(2, 0)])).toBe('none');
    expect(orderTier([box(2, 2), box(2, 0), box(1, 0)])).toBe('bronze');
    expect(orderTier([box(2, 2), box(2, 2), box(1, 0)])).toBe('silver');
    expect(orderTier([box(2, 2), box(2, 2), box(1, 1)])).toBe('gold');
    expect(orderTier([box(2, 2)])).toBe('gold');
  });

  it('pays a share of what the items are worth, plus a bonus when every box is full', () => {
    // 3 carrots are worth 30; a full box pays 80% of that.
    expect(boxReward({ food: 'carrot', want: 3 })).toBe(24);
    const two = [
      { food: 'carrot', want: 3, have: 3 },
      { food: 'shrimp', want: 2, have: 2 },
    ];
    expect(orderPay(two)).toEqual({ boxes: 24 + 16, bonus: 10 });
    expect(orderPay([two[0], { ...two[1], have: 1 }])).toEqual({ boxes: 24, bonus: 0 });
  });

  it('at pickup, full boxes are paid and the rest go back home, even while away', () => {
    let s = withOrder(ready(), [
      { food: 'carrot', want: 3, have: 3 },
      { food: 'shrimp', want: 2, have: 1 },
    ]);
    s.inventory.food = {};
    const gold = s.gold;
    s = stepDelivery(s, START + 24 * HOUR);
    expect(s.gold).toBe(gold + 24);
    expect(s.inventory.food.shrimp).toBe(1);
    expect(s.inventory.food.carrot ?? 0).toBe(0);
    expect(s.messages[0]).toMatchObject({ kind: 'pickup', gold: 24, tier: 'bronze' });
    expect(s.delivery.order).toBeNull();
    expect(s.delivery.nextAt).toBe(START + (24 + D.nextOrderHours) * HOUR);
    // The next order comes a few hours later.
    expect(stepDelivery(s, START + 25 * HOUR).delivery.order).toBeNull();
    expect(stepDelivery(s, START + (24 + D.nextOrderHours) * HOUR).delivery.order).not.toBeNull();
  });

  it('a long time away gives one pickup and one fresh order, not a pile of them', () => {
    let s = simulate(ready(), START + 60_000);
    expect(s.delivery.order).not.toBeNull();
    s = simulate(s, START + 7 * 24 * HOUR);
    expect(s.messages.filter((m) => m.kind === 'pickup')).toHaveLength(1);
    expect(s.delivery.order!.announcedAt).toBe(s.lastUpdated);
    expect(s.delivery.order!.pickupAt).toBeGreaterThan(s.lastUpdated);
  });

  it('harvesting a crop remembers it as grown', () => {
    const s = ready();
    s.grown = [];
    s.garden[0] = { ...s.garden[0], crop: 'pumpkin', growth: 1e12 };
    expect(harvest(s, 0).state.grown).toEqual(['pumpkin']);
  });
});

describe('Messages', () => {
  it('keeps the newest first, with older news (a pickup while away) below', async () => {
    const { logMessage } = await import('../src/game/messages');
    let s = newTeen(START);
    s = logMessage(s, { kind: 'unlocked', at: START + 10, id: 'shop' });
    s = logMessage(s, { kind: 'pickup', at: START, boxes: [], gold: 0, tier: 'none' });
    s = logMessage(s, { kind: 'unlocked', at: START + 10, id: 'garden' });
    expect(s.messages.map((m) => (m.kind === 'unlocked' ? m.id : m.kind))).toEqual(['shop', 'garden', 'pickup']);
  });
});

describe("Percy's seeds", () => {
  const order = (pickupAt: number, full: boolean): Order => ({
    announcedAt: pickupAt - 24 * HOUR,
    pickupAt,
    boxes: [{ food: 'shrimp', want: 2, have: full ? 2 : 1 }, { food: 'carrot', want: 3, have: 3 }],
  });

  it('only leaves a seed for a gold-frame order, about half the time, never a carrot', () => {
    let seeds = 0;
    const kinds = new Set<string>();
    for (let i = 0; i < 400; i++) {
      expect(pickupSeed(order(START + i * HOUR, false), 'pet')).toBeNull();
      const seed = pickupSeed(order(START + i * HOUR, true), 'pet');
      if (seed) {
        seeds++;
        kinds.add(seed);
      }
    }
    expect(seeds / 400).toBeGreaterThan(D.seedChance - 0.1);
    expect(seeds / 400).toBeLessThan(D.seedChance + 0.1);
    expect([...kinds].sort()).toEqual(['dragonFruit', 'pumpkin']);
  });

  it('puts the seed in your inventory and in the pickup message', () => {
    // Find a pickup time that gives a seed for this pet.
    let s = ready();
    let at = START + 24 * HOUR;
    while (!pickupSeed(order(at, true), s.pet.id)) at += HOUR;
    s = { ...s, delivery: { order: order(at, true), nextAt: 0 } };
    const seed = pickupSeed(order(at, true), s.pet.id)!;
    const after = stepDelivery(s, at);
    expect(after.inventory.seeds[seed]).toBe(1);
    const msg = after.messages.find((m) => m.kind === 'pickup');
    expect(msg && msg.kind === 'pickup' && msg.seed).toBe(seed);
  });

  it('sometimes leaves an energy drink instead, when there was no seed', () => {
    let s = ready();
    let at = START + 24 * HOUR;
    while (pickupSeed(order(at, true), s.pet.id) || !pickupDrink(order(at, true), s.pet.id)) at += HOUR;
    expect(pickupDrink(order(at, false), s.pet.id)).toBe(false); // gold frames only
    s = { ...s, delivery: { order: order(at, true), nextAt: 0 } };
    const before = s.inventory.food.energyDrink ?? 0;
    const after = stepDelivery(s, at);
    expect(after.inventory.food.energyDrink).toBe(before + 1);
    const msg = after.messages.find((m) => m.kind === 'pickup');
    expect(msg && msg.kind === 'pickup' && msg.food).toBe('energyDrink');
  });
});
