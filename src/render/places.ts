// The journey places, drawn in the room while you look at the current trip
// (tap the note on the wall): Market Town, Mossy Woods, Coral Cove and
// Starlit Hill, one per theme (see CONFIG.journeys.places). The pets stand
// on the ground at y = 40, like in the room.

import { PALETTE } from './palette';

// Little sprites from text grids: "." is see-through, other letters are
// palette colours.
export type Sprite = string[];
const COLORS: Record<string, string> = {
  k: PALETTE.ink,
  u: PALETTE.plum,
  l: PALETTE.lilac,
  v: PALETTE.lavender,
  e: PALETTE.cream,
  w: PALETTE.white,
  p: PALETTE.pink,
  o: PALETTE.peach,
  y: PALETTE.butter,
  m: PALETTE.mint,
  g: PALETTE.leaf,
  s: PALETTE.sky,
  b: PALETTE.ocean,
  c: PALETTE.cocoa,
  r: PALETTE.rose,
  n: PALETTE.moss,
  t: PALETTE.bark,
  x: PALETTE.berry,
};

export function paint(ctx: CanvasRenderingContext2D, sprite: Sprite, x: number, y: number): void {
  sprite.forEach((row, sy) => {
    for (let sx = 0; sx < row.length; sx++) {
      const color = COLORS[row[sx]];
      if (!color) continue;
      ctx.fillStyle = color;
      ctx.fillRect(x + sx, y + sy, 1, 1);
    }
  });
}

export function rect(ctx: CanvasRenderingContext2D, color: string, x: number, y: number, w: number, h: number): void {
  ctx.fillStyle = color;
  ctx.fillRect(x, y, w, h);
}

export const GROUND = 34; // where the ground starts, like the room's floor

// A few twinkling stars over a night sky.
export function stars(ctx: CanvasRenderingContext2D, w: number, bottom: number, timeMs: number): void {
  const twinkle = Math.floor(timeMs / 700) % 2;
  for (let i = 0; i < 9; i++) {
    const x = (i * 23 + 5) % w;
    const y = 2 + ((i * 11) % Math.max(1, bottom - 6));
    rect(ctx, (i + twinkle) % 3 ? PALETTE.butter : PALETTE.white, x, y, 1, 1);
  }
}

// Market Town: rooftops behind, two striped stalls and a line of bunting,
// on a cobbled square.
const STALL: Sprite = [
  'krkrkrkrkrkrkk',
  'rwrwrwrwrwrwrk',
  'rwrwrwrwrwrwrk',
  '.r.r.r.r.r.r..',
  '.c..........c.',
  '.c..........c.',
  '.c..........c.',
  'kkkkkkkkkkkkkk',
  'kooooooooooook',
  'kooooooooooook',
];
function drawMarket(ctx: CanvasRenderingContext2D, w: number, h: number, night: boolean, timeMs: number): void {
  rect(ctx, night ? PALETTE.plum : PALETTE.sky, 0, 0, w, GROUND);
  if (night) stars(ctx, w, 14, timeMs);
  else rect(ctx, PALETTE.white, 40, 5, 6, 2);
  // Rooftops along the back.
  const roofs = [[0, 18, 10], [9, 14, 12], [20, 20, 10], [29, 16, 13], [41, 19, 9], [49, 13, 15]];
  for (const [x, top, rw] of roofs) {
    rect(ctx, night ? PALETTE.lilac : PALETTE.cream, x, top + 3, rw, GROUND - top - 3);
    rect(ctx, PALETTE.rose, x - 1, top, rw + 2, 3);
    rect(ctx, night ? PALETTE.butter : PALETTE.sky, x + 2, top + 6, 2, 2); // a window
  }
  // Bunting, sagging a little in the middle.
  for (let x = 0; x < w; x++) {
    const y = 4 + Math.round(Math.sin((x / w) * Math.PI) * 3);
    rect(ctx, PALETTE.cocoa, x, y, 1, 1);
    if (x % 6 === 2) {
      const flag = [PALETTE.pink, PALETTE.butter, PALETTE.mint, PALETTE.lilac][(x / 6) % 4 | 0];
      rect(ctx, flag, x, y + 1, 3, 1);
      rect(ctx, flag, x + 1, y + 2, 1, 1);
    }
  }
  // Cobbles.
  rect(ctx, PALETTE.peach, 0, GROUND, w, h - GROUND);
  for (let y = GROUND + 2; y < h; y += 3) {
    for (let x = (y % 2) * 2; x < w; x += 5) rect(ctx, PALETTE.butter, x, y, 2, 1);
  }
  paint(ctx, STALL, 1, 26);
  paint(ctx, STALL, w - 15, 26);
  // A few things for sale.
  rect(ctx, PALETTE.rose, 4, 32, 2, 1);
  rect(ctx, PALETTE.butter, 8, 32, 2, 1);
  rect(ctx, PALETTE.leaf, w - 11, 32, 2, 1);
  rect(ctx, PALETTE.pink, w - 7, 32, 2, 1);
}

