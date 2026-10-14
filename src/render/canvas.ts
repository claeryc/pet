// Draws the pet's little room onto the canvas. The canvas is tiny (64x48
// "real" pixels) and CSS scales it up with crisp, blocky pixels.

import { PALETTE } from './palette';
import { frameFor } from './animations';
import type { SpriteSheet } from './sprites';

export const ROOM_WIDTH = 64;
export const ROOM_HEIGHT = 48;

export function setupCanvas(canvas: HTMLCanvasElement): CanvasRenderingContext2D {
  canvas.width = ROOM_WIDTH;
  canvas.height = ROOM_HEIGHT;
  const ctx = canvas.getContext('2d')!;
  ctx.imageSmoothingEnabled = false; // keep pixels sharp
  return ctx;
}

export function drawRoom(
  ctx: CanvasRenderingContext2D,
  sheet: SpriteSheet,
  animation: string,
  timeMs: number,
): void {
  // Wall and floor.
  ctx.fillStyle = PALETTE.cream;
  ctx.fillRect(0, 0, ROOM_WIDTH, ROOM_HEIGHT);
  ctx.fillStyle = PALETTE.peach;
  ctx.fillRect(0, 34, ROOM_WIDTH, ROOM_HEIGHT - 34);
  ctx.fillStyle = PALETTE.butter;
  ctx.fillRect(0, 34, ROOM_WIDTH, 1);

  // The pet, centred and standing on the floor.
  const { frameWidth: w, frameHeight: h } = sheet.manifest;
  const { sx, sy } = frameFor(sheet, animation, timeMs);
  const dx = Math.floor((ROOM_WIDTH - w) / 2);
  const dy = 40 - h;
  ctx.drawImage(sheet.image, sx, sy, w, h, dx, dy, w, h);
}
