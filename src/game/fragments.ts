// Star fragments: the free way to a Revival Star. Five fragments make one
// star. They only come from good care days, never from gold or real money:
// a day you visit and none of your pets gets a warning (or worse). Every
// `careDaysPerFragment` such days give a fragment. The days don't have to
// be in a row: a missed day just doesn't count. A day counts once however
// many pets you have. That's about one free star a month for someone who
// plays every day.

import { CONFIG } from './config';
import { localDay } from './economy';
import { allPets } from './friends';
import type { GameState } from './state';

const F = CONFIG.revival.fragments;

// Hands out any fragments earned since last time, and turns every
// `perStar` of them into a Revival Star. Says how many fragments and stars
// were just earned.
export function stepFragments(state: GameState): { state: GameState; pieces: number; stars: number } {
  const fr = state.fragments;
  let { careDays, day, dayGood } = fr;
  let earned = 0;

  // A new day: the one before counts if it went well.
  const today = localDay(state.lastUpdated);
  if (day !== today) {
    if (day !== '' && dayGood) careDays += 1;
    if (careDays >= F.careDaysPerFragment) {
      careDays -= F.careDaysPerFragment;
      earned = 1;
    }
    day = today;
    dayGood = true;
  }
  // Any pet not doing well spoils the day (an egg needs nothing, but a day
  // with only eggs doesn't count either).
  const pets = allPets(state).filter((p) => p.stage !== 'egg');
  if (pets.length === 0 || pets.some((p) => p.condition !== 'healthy')) dayGood = false;

  if (earned === 0 && careDays === fr.careDays && day === fr.day && dayGood === fr.dayGood) {
    return { state, pieces: 0, stars: 0 };
  }
  const total = fr.pieces + earned;
  const stars = Math.floor(total / F.perStar);
  const supplies = stars > 0
    ? { ...state.inventory.supplies, revivalStar: (state.inventory.supplies.revivalStar ?? 0) + stars }
    : state.inventory.supplies;
  return {
    state: {
      ...state,
      fragments: { pieces: total % F.perStar, careDays, day, dayGood },
      inventory: { ...state.inventory, supplies },
    },
    pieces: earned,
    stars,
  };
}
