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
// Each postcard tells a little story about the pet that went, from its
// likes, its trait and the place (and sometimes shows a like for the first
// time). After a few trips a pet picks a favourite place, where it finds a
// bit more. An Adventure can bring home a new friend.
//
// From the evening to the morning one more ticket is on the board, a night
// trip that lasts the night. And with a Holiday ticket (from the Star
// Shop), every pet goes to the Meadow for a day or more while everything
// at home waits: the safe way to be away.
//
// The numbers live in CONFIG.journeys.

import { CONFIG } from './config';
import type { Food, FoodId } from './actions';
import { useFood, type ShopResult } from './economy';
import { getCharacter, seededRoll, sheetFor } from './growth';
import { localDay } from './economy';
import { makeTripFriend, seenCharacters } from './friends';
import { likesOf } from './likes';
import type { LikeKind } from './likes';
import { addSeed, type CropId } from './garden';
import { logMessage } from './messages';
import { addTally, countUp } from './achievements';
import { clampStat, isNight, isRecovering } from './stats';
import { hasBackpack, isAway } from './presence';
import { percyPerks } from './regulars';
import type { Find, GameState, JournalPage, Offer, Pet, Postcard, Rarity, Story, Trip } from './state';

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
// How long an offer's trip is: a night trip lasts the night.
export const offerHours = (offer: Offer): number => (offer.night ? J.night.hours : tripHours(offer.rarity));

// The board's spots are 0 to 2; the night ticket is spot NIGHT.
export const NIGHT = 3;
export function offerAt(state: GameState, slot: number): Offer | null {
  return slot === NIGHT ? state.journeys.night ?? null : state.journeys.offers[slot] ?? null;
}

// Where a Holiday goes (not a place on the board).
export const MEADOW = 'meadow';

// ---- The places and the board ----

// A place is open once its rule is met: the market from the start, the
// woods after the first harvest, the cove after some fish, and the hill
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
// It goes somewhere not already on the board when it can, so the board
// doesn't show the same place twice.
export function rollOffer(state: GameState, slot: number, at: number): Offer {
  const open = PLACES.filter((p) => placeOpen(state, p));
  const taken = state.journeys.offers.filter((o, i) => o && i !== slot).map((o) => o!.place);
  const fresh = open.filter((p) => !taken.includes(p.id));
  const pool = fresh.length ? fresh : open;
  const key = `journey-offer:${slot}:${at}`;
  const place = pool[Math.floor(seededRoll('journeys', `${key}:place`) * pool.length)].id;
  const rarity: Rarity = slot === 0 ? 'common' : seededRoll('journeys', `${key}:rarity`) * 100 < J.odds.rare ? 'rare' : 'epic';
  return { place, rarity };
}

// Fills any empty spot on the board whose replacement is due, and puts
// the night ticket up in the evening (or takes it down in the morning).
function fillBoard(state: GameState, t: number): GameState {
  let j = state.journeys;
  // One spot at a time, so each new offer knows what's already up.
  for (const [i, o] of j.offers.entries()) {
    if (o !== null || t < j.refillAt[i]) continue;
    const offer = rollOffer({ ...state, journeys: j }, i, j.refillAt[i] || t);
    j = { ...j, offers: j.offers.map((x, k) => (k === i ? offer : x)) };
  }
  const night = nightOf(t);
  if (night && j.nightOf !== night) j = { ...j, night: rollNight(state, night), nightOf: night };
  else if (!night && j.night) j = { ...j, night: null };
  return j === state.journeys ? state : { ...state, journeys: j };
}

// Which night `t` is in (the evening's day), or null in the daytime.
export function nightOf(t: number): string | null {
  const hour = new Date(t).getHours();
  if (hour < J.night.fromHour && hour >= CONFIG.sleep.wakeHour) return null;
  return localDay(t - CONFIG.sleep.wakeHour * HOUR);
}

