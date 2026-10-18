// The garden scene in the room. While you garden, the room becomes a little
// garden: sky, a picket fence and grass, with the pet on the left and the
// pots side by side on the right (three, or four once you buy another). The pot you picked has a small
// arrow over it, and a dry pot has a blinking water drop.

import { PALETTE } from './palette';

// What the room needs to know about each pot (worked out from the game
// state in main.ts, so this file only draws).
export interface GardenPotView {
  stage: 'empty' | 'growing' | 'sick' | 'ready' | 'dead';
  crop: string | null;
  grown: number; // 0-1, how far along it is
  dry: boolean;
}

export interface GardenScene {
  pots: GardenPotView[];
  selected: number;
}

// Where each pot stands: its middle, in room pixels. Four pots stand a
// little closer together.
const POT_X: Record<number, number[]> = { 3: [35, 46, 57], 4: [30, 39, 48, 57] };
const potXs = (count: number) => POT_X[count] ?? POT_X[3];
const POT_TOP = 40; // the rim; the plant stands on it
const POT_W = 8;

// Little sprites from text grids: "." is see-through, other letters are
// palette colours. Plants are drawn standing on the pot's rim.
type Sprite = string[];
const COLORS: Record<string, string> = {
  k: PALETTE.ink,
  g: PALETTE.leaf,
  m: PALETTE.mint,
  o: PALETTE.peach,
  r: PALETTE.rose,
  p: PALETTE.pink,
  c: PALETTE.cocoa,
  y: PALETTE.butter,
  w: PALETTE.white,
  s: PALETTE.sky,
  b: PALETTE.ocean,
};

const POT: Sprite = ['oooooooo', 'cccccccc', '.cccccc.', '.cccccc.', '..cccc..'];
const SPROUT: Sprite = ['.g....g.', '.gg..gg.', '..gmmg..', '...gg...', '...gg...'];
const GROWING: Sprite = ['...gg...', '..gmmg..', 'g..gg..g', 'gm.gg.mg', '.gggggg.', '...gg...', '.g.gg.g.', '..gggg..'];
const READY: Record<string, Sprite> = {
  carrot: ['.g.g.g..', '..ggg...', '.gmgmg..', '..ggg...', '.ooooo..', '.ocooo..'],
  pumpkin: ['....g...', '...gc...', '.oooooo.', 'oocoocoo', 'oocoocoo', '.oooooo.'],
  dragonFruit: ['...pp...', '..pgpp..', '..pppp..', 'g..gg..g', 'gg.gg.gg', '.gggggg.', '...gg...', '...gg...'],
};
const SICK: Sprite = ['...cy...', '..c.c...', '.c..cc..', 'c...c.c.', '....c..c', '...cc...'];
const DEAD: Sprite = ['.c....c.', '..c..c..', '...cc...', '.cccccc.'];
const ARROW: Sprite = ['wwwww', '.www.', '..w..'];
const DROP: Sprite = ['.s.', 'sbs', '.s.'];

// Draws a sprite. With `outline`, it first gets a one-pixel ink outline
// (like the pet has), so green plants stand out against the grass.
function draw(ctx: CanvasRenderingContext2D, sprite: Sprite, x: number, y: number, outline = false): void {
  const paint = (ox: number, oy: number, solid?: string) =>
    sprite.forEach((row, sy) => {
      for (let sx = 0; sx < row.length; sx++) {
        const color = COLORS[row[sx]];
        if (!color) continue;
        ctx.fillStyle = solid ?? color;
        ctx.fillRect(Math.round(x) + sx + ox, Math.round(y) + sy + oy, 1, 1);
      }
    });
  if (outline) for (const [ox, oy] of [[-1, 0], [1, 0], [0, -1], [0, 1]]) paint(ox, oy, PALETTE.ink);
  paint(0, 0);
}

