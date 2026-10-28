// Gold, the Shop and the inventory. All gold changes go through this file,
// so a second currency (or anything else) could be added here later
// without touching the rest of the game. Gold can only be earned by
// playing. Real money only buys star fragment packs and the Family Home
// (both can also be earned from good care, see fragments.ts); paying for
// them is handled by src/payments.ts.

import type { BaitId } from './fishing';
import { CONFIG } from './config';
import hatData from '../data/hats.json';
import type { GameState } from './state';
import type { Food, FoodId } from './actions';
import { emptyPlot, priceOf, type ShopItem } from './garden';
import { seededRoll } from './growth';
import { CURTAINS, FURNITURE, WALLPAPERS, decorKey, getDecor, ownsDecor, useDecor, type DecorKind } from './decor';

export interface Hat {
  id: string;
  name: string;
  price: number; // in gold
  // A star-only hat costs this many star fragments instead of gold, so
  // money can't buy it (see fragments.ts).
  fragments?: number;
  sheet: string; // sheet name in public/sprites/manifest.json
}

export const HATS = hatData.hats as Hat[];

export function getHat(id: string | null): Hat | undefined {
  return HATS.find((h) => h.id === id);
}

export type ShopBlock = 'notEnoughGold' | 'notEnoughFragments' | 'alreadyOwned' | 'notOwned' | 'egg' | 'soldOut' | 'earnedOnly';

export interface ShopResult {
  state: GameState;
  blocked?: ShopBlock;
}

function getFood(id: FoodId): Food {
  return CONFIG.foods.find((f) => f.id === id)!;
}

export function canAfford(state: GameState, price: number): boolean {
  return state.gold >= price;
}

// Adds gold (from a mini-game, a check-in bonus...).
export function earn(state: GameState, amount: number): GameState {
  return { ...state, gold: state.gold + Math.max(0, Math.round(amount)) };
}

// How many of a food the player has. Free food never runs out.
export function foodCount(state: GameState, id: FoodId): number {
  return (getFood(id).price as number) === 0 ? Infinity : (state.inventory.food[id] ?? 0);
}

// How many rice balls the jar holds: more once the bigger jar is bought.
export const hasBigJar = (state: GameState) => (state.inventory.supplies.bigRiceJar ?? 0) > 0;
export const riceJarSize = (state: GameState) =>
  CONFIG.riceJar.size + (hasBigJar(state) ? CONFIG.riceJar.bigger.extra : 0);

// Buys the bigger rice jar, once, with star fragments. It starts filling
// its new spot straight away.
export function buyBigJar(state: GameState): ShopResult {
  if (hasBigJar(state)) return { state, blocked: 'alreadyOwned' };
  const cost = CONFIG.riceJar.bigger.fragments;
  if (state.fragments.pieces < cost) return { state, blocked: 'notEnoughFragments' };
  const supplies = { ...state.inventory.supplies, bigRiceJar: 1 };
  return {
    state: stepRiceJar({
      ...state,
      fragments: { ...state.fragments, pieces: state.fragments.pieces - cost },
      inventory: { ...state.inventory, supplies },
    }, state.lastUpdated),
  };
}

// The rice jar: while you have fewer than riceJarSize() rice balls, one
// more appears every refillHours. `riceJarAt` is when the next one comes
// (null while the jar is full). Runs as part of simulate().
export function stepRiceJar(state: GameState, now: number): GameState {
  const { refillHours } = CONFIG.riceJar;
  const size = riceJarSize(state);
  const gap = refillHours * 3_600_000;
  let count = state.inventory.food.riceBall ?? 0;
  let at = count >= size ? null : (state.riceJarAt ?? now + gap);
  while (at !== null && at <= now) {
    count++;
    at = count >= size ? null : at + gap;
  }
  if (count === (state.inventory.food.riceBall ?? 0) && at === state.riceJarAt) return state;
  const food = { ...state.inventory.food, riceBall: count };
  return { ...state, riceJarAt: at, inventory: { ...state.inventory, food } };
}

// Takes one of a food out of the inventory (free food isn't counted).
// Returns null if there's none left.
export function useFood(state: GameState, id: FoodId): GameState | null {
  const count = foodCount(state, id);
  if (count <= 0) return null;
  if (count === Infinity) return state;
  const food = { ...state.inventory.food, [id]: count - 1 };
  return { ...state, inventory: { ...state.inventory, food } };
}

