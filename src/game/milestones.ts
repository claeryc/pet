// Milestone badges in the Collection: one badge each for a moment that
// happens once (every journey place visited, a 3-star pet grown up, every
// recipe found...), with its own picture instead of bronze, silver and
// gold. Most are worked out from the game itself; the few that can't be
// (a trip with both pets, a gold-frame order, a pet retiring, a Revival
// Star made from fragments) are counted in GameState.tally with countUp().
// Earned ones live in GameState.milestones, so they stay earned.

import { CONFIG } from './config';
import type { GameState } from './state';
import { PLACES } from './journeys';
import { RECIPES } from './cooking';
import { getCharacter } from './growth';
import { logMessage } from './messages';
import { addXp } from './skills';
import { addFragments } from './fragments';

const counted = (key: string) => (state: GameState) => (state.tally[key] ?? 0) > 0;

const RULES = {
  // A finished trip to every place.
  explorer: (state: GameState) => PLACES.every((p) => (state.journeys.journal[p.id]?.trips ?? 0) > 0),
  // A finished trip with both pets together.
  travelBuddies: counted('together'),
  // A Percy order with every box full.
  goldOrder: counted('goldOrders'),
  // A pet that grew up into a 3-star character.
  threeStar: (state: GameState) => state.charactersFound.some((key) => getCharacter(key.split(':')[0])?.stars === 3),
  // Every recipe found.
  allRecipes: (state: GameState) => RECIPES.every((r) => state.recipesFound.includes(r.id)),
  // Every kind of fish caught.
  allFish: (state: GameState) => Object.keys(CONFIG.fishing.fish).every((id) => state.caught.includes(id)),
  // A pet that moved into the Family Tree (not one that passed away).
  retired: counted('retired'),
  // A Revival Star made from star fragments.
  starMaker: counted('starsMade'),
} satisfies Record<string, (state: GameState) => boolean>;

export type MilestoneId = keyof typeof RULES;
export const MILESTONES = Object.keys(RULES) as MilestoneId[];

export const hasMilestone = (state: GameState, id: MilestoneId) => state.milestones.includes(id);

// Hands out any Milestone just reached, with its Keeper XP, its star
// fragments and a line in Messages. Returns them so the game can say so.
export function updateMilestones(state: GameState): { state: GameState; earned: MilestoneId[] } {
  let s = state;
  const earned: MilestoneId[] = [];
  for (const id of MILESTONES) {
    if (hasMilestone(s, id) || !RULES[id](s)) continue;
    s = addXp({ ...s, milestones: [...s.milestones, id] }, CONFIG.skills.milestoneXp);
    s = addFragments(s, CONFIG.fragments.perMilestone);
    s = logMessage(s, { kind: 'milestone', at: s.lastUpdated, id });
    earned.push(id);
  }
  return { state: s, earned };
}
