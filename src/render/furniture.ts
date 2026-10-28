// Furniture in the room (see CONFIG.room.furniture and src/game/decor.ts).
// Each piece is a little picture drawn behind the pets, in one of five
// spots: two on the wall, the windowsill, and the left and right edge of
// the floor. The same pictures are the Shop's icons. While decorating,
// each spot gets a little frame (drawSpots).

import { PALETTE } from './palette';
import type { FurnitureSlot } from '../game/state';

// One letter a pixel, "." see-through.
export const FURNITURE_COLORS: Record<string, string> = {
  k: PALETTE.ink, w: PALETTE.white, e: PALETTE.cream,
  r: PALETTE.rose, p: PALETTE.pink, i: PALETTE.blush,
  g: PALETTE.leaf, m: PALETTE.mint, q: PALETTE.moss,
  b: PALETTE.ocean, s: PALETTE.sky, y: PALETTE.butter, o: PALETTE.peach,
  c: PALETTE.cocoa, d: PALETTE.bark, l: PALETTE.lilac, v: PALETTE.lavender, u: PALETTE.plum,
};

export const FURNITURE_ART: Record<string, string[]> = {
  // ---- Made at the workbench (see CONFIG.crafting.patterns) ----
  // Pink shells on a string across the wall.
  shellGarland: [
    'd...............d',
    '.dd...........dd.',
    '...ddd.....ddd...',
    '..pip.ddddd.pip..',
    '..ppp..pip..ppp..',
    '...p...ppp...p...',
    '........p........',
  ],
  // A driftwood plank with a shell and a sea glass bottle on it.
  driftwoodShelf: [
    '..........ss....',
    '..pp.....sms....',
    '.pipp....sms....',
    '.pppp....sss....',
    'dddddddddddddddd',
    'dvvcvvvvcvvvvcvd',
    'dddddddddddddddd',
    '..d..........d..',
  ],
  // A clay bowl of pebbles, for the windowsill.
  pebbleBowl: [
    '...vl....',
    '.lvuvlvu.',
    'kkkkkkkkk',
    'koooooook',
    '.kooocok.',
    '..kkkkk..',
  ],
  // A floor lamp with a sea glass shade.
  seaGlassLamp: [
    '...kkkk...',
    '..kswsmk..',
    '.ksmssmsk.',
    '.kmssmssk.',
    'kssmsssmsk',
    'kkkkkkkkkk',
    '....dd....',
    '....dd....',
    '....dd....',
    '....dd....',
    '....dd....',
    '....dd....',
    '....dd....',
    '....dd....',
    '...dccd...',
    '..dddddd..',
  ],
  // Stars hanging from a little wooden mobile.
  starMobile: [
    '.....d.....',
    '.....d.....',
    '.ddddddddd.',
    '.d...d...d.',
    '.d...d...d.',
    '.y...d...y.',
    'yyy..y..yyy',
    '.y..yyy..y.',
    '.....y.....',
  ],
  // A string of stars across the wall.
  garland: [
    'c...............c',
    '.cc...........cc.',
    '...ccc.....ccc...',
    '....y.ccccc.y....',
    '...yyy..y..yyy...',
    '....y..yyy..y....',
    '.......y.y.......',
  ],
  // A framed heart.
  portrait: [
    'kkkkkkkkkkk',
    'kyyyyyyyyyk',
    'kyvvvvvvvyk',
    'kyvppvppvyk',
    'kypppppppyk',
    'kyvpppppvyk',
    'kyvvpppvvyk',
    'kyvvvpvvvyk',
    'kyyyyyyyyyk',
    'kkkkkkkkkkk',
  ],
  // A little shelf with a cup and a potted sprout.
  shelf: [
    '.........kkk..',
    '...kk...kgmgk.',
    '..kwwk...kgk..',
    '..kwwkk.kpppk.',
    '..kwwk..kpppk.',
    '...kk....kkk..',
    'kkkkkkkkkkkkkk',
    'kcccccccccccck',
    '.kk........kk.',
  ],
  // A round cactus in a pink pot, for the windowsill.
  cactus: [
    '..kkk..',
    '.kgmgk.',
    'kgqgmgk',
    'kgmgqgk',
    '.kgggk.',
    'kkkkkkk',
    '.kpppk.',
    '.kpipk.',
    '..kkk..',
  ],
  // A candle on a little brass dish, for the windowsill.
  candle: [
    '..y..',
    '.yoy.',
    '.yoy.',
    '..k..',
    '.kkk.',
    '.kwk.',
    '.kwk.',
    '.kek.',
    'kkkkk',
    'kyyyk',
    '.kkk.',
  ],
  // The Meadow's frame and shelf, as icons only (the room draws them with
  // what's in them, see src/render/keepsakes.ts).
  keepsakeFrame: [
    '....k....',
    'ccccccccc',
    'ceeeeeeec',
    'ceemmmeec',
    'cemmmmmec',
    'cemkmkmec',
    'cemmmmmec',
    'ceemmmeec',
    'ceeeeeeec',
    'ccccccccc',
  ],
  keepsakeShelf: [
    '..rrr.....s.s..',
    '.rrwrr....sss..',
    '...e.....sssss.',
    '...e......sss..',
    'ccccccccccccccc',
    '..c.........c..',
  ],
  // A leafy plant in a pink pot.
  plant: [
    '...m.m...',
    '..mgm.m..',
    '.mgqgmgm.',
    'mggqgqggm',
    '.gqmgg.g.',
    '..g.qgg..',
    '....q....',
    '.kkkkkkk.',
    '.krrrrrk.',
    '..kpppk..',
    '..kpppk..',
    '...kkk...',
  ],
  // A tall lamp with a butter-yellow shade.
  lamp: [
    '..kkk..',
    '.kyyyk.',
    '.kyeyk.',
    'kyyyyyk',
    'kkkkkkk',
    '...d...',
    '...d...',
    '...d...',
    '...d...',
    '...d...',
    '...d...',
    '...d...',
    '...d...',
    '...d...',
    '...d...',
    '...d...',
    '..kdk..',
    '.kdddk.',
    '.kkkkk.',
  ],
  // A wooden toy box with a ball and a duck peeking out.
  toyBox: [
    '..kkk..kk...',
    '.kpwpk.kyk..',
    'kkkkkkkkkkkk',
    'kcccccccccck',
    'kcddddddddck',
    'kcccyyyyccck',
    'kcccccccccck',
    'kddddddddddk',
    'kkkkkkkkkkkk',
  ],
  // A bookshelf full of colourful books.
  bookshelf: [
    'kkkkkkkkkkk',
    'kccccccccck',
    'kcrbsdylgck',
    'kcrbsyylgck',
    'kcrbsyylgck',
    'kccccccccck',
    'kcdpvvodlck',
    'kcmpvvoulck',
    'kcmpvvoulck',
    'kccccccccck',
    'kcyydrrdsck',
    'kcyygrrbsck',
    'kcyygrrbsck',
    'kccccccccck',
    'kddddddddck',
    'kkkkkkkkkkk',
  ],
};

