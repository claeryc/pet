// The bag a pet carries on a journey: a stick held out from behind it
// (like the fishing rod), with a cloth bundle tied near the end. Bags are
// only for show. Every pet has the plain brown bundle; the Courier Bag is
// Percy's gift at 3 hearts (see regulars.ts).

import { PALETTE } from './palette';

// One letter a pixel, "." see-through.
const COLORS: Record<string, string> = {
  k: PALETTE.ink,
  // The cloth bundle, in the backpack's browns (see src/ui/backpack.ts).
  D: '#7a3f22', M: '#b5653a', H: '#d9915a', L: '#efc995',
  // The Courier Bag, in Percy's blue and butter.
  b: PALETTE.ocean, o: '#3f6fb3', s: PALETTE.sky, y: PALETTE.butter, w: PALETTE.white, p: PALETTE.pink,
};

// A cloth bundle tied at the top, its corners sticking up over the knot.
// The knot (row KNOT) goes round the stick.
export const BAGS: Record<string, string[]> = {
  sack: [
    '.kk...kk.',
    'kHMk.kMDk',
    '.kHMkMDk.',
    '..kDMDk..',
    '..kMMDk..',
    '.kHMMMDk.',
    'kHLMMMMDk',
    'kHLMMDMDk',
    'kHMMMDMDk',
    'kMMMMMMDk',
    '.kDMMMDk.',
    '..kkkkk..',
  ],
  courier: [
    '.kk...kk.',
    'kyyk.kyyk',
    '.kyykyyk.',
    '..kyyyk..',
    '..kbbok..',
    '.ksbbbok.',
    'kssbbbbok',
    'kswwwwwok',
    'kswwppwok',
    'kbwwwwwok',
    '.kbbbbok.',
    '..kkkkk..',
  ],
};
const KNOT = 3;

// The stick: light on top, dark underneath.
function drawStick(ctx: CanvasRenderingContext2D, x0: number, y0: number, x1: number, y1: number): [number, number][] {
  const n = Math.max(Math.abs(x1 - x0), Math.abs(y1 - y0));
  const points = Array.from({ length: n + 1 }, (_, i): [number, number] =>
    [Math.round(x0 + ((x1 - x0) * i) / n), Math.round(y0 + ((y1 - y0) * i) / n)]);
  ctx.fillStyle = '#5e3a26';
  for (const [x, y] of points) ctx.fillRect(x, y + 1, 1, 1);
  ctx.fillStyle = '#c98a62';
  for (const [x, y] of points) ctx.fillRect(x, y, 1, 1);
  return points;
}

// The stick comes out from behind the pet and is held out to the side,
// with the bundle tied a little short of its end. With two pets on a trip
// there's no room at the side, so it goes up over the shoulder instead.
// `x` is the left edge of the pet's 32-pixel frame.
export function drawBag(ctx: CanvasRenderingContext2D, bag: string, x: number, shoulder = false): void {
  const rows = BAGS[bag] ?? BAGS.sack;
  const points = shoulder ? drawStick(ctx, x + 20, 28, x + 31, 13) : drawStick(ctx, x + 18, 28, x + 40, 21);
  const [hx, hy] = points[points.length - 3];
  const left = hx - Math.floor(rows[0].length / 2);
  rows.forEach((row, y) => [...row].forEach((ch, dx) => {
    if (!COLORS[ch]) return;
    ctx.fillStyle = COLORS[ch];
    ctx.fillRect(left + dx, hy - KNOT + y, 1, 1);
  }));
}

// The same bag as a small SVG, for the rewards card and the reveal.
export function bagIcon(bag: string): string {
  const rows = BAGS[bag] ?? BAGS.sack;
  let rects = '';
  rows.forEach((row, y) => [...row].forEach((ch, x) => {
    if (COLORS[ch]) rects += `<rect x="${x}" y="${y}" width="1" height="1" fill="${COLORS[ch]}"/>`;
  }));
  return `<svg viewBox="-1.5 0 12 12" shape-rendering="crispEdges" aria-hidden="true">${rects}</svg>`;
}