// Mossy Woods: tall trunks under a leafy canopy, moss and red mushrooms.
const MUSHROOM: Sprite = ['.rrrr.', 'rwrrwr', 'rrrrrr', '..ee..', '..ee..'];
function drawWoods(ctx: CanvasRenderingContext2D, w: number, h: number, night: boolean, timeMs: number): void {
  rect(ctx, night ? PALETTE.plum : PALETTE.mint, 0, 0, w, GROUND);
  if (night) stars(ctx, w, 12, timeMs);
  // Trunks, the far ones lighter.
  for (const [x, tw, far] of [[6, 3, 1], [22, 2, 1], [44, 3, 1], [56, 2, 1], [0, 5, 0], [14, 4, 0], [50, 5, 0]]) {
    rect(ctx, far ? (night ? PALETTE.lilac : PALETTE.peach) : PALETTE.cocoa, x, 6, tw, GROUND - 6);
  }
  // The canopy: lumpy leaves across the top.
  rect(ctx, PALETTE.leaf, 0, 0, w, 7);
  for (let x = 0; x < w; x += 4) {
    const dip = [3, 5, 2, 4, 6, 3][(x / 4) % 6];
    rect(ctx, PALETTE.leaf, x, 7, 4, dip);
    rect(ctx, PALETTE.mint, x + 1, 2 + (dip % 3), 1, 1);
  }
  // Light coming through.
  const sway = Math.floor(timeMs / 900) % 2;
  if (!night) {
    rect(ctx, PALETTE.butter, 30 + sway, 13, 1, 1);
    rect(ctx, PALETTE.butter, 38 - sway, 17, 1, 1);
  }
  // Moss.
  rect(ctx, PALETTE.leaf, 0, GROUND, w, h - GROUND);
  rect(ctx, PALETTE.mint, 0, GROUND, w, 1);
  for (let x = 1; x < w; x += 7) rect(ctx, PALETTE.mint, x, GROUND + 4 + (x % 3) * 2, 2, 1);
  paint(ctx, MUSHROOM, 8, 35);
  paint(ctx, MUSHROOM, w - 11, 37);
  rect(ctx, PALETTE.butter, 3, 44, 1, 1); // little flowers
  rect(ctx, PALETTE.pink, w - 3, 42, 1, 1);
}

