// The rules of the garden. The screen side (the pots, the buttons and the
// watering can) lives in src/ui/garden.ts; this file only decides how
// plants grow, when they get sick and what tending them does.
//
// How it works: plant a seed in an empty pot, water it, and it grows in
// real time (even while the game is closed) until it's ready to harvest.
// Soil stays moist for a while after watering. Once it's dry, every few
// hours there's a chance the plant gets sick; a sick plant stops growing
// until it gets Plant cure, and dies if it's left sick for too long.
// Fertilizer makes one pot grow faster for a while and lowers the chance
// of getting sick. You buy it in the Shop, or make it from the poop you
// pick up (compost).
//
// Everything here works from timestamps, so catching up after a week away
// is as quick as after a minute. The sickness rolls are worked out from a
// number saved in the pot when it was last watered, so the same garden
// always turns out the same way however often the game catches up.

import { CONFIG } from './config';
import { addTally } from './achievements';
import type { FoodId } from './actions';
import type { GameState, Plot } from './state';
import { perk, type GardenPerks } from './skills';
import { poopCount } from './hygiene';

const HOUR = 3_600_000;
const G = CONFIG.garden;
// No garden skills learned.
const PLAIN: GardenPerks = { speed: 1, sick: 1 };

export type CropId = (typeof G.crops)[number]['id'];
export type SupplyId = keyof typeof G.supplies;
export type Crop = (typeof G.crops)[number];

export const CROPS = G.crops as readonly Crop[];
export const SUPPLIES = Object.keys(G.supplies) as SupplyId[];

export function getCrop(id: string): Crop {
  return CROPS.find((c) => c.id === id)!;
}

export function emptyPlot(): Plot {
  return {
    crop: null,
    growth: 0,
    moistUntil: 0,
    rollsFrom: 0,
    rolls: 0,
    luck: 0,
    fertilizedUntil: 0,
    sickSince: null,
    dead: false,
  };
}

export function newGarden(): Plot[] {
  return Array.from({ length: G.plots }, emptyPlot);
}

// Whether a pot wants looking after: dry soil under a growing plant, a sick
// plant, or one ready to harvest. The Play button shows a drop for it.
export function needsTending(garden: Plot[], now: number): boolean {
  return garden.some((p) => {
    const stage = plotStage(p);
    return stage === 'sick' || stage === 'ready' || (stage === 'growing' && moisture(p, now) <= 0);
  });
}

// How long a crop takes to grow, in milliseconds of growing time.
export function growMs(crop: string): number {
  return getCrop(crop).hours * HOUR;
}

export function moistMs(perfect: boolean): number {
  return G.moistHours * HOUR * (perfect ? 1 + G.perfectPourBonus : 1);
}

// What a pot looks like right now.
export type PlotStage = 'empty' | 'growing' | 'sick' | 'ready' | 'dead';

export function plotStage(plot: Plot): PlotStage {
  if (!plot.crop) return 'empty';
  if (plot.dead) return 'dead';
  if (plot.sickSince !== null) return 'sick';
  if (plot.growth >= growMs(plot.crop)) return 'ready';
  return 'growing';
}

// How far along a plant is, from 0 (just planted) to 1 (ready).
export function progress(plot: Plot): number {
  return plot.crop ? Math.min(1, plot.growth / growMs(plot.crop)) : 0;
}

// How wet the soil is, from 1 (just watered) to 0 (dry).
export function moisture(plot: Plot, now: number): number {
  return Math.max(0, Math.min(1, (plot.moistUntil - now) / moistMs(false)));
}

export function isFertilized(plot: Plot, now: number): boolean {
  return now < plot.fertilizedUntil;
}

// Growing time still needed, in real milliseconds at the current speed.
// `perks` are the garden skills (Quick sprouts makes everything faster).
export function timeLeft(plot: Plot, now: number, perks: GardenPerks = PLAIN): number {
  if (!plot.crop) return 0;
  const need = growMs(plot.crop) - plot.growth;
  if (need <= 0) return 0;
  const fastFor = Math.max(0, plot.fertilizedUntil - now);
  const fastRate = (1 + G.fertilizer.speedUp) * perks.speed;
  if (fastFor * fastRate >= need) return need / fastRate;
  return fastFor + (need - fastFor * fastRate) / perks.speed;
}

