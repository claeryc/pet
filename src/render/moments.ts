// Little moments of care drawn in the room, so the everyday things feel
// like something happened and not just a number going up:
//
//   cuddle    the pet squishes down twice and hearts float up off its head
//   tickle    a feather tickles its side while it wriggles and hops
//   medicine  a spoon of pink syrup comes to its mouth, it shudders at the
//             taste, then sparkles
//   doze      lights off: it settles down with a little squash
//   wake      lights on: a big stretch, then a hop
//   gift      a wrapped present hops from your pet over to a friend
//
// While two pets play together (Meet), they hop in turn (see playHop).
//
// And some that last as long as the pet's state does: Zzz drifting up while
// it sleeps, a small rain cloud over a sick pet, and light from the window
// falling on the floor while the room is dark.
//
// A moment only moves the pet (see MomentMotion) and draws its props; the
// faces and sounds are picked in main.ts.

import { PALETTE } from './palette';
import type { SpriteSheet } from './sprites';

export type MomentKind = 'cuddle' | 'tickle' | 'medicine' | 'doze' | 'wake' | 'gift';

export interface Moment {
  kind: MomentKind;
  ms: number; // how long it has been playing
}

// How long each one lasts.
export const MOMENT_MS: Record<MomentKind, number> = {
  cuddle: 900,
  tickle: 1300,
  medicine: 1800,
  doze: 700,
  wake: 1300,
  gift: 1100,
};

// How the pet moves: whole pixels sideways and up (negative dy is up),
// and a squash or stretch around its feet.
export interface MomentMotion {
  dx: number;
  dy: number;
  sx: number;
  sy: number;
}

const STILL: MomentMotion = { dx: 0, dy: 0, sx: 1, sy: 1 };

export function momentMotion(m: Moment | null | undefined): MomentMotion {
  if (!m) return STILL;
  const t = Math.min(1, m.ms / MOMENT_MS[m.kind]);
  switch (m.kind) {
    case 'cuddle': {
      // Two soft squishes, the second smaller.
      const squish = Math.abs(Math.sin(t * Math.PI * 2)) * (t < 0.5 ? 0.14 : 0.08);
      return { dx: 0, dy: 0, sx: 1 + squish * 0.7, sy: 1 - squish };
    }
    case 'tickle': {
      // A quick wriggle with little hops, calming down at the end.
      const wriggle = t < 0.85 ? (Math.floor(m.ms / 70) % 2 ? 1 : -1) : 0;
      const hop = t < 0.85 && Math.floor(m.ms / 210) % 2 ? -1 : 0;
      return { dx: wriggle, dy: hop, sx: 1, sy: 1 };
    }
    case 'medicine': {
      // Still while the spoon comes, then a shudder at the taste.
      const shudder = t > 0.38 && t < 0.72 ? (Math.floor(m.ms / 50) % 2 ? 1 : -1) : 0;
      const shrink = t > 0.38 && t < 0.72 ? 0.06 : 0;
      return { dx: shudder, dy: 0, sx: 1 + shrink, sy: 1 - shrink };
    }
    case 'doze': {
      // Settles down, a bit squashed, and back.
      const settle = Math.sin(t * Math.PI) * 0.1;
      return { dx: 0, dy: 0, sx: 1 + settle * 0.6, sy: 1 - settle };
    }
    case 'wake': {
      // A long stretch up, then a little hop.
      if (t < 0.6) {
        const stretch = Math.sin((t / 0.6) * Math.PI) * 0.16;
        return { dx: 0, dy: 0, sx: 1 - stretch * 0.5, sy: 1 + stretch };
      }
      const hop = Math.sin(((t - 0.6) / 0.4) * Math.PI);
      return { dx: 0, dy: -Math.round(hop * 3), sx: 1, sy: 1 };
    }
    case 'gift':
      // Leans over to hand it across.
      return { dx: t > 0.15 && t < 0.5 ? 1 : 0, dy: 0, sx: 1, sy: 1 };
  }
}

// Two pets playing together hop in turn, each leaning towards the other
// (`towards` is 1 for the pet on the left, -1 on the right).
export function playHop(timeMs: number, towards: 1 | -1): MomentMotion {
  const t = ((timeMs + (towards < 0 ? 380 : 0)) % 760) / 760;
  const up = t < 0.5 ? Math.sin(t * 2 * Math.PI) : 0;
  return { dx: up > 0.3 ? towards : 0, dy: -Math.round(up * 3), sx: 1, sy: 1 };
}

// Where things go on a pet standing with its left edge at `x`: the top of
// its head and its middle.
function anchors(sheet: SpriteSheet | undefined, x: number) {
  const w = sheet?.frameWidth ?? 32;
  const h = sheet?.frameHeight ?? 32;
  const top = 40 - h + (sheet?.head?.y ?? 6);
  const cx = x + (sheet?.head?.x ?? w / 2);
  return { cx, top, w, h, mouthY: Math.round(top + (40 - top) * 0.55) };
}

