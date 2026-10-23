// Checks the face sets' PNGs. It lives here, next to the PNG reader, since
// it reads files with Node (see export-art.test.ts).
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import manifest from '../public/sprites/manifest.json';
import { EXPRESSIONS } from '../src/game/expressions';
import { countFaceFrames } from '../src/render/faces';
import { readPng } from './png';

describe('face sets', () => {
  it.each(Object.entries(manifest.faceSets))('face set "%s" has every expression drawn', (_, set) => {
    const png = readPng(readFileSync(new URL(`../public/sprites/${set.file}`, import.meta.url)));
    expect(png.height).toBe(EXPRESSIONS.length * manifest.frameHeight);
    expect(countFaceFrames(png, manifest.frameWidth, manifest.frameHeight).every((n) => n > 0)).toBe(true);
  });
});