// When a sick plant will die if nobody cures it.
export function diesAt(plot: Plot): number | null {
  return plot.sickSince === null ? null : plot.sickSince + G.daysUntilDead * 24 * HOUR;
}

// A number from 0 to 1 worked out from a pot's luck and the roll number.
// The same inputs always give the same number.
export function rollFor(luck: number, n: number): number {
  let h = Math.floor(luck * 0x7fffffff) ^ Math.imul(n + 1, 0x9e3779b1);
  h = Math.imul(h ^ (h >>> 16), 0x85ebca6b);
  h = Math.imul(h ^ (h >>> 13), 0xc2b2ae35);
  h ^= h >>> 16;
  return (h >>> 0) / 0x100000000;
}

// Moves one pot forward from `from` to `to`. Returns a new pot. `perks`
// are the garden skills: faster growing and fewer sick plants.
export function growPlot(plot: Plot, from: number, to: number, perks: GardenPerks = PLAIN): Plot {
  const p = { ...plot };
  let t = from;
  const rollMs = G.dryHoursPerRoll * HOUR;
  // Each pass moves to the next thing that changes how the plant grows:
  // fertilizer wearing off, the plant being ready, or a sickness roll.
  for (let guard = 0; guard < 1000 && t < to; guard++) {
    if (!p.crop || p.dead) break;
    if (p.sickSince !== null) {
      if (to >= diesAt(p)!) p.dead = true;
      break;
    }
    const need = growMs(p.crop) - p.growth;
    if (need <= 0) break; // ready plants just wait to be picked
    const fast = t < p.fertilizedUntil;
    const rate = (fast ? 1 + G.fertilizer.speedUp : 1) * perks.speed;
    const nextRoll = Math.max(p.rollsFrom, p.moistUntil) + (p.rolls + 1) * rollMs;
    const readyAt = t + need / rate;
    const end = Math.min(to, readyAt, fast ? p.fertilizedUntil : Infinity, nextRoll);
    // Reaching readyAt means ready. Adding (end - t) * rate instead can fall
    // a hair short (timestamps are too big for fractions of a millisecond),
    // and then the plant never finishes.
    p.growth = end >= readyAt ? growMs(p.crop) : Math.min(growMs(p.crop), p.growth + (end - t) * rate);
    t = end;
    if (t === nextRoll && p.growth < growMs(p.crop)) {
      const chance = (t < p.fertilizedUntil ? G.sickChanceFertilized : G.sickChance) * perks.sick;
      if (rollFor(p.luck, p.rolls) < chance) p.sickSince = t;
      p.rolls++;
    }
  }
  return p;
}

// Catches the whole garden up from `from` to `to`.
export function growGarden(garden: Plot[], from: number, to: number, perks: GardenPerks = PLAIN): Plot[] {
  if (to <= from) return garden;
  return garden.map((p) => (p.crop && !p.dead ? growPlot(p, from, to, perks) : p));
}

// Catches the garden up from `from` to `to` with time stopped while
// everyone was on a Holiday (`paused`): it grows up to the start, all its
// clocks move on by however long it lasted, and it grows on after.
export function growGardenAround(
  garden: Plot[], from: number, to: number, paused: { from: number; until: number } | null | undefined, perks: GardenPerks = PLAIN,
): Plot[] {
  if (!paused || paused.until <= from || paused.from >= to) return growGarden(garden, from, to, perks);
  const stop = Math.max(from, paused.from);
  const go = Math.min(to, paused.until);
  const shift = go - stop;
  // Every clock moves on, as if the time away never happened.
  const later = (t: number) => t + shift;
  const moved = growGarden(garden, from, stop, perks).map((p) => ({
    ...p,
    moistUntil: later(p.moistUntil),
    rollsFrom: later(p.rollsFrom),
    fertilizedUntil: later(p.fertilizedUntil),
    sickSince: p.sickSince === null ? null : later(p.sickSince),
  }));
  return growGarden(moved, go, to, perks);
}

