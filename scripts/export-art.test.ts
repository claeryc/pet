import { describe, expect, it } from 'vitest';
import { exportPlan } from './export-art';
import { readPng, sideBySide, stack, writePng, type Pixels } from './png';

const picture = (width: number, height: number, fill: number): Pixels => ({
  width,
  height,
  data: new Uint8Array(width * height * 4).fill(fill),
});

describe('export-art', () => {
  it('exports each Aseprite file to the same path in public/sprites', () => {
    expect(exportPlan('characters/cave/pebblit.aseprite')).toEqual({ png: 'characters/cave/pebblit.png', strip: false });
    expect(exportPlan('stages/egg.aseprite')).toEqual({ png: 'stages/egg.png', strip: false });
  });

  it('exports hats and badges as one strip', () => {
    expect(exportPlan('hats/beanie.aseprite')?.strip).toBe(true);
    expect(exportPlan('badges/tiers.aseprite')?.strip).toBe(true);
  });

  it('skips the template, previews, shelved art and other files', () => {
    expect(exportPlan('_template.aseprite')).toBeNull();
    expect(exportPlan('previews/dumpling-matcha.png')).toBeNull();
    expect(exportPlan('shelved/bunbun.aseprite')).toBeNull();
    expect(exportPlan('characters/cave/notes.txt')).toBeNull();
  });
});

describe('png files', () => {
  it('reads back what it writes', () => {
    const p = picture(3, 2, 0);
    p.data.set([1, 2, 3, 255, 200, 100, 50, 0], 4);
    expect(readPng(writePng(p))).toEqual(p);
  });

  it('stacks rows left-aligned, padding short rows with see-through pixels', () => {
    const out = stack([picture(2, 1, 9), picture(1, 1, 7)]);
    expect([out.width, out.height]).toEqual([2, 2]);
    expect([...out.data.subarray(8, 16)]).toEqual([7, 7, 7, 7, 0, 0, 0, 0]);
  });

  it('puts pictures side by side with a gap', () => {
    const out = sideBySide([picture(1, 1, 9), picture(1, 2, 7)], 1);
    expect([out.width, out.height]).toEqual([3, 2]);
    expect([...out.data.subarray(0, 12)]).toEqual([9, 9, 9, 9, 0, 0, 0, 0, 7, 7, 7, 7]);
  });
});