export function buyFood(state: GameState, id: FoodId, now = Date.now()): ShopResult {
  const f = getFood(id);
  if (f.limited && limitedLeft(state, now) <= 0) return { state, blocked: 'soldOut' };
  if (!canAfford(state, f.price)) return { state, blocked: 'notEnoughGold' };
  const food = { ...state.inventory.food, [id]: (state.inventory.food[id] ?? 0) + 1 };
  let s: GameState = { ...state, gold: state.gold - f.price, inventory: { ...state.inventory, food } };
  if (f.limited) {
    const day = localDay(now);
    s = { ...s, stock: { day, bought: (state.stock.day === day ? state.stock.bought : 0) + 1 } };
  }
  return { state: s };
}

// ---- The limited stock (the energy drink) ----

// Is limited food in the Shop on this day? The same day always gives the
// same answer, for everyone.
export function limitedInStock(day: string): boolean {
  return seededRoll('shop', `limited:${day}`) < CONFIG.economy.limited.chance;
}

// How many more can be bought today (0 on days it isn't in).
export function limitedLeft(state: GameState, now: number): number {
  const day = localDay(now);
  if (!limitedInStock(day)) return 0;
  const bought = state.stock.day === day ? state.stock.bought : 0;
  return Math.max(0, CONFIG.economy.limited.perDay - bought);
}

// ---- The Star Shop (real money) ----

export function revivalStars(state: GameState): number {
  return state.inventory.supplies.revivalStar ?? 0;
}

// Gives the player the star fragments in a pack, once it's been paid for.
export function grantPack(state: GameState, productId: string): GameState {
  const pack = CONFIG.store.find((p) => p.id === productId);
  if (!pack) return state;
  return { ...state, fragments: { ...state.fragments, pieces: state.fragments.pieces + pack.fragments } };
}

// ---- Fishing bait, fortune cookies, the extra garden pot and room decorations ----

// One bait from the tackle shelf (see CONFIG.fishing.baits).
export function buyBait(state: GameState, id: BaitId): ShopResult {
  const { price } = CONFIG.fishing.baits[id];
  if (!canAfford(state, price)) return { state, blocked: 'notEnoughGold' };
  const supplies = { ...state.inventory.supplies, [id]: (state.inventory.supplies[id] ?? 0) + 1 };
  return { state: { ...state, gold: state.gold - price, inventory: { ...state.inventory, supplies } } };
}

export function fortuneCookies(state: GameState): number {
  return state.inventory.supplies.fortuneCookie ?? 0;
}

export function buyFortuneCookie(state: GameState): ShopResult {
  const { price } = CONFIG.fortune;
  if (!canAfford(state, price)) return { state, blocked: 'notEnoughGold' };
  const supplies = { ...state.inventory.supplies, fortuneCookie: fortuneCookies(state) + 1 };
  return { state: { ...state, gold: state.gold - price, inventory: { ...state.inventory, supplies } } };
}

// True while another garden pot can still be bought.
export function canBuyPot(state: GameState): boolean {
  return state.garden.length < CONFIG.garden.maxPlots;
}

export function buyPot(state: GameState): ShopResult {
  if (!canBuyPot(state)) return { state, blocked: 'alreadyOwned' };
  const price = CONFIG.garden.extraPotPrice;
  if (!canAfford(state, price)) return { state, blocked: 'notEnoughGold' };
  return { state: { ...state, gold: state.gold - price, garden: [...state.garden, emptyPlot()] } };
}

// Buys a wallpaper or curtains, and puts it up straight away (in the room
// you're looking at).
export function buyDecor(state: GameState, kind: DecorKind, id: string): ShopResult {
  const d = getDecor(kind, id);
  if (!d) return { state };
  if (ownsDecor(state, kind, id)) return { state, blocked: 'alreadyOwned' };
  if (d.earned) return { state, blocked: 'earnedOnly' };
  const price = priceToday(state, kind, id, d.price);
  if (!canAfford(state, price)) return { state, blocked: 'notEnoughGold' };
  const decor = [...state.inventory.decor, decorKey(kind, id)];
  const bought = { ...state, gold: state.gold - price, inventory: { ...state.inventory, decor } };
  return { state: useDecor(bought, kind, id).state };
}

