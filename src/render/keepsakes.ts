// Keepsakes in the room, from pets that moved to the Meadow (see
// src/game/meadow.ts): a pet's framed portrait on the wall between the
// window and the shelf, and up to three little things on a shelf, one
// from each pet's world. A golden one shines now and then.

import { PALETTE } from './palette';
import type { SpriteSheet } from './sprites';

export interface ShelfThing {
  kind: string; // a theme id, or 'egg' (see keepsakeKind in meadow.ts)
  golden: boolean;
}

export interface RoomKeepsakes {
  // The pet in the frame (its sheet, which may still be loading), or none.
  frame: { sheet: SpriteSheet | undefined } | null;
  shelf: (ShelfThing | null)[];
}

// Little sprites from text grids: "." is see-through, other letters are
// palette colours. Each stands on the shelf.
const COLORS: Record<string, string> = {
  r: PALETTE.rose,
  p: PALETTE.pink,
  w: PALETTE.white,
  e: PALETTE.cream,
  c: PALETTE.cocoa,
  y: PALETTE.butter,
  o: PALETTE.peach,
  s: PALETTE.sky,
  b: PALETTE.ocean,
  l: PALETTE.lilac,
  v: PALETTE.lavender,
  m: PALETTE.mint,
  g: PALETTE.leaf,
};

export const THINGS: Record<string, string[]> = {
  // A mushroom lamp.
  nature: ['.rrr.', 'rrwrr', 'rrrrr', '..e..', '..e..', '.eee.'],
  // A seashell.
  ocean: ['.ppp.', 'pwpwp', 'pwpwp', 'pwpwp', '.ppp.', '..p..'],
  // A little cake with a cherry.
  bakery: ['..r..', '.www.', 'wwwww', 'ppppp', 'ooooo'],
  // A jar with a star in it.
  starry: ['.ccc.', 's...s', 's.y.s', 'syyys', 's.y.s', '.sss.'],
  // A crystal.
  cave: ['..v..', '.vlv.', '.vlv.', 'vvlvv', 'lvlvl'],
  // A bit of eggshell, for a pet that never grew up.
  egg: ['w.w.w', 'wwwww', 'wwwww', '.www.'],
};

// Where things go: the frame, and the shelf (its plank and each spot's
// middle), in room pixels.
const FRAME = { x: 24, y: 4, w: 10, h: 11 };
const SHELF = { left: 38, right: 63, y: 14, spots: [43, 51, 59] };

// The colour of one letter of a thing's grid. Gold: the lightest parts
// butter, the rest peach.
export function thingColour(letter: string, golden: boolean): string | undefined {
  const colour = COLORS[letter];
  if (!colour || !golden) return colour;
  return 'weys'.includes(letter) ? PALETTE.butter : PALETTE.peach;
}

function drawThing(ctx: CanvasRenderingContext2D, thing: ShelfThing, cx: number, timeMs: number): void {
  const sprite = THINGS[thing.kind] ?? THINGS.egg;
  const x = cx - Math.floor(sprite[0].length / 2);
  const y = SHELF.y - sprite.length;
  // A dark outline first (like the pets have), so it stands out on the wall.
  const paint = (ox: number, oy: number, solid?: string) => sprite.forEach((row, sy) => {
    for (let sx = 0; sx < row.length; sx++) {
      const colour = thingColour(row[sx], thing.golden);
      if (!colour) continue;
      ctx.fillStyle = solid ?? colour;
      ctx.fillRect(x + sx + ox, y + sy + oy, 1, 1);
    }
  });
  for (const [ox, oy] of [[-1, 0], [1, 0], [0, -1]]) paint(ox, oy, thing.golden ? PALETTE.bark : PALETTE.ink);
  paint(0, 0);
  if (thing.golden && Math.floor(timeMs / 500 + cx) % 6 === 0) {
    // A sparkle at its top corner.
    const sx = x + sprite[0].length;
    ctx.fillStyle = PALETTE.white;
    ctx.fillRect(sx, y - 3, 1, 3);
    ctx.fillRect(sx - 1, y - 2, 3, 1);
  }
}

// A pet's portrait in a little wooden frame: its first idle frame, shrunk
// down softly like a photo.
function drawFrame(ctx: CanvasRenderingContext2D, sheet: SpriteSheet | undefined): void {
  const { x, y, w, h } = FRAME;
  ctx.fillStyle = PALETTE.cocoa;
  ctx.fillRect(x, y, w, h);
  ctx.fillStyle = PALETTE.cream;
  ctx.fillRect(x + 1, y + 1, w - 2, h - 2);
  // The nail it hangs from.
  ctx.fillStyle = PALETTE.ink;
  ctx.fillRect(x + Math.floor(w / 2), y - 1, 1, 1);
  if (!sheet) return;
  const fw = sheet.frameWidth;
  const fh = sheet.frameHeight;
  const row = 0; // idle
  ctx.save();
  ctx.imageSmoothingEnabled = true;
  // Most of a pet sits in the lower middle of its frame.
  const cut = { x: fw * 0.15, y: fh * 0.2, w: fw * 0.7, h: fh * 0.8 };
  ctx.drawImage(sheet.image, cut.x, row * fh + cut.y, cut.w, cut.h, x + 1, y + 1, w - 2, h - 2);
  ctx.restore();
}

export function drawKeepsakes(ctx: CanvasRenderingContext2D, k: RoomKeepsakes, timeMs: number): void {
  if (k.frame) drawFrame(ctx, k.frame.sheet);
  if (!k.shelf.some(Boolean)) return;
  // The plank, with two little brackets.
  ctx.fillStyle = PALETTE.cocoa;
  ctx.fillRect(SHELF.left, SHELF.y, SHELF.right - SHELF.left + 1, 1);
  ctx.fillRect(SHELF.left + 2, SHELF.y + 1, 1, 2);
  ctx.fillRect(SHELF.right - 2, SHELF.y + 1, 1, 2);
  k.shelf.forEach((thing, i) => thing && drawThing(ctx, thing, SHELF.spots[i], timeMs));
}
