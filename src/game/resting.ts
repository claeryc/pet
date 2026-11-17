// A resting place for pets that passed away. Instead of bringing a pet
// back straight away or saying goodbye, you can let it rest under the
// stars (a star twinkles in the room's window) while you raise a new pet.
// Nothing happens to a resting pet: it waits, just as it was, until a
// Revival Star brings it back (when there's a free spot at home) or you
// say goodbye, which moves it into the Family Tree for good.

import { CONFIG } from './config';
import { simulate } from './simulate';
import { revivalStars } from './economy';
import { wakeUp } from './actions';
import { rememberPet } from './family';
import { capacity, roomOf, roomWithSpace } from './rooms';
import { newPet, type GameState, type Pet } from './state';

export type RestBlock = 'notPassed' | 'full' | 'noRevival' | 'noRoom' | 'missing';

export interface RestResult {
  state: GameState;
  blocked?: RestBlock;
}

const resting = (s: GameState): Pet[] => s.resting ?? [];

// True when there's no spot left to rest in.
export const restingFull = (s: GameState): boolean => resting(s).length >= CONFIG.revival.restingSpots;

// Lays the pet you're looking at (which passed away) to rest. The next pet
// in the room takes its place (an egg waiting in the nest moves in), or, if
// it was the only one, a new egg.
export function layToRest(state: GameState, now: number): RestResult {
  const s = simulate(state, now);
  const gone = s.pet;
  if (gone.condition !== 'passed') return { state: s, blocked: 'notPassed' };
  if (restingFull(s)) return { state: s, blocked: 'full' };
  const asleep: Pet = { ...gone, passedAt: gone.passedAt ?? now };
  const rest = s.housemates;
  const egg = s.nest ? [{ ...s.nest, stageStartedAt: now, room: roomOf(gone) }] : [];
  const others = [...rest, ...egg];
  const next = others.find((p) => roomOf(p) === roomOf(gone)) ?? others[0] ?? newPet(now);
  return {
    state: {
      ...s,
      pet: next,
      housemates: others.filter((p) => p !== next),
      nest: null,
      resting: [...resting(s), asleep],
      craving: { ...s.craving, food: null },
    },
  };
}

// Brings a resting pet back home with a Revival Star. It needs a free
// spot at home: nobody is made to move out for it.
export function reviveResting(state: GameState, now: number, id: string): RestResult {
  const s = simulate(state, now);
  const pet = resting(s).find((p) => p.id === id);
  if (!pet) return { state: s, blocked: 'missing' };
  const stars = revivalStars(s);
  if (stars < 1) return { state: s, blocked: 'noRevival' };
  const room = roomWithSpace(s);
  if (!room || 1 + s.housemates.length >= capacity(s)) return { state: s, blocked: 'noRoom' };
  const back: Pet = { ...pet, stats: { ...pet.stats }, buffs: [], hygiene: { ...pet.hygiene }, room, trip: null };
  wakeUp(back, now);
  return {
    state: {
      ...s,
      // You look after the pet that's just back.
      pet: back,
      housemates: [s.pet, ...s.housemates],
      resting: resting(s).filter((p) => p.id !== id),
      inventory: { ...s.inventory, supplies: { ...s.inventory.supplies, revivalStar: stars - 1 } },
    },
  };
}

// Says goodbye to a resting pet: it moves into the Family Tree for good.
export function goodbyeResting(state: GameState, id: string): GameState {
  const pet = resting(state).find((p) => p.id === id);
  if (!pet) return state;
  return {
    ...state,
    resting: resting(state).filter((p) => p.id !== id),
    family: [...state.family, rememberPet(pet, state.owner)],
  };
}