// Buys a seed, fertilizer or plant cure.
export function buyGardenItem(state: GameState, item: ShopItem): ShopResult {
  const price = priceOf(item);
  if (price <= 0) return { state }; // not sold
  if (!canAfford(state, price)) return { state, blocked: 'notEnoughGold' };
  const kind = item.kind === 'seed' ? 'seeds' : 'supplies';
  const stock = { ...state.inventory[kind], [item.id]: (state.inventory[kind][item.id] ?? 0) + 1 };
  return { state: { ...state, gold: state.gold - price, inventory: { ...state.inventory, [kind]: stock } } };
}

export function buyHat(state: GameState, id: string): ShopResult {
  const hat = getHat(id);
  if (!hat) return { state };
  if (state.inventory.hats.includes(id)) return { state, blocked: 'alreadyOwned' };
  const hats = [...state.inventory.hats, id];
  if (hat.fragments) {
    const pieces = state.fragments.pieces - hat.fragments;
    if (pieces < 0) return { state, blocked: 'notEnoughFragments' };
    return { state: { ...state, fragments: { ...state.fragments, pieces }, inventory: { ...state.inventory, hats } } };
  }
  const price = priceToday(state, 'hat', id, hat.price);
  if (!canAfford(state, price)) return { state, blocked: 'notEnoughGold' };
  return { state: { ...state, gold: state.gold - price, inventory: { ...state.inventory, hats } } };
}

// ---- The daily special ----

// One thing a day at a lower price: a piece of furniture, a wallpaper,
// curtains or a gold hat. The same for everyone on the same day, and it
// stays put after it's bought (then it just says so).
export interface Special {
  kind: DecorKind | 'hat';
  id: string;
  was: number; // its usual price
  price: number; // today's price
}

export function dailySpecial(state: GameState): Special | null {
  const decor = [...FURNITURE, ...WALLPAPERS, ...CURTAINS]
    .filter((d) => d.price > 0 && !d.earned)
    .map((d) => ({ kind: d.kind, id: d.id, was: d.price }));
  const hats = HATS.filter((h) => !h.fragments && h.price > 0).map((h) => ({ kind: 'hat' as const, id: h.id, was: h.price }));
  const pool = [...decor, ...hats];
  if (pool.length === 0) return null;
  const pick = pool[Math.floor(seededRoll('shop', `special:${localDay(state.lastUpdated)}`) * pool.length)];
  const price = Math.round((pick.was * (1 - CONFIG.dailySpecial.off)) / 5) * 5;
  return { ...pick, price };
}

export function ownsSpecial(state: GameState, special: Special): boolean {
  return special.kind === 'hat' ? state.inventory.hats.includes(special.id) : ownsDecor(state, special.kind, special.id);
}

// What a thing costs today: less if it's today's special.
export function priceToday(state: GameState, kind: Special['kind'], id: string, price: number): number {
  const special = dailySpecial(state);
  return special && special.kind === kind && special.id === id ? special.price : price;
}

// Puts a hat on (or takes it off, with null).
export function wearHat(state: GameState, id: string | null): ShopResult {
  if (id !== null && !state.inventory.hats.includes(id)) return { state, blocked: 'notOwned' };
  if (id !== null && state.pet.stage === 'egg') return { state, blocked: 'egg' };
  return { state: { ...state, pet: { ...state.pet, hat: id } } };
}

// The local date as text, e.g. "2026-10-15", so a new day starts at midnight.
export function localDay(t: number): string {
  const d = new Date(t);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

// Gives the check-in bonus if one is due: the first visit of a day, then
// later visits spaced out a little, up to a daily limit. Returns how much
// gold was given (0 if none).
export function checkIn(state: GameState, now: number): { state: GameState; reward: number } {
  const rules = CONFIG.economy.checkIn;
  const day = localDay(now);
  const newDay = state.checkIn.day !== day;
  const count = newDay ? 0 : state.checkIn.count;
  if (count >= rules.maxPerDay) return { state, reward: 0 };
  if (!newDay && now - state.checkIn.lastAt < rules.minHoursBetween * 3_600_000) return { state, reward: 0 };
  const reward = count === 0 ? rules.firstOfDay : rules.later;
  return {
    state: { ...earn(state, reward), checkIn: { day, count: count + 1, lastAt: now } },
    reward,
  };
}