// Where each spot is in the room (64 x 48 pixels, the floor starts at 34),
// as the box a piece can fill: its left, top, right and bottom pixels.
// Wall pieces hang from the top of their box, in the middle; floor and
// sill pieces stand on its bottom, the floor ones at the outer edge. The
// sill is the window's bottom frame (see WINDOW in canvas.ts).
export const SPOT_BOX: Record<FurnitureSlot, { x0: number; y0: number; x1: number; y1: number }> = {
  wallMid: { x0: 27, y0: 3, x1: 37, y1: 15 },
  wall: { x0: 39, y0: 6, x1: 63, y1: 19 },
  sill: { x0: 8, y0: 7, x1: 18, y1: 17 },
  left: { x0: 1, y0: 20, x1: 16, y1: 39 },
  right: { x0: 47, y0: 20, x1: 62, y1: 39 },
};
const SPOT_LIST = Object.keys(SPOT_BOX) as FurnitureSlot[];

// Where a piece of this size goes in a spot (its top left pixel).
export function pieceAt(spot: FurnitureSlot, w: number, h: number): { x: number; y: number } {
  const b = SPOT_BOX[spot];
  const centre = Math.floor((b.x0 + b.x1 + 1) / 2);
  if (spot === 'wall' || spot === 'wallMid') return { x: centre - Math.floor(w / 2), y: b.y0 + 1 };
  if (spot === 'left') return { x: b.x0, y: b.y1 - h + 1 };
  if (spot === 'right') return { x: b.x1 - w + 1, y: b.y1 - h + 1 };
  return { x: centre - Math.floor(w / 2), y: b.y1 - h + 1 };
}

