// Furniture in the room (see CONFIG.room.furniture and src/game/decor.ts).
// Each piece is a little picture drawn behind the pets: wall pieces hang
// to the right of the window, floor pieces stand at the left or right edge
// of the floor. The same pictures are the Shop's icons.

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

// Where each spot is in the room (64 x 48 pixels, the floor starts at 34):
// the wall spot's centre and top, and the floor spots' outer edge. Floor
// pieces stand on `FLOOR_Y`, the row the pets' feet are on.
const WALL = { centre: 51, top: 8 };
const FLOOR_Y = 39;

export function drawFurniture(ctx: CanvasRenderingContext2D, furniture: Partial<Record<FurnitureSlot, string>>): void {
  for (const slot of ['wall', 'left', 'right'] as FurnitureSlot[]) {
    const rows = FURNITURE_ART[furniture[slot] ?? ''];
    if (!rows) continue;
    const w = rows[0].length;
    const h = rows.length;
    const x = slot === 'wall' ? WALL.centre - Math.floor(w / 2) : slot === 'left' ? 1 : 63 - w;
    const y = slot === 'wall' ? WALL.top : FLOOR_Y - h + 1;
    rows.forEach((row, dy) => {
      [...row].forEach((ch, dx) => {
        const color = FURNITURE_COLORS[ch];
        if (!color) return;
        ctx.fillStyle = color;
        ctx.fillRect(x + dx, y + dy, 1, 1);
      });
    });
  }
}
