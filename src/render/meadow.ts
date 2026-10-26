// The Meadow scene (Menu > Meadow): a wide, sunny field where your pets
// who moved out spend their days. Up to four are out at once, each in its
// own spot: napping under the tree, up on the hill, in the flowers and by
// the pond. Tap one to say hi, and hearts float up over it.
//
// It's drawn on its own canvas, wider and taller than the room (see
// MEADOW_WIDTH), with the same pixels.

import { PALETTE } from './palette';
import { drawHearts, drawPetStanding, type OtherPet } from './canvas';

export const MEADOW_WIDTH = 96;
export const MEADOW_HEIGHT = 64;

export type MeadowSpot = 'tree' | 'hill' | 'pond' | 'flowers';

// Where each spot is (the left edge of a pet's 32-pixel frame, and where
// its feet are), and what a pet does there. Drawn back to front.
export const MEADOW_SPOTS: Record<MeadowSpot, { x: number; floor: number; animation: string }> = {
  hill: { x: 34, floor: 38, animation: 'cheerful' },
  tree: { x: 2, floor: 46, animation: 'sleep' },
  pond: { x: 62, floor: 50, animation: 'idle' },
  flowers: { x: 24, floor: 62, animation: 'idle' },
};
// The order pets fill the spots in.
export const SPOT_ORDER: MeadowSpot[] = ['hill', 'flowers', 'pond', 'tree'];

export interface MeadowPetView extends OtherPet {
  id: string;
  spot: MeadowSpot;
  hearts: boolean; // you just said hi
}

const GRASS_TOP = 30;

function drawSky(ctx: CanvasRenderingContext2D, night: boolean, timeMs: number): void {
  ctx.fillStyle = night ? PALETTE.plum : PALETTE.sky;
  ctx.fillRect(0, 0, MEADOW_WIDTH, GRASS_TOP);
  if (night) {
    ctx.fillStyle = PALETTE.butter;
    ctx.fillRect(80, 4, 3, 1);
    ctx.fillRect(79, 5, 3, 2);
    ctx.fillRect(80, 7, 3, 1);
    const twinkle = Math.floor(timeMs / 700) % 2;
    ctx.fillStyle = PALETTE.white;
    for (const [x, y] of [[12, 4], [40, 9], [58, 3], [70, 11]]) ctx.fillRect(x, y + (x % 2 ? twinkle : 0), 1, 1);
  } else {
    ctx.fillStyle = PALETTE.butter;
    ctx.fillRect(80, 3, 6, 6);
    const drift = Math.floor(timeMs / 1600) % (MEADOW_WIDTH + 14);
    ctx.fillStyle = PALETTE.white;
    ctx.fillRect(drift - 14, 9, 10, 2);
    ctx.fillRect(drift - 12, 8, 5, 1);
  }
}

// Soft rolling hills, then the grass. The middle hill rises a little
// higher, for the pet up on top.
function drawGround(ctx: CanvasRenderingContext2D, night: boolean): void {
  ctx.fillStyle = night ? PALETTE.lilac : PALETTE.mint;
  for (let x = 0; x < MEADOW_WIDTH; x++) {
    const far = Math.round(5 + 3 * Math.sin((x + 4) / 10));
    ctx.fillRect(x, GRASS_TOP - far, 1, far);
  }
  ctx.fillStyle = PALETTE.leaf;
  ctx.fillRect(0, GRASS_TOP, MEADOW_WIDTH, MEADOW_HEIGHT - GRASS_TOP);
  // The hill in the middle.
  for (let x = 30; x < 72; x++) {
    const h = Math.round(9 * Math.sin(((x - 30) / 42) * Math.PI));
    ctx.fillStyle = PALETTE.leaf;
    ctx.fillRect(x, 38 - h, 1, h);
    ctx.fillStyle = PALETTE.mint;
    ctx.fillRect(x, 38 - h, 1, 1);
  }
  ctx.fillStyle = PALETTE.mint;
  ctx.fillRect(0, GRASS_TOP, 30, 1);
  ctx.fillRect(72, GRASS_TOP, MEADOW_WIDTH - 72, 1);
  for (const [x, y] of [[6, 52], [18, 40], [76, 36], [90, 44], [52, 58], [86, 60]]) {
    ctx.fillRect(x, y, 1, 1);
    ctx.fillRect(x + 2, y, 1, 1);
    ctx.fillRect(x + 1, y - 1, 1, 1);
  }
}

