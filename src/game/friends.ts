// Friends, mingling and the next generation.
//
// Once you have a grown-up pet, a wanderer drops by every couple of days:
// a grown-up pet the game makes itself, with no owner. It stays for a day.
// Under Play > Meet your pet can meet it, you can give it gifts and add it
// as a friend, so it can be met any time after it moves on.
//
// Meeting and gifts raise the friend score (0-100, shown as hearts), with
// daily caps so it can't be rushed. A day with no meeting costs a point,
// but never a whole heart. Once the hearts are 70% full, two grown-ups can
// mingle, and that may bring a little one: an egg that joins your room
// (the room fits two pets; past that, one retires into the Family Tree).
// The little one leans towards its parents' themes when it grows up.
//
// A pet only ever has one partner, and never mingles with its own parent,
// little one or brother or sister.
//
// Friends from other players will use the same shapes once there's a
// server (see the Hangout and mingle design doc).

import { CONFIG } from './config';
import { characterOfStars, getCharacter, rollStarsWith, seededRoll } from './growth';
import { localDay, useFood } from './economy';
import { clampStat, canPlayMinigames } from './stats';
import { rememberPet } from './family';
import { logMessage } from './messages';
import { newPet, type FamilyMember, type Friend, type GameState, type Pet } from './state';
import type { Food, FoodId } from './actions';
import { STRINGS } from '../strings';

const HOUR = 3_600_000;
const DAY = 24 * HOUR;
const F = CONFIG.friends;

// --- Reading friends -------------------------------------------------------

// Every pet in the room: the one you're looking after first.
export function allPets(state: GameState): Pet[] {
  return [state.pet, ...state.housemates];
}

// Hearts out of 5 for a score, in halves (3.5 = three and a half).
export function hearts(score: number): number {
  return Math.floor((score / F.heartPoints) * 2) / 2;
}

export function getFriend(state: GameState, id: string): Friend | undefined {
  return state.friends.find((f) => f.id === id) ?? (state.visit.guest?.id === id ? state.visit.guest : undefined);
}

export function isFriend(state: GameState, id: string): boolean {
  return state.friends.some((f) => f.id === id);
}

// Everyone your pet can meet right now: the guest (if one is visiting),
// then your friends, best friends first.
export function meetable(state: GameState): Friend[] {
  const guest = state.visit.guest ? [state.visit.guest] : [];
  return [...guest, ...[...state.friends].sort((a, b) => b.score - a.score)];
}

// Changes one friend (or the guest) with `change`, on copies.
function withFriend(state: GameState, id: string, change: (f: Friend) => void): GameState {
  const edit = (f: Friend) => {
    const copy = { ...f };
    change(copy);
    return copy;
  };
  if (state.visit.guest?.id === id) return { ...state, visit: { ...state.visit, guest: edit(state.visit.guest) } };
  return { ...state, friends: state.friends.map((f) => (f.id === id ? edit(f) : f)) };
}

// Today's counters start again each day.
function freshDay(f: Friend, day: string): void {
  if (f.day === day) return;
  f.day = day;
  f.metToday = 0;
  f.giftedToday = 0;
}

// --- Wanderers ---------------------------------------------------------------

// Makes the wanderer that arrives at time `t`. Everything about it comes
// from `t`, so it's the same however the game catches up. `taken` are names
// it shouldn't use (your pets', your friends').
export function makeWanderer(t: number, taken: readonly string[]): Friend {
  const id = `wild-${t}`;
  const { character, variant } = characterOfStars(rollStarsWith(F.wandererStars, seededRoll(id, 'stars')), id);
  const names = STRINGS.petNames.filter((n) => !taken.includes(n));
  const pool = names.length > 0 ? names : STRINGS.petNames;
  return {
    id,
    name: pool[Math.floor(seededRoll(id, 'name') * pool.length)],
    character: character.id,
    variant: variant?.id ?? null,
    bornAt: t - (4 + Math.floor(seededRoll(id, 'age') * 20)) * DAY,
    generation: 1,
    parents: [],
    wild: true,
    score: 0,
    day: localDay(t),
    metToday: 0,
    giftedToday: 0,
    settledDay: localDay(t),
    partner: null,
    mingledAt: 0,
  };
}