// Coral Cove: a sandy cove by the sea, a rock arch on the left, and a tide
// pool in front with pink coral, seaweed and a starfish.
const STARFISH: Sprite = ['...p...', '..ppp..', 'pppxppp', '.ppppp.', '..p.p..', '.p...p.'];
const SHELL: Sprite = ['.p.', 'pwp', 'ppp'];
const CORAL: Sprite = ['p.p.p', 'p.p.p', '.ppp.', '..p..'];
function drawCove(ctx: CanvasRenderingContext2D, w: number, h: number, night: boolean, timeMs: number): void {
  const SEA = 17; // where the sea meets the sky
  const SHORE = 28; // where the waves come up the sand
  rect(ctx, night ? PALETTE.plum : PALETTE.sky, 0, 0, w, SEA);
  if (night) {
    stars(ctx, w, SEA - 4, timeMs);
    rect(ctx, PALETTE.butter, 44, 4, 4, 4);
    rect(ctx, PALETTE.cream, 45, 5, 1, 1);
  } else {
    rect(ctx, PALETTE.white, 30, 5, 7, 2);
    rect(ctx, PALETTE.white, 50, 9, 4, 1);
  }
  // The sea, with little waves rolling in.
  rect(ctx, night ? PALETTE.deep : PALETTE.ocean, 0, SEA, w, SHORE - SEA);
  const roll = Math.floor(timeMs / 600) % 4;
  for (let y = SEA + 2; y < SHORE; y += 3) {
    for (let x = ((y * 7 + roll * 2) % 9); x < w; x += 9) rect(ctx, night ? PALETTE.ocean : PALETTE.sky, x, y, 3, 1);
  }
  if (night) for (let y = SEA + 1; y < SHORE; y += 2) rect(ctx, PALETTE.butter, 45 + (y % 3), y, 2, 1); // the moon on the water
  // Wet sand, and the foam coming in and going out.
  rect(ctx, PALETTE.peach, 0, SHORE, w, GROUND - SHORE);
  const foam = Math.floor(timeMs / 900) % 2;
  for (let x = 0; x < w; x++) rect(ctx, PALETTE.white, x, SHORE + foam + ((x >> 2) % 2), 1, 1);
  // Dry sand, where the pets stand.
  rect(ctx, PALETTE.butter, 0, GROUND, w, h - GROUND);
  for (let x = 3; x < w; x += 7) rect(ctx, PALETTE.peach, x, GROUND + 3 + (x % 4) * 2, 2, 1);
  // The rock arch on the left, with the sea showing through it.
  for (let y = 3; y < GROUND + 2; y++) {
    const rw = Math.min(17, 7 + Math.floor((y - 3) * 0.6) + (y % 5 === 0 ? 1 : 0));
    rect(ctx, PALETTE.lilac, 0, y, rw, 1);
    rect(ctx, PALETTE.plum, rw - 1, y, 1, 1);
  }
  rect(ctx, PALETTE.lavender, 0, 3, 5, 1);
  rect(ctx, PALETTE.lavender, 1, 4, 2, 1);
  rect(ctx, PALETTE.plum, 3, 9, 1, 3); // cracks
  rect(ctx, PALETTE.plum, 2, 26, 1, 2);
  for (let y = 14; y < SHORE; y++) {
    const half = [1, 2, 3, 3, 4][Math.min(4, y - 14)];
    rect(ctx, PALETTE.plum, 8 - half - 1, y, half * 2 + 2, 1);
    rect(ctx, night ? PALETTE.deep : PALETTE.ocean, 8 - half, y, half * 2, 1);
    if (y < SEA) rect(ctx, night ? PALETTE.plum : PALETTE.sky, 8 - half, y, half * 2, 1);
  }
  rect(ctx, PALETTE.white, 5, SHORE - 1, 6, 1);
  // A little rock out at sea.
  rect(ctx, PALETTE.lilac, w - 14, SEA - 2, 5, 3);
  rect(ctx, PALETTE.lilac, w - 13, SEA - 3, 3, 1);
  rect(ctx, PALETTE.white, w - 15, SEA + 1, 7, 1);
  paint(ctx, CORAL, 12, GROUND - 2);
  // Shells on the sand.
  paint(ctx, SHELL, 22, GROUND + 9);
  rect(ctx, PALETTE.lavender, 4, GROUND + 11, 2, 1);
  // The tide pool in front, on the right, with coral, seaweed and a starfish.
  const px = w - 22;
  const py = GROUND + 6;
  for (let y = 0; y < 7; y++) {
    const inset = [4, 2, 1, 0, 0, 1, 3][y];
    rect(ctx, PALETTE.lilac, px + inset - 1, py + y, 20 - inset * 2 + 2, 1);
    rect(ctx, night ? PALETTE.deep : PALETTE.ocean, px + inset, py + y, 20 - inset * 2, 1);
  }
  rect(ctx, PALETTE.sky, px + 5, py + 1, 3, 1);
  paint(ctx, CORAL, px + 12, py + 2);
  const sway = Math.floor(timeMs / 700) % 2;
  for (let i = 0; i < 5; i++) {
    rect(ctx, PALETTE.leaf, px + 3 + ((i + sway) % 2), py + 6 - i, 1, 1);
    rect(ctx, PALETTE.moss, px + 7 + ((i + sway + 1) % 2), py + 6 - Math.min(i, 3), 1, 1);
  }
  paint(ctx, STARFISH, w - 9, GROUND - 1);
  // Seaweed washed up by the rocks, swaying.
  for (let i = 0; i < 4; i++) rect(ctx, PALETTE.leaf, 17 + ((i + sway) % 2), GROUND + 1 - i, 1, 1);
}

