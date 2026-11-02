// The Backyard's beehive and Percy's perch (src/ui/backyard.ts), each drawn
// on its own 64 x 48 canvas with the garden's sky, fence and grass behind.
//
// The beehive is a straw skep on a bench. How much honey is waiting shows
// on it: a drip from the door (one day's worth), honeycomb filling the door
// (two), and a full jar on the grass with a bubble over it (full, three).
// Bees fly little figure-eight loops around it, more the fuller it is; at
// night they're inside, the door glows and a "z" floats up.
//
// Percy's perch is his blue post-office dovecote with a long perch out to
// the side, where Percy stands beside his house: asleep while he rests,
// awake and bobbing his head (with a letter bubble) when he's ready to go,
// and gone, with an "out" tag on the pole, while he's away.

import { PALETTE } from './palette';
import { drawGardenBackground } from './garden';
import { drawPercy, drawPercyAsleep } from './delivery';

export const YARD_WIDTH = 64;
export const YARD_HEIGHT = 48;

export type PercyAtPerch = 'away' | 'resting' | 'ready';

type Sprite = string[];
const COLORS: Record<string, string> = {
  k: PALETTE.ink, w: PALETTE.white, r: PALETTE.rose, p: PALETTE.pink, g: PALETTE.leaf, m: PALETTE.mint,
  b: PALETTE.ocean, s: PALETTE.sky, y: PALETTE.butter, c: PALETTE.cocoa, o: PALETTE.peach, l: PALETTE.lilac,
  v: PALETTE.lavender, e: PALETTE.cream, u: PALETTE.plum, n: PALETTE.bark, a: PALETTE.berry, d: PALETTE.deep, h: PALETTE.moss,
};

function draw(ctx: CanvasRenderingContext2D, sprite: Sprite, x: number, y: number): void {
  sprite.forEach((row, sy) => {
    for (let sx = 0; sx < row.length; sx++) {
      const color = COLORS[row[sx]];
      if (!color) continue;
      ctx.fillStyle = color;
      ctx.fillRect(x + sx, y + sy, 1, 1);
    }
  });
}
const fill = (ctx: CanvasRenderingContext2D, color: string, x: number, y: number, w = 1, h = 1) => {
  ctx.fillStyle = color;
  ctx.fillRect(x, y, w, h);
};

// The skep on its bench, with a flower on either side (the same picture as
// the workbench's, src/ui/icons.ts). Its top-left corner stands at SKEP.
const SKEP_ART: Sprite = [
  '................nnnn................',
  '................nccn................',
  '................nccn................',
  '..............nnyyyynn..............',
  '............nnyyyyyyyonn............',
  '...........nooooooooocccn...........',
  '..........nyyyyyyyyyyyooon..........',
  '.........nyyyyyyyyyyyyoooon.........',
  '.........nyyyyyyyyyyyyoooon.........',
  '........nooooooooooooooccccn........',
  '........nyyyyyyyyyyyyyyoooon........',
  '.......nyyyyyyyyyyyyyyyooooon.......',
  '.......nyyyyyyyyyyyyyyyooooon.......',
  '......noooowoooooooooooccccccn......',
  '......nyyywyyyyyyyyyyyyoooooon......',
  '......nyyywyyyyyyyyyyyyoooooon......',
  '......nyyyyyyyyyyyyyyyyoooooon......',
  '......nooooooooooooooooccccccn......',
  '.....nyyyyyyyyyyyyyyyyyyoooooon.....',
  '.....nyyyyyyyyyyyyyyyyyyoooooon.....',
  '.....nyyyyyyyyyyyyyyyyyyoooooon.....',
  '.....nooooooooooooooooooccccccn.....',
  '.....nyyyyyyyyyyyyyyyyyyoooooon.....',
  '.....nyyyyyyyyyynnnnyyyyoooooon.....',
  '.....nyyyyyyyyynnnnnnyyyoooooon.....',
  '.....nooooooooonkkkknoooccccccn.....',
  '.....nyyyyyyyyynkkkknyyyoooooon.....',
  '.....nyyyyyyyyynkkkknyyyoooooon.....',
  '.....nyyyyyyyyynkkkknyyyoooooon.....',
  '.....nooooooooonkkkknoooccccccn.....',
  '.....noooooooooooooooooooooooon.....',
  '.....nccccccccccccccccccccccccn.....',
  'aaa..nnccccccccccccccccccccccnn..uuu',
  'aya....nccnnnnnnnnnnnnnnnnccn....uyu',
  'apa....ncn................ncn....ulu',
  '.h.....ncn................ncn.....h.',
  'hh.....ncn................ncn....hh.',
  '.hh....ncn................ncn.....hh',
  '.h.....ncn................ncn.....h.',
  '.h.....nnn................nnn.....h.',
];
const SKEP = { x: 14, y: 6 };
// Where the skep's door is (its top-left corner), and the bench top.
const DOOR = { x: SKEP.x + 16, y: SKEP.y + 25 };
const BENCH_TOP = SKEP.y + 30;

