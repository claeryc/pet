// Parts of the game open up as you play, so a new player isn't greeted by
// every menu at once. Each one has a rule; once its rule is met it stays
// open for good (even if, say, the fish you caught get eaten). Until the
// player has looked at it, it shows a small "new" dot.
//
// The "Show every menu" testing tool in Settings skips the rules.

import type { GameState } from './state';

export type UnlockId = 'shop' | 'cooking' | 'collection' | 'familyTree' | 'garden';

const RULES: Record<UnlockId, (s: GameState) => boolean> = {
  // Once the egg hatches and there's someone to buy things for.
  shop: (s) => s.pet.stage !== 'egg',
  // After the first fish: now there's something to cook with.
  cooking: (s) => s.caught.length > 0 || s.recipesFound.length > 0,
  // After the first recipe found or the first grown-up character.
  collection: (s) => s.recipesFound.length > 0 || s.charactersFound.length > 0,
  // Once the pet is all grown up.
  familyTree: (s) => s.pet.stage === 'adult',
  // Once the egg hatches, along with the Shop that sells the first seeds.
  garden: (s) => s.pet.stage !== 'egg',
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

// Writes down anything new: the character a grown-up pet became, and
// whatever has just opened up. Returns the ids that opened, so the game
// can say so.
export function updateProgress(state: GameState): { state: GameState; unlocked: UnlockId[] } {
  let s = state;
  const { pet } = s;
  if (pet.stage === 'adult' && pet.character) {
    const key = characterKey(pet.character, pet.variant);
    if (!s.charactersFound.includes(key)) s = { ...s, charactersFound: [...s.charactersFound, key] };
  }
  const opened = unlocksFor(s).filter((id) => !s.unlocked.includes(id));
  if (opened.length > 0) s = { ...s, unlocked: [...s.unlocked, ...opened] };
  return { state: s, unlocked: opened };
}
