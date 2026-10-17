// A design mockup: the plant's face as a sunflower head, with its petals
// lighting up yellow one by one, clockwise from the top, as the plant grows.
// Turned on with ?sunflower in the address (see src/ui/garden.ts).
//
// The flower is drawn as pixel art on a 32×32 grid, like the icons in
// src/ui/icons.ts.

import { PALETTE } from '../render/palette';

export type FlowerMood = 'happy' | 'sad' | 'ill' | 'wilted' | 'empty';

const SIZE = 32;
const C = SIZE / 2; // the middle of the grid
const PETALS = 12;
const DISC = 8.6; // the radius of the seed disc
const PETAL_AT = 12.4; // how far out each petal's middle is
const PETAL_LONG = 4.4; // a petal's half-length (outwards)
const PETAL_WIDE = 2.7; // a petal's half-width

// What each pixel is: -1 nothing, -2 the disc, or 0..11 a petal (and how
// far out along it, 0 at its base and 1 at its tip). Worked out once.
const kind: number[] = [];
const along: number[] = [];
for (let y = 0; y < SIZE; y++) {
  for (let x = 0; x < SIZE; x++) {
    const dx = x + 0.5 - C;
    const dy = y + 0.5 - C;
    let k = -1;
    let t = 0;
    if (Math.hypot(dx, dy) <= DISC) k = -2;
    else {
      for (let p = 0; p < PETALS; p++) {
        const a = (p / PETALS) * Math.PI * 2; // 0 is straight up, going clockwise
        const ux = Math.sin(a);
        const uy = -Math.cos(a);
        const u = dx * ux + dy * uy; // outwards
        const v = -dx * uy + dy * ux; // sideways
        if (((u - PETAL_AT) / PETAL_LONG) ** 2 + (v / PETAL_WIDE) ** 2 <= 1) {
          k = p;
          t = (u - (PETAL_AT - PETAL_LONG)) / (2 * PETAL_LONG);
          break;
        }
      }
    }
    kind.push(k);
    along.push(Math.max(0, Math.min(1, t)));
  }
}
const at = (x: number, y: number) => (x < 0 || y < 0 || x >= SIZE || y >= SIZE ? -1 : kind[y * SIZE + x]);

// The face on the disc, as [x, y, colour] pixels.
type Px = [number, number, string];
const eyes: Px[] = [
  [13, 14, PALETTE.ink], [13, 15, PALETTE.ink],
  [18, 14, PALETTE.ink], [18, 15, PALETTE.ink],
];
const cheeks: Px[] = [[12, 17, PALETTE.pink], [19, 17, PALETTE.pink]];
const FACES: Record<FlowerMood, Px[]> = {
  happy: [...eyes, ...cheeks,
    [14, 18, PALETTE.ink], [15, 19, PALETTE.ink], [16, 19, PALETTE.ink], [17, 18, PALETTE.ink]],
  sad: [...eyes,
    [14, 19, PALETTE.ink], [15, 18, PALETTE.ink], [16, 18, PALETTE.ink], [17, 19, PALETTE.ink],
    [12, 16, PALETTE.sky], [12, 17, PALETTE.sky]],
  ill: [
    [12, 13, PALETTE.ink], [14, 13, PALETTE.ink], [13, 14, PALETTE.ink], [12, 15, PALETTE.ink], [14, 15, PALETTE.ink],
    [17, 13, PALETTE.ink], [19, 13, PALETTE.ink], [18, 14, PALETTE.ink], [17, 15, PALETTE.ink], [19, 15, PALETTE.ink],
    [13, 19, PALETTE.ink], [14, 18, PALETTE.ink], [15, 19, PALETTE.ink], [16, 18, PALETTE.ink], [17, 19, PALETTE.ink], [18, 18, PALETTE.ink]],
  wilted: [
    [12, 15, PALETTE.ink], [13, 15, PALETTE.ink], [14, 15, PALETTE.ink],
    [17, 15, PALETTE.ink], [18, 15, PALETTE.ink], [19, 15, PALETTE.ink],
    [14, 19, PALETTE.ink], [15, 19, PALETTE.ink], [16, 19, PALETTE.ink], [17, 19, PALETTE.ink]],
  empty: [],
};

// The colours for each mood: [disc, lit petal, unlit petal].
const COLOURS: Record<FlowerMood, [string, string, string]> = {
  happy: [PALETTE.cocoa, PALETTE.butter, PALETTE.lavender],
  sad: [PALETTE.cocoa, PALETTE.butter, PALETTE.lavender],
  ill: [PALETTE.cocoa, PALETTE.peach, PALETTE.lavender],
  wilted: [PALETTE.plum, PALETTE.lilac, PALETTE.lavender],
  empty: [PALETTE.lavender, PALETTE.white, PALETTE.white],
};

// The flower for a plant `grown` of the way (0-1) to ready.
export function sunflower(mood: FlowerMood, grown: number): string {
  const [disc, lit, unlit] = COLOURS[mood];
  const lightUpTo = grown * PETALS; // petal p lights from base to tip as this passes p..p+1
  let rects = '';
  const px = (x: number, y: number, fill: string) =>
    (rects += `<rect x="${x}" y="${y}" width="1" height="1" fill="${fill}"/>`);
  for (let y = 0; y < SIZE; y++) {
    for (let x = 0; x < SIZE; x++) {
      const k = at(x, y);
      const n = [at(x - 1, y), at(x + 1, y), at(x, y - 1), at(x, y + 1)];
      if (k === -1) {
        // An outline around everything.
        if (n.some((m) => m !== -1)) px(x, y, PALETTE.ink);
      } else if (k === -2) {
        px(x, y, n.some((m) => m !== -2) ? PALETTE.ink : disc);
      } else {
        const edge = n.some((m) => m !== k && m !== -2);
        const t = along[y * SIZE + x];
        const on = k + t < lightUpTo;
        // A lit petal is warmer at its base, like a real sunflower.
        const fill = on ? (t < 0.3 && lit === PALETTE.butter ? PALETTE.peach : lit) : unlit;
        px(x, y, edge ? PALETTE.ink : fill);
      }
    }
  }
  for (const [x, y, fill] of FACES[mood]) px(x, y, fill);
  return `<svg viewBox="0 0 ${SIZE} ${SIZE}" shape-rendering="crispEdges" aria-hidden="true">${rects}</svg>`;
}
