// The Meadow: where your pets go when they move out to make room. It's
// the safe place: nobody there gets hungry, sick or passes away, and the
// whole pet is kept so it can come back.
//
// Only a pet that's well (and home) can move there, so the Meadow is
// never a way out of a warning or a sick countdown. Moving there, a pet
// leaves a keepsake once, ever, by how many good care days it was home
// for (CONFIG.meadow.gift): its framed portrait, plus a keepsake from its
// world, plus that keepsake in gold. They're only for looks: the room has
// a frame and a little shelf to show them.
//
// About once a week one of them drops by, like a friend (see stepVisits in
// friends.ts), with its favourite food. Only while it's visiting, and only
// when there's a free spot, can it move back home, so pets can't be
// swapped in and out whenever you like. In the Meadow scene up to
// CONFIG.meadow.out of them are out at once; saying hi to one (once a day)
// makes it the next to visit.

import { CONFIG } from './config';
import { localDay } from './economy';
import { getCharacter, seededRoll } from './growth';
import { likesOf } from './likes';
import { newHygiene } from './hygiene';
import { isAway } from './presence';
import { currentRoom, roomOf, roomWithSpace } from './rooms';
import { newPet, type FamilyMember, type GameState, type Keepsake, type KeepsakeTier, type MeadowPet, type Pet, type Room } from './state';

const HOUR = 3_600_000;
const DAY = 24 * HOUR;
const M = CONFIG.meadow;

// --- Moving there ---------------------------------------------------------

// Whether a pet can move to the Meadow: it's well, and it's home.
export function canMoveToMeadow(pet: Pet): boolean {
  return pet.condition === 'healthy' && !isAway(pet);
}

// The keepsake a pet leaves after this many good care days.
export function giftTier(goodDays: number): KeepsakeTier {
  if (goodDays >= M.gift.goldenDays) return 'golden';
  if (goodDays >= M.gift.keepsakeDays) return 'keepsake';
  return 'portrait';
}

export const keepsakeOf = (state: GameState, id: string): Keepsake | undefined =>
  state.keepsakes.find((k) => k.id === id);

// Puts `pet` (already taken out of the room) in the Meadow. It leaves its
// keepsake if it never left one before (put up in its room where there's
// space), and the first visit is planned if none is.
export function addToMeadow(state: GameState, pet: Pet, now: number): GameState {
  const kept: Pet = { ...pet, trip: null, room: undefined, asleep: false };
  const entry: MeadowPet = { pet: kept, movedAt: now, hiDay: '', hiAt: 0, seenAt: now };
  const v = state.visit;
  const meadowAt = v.meadowAt > now ? v.meadowAt : now + M.firstVisitHours * HOUR;
  const s: GameState = { ...state, meadow: [...state.meadow, entry], visit: { ...v, meadowAt } };
  if (keepsakeOf(state, pet.id)) return s;
  const gift: Keepsake = {
    id: pet.id,
    name: pet.name,
    character: pet.character,
    variant: pet.variant,
    tier: giftTier(pet.goodDays ?? 0),
    at: now,
  };
  // It goes up in the room the pet lived in, where there's space.
  const putUp = (r: Room): Room => {
    const { frame, shelf } = roomKeepsakes(r);
    const free = gift.tier === 'portrait' ? -1 : shelf.indexOf(null);
    if (free >= 0) shelf[free] = gift.id;
    return hangKeepsakePieces({ ...r, frame: frame ?? gift.id, shelf });
  };
  const placed = roomOf(pet) === 'family'
    ? { ...s, familyHome: { ...s.familyHome, room: putUp(s.familyHome.room) } }
    : { ...s, room: putUp(s.room) };
  return { ...placed, keepsakes: [...s.keepsakes, gift] };
}

// --- Visits ---------------------------------------------------------------

export const getMeadowPet = (state: GameState, id: string): MeadowPet | undefined =>
  state.meadow.find((m) => m.pet.id === id);

// The Meadow pet dropping by right now, if any.
export function meadowVisitor(state: GameState): MeadowPet | null {
  const id = state.visit.meadowId;
  return (id && getMeadowPet(state, id)) || null;
}

// Who drops by at `t`: one you said hi to lately (the latest first), or
// else the one that hasn't been over for longest.
export function nextMeadowVisitor(meadow: readonly MeadowPet[], t: number): MeadowPet | null {
  if (meadow.length === 0) return null;
  const hi = meadow.filter((m) => m.hiAt > 0 && m.hiAt <= t && t - m.hiAt < M.hiDays * DAY && m.hiAt > m.seenAt);
  if (hi.length > 0) return hi.reduce((a, b) => (b.hiAt > a.hiAt ? b : a));
  return meadow.reduce((a, b) => (b.seenAt < a.seenAt ? b : a));
}

