import { describe, expect, it } from 'vitest';
import { CONFIG } from '../src/game/config';
import {
  addMaterial, addPart, buildStage, craft, digForPart, hasAnyMaterial, hasPart, materialCount, PATTERNS,
  perchRestOff, progressOf, PROJECTS, projectDone, stepCrafting, tripCrafting,
} from '../src/game/crafting';
import { FURNITURE, ownsDecor } from '../src/game/decor';
import { percyPerks } from '../src/game/regulars';
import { unlocksFor } from '../src/game/unlocks';
import type { GameState } from '../src/game/state';
import { newTeen } from './helpers';

const HOUR = 3_600_000;
const START = new Date(2026, 0, 1, 10, 0).getTime();
const C = CONFIG.crafting;

const withMaterials = (s: GameState, n = 50): GameState =>
  Object.keys(C.materials).reduce((acc, id) => addMaterial(acc, id, n), s);

// Builds every stage of a project, waiting out each one.
function buildAll(s: GameState, id: string, at = START): { state: GameState; at: number } {
  const p = PROJECTS.find((x) => x.id === id)!;
  for (const stage of p.stages) {
    s = { ...s, gold: s.gold + stage.gold };
    const r = buildStage(s, at, id);
    expect(r.blocked).toBeUndefined();
    at += stage.hours * HOUR;
    s = stepCrafting(r.state, at);
  }
  return { state: s, at };
}

describe('the pouch', () => {
  it('starts empty and keeps each material under the cap', () => {
    let s = newTeen(START);
    expect(hasAnyMaterial(s)).toBe(false);
    expect(unlocksFor(s)).not.toContain('workbench');
    s = addMaterial(s, 'twig', 500);
    expect(materialCount(s, 'twig')).toBe(C.maxEach);
    expect(unlocksFor(s)).toContain('workbench');
  });
});

describe('finding materials', () => {
  const pet = (s: GameState) => s.pet;
  it('brings some home from every journey, more on a rarer one', () => {
    const s = newTeen(START);
    const count = (rarity: 'common' | 'rare' | 'epic') =>
      tripCrafting(s, pet(s), { id: 'woods', theme: 'none' }, rarity, START)
        .filter((f) => f.kind === 'material')
        .reduce((n, f) => n + f.count, 0);
    expect(count('common')).toBe(C.trip.common);
    expect(count('rare')).toBe(C.trip.rare);
    expect(count('epic')).toBeGreaterThanOrEqual(C.trip.epic);
  });

  it('only finds what the place has', () => {
    const s = newTeen(START);
    const allowed = Object.values(C.places.cove).flat() as string[];
    for (let i = 0; i < 40; i++) {
      for (const f of tripCrafting(s, s.pet, { id: 'cove', theme: 'none' }, 'rare', START + i)) {
        if (f.kind === 'material') expect(allowed).toContain(f.id);
      }
    }
  });

  it("digs up a place's key part in the end, and not again", () => {
    let s = newTeen(START);
    let tries = 0;
    // A roll of 0.99 only wins once the chance has climbed all the way.
    while (!hasPart(s, 'millstone')) {
      const r = digForPart(s, 'woods', 0.99);
      s = r.state;
      tries++;
      expect(tries).toBeLessThan(20);
    }
    expect(tries).toBe(Math.ceil((0.99 - C.partDig.first) / C.partDig.step) + 1);
    expect(digForPart(s, 'woods', 0).find).toBeUndefined();
  });
});

