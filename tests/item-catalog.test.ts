import { describe, expect, it } from 'vitest';
import hatData from '../src/data/hats.json';
import { buildCatalog } from '../src/art/catalog';
import { CONFIG } from '../src/game/config';

// The item catalog (items.html) reads everything from the game's data, so
// these check that it keeps up as things are added.
describe('item catalog', () => {
  const items = buildCatalog();
  const keys = new Set(items.map((i) => i.key));

  it('lists each item once, with a name and at least one way to get it', () => {
    expect(keys.size).toBe(items.length);
    for (const i of items) {
      expect(i.name, i.key).toBeTruthy();
      expect(i.ways.length, i.key).toBeGreaterThan(0);
    }
  });

  it('has every food, hat, piece of decor, material, bait, charm and project', () => {
    for (const f of CONFIG.foods) expect(keys.has(`food:${f.id}`), f.id).toBe(true);
    for (const h of hatData.hats) expect(keys.has(`hat:${h.id}`), h.id).toBe(true);
    for (const d of [...CONFIG.room.wallpapers, ...CONFIG.room.curtains, ...CONFIG.room.furniture]) expect(keys.has(`room:${d.id}`), d.id).toBe(true);
    for (const m of Object.keys(CONFIG.crafting.materials)) expect(keys.has(`material:${m}`), m).toBe(true);
    for (const b of Object.keys(CONFIG.fishing.baits)) expect(keys.has(`fishing:${b}`), b).toBe(true);
    for (const c of CONFIG.journeys.charms) expect(keys.has(`trips:${c.id}`), c.id).toBe(true);
    for (const p of CONFIG.crafting.projects) expect(keys.has(`project:${p.id}`), p.id).toBe(true);
    for (const c of CONFIG.garden.crops) expect(keys.has(`seed:${c.id}`), c.id).toBe(true);
  });

  it('shows Shop prices and what can only be found', () => {
    const get = (key: string) => items.find((i) => i.key === key)!;
    expect(get('food:strawberry').cost).toEqual([{ cur: 'gold', amount: 10 }]);
    expect(get('food:salmon').cost).toEqual([]);
    expect(get('food:salmon').ways.some((w) => w.way === 'fishing')).toBe(true);
    expect(get('hat:starryCap').cost).toEqual([{ cur: 'frag', amount: 100 }]);
    expect(get('room:shellGarland').ways.map((w) => w.way)).toEqual(['workbench']);
    expect(get('food:seaweed').theme).toBe('ocean');
    expect(get('food:strawberry').theme).toBeUndefined();
  });

  it('marks what waits for a future update', () => {
    const later = items.filter((i) => i.later).map((i) => i.key);
    for (const p of CONFIG.crafting.projects as readonly { id: string; part: string; later?: boolean }[]) {
      expect(later.includes(`project:${p.id}`), p.id).toBe(!!p.later);
      expect(later.includes(`part:${p.part}`), p.part).toBe(!!p.later);
    }
    expect(later).toContain('kitchen:mill');
    expect(later).not.toContain('kitchen:biggerPot');
  });

  it('has art for everything out now, except the ones still flagged', () => {
    const missing = items.filter((i) => i.missingArt && !i.later).map((i) => i.key);
    expect(missing).toEqual([]);
  });
});
