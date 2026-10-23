// Poop and bath time, drawn over the room (the rules are in
// src/game/hygiene.ts, the bath panel in src/ui/bath.ts): poops on the
// floor beside a pet, wavy green lines rising off a smelly one, and during
// a bath the foam, the sponge or dryer under your finger, drips while it's
// wet and sparkles once it's dry.

import { PALETTE } from './palette';
import type { SpriteSheet } from './sprites';

// Where a pet's poops go, from the left edge of its 32-pixel frame: beside
// its feet, left and right, then in front. `y` is the poop's bottom row.
export const POOP_SPOTS = [
  { dx: 1, y: 42 },
  { dx: 24, y: 42 },
  { dx: 12, y: 46 },
] as const;
const POOP_W = 7;
const POOP_H = 5;

// What's going on with one pet: which spots have a poop, and whether it's
// smelly (the lines rising off it).
export interface PetMess {
  poops: number[];
  smelly: boolean;
}

// The bath, while its panel is open. Times are animation-frame times.
export interface BathScene {
  foam: { x: number; y: number }[]; // where the sponge has made suds
  wet: number; // 0 (dry) to 1 (dripping)
  tool: 'sponge' | 'dryer' | null; // the one picked in the panel
  pointer: { x: number; y: number; down: boolean } | null; // in room pixels
  sparkleFrom: number; // when it got dry (0 = not yet), for the sparkles
}

// Which of a pet's poops (if any) is at room point (x, y), for a pet whose
// frame starts at `left`. A little bigger than the poop itself, for fingers.
export function poopAt(x: number, y: number, left: number, poops: number[]): number {
  for (const slot of poops) {
    const spot = POOP_SPOTS[slot];
    if (!spot) continue;
    const px = left + spot.dx;
    if (x >= px - 3 && x <= px + POOP_W + 3 && y >= spot.y - POOP_H - 3 && y <= spot.y + 3) return slot;
  }
  return -1;
}

// A pet's body in room pixels, for a pet whose frame starts at `left`: the
// part the sponge and dryer work on. Roughly the middle of its frame,
// from its head down to the floor.
export function bodyBox(sheet: SpriteSheet | undefined, left: number): { x0: number; x1: number; y0: number; y1: number } {
  const w = sheet?.frameWidth ?? 32;
  const h = sheet?.frameHeight ?? 32;
  const top = 40 - h + (sheet?.head?.y ?? 6);
  return { x0: left + 4, x1: left + w - 4, y0: Math.max(0, top - 2), y1: 41 };
}

// One poop: a little swirl with a shine on it.
function drawPoop(ctx: CanvasRenderingContext2D, x: number, bottom: number): void {
  const y = bottom - POOP_H;
  ctx.fillStyle = PALETTE.bark;
  ctx.fillRect(x + 3, y, 1, 1);
  ctx.fillRect(x + 2, y + 1, 3, 1);
  ctx.fillRect(x + 1, y + 2, 5, 1);
  ctx.fillRect(x, y + 3, 7, 1);
  ctx.fillRect(x + 1, y + 4, 5, 1);
  ctx.fillStyle = PALETTE.cocoa;
  ctx.fillRect(x + 3, y + 1, 1, 1);
  ctx.fillRect(x + 2, y + 2, 3, 1);
  ctx.fillRect(x + 1, y + 3, 5, 1);
  ctx.fillStyle = PALETTE.peach; // shine
  ctx.fillRect(x + 2, y + 3, 1, 1);
}

// Three wavy green lines drifting up off the pet's head and fading out:
// one either side of it and one over the middle.
function drawStink(ctx: CanvasRenderingContext2D, box: ReturnType<typeof bodyBox>, timeMs: number): void {
  const cols = [box.x0 - 1, Math.round((box.x0 + box.x1) / 2), box.x1];
  cols.forEach((cx, i) => {
    const t = (timeMs / 2000 + i / 3) % 1;
    const base = box.y0 + 6 - Math.round(t * 8);
    ctx.globalAlpha = t < 0.15 ? t / 0.15 : t > 0.6 ? 1 - (t - 0.6) / 0.4 : 1;
    // An S-shaped squiggle, 7 pixels tall, with a darker edge.
    for (let k = 0; k < 7; k++) {
      const wiggle = [0, 1, 1, 0, -1, -1, 0][(k + Math.floor(timeMs / 220) + i) % 7];
      ctx.fillStyle = PALETTE.moss;
      ctx.fillRect(cx + wiggle + 1, base - k, 1, 1);
      ctx.fillStyle = PALETTE.leaf;
      ctx.fillRect(cx + wiggle, base - k, 1, 1);
    }
  });
  ctx.globalAlpha = 1;
}