// Says hello to the Meadow pet that's over: the first time, it hands over
// its favourite food. Says what it brought, if anything.
export function greetVisitor(state: GameState): { state: GameState; food?: string } {
  const m = meadowVisitor(state);
  if (!m || state.visit.met) return { state };
  const food = likesOf(m.pet).food;
  const foods = { ...state.inventory.food, [food]: (state.inventory.food[food] ?? 0) + 1 };
  return {
    state: { ...state, inventory: { ...state.inventory, food: foods }, visit: { ...state.visit, met: true } },
    food,
  };
}

export type HomeBlock = 'gone' | 'full';

// The Meadow pet that's visiting moves back home, into a free spot. It
// comes back well and rested, and the visit is over.
export function welcomeHome(state: GameState, now: number): { state: GameState; blocked?: HomeBlock } {
  const m = meadowVisitor(state);
  if (!m) return { state, blocked: 'gone' };
  const room = roomWithSpace(state);
  if (!room) return { state, blocked: 'full' };
  const pet: Pet = {
    ...m.pet,
    stats: { ...M.backStats },
    condition: 'healthy',
    warningMinutes: 0,
    sickMinutes: 0,
    recoveryUntil: null,
    asleep: false,
    buffs: [],
    trip: null,
    tripReadyAt: 0,
    hygiene: newHygiene(),
    room: room === 'main' ? undefined : room,
  };
  return {
    state: {
      ...state,
      housemates: [...state.housemates, pet],
      meadow: state.meadow.filter((x) => x !== m),
      // It's at home now, so the Family Tree shows it from there.
      family: state.family.filter((f) => f.id !== pet.id),
      visit: { ...state.visit, meadowId: null, until: now, met: true },
    },
  };
}

// --- The Meadow scene -------------------------------------------------------

export const saidHiToday = (m: MeadowPet, now: number): boolean => m.hiDay === localDay(now);

// Says hi to a pet in the Meadow, once a day. It'll be the next to visit.
export function sayHi(state: GameState, id: string, now: number): { state: GameState; blocked?: 'gone' | 'already' } {
  const m = getMeadowPet(state, id);
  if (!m) return { state, blocked: 'gone' };
  if (saidHiToday(m, now)) return { state, blocked: 'already' };
  const hi = { ...m, hiDay: localDay(now), hiAt: now };
  return { state: { ...state, meadow: state.meadow.map((x) => (x === m ? hi : x)) } };
}

// Who's out in the Meadow scene today: everyone while there are only a
// few, or else the ones you said hi to in the last day, then a few picked
// for the day. Always in the same order, so nobody jumps about.
export function meadowOut(state: GameState, now: number): MeadowPet[] {
  if (state.meadow.length <= M.out) return state.meadow;
  const day = localDay(now);
  const recent = (m: MeadowPet) => m.hiAt > 0 && now - m.hiAt < DAY;
  const ranked = [...state.meadow].sort((a, b) =>
    Number(recent(b)) - Number(recent(a)) || seededRoll(a.pet.id, day) - seededRoll(b.pet.id, day));
  const out = ranked.slice(0, M.out);
  return state.meadow.filter((m) => out.includes(m));
}

// --- The goodbye card -------------------------------------------------------

export interface Memories {
  days: number; // days from hatching to moving out
  goodDays: number;
  food: string | null; // its favourite food, if you found it
  character: string | null; // what it grew into
  journeys: number;
  littleOnes: number;
}

export function memoriesOf(state: GameState, m: MeadowPet): Memories {
  const pet = m.pet;
  const likes = likesOf(pet);
  const journeys = Object.values(state.journeys.journal)
    .flatMap((page) => page.postcards)
    .filter((c) => c.name === pet.name && c.at >= pet.bornAt && c.at <= m.movedAt).length;
  const everyone: { parents: string[] }[] = [...state.family, state.pet, ...state.housemates, ...state.meadow.map((x) => x.pet)];
  return {
    days: Math.max(0, Math.floor((m.movedAt - pet.bornAt) / DAY)),
    goodDays: pet.goodDays ?? 0,
    food: likes.found.includes('food') ? likes.food : null,
    character: pet.stage === 'adult' ? pet.character : null,
    journeys,
    littleOnes: everyone.filter((p) => p.parents.includes(pet.id)).length,
  };
}

