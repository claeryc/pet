// Keepsakes in the room, from pets that moved to the Meadow (see
// src/game/meadow.ts): a pet's framed portrait, and up to three little
// things on a shelf, one from each pet's world. The frame and the shelf
// are placed like furniture (see src/render/furniture.ts). A golden one
// shines now and then.
//
// Tapping the shelf shows it up close (drawShelfCloseup): the same three
// things, each drawn properly at 16 pixels, standing on a big plank.

import { PALETTE } from './palette';
import type { SpriteSheet } from './sprites';
import type { FurnitureSlot } from '../game/state';
import { pieceAt, SPOT_BOX } from './furniture';
import { WALLPAPERS } from './room';

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

// The same things up close, 16 pixels square, with their outline ("k")
// drawn in. Golden ones swap to gold (see bigColour).
export const BIG_THINGS: Record<string, string[]> = {
  // A mushroom lamp.
  nature: [
    '......kkkk......',
    '....kkrrrrkk....',
    '...krrwwrrrrk...',
    '..krrwwwrrrwrk..',
    '.krrrrwwrrrwwrk.',
    '.krrrrrrrrrrrrk.',
    'krwwrrrrwwrrrrrk',
    'krwwrrrrwwrrrrxk',
    'kxxxxxxxxxxxxxxk',
    '.kkkkkkkkkkkkkk.',
    '.....keyyek.....',
    '.....keyyek.....',
    '.....keeeok.....',
    '....keeeeeok....',
    '....keeeeook....',
    '.....kkkkkk.....',
  ],
  // A seashell.
  ocean: [
    '................',
    '......kkkk......',
    '....kkpwpwkk....',
    '...kpwpwpwpwk...',
    '..kwpwpwpwpwpk..',
    '.kpwpwpwpwpwpwk.',
    '.kpwpwpwpwpwpwk.',
    'kwpwpwpwpwpwpwpk',
    'kwpwpwpwpwpwpwpk',
    '.kpwpwpwpwpwpwk.',
    '..kpxpxpxpxpxk..',
    '...kkkppppkkk...',
    '...kpppxxpppk...',
    '...kpppxxpppk...',
    '....kkkkkkkk....',
    '................',
  ],
  // A little cake with a cherry.
  bakery: [
    '........k.......',
    '.......kqk......',
    '......krrk......',
    '.....krwrrk.....',
    '...kkkrrrxkkk...',
    '..kwwwwwwwwwwk..',
    '.kwwwwwwwwwwwwk.',
    '.kwpwwwpwwwwpwk.',
    '.kppppppppppipk.',
    '.kooooooooooook.',
    '.koyoooyoooyook.',
    '.kooooooooooook.',
    '.kppppppppppppk.',
    'kwwwwwwwwwwwwwwk',
    '.kkkkkkkkkkkkkk.',
    '................',
  ],
  // A jar with a star in it.
  starry: [
    '.....kkkkkk.....',
    '....kcccccck....',
    '....kcddddck....',
    '....kkkkkkkk....',
    '...kwssssssskk..',
    '..kwssssssssssk.',
    '..kwsssyssssssk.',
    '..kwssyyysssssk.',
    '..kwsyyyyysssnk.',
    '..kwssyyysssssk.',
    '..kwssysysssssk.',
    '..ksssssssssssk.',
    '..knsssssssssnk.',
    '...knnnnnnnnnk..',
    '....kkkkkkkkk...',
    '................',
  ],
  // A crystal.
  cave: [
    '.......k........',
    '......klk.......',
    '.....klvvk......',
    '..k..klvvk..k...',
    '.klk.klwvk.klk..',
    '.klvkklwvkklvvk.',
    'klvvkklwvkklwvk.',
    'klwvkllwvvklwvk.',
    'klwvvlvwvvvlwvk.',
    'klwvvlvvvvvlvvuk',
    'klvvvlvvvvvlvvuk',
    'kuuuuuuuuuuuuuuk',
    '.kkkkkkkkkkkkkk.',
    '................',
    '................',
    '................',
  ],
  // A bit of eggshell.
  egg: [
    '................',
    '................',
    '................',
    '................',
    '.....k....k.....',
    '....kwk..kwk.k..',
    '...kwwvkkwwvkwk.',
    '..kwwvvwwvvvwwwk',
    '.kwvvvvvvvvvvvwk',
    '.kwwwwwwwwwwwwwk',
    '.kwewwwwwwwwwvwk',
    '.kwwewwwwwwwvvwk',
    '..kwwwwwwwwwvvk.',
    '...kwwwwwwwvvk..',
    '....kkvvvvvkk...',
    '......kkkkk.....',
  ],
};