export type GardenBlock =
  | 'noPlot'
  | 'notEmpty'
  | 'noSeed'
  | 'nothingToWater'
  | 'notGrowing'
  | 'alreadyFertilized'
  | 'noFertilizer'
  | 'notSick'
  | 'noCure'
  | 'notReady'
  | 'notDead';

export interface GardenResult {
  state: GameState;
  blocked?: GardenBlock;
}

// Changes one pot (and maybe the inventory).
function withPlot(state: GameState, index: number, change: (p: Plot) => void): GameState {
  const garden = state.garden.map((p, i) => {
    if (i !== index) return p;
    const copy = { ...p };
    change(copy);
    return copy;
  });
  return { ...state, garden };
}

function useItem(
  state: GameState,
  kind: 'seeds' | 'supplies',
  id: string,
): GameState | null {
  const have = state.inventory[kind][id] ?? 0;
  if (have <= 0) return null;
  return { ...state, inventory: { ...state.inventory, [kind]: { ...state.inventory[kind], [id]: have - 1 } } };
}

// Puts a seed in an empty pot. The soil starts out dry, so water it next.
// `luck` (0-1) decides the pot's sickness rolls.
export function plant(state: GameState, index: number, crop: CropId, now: number, luck: number): GardenResult {
  const plot = state.garden[index];
  if (!plot) return { state, blocked: 'noPlot' };
  if (plotStage(plot) !== 'empty') return { state, blocked: 'notEmpty' };
  const s = useItem(state, 'seeds', crop);
  if (!s) return { state, blocked: 'noSeed' };
  return {
    state: withPlot(s, index, (p) => {
      Object.assign(p, emptyPlot(), { crop, moistUntil: now, rollsFrom: now, luck });
    }),
  };
}

// Waters a pot. Free; a perfect pour keeps it moist a little longer, and
// so does the Deep roots skill.
export function water(state: GameState, index: number, now: number, perfect: boolean, luck: number): GardenResult {
  const plot = state.garden[index];
  if (!plot) return { state, blocked: 'noPlot' };
  const stage = plotStage(plot);
  if (stage !== 'growing' && stage !== 'sick') return { state, blocked: 'nothingToWater' };
  return {
    state: withPlot(state, index, (p) => {
      p.moistUntil = now + moistMs(perfect) + perk(state, 'deepRoots') * HOUR;
      p.rollsFrom = p.moistUntil;
      p.rolls = 0;
      p.luck = luck;
    }),
  };
}

// Fertilizes a growing pot. Out of bags but with enough poop, it makes a
// bag from the poop first (`composted` says so).
export function fertilize(state: GameState, index: number, now: number): GardenResult & { composted?: boolean } {
  const plot = state.garden[index];
  if (!plot) return { state, blocked: 'noPlot' };
  if (plotStage(plot) !== 'growing') return { state, blocked: 'notGrowing' };
  if (isFertilized(plot, now)) return { state, blocked: 'alreadyFertilized' };
  const composted = supplyCount(state, 'fertilizer') === 0 && canCompost(state);
  const s = useItem(composted ? compost(state).state : state, 'supplies', 'fertilizer');
  if (!s) return { state, blocked: 'noFertilizer' };
  return { state: withPlot(s, index, (p) => (p.fertilizedUntil = now + G.fertilizer.hours * HOUR)), composted };
}

// ---- Compost: poop into fertilizer ----

export function canCompost(state: GameState): boolean {
  return poopCount(state) >= G.poopPerFertilizer;
}

// How many bags of fertilizer you could use right now: the ones you have,
// and the ones your poop would make.
export function fertilizerReady(state: GameState): number {
  return supplyCount(state, 'fertilizer') + Math.floor(poopCount(state) / G.poopPerFertilizer);
}

// Turns `poopPerFertilizer` poops into one bag of fertilizer.
export function compost(state: GameState): { state: GameState; blocked?: 'notEnoughPoop' } {
  if (!canCompost(state)) return { state, blocked: 'notEnoughPoop' };
  const supplies = {
    ...state.inventory.supplies,
    poop: poopCount(state) - G.poopPerFertilizer,
    fertilizer: supplyCount(state, 'fertilizer') + 1,
  };
  return { state: { ...state, inventory: { ...state.inventory, supplies } } };
}

