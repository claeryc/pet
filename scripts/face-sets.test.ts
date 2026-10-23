// Checks the face sets' PNGs. It lives here, next to the PNG reader, since
// it reads files with Node (see export-art.test.ts).
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import manifest from '../public/sprites/manifest.json';
import { EXPRESSIONS } from '../src/game/expressions';
import { countFaceFrames } from '../src/render/faces';
import { readPng } from './png';

const read = (file: string) => readPng(readFileSync(new URL(`../public/sprites/${file}`, import.meta.url)));

describe('face sets', () => {
  // blob fills in any expression another set leaves out, so it needs them all.
  it('the blob set has every expression drawn', () => {
    const png = read(manifest.faceSets.blob.file);
    expect(png.height).toBe(EXPRESSIONS.length * manifest.frameHeight);
    expect(countFaceFrames(png, manifest.frameWidth, manifest.frameHeight).every((n) => n > 0)).toBe(true);
  });

  it.each(Object.entries(manifest.faceSets))('face set "%s" has a content face and no extra rows', (_, set) => {
    const png = read(set.file);
    expect(png.height).toBeLessThanOrEqual(EXPRESSIONS.length * manifest.frameHeight);
    expect(countFaceFrames(png, manifest.frameWidth, manifest.frameHeight)[0]).toBeGreaterThan(0);
  });

  // Face sets find an expression by its row, so a new expression goes at the
  // end. Moving or putting one in the middle would give every face set the
  // wrong faces. Add new ones to the end of this list too.
  it('only ever adds expressions at the end', () => {
    const known = ['content', 'happy', 'pouting', 'sad', 'crying', 'surprised', 'inLove', 'grumpy', 'sleepy', 'hungry', 'chewing', 'sick'];
    expect(EXPRESSIONS.slice(0, known.length)).toEqual(known);
    expect(EXPRESSIONS.length).toBe(known.length);
  });
});
