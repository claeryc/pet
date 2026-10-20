// Star fragments: the free way to a Revival Star. Five fragments make one
// star. They only come from looking after your pets well, never from gold
// or real money:
//   - a full week of daily care: visiting on 7 days in a row while the pet
//     you're looking after isn't sick,
//   - finishing an achievement (its gold badge),
//   - raising a pet to grown-up.
// That's about one free star a month for someone who plays every day.

import { CONFIG } from './config';
import { localDay } from './economy';
import type { GameState } from './state';

const F = CONFIG.revival.fragments;

// Everything that already happened, marked as counted (for older saves, so
// fragments only come from what's done from now on).
export function countedSoFar(state: GameState): string[] {
  const grown = [state.pet, ...(state.housemates ?? [])].filter((p) => p.stage === 'adult').map((p) => `grown:${p.id}`);
  const badges = Object.entries(state.badges ?? {}).filter(([, t]) => t === 'gold').map(([id]) => `badge:${id}`);
  return [...grown, ...badges];
}

// The day before `day` ("2026-10-20" -> "2026-10-19"), in local time.
function dayBefore(day: string): string {
  const [y, m, d] = day.split('-').map(Number);
  return localDay(new Date(y, m - 1, d - 1, 12).getTime());
}

// Hands out any fragments earned since last time, and turns every
// `perStar` of them into a Revival Star. Says how many fragments and stars
// were just earned.
export function stepFragments(state: GameState): { state: GameState; pieces: number; stars: number } {
  const fr = state.fragments;
  let { streak, lastDay } = fr;
  const from = [...fr.from];
  let earned = 0;

  // A day of care: the game was open today and the pet is doing fine.
  const today = localDay(state.lastUpdated);
  const pet = state.pet;
  const fine = pet.stage !== 'egg' && pet.condition !== 'sick' && pet.condition !== 'passed';
  if (fine && lastDay !== today) {
    streak = lastDay === dayBefore(today) ? streak + 1 : 1;
    lastDay = today;
    if (streak % F.careDays === 0) earned += 1;
  }

  // Pets raised to grown-up, and achievements finished.
  const add = (key: string) => {
    if (from.includes(key)) return;
    from.push(key);
    earned += 1;
  };
  for (const p of [state.pet, ...state.housemates]) if (p.stage === 'adult') add(`grown:${p.id}`);
  for (const [id, tier] of Object.entries(state.badges)) if (tier === 'gold') add(`badge:${id}`);

  if (earned === 0 && streak === fr.streak && lastDay === fr.lastDay) return { state, pieces: 0, stars: 0 };
  const total = fr.pieces + earned;
  const stars = Math.floor(total / F.perStar);
  const supplies = stars > 0
    ? { ...state.inventory.supplies, revivalStar: (state.inventory.supplies.revivalStar ?? 0) + stars }
    : state.inventory.supplies;
  return {
    state: {
      ...state,
      fragments: { pieces: total % F.perStar, streak, lastDay, from },
      inventory: { ...state.inventory, supplies },
    },
    pieces: earned,
    stars,
  };
}