// Wanderers come and go on real time, like Percy: one arrives every
// `visitEveryHours` once you have a grown-up, and stays `stayHours`.
// Visits that came and went while the game was closed are skipped.
export function stepVisits(state: GameState, t: number): GameState {
  let visit = state.visit;
  let s = state;
  if (visit.guest && t >= visit.until) visit = { ...visit, guest: null };
  if (!visit.guest) {
    if (visit.nextAt === 0) {
      // The first one comes soon after a pet grows up.
      if (allPets(s).some((p) => p.stage === 'adult')) visit = { ...visit, nextAt: t + F.firstVisitHours * HOUR };
    } else if (t >= visit.nextAt) {
      const every = F.visitEveryHours * HOUR;
      // The latest arrival up to now.
      const arrive = visit.nextAt + Math.floor((t - visit.nextAt) / every) * every;
      visit = { guest: null, until: 0, nextAt: arrive + every };
      if (t < arrive + F.stayHours * HOUR) {
        const taken = [...allPets(s).map((p) => p.name), ...s.friends.map((f) => f.name)];
        const guest = makeWanderer(arrive, taken);
        visit = { ...visit, guest, until: arrive + F.stayHours * HOUR };
        s = logMessage(s, { kind: 'visitor', at: arrive, name: guest.name, character: guest.character, variant: guest.variant });
      }
    }
  }
  return visit === state.visit && s === state ? state : { ...s, visit };
}

// Whole days from one local date to another ("2026-10-18" to
// "2026-10-20" is 2).
function daysBetween(from: string, to: string): number {
  const utc = (day: string) => {
    const [y, m, d] = day.split('-').map(Number);
    return Date.UTC(y, m - 1, d);
  };
  return Math.round((utc(to) - utc(from)) / DAY);
}

// A day with no meeting costs `missedDay` points, but never takes a friend
// below the heart it has reached. Only whole days that are over count;
// meeting a friend settles it up to today.
export function stepFriends(state: GameState, t: number): GameState {
  const today = localDay(t);
  let changed = false;
  const settle = (f: Friend): Friend => {
    const missed = daysBetween(f.settledDay, today) - 1;
    if (missed <= 0) return f;
    changed = true;
    const floor = Math.floor(f.score / F.heartPoints) * F.heartPoints;
    const yesterday = localDay(t - DAY);
    return { ...f, score: Math.max(floor, f.score - missed * F.missedDay), settledDay: yesterday };
  };
  const friends = state.friends.map(settle);
  const guest = state.visit.guest && settle(state.visit.guest);
  return changed ? { ...state, friends, visit: { ...state.visit, guest } } : state;
}

// --- Meeting and gifts -------------------------------------------------------

export type FriendBlock =
  | 'egg' | 'asleep' | 'tooTired' | 'resting' | 'gone' | 'noFood' | 'freeFood' | 'full' | 'known';

export interface FriendResult {
  state: GameState;
  blocked?: FriendBlock;
  gained?: number; // friend score gained (0 once today's cap is reached)
}

// Can the pet you're looking after go and meet someone right now?
function meetBlock(pet: Pet, now: number): FriendBlock | null {
  if (pet.stage === 'egg') return 'egg';
  if (pet.asleep) return 'asleep';
  if (!canPlayMinigames(pet, now)) return 'resting';
  if (pet.stats.energy < -F.meet.energy) return 'tooTired';
  return null;
}

