// Journeys: a teen or grown-up pet goes out to one of four places for a
// while and comes home with a backpack of finds.
//
// The board always has three offers. Each is a place and a rarity, and the
// rarity sets the length: common is a 1-hour Stroll, rare a 4-hour Hike and
// epic a 10-hour Adventure. The first spot is always common. A taken offer
// is replaced a few hours later, and the board is shared by every pet.
//
// Before it sets off, the trip is checked: the pet's tummy and energy plus
// the lunchbox have to cover what the trip uses, with the pet still at or
// above the low line when it's home. So a journey never makes a pet sad or
// sick. On the way, tummy and energy go down in a straight line from where
// they were to where they'll end up (it eats its lunch as it goes); joy and
// health wait, it can't get sick, and growing up is paused.
//
// One pet can go, or both together on the same trip, each with its own
// lunchbox and backpack (they're picked in the line-up before packing).
// What it finds is rolled when it sets off and stays a surprise until the
// backpack is opened. Percy can come along if he's picked before setting
// off: halfway (or when the trip is called off early) he flies home with
// the best find, then rests for a couple of days.
//
// The numbers live in CONFIG.journeys.

import { CONFIG } from './config';
import type { Food, FoodId } from './actions';
import { useFood, type ShopResult } from './economy';
import { getCharacter, seededRoll } from './growth';
import { addSeed, type CropId } from './garden';
import { logMessage } from './messages';
import { addTally, countUp } from './achievements';
import { clampStat, isNight, isRecovering } from './stats';
import { hasBackpack, isAway } from './presence';
import { percyPerks } from './regulars';
import type { Find, GameState, JournalPage, Offer, Pet, Rarity, Trip } from './state';

const HOUR = 3_600_000;
const J = CONFIG.journeys;
const FOODS = CONFIG.foods as readonly Food[];

export type Place = (typeof J.places)[number];
export type PlaceId = Place['id'];
export const PLACES = J.places as readonly Place[];
export const RARITIES: readonly Rarity[] = ['common', 'rare', 'epic'];

export const getPlace = (id: string): Place | undefined => PLACES.find((p) => p.id === id);
export type Charm = (typeof J.charms)[number];
export const CHARMS = J.charms as readonly Charm[];
export const getCharm = (id: string | null | undefined): Charm | undefined => CHARMS.find((c) => c.id === id);
export const tripHours = (rarity: Rarity): number => J.hours[rarity];

// ---- The places and the board ----

// A place is open once its rule is met: the market from the start, the
// woods after the first harvest, the caves after some fish, and the hill
// once a pet has grown up.
export function placeOpen(state: GameState, place: Place): boolean {
  switch (place.opens) {
    case 'start':
      return true;
    case 'harvest':
      return (state.grown ?? []).length > 0;
    case 'fish':
      return (state.tally.fish ?? 0) >= J.fishToOpen;
    case 'grownUp':
      return state.charactersFound.length > 0;
  }
}

// The offer for spot `slot` made at time `at`. The same spot and time
// always give the same offer, so the board can be filled inside simulate().
export function rollOffer(state: GameState, slot: number, at: number): Offer {
  const open = PLACES.filter((p) => placeOpen(state, p));
  const key = `journey-offer:${slot}:${at}`;
  const place = open[Math.floor(seededRoll('journeys', `${key}:place`) * open.length)].id;
  const rarity: Rarity = slot === 0 ? 'common' : seededRoll('journeys', `${key}:rarity`) * 100 < J.odds.rare ? 'rare' : 'epic';
  return { place, rarity };
}

// Fills any empty spot on the board whose replacement is due.
function fillBoard(state: GameState, t: number): GameState {
  const j = state.journeys;
  if (j.offers.every((o, i) => o !== null || t < j.refillAt[i])) return state;
  const offers = j.offers.map((o, i) => o ?? (t >= j.refillAt[i] ? rollOffer(state, i, j.refillAt[i] || t) : null));
  return { ...state, journeys: { ...j, offers } };
}

// ---- The lunchbox and the trip check ----

// A drink is anything that gives energy: it goes in the drink spot.
export const isDrink = (id: string): boolean => (FOODS.find((f) => f.id === id)?.energy ?? 0) > 0;

// Charms are kept with the supplies, as "charm:clover" and so on.
export const charmCount = (state: GameState, id: string): number => state.inventory.supplies[`charm:${id}`] ?? 0;

