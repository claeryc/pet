// Poop and bath time. Now and then the pet poops on the floor beside it
// (tap a poop to pick it up), and now and then it gets smelly: wavy lines
// rise off it until it has a bath (tap the pet, rub it with the sponge,
// then dry it, see src/ui/bath.ts). Babies and teens need it more often.
//
// Nothing bad happens straight away. A poop left lying around for a few
// hours makes the pet smelly too, and a pet left smelly for a few hours is
// "stinky": its joy drops a little faster and it may catch germs, which
// count like a low bar (a warning first, then sick, see simulate.ts).
//
// Like everything else it runs on real time inside simulate(), and only
// while the pet is awake and at home.

import { CONFIG } from './config';
import { seededRoll } from './growth';
import { clampStat } from './stats';
import type { GameState, Pet } from './state';
import { isAway } from './presence';

const HOUR = 3_600_000;
const H = CONFIG.hygiene;

// A poop on the floor: when it was made, and which of the spots beside the
// pet it's in (see POOP_SPOTS in src/render/hygiene.ts).
export interface Poop {
  at: number;
  slot: number;
}

export interface Hygiene {
  poops: Poop[];
  smelly: boolean;
  smellyMinutes: number; // awake minutes it has been smelly
  germs: boolean; // caught from staying smelly; washed off by a bath
  nextPoopAt: number; // 0 = not planned yet
  nextSmellAt: number;
}

export function newHygiene(): Hygiene {
  return { poops: [], smelly: false, smellyMinutes: 0, germs: false, nextPoopAt: 0, nextSmellAt: 0 };
}

type Kind = 'poop' | 'smell';

// How long until the next poop or smell from time `t`: the stage's gap,
// give or take a quarter. The same moment always gives the same gap.
export function gapMs(pet: Pet, kind: Kind, t: number): number {
  const hours = (kind === 'poop' ? H.poopEveryHours : H.smellyEveryHours)[pet.stage as 'baby' | 'teen' | 'adult'] ?? H.poopEveryHours.adult;
  return hours * HOUR * (0.75 + 0.5 * seededRoll(pet.id, `${kind}:${t}`));
}

// A pet left smelly long enough to be stinky.
export function isStinky(pet: Pet): boolean {
  return pet.hygiene.smelly && pet.hygiene.smellyMinutes >= H.stinkyAfterHours * 60;
}

// One tick of `minutes` ending at `t`, for a pet that's hatched, at home
// and alive. Changes `pet` in place (simulate's private copy). `slow` is
// how fast its joy drops right now (age, sleep, skills).
export function hygieneTick(pet: Pet, t: number, minutes: number, slow: number): void {
  const h = pet.hygiene;
  if (!h.nextPoopAt) h.nextPoopAt = t + gapMs(pet, 'poop', t);
  if (!h.nextSmellAt) h.nextSmellAt = t + gapMs(pet, 'smell', t);
  // A sleeping pet waits until it's up (so no pile of poop every morning).
  if (pet.asleep) return;
  if (t >= h.nextPoopAt) {
    const slot = freeSlot(h.poops);
    if (slot >= 0) h.poops = [...h.poops, { at: t, slot }];
    h.nextPoopAt = t + gapMs(pet, 'poop', t);
  }
  if (!h.smelly && (t >= h.nextSmellAt || h.poops.some((p) => t - p.at >= H.poopSmellsAfterHours * HOUR))) {
    h.smelly = true;
    h.smellyMinutes = 0;
  }
  if (!h.smelly) return;
  h.smellyMinutes += minutes;
  const over = h.smellyMinutes - H.stinkyAfterHours * 60;
  if (over < 0) return;
  pet.stats.happiness = clampStat(pet.stats.happiness - (H.stinkyJoyPerHour * minutes / 60) * slow);
  // Once an hour, a chance of germs.
  if (over % 60 === 0 && !h.germs && seededRoll(pet.id, `germs:${t}`) < H.germChancePerHour) h.germs = true;
}

// The first spot with no poop in it, or -1 if they're all taken.
function freeSlot(poops: Poop[]): number {
  for (let slot = 0; slot < H.maxPoops; slot++) if (!poops.some((p) => p.slot === slot)) return slot;
  return -1;
}

// Every pet at home (yours and the other one), to find whose poop it is.
function withHygiene(state: GameState, petId: string, change: (h: Hygiene) => Hygiene): GameState {
  const up = (p: Pet) => (p.id === petId ? { ...p, hygiene: change(p.hygiene) } : p);
  return { ...state, pet: up(state.pet), housemates: state.housemates.map(up) };
}

// Picks up a poop in spot `slot` by pet `petId`, and keeps it (a few make
// fertilizer for the garden, see compost() in garden.ts). Nothing if it
// isn't there.
export function collectPoop(state: GameState, petId: string, slot: number): GameState {
  const pet = [state.pet, ...state.housemates].find((p) => p.id === petId);
  if (!pet || !pet.hygiene.poops.some((p) => p.slot === slot)) return state;
  const supplies = { ...state.inventory.supplies, poop: poopCount(state) + 1 };
  const kept = { ...state, inventory: { ...state.inventory, supplies } };
  return withHygiene(kept, petId, (h) => ({ ...h, poops: h.poops.filter((p) => p.slot !== slot) }));
}

// How many picked-up poops you're keeping.
export function poopCount(state: GameState): number {
  return state.inventory.supplies.poop ?? 0;
}

export type BathBlock = 'egg' | 'asleep' | 'away' | 'passed' | 'notSmelly';

// Whether the pet you're looking after can have a bath now.
export function bathBlock(pet: Pet): BathBlock | null {
  if (isAway(pet)) return 'away';
  if (pet.condition === 'passed') return 'passed';
  if (pet.stage === 'egg') return 'egg';
  if (pet.asleep) return 'asleep';
  if (!pet.hygiene.smelly) return 'notSmelly';
  return null;
}

// The pet you're looking after had its bath and is dry: no more smell or
// germs, a little joy, and the next smell is a while off.
export function bathe(state: GameState, now: number): { state: GameState; blocked?: BathBlock } {
  const blocked = bathBlock(state.pet);
  if (blocked) return { state, blocked };
  const pet = state.pet;
  return {
    state: {
      ...state,
      pet: {
        ...pet,
        stats: { ...pet.stats, happiness: clampStat(pet.stats.happiness + H.bathJoy) },
        hygiene: { ...pet.hygiene, smelly: false, smellyMinutes: 0, germs: false, nextSmellAt: now + gapMs(pet, 'smell', now) },
      },
    },
  };
}

// Testing tools: a poop or a smell right now.
export function poopNow(state: GameState, now: number): GameState {
  const slot = freeSlot(state.pet.hygiene.poops);
  if (slot < 0 || state.pet.stage === 'egg') return state;
  return withHygiene(state, state.pet.id, (h) => ({ ...h, poops: [...h.poops, { at: now, slot }] }));
}

export function smellNow(state: GameState): GameState {
  if (state.pet.stage === 'egg' || state.pet.hygiene.smelly) return state;
  return withHygiene(state, state.pet.id, (h) => ({ ...h, smelly: true, smellyMinutes: 0 }));
}

// The pet's timers moved back by `off` ms (going back to real time).
export function shiftHygiene(h: Hygiene, off: number): Hygiene {
  return {
    ...h,
    poops: h.poops.map((p) => ({ ...p, at: p.at - off })),
    nextPoopAt: h.nextPoopAt && h.nextPoopAt - off,
    nextSmellAt: h.nextSmellAt && h.nextSmellAt - off,
  };
}