// The frame's size, and the shelf's things: where each stands from the
// middle of the plank, in room pixels.
const FRAME = { w: 10, h: 11 };
const SHELF_SPOTS = [-8, 0, 8];

// Big pictures' letters: the little palette, plus the outline and two
// darker shades.
const BIG_COLORS: Record<string, string> = { ...COLORS, k: PALETTE.ink, x: PALETTE.berry, u: PALETTE.plum, n: PALETTE.deep, q: PALETTE.moss, d: PALETTE.bark };
// Gold keeps the light and dark of each part, so the picture still reads.
const GOLD: Record<string, string> = {
  y: 'w', e: 'w', w: 'y', s: 'y', v: 'y', m: 'y', o: 'y',
  p: 'o', l: 'o', r: 'o', g: 'o', i: 'o',
  x: 'c', u: 'c', n: 'c', q: 'c', c: 'c', b: 'c', d: 'd', k: 'd',
};
export function bigColour(letter: string, golden: boolean): string | undefined {
  return BIG_COLORS[golden ? GOLD[letter] ?? letter : letter];
}

// The colour of one letter of a thing's grid. Gold: the lightest parts
// butter, the rest peach.
export function thingColour(letter: string, golden: boolean): string | undefined {
  const colour = COLORS[letter];
  if (!colour || !golden) return colour;
  return 'weys'.includes(letter) ? PALETTE.butter : PALETTE.peach;
}

