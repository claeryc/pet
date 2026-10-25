import { describe, expect, it } from 'vitest';
import manifest from '../public/sprites/manifest.json';
import { CONFIG } from '../src/game/config';
import { afterEating, chooseExpression, EXPRESSIONS, faceForAnimation, idleEveryMs, reactionMs } from '../src/game/expressions';
import { allowedTraits, fitTrait, getTrait, inheritTrait, rollTrait, traitOf, TRAITS, type Trait } from '../src/game/traits';
import { getCharacter } from '../src/game/growth';
import { countFaceFrames, faceFrame, type FaceSheet } from '../src/render/faces';
import type { ManifestFile, Shape } from '../src/render/sprites';

const ok = { hunger: 80, happiness: 60, health: 90, energy: 80 };
const E = CONFIG.expressions;

describe('choosing a face', () => {
  it('lets the body animation pick first: asleep, eating and sick', () => {
    expect(chooseExpression({ animation: 'sleep', reaction: 'happy', stats: ok })).toBe('sleepy');
    expect(chooseExpression({ animation: 'eat', reaction: 'happy', stats: ok })).toBe('chewing');
    expect(chooseExpression({ animation: 'sick', stats: { ...ok, happiness: 0 } })).toBe('sick');
    expect(chooseExpression({ animation: 'passed', stats: ok })).toBe('sleepy');
  });

  it('shows a reaction over a mood', () => {
    expect(chooseExpression({ animation: 'sad', reaction: 'surprised', stats: { ...ok, happiness: 5 } })).toBe('surprised');
  });

  it('shows moods from the stats, worst first', () => {
    expect(chooseExpression({ animation: 'sad', stats: { ...ok, happiness: E.cryingBelow - 1, hunger: 0 } })).toBe('crying');
    expect(chooseExpression({ animation: 'sad', stats: { ...ok, happiness: E.sadBelow - 1, hunger: 0 } })).toBe('sad');
    expect(chooseExpression({ animation: 'sad', stats: { ...ok, hunger: E.hungryBelow - 1 } })).toBe('hungry');
    expect(chooseExpression({ animation: 'idle', stats: { ...ok, energy: E.sleepyBelow - 1 } })).toBe('sleepy');
    expect(chooseExpression({ animation: 'idle', stats: ok, aloneMs: E.poutAfterMs })).toBe('pouting');
  });

  it('is content otherwise, or pulls the face its animation does', () => {
    expect(chooseExpression({ animation: 'idle', stats: ok })).toBe('content');
    expect(chooseExpression({ animation: 'cheerful', stats: ok })).toBe('content');
    expect(chooseExpression({ animation: 'happy', stats: ok })).toBe('happy');
    expect(chooseExpression({ animation: 'sad', stats: ok })).toBe('sad'); // e.g. low health
    expect(faceForAnimation('something-new')).toBe('content');
  });

  it('lets a trait move the numbers', () => {
    const cheery = getTrait('cheery');
    const greedy = getTrait('greedy');
    const playful = getTrait('playful');
    const sad = { ...ok, happiness: E.sadBelow - 1 };
    expect(chooseExpression({ animation: 'idle', stats: sad, trait: cheery })).toBe('content');
    const peckish = { ...ok, hunger: E.hungryBelow + 5 };
    expect(chooseExpression({ animation: 'idle', stats: peckish })).toBe('content');
    expect(chooseExpression({ animation: 'idle', stats: peckish, trait: greedy })).toBe('hungry');
    expect(chooseExpression({ animation: 'idle', stats: ok, trait: playful, aloneMs: E.poutAfterMs / 2 })).toBe('pouting');
    expect(reactionMs('happy', playful)).toBe(E.ms.happy * 2);
    expect(reactionMs('surprised', getTrait('shy'))).toBeGreaterThan(E.ms.surprised);
    expect(idleEveryMs(playful)).toBe(CONFIG.idleMoveEveryMs / 2);
    expect(idleEveryMs(undefined)).toBe(CONFIG.idleMoveEveryMs);
  });

  it('falls in love with a craving, or with any food when greedy', () => {
    expect(afterEating(true)).toBe('inLove');
    expect(afterEating(false)).toBe('happy');
    expect(afterEating(false, getTrait('greedy'))).toBe('inLove');
  });
});

