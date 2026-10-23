import { describe, expect, it } from 'vitest';
import { OUTLINE_OF, OUTLINES, PALETTE } from '../src/render/palette';
import { outlineSwaps } from '../src/render/recolour';
import gpl from '../docs/palette.gpl?raw';

describe('palette', () => {
  // Every PNG stores the colours themselves, and recolours and checks find
  // them by their exact value. Changing a colour here would quietly break
  // every sheet that uses it, so add a new colour instead. New colours go
  // at the end of this list too.
  it('never changes a colour that art already uses', () => {
    const frozen = {
      ink: '#2b2140', plum: '#5b3f6e', lilac: '#a68bc9', lavender: '#d9c8ee', cream: '#fff7ec', white: '#ffffff',
      blush: '#f7a8b8', pink: '#f48fb1', peach: '#ffc59e', butter: '#ffe596', mint: '#a8e6cf', leaf: '#6cc19a',
      sky: '#9ad3f0', ocean: '#5a8fd6', cocoa: '#8a5a44', rose: '#e05a7a', moss: '#3f7d62', deep: '#3a5d9c',
      berry: '#a8405f', bark: '#5c3a2e',
    };
    expect(Object.entries(PALETTE).slice(0, Object.keys(frozen).length)).toEqual(Object.entries(frozen));
  });

  it('has no colour twice', () => {
    const values = Object.values(PALETTE).map((h) => h.toLowerCase());
    expect(new Set(values).size).toBe(values.length);
  });

  it('matches docs/palette.gpl, the copy Aseprite loads', () => {
    const rows = gpl
      .split(/\r?\n/)
      .map((line) => line.trim().match(/^(\d+)\s+(\d+)\s+(\d+)\s+(\S+)$/))
      .filter((m) => m)
      .map((m) => [m![4], '#' + [m![1], m![2], m![3]].map((n) => Number(n).toString(16).padStart(2, '0')).join('')]);
    expect(rows).toEqual(Object.entries(PALETTE));
  });

  it('gives every body colour an outline, and every colour is one or the other', () => {
    const outlines = new Set<string>(OUTLINES);
    for (const [body, outline] of Object.entries(OUTLINE_OF)) {
      expect(outlines.has(body), body).toBe(false);
      expect(PALETTE).toHaveProperty(outline!);
    }
    for (const name of Object.keys(PALETTE)) expect(outlines.has(name) || name in OUTLINE_OF, name).toBe(true);
  });
});

describe('outline swaps', () => {
  it('swaps the outline when every part it outlines changes to the same new outline', () => {
    expect(outlineSwaps({ mint: 'peach', leaf: 'cocoa' }, ['mint', 'leaf', 'moss', 'ink'], OUTLINE_OF)).toEqual({ moss: 'bark' });
  });

  it('leaves it when some parts keep the old outline, or it is already swapped', () => {
    expect(outlineSwaps({ mint: 'peach' }, ['mint', 'leaf', 'moss'], OUTLINE_OF)).toEqual({});
    expect(outlineSwaps({ mint: 'peach', leaf: 'cocoa', moss: 'ink' }, ['mint', 'leaf', 'moss'], OUTLINE_OF)).toEqual({});
  });

  it('only touches outlines the sheet uses', () => {
    expect(outlineSwaps({ ocean: 'rose' }, ['ocean', 'ink'], OUTLINE_OF)).toEqual({});
    expect(outlineSwaps({ ocean: 'rose' }, ['ocean', 'deep'], OUTLINE_OF)).toEqual({ deep: 'berry' });
  });
});
