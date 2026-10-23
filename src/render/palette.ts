// The shared 20-colour palette. All art (placeholder and real) should only
// use these colours so everything looks like it belongs together.

export const PALETTE = {
  ink: '#2b2140', // outlines and eyes
  plum: '#5b3f6e',
  lilac: '#a68bc9',
  lavender: '#d9c8ee',
  cream: '#fff7ec',
  white: '#ffffff',
  blush: '#f7a8b8', // cheeks
  pink: '#f48fb1',
  peach: '#ffc59e',
  butter: '#ffe596',
  mint: '#a8e6cf',
  leaf: '#6cc19a',
  sky: '#9ad3f0',
  ocean: '#5a8fd6',
  cocoa: '#8a5a44',
  rose: '#e05a7a',
  // Dark outlines, so a pet's edge matches its colour and its face (in
  // ink) stands out. White and lilac pets use plum.
  moss: '#3f7d62', // green pets
  deep: '#3a5d9c', // blue pets
  berry: '#a8405f', // pink parts
  bark: '#5c3a2e', // cream, peach, butter and brown pets
} as const;

export type ColourName = keyof typeof PALETTE;

// The outline rule (see docs/ART_GUIDE.md): the dark colour that outlines
// each body colour where it meets the outer edge. Colours not listed here
// are outlines themselves. A new body colour needs an entry here, and
// usually a new outline colour too. Ink is never wrong: inside lines, the
// face and some older art use it everywhere.
export const OUTLINE_OF: Partial<Record<ColourName, ColourName>> = {
  mint: 'moss',
  leaf: 'moss',
  sky: 'deep',
  ocean: 'deep',
  pink: 'berry',
  blush: 'berry',
  rose: 'berry',
  cream: 'bark',
  peach: 'bark',
  butter: 'bark',
  cocoa: 'bark',
  white: 'plum',
  lavender: 'plum',
  lilac: 'plum',
};

// Every outline colour, ink included.
export const OUTLINES: readonly ColourName[] = ['ink', ...new Set(Object.values(OUTLINE_OF))];
