// Growing up: egg -> baby -> teen -> adult.
//
// Each stage lasts a set time (CONFIG.growth.stageHours). Every egg, baby
// and teen looks the same. When the teen grows up, the game picks which
// *character* it becomes from src/data/characters.json:
//   1. roll a star rarity, with better odds for a higher Care Score (and
//      better still for a little one of two 3-star parents),
//   2. pick a character of that rarity. A first pet can become any theme.
//      A little one takes after one of its parents' themes (now and then
//      one they only carry), and only reaches 3 stars if a parent shows
//      that theme as a 2-star or better ("climbing the family"),
//   3. maybe pick one of that character's colour variants (more likely one
//      a parent shows or carries, see genes.ts).
// The rolls are based on the pet's id, so reloading never changes them.

import { CONFIG } from './config';
import data from '../data/characters.json';
import type { ParentLook, Pet } from './state';
import { fitTrait } from './traits';
import { genesAtGrowUp, inheritanceOf, type Inheritance } from './genes';

export type Stage = 'egg' | 'baby' | 'teen' | 'adult';
export const STAGES: Stage[] = ['egg', 'baby', 'teen', 'adult'];

export type Stars = 1 | 2 | 3;

export interface Variant {
  id: string;
  name: string;
  sheet: string; // sheet name in public/sprites/manifest.json
  chance: number; // percent chance a pet of this character gets this variant
}

export interface Character {
  id: string;
  theme: string; // a key of THEMES
  stars: Stars;
  name: string;
  sheet: string; // sheet name in public/sprites/manifest.json
  variants?: Variant[];
  traits?: string[]; // the only traits its pets can have (see traits.ts)
}

export const CHARACTERS = data.characters as Character[];
export const THEMES: Record<string, string> = data.themes;
// The elements every theme belongs to (they never change, new themes join
// one), and which one each theme is in.
export const ELEMENTS: Record<string, string> = data.elements;
const THEME_ELEMENTS: Record<string, string> = data.themeElements;

export function elementOf(theme: string | null | undefined): string | null {
  return (theme && THEME_ELEMENTS[theme]) || null;
}
// Themes from packs that aren't out yet: pets that already have one of
// their characters keep it, but no new pet grows into one.
export const LATER_PACKS: readonly string[] = data.laterPacks;
// The characters a pet (or a wanderer) can grow into now.
export const IN_GAME = CHARACTERS.filter((c) => !LATER_PACKS.includes(c.theme));
const STAGE_SHEETS: Record<Exclude<Stage, 'adult'>, string> = data.stages;

export function getCharacter(id: string | null): Character | undefined {
  return CHARACTERS.find((c) => c.id === id);
}

export function getVariant(character: Character | undefined, id: string | null): Variant | undefined {
  return character?.variants?.find((v) => v.id === id);
}

// The sprite sheet of a grown-up character (and its colour variant).
export function characterSheet(id: string | null, variant: string | null): string {
  const character = getCharacter(id);
  return getVariant(character, variant)?.sheet ?? character?.sheet ?? '';
}

// The sprite sheet the pet should be drawn with right now.
export function sheetFor(pet: Pet): string {
  if (pet.stage !== 'adult') return STAGE_SHEETS[pet.stage];
  return characterSheet(pet.character, pet.variant);
}

export function nextStage(stage: Stage): Stage | null {
  const i = STAGES.indexOf(stage);
  return i < STAGES.length - 1 ? STAGES[i + 1] : null;
}

// How long the pet stays in a stage, in milliseconds (Infinity for adult).
export function stageLengthMs(stage: Stage): number {
  if (stage === 'adult') return Infinity;
  return CONFIG.growth.stageHours[stage] * 3_600_000;
}

// A number from 0 (inclusive) to 1 (exclusive) made from the pet's id and a
// label. The same pet and label always give the same number, and different
// labels give unrelated numbers, so each roll is independent.
export function seededRoll(petId: string, label: string): number {
  let h = 0x811c9dc5;
  for (const ch of `${petId}:${label}`) h = Math.imul(h ^ ch.charCodeAt(0), 0x01000193);
  // Mix the bits well so similar ids don't give similar numbers.
  h = Math.imul(h ^ (h >>> 16), 0x85ebca6b);
  h = Math.imul(h ^ (h >>> 13), 0xc2b2ae35);
  h ^= h >>> 16;
  return (h >>> 0) / 4_294_967_296;
}