function drawThing(ctx: CanvasRenderingContext2D, thing: ShelfThing, cx: number, plank: number, timeMs: number): void {
  const sprite = THINGS[thing.kind] ?? THINGS.egg;
  const x = cx - Math.floor(sprite[0].length / 2);
  const y = plank - sprite.length;
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
function drawFrame(ctx: CanvasRenderingContext2D, sheet: SpriteSheet | undefined, spot: FurnitureSlot): void {
  const { w, h } = FRAME;
  const { x, y } = pieceAt(spot, w, h);
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

// The frame and the shelf, where they've been put (`furniture`, the
// room's spots). An empty frame or shelf still hangs there.
export function drawKeepsakes(
  ctx: CanvasRenderingContext2D, k: RoomKeepsakes, furniture: Partial<Record<FurnitureSlot, string>>, timeMs: number,
): void {
  const spotOf = (id: string) => (Object.keys(furniture) as FurnitureSlot[]).find((s) => furniture[s] === id);
  const frameSpot = spotOf('keepsakeFrame');
  if (frameSpot) drawFrame(ctx, k.frame?.sheet, frameSpot);
  const shelfSpot = spotOf('keepsakeShelf');
  if (!shelfSpot) return;
  const box = shelfBox(shelfSpot);
  // The plank, with two little brackets.
  ctx.fillStyle = PALETTE.cocoa;
  ctx.fillRect(box.left, box.y, box.right - box.left + 1, 1);
  ctx.fillRect(box.left + 2, box.y + 1, 1, 2);
  ctx.fillRect(box.right - 2, box.y + 1, 1, 2);
  k.shelf.forEach((thing, i) => thing && drawThing(ctx, thing, box.centre + SHELF_SPOTS[i], box.y, timeMs));
}

// The shelf in a spot: its plank's ends and row, and its middle.
function shelfBox(spot: FurnitureSlot): { left: number; right: number; y: number; centre: number } {
  const b = SPOT_BOX[spot];
  return { left: b.x0, right: b.x1, y: b.y0 + 8, centre: Math.floor((b.x0 + b.x1 + 1) / 2) };
}

// The shelf's box in room pixels (for taps), or null if it isn't up.
export function shelfHit(furniture: Partial<Record<FurnitureSlot, string>>, x: number, y: number): boolean {
  const spot = (Object.keys(furniture) as FurnitureSlot[]).find((s) => furniture[s] === 'keepsakeShelf');
  if (!spot) return false;
  const b = shelfBox(spot);
  return x >= b.left && x <= b.right && y >= b.y - 8 && y <= b.y + 3;
}

// --- Up close ------------------------------------------------------------

// The close-up's layout, in room pixels: the plank's top row, and the
// middle of each thing's spot on it.
export const CLOSEUP = { plank: 36, spots: [12, 32, 52] };

// Which spot a point is over, for taps (null between them).
export function closeupSpotAt(x: number): number | null {
  const i = CLOSEUP.spots.findIndex((c) => Math.abs(x - c) <= 9);
  return i < 0 ? null : i;
}

// The shelf up close: the room's wallpaper, three times bigger, a wide
// plank with brackets, and the three things on it. The one picked bobs
// gently with a little arrow over it, and golden ones sparkle.
export function drawShelfCloseup(
  ctx: CanvasRenderingContext2D, wallpaper: string, things: (ShelfThing | null)[], picked: number | null,
  night: boolean, width: number, height: number, timeMs: number,
): void {
  const pattern = WALLPAPERS[wallpaper] ?? WALLPAPERS.plain;
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      ctx.fillStyle = pattern(Math.floor(x / 3), Math.floor(y / 3), night);
      ctx.fillRect(x, y, 1, 1);
    }
  }
  const { plank } = CLOSEUP;
  // A soft shadow on the wall under the plank, then the plank: a light
  // top edge, the wood, a dark underside, and two brackets.
  ctx.globalAlpha = 0.18;
  ctx.fillStyle = PALETTE.ink;
  ctx.fillRect(2, plank + 4, width - 4, 2);
  ctx.globalAlpha = 1;
  ctx.fillStyle = PALETTE.ink;
  ctx.fillRect(1, plank - 1, width - 2, 6);
  ctx.fillStyle = PALETTE.peach;
  ctx.fillRect(2, plank, width - 4, 1);
  ctx.fillStyle = PALETTE.cocoa;
  ctx.fillRect(2, plank + 1, width - 4, 2);
  ctx.fillStyle = PALETTE.bark;
  ctx.fillRect(2, plank + 3, width - 4, 1);
  for (const bx of [8, width - 11]) {
    ctx.fillStyle = PALETTE.ink;
    ctx.fillRect(bx - 1, plank + 4, 5, 5);
    ctx.fillStyle = PALETTE.bark;
    ctx.fillRect(bx, plank + 5, 3, 1);
    ctx.fillRect(bx + 1, plank + 6, 2, 1);
    ctx.fillRect(bx + 2, plank + 7, 1, 1);
  }
  things.forEach((thing, i) => {
    const cx = CLOSEUP.spots[i];
    if (!thing) {
      // An empty spot: a faint ring on the plank.
      ctx.globalAlpha = 0.35;
      ctx.fillStyle = PALETTE.bark;
      ctx.fillRect(cx - 4, plank, 8, 1);
      ctx.globalAlpha = 1;
      return;
    }
    const rows = BIG_THINGS[thing.kind] ?? BIG_THINGS.egg;
    // How far down the picture its bottom-most pixel is, so it stands on
    // the plank.
    const bottom = rows.reduce((b, r, y) => (/[^.]/.test(r) ? y : b), 0);
    const bob = i === picked ? Math.round(Math.sin(timeMs / 260)) - 1 : 0;
    const x = cx - 8;
    const y = plank - bottom - 1 + bob;
    rows.forEach((row, dy) => {
      for (let dx = 0; dx < row.length; dx++) {
        const colour = bigColour(row[dx], thing.golden);
        if (!colour) continue;
        ctx.fillStyle = colour;
        ctx.fillRect(x + dx, y + dy, 1, 1);
      }
    });
    if (thing.golden) {
      // Two sparkles taking turns at its corners.
      const turn = Math.floor(timeMs / 400 + i) % 4;
      const at = turn < 2 ? [x + 15, y + 2] : [x, y + 6];
      if (turn % 2 === 0) {
        ctx.fillStyle = PALETTE.white;
        ctx.fillRect(at[0], at[1] - 1, 1, 3);
        ctx.fillRect(at[0] - 1, at[1], 3, 1);
      }
    }
    if (i === picked) {
      // A little arrow pointing down at it.
      const top = plank - 22 + Math.round(Math.sin(timeMs / 260));
      ctx.fillStyle = PALETTE.ink;
      ctx.fillRect(cx - 3, top - 1, 7, 1);
      ctx.fillRect(cx - 4, top, 9, 2);
      ctx.fillRect(cx - 3, top + 2, 7, 1);
      ctx.fillRect(cx - 2, top + 3, 5, 1);
      ctx.fillRect(cx - 1, top + 4, 3, 1);
      ctx.fillStyle = PALETTE.butter;
      ctx.fillRect(cx - 3, top, 7, 1);
      ctx.fillRect(cx - 2, top + 1, 5, 1);
      ctx.fillRect(cx - 1, top + 2, 3, 1);
      ctx.fillRect(cx, top + 3, 1, 1);
    }
  });
}