describe('the workbench', () => {
  it('makes a pattern from its materials', () => {
    let s = withMaterials(newTeen(START), 5);
    const p = PATTERNS.find((x) => x.id === 'bait')!;
    const r = craft(s, 'bait');
    expect(r.blocked).toBeUndefined();
    s = r.state;
    expect(s.inventory.supplies.bait).toBe(p.count);
    for (const [id, n] of Object.entries(p.needs)) expect(materialCount(s, id)).toBe(5 - (n ?? 0));
  });

  it('makes a charm into the supplies', () => {
    const r = craft(withMaterials(newTeen(START)), 'clover');
    expect(r.state.inventory.supplies['charm:clover']).toBe(1);
  });

  it('makes a room piece only once', () => {
    let s = withMaterials(newTeen(START));
    expect(ownsDecor(s, 'furniture', 'shellGarland')).toBe(false);
    s = craft(s, 'shellGarland').state;
    expect(ownsDecor(s, 'furniture', 'shellGarland')).toBe(true);
    expect(craft(s, 'shellGarland').blocked).toBe('made');
  });

  it('refuses when short', () => {
    expect(craft(newTeen(START), 'starMobile').blocked).toBe('short');
  });

  it("keeps the room pieces out of the Shop", () => {
    const crafted = FURNITURE.filter((d) => d.crafted).map((d) => d.id);
    expect(crafted).toEqual(expect.arrayContaining(['shellGarland', 'driftwoodShelf', 'pebbleBowl', 'seaGlassLamp', 'starMobile']));
    expect(FURNITURE.filter((d) => d.crafted).every((d) => d.price === 0)).toBe(true);
  });
});

describe('projects', () => {
  it('stays locked until its key part is found', () => {
    const s = withMaterials(newTeen(START));
    expect(buildStage(s, START, 'windmill').blocked).toBe('locked');
  });

  it('takes materials and gold, then builds over real hours', () => {
    let s = addPart(withMaterials(newTeen(START)), 'millstone');
    s = { ...s, gold: 1000 };
    const stage = PROJECTS[0].stages[0];
    const r = buildStage(s, START, 'windmill');
    expect(r.blocked).toBeUndefined();
    expect(r.state.gold).toBe(1000 - stage.gold);
    expect(buildStage(r.state, START, 'windmill').blocked).toBe('building');
    expect(progressOf(stepCrafting(r.state, START + stage.hours * HOUR - 1), 'windmill').built).toBe(0);
    const later = stepCrafting(r.state, START + stage.hours * HOUR);
    expect(progressOf(later, 'windmill')).toEqual({ built: 1, until: 0 });
    expect(later.messages.some((m) => m.kind === 'built')).toBe(true);
  });

  it('needs the gold', () => {
    const s = { ...addPart(withMaterials(newTeen(START)), 'millstone'), gold: 0 };
    expect(buildStage(s, START, 'windmill').blocked).toBe('notEnoughGold');
  });

  it('adds the mill to the kitchen when the windmill is done', () => {
    const s = addPart(withMaterials(newTeen(START), 99), 'millstone');
    expect(s.kitchen).not.toContain('mill');
    const { state } = buildAll(s, 'windmill');
    expect(projectDone(state, 'windmill')).toBe(true);
    expect(state.kitchen).toContain('mill');
  });

  it('a beehive gives honey and beeswax once a day', () => {
    const { state, at } = buildAll(addPart(withMaterials(newTeen(START)), 'queenCrown'), 'beehive');
    const honey = state.inventory.food.honey ?? 0;
    const wax = materialCount(state, 'beeswax');
    const again = stepCrafting(state, at + 1);
    expect(again.inventory.food.honey ?? 0).toBe(honey);
    const tomorrow = stepCrafting(again, at + 24 * HOUR);
    expect(tomorrow.inventory.food.honey).toBe(honey + C.hive.honey);
    expect(materialCount(tomorrow, 'beeswax')).toBe(wax + C.hive.beeswax);
  });

  it("Percy's perch shortens his rest", () => {
    const s = addPart(withMaterials(newTeen(START)), 'brassCog');
    const before = percyPerks(s).restHours;
    const { state } = buildAll(s, 'perch');
    expect(perchRestOff(state)).toBe(C.perchRestOff);
    expect(percyPerks(state).restHours).toBe(before - C.perchRestOff);
  });
});
