// The shape of everything the game remembers. This whole object is what gets
// saved, so keep it plain data (numbers, strings, arrays) with no functions.

import { CONFIG } from './config';

export interface PetStats {
  hunger: number; // 0-100, higher is better (a full tummy)
  happiness: number; // 0-100
  health: number; // 0-100
  energy: number; // 0-100
}

// healthy -> warning (a stat is low) -> sick (stayed low too long).
export type Condition = 'healthy' | 'warning' | 'sick';

export interface Pet {
  id: string; // unique id, so pets can later appear in family trees online
  name: string;
  bornAt: number; // timestamp in milliseconds
  stats: PetStats;
  asleep: boolean; // true while the lights are off
  condition: Condition;
  warningMinutes: number; // how long the current warning has lasted
  recoveryUntil: number | null; // resting after medicine until this time
  careScore: number; // hidden 0-100 long-term care rating
}

export interface GameState {
  pet: Pet;
  // The moment the simulation last caught up to. simulate() moves the world
  // forward from here to "now".
  lastUpdated: number;
  // Extra time added by the debug fast-forward button, in milliseconds.
  // The game's clock is always: real time + clockOffsetMs.
  clockOffsetMs: number;
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
      asleep: false,
      condition: 'healthy',
      warningMinutes: 0,
      recoveryUntil: null,
      careScore: CONFIG.careScore.start,
    },
    lastUpdated: now,
    clockOffsetMs: 0,
  };
}
