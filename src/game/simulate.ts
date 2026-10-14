// simulate() is the heart of the game. It answers one question:
// "Given how things were at state.lastUpdated, what are they like now?"
//
// It never relies on the browser tab staying open. Whether you closed the game
// for ten seconds or ten days, it walks forward in small steps (ticks) and
// applies everything that would have happened in between. We call it when the
// game loads, when you come back to the tab, and every few seconds while open.

import { CONFIG } from './config';
import { clampStat } from './stats';
import type { GameState } from './state';

const MS_PER_MINUTE = 60_000;

export function simulate(state: GameState, now: number): GameState {
  const tickMs = CONFIG.tickMinutes * MS_PER_MINUTE;
  const elapsed = now - state.lastUpdated;

  // If the clock went backwards (e.g. the device time was changed) or less
  // than one tick has passed, nothing happens yet.
  if (elapsed < tickMs) return state;

  const ticks = Math.floor(elapsed / tickMs);

  // Work on a copy so the original state is never changed by accident.
  const stats = { ...state.pet.stats };

  // How much each stat drops in a single tick.
  const ticksPerHour = 60 / CONFIG.tickMinutes;
  const hungerPerTick = CONFIG.decayPerHour.hunger / ticksPerHour;
  const happinessPerTick = CONFIG.decayPerHour.happiness / ticksPerHour;

  for (let i = 0; i < ticks; i++) {
    stats.hunger = clampStat(stats.hunger - hungerPerTick);
    stats.happiness = clampStat(stats.happiness - happinessPerTick);
    // Later milestones add sleep, sickness, growth and breeding timers here.
  }

  return {
    ...state,
    pet: { ...state.pet, stats },
    // Only move forward by whole ticks, so leftover seconds aren't lost and
    // get counted next time.
    lastUpdated: state.lastUpdated + ticks * tickMs,
  };
}
