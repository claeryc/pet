// The bag a pet carries on a journey: a stick over its shoulder, behind
// it (like the fishing rod), with a bag tied to the end. Bags are only for
// show. Every pet has the plain cloth sack (the one opened when it comes
// home); the Courier Bag is Percy's gift at 3 hearts (see regulars.ts).

import { PALETTE } from './palette';

// One letter a pixel, "." see-through.
const COLORS: Record<string, string> = {
  k: PALETTE.ink,
  // The cloth sack, in the backpack's browns (see src/ui/backpack.ts).
  D: '#7a3f22', M: '#b5653a', H: '#d9915a', r: '#e6c79a', R: '#a8875e',
  // The Courier Bag, in Percy's blue and butter.
  b: PALETTE.ocean, s: PALETTE.sky, y: PALETTE.butter, w: PALETTE.white,
};

export const BAGS: Record<string, string[]> = {
  sack: [
    '..kkk..',
    '.kRrRk.',
    '..kMk..',
    '.kMHMk.',
    'kMHMMDk',
    'kMMMMDk',
    'kDMMDDk',
    '.kkkkk.',
  ],
  courier: [
    '..kkk..',
    '.kyky..',
    'kkykkk.',
    'kbbbbbk',
    'kyyyyyk',
    'kbswwbk',
    'kbbbbbk',
    '.kkkkk.',
  ],
};

// The stick runs from the pet's back up past its shoulder; the bag hangs
// from its tip, clear of the body. `x` is the left edge of the pet's
// 32-pixel frame.
export function drawBag(ctx: CanvasRenderingContext2D, bag: string, x: number): void {
  const rows = BAGS[bag] ?? BAGS.sack;
  ctx.fillStyle = PALETTE.cocoa;
  for (let i = 0; i < 14; i++) ctx.fillRect(x + 18 + i, 22 - i, 1, 1);
  // Hung by its loop from the tip, beside the pet's head.
  const left = x + 28;
  const top = 8;
  rows.forEach((row, y) => [...row].forEach((ch, dx) => {
    if (!COLORS[ch]) return;
    ctx.fillStyle = COLORS[ch];
    ctx.fillRect(left + dx, top + y, 1, 1);
  }));
}

// The same bag as a small SVG, for the rewards card and the reveal.
export function bagIcon(bag: string): string {
  const rows = BAGS[bag] ?? BAGS.sack;
  let rects = '';
  rows.forEach((row, y) => [...row].forEach((ch, x) => {
    if (COLORS[ch]) rects += `<rect x="${x + 0.5}" y="${y}" width="1" height="1" fill="${COLORS[ch]}"/>`;
  }));
  return `<svg viewBox="0 0 8 8" shape-rendering="crispEdges" aria-hidden="true">${rects}</svg>`;
}
