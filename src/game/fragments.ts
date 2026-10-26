// Star fragments: the free way to a Revival Star. They stay fragments until
// the player spends them: five make a Revival Star (`makeStar`), and a few
// things in the Shop cost fragments instead of gold (a star-only hat).
// They only come from good care days, never from gold or real money:
// a day you visit and none of your pets gets a warning (or worse). Every
// `careDaysPerFragment` such days give a fragment. The days don't have to
// be in a row: a missed day just doesn't count. A day counts once however
// many pets you have. That's about one free star a month for someone who
// plays every day. A day when every pet is away on a journey doesn't count
// (nobody was home to look after).

import { CONFIG } from './config';
import { countUp } from './achievements';
import { localDay } from './economy';
import { allPets } from './friends';
import type { GameState, Pet } from './state';
import { nobodyHome } from './presence';

const F = CONFIG.revival.fragments;

// Hands out any fragments earned since last time. Says how many were just
// earned.
export function stepFragments(state: GameState): { state: GameState; pieces: number } {
  const fr = state.fragments;
  let { careDays, day, dayGood } = fr;
  let home = fr.home ?? true; // someone was home that day
  let earned = 0;
  let counted = false;

  // A new day: the one before counts if it went well.
  const today = localDay(state.lastUpdated);
  if (day !== today) {
    counted = day !== '' && dayGood && home;
    if (counted) careDays += 1;
    if (careDays >= F.careDaysPerFragment) {
      careDays -= F.careDaysPerFragment;
      earned = 1;
    }
    day = today;
    dayGood = true;
    home = false;
  }
  if (!nobodyHome(state)) home = true;
  // Any pet not doing well spoils the day (an egg needs nothing, but a day
  // with only eggs doesn't count either).
  const pets = allPets(state).filter((p) => p.stage !== 'egg');
  if (pets.length === 0 || pets.some((p) => p.condition !== 'healthy')) dayGood = false;

  if (earned === 0 && careDays === fr.careDays && day === fr.day && dayGood === fr.dayGood && home === (fr.home ?? true)) {
    return { state, pieces: 0 };
  }
  // Each pet keeps count of its own good care days too: they decide the
  // keepsake it leaves when it moves to the Meadow (see meadow.ts).
  const goodDay = (p: Pet): Pet => (counted && p.stage !== 'egg' ? { ...p, goodDays: (p.goodDays ?? 0) + 1 } : p);
  return {
    state: {
      ...state,
      pet: goodDay(state.pet),
      housemates: counted ? state.housemates.map(goodDay) : state.housemates,
      fragments: { pieces: fr.pieces + earned, careDays, day, dayGood, home },
    },
    pieces: earned,
  };
}

export const fragmentCount = (state: GameState) => state.fragments.pieces;

// Turns `perStar` fragments into a Revival Star.
export function makeStar(state: GameState): { state: GameState; blocked?: 'notEnoughFragments' } {
  if (state.fragments.pieces < F.perStar) return { state, blocked: 'notEnoughFragments' };
  const supplies = { ...state.inventory.supplies, revivalStar: (state.inventory.supplies.revivalStar ?? 0) + 1 };
  return {
    state: {
      ...countUp(state, 'starsMade'), // for the Star Maker milestone
      fragments: { ...state.fragments, pieces: state.fragments.pieces - F.perStar },
      inventory: { ...state.inventory, supplies },
    },
  };
}