describe('traits', () => {
  it('rolls the same trait for the same id, and every trait turns up', () => {
    expect(rollTrait('abc')).toBe(rollTrait('abc'));
    const seen = new Set(Array.from({ length: 200 }, (_, i) => rollTrait(`pet-${i}`)));
    expect([...seen].sort()).toEqual(TRAITS.map((t) => t.id).sort());
  });

  it("gives a little one a parent's trait about half the time", () => {
    let fromParent = 0;
    for (let i = 0; i < 400; i++) {
      const id = `egg-${i}`;
      const t = inheritTrait(id, ['shy', 'shy']);
      if (t === 'shy' && rollTrait(id) !== 'shy') fromParent++;
    }
    // About half inherit; some of the rest roll shy anyway.
    expect(fromParent).toBeGreaterThan(400 * 0.3);
    expect(fromParent).toBeLessThan(400 * 0.6);
    expect(inheritTrait('x', [])).toBe(rollTrait('x'));
    expect(inheritTrait('x', ['not-a-trait'])).toBe(rollTrait('x'));
  });

  it('lets a character limit its traits', () => {
    const grumpo = { traits: ['sleepy', 'shy', 'not-a-trait'] };
    expect(allowedTraits(grumpo)).toEqual(['sleepy', 'shy']);
    expect(allowedTraits(undefined)).toEqual(TRAITS.filter((t) => !t.special).map((t) => t.id));
    expect(allowedTraits({ traits: [] })).toEqual(allowedTraits(undefined));
    expect(fitTrait('a', 'shy', grumpo)).toBe('shy'); // allowed: kept
    for (let i = 0; i < 50; i++) expect(['sleepy', 'shy']).toContain(fitTrait(`p${i}`, 'playful', grumpo));
    expect(fitTrait('a', 'playful', undefined)).toBe('playful');
  });

  it('gives each 3-star starter pet one or two traits, and the others any', () => {
    const locked = { stumpy: ['shy', 'sleepy'], tidecrest: ['playful', 'cheery'], cuppie: ['greedy', 'cheery'], starhoot: ['sleepy'] };
    for (const [id, traits] of Object.entries(locked)) expect(allowedTraits(getCharacter(id))).toEqual(traits);
    for (const id of ['sprig', 'acornet', 'bubbit', 'jellop', 'dumpling', 'puddling', 'cloudlet', 'moonpip']) {
      expect(allowedTraits(getCharacter(id))).toEqual(allowedTraits(undefined));
    }
    // A Greedy teen that grows into a Starhoot becomes Sleepy.
    expect(fitTrait('mochi', 'greedy', getCharacter('starhoot'))).toBe('sleepy');
  });

  it("can pass a parent's special trait on, kept by a character that lists it", () => {
    // No special trait is in traits.json yet, so this adds one for the test.
    (TRAITS as Trait[]).push({ id: 'starlit', name: 'Starlit', about: '', special: true });
    try {
      const kids = Array.from({ length: 200 }, (_, i) => inheritTrait(`egg-${i}`, ['starlit', 'starlit']));
      const inherited = kids.filter((t) => t === 'starlit').length;
      expect(inherited).toBeGreaterThan(200 * 0.3);
      expect(inherited).toBeLessThan(200 * 0.7);
      // Never rolled on its own.
      for (let i = 0; i < 200; i++) expect(rollTrait(`pet-${i}`)).not.toBe('starlit');
      expect(fitTrait('a', 'starlit', { traits: ['starlit', 'shy'] })).toBe('starlit');
      expect(fitTrait('a', 'starlit', undefined)).not.toBe('starlit');
    } finally {
      (TRAITS as Trait[]).pop();
    }
  });

  it('rolls one for a friend that has none', () => {
    expect(traitOf({ id: 'w' })).toBe(rollTrait('w'));
    expect(traitOf({ id: 'w', trait: 'sleepy' })).toBe('sleepy');
  });
});

describe('face sets', () => {
  const sheet = (frames: number[]): FaceSheet => ({ name: 's', image: {} as ImageBitmap, frameWidth: 32, frameHeight: 32, frames });
  const full = sheet(EXPRESSIONS.map(() => 2));
  const onlyContent = sheet(EXPRESSIONS.map((_, i) => (i === 0 ? 1 : 0)));

  it('picks the frame for the time', () => {
    const row = EXPRESSIONS.indexOf('happy');
    expect(faceFrame(full, undefined, 'happy', 0)).toMatchObject({ sx: 0, sy: row * 32 });
    expect(faceFrame(full, undefined, 'happy', 310)).toMatchObject({ sx: 32, sy: row * 32 });
  });

  it('fills in a missing expression from the fallback set, then the content face', () => {
    expect(faceFrame(onlyContent, full, 'crying', 0)?.sheet).toBe(full);
    expect(faceFrame(onlyContent, onlyContent, 'crying', 0)).toMatchObject({ sx: 0, sy: 0 });
    expect(faceFrame(undefined, undefined, 'crying', 0)).toBeNull();
  });

  it('counts the frames drawn in each row', () => {
    const data = new Uint8Array(96 * 64 * 4);
    data[(0 * 96 + 70) * 4 + 3] = 255; // row 0, third frame
    data[(40 * 96 + 5) * 4 + 3] = 255; // row 1, first frame
    expect(countFaceFrames({ data, width: 96, height: 64 }, 32, 32).slice(0, 3)).toEqual([3, 1, 0]);
  });

  const m = manifest as ManifestFile;
  const shapes = m.shapes as Record<string, Shape>;

  it('every shape with a face uses a face set that exists', () => {
    for (const [name, shape] of Object.entries(shapes)) {
      if (!shape.face) continue;
      expect(Object.keys(m.faceSets ?? {}), name).toContain(shape.faces ?? 'blob');
    }
  });
});