// Draws one pet's poops and smell. `left` is its frame's left edge.
export function drawMess(
  ctx: CanvasRenderingContext2D,
  mess: PetMess,
  sheet: SpriteSheet | undefined,
  left: number,
  timeMs: number,
): void {
  if (mess.smelly) drawStink(ctx, bodyBox(sheet, left), timeMs);
  for (const slot of mess.poops) {
    const spot = POOP_SPOTS[slot];
    if (spot) drawPoop(ctx, left + spot.dx, spot.y);
  }
}

// A soap bubble: a white blob with a lilac edge on its lower side.
function drawBubble(ctx: CanvasRenderingContext2D, x: number, y: number, big: boolean): void {
  ctx.fillStyle = PALETTE.white;
  if (big) {
    ctx.fillRect(x - 1, y - 1, 3, 3);
    ctx.fillStyle = PALETTE.lavender;
    ctx.fillRect(x - 1, y + 1, 3, 1);
    ctx.fillRect(x + 1, y - 1, 1, 2);
    ctx.fillStyle = PALETTE.white;
    ctx.fillRect(x - 1, y - 1, 1, 1);
  } else {
    ctx.fillRect(x, y, 2, 2);
    ctx.fillStyle = PALETTE.lavender;
    ctx.fillRect(x + 1, y + 1, 1, 1);
  }
}

// The sponge: a butter-yellow block with holes.
function drawSponge(ctx: CanvasRenderingContext2D, cx: number, cy: number): void {
  const x = cx - 3, y = cy - 2;
  ctx.fillStyle = PALETTE.ink;
  ctx.fillRect(x, y, 7, 5);
  ctx.fillStyle = PALETTE.butter;
  ctx.fillRect(x + 1, y + 1, 5, 3);
  ctx.fillStyle = PALETTE.peach;
  ctx.fillRect(x + 2, y + 2, 1, 1);
  ctx.fillRect(x + 4, y + 1, 1, 1);
  ctx.fillRect(x + 5, y + 3, 1, 1);
}

// The dryer: a pink hair dryer pointing left, with a handle.
function drawDryer(ctx: CanvasRenderingContext2D, cx: number, cy: number): void {
  const x = cx - 3, y = cy - 2;
  ctx.fillStyle = PALETTE.ink;
  ctx.fillRect(x, y, 8, 5);
  ctx.fillRect(x + 4, y + 5, 3, 3);
  ctx.fillStyle = PALETTE.pink;
  ctx.fillRect(x + 2, y + 1, 5, 3);
  ctx.fillRect(x + 5, y + 5, 1, 2);
  ctx.fillStyle = PALETTE.white;
  ctx.fillRect(x + 3, y + 1, 1, 1);
  ctx.fillStyle = PALETTE.cream;
  ctx.fillRect(x + 1, y + 1, 1, 3); // the nozzle
}

// Warm air blowing out of the dryer's nozzle, to the left.
function drawAir(ctx: CanvasRenderingContext2D, cx: number, cy: number, timeMs: number): void {
  ctx.fillStyle = PALETTE.white;
  for (let i = 0; i < 3; i++) {
    const t = (timeMs / 400 + i / 3) % 1;
    ctx.globalAlpha = 1 - t;
    ctx.fillRect(cx - 6 - Math.round(t * 6), cy - 2 + i * 2, 2, 1);
  }
  ctx.globalAlpha = 1;
}

