import { describe, expect, it } from 'vitest';
import { MAPS, START_MAP, areaCard, firstPick, parseOpens, petAt } from '../src/game/map';
import { PLACES } from '../src/game/journeys';
import { CONFIG } from '../src/game/config';
import type { Trip } from '../src/game/state';
import { newTeen } from './helpers';

const NOW = 1_700_000_000_000;
const area = (map: string, id: string) => MAPS[map].areas.find((a) => a.id === id)!;

describe('map.json', () => {
  it('every area opens something the game knows', () => {
    for (const [id, map] of Object.entries(MAPS)) {
      for (const a of map.areas) expect(parseOpens(a.opens), `${id}/${a.id}: ${a.opens}`).not.toBeNull();
      if (map.back) expect(MAPS[map.back], `${id} goes back to ${map.back}`).toBeDefined();
      expect(new Set(map.areas.map((a) => a.id)).size, `${id} has an area twice`).toBe(map.areas.length);
    }
    expect(MAPS[START_MAP]).toBeDefined();
  });

  it('every journey place is on a map', () => {
    const all = Object.values(MAPS).flatMap((m) => m.areas.map((a) => a.opens));
    for (const p of PLACES) expect(all, p.id).toContain(`journey:${p.id}`);
  });

  it("doesn't know made-up places", () => {
    expect(parseOpens('journey:moon')).toBeNull();
    expect(parseOpens('map:nowhere')).toBeNull();
    expect(parseOpens('pizza')).toBeNull();
  });
});

describe('area cards', () => {
  it('a locked area says how it opens, and its button is off', () => {
    const s = newTeen(NOW);
    const c = areaCard(s, NOW, area('island', 'meadow'));
    expect(c.locked).toBe(true);
    expect(c.enabled).toBe(false);
    expect(c.text).toBe(area('island', 'meadow').lockedText);
  });

  it('opens once its part of the game has', () => {
    const s = newTeen(NOW);
    s.unlocked.push('familyTree');
    const c = areaCard(s, NOW, area('island', 'meadow'));
    expect(c.locked).toBe(false);
    expect(c.enabled).toBe(true);
  });

  it('the ship sails before journeys open, to look around, but trips wait', () => {
    const s = newTeen(NOW);
    expect(areaCard(s, NOW, area('island', 'ship')).enabled).toBe(true);
    const market = areaCard(s, NOW, area('sea', 'market'));
    expect(market.locked).toBe(false);
    expect(market.enabled).toBe(false);
    s.unlocked.push('journeys');
    expect(areaCard(s, NOW, area('sea', 'market')).enabled).toBe(true);
  });

  it('a place that opens after some fish says how many are caught', () => {
    const s = newTeen(NOW);
    s.unlocked.push('journeys');
    s.tally.fish = 4;
    const c = areaCard(s, NOW, area('sea', 'cove'));
    expect(c.locked).toBe(true);
    expect(c.text).toContain('4 caught so far');
  });

  it('home is always open, and says where the pet is', () => {
    const c = areaCard(newTeen(NOW), NOW, area('island', 'home'));
    expect(c.enabled).toBe(true);
    expect(c.text).toContain('Mochi');
  });

  it('the map opens on what needs you, or else where the pet is', () => {
    expect(firstPick(newTeen(NOW), NOW, 'island')).toBe('home');
  });
});

describe('where the pet is', () => {
  it('is at home on the island', () => {
    expect(petAt(newTeen(NOW), NOW, 'island')).toEqual({ area: 'home', share: 1 });
  });

  it('sails out, stays, and sails back on the sea map', () => {
    const s = newTeen(NOW);
    const length = 10 * 3_600_000;
    s.pet.trip = { place: 'market', startedAt: NOW, endsAt: NOW + length, backAt: null } as Trip;
    const at = (share: number) => petAt(s, NOW + share * length, 'sea')!;
    const out = CONFIG.map.sailShare;
    expect(at(0).share).toBe(0);
    expect(at(out / 2).share).toBeCloseTo(0.5);
    expect(at(0.5)).toEqual({ area: 'market', share: 1 });
    expect(at(1 - out / 2).share).toBeCloseTo(0.5);
    expect(petAt(s, NOW, 'island')).toBeNull();
  });
});
