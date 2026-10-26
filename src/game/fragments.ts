// Star fragments: the one currency for things money can also buy. They
// stay fragments until the player spends them: `perStar` make a Revival
// Star (`makeStar`), and the Family Home and a star-only hat cost
// fragments instead of gold. They never buy gold, food or charms.
// They're earned by caring well: every good care day gives `perGoodDay`
// (a day you visit and none of your pets gets a warning, or worse), and
// every Milestone badge gives `perMilestone` (see milestones.ts). The
// days don't have to be in a row: a missed day just doesn't count. A day
// counts once however many pets you have, so a daily player earns about
// 150 a month. A day when every pet is away on a journey doesn't count
// (nobody was home to look after). They can also be bought in packs
// (`CONFIG.store`).

import { CONFIG } from './config';
import { countUp } from './achievements';
import { localDay } from './economy';
import { allPets } from './friends';
import type { GameState, Pet } from './state';
import { nobodyHome } from './presence';

const F = CONFIG.fragments;

// Hands out any fragments earned since last time. Says how many were just
// earned. `careDays` counts every good care day so far.
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
    if (counted) {
      careDays += 1;
      earned = F.perGoodDay;
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

// Adds fragments from a Milestone or a bought pack.
export function addFragments(state: GameState, n: number): GameState {
  return n > 0 ? { ...state, fragments: { ...state.fragments, pieces: state.fragments.pieces + n } } : state;
}

// About how many weeks of good care days are left before `pieces` reach a
// Revival Star (0 once there are enough).
export function weeksToStar(pieces: number): number {
  return Math.max(0, Math.ceil((F.perStar - pieces) / F.perGoodDay / 7));
}

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
