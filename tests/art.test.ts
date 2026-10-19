import { describe, expect, it } from 'vitest';
import data from '../src/data/characters.json';
import manifest from '../public/sprites/manifest.json';
import hatData from '../src/data/hats.json';
import { pickHatFrame, type Shape } from '../src/render/sprites';

// Every PNG in public/sprites, as paths like "stages/egg.png".
const pngs = Object.keys(import.meta.glob('../public/sprites/**/*.png')).map((p) =>
  p.replace('../public/sprites/', ''),
);
const sheetFiles: Record<string, { file: string; shape?: string }> = manifest.sheets;
const shapes: Record<string, Shape> = manifest.shapes as Record<string, Shape>;

describe('art files', () => {
  const sheets = [
    ...Object.values(data.stages),
    ...data.characters.flatMap((c) => [c.sheet, ...(c.variants ?? []).map((v) => v.sheet)]),
    ...hatData.hats.map((h) => h.sheet),
  ];

  it.each(sheets.filter((s) => s !== 'egg' && !s.startsWith('hat-')))('sheet "%s" has a known body shape', (sheet) => {
    expect(Object.keys(shapes)).toContain(sheetFiles[sheet].shape);
  });

  it.each(Object.entries(shapes))('shape "%s" says where hats sit, and only fits known hats', (_, shape) => {
    expect(shape.head.width).toBeGreaterThan(0);
    const hatSheets = hatData.hats.map((h) => h.sheet);
    for (const [hat, fit] of Object.entries(shape.hats ?? {})) {
      expect(hatSheets).toContain(hat);
      if (fit.width !== undefined) expect(fit.width).toBeGreaterThan(0);
    }
  });

  it('every shape is used by a sheet', () => {
    const used = new Set(Object.values(sheetFiles).map((s) => s.shape));
    for (const name of Object.keys(shapes)) expect(used).toContain(name);
  });

  it.each(sheets)('sheet "%s" is in the manifest and its PNG exists', (sheet) => {
    expect(sheetFiles[sheet]).toBeDefined();
    expect(pngs).toContain(sheetFiles[sheet].file);
  });

  it('every character has a known theme and 1 to 3 stars', () => {
    for (const c of data.characters) {
      expect(Object.keys(data.themes)).toContain(c.theme);
      expect([1, 2, 3]).toContain(c.stars);
    }
  });

  it('every theme has a 1, 2 and 3 star character', () => {
    // Otherwise a rolled rarity quietly falls back to another one, and a
    // little one can't lean towards that parent's theme at that rarity.
    for (const theme of Object.keys(data.themes))
      for (const stars of [1, 2, 3])
        expect(data.characters.some((c) => c.theme === theme && c.stars === stars), `${theme} ${stars}`).toBe(true);
  });

  it('character ids are unique', () => {
    const ids = data.characters.map((c) => c.id);
    expect(new Set(ids).size).toBe(ids.length);
  });
});

describe('hat sizes', () => {
  // A beanie drawn 10, 14 and 18 pixels wide.
  const widths = [10, 14, 18];

  it('uses the widest hat that fits the head', () => {
    expect(pickHatFrame(widths, 14)).toBe(1);
    expect(pickHatFrame(widths, 16)).toBe(1);
    expect(pickHatFrame(widths, 30)).toBe(2);
  });

  it('uses the narrowest hat when none fits', () => {
    expect(pickHatFrame(widths, 6)).toBe(0);
    expect(pickHatFrame([12, 8], 4)).toBe(1);
  });
});
