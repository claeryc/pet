import { describe, expect, it } from 'vitest';
import data from '../src/data/characters.json';
import manifest from '../public/sprites/manifest.json';
import hatData from '../src/data/hats.json';
import traitData from '../src/data/traits.json';
import { PALETTE } from '../src/render/palette';
import { recolourPixels } from '../src/render/recolour';
import {
  pickHatFrame,
  idleSetOf,
  onlyDrawn,
  resolveSheet,
  sheetAnimations,
  type IdleSet,
  type ManifestFile,
  type Shape,
} from '../src/render/sprites';

// Every PNG in public/sprites, as paths like "stages/egg.png".
const pngs = Object.keys(import.meta.glob('../public/sprites/**/*.png')).map((p) =>
  p.replace('../public/sprites/', ''),
);
// Recoloured sheets are filled in from the sheet they're painted from.
const sheetFiles = Object.fromEntries(
  Object.keys(manifest.sheets).map((name) => [name, resolveSheet(manifest as ManifestFile, name)]),
);
const shapes: Record<string, Shape> = manifest.shapes as Record<string, Shape>;
const idleSets: Record<string, IdleSet> = manifest.idleSets;

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

  it('idle set moves have rows of their own, across every set', () => {
    // So a sheet can mix several sets without two moves landing on one row.
    const taken = Object.values(manifest.animations).map((a) => a.row);
    for (const [name, set] of Object.entries(idleSets))
      for (const [move, anim] of Object.entries(set.animations)) {
        expect(move.startsWith('idle-'), move).toBe(true);
        expect(taken, `${name}: ${move}`).not.toContain(anim.row);
        taken.push(anim.row);
      }
  });

  const setsOf = (sheet: { idleSet?: string | string[] }) => [sheet.idleSet ?? []].flat();

  it.each(Object.keys(idleSets))('idle set "%s" is used', (name) => {
    expect(Object.values(sheetFiles).some((s) => setsOf(s).includes(name))).toBe(true);
  });

  it.each(Object.entries(sheetFiles).filter(([, s]) => s.idleSet))(
    'sheet "%s" uses known idle sets',
    (_, sheet) => {
      for (const name of setsOf(sheet)) expect(idleSets[name], name).toBeDefined();
    },
  );

  it.each(sheets)('sheet "%s" is in the manifest and its PNG exists', (sheet) => {
    expect(sheetFiles[sheet]).toBeDefined();
    expect(pngs).toContain(sheetFiles[sheet].file);
  });

  it.each(Object.entries(manifest.sheets as ManifestFile['sheets']).filter(([, s]) => s.from || s.recolour))(
    'recoloured sheet "%s" is made from a sheet with a file, with palette colours',
    (_, sheet) => {
      expect(manifest.sheets[sheet.from as keyof typeof manifest.sheets]).toHaveProperty('file');
      expect(sheet).not.toHaveProperty('file');
      const names = Object.keys(PALETTE);
      for (const [from, to] of Object.entries(sheet.recolour ?? {})) {
        expect(names).toContain(from);
        expect(names).toContain(to);
      }
    },
  );

  it('the achievement tier pictures exist', () => {
    expect(pngs).toContain('badges/tiers.png');
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

  it('trait ids are unique', () => {
    const ids = traitData.traits.map((t) => t.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it('every trait a character lists exists', () => {
    // A misspelt one is skipped, and a character whose list is all misspelt
    // quietly takes any trait.
    const ids = traitData.traits.map((t) => t.id);
    for (const c of data.characters as { id: string; traits?: string[] }[])
      for (const trait of c.traits ?? []) expect(ids, `${c.id}: ${trait}`).toContain(trait);
  });

  it('every special trait is listed by a character', () => {
    // Otherwise no pet can ever have it.
    const listed = (data.characters as { traits?: string[] }[]).flatMap((c) => c.traits ?? []);
    for (const t of traitData.traits as { id: string; special?: boolean }[])
      if (t.special) expect(listed, t.id).toContain(t.id);
  });
});

describe('sheet animations', () => {
  const fake: ManifestFile = {
    frameWidth: 32,
    frameHeight: 32,
    animations: { idle: { row: 0, frames: 4, frameMs: 220 }, sad: { row: 1, frames: 4, frameMs: 400 } },
    idleSets: { curious: { animations: { 'idle-look': { row: 2, frames: 4, frameMs: 260 } } } },
    sheets: {
      slow: { file: 'slow.png', animations: { sad: { row: 1, frames: 6, frameMs: 500 } }, idleSet: 'curious' },
      slowMint: { from: 'slow', recolour: { cream: 'mint' } },
    },
  };

  it('keeps the shared ones, changes the ones a sheet lists, and adds its idle moves', () => {
    expect(sheetAnimations(fake, 'slow')).toEqual({
      idle: { row: 0, frames: 4, frameMs: 220 },
      sad: { row: 1, frames: 6, frameMs: 500 },
      'idle-look': { row: 2, frames: 4, frameMs: 260 },
    });
    expect(sheetAnimations(fake, 'slowMint')).toEqual(sheetAnimations(fake, 'slow'));
  });

  it('leaves out rows the picture is too short for, so they fall back to idle', () => {
    expect(Object.keys(sheetAnimations(fake, 'slow', 64))).toEqual(['idle', 'sad']);
  });

  it('leaves out rows with nothing drawn, but always keeps idle', () => {
    // 1 frame wide, 3 rows: idle empty, sad drawn, idle-look empty.
    const data = new Uint8Array(32 * 96 * 4);
    data[(40 * 32 + 5) * 4 + 3] = 255;
    const drawn = onlyDrawn(sheetAnimations(fake, 'slow'), { data, width: 32 }, 32, 32);
    expect(Object.keys(drawn)).toEqual(['idle', 'sad']);
  });

  it('mixes the moves of several idle sets', () => {
    const mixed: ManifestFile = {
      ...fake,
      idleSets: {
        ...fake.idleSets,
        owl: { animations: { 'idle-hoot': { row: 3, frames: 2, frameMs: 300 } }, headShifts: { 'idle-hoot': [0, 1] } },
      },
      sheets: { both: { file: 'both.png', idleSet: ['curious', 'owl'] } },
    };
    const set = idleSetOf(mixed, 'both')!;
    expect(Object.keys(set.animations)).toEqual(['idle-look', 'idle-hoot']);
    expect(set.headShifts).toEqual({ 'idle-hoot': [0, 1] });
    expect(Object.keys(sheetAnimations(mixed, 'both'))).toEqual(['idle', 'sad', 'idle-look', 'idle-hoot']);
  });
});

describe('recolouring', () => {
  const rgba = (name: keyof typeof PALETTE, a = 255) => {
    const n = parseInt(PALETTE[name].slice(1), 16);
    return [n >> 16, (n >> 8) & 0xff, n & 0xff, a];
  };

  it('swaps listed palette colours and leaves the rest alone', () => {
    const data = new Uint8ClampedArray([...rgba('cream'), ...rgba('peach'), ...rgba('ink')]);
    expect(recolourPixels(data, { cream: 'mint', peach: 'leaf' }, PALETTE)).toEqual([]);
    expect([...data]).toEqual([...rgba('mint'), ...rgba('leaf'), ...rgba('ink')]);
  });

  it('does every swap at once, so two colours can trade places', () => {
    const data = new Uint8ClampedArray([...rgba('cream'), ...rgba('mint')]);
    recolourPixels(data, { cream: 'mint', mint: 'cream' }, PALETTE);
    expect([...data]).toEqual([...rgba('mint'), ...rgba('cream')]);
  });

  it('names swaps with colours that aren\'t in the palette', () => {
    expect(recolourPixels(new Uint8ClampedArray(rgba('cream')), { cream: 'teal' }, PALETTE)).toEqual(['cream -> teal']);
  });

  it('keeps see-through pixels as they are', () => {
    const data = new Uint8ClampedArray(rgba('cream', 0));
    recolourPixels(data, { cream: 'mint' }, PALETTE);
    expect([...data]).toEqual(rgba('cream', 0));
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
