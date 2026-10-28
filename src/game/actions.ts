// Things the player can do. Each action first catches the world up to "now"
// with simulate(), then applies its effect. Some actions can be refused (for
// example, you can't play with a sleeping pet); then `blocked` says why and
// the state is returned unchanged apart from the catch-up.

import { CONFIG } from './config';
import { simulate } from './simulate';
import { clampStat } from './stats';
import { stageLengthMs } from './growth';
import { revivalStars, useFood } from './economy';
import { satisfyCraving } from './craving';
import { newPet, type GameState, type Pet } from './state';
import { rememberPet } from './family';
import { retire } from './friends';
import { isAway } from './presence';
import { feeling, noticeFeeling } from './likes';

export type BlockReason = 'egg' | 'asleep' | 'tooFull' | 'tooTired' | 'notSick' | 'noFood' | 'resting' | 'passed' | 'noRevival' | 'away';

export interface ActionResult {
  state: GameState;
  blocked?: BlockReason;
  craved?: number; // fed what the pet was craving: the gold tip it gave
  // Its favourite food or way to play ('loved'), or its dislike ('disliked'):
  // the face it pulls after (see src/game/likes.ts).
  felt?: 'loved' | 'disliked';
}

// Helper: returns a copy of the state with the pet changed by `change`.
export function withPet(state: GameState, change: (pet: Pet) => void): GameState {
  const pet: Pet = { ...state.pet, stats: { ...state.pet.stats }, buffs: [...state.pet.buffs] };
  change(pet);
  return { ...state, pet };
}

export type FoodSource = 'shop' | 'staple' | 'caught' | 'grown' | 'found' | 'cooked';
export type FoodTag = 'drink' | 'soup' | 'sweet' | 'seafood' | 'veg' | 'fruit' | 'grain' | 'dairy' | 'seasoning';
// What a food does besides its stats (see `foods` in config.ts).
export type FoodEffect = { kind: 'slowHunger'; percent: number; hours: number };

export type Food = (typeof CONFIG.foods)[number] & {
  source: FoodSource;
  tags: readonly FoodTag[];
  effects?: readonly FoodEffect[];
  energy?: number;
  limited?: boolean;
  stars?: number;
};
export type FoodId = Food['id'];

// A food's effect of this kind, if it has one.
export function effectOf<K extends FoodEffect['kind']>(food: Food, kind: K): Extract<FoodEffect, { kind: K }> | undefined {
  return food.effects?.find((e): e is Extract<FoodEffect, { kind: K }> => e.kind === kind);
}
export type ActivityId = (typeof CONFIG.activities)[number]['id'];

export function feed(state: GameState, now: number, foodId: FoodId = 'riceBall'): ActionResult {
  const s = simulate(state, now);
  if (isAway(s.pet)) return { state: s, blocked: 'away' };
  if (s.pet.condition === 'passed') return { state: s, blocked: 'passed' };
  if (s.pet.stage === 'egg') return { state: s, blocked: 'egg' };
  if (s.pet.asleep) return { state: s, blocked: 'asleep' };
  if (s.pet.stats.hunger > CONFIG.tooFullAbove) return { state: s, blocked: 'tooFull' };
  const food: Food = CONFIG.foods.find((f) => f.id === foodId)!;
  const stocked = useFood(s, foodId); // one fewer in the inventory
  if (!stocked) return { state: s, blocked: 'noFood' };
  const recentFoods = [foodId, ...stocked.recentFoods.filter((id) => id !== foodId)];
  const fed = withPet({ ...stocked, recentFoods }, (pet) => {
    pet.stats.hunger = clampStat(pet.stats.hunger + food.hunger);
    pet.stats.happiness = clampStat(pet.stats.happiness + food.happiness);
    pet.stats.health = clampStat(pet.stats.health + food.health);
    if (food.energy) pet.stats.energy = clampStat(pet.stats.energy + food.energy);
    const slowHunger = effectOf(food, 'slowHunger');
    if (slowHunger) {
      // Eating it again restarts the timer (effects don't stack).
      const until = now + slowHunger.hours * 3_600_000;
      pet.buffs = [
        ...pet.buffs.filter((b) => b.stat !== 'hunger'),
        { stat: 'hunger', percent: slowHunger.percent, until },
      ];
    }
  });
  // Just what it was craving? A little extra on top.
  const { state: craved, tip } = satisfyCraving(fed, foodId, now);
  const felt = feeling(s.pet, 'food', foodId);
  const next = noticeFeeling(craved, 'food', felt);
  return { state: next, ...(tip > 0 ? { craved: tip } : {}), ...(felt ? { felt } : {}) };
}

