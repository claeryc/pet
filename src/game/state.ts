// The shape of everything the game remembers. This whole object is what gets
// saved, so keep it plain data (numbers, strings, arrays) with no functions.

import { CONFIG } from './config';
import type { Stage } from './growth';

export interface PetStats {
  hunger: number; // 0-100, higher is better (a full tummy)
  happiness: number; // 0-100
  health: number; // 0-100
  energy: number; // 0-100
}

// healthy -> warning (a stat is low) -> sick (stayed low too long).
export type Condition = 'healthy' | 'warning' | 'sick';

// A timed effect from food, e.g. "tummy empties 20% slower until 6pm".
export interface Buff {
  stat: 'hunger';
  percent: number; // how much slower that stat drops, 0-100
  until: number; // timestamp when the effect wears off
}

export interface Pet {
  id: string; // unique id, so pets can later appear in family trees online
  name: string; // empty until the player names it, when the egg hatches
  named: boolean; // false until the player has picked a name
  // Its place in the Family Tree: generation 1 is a first pet, and a pet's
  // little ones are one generation after it. `parents` are ids of pets in
  // GameState.family (none for a first pet).
  generation: number;
  parents: string[];
  bornAt: number; // timestamp in milliseconds
  stats: PetStats;
  stage: Stage; // egg, baby, teen or adult
  // Which character it grew into, and its colour variant (ids from
  // src/data/characters.json). Both stay null until it becomes an adult.
  character: string | null;
  variant: string | null;
  stageStartedAt: number; // when it entered its current stage
  asleep: boolean; // true while the lights are off
  condition: Condition;
  warningMinutes: number; // how long the current warning has lasted
  recoveryUntil: number | null; // resting after medicine until this time
  careScore: number; // hidden 0-100 long-term care rating
  buffs: Buff[]; // active timed effects
  hat: string | null; // the hat it's wearing (an id from src/data/hats.json)
}

// Everything the player owns.
export interface Inventory {
  food: Record<string, number>; // food id -> how many
  hats: string[]; // ids of hats bought (each is bought once)
}

// A pet from an earlier generation, as it's remembered in the Family Tree.
// Kept small: just what the tree shows. Pets from other players (once pets
// can meet) will be saved the same way.
export interface FamilyMember {
  id: string;
  name: string;
  owner: string; // who raised it ('' if they didn't say)
  bornAt: number;
  character: string | null; // what it grew into (null if it never grew up)
  variant: string | null;
  generation: number;
  parents: string[]; // ids of other family members
}

// Keeps track of the daily check-in bonus.
export interface CheckIn {
  day: string; // the local date of the last reward, e.g. "2026-10-15"
  count: number; // rewards given that day
  lastAt: number; // when the last reward was given
}

export interface GameState {
  pet: Pet;
  // The moment the simulation last caught up to. simulate() moves the world
  // forward from here to "now".
  lastUpdated: number;
  // Extra time added by the debug fast-forward button, in milliseconds.
  // The game's clock is always: real time + clockOffsetMs.
  clockOffsetMs: number;
  gold: number;
  inventory: Inventory;
  checkIn: CheckIn;
  // Dishes you've cooked at least once (food ids). They show up by name in
  // the recipe book; the rest stay "???".
  recipesFound: string[];
  // Foods fed to the pet, most recent first, so the Feed panel can put
  // your favourites at the top.
  recentFoods: string[];
  // Kinds of fish ever caught, and characters ever grown into ("pebblit",
  // or "pebblit:amber" for a colour variant). Shown in the Collection.
  caught: string[];
  charactersFound: string[];
  // Parts of the game that have opened up (see src/game/unlocks.ts), and
  // the ones the player has already looked at (the rest get a "new" dot).
  unlocked: string[];
  seen: string[];
  // Testing tool: show every menu straight away, locked or not.
  showAllMenus: boolean;
  // The player's name, shown in the Family Tree ('' if they'd rather not).
  owner: string;
  // Earlier generations of the pet's family (the pet itself isn't in here).
  family: FamilyMember[];
}

// Makes a random id. crypto.randomUUID exists in all modern browsers and Node.
export function makeId(): string {
  return crypto.randomUUID();
}

export function createNewGame(now: number): GameState {
  return {
    pet: {
      id: makeId(),
      name: '',
      named: false,
      generation: 1,
      parents: [],
      bornAt: now,
      stats: { ...CONFIG.startingStats },
      stage: 'egg', // every pet starts life as an egg
      character: null,
      variant: null,
      stageStartedAt: now,
      asleep: false,
      condition: 'healthy',
      warningMinutes: 0,
      recoveryUntil: null,
      careScore: CONFIG.careScore.start,
      buffs: [],
      hat: null,
    },
    lastUpdated: now,
    clockOffsetMs: 0,
    gold: CONFIG.economy.startingGold,
    inventory: { food: { ...CONFIG.economy.startingFood }, hats: [] },
    checkIn: { day: '', count: 0, lastAt: 0 },
    recipesFound: [],
    recentFoods: [],
    caught: [],
    charactersFound: [],
    unlocked: [],
    seen: [],
    showAllMenus: false,
    owner: '',
    family: [],
  };
}
