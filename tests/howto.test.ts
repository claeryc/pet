import { describe, expect, it } from 'vitest';
import { section } from '../src/art/guide';
import { STEPS } from '../src/art/howto';
import guide from '../docs/ART_GUIDE.md?raw';

describe('the how-to on the art page', () => {
  it('only folds in parts of the art guide that are there', () => {
    for (const step of STEPS) for (const title of step.guide ?? []) expect(section(title), `${step.id}: "${title}"`).not.toBe('');
  });

  it('covers every part of the art guide', () => {
    // A heading counts when a step shows it, or a heading above it.
    const shown = STEPS.flatMap((s) => s.guide ?? []).map(section).join('\n');
    const headings = guide.split('\n').filter((l) => /^#{2,} /.test(l));
    for (const h of headings) expect(shown, h).toContain(h);
  });

  it('gives every step its own id', () => {
    const ids = STEPS.map((s) => s.id);
    expect(new Set(ids).size).toBe(ids.length);
  });
});