export function buyCharm(state: GameState, id: string): ShopResult {
  const charm = getCharm(id);
  if (!charm) return { state, blocked: 'soldOut' };
  if (state.gold < charm.price) return { state, blocked: 'notEnoughGold' };
  const supplies = { ...state.inventory.supplies, [`charm:${id}`]: charmCount(state, id) + 1 };
  return { state: { ...state, gold: state.gold - charm.price, inventory: { ...state.inventory, supplies } } };
}

// What a lunchbox adds up to.
export function lunchValue(lunch: readonly string[]): { hunger: number; energy: number } {
  return lunch.reduce((sum, id) => {
    const f = FOODS.find((food) => food.id === id);
    return { hunger: sum.hunger + (f?.hunger ?? 0), energy: sum.energy + (f?.energy ?? 0) };
  }, { hunger: 0, energy: 0 });
}

// Where the pet's tummy and energy end up after the trip, and whether
// that's enough (at or above the low line).
export function planTrip(pet: Pet, rarity: Rarity, lunch: readonly string[]): {
  to: { hunger: number; energy: number };
  enoughFood: boolean;
  enoughEnergy: boolean;
} {
  const cost = J.cost[rarity];
  const packed = lunchValue(lunch);
  const to = {
    hunger: clampStat(pet.stats.hunger + packed.hunger - cost.hunger),
    energy: clampStat(pet.stats.energy + packed.energy - cost.energy),
  };
  const low = CONFIG.lowStatThreshold;
  return { to, enoughFood: to.hunger >= low, enoughEnergy: to.energy >= low };
}

// Pots that will be dry before `until` (so may get sick with nobody home
// to water them): growing, healthy plants whose soil dries out by then.
export function potsDryingBy(state: GameState, until: number): number {
  return state.garden.filter((p) => p.crop && !p.dead && p.sickSince === null && p.moistUntil < until &&
    p.growth < (CONFIG.garden.crops.find((c) => c.id === p.crop)?.hours ?? 0) * HOUR).length;
}

// ---- Finds ----

// What a trip to `place` of `rarity` might bring home, for the trip's info
// card: the place's own ingredient (always on rare and epic trips), whether
// gold and seeds can turn up, how many finds, and the chance of a 3-star
// find (epic trips only).
export function tripPreview(place: Place, rarity: Rarity, charmId: string | null = null): {
  ingredient: string;
  ingredientSure: boolean;
  gold: boolean;
  seeds: boolean;
  finds: { min: number; max: number };
  threeStar: number;
} {
  const rule = J.finds[rarity];
  const charm = getCharm(charmId);
  const extra = charm && 'extraFinds' in charm ? charm.extraFinds : 0;
  const twoStar = rule.twoStarChance + (charm && 'twoStar' in charm ? charm.twoStar : 0) > 0;
  const entries = [...place.finds[1], ...(twoStar ? place.finds[2] : []), ...(rarity === 'epic' ? place.finds[3] : [])] as string[];
  return {
    ingredient: place.ingredient,
    ingredientSure: rarity !== 'common',
    gold: entries.some((e) => e.startsWith('gold:')),
    seeds: entries.some((e) => e.startsWith('seed:')),
    finds: { min: rule.min + extra, max: rule.max + extra },
    threeStar: threeStarChance(rarity, charm),
  };
}

// "gold:12", "seed:pumpkin" or a food id, as a find of `stars`.
function parseFind(entry: string, stars: number): Find {
  const [kind, id] = entry.split(':');
  if (kind === 'gold') return { kind: 'gold', id: '', count: Number(id), stars };
  if (kind === 'seed') return { kind: 'seed', id, count: 1, stars };
  return { kind: 'food', id: entry, count: 1, stars };
}

const foodStars = (id: string) => FOODS.find((f) => f.id === id)?.stars ?? 1;

// The chance of a 3-star find: epic trips only, unless a charm helps.
function threeStarChance(rarity: Rarity, charm: Charm | undefined): number {
  const base = rarity === 'epic' ? J.threeStarChance : 0;
  const bonus = charm && 'threeStar' in charm ? (charm.threeStar as Partial<Record<Rarity, number>>)[rarity] ?? 0 : 0;
  return Math.min(1, base + bonus);
}

