// Draws the pet's little room onto the canvas. The canvas is tiny (64x48
// "real" pixels) and CSS scales it up with crisp, blocky pixels.

import { PALETTE } from './palette';
import { frameFor } from './animations';
import type { SpriteSheet } from './sprites';
import type { FishingPhase } from '../ui/fishing';
import { drawGardenBackground, drawGardenPots, type GardenScene } from './garden';

export const ROOM_WIDTH = 64;
export const ROOM_HEIGHT = 48;

// What the room should look like right now.
export interface Scene {
  animation: string; // which pet animation to play
  night: boolean; // night-time outside the window
  lightsOff: boolean; // the room is dark (pet is sleeping)
  fishing?: FishingPhase; // draws a little pond, rod and bobber while fishing
  garden?: GardenScene | null; // while gardening: the garden, with the pet on the left
}

export function setupCanvas(canvas: HTMLCanvasElement): CanvasRenderingContext2D {
  canvas.width = ROOM_WIDTH;
  canvas.height = ROOM_HEIGHT;
  const ctx = canvas.getContext('2d')!;
  ctx.imageSmoothingEnabled = false; // keep pixels sharp
  return ctx;
}

function drawWindow(ctx: CanvasRenderingContext2D, night: boolean, timeMs: number): void {
  const x = 6, y = 6, w = 14, h = 12;
  ctx.fillStyle = PALETTE.cocoa; // frame
  ctx.fillRect(x - 1, y - 1, w + 2, h + 2);
  ctx.fillStyle = night ? PALETTE.plum : PALETTE.sky; // sky
  ctx.fillRect(x, y, w, h);
  if (night) {
    // Moon and twinkling stars.
    // A crescent moon: a round blob with a bite taken out of its right side.
    ctx.fillStyle = PALETTE.butter;
    ctx.fillRect(x + 10, y + 1, 2, 1);
    ctx.fillRect(x + 9, y + 2, 2, 2);
    ctx.fillRect(x + 10, y + 4, 2, 1);
    const twinkle = Math.floor(timeMs / 700) % 2;
    ctx.fillStyle = PALETTE.white;
    ctx.fillRect(x + 2, y + 3 + twinkle, 1, 1);
    ctx.fillRect(x + 5, y + 8, 1, 1);
    ctx.fillRect(x + 11, y + 9 - twinkle, 1, 1);
  } else {
    // Sun and a little cloud.
    ctx.fillStyle = PALETTE.butter;
    ctx.fillRect(x + 9, y + 2, 3, 3);
    ctx.fillStyle = PALETTE.white;
    ctx.fillRect(x + 2, y + 7, 5, 2);
    ctx.fillRect(x + 3, y + 6, 2, 1);
  }
  ctx.fillStyle = PALETTE.cocoa; // cross bars
  ctx.fillRect(x + w / 2, y, 1, h);
  ctx.fillRect(x, y + h / 2, w, 1);
}

// While fishing, the pet holds a rod with the line running down out of
// the room into the pond below it (drawn in src/render/pond.ts). A "!"
// pops up when a fish bites, and the rod tip shakes while reeling in.
function drawFishing(ctx: CanvasRenderingContext2D, phase: FishingPhase, timeMs: number): void {
  const shake = phase === 'reeling' ? Math.floor(timeMs / 80) % 2 : 0;
  ctx.fillStyle = PALETTE.cocoa;
  for (let i = 0; i < 9; i++) ctx.fillRect(42 + i, 29 - i + (i > 5 ? shake : 0), 1, 1);
  if (phase === 'ready') return;
  // The line, from the rod tip straight down past the bottom of the room.
  const tipX = 51, tipY = 21 + shake;
  ctx.fillStyle = PALETTE.ink;
  ctx.fillRect(tipX, tipY, 1, ROOM_HEIGHT - tipY);
  if (phase === 'bite') {
    ctx.fillStyle = PALETTE.rose;
    ctx.fillRect(tipX + 4, tipY - 2, 2, 5);
    ctx.fillRect(tipX + 4, tipY + 4, 2, 2);
  }
}

// True if a point in room pixels (0-64 across, 0-48 down) is on or near the
// pet, which stands centred on the floor (see drawRoom below). Generous,
// so small fingers don't miss.
export function isOnPet(x: number, y: number): boolean {
  return x >= 12 && x <= ROOM_WIDTH - 12 && y >= 4 && y <= 44;
}

export function drawRoom(
  ctx: CanvasRenderingContext2D,
  sheet: SpriteSheet | undefined,
  scene: Scene,
  timeMs: number,
  hat?: SpriteSheet, // the hat's sheet, if the pet wears one
): void {
  if (scene.garden) {
    drawGardenBackground(ctx, ROOM_WIDTH, ROOM_HEIGHT, scene.night, timeMs);
  } else {
    // Wall and floor (the wall is a little bluer at night).
    ctx.fillStyle = scene.night ? PALETTE.lavender : PALETTE.cream;
    ctx.fillRect(0, 0, ROOM_WIDTH, ROOM_HEIGHT);
    ctx.fillStyle = PALETTE.peach;
    ctx.fillRect(0, 34, ROOM_WIDTH, ROOM_HEIGHT - 34);
    ctx.fillStyle = PALETTE.butter;
    ctx.fillRect(0, 34, ROOM_WIDTH, 1);
    drawWindow(ctx, scene.night, timeMs);
  }
  if (scene.fishing && scene.fishing !== 'off') drawFishing(ctx, scene.fishing, timeMs);

  // The pet, centred and standing on the floor (on the left in the garden,
  // to make room for the pots).
  if (sheet) {
    const { frameWidth: w, frameHeight: h } = sheet;
    const { sx, sy, headOffset } = frameFor(sheet, scene.animation, timeMs);
    const dx = scene.garden ? -2 : Math.floor((ROOM_WIDTH - w) / 2);
    const dy = 40 - h;
    ctx.drawImage(sheet.image, sx, sy, w, h, dx, dy, w, h);
    // The hat: its bottom middle sits on the head point, moved up or down
    // with the head. The left picture is the small size, the right the large.
    if (hat && sheet.head) {
      const { frameWidth: hw, frameHeight: hh } = hat;
      const col = sheet.head.size === 'large' ? 1 : 0;
      const hx = dx + sheet.head.x - Math.floor(hw / 2);
      const hy = dy + sheet.head.y + headOffset - hh;
      ctx.drawImage(hat.image, col * hw, 0, hw, hh, hx, hy, hw, hh);
    }
  } else {
    // The sprite is missing (or still loading): draw a little "?" box so
    // it's obvious something needs fixing in manifest.json.
    ctx.fillStyle = PALETTE.lilac;
    ctx.fillRect(26, 22, 12, 14);
    ctx.fillStyle = PALETTE.white;
    ctx.fillRect(30, 25, 4, 1);
    ctx.fillRect(33, 26, 1, 3);
    ctx.fillRect(31, 29, 2, 1);
    ctx.fillRect(31, 32, 2, 2);
  }

  if (scene.garden) drawGardenPots(ctx, scene.garden, timeMs);

  // Lights off: dim the whole room.
  if (scene.lightsOff) {
    ctx.fillStyle = PALETTE.ink;
    ctx.globalAlpha = 0.45;
    ctx.fillRect(0, 0, ROOM_WIDTH, ROOM_HEIGHT);
    ctx.globalAlpha = 1;
  }
}
