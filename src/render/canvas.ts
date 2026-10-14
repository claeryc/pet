// Draws the pet's little room onto the canvas. The canvas is tiny (64x48
// "real" pixels) and CSS scales it up with crisp, blocky pixels.

import { PALETTE } from './palette';
import { frameFor } from './animations';
import type { SpriteSheet } from './sprites';

export const ROOM_WIDTH = 64;
export const ROOM_HEIGHT = 48;

// What the room should look like right now.
export interface Scene {
  animation: string; // which pet animation to play
  night: boolean; // night-time outside the window
  lightsOff: boolean; // the room is dark (pet is sleeping)
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

export function drawRoom(
  ctx: CanvasRenderingContext2D,
  sheet: SpriteSheet | undefined,
  scene: Scene,
  timeMs: number,
): void {
  // Wall and floor (the wall is a little bluer at night).
  ctx.fillStyle = scene.night ? PALETTE.lavender : PALETTE.cream;
  ctx.fillRect(0, 0, ROOM_WIDTH, ROOM_HEIGHT);
  ctx.fillStyle = PALETTE.peach;
  ctx.fillRect(0, 34, ROOM_WIDTH, ROOM_HEIGHT - 34);
  ctx.fillStyle = PALETTE.butter;
  ctx.fillRect(0, 34, ROOM_WIDTH, 1);
  drawWindow(ctx, scene.night, timeMs);

  // The pet, centred and standing on the floor.
  if (sheet) {
    const { frameWidth: w, frameHeight: h } = sheet;
    const { sx, sy } = frameFor(sheet, scene.animation, timeMs);
    const dx = Math.floor((ROOM_WIDTH - w) / 2);
    const dy = 40 - h;
    ctx.drawImage(sheet.image, sx, sy, w, h, dx, dy, w, h);
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
