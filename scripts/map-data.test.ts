import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { readLayers, readSlices, writeAseprite } from './aseprite';
import { layerArea, mapData, middleOf, pathOf } from './map-data';
import type { Pixels } from './png';

// A width x height picture with the listed pixels painted.
function painted(width: number, height: number, at: [number, number][]): Pixels {
  const data = new Uint8Array(width * height * 4);
  for (const [x, y] of at) data[(y * width + x) * 4 + 3] = 255;
  return { width, height, data };
}

describe('map tap shapes', () => {
  it('joins painted pixels into rectangles', () => {
    // A 2x2 square and a pixel on its own.
    const mask = [true, true, false, true, true, false, false, false, true];
    expect(pathOf(mask, 3, 3)).toBe('M0 0h2v2h-2zM2 2h1v1h-1z');
  });

  it('finds the middle, or the nearest painted pixel when the middle is empty', () => {
    expect(middleOf([false, true, false, true, true, true, false, true, false], 3, 3)).toEqual([1, 1]);
    // A ring: its centre isn't painted.
    const ring = [true, true, true, true, false, true, true, true, true];
    const [x, y] = middleOf(ring, 3, 3);
    expect(ring[y * 3 + x]).toBe(true);
  });

  it('reads area names from layer names', () => {
    expect(layerArea('area:backyard')).toBe('backyard');
    expect(layerArea(' Area : Coral-Cove ')).toBe('coral-cove');
    expect(layerArea('locked:fields', 'locked')).toBe('fields');
    expect(layerArea('details')).toBeNull();
  });

  it('puts labels and pins on their slices, or in the middle', () => {
    const data = mapData(
      4, 4,
      [{ id: 'home', pixels: painted(4, 4, [[0, 0], [1, 0], [0, 1], [1, 1]]) }, { id: 'yard', pixels: painted(4, 4, [[3, 3]]) }],
      [{ name: 'label:home', x: 0, y: 2, width: 2, height: 1 }, { name: 'pin:home', x: 2, y: 2, width: 2, height: 2 }],
      { night: false, locked: [] },
    );
    expect(data.areas.home).toEqual({ shape: 'M0 0h2v2h-2z', box: [0, 0, 2, 2], label: [1, 3], pin: [3, 3] });
    expect(data.areas.yard.label).toEqual([3, 3]);
  });

  it('stops on an empty area layer', () => {
    expect(() => mapData(2, 2, [{ id: 'home', pixels: painted(2, 2, []) }], [], { night: false, locked: [] })).toThrow(/empty/);
  });
});

describe('aseprite layers and slices', () => {
  it('reads back the layers and slices it writes', () => {
    const file = writeAseprite({
      width: 2, height: 2, frameMs: [100], tags: [], palette: [{ name: 'ink', hex: '#2b2140' }],
      layers: [{ name: 'ground', cels: [new Uint8Array(16)] }, { name: 'area:home', cels: [new Uint8Array(16)], hidden: true }],
      slices: [{ name: 'label:home', x: 1, y: 0, width: 1, height: 2 }],
    });
    expect(readLayers(file).map((l) => l.name)).toEqual(['ground', 'area:home']);
    expect(readSlices(file)).toEqual([{ name: 'label:home', x: 1, y: 0, width: 1, height: 2 }]);
  });

  it('the map files have an area layer for every area in map.json', () => {
    const map = JSON.parse(readFileSync(new URL('../src/data/map.json', import.meta.url), 'utf8'));
    for (const [id, m] of Object.entries(map.maps as Record<string, { areas: { id: string }[] }>)) {
      const layers = readLayers(readFileSync(new URL(`../art/map/${id}.aseprite`, import.meta.url))).map((l) => layerArea(l.name)).filter(Boolean);
      expect(layers.sort(), id).toEqual(m.areas.map((a) => a.id).sort());
    }
  });
});
