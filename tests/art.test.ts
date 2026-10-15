import { describe, expect, it } from 'vitest';
import data from '../src/data/characters.json';
import manifest from '../public/sprites/manifest.json';
import hatData from '../src/data/hats.json';

// Every PNG in public/sprites, as paths like "stages/egg.png".
const pngs = Object.keys(import.meta.glob('../public/sprites/**/*.png')).map((p) =>
  p.replace('../public/sprites/', ''),
);
const sheetFiles: Record<string, { file: string; head?: { x: number; y: number; size: string } }> = manifest.sheets;

describe('art files', () => {
  const sheets = [
    ...Object.values(data.stages),
    ...data.characters.flatMap((c) => [c.sheet, ...(c.variants ?? []).map((v) => v.sheet)]),
    ...hatData.hats.map((h) => h.sheet),
  ];

  it.each(sheets.filter((s) => s !== 'egg' && !s.startsWith('hat-')))('sheet "%s" says where hats sit', (sheet) => {
    const head = sheetFiles[sheet].head;
    expect(head).toBeDefined();
    expect(['small', 'large']).toContain(head!.size);
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

  it('character ids are unique', () => {
    const ids = data.characters.map((c) => c.id);
    expect(new Set(ids).size).toBe(ids.length);
  });
});