// --- Keepsakes in the room ----------------------------------------------------

// What a keepsake looks like on the shelf: something from its world, or
// a bit of eggshell for a pet that never grew up.
export function keepsakeKind(k: Keepsake): string {
  return getCharacter(k.character)?.theme ?? 'egg';
}

// The keepsakes that can stand on the shelf (a portrait alone can't).
export const shelfKeepsakes = (state: GameState): Keepsake[] => state.keepsakes.filter((k) => k.tier !== 'portrait');

// The frame and shelf of the room you're looking at, filled in.
export function roomKeepsakes(room: Room): { frame: string | null; shelf: (string | null)[] } {
  const shelf = Array.from({ length: M.shelf }, (_, i) => room.shelf?.[i] ?? null);
  return { frame: room.frame ?? null, shelf };
}

// Puts the keepsake frame and shelf up in a room that has something for
// them, if they aren't up yet and their spot is free: the frame beside the
// window (or on the wall if that's taken), the shelf on the wall.
export function hangKeepsakePieces(room: Room): Room {
  if (!room.frame && !room.shelf?.some(Boolean)) return room;
  const furniture = { ...room.furniture };
  const up = (id: string) => Object.values(furniture).includes(id);
  if (room.frame && !up('keepsakeFrame')) {
    const spot = (['wallMid', 'wall'] as const).find((s) => !furniture[s]);
    if (spot) furniture[spot] = 'keepsakeFrame';
  }
  if (room.shelf?.some(Boolean) && !up('keepsakeShelf') && !furniture.wall) furniture.wall = 'keepsakeShelf';
  return { ...room, furniture };
}

// Changes the keepsakes of the room you're looking at, and puts the frame
// or shelf up if they now hold something and aren't up yet.
function editRoom(state: GameState, change: (room: Room) => Room): GameState {
  const edit = (room: Room) => hangKeepsakePieces(change(room));
  if (currentRoom(state) === 'family') return { ...state, familyHome: { ...state.familyHome, room: edit(state.familyHome.room) } };
  return { ...state, room: edit(state.room) };
}

// Hangs a pet's portrait in the frame of the room you're looking at (null
// takes it down). A portrait hangs in one room at a time.
export function hangPortrait(state: GameState, id: string | null): GameState {
  if (id && !keepsakeOf(state, id)) return state;
  const off = (r: Room): Room => (id && r.frame === id ? { ...r, frame: null } : r);
  const s = { ...state, room: off(state.room), familyHome: { ...state.familyHome, room: off(state.familyHome.room) } };
  return editRoom(s, (r) => ({ ...r, frame: id }));
}

// Puts a keepsake on the shelf of the room you're looking at, in the first
// free spot (or takes it off, if it's there already). Says 'full' when
// there's no spot left.
export function toggleShelf(state: GameState, id: string): { state: GameState; blocked?: 'full' } {
  const k = keepsakeOf(state, id);
  if (!k || k.tier === 'portrait') return { state };
  const off = (r: Room): Room => (r.shelf?.includes(id) ? { ...r, shelf: r.shelf.map((x) => (x === id ? null : x)) } : r);
  const here = roomKeepsakes(currentRoom(state) === 'family' ? state.familyHome.room : state.room).shelf;
  if (here.includes(id)) return { state: editRoom(state, off) };
  const free = here.indexOf(null);
  if (free < 0) return { state, blocked: 'full' };
  const s = { ...state, room: off(state.room), familyHome: { ...state.familyHome, room: off(state.familyHome.room) } };
  return { state: editRoom(s, (r) => {
    const shelf = roomKeepsakes(r).shelf;
    shelf[free] = id;
    return { ...r, shelf };
  }) };
}

// --- Older saves ----------------------------------------------------------------

// A pet that moved to the Meadow before the Meadow kept whole pets: made
// again from what the Family Tree remembers of it.
export function petFromMember(m: FamilyMember, now: number): Pet {
  const pet = newPet(m.bornAt);
  return {
    ...pet,
    id: m.id,
    name: m.name,
    named: true,
    generation: m.generation,
    parents: [...m.parents],
    stage: m.character ? 'adult' : 'baby',
    character: m.character,
    variant: m.variant,
    stageStartedAt: now,
    trait: m.trait ?? pet.trait,
    likes: m.likes ?? pet.likes,
    carried: m.carried ?? null,
  };
}