// The props for a moment, drawn over the pet.
export function drawMoment(ctx: CanvasRenderingContext2D, m: Moment, sheet: SpriteSheet | undefined, x: number): void {
  const t = Math.min(1, m.ms / MOMENT_MS[m.kind]);
  const { cx, top, mouthY } = anchors(sheet, x);
  if (m.kind === 'cuddle') floatHearts(ctx, cx, top, t);
  else if (m.kind === 'tickle') feather(ctx, cx + 9, mouthY + 4, m.ms, t);
  else if (m.kind === 'medicine') {
    // The rain cloud stays until the spoon is in.
    if (t < 0.4) drawSickCloud(ctx, sheet, x, m.ms);
    medicine(ctx, cx, mouthY, top, t);
  }
  else if (m.kind === 'wake') wakeSparkle(ctx, cx, top, t);
  else if (m.kind === 'gift') present(ctx, t);
}

// A wrapped present that pops up between the two pets and hops over to
// the friend on the right.
function present(ctx: CanvasRenderingContext2D, t: number): void {
  const pop = Math.min(1, t / 0.2);
  const across = Math.max(0, Math.min(1, (t - 0.3) / 0.45));
  const x = Math.round(26 + across * 8);
  const y = Math.round(33 - Math.sin(across * Math.PI) * 6 - (1 - pop) * -4);
  ctx.globalAlpha = t > 0.85 ? (1 - t) / 0.15 : pop;
  ctx.fillStyle = PALETTE.pink;
  ctx.fillRect(x, y, 6, 5);
  ctx.fillStyle = PALETTE.berry;
  ctx.fillRect(x, y + 4, 6, 1);
  ctx.fillStyle = PALETTE.butter; // ribbon and bow
  ctx.fillRect(x + 2, y, 2, 5);
  ctx.fillRect(x, y + 2, 6, 1);
  ctx.fillRect(x + 1, y - 1, 1, 1);
  ctx.fillRect(x + 4, y - 1, 1, 1);
  ctx.globalAlpha = 1;
}

function heart(ctx: CanvasRenderingContext2D, x: number, y: number): void {
  ctx.fillRect(x, y, 1, 1);
  ctx.fillRect(x + 2, y, 1, 1);
  ctx.fillRect(x, y + 1, 3, 1);
  ctx.fillRect(x + 1, y + 2, 1, 1);
}

function floatHearts(ctx: CanvasRenderingContext2D, cx: number, top: number, t: number): void {
  ctx.fillStyle = PALETTE.rose;
  for (let i = 0; i < 3; i++) {
    const own = Math.max(0, Math.min(1, (t - i * 0.15) / 0.7));
    if (own <= 0 || own >= 1) continue;
    ctx.globalAlpha = 1 - own * own;
    heart(ctx, cx + [-6, 4, -1][i] + Math.round(Math.sin(own * 6 + i) * 1.2), Math.round(top - 2 - own * 12));
  }
  ctx.globalAlpha = 1;
}

// A feather sweeping up and down at the pet's side.
function feather(ctx: CanvasRenderingContext2D, x: number, y: number, ms: number, t: number): void {
  ctx.globalAlpha = t < 0.12 ? t / 0.12 : t > 0.88 ? (1 - t) / 0.12 : 1;
  const bob = Math.round(Math.sin(ms / 75) * 2);
  const fx = x + (Math.floor(ms / 150) % 2);
  const fy = y + bob;
  ctx.fillStyle = PALETTE.cocoa; // quill
  ctx.fillRect(fx + 3, fy + 5, 1, 3);
  ctx.fillStyle = PALETTE.lilac;
  ctx.fillRect(fx + 1, fy, 2, 1);
  ctx.fillRect(fx, fy + 1, 3, 2);
  ctx.fillRect(fx + 1, fy + 3, 3, 1);
  ctx.fillRect(fx + 2, fy + 4, 2, 1);
  ctx.fillStyle = PALETTE.white;
  ctx.fillRect(fx + 1, fy + 1, 1, 2);
  // "hee" marks flying off.
  if (Math.floor(ms / 260) % 2) {
    ctx.fillStyle = PALETTE.pink;
    ctx.fillRect(x + 6, y - 6, 1, 2);
    ctx.fillRect(x + 8, y - 8, 1, 2);
  }
  ctx.globalAlpha = 1;
}

