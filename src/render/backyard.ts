// The Backyard's beehive and Percy's perch (src/ui/backyard.ts), each drawn
// on its own 64 x 48 canvas with the garden's sky, fence and grass behind.
//
// The beehive is a coiled straw skep on a bench, with a flower either
// side. How much honey is waiting shows on it: honey running off the board
// and dripping from the bench (one day's worth), honey filling the doorway
// and a second drip (two), and a jar of honey on the grass with a bubble
// and sparkles (full, three). Bees fly out along the landing board, over to
// a flower, hover there and come home, and others potter over the dome,
// each with a faint trail; more of them the fuller it is. At night they're
// all in: the doorway glows, fireflies drift about and a "z" floats up.
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

// The skep on its bench (the same picture as the workbench's, in
// src/ui/icons.ts): a dome of coiled straw, each coil lit along its top and
// shaded underneath, lighter on the left where the sun is and darker round
// the right. An arched door with a little landing board. Its top-left corner
// stands at SKEP.
const SKEP_ART: Sprite = [
  '.................nnn................',
  '................neyon...............',
  '................nyocn...............',
  '...............nnnnnnn..............',
  '............nyoyyyyyycon............',
  '...........nyyoyyyyyycoon...........',
  '...........nooooooooocccn...........',
  '........neewwweeeeeyyyyyooon........',
  '.......nyyoyyyyyyoyyyyyocooon.......',
  '.......nyyoyyyyyyoyyyyyocooon.......',
  '.......nooooooooooooooocccccn.......',
  '......neeewwwweeeeeyyyyyyoooon......',
  '.....noyyyyyyoyyyyyyoyyyooocoon.....',
  '.....noyyyyyyoyyyyyyoyyyooocoon.....',
  '......nooooooooooooooooocccccn......',
  '.....neeewwwweeeeeeyyyyyyyoooon.....',
  '....nyyyyoyyyyyyoyyyyyyooooooocn....',
  '....nyyyyoyyyyyyoyyyyyyooooooocn....',
  '.....nooooooooooooooooooocccccn.....',
  '.....neewwwwweeeennnnyyyyyoooon.....',
  '....noyyyyyyoyyynkkkknyyoocoooon....',
  '....noyyyyyyoyynkkkkkknyoocoooon....',
  '....noooooooooonkkkkkknooccccccn....',
  '.....neeeeeeeeenkkkkkknyyyoooon.....',
  '....nyyyoyyyyyynkkkkkknyooooocon....',
  '....nyyyoyyyyyynkkkkkknyooooocon....',
  '....noooooooonooooocccccnccccccn....',
  '...nnnnnnnnnnnnnnnnnnnnnnnnnnnnnn...',
  '..nooooooooocccccccccccccccccccccn..',
  '..nccccccccccccccccccccccccccccccn..',
  '...nnnnnnnnnnnnnnnnnnnnnnnnnnnnnn...',
  '......non..................ncn......',
  '......non..................ncn......',
  '......non..................ncn......',
  '......non..................ncn......',
  '......nnn..................nnn......',
];
const SKEP = { x: 14, y: 6 };
// The dark inside of the door (its widest rows), the landing board's top
// and the bench's front edge, in canvas pixels.
const DOOR = { x: SKEP.x + 16, y: SKEP.y + 21, w: 6, h: 5 };
const BOARD_Y = SKEP.y + 26;
const BENCH_EDGE = SKEP.y + 30;
const GROUND = SKEP.y + 35;

// The honey jar (the same jar as the honey in the pantry, src/ui/icons.ts,
// drawn smaller): a cloth lid tied on with string over golden honey.
const JAR: Sprite = [
  '..kkkkk..',
  '.krwrrwk.',
  'kkkkkkkkk',
  '.klyyylk.',
  'kweyyyook',
  'kwyyyyook',
  'kyyyyoock',
  '.koooock.',
  '..kkkkk..',
];
const JAR_AT = { x: 47, y: 36 };

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

