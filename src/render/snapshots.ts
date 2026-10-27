// The little moments on a journey that can be snapped for the travel
// journal (see src/game/snapshots.ts), drawn over the trip: the walk stops
// while one is on. `ms` is how long it's been on, `petX` the left edge of
// the first pet's 32-pixel frame. Each one plays out over about seven
// seconds and then holds still.

import { PALETTE } from './palette';
import { GROUND, paint, rect, type Sprite } from './places';
import { drawPercy } from './delivery';

const HEAD_Y = 12; // about where the top of a pet's head is

// A butterfly flutters round the pet's head, its wings flapping.
const BUTTERFLY_OPEN: Sprite = ['.kk.kk.', 'kppkppk', 'kpwkwpk', '.kvkvk.', '..k.k..'];
const BUTTERFLY_SHUT: Sprite = ['..kkk..', '..kpk..', '..kpk..', '..kvk..', '...k...'];
function butterfly(ctx: CanvasRenderingContext2D, ms: number, petX: number): void {
  const a = ms / 700;
  const x = Math.round(petX + 13 + Math.cos(a) * 17);
  const y = Math.round(HEAD_Y - 6 + Math.sin(a * 2) * 3);
  paint(ctx, Math.floor(ms / 140) % 2 ? BUTTERFLY_SHUT : BUTTERFLY_OPEN, x, y);
}

// A heart, over someone saying hello.
const HEART: Sprite = ['.kk.kk.', 'krrkrrk', 'krwrrrk', '.krrrk.', '..krk..', '...k...'];

// Percy hurries in from the left, stops beside the pets, waves hello (a
// heart over him) and hurries on.
function percy(ctx: CanvasRenderingContext2D, ms: number, w: number): void {
  const stop = 40;
  const x = ms < 2000 ? Math.round(-22 + (ms / 2000) * (stop + 22)) : ms < 5000 ? stop : Math.round(stop + ((ms - 5000) / 1500) * (w - stop + 2));
  drawPercy(ctx, x, 47, ms, ms < 2000 || ms >= 5000);
  if (ms >= 2000 && ms < 5000) paint(ctx, HEART, x + 7, 17 - (Math.floor(ms / 300) % 2));
}

// A big red mushroom by the path, and the pet stops to sniff it.
const BIG_MUSHROOM: Sprite = [
  '...kkkk...',
  '.kkrrwrkk.',
  'krrwrrrrrk',
  'krrrrrwrrk',
  'kxrrrrrrxk',
  '.kkkkkkkk.',
  '...kevk...',
  '...keek...',
  '..kkkkkk..',
];
function mushroom(ctx: CanvasRenderingContext2D, ms: number, petX: number): void {
  const x = petX + 33;
  paint(ctx, BIG_MUSHROOM, x, GROUND);
  // A sniff: little puffs by the pet's nose.
  const puff = Math.floor(ms / 350) % 4;
  if (puff < 3) rect(ctx, PALETTE.white, x - 2 - puff, GROUND + 2 - puff, 2, 1);
}

// A leaf drifts down, swaying, and lands on the pet's head like a hat.
const LEAF: Sprite = ['.kk.', 'kyok', 'koyk', '.kc.'];
function leaf(ctx: CanvasRenderingContext2D, ms: number, petX: number): void {
  const fall = Math.min(1, ms / 3500);
  const x = Math.round(petX + 14 + Math.sin(ms / 400) * 6 * (1 - fall));
  const y = Math.round(-4 + (HEAD_Y - 6 + 4) * fall);
  paint(ctx, LEAF, x, y);
}

// Fireflies come out and gather round the pet, blinking and glowing.
function fireflies(ctx: CanvasRenderingContext2D, ms: number, petX: number): void {
  const gather = Math.min(1, ms / 2500);
  for (let i = 0; i < 12; i++) {
    const a = (i / 12) * Math.PI * 2 + ms / 1800;
    const far = 40 - 20 * gather + (i % 3) * 3;
    const x = Math.round(petX + 16 + Math.cos(a) * far);
    const y = Math.round(22 + Math.sin(a) * far * 0.55);
    if (Math.sin(ms / 260 + i * 1.7) < -0.4) continue; // blinking
    ctx.save();
    ctx.globalAlpha = 0.45;
    rect(ctx, PALETTE.butter, x - 1, y, 3, 1);
    rect(ctx, PALETTE.butter, x, y - 1, 1, 3);
    ctx.restore();
    rect(ctx, PALETTE.white, x, y, 1, 1);
  }
}

// A squirrel scampers in from the right, stops to look at the pet (its
// tail flicking), then scampers off.
const SQUIRREL: Sprite = [
  '.......kkk.',
  '......kcook',
  '.kk...kccok',
  'kcck..kccck',
  'kkcckkccck.',
  'kcooocccck.',
  '.kooocccck.',
  '..kkkkkkk..',
];
const SQUIRREL_FLICK: Sprite = [
  '........kk.',
  '......kkcok',
  '.kk...kccok',
  'kcck..kccck',
  'kkcckkccck.',
  'kcooocccck.',
  '.kooocccck.',
  '..kkkkkkk..',
];
function squirrel(ctx: CanvasRenderingContext2D, ms: number, w: number): void {
  const stop = 50;
  const running = ms < 1200 || ms >= 5500;
  const x = ms < 1200 ? Math.round(w + 2 - (ms / 1200) * (w + 2 - stop)) : ms < 5500 ? stop : Math.round(stop + ((ms - 5500) / 900) * (w - stop + 4));
  const flick = !running && Math.floor(ms / 350) % 2 === 1;
  paint(ctx, flick ? SQUIRREL_FLICK : SQUIRREL, x, GROUND - 6 - (running ? Math.floor(ms / 120) % 2 : 0));
}

export function drawSnapMoment(ctx: CanvasRenderingContext2D, id: string, ms: number, petX: number, w: number): void {
  if (id === 'butterfly') butterfly(ctx, ms, petX);
  else if (id === 'percy') percy(ctx, ms, w);
  else if (id === 'mushroom') mushroom(ctx, ms, petX);
  else if (id === 'leaf') leaf(ctx, ms, petX);
  else if (id === 'fireflies') fireflies(ctx, ms, petX);
  else if (id === 'squirrel') squirrel(ctx, ms, w);
}

// The camera's flash, fading out over a third of a second.
export function drawFlash(ctx: CanvasRenderingContext2D, ms: number, w: number, h: number): void {
  if (ms < 0 || ms > 320) return;
  ctx.save();
  ctx.globalAlpha = 0.85 * (1 - ms / 320);
  rect(ctx, PALETTE.white, 0, 0, w, h);
  ctx.restore();
}