export function play(state: GameState, now: number, activityId: ActivityId = 'cuddle'): ActionResult {
  const s = simulate(state, now);
  if (isAway(s.pet)) return { state: s, blocked: 'away' };
  if (s.pet.condition === 'passed') return { state: s, blocked: 'passed' };
  if (s.pet.stage === 'egg') return { state: s, blocked: 'egg' };
  if (s.pet.asleep) return { state: s, blocked: 'asleep' };
  const activity = CONFIG.activities.find((a) => a.id === activityId)!;
  if (s.pet.stats.energy < -activity.energy) return { state: s, blocked: 'tooTired' };
  const played = withPet(s, (pet) => {
    pet.stats.happiness = clampStat(pet.stats.happiness + activity.happiness);
    pet.stats.hunger = clampStat(pet.stats.hunger + activity.hunger);
    pet.stats.energy = clampStat(pet.stats.energy + activity.energy);
  });
  const felt = feeling(s.pet, 'play', activityId);
  return { state: noticeFeeling(played, 'play', felt), ...(felt ? { felt } : {}) };
}

// Turns the lights off (pets go to sleep) or on (pets wake up). The pets
// share one room, so the other pet at home sleeps or wakes along with this
// one (unless it's away, an egg or passed away).
export function toggleLights(state: GameState, now: number): ActionResult {
  const s = simulate(state, now);
  if (isAway(s.pet)) return { state: s, blocked: 'away' };
  if (s.pet.condition === 'passed') return { state: s, blocked: 'passed' };
  if (s.pet.stage === 'egg') return { state: s, blocked: 'egg' };
  const asleep = !s.pet.asleep;
  const housemates = s.housemates.map((p) =>
    isAway(p) || p.condition === 'passed' || p.stage === 'egg' || p.asleep === asleep ? p : { ...p, asleep },
  );
  const switched = withPet({ ...s, housemates }, (pet) => (pet.asleep = asleep));
  // Only waking can upset a pet (one that doesn't like being woken).
  const felt = asleep ? null : feeling(s.pet, 'woken');
  return { state: noticeFeeling(switched, 'woken', felt), ...(felt ? { felt } : {}) };
}

// Cures sickness and starts the recovery rest.
export function giveMedicine(state: GameState, now: number): ActionResult {
  const s = simulate(state, now);
  if (s.pet.condition === 'passed') return { state: s, blocked: 'passed' };
  if (s.pet.condition !== 'sick') return { state: s, blocked: 'notSick' };
  return {
    state: withPet(s, (pet) => {
      pet.condition = 'healthy';
      pet.warningMinutes = 0;
      pet.sickMinutes = 0;
      pet.stats.health = clampStat(pet.stats.health + CONFIG.sickness.medicineHealth);
      pet.recoveryUntil = now + CONFIG.sickness.recoveryHours * 3_600_000;
    }),
  };
}

// Uses a Revival Star to bring back a pet that passed away. It comes back
// a little weak and rests, like after medicine.
export function revive(state: GameState, now: number): ActionResult {
  const s = simulate(state, now);
  if (s.pet.condition !== 'passed') return { state: s, blocked: 'notSick' };
  const stars = revivalStars(s);
  if (stars < 1) return { state: s, blocked: 'noRevival' };
  const used = { ...s, inventory: { ...s.inventory, supplies: { ...s.inventory.supplies, revivalStar: stars - 1 } } };
  return {
    state: withPet(used, (pet) => {
      pet.condition = 'healthy';
      pet.warningMinutes = 0;
      pet.sickMinutes = 0;
      pet.asleep = false;
      for (const [stat, least] of Object.entries(CONFIG.revival.stats) as [keyof Pet['stats'], number][]) {
        pet.stats[stat] = Math.max(pet.stats[stat], least);
      }
      pet.recoveryUntil = now + CONFIG.sickness.recoveryHours * 3_600_000;
      pet.starGlow = true;
    }),
  };
}

// Lets a pet that passed away go: it moves into the Family Tree. The next
// pet in the room takes its place, or, if it was the only one, a new egg.
export function sayGoodbye(state: GameState, now: number): GameState {
  const s = simulate(state, now);
  if (s.pet.condition !== 'passed') return s;
  if (s.housemates.length > 0) return retire(s, s.pet.id);
  return {
    ...s,
    pet: newPet(now),
    family: [...s.family, rememberPet(s.pet, s.owner)],
    craving: { ...s.craving, food: null },
  };
}

// Debug helper: pretends `hours` have passed by moving the game's clock
// forward, then catches up. Used by the fast-forward buttons in Settings.
export function fastForward(state: GameState, realNow: number, hours: number): GameState {
  const clockOffsetMs = state.clockOffsetMs + hours * 3_600_000;
  return simulate({ ...state, clockOffsetMs }, realNow + clockOffsetMs);
}

// Debug helper: skips the rest of the current stage so the pet grows up
// on the next tick. Used by the "Grow up now" button in Settings.
export function growNow(state: GameState, now: number): GameState {
  const s = simulate(state, now);
  const length = stageLengthMs(s.pet.stage);
  if (!isFinite(length)) return s; // adults don't grow any more
  const pet: Pet = { ...s.pet, stageStartedAt: now - length };
  return simulate({ ...s, pet, lastUpdated: now - 60_000 }, now);
}