// A jar of honey for when the hive is full.
const JAR: Sprite = [
  '.nnnnnn.',
  '.nccccn.',
  'nnnnnnnn',
  'nwyyyyyn',
  'nwyeeyyn',
  'nwyeeyyn',
  'nyyyyyyn',
  'noooooon',
  '.nnnnnn.',
];

// The dovecote, with its perch reaching out to the right for Percy.
const DOVECOTE: Sprite = [
  '..............aaaa................................',
  '.............arrrra...............................',
  '............aaaaaaaa..............................',
  '...........arrrrrrrra.............................',
  '..........arrrrrrrrrra............................',
  '.........aaaaaaaaaaaaaa...........................',
  '........arrrrrrrrrrrrrra..........................',
  '.......arrrrrrrrrrrrrrrra.........................',
  '...aaaarrrrrrrrrrrrrrrrrraaaa.....................',
  '...aarrrrrrrrrrrrrrrrrrrrrraa.....................',
  '..n..dssssssssssssssssssssd.......................',
  '..n..dsssssssskkkkssssssssd.......................',
  '..n..dssssssskkkkkksssssssd.......................',
  'nuwunsswwwwsskkkkkkssyyyysd.......................',
  'nyyyysswllwsskkkkkkssccccsd.......................',
  'nyyyysswwwwsskkkkkkssyyyysd.......................',
  'nnynnsssssssskkkkkkssyyyysd.......................',
  '..n..dssssssskkkkkksssssssd.......................',
  '.....dssssssskkkkkksssssssd.......................',
  '.....dssssssssssssssssssssd.......................',
  '.....dssssssssssssssssssssd.......................',
  '.....ddddcooooooooooooooooonnnnnnnnnnnnnnnnnnnnnnn',
  '.........nnnnnccccnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnn',
  '..............nocn................................',
  '..............nocn................................',
  '..............nocn................................',
  '..............nocn................................',
  '..............nocn................................',
  '..............nocn................................',
  '..............nocn................................',
  '..............nocn................................',
  '..............nocn................................',
  '..............nocn................................',
  '..............nocn................................',
  '..............nocn................................',
  '..............nocn................................',
  '..............nocn................................',
  '..............nocn................................',
  '..............nocn................................',
  '..............nocn................................',
  '..........nnnnoooonnnn............................',
  '..........nccccccccccn............................',
  '..........nccccccccccn............................',
  '..........nnnnnnnnnnnn............................',
];
const DOVE = { x: 8, y: 2 };
// Where Percy stands on the perch (his left edge and the row his feet are on).
const PERCY_X = 37;
const PERCY_FOOT = 22;

// ---- Little moving things ----

// One bee: a striped body with a white wing that flaps.
function bee(ctx: CanvasRenderingContext2D, x: number, y: number, right: boolean, flap: boolean): void {
  const f = (dx: number, dy: number, c: string) => fill(ctx, c, right ? x + dx : x + 3 - dx, y + dy);
  f(0, 0, PALETTE.butter); f(1, 0, PALETTE.ink); f(2, 0, PALETTE.butter); f(3, 0, PALETTE.ink);
  f(0, 1, PALETTE.butter); f(1, 1, PALETTE.ink); f(2, 1, PALETTE.butter);
  if (flap) { f(1, -1, PALETTE.white); f(1, -2, PALETTE.white); f(2, -2, PALETTE.white); }
  else { f(1, -1, PALETTE.white); f(2, -1, PALETTE.white); }
}

