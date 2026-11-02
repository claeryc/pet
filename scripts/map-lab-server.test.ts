import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { addToAreas, loadMap } from './map-lab-server';

describe('map lab server', () => {
  it('adds a new area as one more line, keeping the layout', () => {
    const text = readFileSync(new URL('../src/data/map.json', import.meta.url), 'utf8');
    const line = '        { "id": "beach", "name": "Beach", "opens": "soon" }';
    const out = addToAreas(text, 'island', [line]);
    const json = JSON.parse(out);
    expect(json.maps.island.areas.at(-1)).toEqual({ id: 'beach', name: 'Beach', opens: 'soon' });
    expect(json.maps.sea).toEqual(JSON.parse(text).maps.sea);
    // Only that line is new.
    expect(out.split('\n').length).toBe(text.split('\n').length + 1);
    expect(() => addToAreas(text, 'moon', [line])).toThrow(/no map/);
  });

  it('loads a map for the lab', () => {
    const m = loadMap('sea');
    expect([m.width, m.height]).toEqual([180, 270]);
    expect(Object.keys(m.areas)).toContain('market');
    expect(m.slices.some((s) => s.name === 'flag:market')).toBe(true);
    expect(() => loadMap('../secrets')).toThrow();
  });
});
