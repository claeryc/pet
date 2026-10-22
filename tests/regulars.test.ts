import { describe, expect, it } from 'vitest';
import { CONFIG } from '../src/game/config';
import {
  addRegular, backfillRegulars, catchUpRegulars, earnedFrom, getRegular, percyPerks, rewards,
} from '../src/game/regulars';
import { orderPay, pickupSeed, stepDelivery } from '../src/game/delivery';
import { buyDecor, buyHat, getHat, HATS } from '../src/game/economy';
import { getDecor, ownsDecor, WALLPAPERS } from '../src/game/decor';
import { migrate } from '../src/storage/storage';
import type { GameState, Order } from '../src/game/state';
import { newTeen } from './helpers';

const HOUR = 3_600_000;
const START = new Date(2026, 0, 1, 10, 0).getTime();
const HEART = CONFIG.friends.heartPoints;
const P = CONFIG.regulars.percy;

const withScore = (s: GameState, score: number, hearts = Math.floor(score / HEART)): GameState =>
  ({ ...s, regulars: { percy: { score, hearts } } });

// Percy comes for an order with these boxes.
function pickup(s: GameState, boxes: { food: string; want: number; have: number }[], at = START + 24 * HOUR): GameState {
  const order: Order = { announcedAt: at - 24 * HOUR, pickupAt: at, boxes };
  return stepDelivery({ ...s, delivery: { order, nextAt: at + 100 * HOUR } }, at);
}

const full = [{ food: 'carrot', want: 3, have: 3 }, { food: 'shrimp', want: 2, have: 2 }];
const half = [{ food: 'carrot', want: 3, have: 3 }, { food: 'shrimp', want: 2, have: 1 }];
const none = [{ food: 'carrot', want: 3, have: 1 }];

describe("Percy's hearts", () => {
  it('go up with every pickup, more for fuller orders', () => {
    const s = newTeen(START);
    expect(getRegular(pickup(s, half), 'percy').score).toBe(P.gain.bronze);
    expect(getRegular(pickup(s, full), 'percy').score).toBe(P.gain.gold);
    const msg = pickup(s, full).messages.find((m) => m.kind === 'pickup');
    expect(msg).toMatchObject({ regular: P.gain.gold });
  });

  it('drop a little for a pickup with no full box, but never below a heart reached', () => {
    const s = newTeen(START);
    expect(getRegular(pickup(withScore(s, 25), none), 'percy').score).toBe(24);
    expect(getRegular(pickup(withScore(s, HEART), none), 'percy').score).toBe(HEART);
    expect(getRegular(pickup(s, none), 'percy').score).toBe(0);
    const msg = pickup(withScore(s, 25), none).messages.find((m) => m.kind === 'pickup');
    expect(msg && msg.kind === 'pickup' && msg.regular).toBeUndefined();
  });

  it('stop at 100', () => {
    const s = addRegular(withScore(newTeen(START), 99), 'percy', 3, START);
    expect(getRegular(s, 'percy').score).toBe(100);
  });

  it('give each reward once, with a message, as each heart is reached', () => {
    let s = withScore(newTeen(START), HEART - 1, 0);
    s = addRegular(s, 'percy', 1, START);
    expect(getRegular(s, 'percy').hearts).toBe(1);
    expect(s.inventory.seeds.pumpkin).toBe(1);
    expect(s.messages[0]).toMatchObject({ kind: 'regular', id: 'percy', hearts: 1 });
    // Dropping back a little and coming back doesn't give it again.
    s = addRegular(s, 'percy', 1, START);
    s = addRegular(s, 'percy', -1, START);
    s = addRegular(s, 'percy', 1, START);
    expect(s.inventory.seeds.pumpkin).toBe(1);
    expect(s.messages.filter((m) => m.kind === 'regular')).toHaveLength(1);
  });

  it('hand over the Courier Cap at 3 hearts and the Postmark wallpaper at 4', () => {
    let s = withScore(newTeen(START), 0, 0);
    s = addRegular(s, 'percy', 3 * HEART, START);
    expect(s.inventory.hats).toContain('courierCap');
    expect(ownsDecor(s, 'wallpaper', 'postmark')).toBe(false);
    s = addRegular(s, 'percy', HEART, START);
    expect(ownsDecor(s, 'wallpaper', 'postmark')).toBe(true);
    s = addRegular(s, 'percy', HEART, START);
    expect(s.messages.filter((m) => m.kind === 'regular').map((m) => m.kind === 'regular' && m.hearts)).toEqual([1, 2, 3, 4, 5]);
  });

  it('show a new heart above the pickup that brought it', () => {
    const s = pickup(withScore(newTeen(START), HEART - 1, 0), full);
    expect(s.messages.slice(0, 2).map((m) => m.kind)).toEqual(['regular', 'pickup']);
  });
});