// What a trip brings home, rolled from the pet's id and when it set off.
// The place's own ingredient comes first, then finds of 1 or 2 stars (and
// on an epic trip, sometimes one of 3 stars). The same finds of a kind are
// put together.
export function rollFinds(pet: Pet, place: Place, rarity: Rarity, startedAt: number, charmId: string | null = null): Find[] {
  const roll = (label: string) => seededRoll(pet.id, `trip:${startedAt}:${label}`);
  const rule = J.finds[rarity];
  const charm = getCharm(charmId);
  const home = getCharacter(pet.character)?.theme === place.theme ? 1 : 0;
  const extra = charm && 'extraFinds' in charm ? charm.extraFinds : 0;
  const twoStar = Math.min(1, rule.twoStarChance + (charm && 'twoStar' in charm ? charm.twoStar : 0));
  const count = rule.min + Math.floor(roll('count') * (rule.max - rule.min + 1)) + home + extra;
  const finds: Find[] = [];
  const ingredients = rarity === 'epic' ? 2 : rarity === 'rare' ? 1 : roll('ingredient') < J.ingredientChance ? 1 : 0;
  if (ingredients > 0) finds.push({ kind: 'food', id: place.ingredient, count: ingredients, stars: foodStars(place.ingredient) });
  const pick = (stars: 1 | 2 | 3, n: string): Find => {
    const list = place.finds[stars] as readonly string[];
    return parseFind(list[Math.floor(roll(`pick:${n}`) * list.length)], stars);
  };
  for (let i = finds.length; i < count; i++) finds.push(pick(roll(`stars:${i}`) < twoStar ? 2 : 1, String(i)));
  if (roll('three') < threeStarChance(rarity, charm)) finds[finds.length - 1] = pick(3, 'three');
  // Put the same things together (gold adds up too).
  const merged: Find[] = [];
  for (const f of finds) {
    const same = merged.find((m) => m.kind === f.kind && m.id === f.id);
    if (same) {
      same.count += f.count;
      same.stars = Math.max(same.stars, f.stars);
    } else merged.push({ ...f });
  }
  return merged;
}

// The best find: the most stars, and the first of those.
export function bestFind(finds: readonly Find[]): number {
  return finds.reduce((best, f, i) => (f.stars > finds[best].stars ? i : best), 0);
}

// Puts a find into the inventory (or the gold purse).
function giveFind(state: GameState, f: Find): GameState {
  if (f.kind === 'gold') return { ...state, gold: state.gold + f.count };
  if (f.kind === 'seed') {
    let s = state;
    for (let n = 0; n < f.count; n++) s = addSeed(s, f.id as CropId);
    return s;
  }
  const food = { ...state.inventory.food, [f.id]: (state.inventory.food[f.id] ?? 0) + f.count };
  return { ...state, inventory: { ...state.inventory, food } };
}

function journalPage(state: GameState, place: string): JournalPage {
  return state.journeys.journal[place] ?? { trips: 0, postcards: [], found: [] };
}

function withPage(state: GameState, place: string, change: (page: JournalPage) => JournalPage): GameState {
  const journal = { ...state.journeys.journal, [place]: change(journalPage(state, place)) };
  return { ...state, journeys: { ...state.journeys, journal } };
}

// Writes the food in `finds` into the place's journal page.
function noteFound(state: GameState, place: string, finds: readonly Find[]): GameState {
  const foods = finds.filter((f) => f.kind === 'food').map((f) => f.id);
  if (foods.every((id) => journalPage(state, place).found.includes(id))) return state;
  return withPage(state, place, (page) => ({ ...page, found: [...page.found, ...foods.filter((id) => !page.found.includes(id))] }));
}

// ---- Setting off ----

export type JourneyBlock =
  | 'tooYoung' | 'passed' | 'sick' | 'resting' | 'asleep' | 'away' | 'backpack' | 'wait' | 'sad' | 'unwell'
  | 'noOffer' | 'nobody' | 'noFood' | 'tooMuch' | 'notEnoughFood' | 'notEnoughEnergy' | 'percyBusy' | 'noCharm' | 'home';

export interface JourneyResult {
  state: GameState;
  blocked?: JourneyBlock;
}