// The pets play together for a bit. Your pet cheers up (and tires a
// little), and the first few meetings each day raise the friend score.
export function meet(state: GameState, friendId: string, now: number): FriendResult {
  if (!getFriend(state, friendId)) return { state, blocked: 'gone' };
  const block = meetBlock(state.pet, now);
  if (block) return { state, blocked: block };
  const day = localDay(now);
  let gained = 0;
  let s = withFriend(state, friendId, (f) => {
    freshDay(f, day);
    if (f.metToday < F.meet.perDay) gained = Math.min(F.meet.score, 100 - f.score);
    f.metToday += 1;
    f.score = clampStat(f.score + gained);
    f.settledDay = day;
  });
  const stats = { ...s.pet.stats };
  stats.happiness = clampStat(stats.happiness + F.meet.happiness);
  stats.energy = clampStat(stats.energy + F.meet.energy);
  s = { ...s, pet: { ...s.pet, stats } };
  return { state: s, gained };
}

const FOODS = CONFIG.foods as readonly Food[];

// Gives one food to a friend. Its Shop price is its value: +1 score for
// every `goldPerPoint`, counting up to `goldPerDay` of gifts a day.
// Free food (the rice ball) can't be given.
export function giveGift(state: GameState, friendId: string, food: FoodId, now: number): FriendResult {
  if (!getFriend(state, friendId)) return { state, blocked: 'gone' };
  const value = FOODS.find((f) => f.id === food)?.price ?? 0;
  if (value <= 0) return { state, blocked: 'freeFood' };
  const stocked = useFood(state, food);
  if (!stocked) return { state, blocked: 'noFood' };
  const day = localDay(now);
  let gained = 0;
  const s = withFriend(stocked, friendId, (f) => {
    freshDay(f, day);
    const cap = F.gift.goldPerDay;
    const before = Math.min(cap, f.giftedToday);
    const after = Math.min(cap, f.giftedToday + value);
    gained = Math.min(Math.floor(after / F.gift.goldPerPoint) - Math.floor(before / F.gift.goldPerPoint), 100 - f.score);
    f.giftedToday += value;
    f.score = clampStat(f.score + gained);
  });
  return { state: s, gained };
}

// Adds the visiting wanderer to your friends. It stops being a guest: it's
// a friend you can meet any time now.
export function befriend(state: GameState): FriendResult {
  const guest = state.visit.guest;
  if (!guest) return { state, blocked: 'gone' };
  if (isFriend(state, guest.id)) return { state, blocked: 'known' };
  if (state.friends.filter((f) => f.wild).length >= F.maxWild) return { state, blocked: 'full' };
  return { state: { ...state, friends: [...state.friends, guest], visit: { ...state.visit, guest: null, until: 0 } } };
}

// Says goodbye to a friend. Little ones you already have keep it in the
// Family Tree.
export function removeFriend(state: GameState, id: string): GameState {
  return { ...state, friends: state.friends.filter((f) => f.id !== id) };
}

// --- Mingling ------------------------------------------------------------------

export type MingleBlock =
  | 'notAdult' // your pet (or the friend) isn't grown up
  | 'unwell' // your pet is asleep, sick, resting or not feeling great
  | 'hearts' // not enough hearts yet
  | 'taken' // one of them already has a different partner
  | 'family' // they're parent and little one, or brothers and sisters
  | 'wait' // they mingled recently
  | 'notFriend'; // add the guest as a friend first

// Why two pets can't mingle right now, or null if they can.
export function mingleBlock(state: GameState, friendId: string, now: number): MingleBlock | null {
  const friend = getFriend(state, friendId);
  const pet = state.pet;
  if (!friend || !isFriend(state, friendId)) return 'notFriend';
  if (pet.stage !== 'adult') return 'notAdult';
  if (pet.asleep || pet.condition !== 'healthy' || !canPlayMinigames(pet, now)) return 'unwell';
  if ((pet.partner && pet.partner !== friend.id) || (friend.partner && friend.partner !== pet.id)) return 'taken';
  const related =
    pet.parents.includes(friend.id) ||
    friend.parents.includes(pet.id) ||
    pet.parents.some((id) => friend.parents.includes(id));
  if (related) return 'family';
  if (friend.score < F.mingle.minScore) return 'hearts';
  if (friend.mingledAt > 0 && now - friend.mingledAt < F.mingle.waitDays * DAY) return 'wait';
  return null;
}

