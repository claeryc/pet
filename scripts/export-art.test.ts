import { readdirSync, readFileSync } from 'node:fs';
import { join, relative, sep } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import manifest from '../public/sprites/manifest.json';
import { sheetAnimations, type ManifestFile } from '../src/render/manifest';
import { readTags } from './aseprite';
import { exportPlan, rowsFor } from './export-art';
import { readPng, sideBySide, stack, writePng, type Pixels } from './png';

const m = manifest as ManifestFile;
const ART = fileURLToPath(new URL('../art/', import.meta.url));
const allArt = (dir = ART): string[] =>
  readdirSync(dir, { withFileTypes: true }).flatMap((e) =>
    e.isDirectory() ? allArt(join(dir, e.name)) : [relative(ART, join(dir, e.name)).split(sep).join('/')],
  );

const picture = (width: number, height: number, fill: number): Pixels => ({
  width,
  height,
  data: new Uint8Array(width * height * 4).fill(fill),
});

describe('export-art', () => {
  it('exports each Aseprite file to the same path in public/sprites', () => {
    expect(exportPlan('characters/cave/pebblit.aseprite')).toEqual({ png: 'characters/cave/pebblit.png', strip: false });
    expect(exportPlan('stages/egg.aseprite')).toEqual({ png: 'stages/egg.png', strip: false });
    expect(exportPlan('faces/blob.aseprite')).toEqual({ png: 'faces/blob.png', strip: false });
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

describe('rows by tag name', () => {
  const all = ['idle', 'sad', 'sleep', 'sick', 'eat', 'happy', 'cheerful'];

  it('puts each tag on its row from the manifest, whatever the tag order', () => {
    const { rows, notes } = rowsFor('characters/nature/sprig.png', ['idle-stretch', 'happy', ...all.filter((t) => t !== 'happy'), 'idle-look'], m);
    expect(rows).toEqual([...all, 'idle-look', 'idle-stretch']);
    expect(notes).toEqual([]);
  });

  it('leaves untagged rows empty, and says which', () => {
    const { rows, notes } = rowsFor('characters/ocean/bubbit.png', ['idle', 'happy'], m);
    expect(rows).toEqual(['idle', null, null, null, null, 'happy']);
    expect(notes[0]).toContain('sad, sleep, sick, eat, cheerful');
  });

  it('stops on a tag that is not an animation, or is there twice', () => {
    expect(() => rowsFor('characters/ocean/bubbit.png', ['idle', 'hapy'], m)).toThrow(/"hapy" isn't an animation/);
    expect(() => rowsFor('characters/ocean/bubbit.png', ['idle', 'idle'], m)).toThrow(/twice/);
    // Bubbit has no idle set, so its moves aren't its animations.
    expect(() => rowsFor('characters/ocean/bubbit.png', ['idle', 'idle-look'], m)).toThrow(/idle-look/);
  });

  it('orders a face set by expression', () => {
    const { rows, notes } = rowsFor('faces/owl.png', ['sad', 'content'], m);
    expect(rows).toEqual(['content', null, null, 'sad']);
    expect(notes[0]).toContain("blob's face");
  });

  it('keeps the tag order for a file not in the manifest yet', () => {
    expect(rowsFor('characters/cave/stalagbun.png', ['idle', 'sad'], m).rows).toEqual(['idle', 'sad']);
  });

  it('the egg only needs idle', () => {
    expect(rowsFor('stages/egg.png', ['idle'], m)).toEqual({ rows: ['idle'], notes: [] });
  });
});

describe('art files', () => {
  const files = allArt().filter((f) => exportPlan(f) && !exportPlan(f)!.strip);

  it.each(files)('%s has tags the manifest knows, one frame per animation frame', (file) => {
    const png = exportPlan(file)!.png;
    const tags = readTags(readFileSync(join(ART, file)));
    expect(() => rowsFor(png, tags.map((t) => t.name), m)).not.toThrow();
    const sheet = Object.entries(m.sheets).find(([, s]) => s.file === png);
    if (!sheet) return;
    const animations = sheetAnimations(m, sheet[0]);
    for (const t of tags) expect(t.to - t.from + 1, `${t.name} frames`).toBe(animations[t.name].frames);
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
