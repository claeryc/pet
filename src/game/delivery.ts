// Percy's delivery orders. Percy the pigeon announces an order of 1 to 3
// things you've caught, grown or cooked before, each with an amount, and
// comes back about a day later to pick them up. Each request is its own
// box: you can fill none, some or all of them.
//
// Putting something in a box takes it out of your inventory, and you can
// take it back out any time before pickup. At pickup, every full box is
// paid for; a box that isn't full stays home and its items go back to your
// inventory. Filling every box earns a bonus (the golden frame).
//
// Orders run on real time like the garden, so a pickup happens even while
// the game is closed (simulate() calls stepDelivery()).

import { CONFIG } from './config';
import { addTally } from './achievements';
import { addXp } from './skills';
import type { Food, FoodId } from './actions';
import { foodCount, useFood } from './economy';
import { logMessage } from './messages';
import { addSeed, type CropId } from './garden';
import { seededRoll } from './growth';
import type { GameState, Order, OrderBox, OrderTier } from './state';
import { backHomeAt } from './presence';

const HOUR = 3_600_000;
const D = CONFIG.delivery;
const FOODS = CONFIG.foods as readonly Food[];

const getFood = (id: string) => FOODS.find((f) => f.id === id);

// What Percy can ask for, in three groups: fish you've caught, crops you've
// harvested and dishes you've cooked. Never Shop food or a Mushy mess.
export function orderPool(state: GameState): string[][] {
  const known = (ids: string[], ok: (f: Food) => boolean) =>
    ids.filter((id, i) => ids.indexOf(id) === i && getFood(id) && ok(getFood(id)!));
  return [
    known(state.caught, (f) => !!f.caughtOnly),
    known(state.grown ?? [], (f) => !!f.grownOnly), // missing in saves from before the garden
    known(state.recipesFound, (f) => !!f.cookedOnly && f.id !== CONFIG.cooking.mess),
  ];
}

export function canOrder(state: GameState): boolean {
  return orderPool(state).some((g) => g.length > 0);
}

