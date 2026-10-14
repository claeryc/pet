// Things the player can do. Each action first catches the world up to "now"
// with simulate(), then applies its effect. Some actions can be refused (for
// example, you can't play with a sleeping pet); then `blocked` says why and
// the state is returned unchanged apart from the catch-up.

import { CONFIG } from './config';
import { simulate } from './simulate';
import { clampStat } from './stats';
import type { GameState, Pet } from './state';

export type BlockReason = 'asleep' | 'tooTired' | 'notSick';

export interface ActionResult {
  state: GameState;
  blocked?: BlockReason;
}

// Helper: returns a copy of the state with the pet changed by `change`.
function withPet(state: GameState, change: (pet: Pet) => void): GameState {
  const pet: Pet = { ...state.pet, stats: { ...state.pet.stats }, buffs: [...state.pet.buffs] };
  change(pet);
  return { ...state, pet };
}

export type Food = (typeof CONFIG.foods)[number] & {
  slowHunger?: { percent: number; hours: number };
};
export type FoodId = Food['id'];
export type ActivityId = (typeof CONFIG.activities)[number]['id'];

export function feed(state: GameState, now: number, foodId: FoodId = 'riceBall'): ActionResult {
  const s = simulate(state, now);
  if (s.pet.asleep) return { state: s, blocked: 'asleep' };
  const food: Food = CONFIG.foods.find((f) => f.id === foodId)!;
  return {
    state: withPet(s, (pet) => {
      pet.stats.hunger = clampStat(pet.stats.hunger + food.hunger);
      pet.stats.happiness = clampStat(pet.stats.happiness + food.happiness);
      pet.stats.health = clampStat(pet.stats.health + food.health);
      if (food.slowHunger) {
        // Eating it again restarts the timer (effects don't stack).
        const until = now + food.slowHunger.hours * 3_600_000;
        pet.buffs = [
          ...pet.buffs.filter((b) => b.stat !== 'hunger'),
          { stat: 'hunger', percent: food.slowHunger.percent, until },
        ];
      }
    }),
  };
}

export function play(state: GameState, now: number, activityId: ActivityId = 'ball'): ActionResult {
  const s = simulate(state, now);
  if (s.pet.asleep) return { state: s, blocked: 'asleep' };
  const activity = CONFIG.activities.find((a) => a.id === activityId)!;
  if (s.pet.stats.energy < -activity.energy) return { state: s, blocked: 'tooTired' };
  return {
    state: withPet(s, (pet) => {
      pet.stats.happiness = clampStat(pet.stats.happiness + activity.happiness);
      pet.stats.hunger = clampStat(pet.stats.hunger + activity.hunger);
      pet.stats.energy = clampStat(pet.stats.energy + activity.energy);
    }),
  };
}

// Turns the lights off (pet goes to sleep) or on (pet wakes up).
export function toggleLights(state: GameState, now: number): ActionResult {
  const s = simulate(state, now);
  return { state: withPet(s, (pet) => (pet.asleep = !pet.asleep)) };
}

// Cures sickness and starts the recovery rest.
export function giveMedicine(state: GameState, now: number): ActionResult {
  const s = simulate(state, now);
  if (s.pet.condition !== 'sick') return { state: s, blocked: 'notSick' };
  return {
    state: withPet(s, (pet) => {
      pet.condition = 'healthy';
      pet.warningMinutes = 0;
      pet.stats.health = clampStat(pet.stats.health + CONFIG.sickness.medicineHealth);
      pet.recoveryUntil = now + CONFIG.sickness.recoveryHours * 3_600_000;
    }),
  };
}

// Debug helper: pretends `hours` have passed by moving the game's clock
// forward, then catches up. Used by the fast-forward buttons in Settings.
export function fastForward(state: GameState, realNow: number, hours: number): GameState {
  const clockOffsetMs = state.clockOffsetMs + hours * 3_600_000;
  return simulate({ ...state, clockOffsetMs }, realNow + clockOffsetMs);
}
