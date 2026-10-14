// Things the player can do. Each action first catches the world up to "now"
// with simulate(), then applies its effect, and returns a new state.

import { CONFIG } from './config';
import { simulate } from './simulate';
import { clampStat } from './stats';
import type { GameState } from './state';

export function feed(state: GameState, now: number): GameState {
  const s = simulate(state, now);
  const stats = { ...s.pet.stats };
  stats.hunger = clampStat(stats.hunger + CONFIG.actions.feedHunger);
  return { ...s, pet: { ...s.pet, stats } };
}

export function play(state: GameState, now: number): GameState {
  const s = simulate(state, now);
  const stats = { ...s.pet.stats };
  stats.happiness = clampStat(stats.happiness + CONFIG.actions.playHappiness);
  stats.hunger = clampStat(stats.hunger + CONFIG.actions.playHunger);
  return { ...s, pet: { ...s.pet, stats } };
}