// The honey jar, small, for the bubble: its cloth lid and the honey.
function jarIcon(ctx: CanvasRenderingContext2D, x: number, y: number): void {
  fill(ctx, PALETTE.rose, x + 1, y, 5, 1);
  fill(ctx, PALETTE.white, x + 2, y);
  fill(ctx, PALETTE.white, x + 4, y);
  fill(ctx, PALETTE.ink, x + 1, y + 1, 5, 1);
  fill(ctx, PALETTE.ink, x, y + 2, 1, 3);
  fill(ctx, PALETTE.ink, x + 6, y + 2, 1, 3);
  fill(ctx, PALETTE.butter, x + 1, y + 2, 5, 3);
  fill(ctx, PALETTE.peach, x + 4, y + 2, 2, 3);
  fill(ctx, PALETTE.peach, x + 1, y + 4, 5, 1);
  fill(ctx, PALETTE.white, x + 1, y + 2, 1, 2);
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

const HONEY = PALETTE.butter;
const HONEY_SHADE = PALETTE.peach;

const ease = (k: number) => (k < 0.5 ? 2 * k * k : 1 - 2 * (1 - k) * (1 - k));
const bezier = (a: number, b: number, c: number, k: number) => (1 - k) * (1 - k) * a + 2 * (1 - k) * k * b + k * k * c;

// A flower by the hive, nodding now and then. (x, y) is the middle of its
// head; its stem runs down to the grass.
interface Flower { x: number; y: number; petal: string; dark: string; offset: number }
const FLOWERS: readonly Flower[] = [
  { x: 7, y: 34, petal: PALETTE.pink, dark: PALETTE.rose, offset: 0 },
  { x: 59, y: 33, petal: PALETTE.lavender, dark: PALETTE.lilac, offset: 1300 },
];

function flower(ctx: CanvasRenderingContext2D, f: Flower, timeMs: number): void {
  const nod = Math.floor((timeMs + f.offset) / 700) % 5 === 2 ? 1 : 0;
  fill(ctx, PALETTE.moss, f.x, f.y + 2, 1, GROUND - f.y - 1);
  fill(ctx, PALETTE.leaf, f.x + 1, f.y + 5, 2, 1);
  fill(ctx, PALETTE.moss, f.x + 2, f.y + 4);
  fill(ctx, PALETTE.leaf, f.x - 2, f.y + 7, 2, 1);
  fill(ctx, PALETTE.moss, f.x - 2, f.y + 6);
  const x = f.x + nod;
  fill(ctx, f.petal, x - 1, f.y - 2, 2, 1);
  fill(ctx, f.petal, x - 2, f.y - 1, 1, 2);
  fill(ctx, f.dark, x + 1, f.y - 1, 1, 2);
  fill(ctx, f.dark, x - 1, f.y + 1, 2, 1);
  fill(ctx, f.petal, x - 1, f.y - 1);
  fill(ctx, PALETTE.butter, x, f.y - 1);
  fill(ctx, PALETTE.butter, x - 1, f.y);
  fill(ctx, PALETTE.peach, x, f.y);
}

// One bee: a striped body, an ink head and two wings that flap.
function bee(ctx: CanvasRenderingContext2D, x: number, y: number, right: boolean, flap: boolean): void {
  const f = (dx: number, dy: number, c: string) => fill(ctx, c, right ? x + dx : x + 3 - dx, y + dy);
  f(0, 0, PALETTE.butter); f(1, 0, PALETTE.ink); f(2, 0, PALETTE.butter); f(3, 0, PALETTE.ink);
  f(0, 1, PALETTE.peach); f(1, 1, PALETTE.ink); f(2, 1, PALETTE.butter);
  if (flap) {
    f(1, -1, PALETTE.white); f(2, -1, PALETTE.white); f(1, -2, PALETTE.white); f(0, -2, PALETTE.lavender);
  } else {
    f(1, -1, PALETTE.white); f(2, -1, PALETTE.lavender); f(0, -1, PALETTE.white);
  }
}

// A bee in flight leaves a faint dotted trail behind it.
function trail(ctx: CanvasRenderingContext2D, points: [number, number][]): void {
  points.forEach(([x, y], i) => {
    ctx.globalAlpha = 0.45 - i * 0.15;
    fill(ctx, PALETTE.white, Math.round(x), Math.round(y));
  });
  ctx.globalAlpha = 1;
}

// Where a foraging bee is, `k` of the way (0-1) through its trip: out of
// the door along the landing board, up and over to its flower, a little
// hover there, then home in a lower arc and back inside. Null while it's in.
const DOOR_SPOT: [number, number] = [DOOR.x + 1, BOARD_Y - 2];
function foragerAt(f: Flower, k: number): { x: number; y: number; right: boolean; flying: boolean } | null {
  const [dx, dy] = DOOR_SPOT;
  const fx = f.x - 1;
  const fy = f.y - 4;
  const out = fx > dx;
  if (k < 0.06) return { x: dx + Math.round((k / 0.06) * 3) * (out ? 1 : -1), y: dy, right: out, flying: false };
  const sx = dx + (out ? 3 : -3);
  if (k < 0.4) {
    const t = ease((k - 0.06) / 0.34);
    return { x: bezier(sx, (sx + fx) / 2, fx, t), y: bezier(dy, Math.min(dy, fy) - 16, fy, t), right: out, flying: true };
  }
  if (k < 0.6) {
    const t = (k - 0.4) / 0.2;
    return { x: fx + Math.round(Math.sin(t * Math.PI * 3)), y: fy + Math.round(Math.sin(t * Math.PI * 6) * 0.6), right: Math.sin(t * Math.PI * 3) < 0 ? !out : out, flying: true };
  }
  if (k < 0.9) {
    const t = ease((k - 0.6) / 0.3);
    return { x: bezier(fx, (sx + fx) / 2, sx, t), y: bezier(fy, Math.max(dy, fy) - 4, dy, t), right: !out, flying: true };
  }
  if (k < 0.96) return { x: sx + Math.round(((k - 0.9) / 0.06) * 3) * (out ? -1 : 1), y: dy, right: !out, flying: false };
  return null;
}

const TRIP_MS = 7000;
// Bees that potter about over the dome: the middle of each lazy loop, how
// far it swings each way, and where along it they start.
const LOOPERS: readonly [number, number, number, number, number][] = [
  [32, 6, 15, 3, 0],
  [30, 16, 19, 4, 2.6],
];
const LOOP_MS = 5200;

function bees(ctx: CanvasRenderingContext2D, level: number, timeMs: number): void {
  const flap = (i: number) => Math.floor(timeMs / 70 + i) % 2 === 0;
  const foragers = [1, 2, 2, 3][level];
  for (let i = 0; i < foragers; i++) {
    const f = FLOWERS[i % FLOWERS.length];
    const k = ((timeMs + i * TRIP_MS * 0.45) % TRIP_MS) / TRIP_MS;
    const at = foragerAt(f, k);
    if (!at) continue;
    if (at.flying) {
      const back = [0.012, 0.024].map((d) => foragerAt(f, (k - d + 1) % 1)).filter((p) => p?.flying) as { x: number; y: number }[];
      trail(ctx, back.map((p) => [p.x + 1, p.y + 1]));
    }
    // Walking on the board, the wings rest; flying, they buzz.
    bee(ctx, Math.round(at.x), Math.round(at.y), at.right, at.flying ? flap(i) : Math.floor(timeMs / 400) % 2 === 0);
  }
  LOOPERS.slice(0, [1, 1, 2, 2][level]).forEach(([cx, cy, rx, ry, start], i) => {
    const pos = (t: number) => {
      const a = (2 * Math.PI * t) / LOOP_MS + start;
      return [cx + rx * Math.sin(a), cy + ry * Math.sin(2 * a)] as [number, number];
    };
    const [x, y] = pos(timeMs);
    const right = pos(timeMs + 40)[0] >= x;
    trail(ctx, [pos(timeMs - 90), pos(timeMs - 180)].map(([px, py]) => [px + 1, py + 1]));
    bee(ctx, Math.round(x) - 2, Math.round(y), right, flap(i + 5));
  });
}

// A drip of honey hanging from (x, y): it slowly swells, lets a drop go
// that falls to `floor` and splats, then starts again.
function drip(ctx: CanvasRenderingContext2D, x: number, y: number, floor: number, timeMs: number, period: number): void {
  const t = (timeMs % period) / period;
  fill(ctx, HONEY, x, y, 1, 1);
  if (t < 0.62) {
    const len = 1 + Math.floor((t / 0.62) * 3);
    fill(ctx, HONEY, x, y, 1, len);
    if (len >= 3) fill(ctx, HONEY_SHADE, x, y + len, 1, 1);
    return;
  }
  if (t < 0.84) {
    const k = (t - 0.62) / 0.22;
    const dy = Math.round(y + 3 + (floor - y - 4) * k * k);
    fill(ctx, HONEY, x, dy, 1, 2);
    fill(ctx, PALETTE.white, x, dy, 1, 1);
    return;
  }
  const k = (t - 0.84) / 0.16;
  fill(ctx, HONEY, x - 1, floor, 3, 1);
  if (k < 0.5) {
    fill(ctx, HONEY, x - 2, floor - 1);
    fill(ctx, HONEY, x + 2, floor - 1);
  }
}

// Honey run down over the bench's front edge from the board above it.
function honeyRun(ctx: CanvasRenderingContext2D, x: number, w: number): void {
  fill(ctx, HONEY, x, BOARD_Y + 1, w, BENCH_EDGE - BOARD_Y);
  fill(ctx, HONEY_SHADE, x + w - 1, BOARD_Y + 2, 1, BENCH_EDGE - BOARD_Y - 1);
  fill(ctx, PALETTE.white, x, BOARD_Y + 2);
}

// Honey filling the doorway from the bottom, `rows` deep, with a lit
// surface and the honeycomb's cells showing through.
function doorHoney(ctx: CanvasRenderingContext2D, rows: number, timeMs: number): void {
  const top = DOOR.y + DOOR.h - rows;
  fill(ctx, HONEY, DOOR.x, top, DOOR.w, rows);
  fill(ctx, PALETTE.cream, DOOR.x, top, DOOR.w, 1);
  for (let y = top + 1; y < DOOR.y + DOOR.h; y++) {
    for (let x = DOOR.x; x < DOOR.x + DOOR.w; x++) {
      if ((x + (y % 2) * 2) % 3 === 0) fill(ctx, HONEY_SHADE, x, y);
    }
  }
  // A glint that slides across the surface.
  const g = Math.floor(timeMs / 260) % (DOOR.w + 6);
  if (g < DOOR.w) fill(ctx, PALETTE.white, DOOR.x + g, top);
}

// A little four-point sparkle that grows and shrinks.
function sparkle(ctx: CanvasRenderingContext2D, x: number, y: number, k: number): void {
  if (k < 0 || k >= 1) return;
  const size = k < 0.33 || k > 0.8 ? 0 : 1;
  fill(ctx, PALETTE.white, x, y);
  if (size) {
    fill(ctx, PALETTE.white, x, y - 1, 1, 3);
    fill(ctx, PALETTE.white, x - 1, y, 3, 1);
    fill(ctx, PALETTE.cream, x, y - 2);
    fill(ctx, PALETTE.cream, x, y + 2);
  }
}

// Fireflies drifting about at night, glowing on and off.
function fireflies(ctx: CanvasRenderingContext2D, timeMs: number): void {
  [[8, 24], [54, 18], [46, 30]].forEach(([bx, by], i) => {
    const x = Math.round(bx + 3 * Math.sin(timeMs / 1700 + i * 2));
    const y = Math.round(by + 2 * Math.sin(timeMs / 1100 + i * 3));
    const glow = Math.max(0, Math.sin(timeMs / 600 + i * 2.1));
    if (!glow) return;
    ctx.globalAlpha = glow * 0.35;
    fill(ctx, PALETTE.butter, x - 1, y, 3, 1);
    fill(ctx, PALETTE.butter, x, y - 1, 1, 3);
    ctx.globalAlpha = glow;
    fill(ctx, PALETTE.butter, x, y);
    ctx.globalAlpha = 1;
  });
}

// `level`: days of honey waiting (0-3).
export function drawHive(ctx: CanvasRenderingContext2D, level: number, night: boolean, timeMs: number): void {
  level = Math.max(0, Math.min(3, level));
  drawGardenBackground(ctx, YARD_WIDTH, YARD_HEIGHT, night, timeMs);
  FLOWERS.forEach((f) => flower(ctx, f, timeMs));
  draw(ctx, SKEP_ART, SKEP.x, SKEP.y);
  // One day: honey runs off the board and drips from the bench.
  if (level >= 1) {
    honeyRun(ctx, SKEP.x + 19, 2);
    drip(ctx, SKEP.x + 20, BENCH_EDGE + 1, GROUND, timeMs, 2600);
  }
  // Two: honey in the doorway, and a second drip.
  if (level >= 2) {
    doorHoney(ctx, level >= 3 ? 4 : 2, timeMs);
    honeyRun(ctx, SKEP.x + 9, 1);
    drip(ctx, SKEP.x + 9, BENCH_EDGE + 1, GROUND, timeMs + 1100, 3400);
  }
  // Full: a jar of honey waiting on the grass.
  if (level >= 3) draw(ctx, JAR, JAR_AT.x, JAR_AT.y);
  if (night) {
    // Everyone's in: the doorway glows warm (brighter, then softer), and
    // the light spills onto the landing board. Fireflies are out.
    const glow = 0.5 + 0.5 * Math.sin(timeMs / 650);
    const lit = level >= 3 ? 1 : 0;
    fill(ctx, PALETTE.peach, DOOR.x + 1, DOOR.y - 1, DOOR.w - 2, 1);
    fill(ctx, PALETTE.peach, DOOR.x, DOOR.y, DOOR.w, DOOR.h - lit * 4);
    ctx.globalAlpha = 0.4 + 0.6 * glow;
    fill(ctx, PALETTE.butter, DOOR.x + 1, DOOR.y, DOOR.w - 2, DOOR.h - lit * 4);
    ctx.globalAlpha = 0.3 + 0.4 * glow;
    fill(ctx, PALETTE.cream, DOOR.x + 2, DOOR.y + 1, DOOR.w - 4, Math.max(1, DOOR.h - 2 - lit * 4));
    if (level >= 2) doorHoney(ctx, level >= 3 ? 4 : 2, timeMs);
    ctx.globalAlpha = 0.25 + 0.35 * glow;
    fill(ctx, PALETTE.butter, DOOR.x - 1, BOARD_Y, DOOR.w + 2, 1);
    ctx.globalAlpha = 1;
    fireflies(ctx, timeMs);
    zzz(ctx, SKEP.x + 26, SKEP.y + 2, timeMs);
    return;
  }
  bees(ctx, level, timeMs);
  if (level >= 3) {
    bubble(ctx, JAR_AT.x - 1, JAR_AT.y - 13, timeMs, (x, y) => jarIcon(ctx, x, y));
    const k = (timeMs % 1400) / 1400;
    sparkle(ctx, JAR_AT.x + 9, JAR_AT.y + 3, k);
    sparkle(ctx, JAR_AT.x - 2, JAR_AT.y + 6, (k + 0.5) % 1);
  }
}

// Is (x, y) (in canvas pixels) on the hive or the jar? Tapping it collects.
export const onHive = (x: number, y: number): boolean =>
  (x >= SKEP.x + 3 && x <= SKEP.x + 32 && y >= SKEP.y - 2 && y <= GROUND) ||
  (x >= JAR_AT.x - 1 && x <= JAR_AT.x + 9 && y >= JAR_AT.y - 13 && y <= JAR_AT.y + 9);

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
