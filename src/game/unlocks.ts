// Parts of the game open up as you play, so a new player isn't greeted by
// every menu at once. Each one has a rule; once its rule is met it stays
// open for good (even if, say, the fish you caught get eaten). Until the
// player has looked at it, it shows a small "new" dot.
//
// The "Show every menu" testing tool in Settings skips the rules.

import type { GameState } from './state';
import { canOrder } from './delivery';
import { logMessage } from './messages';
import { updateBadges, type AchievementId, type Tier } from './achievements';
import { creditGrownUps, keeperLevel, updateLevel } from './skills';
import { getCharacter } from './growth';
import { stepFragments } from './fragments';

export type UnlockId =
  | 'shop' | 'cooking' | 'collection' | 'familyTree' | 'garden' | 'messages' | 'delivery' | 'meet' | 'skills';

const RULES: Record<UnlockId, (s: GameState) => boolean> = {
  // Once the egg hatches and there's someone to buy things for.
  shop: (s) => s.pet.stage !== 'egg',
  // After the first fish: now there's something to cook with.
  cooking: (s) => s.caught.length > 0 || s.recipesFound.length > 0,
  // After the first recipe found, the first grown-up character or the
  // first badge.
  collection: (s) =>
    s.recipesFound.length > 0 || s.charactersFound.length > 0 || Object.keys(s.badges ?? {}).length > 0,
  // Once the pet is all grown up.
  familyTree: (s) => s.pet.stage === 'adult',
  // Once the egg hatches, along with the Shop that sells the first seeds.
  garden: (s) => s.pet.stage !== 'egg',
  // The Messages page opens with the Shop.
  messages: (s) => s.pet.stage !== 'egg',
  // Percy's orders start once there's something to ask for: a fish you
  // caught, a crop you grew or a dish you cooked.
  delivery: (s) => canOrder(s),
  // Meet (in Play) opens when the first wanderer drops by.
  meet: (s) => !!s.visit?.guest || (s.friends?.length ?? 0) > 0,
  // Skills open with the first skill point (Keeper level 2).
  skills: (s) => !!s.keeper && keeperLevel(s) >= 2,
};

export const UNLOCKS = Object.keys(RULES) as UnlockId[];

// The ids whose rules are met right now.
export function unlocksFor(state: GameState): UnlockId[] {
  return UNLOCKS.filter((id) => RULES[id](state));
}

export function isUnlocked(state: GameState, id: UnlockId): boolean {
  return state.showAllMenus || state.unlocked.includes(id);
}

// Unlocked but not looked at yet.
export function isNew(state: GameState, id: UnlockId): boolean {
  return state.unlocked.includes(id) && !state.seen.includes(id);
}

export function markSeen(state: GameState, id: UnlockId): GameState {
  return state.seen.includes(id) ? state : { ...state, seen: [...state.seen, id] };
}

// The key a character is stored under in the Collection: "pebblit", or
// "pebblit:amber" for a colour variant.
export function characterKey(character: string, variant: string | null): string {
  return variant ? `${character}:${variant}` : character;
}

// Writes down anything new: the character a grown-up pet became (and its
// Keeper XP), badges earned, Keeper levels reached and whatever has just
// opened up. Returns the ids that opened, the badges earned and the levels
// reached, so the game can say so.
export function updateProgress(state: GameState): {
  state: GameState;
  unlocked: UnlockId[];
  badges: { id: AchievementId; tier: Tier }[];
  levels: number[];
  fragments: { pieces: number; stars: number }; // star fragments just earned
} {
  let s = state;
  for (const pet of [s.pet, ...s.housemates]) {
    if (pet.stage !== 'adult' || !pet.character) continue;
    const key = characterKey(pet.character, pet.variant);
    if (!s.charactersFound.includes(key)) s = { ...s, charactersFound: [...s.charactersFound, key] };
  }
  s = creditGrownUps(s, [s.pet, ...s.housemates], (pet) => getCharacter(pet.character)?.stars ?? 1);
  const badges = updateBadges(s);
  const levels = updateLevel(badges.state);
  s = levels.state;
  const opened = unlocksFor(s).filter((id) => !s.unlocked.includes(id));
  if (opened.length > 0) s = { ...s, unlocked: [...s.unlocked, ...opened] };
  for (const id of opened) s = logMessage(s, { kind: 'unlocked', at: s.lastUpdated, id });
  const frag = stepFragments(s);
  return {
    state: frag.state, unlocked: opened, badges: badges.earned, levels: levels.levels,
    fragments: { pieces: frag.pieces, stars: frag.stars },
  };
}
