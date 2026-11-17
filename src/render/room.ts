// The room's decorations: the wallpaper behind the pet and the curtains
// around the window (bought in the Shop, see src/game/decor.ts). Each
// wallpaper is a pattern: a colour for every pixel of the wall, a little
// darker at night. The Shop's pictures use the same patterns.

import { PALETTE } from './palette';

// The colour of the wallpaper at pixel (x, y).
export type WallPattern = (x: number, y: number, night: boolean) => string;

const base = (night: boolean) => (night ? PALETTE.lavender : PALETTE.cream);

// A postmark sticker: a round stamp with wavy lines beside it.
const POSTMARK = [
  '..ppp.........',
  '.p...p........',
  'p.....p.ss..ss',
  'p..r..p...ss..',
  'p.....p.ss..ss',
  '.p...p....ss..',
  '..ppp.........',
];
// Where the stickers go on the wall (top left corners), clear of the
// window and the pet.
const STICKERS = [[47, 10], [3, 22]];

export const WALLPAPERS: Record<string, WallPattern> = {
  // Cream paper with a little sprig every few pixels.
  plain: (x, y, night) => {
    const cx = x % 10;
    const cy = y % 12;
    const light = night ? '#cfbce8' : '#f5e8d6';
    const dark = night ? '#c4aee0' : '#ead5bf';
    if (cx === 5 && (cy === 2 || cy === 4)) return dark;
    if ((cx === 4 || cx === 6) && cy === 3) return light;
    if (cx === 0 && cy === 8) return light;
    return base(night);
  },
  stripes: (x, _y, night) => (x % 6 < 2 ? (night ? PALETTE.lilac : PALETTE.mint) : base(night)),
  dots: (x, y, night) => {
    const shift = Math.floor(y / 4) % 2 ? 3 : 0;
    return (x + shift) % 6 === 1 && y % 4 === 1 ? (night ? PALETTE.lilac : PALETTE.peach) : base(night);
  },
  checks: (x, y, night) =>
    (Math.floor(x / 4) + Math.floor(y / 4)) % 2 ? (night ? PALETTE.lilac : PALETTE.lavender) : base(night),
  // A night sky all the time, with little stars.
  stars: (x, y) => ((x * 7 + y * 13) % 29 === 0 ? PALETTE.butter : PALETTE.plum),
  // A plain wall with an airmail border along the top and a few postmark
  // stickers (Percy's gift at 4 hearts, see src/game/regulars.ts).
  postmark: (x, y, night) => {
    if (y <= 4) {
      if (y === 0 || y === 4) return base(night);
      const d = (x + y) % 8;
      if (d < 3) return night ? PALETTE.lilac : PALETTE.pink;
      if (d >= 4 && d < 7) return night ? PALETTE.lavender : PALETTE.sky;
      return night ? PALETTE.cream : PALETTE.white;
    }
    for (const [sx, sy] of STICKERS) {
      const ch = POSTMARK[y - sy]?.[x - sx];
      if (ch === 'p') return night ? PALETTE.lilac : PALETTE.pink;
      if (ch === 's') return night ? PALETTE.lilac : PALETTE.sky;
      if (ch === 'r') return night ? PALETTE.lilac : PALETTE.rose;
    }
    return base(night);
  },
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

// The room's wood (not pets' colours: the room is a backdrop), from the
// darkest to the lightest.
export const WOOD = { deep: '#3e2620', dark: '#7a4e3a', mid: '#a8714f', light: '#c99068', hi: '#e2b48a' } as const;

// The ceiling beam, along the top of a tall room.
export const BEAM_H = 4;
// The wood panelling along the bottom of the wall, just over the floor.
export const WAINSCOT_H = 8;

// The wallpaper at (x, y) of a wall `top` rows taller than the old one
// (y counts from the very top). The old wall's rows keep their pattern;
// the rows above it carry it on. Postmark's airmail border moves up under
// the ceiling, its stickers stay where they were.
function tallPattern(id: string, x: number, y: number, top: number, night: boolean): string {
  const pattern = WALLPAPERS[id] ?? WALLPAPERS.plain;
  const sy = y - top;
  if (id === 'postmark' && top > 0) {
    const border = y - BEAM_H;
    if (border >= 0 && border <= 4) return pattern(x, border, night);
    return sy >= 5 ? pattern(x, sy, night) : base(night);
  }
  return pattern(x, sy >= 0 ? sy : sy + 64 * Math.ceil(-sy / 64), night);
}

// The wall, `top` rows taller than the old one (whose floor is at
// `height`), drawn from y = -top so the old rows keep their places.
// Wood panelling runs along its bottom.
export function drawWall(ctx: CanvasRenderingContext2D, wallpaper: string, night: boolean, width: number, height: number, top = 0): void {
  const key = `${wallpaper}:${night}:${width}x${height}+${top}`;
  let tile = cache.get(key);
  if (!tile) {
    const full = height + top;
    tile = document.createElement('canvas');
    tile.width = width;
    tile.height = full;
    const t = tile.getContext('2d')!;
    for (let y = 0; y < full; y++) {
      for (let x = 0; x < width; x++) {
        t.fillStyle = tallPattern(wallpaper, x, y, top, night);
        t.fillRect(x, y, 1, 1);
      }
    }
    drawWainscot(t, width, full - WAINSCOT_H);
    cache.set(key, tile);
  }
  ctx.drawImage(tile, 0, -top);
}

// Panels of wood: a rail along the top, then a sunken panel every 16px.
function drawWainscot(t: CanvasRenderingContext2D, width: number, y: number): void {
  const H = WAINSCOT_H;
  t.fillStyle = WOOD.mid;
  t.fillRect(0, y, width, H);
  t.fillStyle = WOOD.hi;
  t.fillRect(0, y, width, 1);
  t.fillStyle = WOOD.light;
  t.fillRect(0, y + 1, width, 1);
  t.fillStyle = WOOD.dark;
  t.fillRect(0, y + 2, width, 1);
  for (let x = 2; x < width; x += 16) {
    t.fillStyle = WOOD.dark; // the panel's shadowed top and left edges
    t.fillRect(x, y + 3, 12, 1);
    t.fillRect(x, y + 3, 1, H - 4);
    t.fillStyle = WOOD.light; // and its lit bottom and right edges
    t.fillRect(x + 1, y + H - 2, 11, 1);
    t.fillRect(x + 11, y + 4, 1, H - 6);
  }
}

// Wood planks from `y` down to `bottom`, rows of five pixels, staggered.
export function drawFloor(ctx: CanvasRenderingContext2D, width: number, y: number, bottom: number): void {
  ctx.fillStyle = WOOD.deep; // the shadow where the floor meets the wall
  ctx.fillRect(0, y, width, 1);
  let seed = 7;
  const rand = () => ((seed = (seed * 1103515245 + 12345) % 2147483648) / 2147483648);
  for (let row = y + 1; row < bottom; row += 6) {
    let x = -Math.floor(rand() * 16);
    while (x < width) {
      const len = 14 + Math.floor(rand() * 14);
      ctx.fillStyle = rand() < 0.25 ? WOOD.light : WOOD.mid;
      ctx.fillRect(x, row, len, 5);
      ctx.fillStyle = WOOD.hi;
      ctx.fillRect(x, row, len, 1);
      ctx.fillStyle = WOOD.dark;
      ctx.fillRect(x, row + 5, len, 1);
      ctx.fillRect(x + len - 1, row, 1, 5);
      x += len;
    }
  }
}

// The top of a tall room, `top` rows over the old wall (drawn from
// y = -top): a beam, a string of fairy lights that twinkle, and, with room
// for them, a picture and a clock.
export function drawCeiling(ctx: CanvasRenderingContext2D, width: number, top: number, night: boolean, timeMs: number): void {
  if (top < 12) return;
  const y0 = -top;
  drawBeam(ctx, width, y0);
  drawFairyLights(ctx, width, y0, night, timeMs);
  // A little picture of the hills, a clock and a lamp hanging from the
  // beam, high on the wall.
  if (top >= 28) {
    const py = y0 + Math.max(BEAM_H + 8, Math.floor(top / 2) - 6);
    drawFrame(ctx, 7, py);
    drawClock(ctx, 49, py + 4);
    drawPendant(ctx, 37, y0 + BEAM_H + 1, Math.min(Math.floor(top / 3), 30), night);
  }
}

// With the lights off, the fairy lights still glow (drawn again over the
// dark room).
export function drawFairyGlow(ctx: CanvasRenderingContext2D, width: number, top: number, timeMs: number): void {
  if (top >= 12) drawFairyLights(ctx, width, -top, true, timeMs);
}

function drawBeam(ctx: CanvasRenderingContext2D, width: number, y0: number): void {
  ctx.fillStyle = WOOD.mid;
  ctx.fillRect(0, y0, width, BEAM_H);
  ctx.fillStyle = WOOD.light;
  ctx.fillRect(0, y0, width, 1);
  ctx.fillStyle = WOOD.dark;
  ctx.fillRect(0, y0 + BEAM_H - 1, width, 1);
  ctx.fillStyle = WOOD.deep;
  ctx.fillRect(0, y0 + BEAM_H, width, 1);
}

function drawFairyLights(ctx: CanvasRenderingContext2D, width: number, y0: number, night: boolean, timeMs: number): void {
  // Two loops of wire, hanging from the beam, with a bulb every 6px.
  const loops: [number, number][] = [[0, 34], [34, width]];
  let n = 0;
  for (const [a, b] of loops) {
    for (let x = a; x < b; x++) {
      const t = (x - a) / (b - a);
      const sag = Math.round(Math.sin(t * Math.PI) * 3);
      ctx.fillStyle = WOOD.deep;
      ctx.fillRect(x, y0 + BEAM_H + 1 + sag, 1, 1);
      if ((x - a) % 6 === 3) {
        const on = (Math.floor(timeMs / 900) + n++) % 3 !== 0;
        const by = y0 + BEAM_H + 2 + sag;
        ctx.fillStyle = on ? '#fff4b8' : '#f5cf6a';
        ctx.fillRect(x - 1, by, 3, 1);
        ctx.fillStyle = on ? '#f5cf6a' : '#d39a3a';
        ctx.fillRect(x, by - 1, 1, 1);
        ctx.fillRect(x, by + 1, 1, 1);
        if (on && night) {
          ctx.globalAlpha = 0.35;
          ctx.fillStyle = '#fff4b8';
          ctx.fillRect(x - 1, by - 1, 3, 3);
          ctx.globalAlpha = 1;
        }
      }
    }
  }
}

// A lamp on a cord `drop` pixels long, its middle at x.
function drawPendant(ctx: CanvasRenderingContext2D, x: number, y: number, drop: number, night: boolean): void {
  ctx.fillStyle = WOOD.deep;
  ctx.fillRect(x, y, 1, drop);
  const sy = y + drop;
  if (night) {
    ctx.globalAlpha = 0.25;
    ctx.fillStyle = '#fff4b8';
    ctx.fillRect(x - 6, sy + 4, 13, 8);
    ctx.fillRect(x - 4, sy + 12, 9, 3);
    ctx.globalAlpha = 1;
  }
  ctx.fillStyle = '#d39a3a';
  ctx.fillRect(x - 1, sy, 3, 1);
  ctx.fillStyle = PALETTE.butter;
  ctx.fillRect(x - 2, sy + 1, 5, 1);
  ctx.fillRect(x - 3, sy + 2, 7, 2);
  ctx.fillStyle = '#f5cf6a';
  ctx.fillRect(x - 3, sy + 4, 7, 1);
  ctx.fillStyle = '#fff4b8';
  ctx.fillRect(x - 1, sy + 5, 3, 1);
}

function drawFrame(ctx: CanvasRenderingContext2D, x: number, y: number): void {
  ctx.fillStyle = WOOD.dark;
  ctx.fillRect(x, y, 14, 12);
  ctx.fillStyle = WOOD.mid;
  ctx.fillRect(x + 1, y + 1, 12, 10);
  ctx.fillStyle = PALETTE.lavender;
  ctx.fillRect(x + 2, y + 2, 10, 8);
  ctx.fillStyle = PALETTE.butter;
  ctx.fillRect(x + 8, y + 3, 2, 2);
  ctx.fillStyle = PALETTE.leaf;
  ctx.fillRect(x + 2, y + 7, 10, 3);
  ctx.fillRect(x + 4, y + 6, 3, 1);
  ctx.fillRect(x + 9, y + 6, 2, 1);
  ctx.fillStyle = PALETTE.mint;
  ctx.fillRect(x + 5, y + 5, 1, 1);
}

function drawClock(ctx: CanvasRenderingContext2D, x: number, y: number): void {
  ctx.fillStyle = WOOD.dark;
  ctx.fillRect(x + 1, y, 8, 14);
  ctx.fillStyle = WOOD.mid;
  ctx.fillRect(x + 2, y + 1, 6, 12);
  ctx.fillStyle = PALETTE.cream;
  ctx.fillRect(x + 3, y + 2, 4, 4);
  ctx.fillStyle = PALETTE.ink;
  ctx.fillRect(x + 5, y + 3, 1, 2);
  ctx.fillRect(x + 5, y + 4, 2, 1);
  ctx.fillStyle = '#d39a3a'; // the brass pendulum
  ctx.fillRect(x + 5, y + 7, 1, 3);
  ctx.fillRect(x + 4, y + 10, 3, 2);
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