// Why `pet` can't go on a journey right now (null if it can).
export function cantGo(pet: Pet, now: number): JourneyBlock | null {
  if (pet.stage === 'egg' || pet.stage === 'baby') return 'tooYoung';
  if (pet.condition === 'passed') return 'passed';
  if (isAway(pet)) return 'away';
  if (hasBackpack(pet)) return 'backpack';
  if (pet.condition === 'sick') return 'sick';
  if (isRecovering(pet, now)) return 'resting';
  if (pet.asleep) return 'asleep';
  if (now < pet.tripReadyAt) return 'wait';
  const low = CONFIG.lowStatThreshold;
  if (pet.stats.happiness < low) return 'sad';
  if (pet.stats.health < low) return 'unwell';
  return null;
}

export const percyFree = (state: GameState, now: number): boolean => now >= state.journeys.percyFreeAt;

// One pet in the line-up, with its own lunch (food ids: up to two foods
// and a drink) and charm.
export interface Packed {
  pet: string;
  lunch: readonly FoodId[];
  charm: string | null;
}

// The pet you're looking after sets off on the offer in spot `slot`, with
// `lunch` packed, a charm if `charm` and Percy along if `percy`.
export function setOff(
  state: GameState, now: number, slot: number, lunch: readonly FoodId[], percy: boolean, charm: string | null = null,
): JourneyResult {
  return goTogether(state, now, slot, [{ pet: state.pet.id, lunch, charm }], percy);
}

// The pets in `party` (one, or both) set off together on the offer in spot
// `slot`, each with its own lunch and charm (used up now), and Percy along
// if `percy` (he goes with the first, and flies home with its best find).
// The state should already be caught up to `now`. If a pet stays home, you
// look after it while the others are away. If something's wrong, `pet` says
// whose it is.
export function goTogether(
  state: GameState, now: number, slot: number, party: readonly Packed[], percy: boolean,
): JourneyResult & { pet?: string } {
  const offer = state.journeys.offers[slot];
  const ids = party.map((m) => m.pet);
  const pets = ids.map((id) => allPets(state).find((p) => p.id === id));
  if (!party.length || new Set(ids).size !== ids.length || pets.some((p) => !p)) return { state, blocked: 'nobody' };
  let s: GameState = state;
  const trips: Pet[] = [];
  for (const [n, m] of party.entries()) {
    const pet = pets[n]!;
    const stop = (blocked: JourneyBlock) => ({ state, blocked, pet: pet.id });
    const why = cantGo(pet, now);
    if (why) return stop(why);
    if (!offer) return stop('noOffer');
    const drinks = m.lunch.filter(isDrink).length;
    if (drinks > J.lunch.drink || m.lunch.length - drinks > J.lunch.food) return stop('tooMuch');
    if (m.charm && (!getCharm(m.charm) || charmCount(s, m.charm) < 1)) return stop('noCharm');
    const plan = planTrip(pet, offer.rarity, m.lunch);
    if (!plan.enoughFood) return stop('notEnoughFood');
    if (!plan.enoughEnergy) return stop('notEnoughEnergy');
    if (n === 0 && percy && !percyFree(state, now)) return stop('percyBusy');
    for (const id of m.lunch) {
      const used = useFood(s, id);
      if (!used) return stop('noFood');
      s = used;
    }
    if (m.charm) {
      const supplies = { ...s.inventory.supplies, [`charm:${m.charm}`]: charmCount(s, m.charm) - 1 };
      s = { ...s, inventory: { ...s.inventory, supplies } };
    }
    const trip: Trip = {
      place: offer.place,
      rarity: offer.rarity,
      startedAt: now,
      endsAt: now + tripHours(offer.rarity) * HOUR,
      from: { hunger: pet.stats.hunger, energy: pet.stats.energy },
      to: plan.to,
      joy: J.joy[offer.rarity],
      finds: rollFinds(pet, getPlace(offer.place)!, offer.rarity, now, m.charm),
      percy: n === 0 && percy ? 'coming' : 'none',
      charm: m.charm,
      with: ids.find((id) => id !== pet.id) ?? null,
      backAt: null,
      early: false,
    };
    trips.push({ ...pet, trip, asleep: false });
  }
  const endsAt = now + tripHours(offer!.rarity) * HOUR;
  for (const pet of trips) s = replacePet(s, pet);
  const j = s.journeys;
  s = {
    ...s,
    // The craving was the pet you're looking after's: it goes with it.
    craving: ids.includes(state.pet.id) ? { ...s.craving, food: null, nextAt: Math.max(s.craving.nextAt, endsAt) } : s.craving,
    journeys: {
      ...j,
      offers: j.offers.map((o, i) => (i === slot ? null : o)),
      refillAt: j.refillAt.map((at, i) => (i === slot ? now + J.refillHours * HOUR : at)),
      percyFreeAt: percy ? now + (endsAt - now) / 2 + percyPerks(state).restHours * HOUR : j.percyFreeAt,
    },
  };
  return { state: lookAfterSomeoneHome(s) };
}

