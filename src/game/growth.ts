// Growing up: egg -> baby -> teen -> adult.
//
// Each stage lasts a set time (CONFIG.growth.stageHours). Every egg, baby
// and teen looks the same. When the teen grows up, the game picks which
// *character* it becomes from src/data/characters.json:
//   1. roll a star rarity, with better odds for a higher Care Score (and
//      better still for a little one of two 3-star parents),
//   2. pick a character of that rarity (any theme, though a little one
//      leans towards its parents' themes),
//   3. maybe pick one of that character's colour variants.
// The rolls are based on the pet's id, so reloading never changes them.

import { CONFIG } from './config';
import data from '../data/characters.json';
import type { ParentLook, Pet } from './state';

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
}

export const CHARACTERS = data.characters as Character[];
export const THEMES: Record<string, string> = data.themes;
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

// Rolls a star rarity for a Care Score (and the parents, if any).
export function rollStars(careScore: number, petId: string, parentLooks: readonly ParentLook[] = []): Stars {
  const table = starParents(parentLooks) ? CONFIG.rarityStarParents : CONFIG.rarity;
  const band = table.find((r) => careScore >= r.minCare) ?? table[table.length - 1];
  return rollStarsWith(band.odds, seededRoll(petId, 'stars'));
}

// Picks a character of a star rarity, and maybe a colour variant. If
// nobody has that rarity yet, it steps down (then up) until someone does.
// `themes` (a little one's parents' themes) are favoured
// CONFIG.friends.parentThemeChance of the time, when they have a character
// of that rarity.
export function characterOfStars(
  rolled: Stars,
  seed: string,
  themes: readonly string[] = [],
): { character: Character; variant: Variant | null } {
  const order = [rolled, ...([3, 2, 1] as Stars[]).filter((s) => s < rolled), ...([1, 2, 3] as Stars[]).filter((s) => s > rolled)];
  const stars = order.find((s) => CHARACTERS.some((c) => c.stars === s)) ?? 1;
  let options = CHARACTERS.filter((c) => c.stars === stars);
  if (themes.length > 0 && seededRoll(seed, 'parentTheme') * 100 < CONFIG.friends.parentThemeChance) {
    const theme = themes[Math.floor(seededRoll(seed, 'whichParent') * themes.length)];
    const ofTheme = options.filter((c) => c.theme === theme);
    if (ofTheme.length > 0) options = ofTheme;
  }
  const character = options[Math.floor(seededRoll(seed, 'character') * options.length)];
  const variants = (character.variants ?? []).map((v): [Variant, number] => [v, v.chance]);
  return { character, variant: pickByChance(variants, seededRoll(seed, 'variant')) };
}

// Picks the character (and maybe a colour variant) a teen grows into.
export function chooseCharacter(
  careScore: number,
  petId: string,
  themes: readonly string[] = [],
  parentLooks: readonly ParentLook[] = [],
): { character: Character; variant: Variant | null } {
  return characterOfStars(rollStars(careScore, petId, parentLooks), petId, themes);
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
    const { character, variant } = chooseCharacter(pet.careScore, pet.id, pet.themes ?? [], pet.parentLooks ?? []);
    pet.character = character.id;
    pet.variant = variant?.id ?? null;
  }
}