// The big tree on the left, its shade for napping in.
function drawTree(ctx: CanvasRenderingContext2D): void {
  ctx.fillStyle = PALETTE.cocoa;
  ctx.fillRect(12, 16, 4, 26);
  ctx.fillRect(10, 40, 8, 2);
  ctx.fillStyle = PALETTE.moss;
  ctx.fillRect(2, 6, 24, 12);
  ctx.fillRect(5, 3, 18, 3);
  ctx.fillRect(4, 18, 20, 2);
  ctx.fillStyle = PALETTE.leaf;
  ctx.fillRect(4, 5, 10, 6);
  ctx.fillRect(15, 7, 8, 5);
  ctx.fillRect(7, 12, 12, 4);
  // A few blossoms.
  ctx.fillStyle = PALETTE.pink;
  for (const [x, y] of [[6, 8], [18, 9], [11, 14], [21, 15]]) ctx.fillRect(x, y, 1, 1);
}

// The pond in the bottom right corner, with a lily pad.
function drawPond(ctx: CanvasRenderingContext2D, timeMs: number): void {
  const rows: [number, number][] = [[74, 92], [70, 95], [68, 96], [68, 96], [70, 96], [74, 94]];
  rows.forEach(([a, b], i) => {
    ctx.fillStyle = i === 0 ? PALETTE.sky : PALETTE.ocean;
    ctx.fillRect(a, 50 + i, b - a, 1);
  });
  ctx.fillStyle = PALETTE.sky;
  const shimmer = Math.floor(timeMs / 600) % 3;
  ctx.fillRect(76 + shimmer * 4, 52, 3, 1);
  ctx.fillRect(84 - shimmer * 2, 54, 2, 1);
  ctx.fillStyle = PALETTE.leaf;
  ctx.fillRect(88, 52, 3, 2);
  ctx.fillStyle = PALETTE.pink;
  ctx.fillRect(89, 51, 1, 1);
}

// Flowers along the bottom, nodding in the breeze.
function drawFlowers(ctx: CanvasRenderingContext2D, timeMs: number): void {
  const sway = Math.floor(timeMs / 900) % 2;
  const colours = [PALETTE.pink, PALETTE.butter, PALETTE.white, PALETTE.lilac];
  [[4, 58], [12, 61], [20, 56], [58, 61], [64, 57], [36, 60], [48, 62], [8, 46], [26, 44]].forEach(([x, y], i) => {
    ctx.fillStyle = PALETTE.moss;
    ctx.fillRect(x, y, 1, 2);
    ctx.fillStyle = colours[i % colours.length];
    const dx = i % 2 ? sway : 0;
    ctx.fillRect(x - 1 + dx, y - 1, 3, 1);
    ctx.fillRect(x + dx, y - 2, 1, 3);
    ctx.fillStyle = PALETTE.butter;
    ctx.fillRect(x + dx, y - 1, 1, 1);
  });
}

export function drawMeadow(ctx: CanvasRenderingContext2D, pets: MeadowPetView[], night: boolean, timeMs: number): void {
  drawSky(ctx, night, timeMs);
  drawGround(ctx, night);
  drawTree(ctx);
  drawPond(ctx, timeMs);
  drawFlowers(ctx, timeMs);
  const order = Object.keys(MEADOW_SPOTS) as MeadowSpot[];
  for (const spot of order) {
    const p = pets.find((x) => x.spot === spot);
    if (!p) continue;
    const at = MEADOW_SPOTS[spot];
    drawPetStanding(ctx, p, at.x, at.floor, timeMs);
    if (p.hearts) drawHearts(ctx, timeMs, at.x + 15, at.floor - 18);
  }
  if (night) {
    ctx.fillStyle = PALETTE.ink;
    ctx.globalAlpha = 0.25;
    ctx.fillRect(0, 0, MEADOW_WIDTH, MEADOW_HEIGHT);
    ctx.globalAlpha = 1;
  }
}

// Which pet a point on the canvas (in meadow pixels) is on, or null.
// Front spots win where two overlap.
export function meadowPetAt(pets: MeadowPetView[], x: number, y: number): string | null {
  const order = (Object.keys(MEADOW_SPOTS) as MeadowSpot[]).reverse();
  for (const spot of order) {
    const p = pets.find((v) => v.spot === spot);
    if (!p) continue;
    const at = MEADOW_SPOTS[spot];
    if (x >= at.x + 4 && x <= at.x + 28 && y >= at.floor - 26 && y <= at.floor + 1) return p.id;
  }
  return null;
}