function plantSprite(pot: GardenPotView): Sprite | null {
  if (pot.stage === 'empty') return null;
  if (pot.stage === 'dead') return DEAD;
  if (pot.stage === 'sick') return SICK;
  if (pot.stage === 'ready') return READY[pot.crop ?? ''] ?? GROWING;
  return pot.grown < 0.4 ? SPROUT : GROWING;
}

// The garden behind the pet: sky, fence and grass.
export function drawGardenBackground(
  ctx: CanvasRenderingContext2D,
  width: number,
  height: number,
  night: boolean,
  timeMs: number,
): void {
  ctx.fillStyle = night ? PALETTE.plum : PALETTE.sky;
  ctx.fillRect(0, 0, width, height);
  if (night) {
    ctx.fillStyle = PALETTE.butter;
    ctx.fillRect(52, 4, 3, 1);
    ctx.fillRect(51, 5, 3, 2);
    ctx.fillRect(52, 7, 3, 1);
    const twinkle = Math.floor(timeMs / 700) % 2;
    ctx.fillStyle = PALETTE.white;
    ctx.fillRect(8, 5 + twinkle, 1, 1);
    ctx.fillRect(30, 3, 1, 1);
    ctx.fillRect(42, 9 - twinkle, 1, 1);
  } else {
    // The sun and a slow cloud.
    ctx.fillStyle = PALETTE.butter;
    ctx.fillRect(52, 3, 5, 5);
    const drift = Math.floor(timeMs / 1500) % (width + 12);
    ctx.fillStyle = PALETTE.white;
    const cx = drift - 12;
    ctx.fillRect(cx, 8, 9, 2);
    ctx.fillRect(cx + 2, 7, 4, 1);
  }
  // The picket fence.
  const fenceTop = 20;
  ctx.fillStyle = night ? PALETTE.lavender : PALETTE.cream;
  ctx.fillRect(0, fenceTop + 3, width, 1);
  ctx.fillRect(0, fenceTop + 7, width, 1);
  for (let x = 1; x < width; x += 4) {
    ctx.fillRect(x, fenceTop + 1, 2, 10);
    ctx.fillRect(x, fenceTop, 1, 1);
  }
  // Grass, with a lighter strip along the top and a few tufts.
  const grassTop = 30;
  ctx.fillStyle = PALETTE.leaf;
  ctx.fillRect(0, grassTop, width, height - grassTop);
  ctx.fillStyle = PALETTE.mint;
  ctx.fillRect(0, grassTop, width, 1);
  for (const [x, y] of [[4, 36], [22, 44], [33, 33], [12, 41], [61, 46], [45, 46]]) {
    ctx.fillRect(x, y, 1, 1);
    ctx.fillRect(x + 2, y, 1, 1);
    ctx.fillRect(x + 1, y - 1, 1, 1);
  }
}

// The pots, their plants, and the markers.
export function drawGardenPots(ctx: CanvasRenderingContext2D, scene: GardenScene, timeMs: number): void {
  const bob = Math.floor(timeMs / 400) % 2;
  const xs = potXs(scene.pots.length);
  scene.pots.forEach((pot, i) => {
    const left = xs[i] - POT_W / 2;
    const plant = plantSprite(pot);
    if (plant) {
      // Ready plants hop a little, to say "pick me".
      const hop = pot.stage === 'ready' ? bob : 0;
      draw(ctx, plant, left, POT_TOP - plant.length - hop, true);
    }
    draw(ctx, POT, left, POT_TOP, true);
    const top = POT_TOP - (plant?.length ?? 0) - 2;
    if (pot.dry && Math.floor(timeMs / 600) % 2 === 0) draw(ctx, DROP, left + 6, top - 4, true);
    if (i === scene.selected) draw(ctx, ARROW, left + 1, top - 4 - bob, true);
  });
}

// Which of `count` pots a point in room pixels is on, or -1. Generous, so
// small fingers don't miss.
export function potAt(x: number, y: number, count: number): number {
  if (y < 22 || y > 47) return -1;
  const xs = potXs(count);
  const reach = count > 3 ? 4 : 5;
  return xs.findIndex((cx) => Math.abs(x - cx) <= reach);
}
