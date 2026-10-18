// The room's decorations: the wallpaper behind the pet and the curtains
// around the window (bought in the Shop, see src/game/decor.ts). Each
// wallpaper is a pattern: a colour for every pixel of the wall, a little
// darker at night. The Shop's pictures use the same patterns.

import { PALETTE } from './palette';

// The colour of the wallpaper at pixel (x, y).
export type WallPattern = (x: number, y: number, night: boolean) => string;

const base = (night: boolean) => (night ? PALETTE.lavender : PALETTE.cream);

export const WALLPAPERS: Record<string, WallPattern> = {
  plain: (_x, _y, night) => base(night),
  stripes: (x, _y, night) => (x % 6 < 2 ? (night ? PALETTE.lilac : PALETTE.mint) : base(night)),
  dots: (x, y, night) => {
    const shift = Math.floor(y / 4) % 2 ? 3 : 0;
    return (x + shift) % 6 === 1 && y % 4 === 1 ? (night ? PALETTE.lilac : PALETTE.peach) : base(night);
  },
  checks: (x, y, night) =>
    (Math.floor(x / 4) + Math.floor(y / 4)) % 2 ? (night ? PALETTE.lilac : PALETTE.lavender) : base(night),
  // A night sky all the time, with little stars.
  stars: (x, y) => ((x * 7 + y * 13) % 29 === 0 ? PALETTE.butter : PALETTE.plum),
};

// Curtains: the main colour and the colour of the folds.
export const CURTAINS: Record<string, [string, string]> = {
  rose: [PALETTE.pink, PALETTE.rose],
  butter: [PALETTE.butter, PALETTE.peach],
  mint: [PALETTE.mint, PALETTE.leaf],
  plum: [PALETTE.lilac, PALETTE.plum],
};

// The wall is drawn once into a little canvas for each look, then copied.
const cache = new Map<string, HTMLCanvasElement>();

export function drawWall(ctx: CanvasRenderingContext2D, wallpaper: string, night: boolean, width: number, height: number): void {
  const pattern = WALLPAPERS[wallpaper] ?? WALLPAPERS.plain;
  const key = `${wallpaper}:${night}:${width}x${height}`;
  let tile = cache.get(key);
  if (!tile) {
    tile = document.createElement('canvas');
    tile.width = width;
    tile.height = height;
    const t = tile.getContext('2d')!;
    for (let y = 0; y < height; y++) {
      for (let x = 0; x < width; x++) {
        t.fillStyle = pattern(x, y, night);
        t.fillRect(x, y, 1, 1);
      }
    }
    cache.set(key, tile);
  }
  ctx.drawImage(tile, 0, 0);
}

// Curtains on a rod above the window, gathered at each side. `x`, `y`, `w`
// and `h` are the window's glass (its frame is one pixel bigger).
export function drawCurtains(ctx: CanvasRenderingContext2D, id: string, x: number, y: number, w: number, h: number): void {
  const look = CURTAINS[id];
  if (!look) return;
  const [main, fold] = look;
  // The rod, a little wider than the window, with knobs at the ends.
  ctx.fillStyle = PALETTE.cocoa;
  ctx.fillRect(x - 5, y - 3, w + 10, 1);
  ctx.fillRect(x - 6, y - 4, 1, 3);
  ctx.fillRect(x + w + 5, y - 4, 1, 3);
  const top = y - 2;
  const bottom = y + h + 2;
  for (const left of [x - 4, x + w - 1]) {
    ctx.fillStyle = main;
    ctx.fillRect(left, top, 5, bottom - top);
    // Folds, and a hem along the bottom.
    ctx.fillStyle = fold;
    ctx.fillRect(left + 1, top, 1, bottom - top);
    ctx.fillRect(left + 3, top, 1, bottom - top);
    ctx.fillRect(left, bottom - 1, 5, 1);
  }
}
