// Genes: what a pet passes on to its little ones, besides its trait.
//
// Every grown-up *shows* the theme of the character it grew into, and its
// colour variant if it has one. It can also *carry* a theme and a colour
// variant it doesn't show. A little one leans towards its parents' shown
// themes, and now and then a carried one instead (CONFIG.genes), so a
// grandparent's theme can come back. A colour variant a parent shows or
// carries can come back too, if the little one grows into that character.
//
// A carried variant is saved as "character:variant" (e.g. "sprig:autumn"),
// the same key the Collection uses, because it only means something for
// that one character.
//
// Each theme also belongs to one of a few elements that never change
// (src/data/characters.json). Nothing uses them yet: later on, how a pet is
// raised will nudge its element (see the breeding design doc).

import { CONFIG } from './config';
import { IN_GAME, getCharacter, seededRoll, type Character } from './growth';

export interface Genes {
  theme: string | null; // a theme it carries but doesn't show
  variant: string | null; // a colour variant it carries, "character:variant"
}

// "sprig:autumn", or null for a pet with no colour variant.
export function variantKey(character: string | null, variant: string | null): string | null {
  return character && variant ? `${character}:${variant}` : null;
}

const pick = <T>(list: readonly T[], roll: number): T => list[Math.floor(roll * list.length)];

// Genes for a pet with no family to take them from (a first pet or a
// wanderer): a theme other than its own, and now and then a colour
// variant of any character. Always the same for the same id.
function rolledGenes(id: string, theme: string | null, shown: string | null): Genes {
  const themes = [...new Set(IN_GAME.map((c) => c.theme))].filter((t) => t !== theme);
  const variants = IN_GAME.flatMap((c) => (c.variants ?? []).map((v) => variantKey(c.id, v.id)!)).filter((k) => k !== shown);
  const hasVariant = variants.length > 0 && seededRoll(id, 'carriedVariant') * 100 < CONFIG.genes.wildVariantChance;
  return {
    theme: themes.length > 0 ? pick(themes, seededRoll(id, 'carriedTheme')) : null,
    variant: hasVariant ? pick(variants, seededRoll(id, 'whichCarriedVariant')) : null,
  };
}

// The genes something carries: the ones saved with it, or (for a pet or
// friend from before genes came along) the ones its id rolls.
export function carriedOf(thing: { id: string; character?: string | null; variant?: string | null; carried?: Genes | null }): Genes {
  if (thing.carried) return thing.carried;
  const character = getCharacter(thing.character ?? null);
  return rolledGenes(thing.id, character?.theme ?? null, variantKey(character?.id ?? null, thing.variant ?? null));
}

// What a little one can get from its parents: the themes and variants they
// show, and the ones they carry.
export interface Inheritance {
  themes: string[]; // shown by a parent
  carriedThemes: string[]; // carried by a parent and shown by neither
  variants: string[]; // "character:variant" keys a parent shows or carries
}

export function inheritanceOf(pet: {
  themes?: string[];
  parentLooks?: { character: string | null; variant: string | null }[];
  parentCarried?: Genes[];
}): Inheritance {
  const themes = pet.themes ?? [];
  const carried = pet.parentCarried ?? [];
  const keys = [
    ...(pet.parentLooks ?? []).map((l) => variantKey(l.character, l.variant)),
    ...carried.map((g) => g.variant),
  ];
  return {
    themes,
    carriedThemes: [...new Set(carried.map((g) => g.theme))].filter((t): t is string => !!t && !themes.includes(t)),
    variants: [...new Set(keys)].filter((k): k is string => !!k),
  };
}

// The genes a pet carries once it grows into `character` (with colour
// variant `variant`): one of its family's themes and variants that it
// doesn't show itself. A first pet, with no family, gets rolled ones.
export function genesAtGrowUp(
  pet: { id: string; parents?: string[]; themes?: string[]; parentLooks?: { character: string | null; variant: string | null }[]; parentCarried?: Genes[] },
  character: Character,
  variant: string | null,
): Genes {
  const shown = variantKey(character.id, variant);
  if (!pet.parents?.length) return rolledGenes(pet.id, character.theme, shown);
  const family = inheritanceOf(pet);
  const themes = [...family.themes, ...family.carriedThemes].filter((t) => t !== character.theme);
  const variants = family.variants.filter((k) => k !== shown);
  return {
    theme: themes.length > 0 ? pick(themes, seededRoll(pet.id, 'carriedTheme')) : null,
    variant: variants.length > 0 ? pick(variants, seededRoll(pet.id, 'whichCarriedVariant')) : null,
  };
}