// A small random number generator that always gives the same numbers for
// the same seed, so an order can be made inside simulate() and tested.
function seeded(seed: number): () => number {
  let a = Math.floor(seed) >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// Makes an order from what you know, using `seed` for the dice. The boxes
// come from different groups when possible (a fish, a crop and a dish).
export function makeOrder(state: GameState, announcedAt: number, seed = announcedAt): Order | null {
  const rand = seeded(seed);
  const pick = <T>(list: T[]): T => list[Math.floor(rand() * list.length)];
  const groups = orderPool(state).filter((g) => g.length > 0);
  const total = groups.reduce((n, g) => n + g.length, 0);
  if (total === 0) return null;
  const count = Math.min(total, D.boxes.min + Math.floor(rand() * (D.boxes.max - D.boxes.min + 1)));
  const chosen: string[] = [];
  // One from each group first, in a random order, then from anything left.
  const order = [...groups].sort(() => rand() - 0.5);
  while (chosen.length < count) {
    const group = order.find((g) => g.some((id) => !chosen.includes(id)));
    if (!group) break;
    chosen.push(pick(group.filter((id) => !chosen.includes(id))));
    order.push(order.shift()!);
  }
  const boxes = chosen.map((food) => {
    const stars = (getFood(food)?.stars ?? 1) as 1 | 2 | 3;
    const [lo, hi] = D.amounts[stars];
    return { food, want: lo + Math.floor(rand() * (hi - lo + 1)), have: 0 };
  });
  return { announcedAt, pickupAt: pickupTime(announcedAt), boxes };
}

// About a day after the order is announced, on the hour, in the daytime.
export function pickupTime(announcedAt: number): number {
  const d = new Date(announcedAt + D.pickupHours * HOUR);
  if (d.getMinutes() > 0 || d.getSeconds() > 0 || d.getMilliseconds() > 0) d.setHours(d.getHours() + 1, 0, 0, 0);
  if (d.getHours() < D.daytime.from) d.setHours(D.daytime.from, 0, 0, 0);
  else if (d.getHours() > D.daytime.to) d.setHours(D.daytime.to, 0, 0, 0);
  return d.getTime();
}

// The first time on the hour, at least an hour after `t`, in the daytime
// (the next morning if it's too late in the day).
export function pickupAfter(t: number): number {
  const d = new Date(t + HOUR);
  if (d.getMinutes() > 0 || d.getSeconds() > 0 || d.getMilliseconds() > 0) d.setHours(d.getHours() + 1, 0, 0, 0);
  if (d.getHours() < D.daytime.from) d.setHours(D.daytime.from, 0, 0, 0);
  else if (d.getHours() > D.daytime.to) {
    d.setDate(d.getDate() + 1);
    d.setHours(D.daytime.from, 0, 0, 0);
  }
  return d.getTime();
}

export const isFull = (box: OrderBox) => box.have >= box.want;

// What a box pays once it's full.
export function boxReward(box: { food: string; want: number }): number {
  return Math.max(1, Math.round((getFood(box.food)?.price ?? 0) * box.want * D.payShare));
}

// Bronze for one full box, silver for two, gold when every box is full.
export function orderTier(boxes: OrderBox[]): OrderTier {
  const full = boxes.filter(isFull).length;
  if (full > 0 && full === boxes.length) return 'gold';
  return full >= 2 ? 'silver' : full === 1 ? 'bronze' : 'none';
}

// What the order pays right now, if Percy came for it: the full boxes, plus
// the bonus if they all are.
export function orderPay(boxes: OrderBox[]): { boxes: number; bonus: number } {
  const paid = boxes.filter(isFull).reduce((n, b) => n + boxReward(b), 0);
  const bonus = orderTier(boxes) === 'gold' ? Math.round(paid * D.fullBonus) : 0;
  return { boxes: paid, bonus };
}

export type BoxBlock = 'noOrder' | 'full' | 'empty' | 'noFood';
export interface BoxResult {
  state: GameState;
  blocked?: BoxBlock;
}

function withBoxes(state: GameState, boxes: OrderBox[]): GameState {
  return { ...state, delivery: { ...state.delivery, order: { ...state.delivery.order!, boxes } } };
}

// Puts one item into a box.
export function putInBox(state: GameState, index: number): BoxResult {
  const box = state.delivery.order?.boxes[index];
  if (!box) return { state, blocked: 'noOrder' };
  if (isFull(box)) return { state, blocked: 'full' };
  const used = useFood(state, box.food as FoodId);
  if (!used) return { state, blocked: 'noFood' };
  const boxes = state.delivery.order!.boxes.map((b, i) => (i === index ? { ...b, have: b.have + 1 } : b));
  return { state: withBoxes(used, boxes) };
}

// Takes one item back out of a box, into the inventory.
export function takeFromBox(state: GameState, index: number): BoxResult {
  const box = state.delivery.order?.boxes[index];
  if (!box) return { state, blocked: 'noOrder' };
  if (box.have <= 0) return { state, blocked: 'empty' };
  const boxes = state.delivery.order!.boxes.map((b, i) => (i === index ? { ...b, have: b.have - 1 } : b));
  const food = { ...state.inventory.food, [box.food]: (state.inventory.food[box.food] ?? 0) + 1 };
  return { state: withBoxes({ ...state, inventory: { ...state.inventory, food } }, boxes) };
}

// Fills every box as far as your inventory allows.
export function fillAll(state: GameState): BoxResult {
  const order = state.delivery.order;
  if (!order) return { state, blocked: 'noOrder' };
  let s = state;
  order.boxes.forEach((box, i) => {
    const room = box.want - box.have;
    for (let n = 0; n < room && foodCount(s, box.food as FoodId) > 0; n++) s = putInBox(s, i).state;
  });
  return s === state ? { state, blocked: 'noFood' } : { state: s };
}

// The seed Percy leaves after a gold-frame pickup, or null (no seed this
// time, or not every box was full). The same order always gives the same
// answer, so it can be tested.
export function pickupSeed(order: Order, petId: string): CropId | null {
  if (orderTier(order.boxes) !== 'gold') return null;
  if (seededRoll(petId, `percy-seed:${order.pickupAt}`) >= D.seedChance) return null;
  const odds = Object.entries(D.seedOdds) as [CropId, number][];
  const total = odds.reduce((n, [, p]) => n + p, 0);
  let roll = seededRoll(petId, `percy-seed-kind:${order.pickupAt}`) * total;
  for (const [id, p] of odds) {
    if (roll < p) return id;
    roll -= p;
  }
  return odds[odds.length - 1][0];
}

// Whether Percy leaves an energy drink after a gold-frame pickup that had
// no seed. Same order, same answer.
export function pickupDrink(order: Order, petId: string): boolean {
  if (orderTier(order.boxes) !== 'gold') return false;
  return seededRoll(petId, `percy-drink:${order.pickupAt}`) < D.drinkChance;
}

// Percy comes by: full boxes are paid for, the rest go back home. With
// every box full, he may leave a seed too, or else an energy drink.
function pickUp(state: GameState, order: Order): GameState {
  const pay = orderPay(order.boxes);
  const gold = pay.boxes + pay.bonus;
  const food = { ...state.inventory.food };
  for (const b of order.boxes) if (!isFull(b) && b.have > 0) food[b.food] = (food[b.food] ?? 0) + b.have;
  const seed = pickupSeed(order, state.pet.id);
  const drink = !seed && pickupDrink(order, state.pet.id);
  let s: GameState = {
    ...state,
    gold: state.gold + gold,
    inventory: { ...state.inventory, food },
    delivery: { order: null, nextAt: order.pickupAt + D.nextOrderHours * HOUR },
  };
  if (seed) s = addSeed(s, seed);
  if (drink) s = { ...s, inventory: { ...s.inventory, food: { ...s.inventory.food, energyDrink: (s.inventory.food.energyDrink ?? 0) + 1 } } };
  const tier = orderTier(order.boxes);
  if (tier !== 'none') s = addXp(addTally(s, 'deliveries'), CONFIG.skills.deliveryXp[tier]);
  return logMessage(s, {
    kind: 'pickup', at: order.pickupAt, boxes: order.boxes, gold, tier: orderTier(order.boxes),
    ...(seed ? { seed } : {}),
    ...(drink ? { food: 'energyDrink' } : {}),
  });
}

// Moves orders along to time `now`: a pickup that's due happens, and a new
// order is announced once it's time (and there's something to ask for).
export function stepDelivery(state: GameState, now: number): GameState {
  let s = state;
  let order = s.delivery.order;
  // With every pet out on a journey, nobody can hand Percy the boxes, so
  // he comes back once someone's home.
  while (order) {
    const back = backHomeAt(s, order.pickupAt);
    if (back === null) break;
    order = { ...order, pickupAt: pickupAfter(back) };
    s = { ...s, delivery: { ...s.delivery, order } };
  }
  if (order && now >= order.pickupAt) s = pickUp(s, order);
  // (There's nothing to ask for until you've caught, grown or cooked
  // something: that's also when orders open up, see src/game/unlocks.ts.)
  if (!s.delivery.order && now >= s.delivery.nextAt) {
    const next = makeOrder(s, now);
    if (next) {
      s = { ...s, delivery: { ...s.delivery, order: next } };
      s = logMessage(s, {
        kind: 'order',
        at: now,
        boxes: next.boxes.map(({ food, want }) => ({ food, want })),
        pickupAt: next.pickupAt,
      });
    }
  }
  return s;
}
