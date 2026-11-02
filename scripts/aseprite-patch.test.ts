import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { readLayers, readSlices, readTags, writeAseprite } from './aseprite';
import { packMask, patchMap, readMap, unpackMask } from './aseprite-patch';

const W = 4, H = 3;
const rgba = (on: number[]) => {
  const d = new Uint8Array(W * H * 4);
  for (const i of on) d.set([10, 20, 30, 255], i * 4);
  return d;
};
const mask = (on: number[]) => {
  const m = new Uint8Array(W * H);
  for (const i of on) m[i] = 1;
  return m;
};
const file = () => writeAseprite({
  width: W, height: H, frameMs: [100, 100], tags: [{ name: 'idle', from: 0, to: 1 }], palette: [{ name: 'ink', hex: '#2b2140' }],
  layers: [
    { name: 'ground', cels: [rgba([0, 1, 2]), rgba([3])] },
    { name: 'area:home', cels: [rgba([0, 1]), null], hidden: true },
    { name: 'area:yard', cels: [rgba([5]), null], hidden: true },
  ],
  slices: [{ name: 'label:home', x: 1, y: 1, width: 2, height: 1 }, { name: 'guide', x: 0, y: 0, width: 1, height: 1 }],
});

describe('map lab: changing tap shapes and slices in an .aseprite file', () => {
  it('reads the tap shapes and slices', () => {
    const m = readMap(file());
    expect([...m.areas.home]).toEqual([...mask([0, 1])]);
    expect([...m.areas.yard]).toEqual([...mask([5])]);
    expect(m.slices.map((s) => s.name)).toEqual(['label:home', 'guide']);
  });

  it('changes a shape, adds a new area on top, and swaps the lab slices', () => {
    const out = patchMap(file(), {
      areas: { home: mask([4, 8]), pond: mask([11]) },
      slices: [{ name: 'label:home', x: 2, y: 0, width: 2, height: 1 }, { name: 'flag:pond', x: 0, y: 2, width: 2, height: 1 }],
    });
    const m = readMap(out);
    expect([...m.areas.home]).toEqual([...mask([4, 8])]);
    expect([...m.areas.yard]).toEqual([...mask([5])]); // untouched
    expect([...m.areas.pond]).toEqual([...mask([11])]);
    expect(readLayers(out).map((l) => l.name)).toEqual(['ground', 'area:home', 'area:yard', 'area:pond']);
    // The artist's own slice stays; the lab's are replaced.
    expect(readSlices(out)).toEqual([
      { name: 'guide', x: 0, y: 0, width: 1, height: 1 },
      { name: 'label:home', x: 2, y: 0, width: 2, height: 1 },
      { name: 'flag:pond', x: 0, y: 2, width: 2, height: 1 },
    ]);
    // The other frames and the tags are kept as they were.
    expect(readTags(out)).toEqual([{ name: 'idle', from: 0, to: 1 }]);
    expect(out.readUInt32LE(0)).toBe(out.length);
  });

  it('keeps the real maps as they are when nothing changes', () => {
    for (const id of ['island', 'sea']) {
      const before = readFileSync(new URL(`../art/map/${id}.aseprite`, import.meta.url));
      const m = readMap(before);
      const after = readMap(patchMap(before, { areas: m.areas, slices: m.slices }));
      for (const a of Object.keys(m.areas)) expect([...after.areas[a]], `${id}/${a}`).toEqual([...m.areas[a]]);
      expect(after.slices.sort((a, b) => a.name.localeCompare(b.name))).toEqual(m.slices.sort((a, b) => a.name.localeCompare(b.name)));
      expect(after.layers).toEqual(m.layers);
    }
  });

  it('refuses ids that would break the file names', () => {
    expect(() => patchMap(file(), { areas: { 'Big Pond': mask([1]) }, slices: [] })).toThrow(/lowercase/);
  });

  it('packs masks small and back', () => {
    const m = mask([0, 3, 7, 11]);
    expect([...unpackMask(packMask(m), m.length)]).toEqual([...m]);
  });
});