// The spot (if any) at a point in room pixels, for taps.
export function spotAt(x: number, y: number): FurnitureSlot | null {
  return SPOT_LIST.find((s) => {
    const b = SPOT_BOX[s];
    return x >= b.x0 - 1 && x <= b.x1 + 1 && y >= b.y0 - 1 && y <= b.y1 + 1;
  }) ?? null;
}

function drawArt(ctx: CanvasRenderingContext2D, rows: string[], x: number, y: number): void {
  rows.forEach((row, dy) => {
    [...row].forEach((ch, dx) => {
      const color = FURNITURE_COLORS[ch];
      if (!color) return;
      ctx.fillStyle = color;
      ctx.fillRect(x + dx, y + dy, 1, 1);
    });
  });
}

// The pieces in their spots. The keepsake frame and shelf are drawn with
// the keepsakes (src/render/keepsakes.ts).
export function drawFurniture(ctx: CanvasRenderingContext2D, furniture: Partial<Record<FurnitureSlot, string>>): void {
  for (const spot of SPOT_LIST) {
    const id = furniture[spot] ?? '';
    const rows = FURNITURE_ART[id];
    if (!rows || id.startsWith('keepsake')) continue;
    const at = pieceAt(spot, rows[0].length, rows.length);
    drawArt(ctx, rows, at.x, at.y);
  }
}

// Decorating: a frame round every spot, one pixel wide with its corners
// cut round. The others are dashed, ink and white, so they show on any
// wallpaper; the picked one is solid butter edged in ink, softly glowing
// inside. An empty spot gets a little plus where a piece would stand.
export function drawSpots(
  ctx: CanvasRenderingContext2D, furniture: Partial<Record<FurnitureSlot, string>>, picked: FurnitureSlot | null, timeMs: number,
): void {
  const px = (x: number, y: number, colour: string) => {
    ctx.fillStyle = colour;
    ctx.fillRect(x, y, 1, 1);
  };
  // The frame's pixels, clockwise from the top left, corners left out.
  const edge = (x0: number, y0: number, x1: number, y1: number): [number, number][] => {
    const out: [number, number][] = [];
    for (let x = x0 + 1; x < x1; x++) out.push([x, y0]);
    for (let y = y0 + 1; y < y1; y++) out.push([x1, y]);
    for (let x = x1 - 1; x > x0; x--) out.push([x, y1]);
    for (let y = y1 - 1; y > y0; y--) out.push([x0, y]);
    return out;
  };
  for (const spot of SPOT_LIST) {
    const { x0, y0, x1, y1 } = SPOT_BOX[spot];
    if (spot === picked) {
      ctx.globalAlpha = 0.3 + 0.12 * Math.sin(timeMs / 320);
      ctx.fillStyle = PALETTE.butter;
      ctx.fillRect(x0 + 1, y0 + 1, x1 - x0 - 1, y1 - y0 - 1);
      ctx.globalAlpha = 1;
      for (const [x, y] of edge(x0 - 1, y0 - 1, x1 + 1, y1 + 1)) px(x, y, PALETTE.ink);
      for (const [x, y] of edge(x0, y0, x1, y1)) px(x, y, PALETTE.butter);
      // The cut corners, filled in from inside so it reads round.
      for (const [x, y] of [[x0, y0], [x1, y0], [x0, y1], [x1, y1]]) px(x, y, PALETTE.ink);
    } else {
      edge(x0, y0, x1, y1).forEach(([x, y], i) => px(x, y, i % 4 < 2 ? PALETTE.ink : PALETTE.white));
    }
    if (!furniture[spot]) {
      // A plus, white with a dark edge, low down for floor and sill spots
      // (where a piece would stand), in the middle on the wall.
      const mx = Math.floor((x0 + x1) / 2);
      const wall = spot === 'wall' || spot === 'wallMid';
      const my = wall ? Math.floor((y0 + y1) / 2) : y1 - 4;
      for (const [x, y] of [[mx - 2, my], [mx + 2, my], [mx, my - 2], [mx, my + 2], [mx - 1, my - 1], [mx + 1, my - 1], [mx - 1, my + 1], [mx + 1, my + 1]]) {
        px(x, y, PALETTE.ink);
      }
      for (const [x, y] of [[mx, my], [mx - 1, my], [mx + 1, my], [mx, my - 1], [mx, my + 1]]) px(x, y, PALETTE.white);
    }
  }
}