// The chance (percent) of a little one at a friend score.
export function littleOneChance(score: number): number {
  return F.mingle.chance.find((c) => score >= c.minScore)?.chance ?? 0;
}

export interface MingleResult {
  state: GameState;
  blocked?: MingleBlock | FriendBlock;
  egg?: Pet; // the little one, when there is one
  // The room was already full: one of these pets has to retire to make
  // space for the egg (see retire()).
  crowded?: boolean;
}

// How a friend is remembered in the Family Tree.
export function rememberFriend(f: Friend): FamilyMember {
  return {
    id: f.id,
    name: f.name,
    owner: '',
    fromFriend: !f.wild,
    fromWild: f.wild,
    bornAt: f.bornAt,
    character: f.character,
    variant: f.variant,
    generation: f.generation,
    parents: [...f.parents],
  };
}

// The pets meet (it counts as a meeting) and, with luck, a little one
// comes: an egg with both of them as parents, which you look after next.
// The pet that had it stays at home for now. If the room was already
// full, `crowded` says one of the others has to retire. `roll` is a number
// from 0 to 1 (Math.random() in the game, fixed in tests).
export function mingle(state: GameState, friendId: string, now: number, roll: number): MingleResult {
  const block = mingleBlock(state, friendId, now);
  if (block) return { state, blocked: block };
  const met = meet(state, friendId, now);
  if (met.blocked) return { state, blocked: met.blocked };
  let s = withFriend(met.state, friendId, (f) => (f.mingledAt = now));
  const friend = getFriend(s, friendId)!;
  if (roll * 100 >= littleOneChance(friend.score)) return { state: s };

  const parent = s.pet;
  const themes = [getCharacter(parent.character)?.theme, getCharacter(friend.character)?.theme]
    .filter((t): t is string => !!t);
  const egg = newPet(now, {
    generation: Math.max(parent.generation, friend.generation) + 1,
    parents: [parent.id, friend.id],
    themes: [...new Set(themes)],
  });
  s = withFriend(s, friendId, (f) => (f.partner = parent.id));
  // The friend goes in the Family Tree, so the little one's tree works.
  const family = s.family.some((m) => m.id === friend.id) ? s.family : [...s.family, rememberFriend(friend)];
  s = {
    ...s,
    family,
    pet: egg,
    housemates: [{ ...parent, partner: friend.id }, ...s.housemates],
  };
  s = logMessage(s, { kind: 'littleOne', at: now, name: parent.name, friend: friend.name });
  return { state: s, egg, crowded: allPets(s).length > F.maxPets };
}

// --- Pets in the room ---------------------------------------------------------

// Looks after another pet in the room: it swaps places with the one you
// were looking after.
export function switchPet(state: GameState, id: string): GameState {
  const other = state.housemates.find((p) => p.id === id);
  if (!other) return state;
  return {
    ...state,
    pet: other,
    housemates: state.housemates.map((p) => (p.id === id ? state.pet : p)),
  };
}

// A pet moves out of the room into the Family Tree. There's always at
// least one pet left; if it was the one you were looking after, the next
// one takes its place.
export function retire(state: GameState, id: string): GameState {
  const pets = allPets(state);
  const leaving = pets.find((p) => p.id === id);
  if (!leaving || pets.length < 2) return state;
  const rest = pets.filter((p) => p.id !== id);
  return {
    ...state,
    pet: rest[0],
    housemates: rest.slice(1),
    family: [...state.family, rememberPet(leaving, state.owner)],
  };
}

// With two pets in the room, the older one stands on the left. True when
// the pet you're looking after is that one (or is alone).
export function petStandsLeft(state: GameState): boolean {
  const other = state.housemates[0];
  return !other || state.pet.bornAt <= other.bornAt;
}