// The night ticket for the night of `day`.
export function rollNight(state: GameState, day: string): Offer {
  const open = PLACES.filter((p) => placeOpen(state, p));
  const key = `journey-night:${day}`;
  const place = open[Math.floor(seededRoll('journeys', `${key}:place`) * open.length)].id;
  const rarity: Rarity = seededRoll('journeys', `${key}:rarity`) * 100 < J.night.odds.rare ? 'rare' : 'epic';
  return { place, rarity, night: true };
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

// One more find if the lunchbox holds a dish made with this place's own
// ingredient (a `placeFind` effect, see CONFIG.foods). It doesn't add up:
// two such dishes still give one.
export function lunchFinds(lunch: readonly string[], placeId: string): number {
  return lunch.some((id) => FOODS.find((f) => f.id === id)?.effects?.some((e) => e.kind === 'placeFind' && e.place === placeId)) ? 1 : 0;
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
export function planTrip(pet: Pet, trip: Rarity | Offer, lunch: readonly string[]): {
  to: { hunger: number; energy: number };
  enoughFood: boolean;
  enoughEnergy: boolean;
} {
  // A night trip uses what an Adventure does: it's as long.
  const cost = typeof trip === 'string' ? J.cost[trip] : trip.night ? J.cost.epic : J.cost[trip.rarity];
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
export function tripPreview(place: Place, rarity: Rarity, charmId: string | null = null, lunch: readonly string[] = []): {
  ingredient: string;
  ingredientSure: boolean;
  gold: boolean;
  seeds: boolean;
  finds: { min: number; max: number };
  threeStar: number;
} {
  const rule = J.finds[rarity];
  const charm = getCharm(charmId);
  const extra = (charm && 'extraFinds' in charm ? charm.extraFinds : 0) + lunchFinds(lunch, place.id);
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
export function parseFind(entry: string, stars: number): Find {
  const [kind, id] = entry.split(':');
  if (kind === 'gold') return { kind: 'gold', id: '', count: Number(id), stars };
  if (kind === 'seed') return { kind: 'seed', id, count: 1, stars };
  return { kind: 'food', id: entry, count: 1, stars };
}

export const foodStars = (id: string) => FOODS.find((f) => f.id === id)?.stars ?? 1;

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
export function rollFinds(
  pet: Pet, place: Place, rarity: Rarity, startedAt: number, charmId: string | null = null, lunch: readonly string[] = [],
): Find[] {
  const roll = (label: string) => seededRoll(pet.id, `trip:${startedAt}:${label}`);
  const rule = J.finds[rarity];
  const charm = getCharm(charmId);
  const home = (getCharacter(pet.character)?.theme === place.theme ? 1 : 0) +
    (pet.favouritePlace === place.id ? J.favourite.extraFinds : 0);
  const extra = (charm && 'extraFinds' in charm ? charm.extraFinds : 0) + lunchFinds(lunch, place.id);
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
export function giveFind(state: GameState, f: Find): GameState {
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

// Writes the food and seeds in `finds` into the place's journal page
// (seeds as "seed:carrot").
function noteFound(state: GameState, place: string, finds: readonly Find[]): GameState {
  const foods = finds.filter((f) => f.kind !== 'gold').map((f) => (f.kind === 'seed' ? `seed:${f.id}` : f.id));
  if (foods.every((id) => journalPage(state, place).found.includes(id))) return state;
  return withPage(state, place, (page) => ({ ...page, found: [...page.found, ...foods.filter((id) => !page.found.includes(id))] }));
}

// ---- Postcards ----

// Which like a story shows (written into the Family Tree the first time).
const STORY_LIKES: Record<string, LikeKind> = {
  lovedFood: 'food', cuddle: 'play', tickle: 'play', dislikedFood: 'dislike', rain: 'dislike', splash: 'dislike', sunrise: 'dislike',
};

// The line on `pet`'s postcard from `trip` (with `finds`, what it brought).
// A friend made on the way or a new favourite place come first; otherwise
// it's often about something the pet loves or dislikes, else its trait or
// the place. The same trip always tells the same story.
export function storyOf(pet: Pet, trip: Trip, finds: readonly Find[], newFavourite = false): Story {
  if (trip.friend) return { id: 'friend', friend: trip.friend.name, character: trip.friend.character };
  if (newFavourite) return { id: 'favourite' };
  const roll = (label: string) => seededRoll(pet.id, `story:${trip.startedAt}:${label}`);
  const likes = likesOf(pet);
  const foods = finds.filter((f) => f.kind === 'food').map((f) => f.id);
  const liked: Story[] = [];
  if (foods.includes(likes.food)) liked.push({ id: 'lovedFood', food: likes.food });
  if (foods.includes(likes.dislike)) liked.push({ id: 'dislikedFood', food: likes.dislike });
  if (likes.dislike === 'bath' && trip.place === 'woods') liked.push({ id: 'rain' });
  if (likes.dislike === 'bath' && trip.place === 'cove') liked.push({ id: 'splash' });
  if (likes.dislike === 'woken' && (trip.night || trip.rarity === 'epic')) liked.push({ id: 'sunrise' });
  if (likes.play === 'cuddle' || likes.play === 'tickle') liked.push({ id: likes.play });
  if (liked.length > 0 && roll('liked') < J.storyLikeChance) return liked[Math.floor(roll('whichLike') * liked.length)];
  const other: Story[] = [{ id: `trait:${pet.trait}` }, { id: `place:${trip.place}:0` }, { id: `place:${trip.place}:1` }];
  return other[Math.floor(roll('which') * other.length)];
}

// A postcard from `pet` about `trip`, sent at `at`.
function postcardOf(pet: Pet, trip: Trip, at: number, story: Story, finds: readonly Find[]): Postcard {
  return {
    name: pet.name, at, pet: pet.id, look: sheetFor(pet), rarity: trip.rarity, story,
    ...(trip.night ? { night: true } : {}),
    ...(finds.some((f) => f.stars === 3) ? { star3: true } : {}),
  };
}

// Writes down a like the story showed, the first time (as feeding or
// playing would).
function noteStoryLike(state: GameState, petId: string, story: Story): GameState {
  const kind = STORY_LIKES[story.id];
  const pet = allPets(state).find((p) => p.id === petId);
  if (!kind || !pet) return state;
  const likes = likesOf(pet);
  if (likes.found.includes(kind)) return state;
  return replacePet(state, { ...pet, likes: { ...likes, found: [...likes.found, kind] } });
}

// After a finished trip to `place`: counts it, and once the pet has been
// on enough, it picks a favourite place (where it's been most; its own
// theme, then the order of the places, breaks a tie). True if it just did.
function countTravel(pet: Pet, place: string): { pet: Pet; newFavourite: boolean } {
  const travels = { ...pet.travels, [place]: (pet.travels?.[place] ?? 0) + 1 };
  const total = Object.values(travels).reduce((a, b) => a + b, 0);
  if (pet.favouritePlace || total < J.favourite.afterTrips) return { pet: { ...pet, travels }, newFavourite: false };
  const theme = getCharacter(pet.character)?.theme;
  const score = (p: Place) => (travels[p.id] ?? 0) * 2 + (p.theme === theme ? 1 : 0);
  const best = PLACES.reduce((a, b) => (score(b) > score(a) ? b : a));
  return { pet: { ...pet, travels, favouritePlace: best.id }, newFavourite: true };
}

// ---- Setting off ----

export type JourneyBlock =
  | 'tooYoung' | 'passed' | 'sick' | 'resting' | 'asleep' | 'away' | 'backpack' | 'wait' | 'sad' | 'unwell'
  | 'noOffer' | 'nobody' | 'noFood' | 'tooMuch' | 'notEnoughFood' | 'notEnoughEnergy' | 'percyBusy' | 'noCharm' | 'home'
  | 'noTicket' | 'notEnoughFragments';

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

// The friend `pet` makes on an epic trip `offer`, setting off at `now`,
// J.friend.chance of the time (null otherwise).
function tripFriend(state: GameState, pet: Pet, offer: Offer, now: number): Trip['friend'] {
  if (offer.rarity !== 'epic' || seededRoll(pet.id, `trip:${now}:friend`) >= J.friend.chance) return null;
  const theme = getPlace(offer.place)?.theme ?? 'bakery';
  const taken = [...allPets(state).map((p) => p.name), ...state.friends.map((f) => f.name)];
  return makeTripFriend(`${pet.id}-${now}`, now, theme, J.friend.stars, taken, seenCharacters(state));
}

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
  const offer = offerAt(state, slot);
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
    const plan = planTrip(pet, offer, m.lunch);
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
      endsAt: now + offerHours(offer) * HOUR,
      from: { hunger: pet.stats.hunger, energy: pet.stats.energy },
      to: plan.to,
      joy: J.joy[offer.rarity],
      finds: rollFinds(pet, getPlace(offer.place)!, offer.rarity, now, m.charm, m.lunch),
      percy: n === 0 && percy ? 'coming' : 'none',
      charm: m.charm,
      with: ids.find((id) => id !== pet.id) ?? null,
      backAt: null,
      early: false,
      ...(offer.night ? { night: true } : {}),
      friend: tripFriend(s, pet, offer, now),
    };
    trips.push({ ...pet, trip, asleep: false, lastLunch: { lunch: [...m.lunch], charm: m.charm } });
  }
  const endsAt = now + offerHours(offer!) * HOUR;
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
      night: slot === NIGHT ? null : j.night,
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
  pet.tripReadyAt = trip.holiday ? at : at + (at - trip.startedAt) * J.waitShare;
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
  const story = storyOf(pet, { ...trip, friend: null }, [find]);
  s = withPage(s, trip.place, (page) => ({ ...page, postcards: [postcardOf(pet, trip, at, story, [find]), ...page.postcards] }));
  s = noteStoryLike(s, pet.id, story);
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
    if (wasAway.has(pet.id) && hasBackpack(pet) && !pet.trip!.holiday) {
      s = logMessage(s, { kind: 'tripHome', at: pet.trip!.backAt!, name: pet.name, place: pet.trip!.place });
    }
  }
  s = endHoliday(s);
  // The garden has caught up past the Holiday.
  if (s.journeys.holiday && t >= s.journeys.holiday.until) s = { ...s, journeys: { ...s.journeys, holiday: null } };
  return lookAfterSomeoneHome(s);
}

// Pets home from a Holiday have no backpack: they're just home, and say so.
function endHoliday(state: GameState): GameState {
  const back = allPets(state).filter((p) => p.trip?.holiday && p.trip.backAt !== null);
  if (back.length === 0) return state;
  let s = state;
  for (const pet of back) s = replacePet(s, { ...pet, trip: null });
  return logMessage(s, { kind: 'holidayHome', at: back[0].trip!.backAt!, names: back.map((p) => p.name) });
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
  if (pet.trip!.holiday) {
    // Everyone on the Holiday comes home together.
    let s = state;
    for (const p of allPets(state).filter((q) => isAway(q) && q.trip!.holiday)) {
      const home: Pet = { ...p, stats: { ...p.stats }, trip: { ...p.trip!, early: true } };
      comeHome(home, now);
      s = replacePet(s, home);
    }
    const h = s.journeys.holiday;
    s = { ...s, journeys: { ...s.journeys, holiday: h ? { ...h, until: Math.min(h.until, now) } : null } };
    return { state: lookAfterSomeoneHome(endHoliday(s)) };
  }
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
export function openBackpack(state: GameState, petId: string): {
  state: GameState; finds: Find[]; place: string | null; postcard: Postcard | null; friend: string | null;
} {
  const pet = allPets(state).find((p) => p.id === petId);
  if (!pet || !hasBackpack(pet)) return { state, finds: [], place: null, postcard: null, friend: null };
  const trip = pet.trip!;
  const counted = trip.early ? { pet, newFavourite: false } : countTravel(pet, trip.place);
  let s = replacePet(state, { ...counted.pet, trip: null });
  for (const f of trip.finds) s = giveFind(s, f);
  s = noteFound(s, trip.place, trip.finds);
  // A 3-star find counts for Epic Finder even on a trip cut short: it's home.
  const epic = trip.finds.filter((f) => f.stars === 3).length;
  if (epic > 0) s = addTally(s, 'epicFinds', epic);
  let postcard: Postcard | null = null;
  let friend: string | null = null;
  if (!trip.early) {
    const stamp = trip.night ? 'night' : trip.rarity;
    // Percy brought this trip's postcard already, unless there's news.
    if (trip.percy !== 'flown' || trip.friend || counted.newFavourite) {
      const story = storyOf(counted.pet, trip, trip.finds, counted.newFavourite);
      postcard = postcardOf(counted.pet, trip, trip.backAt!, story, trip.finds);
      s = noteStoryLike(s, pet.id, story);
    }
    s = withPage(s, trip.place, (page) => ({
      ...page,
      trips: page.trips + 1,
      best: !page.best || RARITIES.indexOf(trip.rarity) > RARITIES.indexOf(page.best) ? trip.rarity : page.best,
      postcards: postcard ? [postcard, ...page.postcards] : page.postcards,
      stamps: (page.stamps ?? []).includes(stamp) ? page.stamps : [...(page.stamps ?? []), stamp],
    }));
    s = addTally(s, 'journeys');
    if (trip.rarity === 'epic') s = addTally(s, 'adventures');
    // Each pet's backpack counts, so a trip together counts twice: the
    // Travel Buddies milestone only asks for one.
    if (trip.with) s = countUp(s, 'together');
    // A friend made on the way joins your friends.
    if (trip.friend && !s.friends.some((f) => f.id === trip.friend!.id)) {
      s = { ...s, friends: [...s.friends, trip.friend] };
      s = logMessage(s, { kind: 'tripFriend', at: trip.backAt!, name: pet.name, friend: trip.friend.name, place: trip.place });
      friend = trip.friend.name;
    }
  }
  return { state: s, finds: trip.finds, place: trip.place, postcard, friend };
}

// Everything a place can give, for its "Found here" page in the journal:
// its own ingredient first, then foods and seeds ("seed:carrot"), no gold.
export function placeFinds(place: Place): string[] {
  const all = [place.ingredient, ...place.finds[1], ...place.finds[2], ...place.finds[3]] as string[];
  return [...new Set(all.filter((e) => !e.startsWith('gold:')))];
}

// The level a place's page has reached by its number of trips: 0 before
// the first, then Visitor, Regular, Local and Legend.
export function placeLevel(trips: number): number {
  return J.levels.filter((n) => trips >= n).length;
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

// ---- Holidays ----

export const holidayTickets = (state: GameState): number => state.inventory.supplies['ticket:holiday'] ?? 0;

// Buys a Holiday ticket in the Star Shop, for star fragments.
export function buyHolidayTicket(state: GameState): ShopResult {
  const cost = J.holiday.fragments;
  if (state.fragments.pieces < cost) return { state, blocked: 'notEnoughFragments' };
  const supplies = { ...state.inventory.supplies, 'ticket:holiday': holidayTickets(state) + 1 };
  return {
    state: {
      ...state,
      fragments: { ...state.fragments, pieces: state.fragments.pieces - cost },
      inventory: { ...state.inventory, supplies },
    },
  };
}

// Why the pets can't go on a Holiday now (null if they can): every pet
// goes, so nobody can be away, have a backpack to open, or be sick.
export function cantHoliday(state: GameState): { blocked: JourneyBlock; pet?: string } | null {
  if (holidayTickets(state) < 1) return { blocked: 'noTicket' };
  for (const pet of allPets(state)) {
    if (pet.condition === 'passed') continue;
    if (isAway(pet)) return { blocked: 'away', pet: pet.id };
    if (hasBackpack(pet)) return { blocked: 'backpack', pet: pet.id };
    if (pet.condition === 'sick') return { blocked: 'sick', pet: pet.id };
  }
  return null;
}

// Every pet goes on a Holiday in the Meadow for `days` days, with a
// ticket. Hunger, energy and everything else stay as they are until
// they're home (with a little joy), and the garden waits too. The state
// should already be caught up to `now`.
export function goHoliday(state: GameState, now: number, days: number): JourneyResult & { pet?: string } {
  const why = cantHoliday(state);
  if (why) return { state, ...why };
  if (!(J.holiday.days as readonly number[]).includes(days)) return { state, blocked: 'noOffer' };
  const until = now + days * 24 * HOUR;
  const going = allPets(state).filter((p) => p.condition !== 'passed');
  let s: GameState = {
    ...state,
    inventory: { ...state.inventory, supplies: { ...state.inventory.supplies, 'ticket:holiday': holidayTickets(state) - 1 } },
  };
  for (const pet of going) {
    const now2 = { hunger: pet.stats.hunger, energy: pet.stats.energy };
    const trip: Trip = {
      place: MEADOW, rarity: 'common', startedAt: now, endsAt: until, from: now2, to: now2, joy: J.holiday.joy,
      finds: [], percy: 'none', charm: null, with: null, backAt: null, early: false, holiday: true,
    };
    s = replacePet(s, { ...pet, trip, asleep: false });
  }
  s = {
    ...s,
    craving: { ...s.craving, food: null, nextAt: Math.max(s.craving.nextAt, until) },
    journeys: { ...s.journeys, holiday: { from: now, until } },
  };
  return { state: s };
}
