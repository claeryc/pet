// A pet's trait: a little bit of personality it gets when it's made. It
// only changes how the pet looks and behaves (how often it fidgets, which
// faces it pulls and for how long), never its stats, so no trait is better
// than another. The traits and their numbers are in src/data/traits.json:
//
//   idleEvery       how often it plays its idle moves, times the usual gap
//                   (0.5 = twice as often)
//   happyMs         how long it stays happy after play, times the usual
//   surprisedMs     how long a visitor startles it, times the usual
//   poutAfter       how soon it pouts when left alone, times the usual
//   hungryBelow, sleepyBelow, sadBelow
//                   added to the usual stat a face shows below (see
//                   CONFIG.expressions), so 20 = that face shows sooner
//   lovesEverySnack every food makes it fall in love, not only a craving
//   grumpyWhenWoken pulls a grumpy face when the lights come on
//   special         only for characters that list it under "traits" in
//                   src/data/characters.json, never rolled otherwise
//
// A character can list "traits" in characters.json: a pet that grows into
// it keeps its trait if it's on the list, and otherwise gets one from the
// list instead. Characters without a list take any trait but the special
// ones.

import data from '../data/traits.json';
import { getCharacter, seededRoll } from './growth';

export interface Trait {
  id: string;
  name: string;
  about: string;
  idleEvery?: number;
  happyMs?: number;
  surprisedMs?: number;
  poutAfter?: number;
  hungryBelow?: number;
  sleepyBelow?: number;
  sadBelow?: number;
  lovesEverySnack?: boolean;
  grumpyWhenWoken?: boolean;
  special?: boolean;
}

export const TRAITS: readonly Trait[] = data.traits;

export function getTrait(id: string | null | undefined): Trait | undefined {
  return TRAITS.find((t) => t.id === id);
}

const GENERAL = TRAITS.filter((t) => !t.special).map((t) => t.id);

// The trait a pet with this id gets: always the same one for the same id.
export function rollTrait(petId: string, from: readonly string[] = GENERAL, label = 'trait'): string {
  return from[Math.floor(seededRoll(petId, label) * from.length)];
}

// The traits a pet of this character can have.
export function allowedTraits(character: { traits?: string[] } | null | undefined): string[] {
  const listed = (character?.traits ?? []).filter((id) => getTrait(id));
  return listed.length > 0 ? listed : GENERAL;
}

// The trait a pet keeps once it grows into `character`: its own if the
// character allows it, otherwise one the character allows.
export function fitTrait(petId: string, trait: string | null | undefined, character: { traits?: string[] } | null | undefined): string {
  const allowed = allowedTraits(character);
  return trait && allowed.includes(trait) ? trait : rollTrait(petId, allowed, 'characterTrait');
}

// A little one's trait: one of its parents' (data.inheritChance percent of
// the time), or otherwise one of its own.
export function inheritTrait(petId: string, parentTraits: readonly (string | null | undefined)[]): string {
  const known = parentTraits.filter((t): t is string => !!getTrait(t));
  if (known.length > 0 && seededRoll(petId, 'inheritTrait') * 100 < data.inheritChance) {
    return known[Math.floor(seededRoll(petId, 'whichTrait') * known.length)];
  }
  return rollTrait(petId);
}

// The trait of something that has an id and maybe a trait and character
// (a friend from before traits came along has none, so it gets the one its
// id rolls, that its character allows).
export function traitOf(thing: { id: string; trait?: string | null; character?: string | null }): string {
  return getTrait(thing.trait)?.id ?? fitTrait(thing.id, rollTrait(thing.id), getCharacter(thing.character ?? null));
}
