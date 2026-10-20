// The shape of everything the game remembers. This whole object is what gets
// saved, so keep it plain data (numbers, strings, arrays) with no functions.

import { CONFIG } from './config';
import type { Stage } from './growth';
import { newGarden } from './garden';

export interface PetStats {
  hunger: number; // 0-100, higher is better (a full tummy)
  happiness: number; // 0-100
  health: number; // 0-100
  energy: number; // 0-100
}

// healthy -> warning (a stat is low) -> sick (stayed low too long) ->
// passed (sick too long without medicine; a Revival Star brings it back).
export type Condition = 'healthy' | 'warning' | 'sick' | 'passed';

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
  sickMinutes: number; // how long it has been sick without medicine
  recoveryUntil: number | null; // resting after medicine until this time
  careScore: number; // hidden 0-100 long-term care rating
  buffs: Buff[]; // active timed effects
  hat: string | null; // the hat it's wearing (an id from src/data/hats.json)
  // The themes of its parents' characters (none for a first pet). When it
  // grows up, characters of these themes are more likely (see growth.ts).
  themes: string[];
  // The friend it had a little one with. A pet only ever has one partner.
  partner: string | null;
}

// Everything the player owns.
export interface Inventory {
  food: Record<string, number>; // food id -> how many
  hats: string[]; // ids of hats bought (each is bought once)
  seeds: Record<string, number>; // crop id -> how many seeds
  supplies: Record<string, number>; // 'fertilizer' / 'plantCure' / 'bait' / 'revivalStar' -> how many
  decor: string[]; // room decorations bought, e.g. "wallpaper:dots", "curtains:rose"
}

// How the room is decorated (see src/game/decor.ts).
export interface Room {
  wallpaper: string; // a wallpaper id ('plain' to start with)
  curtains: string | null; // a curtains id, or none
}

// What's been bought today of the Shop's limited stock (the energy drink).
export interface Stock {
  day: string; // the local date, e.g. "2026-10-18"
  bought: number;
}

// One pot in the garden (see src/game/garden.ts). Times are timestamps.
export interface Plot {
  crop: string | null; // what's planted (a crop id), or null if empty
  growth: number; // how much growing it has done, in milliseconds
  moistUntil: number; // the soil is wet until this time
  // Sickness rolls happen every few hours from max(rollsFrom, moistUntil);
  // `rolls` counts the ones done since then.
  rollsFrom: number;
  rolls: number;
  luck: number; // 0-1, set when watered: decides the sickness rolls
  fertilizedUntil: number;
  sickSince: number | null; // when it got sick (null while healthy)
  dead: boolean;
}

// A pet from an earlier generation, as it's remembered in the Family Tree.
// Kept small: just what the tree shows. Pets from other players (once pets
// can meet) will be saved the same way.
export interface FamilyMember {
  id: string;
  name: string;
  owner: string; // who raised it ('' if they didn't say)
  fromFriend: boolean; // another player's pet (once pets can meet)
  fromWild: boolean; // a wanderer: a pet the game made, with no owner
  bornAt: number;
  character: string | null; // what it grew into (null if it never grew up)
  variant: string | null;
  generation: number;
  parents: string[]; // ids of other family members
}

// A pet you can meet (see src/game/friends.ts). For now every friend is a
// wanderer: a grown-up pet the game makes itself, which drops by now and
// then and can be added as a friend. Friends from other players will use
// the same shape later.
export interface Friend {
  id: string;
  name: string;
  character: string; // an id from src/data/characters.json
  variant: string | null;
  bornAt: number;
  generation: number;
  parents: string[];
  wild: boolean; // a wanderer (no owner)
  score: number; // hidden friend score, 0-100, shown as hearts
  // Today's meetings and gifts (they only count up to a daily cap). `day`
  // is the local date they're for, e.g. "2026-10-18".
  day: string;
  metToday: number;
  giftedToday: number; // friend score from today's gifts
  partner: string | null; // the pet of yours it had a little one with
  mingledAt: number; // when it last mingled (0 = never)
}

// Who's over right now, one at a time: a new wanderer (`guest`) or one of
// your friends (`friendId`), and when the next one comes.
export interface Visit {
  guest: Friend | null; // a wanderer you haven't added as a friend
  friendId: string | null; // or a friend who dropped by
  until: number; // they move on at this time (0 = nobody's over)
  met: boolean; // your pet met them during this visit
  nextAt: number; // when the next one drops by (0 = not planned yet)
  wildAt: number; // when the next new wanderer is due
  invitedDay: string; // the local date you last invited a friend over
}

// Keeps track of the daily check-in bonus.
export interface CheckIn {
  day: string; // the local date of the last reward, e.g. "2026-10-15"
  count: number; // rewards given that day
  lastAt: number; // when the last reward was given
}

// One box of a delivery order: what Percy wants, how many, and how many
// you've put in so far (those are out of your inventory until pickup).
export interface OrderBox {
  food: string; // a food id
  want: number;
  have: number;
}

// The order Percy is waiting on (see src/game/delivery.ts).
export interface Order {
  announcedAt: number;
  pickupAt: number;
  boxes: OrderBox[];
}