// Heals a sick plant. It carries on growing from where it stopped. If the
// soil is still dry, the next sickness roll is a full wait away.
export function cure(state: GameState, index: number, now: number): GardenResult {
  const plot = state.garden[index];
  if (!plot) return { state, blocked: 'noPlot' };
  if (plotStage(plot) !== 'sick') return { state, blocked: 'notSick' };
  const s = useItem(state, 'supplies', 'plantCure');
  if (!s) return { state, blocked: 'noCure' };
  return {
    state: withPlot(s, index, (p) => {
      p.sickSince = null;
      p.rollsFrom = Math.max(p.moistUntil, now);
      p.rolls = 0;
    }),
  };
}

// Picks a ready plant: the crop goes into the inventory as food, and the
// pot is empty again.
export function harvest(state: GameState, index: number): GardenResult & { crop?: CropId; count?: number } {
  const plot = state.garden[index];
  if (!plot) return { state, blocked: 'noPlot' };
  if (plotStage(plot) !== 'ready') return { state, blocked: 'notReady' };
  const crop = plot.crop as CropId;
  const count = getCrop(crop).harvest;
  const id = crop as FoodId;
  const food = { ...state.inventory.food, [id]: (state.inventory.food[id] ?? 0) + count };
  const grown = state.grown.includes(crop) ? state.grown : [...state.grown, crop];
  const s = withPlot({ ...state, inventory: { ...state.inventory, food }, grown }, index, (p) => Object.assign(p, emptyPlot()));
  return { state: addTally(s, 'harvests'), crop, count };
}

// Clears away a plant that died, so the pot can be used again.
export function clearPlot(state: GameState, index: number): GardenResult {
  const plot = state.garden[index];
  if (!plot) return { state, blocked: 'noPlot' };
  if (plotStage(plot) !== 'dead') return { state, blocked: 'notDead' };
  return { state: withPlot(state, index, (p) => Object.assign(p, emptyPlot())) };
}

// ---- Seeds and supplies ----

export function seedCount(state: GameState, crop: CropId): number {
  return state.inventory.seeds[crop] ?? 0;
}

export function supplyCount(state: GameState, id: SupplyId): number {
  return state.inventory.supplies[id] ?? 0;
}

export function addSeed(state: GameState, crop: CropId, count = 1): GameState {
  const seeds = { ...state.inventory.seeds, [crop]: seedCount(state, crop) + count };
  return { ...state, inventory: { ...state.inventory, seeds } };
}

// Which seed was found, from a random number (0-1). A perfect catch makes
// the rarer ones more likely.
export function pickSeed(random: number, perfect = false): CropId {
  const odds = perfect ? G.seedOdds.perfect : G.seedOdds.other;
  const entries = Object.entries(odds) as [CropId, number][];
  const total = entries.reduce((sum, [, n]) => sum + n, 0);
  let roll = random * total;
  for (const [id, n] of entries) {
    if (roll < n) return id;
    roll -= n;
  }
  return entries[entries.length - 1][0];
}

// A lucky find while fishing or playing. `chanceRoll` is rolled against
// the chance, and `kindRoll` picks the seed. Returns the seed found (null
// if none).
export function findSeed(
  state: GameState,
  source: 'fishing' | 'play',
  chanceRoll: number,
  kindRoll: number,
  perfect = false,
): { state: GameState; seed: CropId | null } {
  if (chanceRoll >= G.seedChance[source]) return { state, seed: null };
  const seed = pickSeed(kindRoll, perfect);
  return { state: addSeed(state, seed), seed };
}

export type ShopItem = { kind: 'seed'; id: CropId } | { kind: 'supply'; id: SupplyId };

export function priceOf(item: ShopItem): number {
  return item.kind === 'seed' ? getCrop(item.id).seedPrice : G.supplies[item.id];
}

// Seeds you can buy (the rest are only found by luck).
export const SEEDS_FOR_SALE = CROPS.filter((c) => c.seedPrice > 0).map((c) => c.id as CropId);
