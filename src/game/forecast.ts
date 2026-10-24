// The forecast before mingling: what a little one of your pet and a friend
// could grow into, worked out from the same tables and chances the game
// rolls with (see growth.ts and genes.ts), so the numbers are honest.
//
// It's shown for a little one raised with great care (the top row of the
// Care Score table), since that's what the player is aiming for.

import { CONFIG } from './config';
import { IN_GAME, elementOf, getCharacter, starOdds, starsInGame, type Character, type Stars } from './growth';
import { carriedOf, inheritanceOf, type Inheritance } from './genes';
import { littleOneChance } from './friends';
import type { Friend, Pet } from './state';

export interface Forecast {
  littleOne: number; // percent chance a mingle brings a little one
  stars: Record<Stars, number>; // percent, with great care
  themes: { theme: string; element: string | null; chance: number }[]; // most likely first
  // Colour variants a parent shows or carries, and the chance the little
  // one ends up with each.
  variants: { character: string; variant: string; chance: number }[];
}

// The chance (0 to 1) of each character, for a pet that rolls `rolled`
// stars, the way characterOfStars picks one.
function characterChances(rolled: Stars, family: Inheritance): Map<Character, number> {
  const options = IN_GAME.filter((c) => c.stars === starsInGame(rolled));
  const chances = new Map<Character, number>(options.map((c) => [c, 0]));
  const spread = (list: Character[], weight: number) => {
    for (const c of list) chances.set(c, chances.get(c)! + weight / list.length);
  };
  const favoured = family.themes.length > 0 ? CONFIG.friends.parentThemeChance / 100 : 0;
  const fromCarried = family.carriedThemes.length > 0 ? CONFIG.genes.carriedThemeChance / 100 : 0;
  const pool: [string, number][] = [
    ...family.themes.map((t): [string, number] => [t, (favoured * (1 - fromCarried)) / family.themes.length]),
    ...family.carriedThemes.map((t): [string, number] => [t, (favoured * fromCarried) / family.carriedThemes.length]),
  ];
  for (const [theme, weight] of pool) {
    const ofTheme = options.filter((c) => c.theme === theme);
    spread(ofTheme.length > 0 ? ofTheme : options, weight);
  }
  spread(options, 1 - favoured);
  return chances;
}

// The chance (0 to 1) a pet of `character` gets colour variant `variant`.
function variantChance(character: Character, variant: string, family: Inheritance): number {
  const v = character.variants?.find((x) => x.id === variant);
  if (!v) return 0;
  const inherited = (character.variants ?? []).filter((x) => family.variants.includes(`${character.id}:${x.id}`));
  if (inherited.length === 0) return v.chance / 100;
  const gene = CONFIG.genes.variantChance / 100;
  return (inherited.includes(v) ? gene / inherited.length : 0) + (1 - gene) * (v.chance / 100);
}

const percent = (x: number) => Math.round(x * 1000) / 10;

// The forecast for your pet `pet` and its friend `friend`.
export function forecast(pet: Pet, friend: Friend): Forecast {
  const parents = [pet, friend];
  const themes = parents.map((p) => getCharacter(p.character)?.theme).filter((t): t is string => !!t);
  const looks = parents.map((p) => ({ character: p.character, variant: p.variant }));
  const family = inheritanceOf({ themes: [...new Set(themes)], parentLooks: looks, parentCarried: parents.map((p) => carriedOf(p)) });
  const stars = starOdds(CONFIG.rarity[0].minCare, looks);

  const byCharacter = new Map<Character, number>();
  for (const s of [1, 2, 3] as Stars[]) {
    if (!stars[s]) continue;
    for (const [c, chance] of characterChances(s, family)) byCharacter.set(c, (byCharacter.get(c) ?? 0) + (chance * stars[s]) / 100);
  }
  const byTheme = new Map<string, number>();
  for (const [c, chance] of byCharacter) byTheme.set(c.theme, (byTheme.get(c.theme) ?? 0) + chance);

  return {
    littleOne: littleOneChance(friend.score),
    stars: { 1: stars[1], 2: stars[2], 3: stars[3] },
    themes: [...byTheme]
      .map(([theme, chance]) => ({ theme, element: elementOf(theme), chance: percent(chance) }))
      .filter((t) => t.chance > 0)
      .sort((a, b) => b.chance - a.chance),
    variants: family.variants
      .map((key) => {
        const [id, variant] = key.split(':');
        const character = IN_GAME.find((c) => c.id === id);
        const chance = character ? (byCharacter.get(character) ?? 0) * variantChance(character, variant, family) : 0;
        return { character: id, variant, chance: percent(chance) };
      })
      .filter((v) => v.chance > 0)
      .sort((a, b) => b.chance - a.chance),
  };
}
