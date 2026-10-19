// Achievements in the Collection: badges for doing something lots of times
// (fish landed, Percy's orders filled, crops picked...). Each one goes from
// bronze to silver to gold at the counts in CONFIG.achievements. The counts
// live in GameState.tally and only ever go up; the badges earned live in
// GameState.badges, so a badge stays earned even if its count is retuned.

import { CONFIG } from './config';
import type { GameState } from './state';
import { logMessage } from './messages';

export type AchievementId = keyof typeof CONFIG.achievements;
export type Tier = 'bronze' | 'silver' | 'gold';

export const ACHIEVEMENTS = Object.keys(CONFIG.achievements) as AchievementId[];
export const TIERS: readonly Tier[] = ['bronze', 'silver', 'gold'];

// How many times it's been done so far.
export function tallyOf(state: GameState, id: AchievementId): number {
  return state.tally[id] ?? 0;
}

// Counts one more (or `n` more) towards an achievement.
export function addTally(state: GameState, id: AchievementId, n = 1): GameState {
  return { ...state, tally: { ...state.tally, [id]: tallyOf(state, id) + n } };
}

// The best tier a count reaches, or null below bronze.
export function tierAt(id: AchievementId, count: number): Tier | null {
  const goals = CONFIG.achievements[id];
  let tier: Tier | null = null;
  TIERS.forEach((t, i) => {
    if (count >= goals[i]) tier = t;
  });
  return tier;
}

// The badge earned so far, or null.
export function badgeOf(state: GameState, id: AchievementId): Tier | null {
  return (state.badges[id] as Tier | undefined) ?? null;
}

// The next tier to aim for and the count it needs, or null once gold.
export function nextGoal(state: GameState, id: AchievementId): { tier: Tier; goal: number } | null {
  const have = badgeOf(state, id);
  const i = have ? TIERS.indexOf(have) + 1 : 0;
  if (i >= TIERS.length) return null;
  return { tier: TIERS[i], goal: CONFIG.achievements[id][i] };
}

// How many badges there are to earn (every tier of every achievement), and
// how many are earned (a silver badge counts bronze too).
export function badgeCount(state: GameState): { earned: number; total: number } {
  const earned = ACHIEVEMENTS.reduce((sum, id) => {
    const t = badgeOf(state, id);
    return sum + (t ? TIERS.indexOf(t) + 1 : 0);
  }, 0);
  return { earned, total: ACHIEVEMENTS.length * TIERS.length };
}

// Hands out any badge a count has reached (or gone past). Each new badge
// goes in Messages; returns them so the game can say so.
export function updateBadges(state: GameState): { state: GameState; earned: { id: AchievementId; tier: Tier }[] } {
  let s = state;
  const earned: { id: AchievementId; tier: Tier }[] = [];
  for (const id of ACHIEVEMENTS) {
    const tier = tierAt(id, tallyOf(s, id));
    const have = badgeOf(s, id);
    if (!tier || (have && TIERS.indexOf(have) >= TIERS.indexOf(tier))) continue;
    s = { ...s, badges: { ...s.badges, [id]: tier } };
    s = logMessage(s, { kind: 'badge', at: s.lastUpdated, id, tier });
    earned.push({ id, tier });
  }
  return { state: s, earned };
}