// Picks an item from a list where each item has a chance in percent. Returns
// null when the roll lands outside all the chances.
function pickByChance<T>(items: [T, number][], roll: number): T | null {
  let total = 0;
  for (const [item, chance] of items) {
    total += chance / 100;
    if (roll < total) return item;
  }
  return null;
}

// Rolls a star rarity from odds in percent, e.g. { 1: 60, 2: 30, 3: 10 }.
export function rollStarsWith(odds: Record<Stars, number>, roll: number): Stars {
  return pickByChance(([1, 2, 3] as Stars[]).map((s): [Stars, number] => [s, odds[s]]), roll) ?? 1;
}

// True when both parents grew into 3-star characters.
export function starParents(parentLooks: readonly ParentLook[]): boolean {
  return parentLooks.length === 2 && parentLooks.every((l) => getCharacter(l.character)?.stars === 3);
}

// The star odds (percent) for a Care Score (and the parents, if any). With
// a 1-star parent, 1 star never drops below CONFIG.inheritance.oneStarFloor:
// the difference comes off 3 stars first, then 2.
export function starOdds(careScore: number, parentLooks: readonly ParentLook[] = []): Record<Stars, number> {
  const table = starParents(parentLooks) ? CONFIG.rarityStarParents : CONFIG.rarity;
  const odds: Record<Stars, number> = { ...(table.find((r) => careScore >= r.minCare) ?? table[table.length - 1]).odds };
  const floor = CONFIG.inheritance.oneStarFloor;
  if (parentLooks.some((l) => getCharacter(l.character)?.stars === 1) && odds[1] < floor) {
    let short = floor - odds[1];
    odds[1] = floor;
    for (const s of [3, 2] as Stars[]) {
      const take = Math.min(short, odds[s]);
      odds[s] -= take;
      short -= take;
    }
  }
  return odds;
}

// Rolls a star rarity for a Care Score (and the parents, if any).
export function rollStars(careScore: number, petId: string, parentLooks: readonly ParentLook[] = []): Stars {
  return rollStarsWith(starOdds(careScore, parentLooks), seededRoll(petId, 'stars'));
}

// The rarity a pet really gets when it rolls `rolled`: the same if anyone
// has it, otherwise the next one down (then up) that someone has.
export function starsInGame(rolled: Stars): Stars {
  const order = [rolled, ...([3, 2, 1] as Stars[]).filter((s) => s < rolled), ...([1, 2, 3] as Stars[]).filter((s) => s > rolled)];
  return order.find((s) => IN_GAME.some((c) => c.stars === s)) ?? 1;
}

// Picks a colour variant (or none) for a pet growing into `character`. A
// variant a parent shows or carries comes back CONFIG.genes.variantChance
// of the time; otherwise each variant has its own chance.
export function variantOf(character: Character, seed: string, family: Partial<Inheritance>): Variant | null {
  const inherited = (character.variants ?? []).filter((v) => (family.variants ?? []).includes(`${character.id}:${v.id}`));
  if (inherited.length > 0 && seededRoll(seed, 'variantGene') * 100 < CONFIG.genes.variantChance) {
    return inherited[Math.floor(seededRoll(seed, 'whichVariantGene') * inherited.length)];
  }
  const variants = (character.variants ?? []).map((v): [Variant, number] => [v, v.chance]);
  return pickByChance(variants, seededRoll(seed, 'variant'));
}

// Picks a character of a star rarity, of any theme (a first pet, or a
// wanderer), and maybe a colour variant. If nobody has that rarity yet,
// it steps down (then up) until someone does.
export function characterOfStars(
  rolled: Stars,
  seed: string,
  family: Partial<Inheritance> = {},
): { character: Character; variant: Variant | null } {
  const options = IN_GAME.filter((c) => c.stars === starsInGame(rolled));
  const character = options[Math.floor(seededRoll(seed, 'character') * options.length)];
  return { character, variant: variantOf(character, seed, family) };
}

