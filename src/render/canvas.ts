// Draws the pet's little room onto the canvas. The canvas is tiny (64x48
// "real" pixels) and CSS scales it up with crisp, blocky pixels.

import { PALETTE } from './palette';
import { frameFor } from './animations';
import type { SpriteSheet } from './sprites';
import type { FishingPhase } from '../ui/fishing';

export const ROOM_WIDTH = 64;
export const ROOM_HEIGHT = 48;

// What the room should look like right now.
export interface Scene {
  animation: string; // which pet animation to play
  night: boolean; // night-time outside the window
  lightsOff: boolean; // the room is dark (pet is sleeping)
  fishing?: FishingPhase; // draws a little pond, rod and bobber while fishing
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

// The fishing pond on the right of the floor, with the rod and line once
// it's cast. The bobber bobs gently while waiting, and dips with a splash
// and a "!" when a fish bites.
function drawFishing(ctx: CanvasRenderingContext2D, phase: FishingPhase, timeMs: number): void {
  // Pond: a rounded blue puddle with a lighter ripple.
  ctx.fillStyle = PALETTE.ocean;
  ctx.fillRect(48, 38, 14, 8);
  ctx.fillRect(47, 39, 16, 6);
  ctx.fillStyle = PALETTE.sky;
  ctx.fillRect(50, 40, 3, 1);
  ctx.fillRect(57, 43, 3, 1);
  if (phase === 'ready') return;

  // Rod held at the pet's side, then the line down to the bobber.
  ctx.fillStyle = PALETTE.cocoa;
  for (let i = 0; i < 7; i++) ctx.fillRect(42 + i, 29 - i, 1, 1);
  const bite = phase === 'bite';
  const reeling = phase === 'reeling';
  const bob = bite || reeling ? 1 : Math.floor(timeMs / 500) % 2;
  const bx = 55, by = 40 + bob;
  ctx.fillStyle = PALETTE.ink;
  const tipX = 48, tipY = 23;
  const steps = by - tipY;
  for (let i = 0; i < steps; i++) {
    ctx.fillRect(Math.round(tipX + ((bx - tipX) * i) / steps), tipY + i, 1, 1);
  }
  // Bobber: red top, white bottom.
  ctx.fillStyle = PALETTE.rose;
  ctx.fillRect(bx, by, 2, 1);
  ctx.fillStyle = PALETTE.white;
  ctx.fillRect(bx, by + 1, 2, 1);
  if (bite || reeling) {
    // Splash drops either side.
    const flick = Math.floor(timeMs / 150) % 2;
    ctx.fillStyle = PALETTE.white;
    ctx.fillRect(bx - 2, by - 1 - flick, 1, 1);
    ctx.fillRect(bx + 3, by - 2 + flick, 1, 1);
  }
  if (bite) {
    // A big "!" above the bobber.
    ctx.fillStyle = PALETTE.rose;
    ctx.fillRect(bx, by - 10, 2, 5);
    ctx.fillRect(bx, by - 4, 2, 2);
  }
}

export function drawRoom(
  ctx: CanvasRenderingContext2D,
  sheet: SpriteSheet | undefined,
  scene: Scene,
  timeMs: number,
  hat?: SpriteSheet, // the hat's sheet, if the pet wears one
): void {
  // Wall and floor (the wall is a little bluer at night).
  ctx.fillStyle = scene.night ? PALETTE.lavender : PALETTE.cream;
  ctx.fillRect(0, 0, ROOM_WIDTH, ROOM_HEIGHT);
  ctx.fillStyle = PALETTE.peach;
  ctx.fillRect(0, 34, ROOM_WIDTH, ROOM_HEIGHT - 34);
  ctx.fillStyle = PALETTE.butter;
  ctx.fillRect(0, 34, ROOM_WIDTH, 1);
  drawWindow(ctx, scene.night, timeMs);
  if (scene.fishing && scene.fishing !== 'off') drawFishing(ctx, scene.fishing, timeMs);

  // The pet, centred and standing on the floor.
  if (sheet) {
    const { frameWidth: w, frameHeight: h } = sheet;
    const { sx, sy, headOffset } = frameFor(sheet, scene.animation, timeMs);
    const dx = Math.floor((ROOM_WIDTH - w) / 2);
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

  // Lights off: dim the whole room.
  if (scene.lightsOff) {
    ctx.fillStyle = PALETTE.ink;
    ctx.globalAlpha = 0.45;
    ctx.fillRect(0, 0, ROOM_WIDTH, ROOM_HEIGHT);
    ctx.globalAlpha = 1;
  }
}