// ---- On the way, and coming home ----

// Moves a travelling pet along to time `t` (inside simulate's tick, on its
// own copy of the pet). Returns false if it isn't away, so the normal tick
// runs instead.
export function travelTick(pet: Pet, t: number): boolean {
  const trip = pet.trip;
  if (!trip || trip.backAt !== null) return false;
  if (t >= trip.endsAt) {
    comeHome(pet, trip.endsAt);
    return true;
  }
  const done = (t - trip.startedAt) / (trip.endsAt - trip.startedAt);
  pet.stats.hunger = trip.from.hunger + (trip.to.hunger - trip.from.hunger) * done;
  pet.stats.energy = trip.from.energy + (trip.to.energy - trip.from.energy) * done;
  return true;
}

// The pet is home at time `at` (changes `pet` in place). It catches up on
// the trip's joy, its growing-up clock skips the time it was away, and at
// night it goes straight to bed.
function comeHome(pet: Pet, at: number): void {
  const trip = pet.trip!;
  const done = Math.min(1, (at - trip.startedAt) / (trip.endsAt - trip.startedAt));
  pet.stats.hunger = trip.from.hunger + (trip.to.hunger - trip.from.hunger) * done;
  pet.stats.energy = trip.from.energy + (trip.to.energy - trip.from.energy) * done;
  pet.stats.happiness = clampStat(pet.stats.happiness + trip.joy * done);
  pet.stageStartedAt += at - trip.startedAt;
  pet.asleep = isNight(at);
  pet.tripReadyAt = at + (at - trip.startedAt) * J.waitShare;
  pet.trip = { ...trip, backAt: at };
}

// Percy flies home with the best find from `pet`'s trip at time `at`. It
// goes straight into the inventory, with a postcard for the journal.
function percyFlies(state: GameState, pet: Pet, at: number): GameState {
  const trip = pet.trip!;
  const i = bestFind(trip.finds);
  const find = trip.finds[i];
  const changed: Pet = { ...pet, trip: { ...trip, percy: 'flown', finds: trip.finds.filter((_, n) => n !== i) } };
  let s = replacePet(state, changed);
  if (!find) return s;
  s = noteFound(giveFind(s, find), trip.place, [find]);
  if (find.stars === 3) s = addTally(s, 'epicFinds');
  s = withPage(s, trip.place, (page) => ({ ...page, postcards: [{ name: pet.name, at }, ...page.postcards] }));
  return logMessage(s, { kind: 'courier', at, name: pet.name, place: trip.place, find });
}

function replacePet(state: GameState, pet: Pet): GameState {
  if (state.pet.id === pet.id) return { ...state, pet };
  return { ...state, housemates: state.housemates.map((p) => (p.id === pet.id ? pet : p)) };
}

const allPets = (state: GameState) => [state.pet, ...state.housemates];

// Moves journeys along to time `t` (simulate() calls this after the pets'
// ticks, with the game as it was before): the board fills up, Percy flies
// home halfway, and a pet that came home says so in Messages (and is the
// one you look after, if the other is still away).
export function stepJourneys(before: GameState, state: GameState, t: number): GameState {
  let s = fillBoard(state, t);
  for (const pet of allPets(s)) {
    const trip = pet.trip;
    if (trip?.percy === 'coming' && t >= trip.startedAt + (trip.endsAt - trip.startedAt) / 2) {
      s = percyFlies(s, pet, trip.startedAt + (trip.endsAt - trip.startedAt) / 2);
    }
  }
  const wasAway = new Set(allPets(before).filter(isAway).map((p) => p.id));
  for (const pet of allPets(s)) {
    if (wasAway.has(pet.id) && hasBackpack(pet)) {
      s = logMessage(s, { kind: 'tripHome', at: pet.trip!.backAt!, name: pet.name, place: pet.trip!.place });
    }
  }
  return lookAfterSomeoneHome(s);
}

