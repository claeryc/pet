// The shape of everything the game remembers. This whole object is what gets
// saved, so keep it plain data (numbers, strings, arrays) with no functions.

import { CONFIG } from './config';

export interface PetStats {
  hunger: number; // 0-100, higher is better (a full tummy)
  happiness: number; // 0-100
}

export interface Pet {
  id: string; // unique id, so pets can later appear in family trees online
  name: string;
  bornAt: number; // timestamp in milliseconds
  stats: PetStats;
}

export interface GameState {
  pet: Pet;
  // The moment the simulation last caught up to. simulate() moves the world
  // forward from here to "now".
  lastUpdated: number;
}

// Makes a random id. crypto.randomUUID exists in all modern browsers and Node.
export function makeId(): string {
  return crypto.randomUUID();
}

export function createNewGame(now: number): GameState {
  return {
    pet: {
      id: makeId(),
      name: 'Mochi',
      bornAt: now,
      stats: { ...CONFIG.startingStats },
    },
    lastUpdated: now,
  };
}
