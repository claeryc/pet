// The journey places, drawn in the room while you look at the current trip
// (tap the note on the wall): Market Town, Mossy Woods, Crystal Caves and
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

// Crystal Caves: a dark cave with dripping rocks and glowing crystals.
const CRYSTAL: Sprite = ['..k..', '.kvk.', '.klk.', 'kvllk', 'klllk', 'kkkkk'];
const BLUE_CRYSTAL: Sprite = ['.k.', 'ksk', 'ksk', 'kbk', 'kkk'];
function drawCaves(ctx: CanvasRenderingContext2D, w: number, h: number, _night: boolean, timeMs: number): void {
  rect(ctx, PALETTE.plum, 0, 0, w, h);
  rect(ctx, PALETTE.ink, 0, 0, w, 3);
  // The far wall, with a tunnel going on: an arch, lighter towards the
  // middle where the glow of more crystals comes through.
  for (let y = 12; y < GROUND; y++) {
    const half = Math.min(9, 3 + (y - 12) * 2);
    rect(ctx, PALETTE.lilac, 32 - half, y, half * 2, 1);
    if (y >= 16) rect(ctx, PALETTE.lavender, 32 - Math.max(1, half - 4), y, Math.max(1, half - 4) * 2, 1);
  }
  // Stalactites.
  for (const [x, len] of [[3, 6], [11, 4], [19, 8], [33, 3], [42, 7], [51, 4], [59, 6]]) {
    for (let i = 0; i < len; i++) rect(ctx, PALETTE.ink, x + Math.floor(i / 3), 3 + i, Math.max(1, 3 - Math.floor(i / 2)), 1);
  }
  // A drip falling now and then.
  const drip = (timeMs / 40) % 60;
  if (drip < 30) rect(ctx, PALETTE.sky, 20, 11 + Math.floor(drip), 1, 1);
  // The floor.
  rect(ctx, PALETTE.ink, 0, GROUND, w, h - GROUND);
  rect(ctx, PALETTE.plum, 0, GROUND, w, 1);
  for (let x = 2; x < w; x += 9) rect(ctx, PALETTE.plum, x, GROUND + 5 + (x % 4), 3, 1);
  paint(ctx, CRYSTAL, 3, 29);
  paint(ctx, BLUE_CRYSTAL, 9, 30);
  paint(ctx, CRYSTAL, w - 8, 29);
  paint(ctx, BLUE_CRYSTAL, w - 12, 31);
  // The crystals glint, one at a time.
  const glint = Math.floor(timeMs / 500) % 4;
  const spots = [[5, 30], [10, 31], [w - 6, 30], [w - 11, 32]];
  rect(ctx, PALETTE.white, spots[glint][0], spots[glint][1], 1, 1);
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
  caves: drawCaves,
  hill: drawHill,
};

// Draws the place with the given id (Market Town for one it doesn't know).
export function drawPlace(ctx: CanvasRenderingContext2D, place: string, w: number, h: number, night: boolean, timeMs: number): void {
  (PLACES[place] ?? drawMarket)(ctx, w, h, night, timeMs);
}
