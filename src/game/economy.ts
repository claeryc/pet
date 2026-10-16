// Gold, the Shop and the inventory. All gold changes go through this file,
// so a second currency (or anything else) could be added here later
// without touching the rest of the game. Gold can only be earned by
// playing; there are no real-money purchases.

import { CONFIG } from './config';
import hatData from '../data/hats.json';
import type { GameState } from './state';
import type { Food, FoodId } from './actions';
import { priceOf, type ShopItem } from './garden';

export interface Hat {
  id: string;
  name: string;
  price: number;
  sheet: string; // sheet name in public/sprites/manifest.json
}

export const HATS = hatData.hats as Hat[];

export function getHat(id: string | null): Hat | undefined {
  return HATS.find((h) => h.id === id);
}

export type ShopBlock = 'notEnoughGold' | 'alreadyOwned' | 'notOwned' | 'egg';

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
  return getFood(id).price === 0 ? Infinity : (state.inventory.food[id] ?? 0);
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

export function buyFood(state: GameState, id: FoodId): ShopResult {
  const { price } = getFood(id);
  if (!canAfford(state, price)) return { state, blocked: 'notEnoughGold' };
  const food = { ...state.inventory.food, [id]: (state.inventory.food[id] ?? 0) + 1 };
  return { state: { ...state, gold: state.gold - price, inventory: { ...state.inventory, food } } };
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
  if (!canAfford(state, hat.price)) return { state, blocked: 'notEnoughGold' };
  const hats = [...state.inventory.hats, id];
  return { state: { ...state, gold: state.gold - hat.price, inventory: { ...state.inventory, hats } } };
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
