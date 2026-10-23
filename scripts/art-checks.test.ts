// Runs the art preview page's checks (src/art/checks.ts) on every PNG in the
// manifest, so a stray colour, a soft edge, a missing row or a pet off its
// feet line shows up in `npm test` and not only on the art page. It lives
// here, next to the PNG reader, since it reads files with Node.
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import manifest from '../public/sprites/manifest.json';
import { checkPixels } from '../src/art/checks';
import { PALETTE } from '../src/render/palette';
import { recolourPixels } from '../src/render/recolour';
import { resolveSheet, sheetAnimations, type ManifestFile } from '../src/render/sprites';
import { readPng } from './png';

const m = manifest as ManifestFile;
const read = (file: string) => readPng(readFileSync(new URL(`../public/sprites/${file}`, import.meta.url)));

describe('art checks', () => {
  it.each(Object.keys(m.sheets))('sheet "%s" follows the art guide', (name) => {
    const sheet = resolveSheet(m, name);
    const pixels = read(sheet.file!);
    if (m.sheets[name].recolour) recolourPixels(pixels.data, m.sheets[name].recolour!, PALETTE);
    // A pet body should have every shared row; the egg and hats only what
    // their picture has.
    const animations = sheetAnimations(m, name, sheet.shape ? Infinity : pixels.height);
    const frames = { frameWidth: sheet.frameWidth ?? m.frameWidth, frameHeight: sheet.frameHeight ?? m.frameHeight, animations };
    const bad = checkPixels(pixels, frames, name.startsWith('hat-') ? 'hat' : 'pet').filter((c) => !c.ok);
    expect(bad.map((c) => `${c.label}: ${c.detail ?? ''}`)).toEqual([]);
  });

  it.each(Object.entries(m.faceSets ?? {}))('face set "%s" uses palette colours only, with hard edges', (_, set) => {
    const frames = { frameWidth: m.frameWidth, frameHeight: m.frameHeight, animations: {} };
    const bad = checkPixels(read(set.file), frames, 'face').filter((c) => !c.ok);
    expect(bad.map((c) => `${c.label}: ${c.detail ?? ''}`)).toEqual([]);
  });
});
