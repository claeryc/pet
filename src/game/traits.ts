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

import data from '../data/traits.json';
import { seededRoll } from './growth';

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
}

export const TRAITS: readonly Trait[] = data.traits;

export function getTrait(id: string | null | undefined): Trait | undefined {
  return TRAITS.find((t) => t.id === id);
}

// The trait a pet with this id gets: always the same one for the same id.
export function rollTrait(petId: string): string {
  return TRAITS[Math.floor(seededRoll(petId, 'trait') * TRAITS.length)].id;
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

// The trait of something that has an id and maybe a trait (a friend from
// before traits came along has none, so it gets the one its id rolls).
export function traitOf(thing: { id: string; trait?: string | null }): string {
  return getTrait(thing.trait)?.id ?? rollTrait(thing.id);
}