// A spoon of pink syrup slides in from the right, tips into the mouth and
// goes; after the shudder, sparkles.
function medicine(ctx: CanvasRenderingContext2D, cx: number, mouthY: number, top: number, t: number): void {
  if (t < 0.4) {
    const come = Math.min(1, t / 0.28);
    const ease = 1 - (1 - come) ** 3;
    const sx = Math.round(cx + 4 + (1 - ease) * 22);
    const tip = t > 0.3 ? 1 : 0;
    ctx.fillStyle = PALETTE.lavender; // handle
    ctx.fillRect(sx + 4, mouthY + 1 - tip, 8, 1);
    ctx.fillStyle = PALETTE.white; // bowl
    ctx.fillRect(sx, mouthY, 4, 2);
    ctx.fillRect(sx + 1, mouthY + 2, 2, 1);
    if (!tip) {
      ctx.fillStyle = PALETTE.pink; // syrup
      ctx.fillRect(sx + 1, mouthY, 2, 1);
    }
  }
  if (t > 0.72) {
    const s = (t - 0.72) / 0.28;
    ctx.globalAlpha = 1 - s;
    ctx.fillStyle = PALETTE.mint;
    const spots: [number, number][] = [[-9, 6], [8, 2], [-5, -3], [6, 12], [0, -6]];
    for (const [dx, dy] of spots) {
      const px = cx + Math.round(dx * (1 + s * 0.4));
      const py = top + 6 + Math.round(dy * (1 + s * 0.4)) - Math.round(s * 3);
      ctx.fillRect(px, py - 1, 1, 3);
      ctx.fillRect(px - 1, py, 3, 1);
    }
    ctx.globalAlpha = 1;
  }
}

// A little burst of morning sparkle over its head at the top of the stretch.
function wakeSparkle(ctx: CanvasRenderingContext2D, cx: number, top: number, t: number): void {
  if (t < 0.25 || t > 0.75) return;
  const s = (t - 0.25) / 0.5;
  ctx.globalAlpha = 1 - s;
  ctx.fillStyle = PALETTE.butter;
  for (const [dx, dy] of [[-8, -2], [7, -4], [0, -8]] as const) {
    const px = cx + Math.round(dx * (0.6 + s * 0.6));
    const py = top + Math.round(dy * (0.6 + s * 0.6)) - 2;
    ctx.fillRect(px, py - 1, 1, 3);
    ctx.fillRect(px - 1, py, 3, 1);
  }
  ctx.globalAlpha = 1;
}

// One "z", 4 pixels wide (or 5 for the big one).
function zee(ctx: CanvasRenderingContext2D, x: number, y: number, big: boolean): void {
  const s = big ? 5 : 4;
  ctx.fillRect(x, y, s, 1);
  for (let i = 1; i < s - 1; i++) ctx.fillRect(x + s - 1 - i, y + i, 1, 1);
  ctx.fillRect(x, y + s - 1, s, 1);
}

// Zzz drifting up and off to the right from a sleeping pet's head. Drawn
// after the room is dimmed, so they glow.
export function drawSleepZs(ctx: CanvasRenderingContext2D, sheet: SpriteSheet | undefined, x: number, timeMs: number): void {
  const { cx, top } = anchors(sheet, x);
  ctx.fillStyle = PALETTE.cream;
  for (let i = 0; i < 3; i++) {
    const t = (timeMs / 2400 + i / 3) % 1;
    ctx.globalAlpha = t < 0.15 ? t / 0.15 : 1 - (t - 0.15) / 0.85;
    const zx = cx + 4 + Math.round(t * 8 + Math.sin(t * 7 + i) * 1.2);
    const zy = top + 2 - Math.round(t * 14);
    zee(ctx, zx, zy, i === 0 && t > 0.4);
  }
  ctx.globalAlpha = 1;
}

// A small grey rain cloud drizzling just off the top of a sick pet's head
// (to the right, where there's room under the ceiling).
export function drawSickCloud(ctx: CanvasRenderingContext2D, sheet: SpriteSheet | undefined, x: number, timeMs: number): void {
  const { cx, top } = anchors(sheet, x);
  const bob = Math.floor(timeMs / 700) % 2;
  const y = Math.max(1, top - 6) + bob;
  const left = cx + 5;
  ctx.fillStyle = PALETTE.lilac;
  ctx.fillRect(left + 2, y, 4, 1);
  ctx.fillRect(left + 1, y + 1, 8, 1);
  ctx.fillRect(left, y + 2, 10, 2);
  ctx.fillStyle = PALETTE.lavender;
  ctx.fillRect(left + 3, y + 1, 2, 1);
  ctx.fillStyle = PALETTE.sky;
  for (let i = 0; i < 3; i++) {
    const t = (timeMs / 900 + i / 3) % 1;
    ctx.globalAlpha = 1 - t;
    ctx.fillRect(left + 2 + i * 3, y + 5 + Math.round(t * 5), 1, 2);
  }
  ctx.globalAlpha = 1;
}

// The window's light on the floor of a dark room: moonlight at night,
// daylight through a nap. `win` is the window's frame.
export function drawWindowLight(
  ctx: CanvasRenderingContext2D,
  win: { x: number; y: number; w: number; h: number },
  night: boolean,
): void {
  ctx.fillStyle = night ? PALETTE.sky : PALETTE.butter;
  // The window itself glows through the dark.
  ctx.globalAlpha = 0.35;
  ctx.fillRect(win.x, win.y, win.w, win.h);
  // A slanted patch of light on the floor, a row at a time.
  ctx.globalAlpha = 0.16;
  for (let row = 0; row < 6; row++) {
    ctx.fillRect(win.x + 3 + row * 2, 35 + row, win.w - 2, 1);
  }
  ctx.globalAlpha = 1;
}