// While the pet you're looking after is away, look after one that's home.
function lookAfterSomeoneHome(state: GameState): GameState {
  if (!isAway(state.pet)) return state;
  const home = state.housemates.find((p) => !isAway(p));
  if (!home) return state;
  return { ...state, pet: home, housemates: state.housemates.map((p) => (p.id === home.id ? state.pet : p)) };
}

// Calls a pet home early (the state should already be caught up to
// `now`), and the pet that went with it, if any. Each brings home the
// share of its finds for how much of the trip it did, rounded down. If
// Percy came along and hasn't flown yet, he brings the best find straight
// away, so it's never for nothing.
export function callHome(state: GameState, now: number, petId: string): JourneyResult {
  const pet = allPets(state).find((p) => p.id === petId);
  if (!pet || !isAway(pet)) return { state, blocked: 'home' };
  const mate = allPets(state).find((p) => p.id === pet.trip!.with && isAway(p) && p.trip!.startedAt === pet.trip!.startedAt);
  let s = callOneHome(state, now, pet.id);
  if (mate) s = callOneHome(s, now, mate.id);
  return { state: s };
}

function callOneHome(state: GameState, now: number, petId: string): GameState {
  let s = state;
  const pet = allPets(s).find((p) => p.id === petId)!;
  if (pet.trip!.percy === 'coming') {
    s = percyFlies(s, pet, now);
    s = { ...s, journeys: { ...s.journeys, percyFreeAt: now + percyPerks(s).restHours * HOUR } };
  }
  const flown = allPets(s).find((p) => p.id === petId)!;
  const trip = flown.trip!;
  const done = (now - trip.startedAt) / (trip.endsAt - trip.startedAt);
  const home: Pet = {
    ...flown,
    stats: { ...flown.stats },
    trip: { ...trip, early: true, finds: trip.finds.slice(0, Math.floor(trip.finds.length * done)) },
  };
  comeHome(home, now);
  s = replacePet(s, home);
  return logMessage(s, { kind: 'tripHome', at: now, name: home.name, place: trip.place });
}

// Opens the backpack of a pet that's home: everything in it goes into the
// inventory, and a finished trip goes into the travel journal and counts
// for the journey badges. Returns what was in it.
export function openBackpack(state: GameState, petId: string): { state: GameState; finds: Find[]; place: string | null } {
  const pet = allPets(state).find((p) => p.id === petId);
  if (!pet || !hasBackpack(pet)) return { state, finds: [], place: null };
  const trip = pet.trip!;
  let s = replacePet(state, { ...pet, trip: null });
  for (const f of trip.finds) s = giveFind(s, f);
  s = noteFound(s, trip.place, trip.finds);
  // A 3-star find counts for Epic Finder even on a trip cut short: it's home.
  const epic = trip.finds.filter((f) => f.stars === 3).length;
  if (epic > 0) s = addTally(s, 'epicFinds', epic);
  if (!trip.early) {
    s = withPage(s, trip.place, (page) => ({
      ...page,
      trips: page.trips + 1,
      best: !page.best || RARITIES.indexOf(trip.rarity) > RARITIES.indexOf(page.best) ? trip.rarity : page.best,
      postcards: trip.percy === 'flown' ? page.postcards : [{ name: pet.name, at: trip.backAt! }, ...page.postcards],
    }));
    s = addTally(s, 'journeys');
    if (trip.rarity === 'epic') s = addTally(s, 'adventures');
    // Each pet's backpack counts, so a trip together counts twice: the
    // Travel Buddies milestone only asks for one.
    if (trip.with) s = countUp(s, 'together');
  }
  return { state: s, finds: trip.finds, place: trip.place };
}

// Wakes Percy up early, for gold (in the Shop).
export function restPercy(state: GameState, now: number): { state: GameState; blocked?: 'notTired' | 'notEnoughGold' } {
  if (percyFree(state, now)) return { state, blocked: 'notTired' };
  if (state.gold < J.percy.resetPrice) return { state, blocked: 'notEnoughGold' };
  // He can't leave a trip he's still on: he's free once he's flown home.
  const flying = allPets(state).some((p) => p.trip?.percy === 'coming');
  if (flying) return { state, blocked: 'notTired' };
  return { state: { ...state, gold: state.gold - J.percy.resetPrice, journeys: { ...state.journeys, percyFreeAt: now } } };
}