describe("Percy's perks", () => {
  it('start from the config and change from their heart onwards', () => {
    const s = newTeen(START);
    expect(percyPerks(s)).toMatchObject({ payShare: CONFIG.delivery.payShare, restHours: CONFIG.journeys.percy.restHours });
    expect(percyPerks(withScore(s, HEART)).payShare).toBe(CONFIG.delivery.payShare);
    expect(percyPerks(withScore(s, 2 * HEART)).payShare).toBe(0.85);
    expect(percyPerks(withScore(s, 4 * HEART)).seedChance).toBe(0.65);
    expect(percyPerks(withScore(s, 100)).restHours).toBe(40);
  });

  it('pay more for full boxes at 2 hearts', () => {
    const s = newTeen(START);
    const gold = (st: GameState) => pickup(st, full).gold - st.gold;
    expect(gold(withScore(s, 2 * HEART))).toBe(orderPay(full, 0.85).boxes + orderPay(full, 0.85).bonus);
    expect(gold(withScore(s, 2 * HEART))).toBeGreaterThan(gold(s));
  });

  it('leave seeds more often at 4 hearts', () => {
    const s = withScore(newTeen(START), 4 * HEART);
    const perks = percyPerks(s);
    let plain = 0;
    let better = 0;
    for (let i = 0; i < 400; i++) {
      const order: Order = { announcedAt: 0, pickupAt: START + i * HOUR, boxes: full };
      if (pickupSeed(order, 'pet')) plain++;
      if (pickupSeed(order, 'pet', perks)) better++;
    }
    expect(better).toBeGreaterThan(plain);
  });
});

describe('Things only a regular gives', () => {
  it("can't be bought, and say who gives them", () => {
    const s = { ...newTeen(START), gold: 10_000 };
    expect(buyHat(s, 'courierCap').blocked).toBe('earnedOnly');
    expect(buyDecor(s, 'wallpaper', 'postmark').blocked).toBe('earnedOnly');
    expect(earnedFrom('hat', 'courierCap')).toEqual({ id: 'percy', hearts: 3 });
    expect(earnedFrom('wallpaper', 'postmark')).toEqual({ id: 'percy', hearts: 4 });
  });

  it('are all in some regular\'s rewards, and every reward exists', () => {
    for (const h of HATS.filter((h) => h.earned)) expect(earnedFrom('hat', h.id)).not.toBeNull();
    for (const w of WALLPAPERS.filter((w) => w.earned)) expect(earnedFrom('wallpaper', w.id)).not.toBeNull();
    for (const r of rewards('percy')) {
      if (r.hat) expect(getHat(r.hat)?.earned).toBe(true);
      if (r.wallpaper) expect(getDecor('wallpaper', r.wallpaper)?.earned).toBe(true);
    }
    expect(rewards('percy')).toHaveLength(5);
  });
});

describe('Saves from before regulars', () => {
  it('start Percy partway from the orders already filled, up to 2 hearts', () => {
    expect(backfillRegulars(7).percy).toEqual({ score: 7, hearts: 0 });
    expect(backfillRegulars(300).percy).toEqual({ score: P.backfill.max, hearts: 0 });
    const out = migrate({ version: 20, state: { tally: { deliveries: 25 } } });
    expect(out.state.regulars.percy.score).toBe(25);
  });

  it('get the rewards for those hearts on the next update', () => {
    const s = catchUpRegulars(withScore(newTeen(START), 40, 0), START);
    expect(getRegular(s, 'percy').hearts).toBe(2);
    expect(s.inventory.seeds.pumpkin).toBe(1);
    expect(s.messages.filter((m) => m.kind === 'regular')).toHaveLength(2);
  });
});