// Each bee's loop: its middle, how far it goes each way, laps per loop and
// where along it starts.
const BEES: readonly [number, number, number, number, number, number][] = [
  [18, 16, 6, 5, 2, 0],
  [44, 12, 5, 4, 2, 2.1],
  [46, 27, 4, 4, 3, 4],
  [10, 28, 4, 3, 2, 1],
];
const LOOP_MS = 3600;

function bees(ctx: CanvasRenderingContext2D, count: number, timeMs: number): void {
  BEES.slice(0, count).forEach(([cx, cy, rx, ry, laps, start], i) => {
    const a = (2 * Math.PI * timeMs * laps) / LOOP_MS + start;
    const buzz = Math.floor(timeMs / 120 + i) % 3 === 0 ? 1 : 0;
    const x = Math.round(cx + rx * Math.sin(a)) - 2;
    const y = Math.round(cy + ry * Math.sin(2 * a) * 0.7) + buzz;
    bee(ctx, x, y, Math.cos(a) >= 0, Math.floor(timeMs / 60 + i) % 2 === 0);
  });
}

// A speech bubble with a little picture in it, bobbing gently.
function bubble(ctx: CanvasRenderingContext2D, x: number, y: number, timeMs: number, icon: (x: number, y: number) => void): void {
  y += Math.floor(timeMs / 400) % 2;
  fill(ctx, PALETTE.plum, x, y + 1, 11, 7);
  fill(ctx, PALETTE.plum, x + 1, y, 9, 9);
  fill(ctx, PALETTE.cream, x + 1, y + 1, 9, 7);
  fill(ctx, PALETTE.plum, x + 4, y + 9, 3, 1);
  fill(ctx, PALETTE.plum, x + 5, y + 10);
  icon(x + 2, y + 2);
}

function jarIcon(ctx: CanvasRenderingContext2D, x: number, y: number): void {
  fill(ctx, PALETTE.cocoa, x + 1, y, 5, 1);
  fill(ctx, PALETTE.butter, x, y + 1, 7, 4);
  fill(ctx, PALETTE.cocoa, x, y + 1, 1, 4);
  fill(ctx, PALETTE.cocoa, x + 6, y + 1, 1, 4);
  fill(ctx, PALETTE.white, x + 1, y + 2, 1, 2);
  fill(ctx, PALETTE.peach, x + 1, y + 4, 5, 1);
}

function letterIcon(ctx: CanvasRenderingContext2D, x: number, y: number): void {
  fill(ctx, PALETTE.white, x, y, 7, 5);
  fill(ctx, PALETTE.lilac, x, y, 7, 1);
  fill(ctx, PALETTE.lilac, x + 1, y + 1);
  fill(ctx, PALETTE.lilac, x + 5, y + 1);
  fill(ctx, PALETTE.lilac, x + 2, y + 2, 3, 1);
  fill(ctx, PALETTE.rose, x + 3, y + 3);
}

// Two little z's floating up and fading.
function zzz(ctx: CanvasRenderingContext2D, x: number, y: number, timeMs: number): void {
  const k = (timeMs % 1800) / 1800;
  [[0, 0], [4, -5]].forEach(([dx, dy], i) => {
    const p = (k + i * 0.5) % 1;
    const yy = Math.round(y + dy - p * 6);
    ctx.globalAlpha = 1 - p * 0.6;
    fill(ctx, PALETTE.white, x + dx, yy, 3, 1);
    fill(ctx, PALETTE.white, x + dx + 1, yy + 1);
    fill(ctx, PALETTE.white, x + dx, yy + 2, 3, 1);
    ctx.globalAlpha = 1;
  });
}

// ---- The beehive ----