// Drops running down a wet pet, and a puddle under it. Fewer as it dries.
const DRIPS = [0.15, 0.4, 0.62, 0.85];
const BEADS = [[0.2, 0.3], [0.7, 0.25], [0.45, 0.55], [0.12, 0.65], [0.82, 0.6], [0.55, 0.2], [0.32, 0.8]];
function drawWet(ctx: CanvasRenderingContext2D, box: ReturnType<typeof bodyBox>, wet: number, timeMs: number): void {
  const w = box.x1 - box.x0;
  // The puddle shrinks as it dries.
  const puddle = Math.round(w * wet);
  if (puddle > 1) {
    const px = Math.round((box.x0 + box.x1 - puddle) / 2);
    ctx.fillStyle = PALETTE.sky;
    ctx.fillRect(px, 40, puddle, 1);
    ctx.fillRect(px + 2, 41, Math.max(0, puddle - 4), 1);
    ctx.fillStyle = PALETTE.white;
    ctx.fillRect(px + 2, 40, 1, 1);
  }
  // Beads of water sitting on it.
  const beads = Math.ceil(BEADS.length * wet);
  for (let i = 0; i < beads; i++) {
    const [fx, fy] = BEADS[i];
    const x = Math.round(box.x0 + w * fx);
    const y = Math.round(box.y0 + (box.y1 - box.y0) * fy);
    ctx.fillStyle = PALETTE.ocean;
    ctx.fillRect(x, y + 1, 2, 1);
    ctx.fillStyle = PALETTE.sky;
    ctx.fillRect(x, y, 2, 1);
    ctx.fillStyle = PALETTE.white;
    ctx.fillRect(x, y, 1, 1);
  }
  const drops = Math.ceil(DRIPS.length * wet);
  for (let i = 0; i < drops; i++) {
    const x = Math.round(box.x0 + w * DRIPS[i]);
    const t = (timeMs / 1100 + i * 0.37) % 1;
    const top = box.y0 + 6;
    const y = Math.round(top + (box.y1 - 1 - top) * t);
    ctx.fillStyle = PALETTE.ocean;
    ctx.fillRect(x, y + 1, 1, 1);
    ctx.fillStyle = PALETTE.sky;
    ctx.fillRect(x, y, 1, 1);
  }
}

// Little stars popping around the pet once it's clean and dry.
const SPARKLES = [[0.1, 0.3], [0.9, 0.2], [0.5, 0.05], [0.2, 0.75], [0.85, 0.7]];
export const SPARKLE_MS = 1400;
function drawSparkles(ctx: CanvasRenderingContext2D, box: ReturnType<typeof bodyBox>, t: number): void {
  SPARKLES.forEach(([fx, fy], i) => {
    const local = t * SPARKLES.length * 0.6 - i * 0.5;
    if (local < 0 || local > 1) return;
    const x = Math.round(box.x0 + (box.x1 - box.x0) * fx);
    const y = Math.round(box.y0 + (box.y1 - box.y0) * fy);
    ctx.fillStyle = local < 0.5 ? PALETTE.white : PALETTE.butter;
    ctx.fillRect(x, y - 1, 1, 3);
    ctx.fillRect(x - 1, y, 3, 1);
  });
}

// The bath over a pet whose frame starts at `left`.
export function drawBath(
  ctx: CanvasRenderingContext2D,
  bath: BathScene,
  sheet: SpriteSheet | undefined,
  left: number,
  timeMs: number,
): void {
  const box = bodyBox(sheet, left);
  if (bath.wet > 0) drawWet(ctx, box, bath.wet, timeMs);
  // The suds pop away as it gets wet... and stay while you're still rubbing.
  const foamLeft = bath.wet > 0 ? 0 : bath.foam.length;
  for (let i = 0; i < foamLeft; i++) {
    const b = bath.foam[i];
    drawBubble(ctx, b.x, b.y, i % 3 === 0);
  }
  if (bath.sparkleFrom) {
    const t = (timeMs - bath.sparkleFrom) / SPARKLE_MS;
    if (t >= 0 && t <= 1) drawSparkles(ctx, box, t);
  }
  const p = bath.pointer;
  if (!p || !bath.tool) return;
  if (bath.tool === 'sponge') drawSponge(ctx, p.x, p.y);
  else {
    if (p.down) drawAir(ctx, p.x, p.y, timeMs);
    drawDryer(ctx, p.x, p.y);
  }
}
