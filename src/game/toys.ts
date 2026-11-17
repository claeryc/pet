// Toys (Play > Toys). Each is bought once in the Shop's Toys tab (the
// ball comes free) and played with in the room: a short game, then its
// effect on the pet's needs counts once, like a play. One toy is each
// pet's favourite, rolled from its id so it never changes; like its other
// likes, nothing says which until the pet shows it (see likes.ts).

import { CONFIG } from './config';
import { withPet, type ActionResult } from './actions';
import { clampStat } from './stats';
import { seededRoll } from './growth';
import { noticeFeeling } from './likes';
import { isAway } from './presence';
import { simulate } from './simulate';
import type { ShopResult } from './economy';
import type { GameState, Pet } from './state';

export type Toy = (typeof CONFIG.toys)[number];
export type ToyId = 'ball' | 'wand' | 'bubbles' | 'starKite';

export const TOYS = CONFIG.toys as readonly Toy[];
export const getToy = (id: string): Toy | undefined => TOYS.find((t) => t.id === id);

// The toys you have.
export const toysOf = (state: GameState): readonly string[] => state.inventory.toys ?? CONFIG.toyPlay.startWith;
export const ownsToy = (state: GameState, id: string): boolean => toysOf(state).includes(id);

// This pet's favourite toy.
export const favouriteToy = (pet: Pick<Pet, 'id'>): string =>
  TOYS[Math.floor(seededRoll(pet.id, 'favouriteToy') * TOYS.length)].id;

// Buys a toy: gold, or star fragments for a star toy.
export function buyToy(state: GameState, id: string): ShopResult {
  const toy = getToy(id);
  if (!toy) return { state };
  if (ownsToy(state, id)) return { state, blocked: 'alreadyOwned' };
  const inventory = { ...state.inventory, toys: [...toysOf(state), id] };
  if (toy.fragments > 0) {
    const pieces = state.fragments.pieces - toy.fragments;
    if (pieces < 0) return { state, blocked: 'notEnoughFragments' };
    return { state: { ...state, fragments: { ...state.fragments, pieces }, inventory } };
  }
  if (state.gold < toy.price) return { state, blocked: 'notEnoughGold' };
  return { state: { ...state, gold: state.gold - toy.price, inventory } };
}

// Why the pet can't play with this toy right now, or null.
export function toyBlocked(state: GameState, id: string): ActionResult['blocked'] | 'noToy' | null {
  const toy = getToy(id);
  if (!toy || !ownsToy(state, id)) return 'noToy';
  const pet = state.pet;
  if (isAway(pet)) return 'away';
  if (pet.condition === 'passed') return 'passed';
  if (pet.stage === 'egg') return 'egg';
  if (pet.asleep) return 'asleep';
  if (pet.stats.energy < -toy.energy) return 'tooTired';
  return null;
}

// A game with a toy is over: its effect on the needs, once. A favourite
// toy makes the pet fall in love (and is written in the Family Tree).
export function playToy(state: GameState, now: number, id: string): Omit<ActionResult, 'blocked'> & { blocked?: ActionResult['blocked'] | 'noToy' } {
  const s = simulate(state, now);
  const blocked = toyBlocked(s, id);
  if (blocked) return { state: s, blocked };
  const toy = getToy(id)!;
  const played = withPet(s, (pet) => {
    pet.stats.happiness = clampStat(pet.stats.happiness + toy.happiness);
    pet.stats.hunger = clampStat(pet.stats.hunger + toy.hunger);
    pet.stats.energy = clampStat(pet.stats.energy + toy.energy);
  });
  const loved = favouriteToy(s.pet) === id;
  return loved ? { state: noticeFeeling(played, 'toy', 'loved'), felt: 'loved' } : { state: played };
}