// What the pet is craving right now, shown in a thought bubble (see
// src/game/craving.ts).
export interface Craving {
  food: string | null; // a food id, or null when it isn't craving anything
  until: number; // the craving passes at this time
  nextAt: number; // when the next one can come (while there's none)
  last: string | null; // the last thing it craved, so it doesn't ask twice in a row
}

export interface Delivery {
  order: Order | null; // null between orders
  nextAt: number; // when the next order is announced (if there's none now)
}

// How a picked-up order went: by how many boxes were full, from none to all.
export type OrderTier = 'none' | 'bronze' | 'silver' | 'gold';

// Something for the Messages page. Kept as plain data, and turned into text
// when it's shown (see src/strings.ts).
export type Message =
  | { kind: 'order'; at: number; boxes: { food: string; want: number }[]; pickupAt: number }
  | { kind: 'pickup'; at: number; boxes: OrderBox[]; gold: number; tier: OrderTier; seed?: string; food?: string }
  | { kind: 'unlocked'; at: number; id: string }
  | { kind: 'growth'; at: number; stage: string; name: string; character: string | null; variant: string | null }
  | { kind: 'visitor'; at: number; name: string; character: string; variant: string | null; friend?: boolean }
  | { kind: 'littleOne'; at: number; name: string; friend: string }
  | { kind: 'badge'; at: number; id: string; tier: 'bronze' | 'silver' | 'gold' }
  | { kind: 'level'; at: number; level: number };

// You, the keeper (see src/game/skills.ts): XP and skills stay with you
// from pet to pet.
export interface Keeper {
  xp: number; // all the XP ever earned (the level is worked out from it)
  level: number; // the highest level already announced
  skills: Record<string, number>; // skill id -> rank learned (0-3)
  resets: number; // how many times a tree's points were taken back
  grownUp: string[]; // ids of pets already given XP for growing up
}

export interface GameState {
  // The pet you're looking after right now (its stats show on the home
  // screen). Any other pets share the room in `housemates`; tapping one
  // swaps it in here.
  pet: Pet;
  housemates: Pet[];
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
  // The garden's pots, left to right.
  garden: Plot[];
  // Crops ever harvested (food ids), so Percy only asks for things you
  // know how to get.
  grown: string[];
  // Percy's delivery orders.
  delivery: Delivery;
  // The Messages page, newest first, and when it was last looked at.
  messages: Message[];
  messagesSeenAt: number;
  // The pet's craving (the thought bubble).
  craving: Craving;
  // Pets to meet: your friends, and the wanderer visiting now.
  friends: Friend[];
  visit: Visit;
  // How the room is decorated, and today's limited Shop stock.
  room: Room;
  stock: Stock;
  // Whether fishing uses bait (switched on in the pond).
  baitOn: boolean;
  // Achievements (see src/game/achievements.ts): how many times things
  // have been done ("fish" -> 12), and the badge earned for each ("fish"
  // -> "bronze").
  tally: Record<string, number>;
  badges: Record<string, 'bronze' | 'silver' | 'gold'>;
  keeper: Keeper;
}

export function newKeeper(): Keeper {
  return { xp: 0, level: 1, skills: {}, resets: 0, grownUp: [] };
}

// Makes a random id. crypto.randomUUID exists in all modern browsers and Node.
export function makeId(): string {
  return crypto.randomUUID();
}

// A brand new egg. A little one gets its generation, parents and their
// themes; a first pet has none.
export function newPet(now: number, family: { generation: number; parents: string[]; themes: string[] } = {
  generation: 1, parents: [], themes: [],
}): Pet {
  return {
    id: makeId(),
    name: '',
    named: false,
    generation: family.generation,
    parents: [...family.parents],
    bornAt: now,
    stats: { ...CONFIG.startingStats },
    stage: 'egg', // every pet starts life as an egg
    character: null,
    variant: null,
    stageStartedAt: now,
    asleep: false,
    condition: 'healthy',
    warningMinutes: 0,
    sickMinutes: 0,
    recoveryUntil: null,
    careScore: CONFIG.careScore.start,
    buffs: [],
    hat: null,
    themes: [...family.themes],
    partner: null,
  };
}

export function createNewGame(now: number): GameState {
  return {
    pet: newPet(now),
    housemates: [],
    lastUpdated: now,
    clockOffsetMs: 0,
    gold: CONFIG.economy.startingGold,
    inventory: { food: { ...CONFIG.economy.startingFood }, hats: [], seeds: {}, supplies: {}, decor: [] },
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
    garden: newGarden(),
    grown: [],
    delivery: { order: null, nextAt: 0 },
    messages: [],
    messagesSeenAt: 0,
    craving: { food: null, until: 0, nextAt: 0, last: null },
    friends: [],
    visit: { guest: null, friendId: null, until: 0, met: false, nextAt: 0, wildAt: 0, invitedDay: '' },
    room: { wallpaper: 'plain', curtains: null },
    stock: { day: '', bought: 0 },
    baitOn: false,
    tally: {},
    badges: {},
    keeper: newKeeper(),
  };
}