// `level`: days of honey waiting (0-3).
export function drawHive(ctx: CanvasRenderingContext2D, level: number, night: boolean, timeMs: number): void {
  drawGardenBackground(ctx, YARD_WIDTH, YARD_HEIGHT, night, timeMs);
  draw(ctx, SKEP_ART, SKEP.x, SKEP.y);
  const honey = (x: number, y: number, w = 1, h = 1) => fill(ctx, PALETTE.butter, x, y, w, h);
  const tip = (x: number, y: number) => fill(ctx, PALETTE.peach, x, y);
  const { x: dx, y: dy } = DOOR;
  // One day: a thick drip runs from the door down over the bench.
  if (level >= 1) {
    honey(dx + 1, BENCH_TOP - 1, 3, 4);
    honey(dx + 2, BENCH_TOP + 3, 1, 2);
    tip(dx + 2, BENCH_TOP + 5);
    tip(dx + 3, BENCH_TOP);
  }
  // Two: honeycomb fills the door, and a second drip.
  if (level >= 2) {
    honey(dx, dy + 1, 4, 4);
    tip(dx, dy + 1);
    tip(dx + 2, dy + 2);
    tip(dx + 1, dy + 3);
    tip(dx + 3, dy + 4);
    honey(dx - 2, BENCH_TOP - 1, 2, 3);
    tip(dx - 2, BENCH_TOP + 2);
  }
  // Full: honeycomb right up the door and a jar waiting on the grass.
  if (level >= 3) {
    honey(dx, dy, 4, 2);
    tip(dx + 2, dy);
    draw(ctx, JAR, SKEP.x + 31, SKEP.y + 30);
  }
  if (night) {
    // Everyone's in: the door glows and a z floats up.
    ctx.globalAlpha = 0.55;
    fill(ctx, PALETTE.butter, dx, dy, 4, 5);
    ctx.globalAlpha = 1;
    zzz(ctx, SKEP.x + 24, SKEP.y + 4, timeMs);
    return;
  }
  bees(ctx, [1, 2, 3, 4][Math.max(0, Math.min(3, level))], timeMs);
  if (level >= 3) {
    bubble(ctx, SKEP.x + 29, SKEP.y + 18, timeMs, (x, y) => jarIcon(ctx, x, y));
    // A sparkle by the jar, now here, now there.
    const at = Math.floor(timeMs / 300) % 2 === 0 ? [SKEP.x + 41, SKEP.y + 33] : [SKEP.x + 29, SKEP.y + 36];
    fill(ctx, PALETTE.white, at[0], at[1] - 1, 1, 3);
    fill(ctx, PALETTE.white, at[0] - 1, at[1], 3, 1);
  }
}

// Is (x, y) (in canvas pixels) on the hive? Tapping it collects.
export const onHive = (x: number, y: number): boolean => x >= SKEP.x + 4 && x <= SKEP.x + 31 && y >= SKEP.y - 2 && y <= SKEP.y + 40;

// ---- Percy's perch ----

export function drawPerch(ctx: CanvasRenderingContext2D, percy: PercyAtPerch, night: boolean, timeMs: number): void {
  drawGardenBackground(ctx, YARD_WIDTH, YARD_HEIGHT, night, timeMs);
  // No sun (or moon) here: Percy's head is where it would be.
  fill(ctx, night ? PALETTE.plum : PALETTE.sky, 50, 2, 8, 7);
  draw(ctx, DOVECOTE, DOVE.x, DOVE.y);
  if (percy === 'resting') {
    drawPercyAsleep(ctx, PERCY_X, PERCY_FOOT, timeMs);
    zzz(ctx, PERCY_X + 1, PERCY_FOOT - 18, timeMs);
  } else if (percy === 'ready') {
    drawPercy(ctx, PERCY_X, PERCY_FOOT, timeMs);
    bubble(ctx, PERCY_X - 9, 1, timeMs, (x, y) => letterIcon(ctx, x, y));
  } else {
    // Away: an empty perch, and a little "out" tag swinging on the pole.
    const sw = Math.floor(timeMs / 600) % 2;
    fill(ctx, PALETTE.bark, DOVE.x + 18, DOVE.y + 24, 1, 3);
    fill(ctx, PALETTE.plum, DOVE.x + 15 + sw, DOVE.y + 26, 7, 6);
    fill(ctx, PALETTE.white, DOVE.x + 16 + sw, DOVE.y + 27, 5, 4);
    fill(ctx, PALETTE.lilac, DOVE.x + 17 + sw, DOVE.y + 28, 3, 1);
    fill(ctx, PALETTE.lilac, DOVE.x + 17 + sw, DOVE.y + 29, 2, 1);
  }
}

// Is (x, y) on Percy (or where he'd stand)?
export const onPercy = (x: number, y: number): boolean => x >= PERCY_X && x < PERCY_X + 20 && y >= 0 && y <= PERCY_FOOT + 1;