// Starlit Hill: always a starry sky, a big moon, and a soft green hill.
function drawHill(ctx: CanvasRenderingContext2D, w: number, h: number, _night: boolean, timeMs: number): void {
  rect(ctx, PALETTE.plum, 0, 0, w, h);
  rect(ctx, PALETTE.ink, 0, 0, w, 4);
  stars(ctx, w, 22, timeMs);
  // A shooting star now and then.
  const shoot = (timeMs / 60) % 120;
  if (shoot < 12) {
    const sx = 50 - Math.floor(shoot * 2);
    rect(ctx, PALETTE.white, sx, 3 + Math.floor(shoot / 2), 2, 1);
    rect(ctx, PALETTE.lavender, sx + 2, 3 + Math.floor(shoot / 2), 2, 1);
  }
  // The moon.
  rect(ctx, PALETTE.butter, 47, 5, 6, 6);
  rect(ctx, PALETTE.butter, 46, 6, 8, 4);
  rect(ctx, PALETTE.cream, 48, 6, 2, 2);
  // Hills: a far one, then the near one the pets stand on.
  for (let x = 0; x < w; x++) {
    const far = 24 + Math.round(Math.cos(((x - 12) / w) * Math.PI * 1.6) * 4);
    rect(ctx, PALETTE.leaf, x, far, 1, h - far);
  }
  for (let x = 0; x < w; x++) {
    const near = GROUND - 2 + Math.round(Math.abs(x - w / 2) / 12);
    rect(ctx, PALETTE.mint, x, near, 1, h - near);
  }
  for (let x = 3; x < w; x += 8) rect(ctx, PALETTE.leaf, x, GROUND + 5 + (x % 3) * 2, 2, 1);
  rect(ctx, PALETTE.butter, 6, 41, 1, 1);
  rect(ctx, PALETTE.white, w - 7, 43, 1, 1);
}

// The Meadow, for a Holiday: open sky, a rolling green field, a big tree
// and flowers.
function drawMeadowPlace(ctx: CanvasRenderingContext2D, w: number, h: number, night: boolean, timeMs: number): void {
  rect(ctx, night ? PALETTE.plum : PALETTE.sky, 0, 0, w, GROUND);
  if (night) stars(ctx, w, 18, timeMs);
  else {
    rect(ctx, PALETTE.white, 8, 6, 7, 2);
    rect(ctx, PALETTE.white, 44, 10, 5, 1);
  }
  // A far hill, then the field.
  for (let x = 0; x < w; x++) {
    const top = GROUND - 6 + Math.round(Math.sin((x / w) * Math.PI * 1.5) * 3);
    rect(ctx, PALETTE.mint, x, top, 1, GROUND - top);
  }
  rect(ctx, PALETTE.leaf, 0, GROUND, w, h - GROUND);
  rect(ctx, PALETTE.mint, 0, GROUND, w, 1);
  // The big tree on the right.
  rect(ctx, PALETTE.cocoa, w - 9, 14, 3, GROUND - 14);
  rect(ctx, PALETTE.leaf, w - 15, 6, 15, 9);
  rect(ctx, PALETTE.leaf, w - 13, 4, 11, 2);
  rect(ctx, PALETTE.mint, w - 11, 6, 2, 1);
  // Flowers, nodding.
  const nod = Math.floor(timeMs / 800) % 2;
  for (const [x, y, c] of [[4, 38, PALETTE.pink], [11, 43, PALETTE.butter], [20, 40, PALETTE.white], [30, 45, PALETTE.pink], [44, 41, PALETTE.butter], [52, 46, PALETTE.white]] as const) {
    rect(ctx, c, x + (y % 2 ? nod : 0), y, 1, 1);
  }
}

const PLACES: Record<string, typeof drawMarket> = {
  meadow: drawMeadowPlace,
  market: drawMarket,
  woods: drawWoods,
  cove: drawCove,
  hill: drawHill,
};

// Draws the place with the given id (Market Town for one it doesn't know).
export function drawPlace(ctx: CanvasRenderingContext2D, place: string, w: number, h: number, night: boolean, timeMs: number): void {
  (PLACES[place] ?? drawMarket)(ctx, w, h, night, timeMs);
}
