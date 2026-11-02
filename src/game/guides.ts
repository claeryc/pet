// "How it works" guides: a short card for each part of the game, shown the
// first time the player gets to it. Read ones can be opened again any time
// from Menu > Guide. This file only knows which guides exist, when each one
// is open to read, and which have been read; the cards themselves are in
// src/ui/guide.ts and their words in src/strings.ts.

import type { GameState } from './state';
import { isUnlocked } from './unlocks';

export type GuideId =
  | 'basics' | 'shop' | 'garden' | 'fishing' | 'cooking' | 'delivery' | 'craving'
  | 'journeys' | 'dig' | 'meet' | 'family' | 'skills' | 'sick' | 'collection';

const hatched = (s: GameState) => s.pet.stage !== 'egg';

// When each guide is open to read (in the order Menu > Guide lists them).
// Until then it shows locked there, so the list doesn't give away what's to
// come. Most follow the part of the game they explain.
const RULES: Record<GuideId, (s: GameState) => boolean> = {
  basics: hatched,
  shop: (s) => isUnlocked(s, 'shop'),
  garden: (s) => isUnlocked(s, 'garden'),
  fishing: hatched,
  cooking: (s) => isUnlocked(s, 'cooking'),
  delivery: (s) => isUnlocked(s, 'delivery'),
  craving: hatched,
  journeys: (s) => isUnlocked(s, 'journeys'),
  dig: (s) => isUnlocked(s, 'dig'),
  meet: (s) => isUnlocked(s, 'meet'),
  family: (s) => isUnlocked(s, 'familyTree'),
  skills: (s) => isUnlocked(s, 'skills'),
  sick: hatched,
  collection: (s) => isUnlocked(s, 'collection'),
};

export const GUIDES = Object.keys(RULES) as GuideId[];

// Open to read: its part of the game has opened up (or it's been read).
export function guideOpen(state: GameState, id: GuideId): boolean {
  return state.guidesRead.includes(id) || RULES[id](state);
}

// Shown by itself the first time: open to read, and not read yet.
export function guideDue(state: GameState, id: GuideId): boolean {
  return !state.guidesRead.includes(id) && RULES[id](state);
}

export function markGuideRead(state: GameState, id: GuideId): GameState {
  return state.guidesRead.includes(id) ? state : { ...state, guidesRead: [...state.guidesRead, id] };
}

// The guides a player who already got this far has no need to be shown:
// every part of the game that has already opened up. (For saves from before
// the guides; new parts still get their guide when they open.)
export function guidesAlreadyKnown(state: GameState): GuideId[] {
  return GUIDES.filter((id) => RULES[id](state));
}