// The highest rarity a little one can reach in `theme`: 3 stars only if a
// parent shows that theme as a 2-star or 3-star character.
export function starCap(theme: string, parentLooks: readonly ParentLook[]): Stars {
  const climbs = parentLooks.some((l) => {
    const c = getCharacter(l.character);
    return c?.theme === theme && c.stars >= 2;
  });
  return climbs ? 3 : 2;
}

// The characters of `theme` a pet of `stars` grows into: that rarity, or
// the next one down (then up) the theme has.
function charactersIn(theme: string, stars: Stars): Character[] {
  const ofTheme = IN_GAME.filter((c) => c.theme === theme);
  const order = [stars, ...([3, 2, 1] as Stars[]).filter((s) => s < stars), ...([1, 2, 3] as Stars[]).filter((s) => s > stars)];
  const found = order.find((s) => ofTheme.some((c) => c.stars === s));
  return ofTheme.filter((c) => c.stars === found);
}

// The chance (0 to 1) of each character a little one can grow into, for a
// Care Score. One of its parents' themes, split evenly, or now and then
// (CONFIG.inheritance.outsideThemeChance) a theme a parent only carries.
// Within the theme, the stars come from the Care Score, capped by
// starCap(). The forecast before mingling uses this too, so its numbers
// are honest.
export function littleOneChances(
  careScore: number,
  family: Partial<Inheritance>,
  parentLooks: readonly ParentLook[],
): Map<Character, number> {
  const inGame = (t: string) => IN_GAME.some((c) => c.theme === t);
  const shown = (family.themes ?? []).filter(inGame);
  const carried = (family.carriedThemes ?? []).filter(inGame);
  const themes = shown.length > 0 ? shown : [...new Set(IN_GAME.map((c) => c.theme))];
  const outside = carried.length > 0 ? CONFIG.inheritance.outsideThemeChance / 100 : 0;
  const pool: [string, number][] = [
    ...themes.map((t): [string, number] => [t, (1 - outside) / themes.length]),
    ...carried.map((t): [string, number] => [t, outside / carried.length]),
  ];
  const odds = starOdds(careScore, parentLooks);
  const chances = new Map<Character, number>();
  for (const [theme, weight] of pool) {
    for (const s of [1, 2, 3] as Stars[]) {
      if (!odds[s]) continue;
      const list = charactersIn(theme, Math.min(s, starCap(theme, parentLooks)) as Stars);
      for (const c of list) chances.set(c, (chances.get(c) ?? 0) + (weight * odds[s]) / 100 / list.length);
    }
  }
  return chances;
}

// Picks the character (and maybe a colour variant) a teen grows into.
export function chooseCharacter(
  careScore: number,
  petId: string,
  family: Partial<Inheritance> = {},
  parentLooks: readonly ParentLook[] = [],
): { character: Character; variant: Variant | null } {
  if ((family.themes ?? []).length === 0) return characterOfStars(rollStars(careScore, petId, parentLooks), petId, family);
  const chances = [...littleOneChances(careScore, family, parentLooks)];
  const roll = seededRoll(petId, 'character');
  let total = 0;
  const character = (chances.find(([, chance]) => roll < (total += chance)) ?? chances[chances.length - 1])[0];
  return { character, variant: variantOf(character, petId, family) };
}

// Moves the pet into its next stage at time `t` (changes `pet` in place).
export function growUp(pet: Pet, t: number): void {
  const next = nextStage(pet.stage);
  if (!next) return;
  pet.stage = next;
  pet.stageStartedAt = t;
  if (next === 'baby') {
    // Freshly hatched: start with comfy stats.
    pet.stats = { ...CONFIG.startingStats };
  }
  if (next === 'adult') {
    const { character, variant } = chooseCharacter(pet.careScore, pet.id, inheritanceOf(pet), pet.parentLooks ?? []);
    pet.character = character.id;
    pet.variant = variant?.id ?? null;
    pet.carried = genesAtGrowUp(pet, character, pet.variant);
    pet.trait = fitTrait(pet.id, pet.trait, character);
  }
}
