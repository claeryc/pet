// Percy's scene, for filling an order. The room makes way for a meadow
// where Percy the pigeon (in his red post cap, with a letter) stands beside
// one small crate per thing he asked for. The crates sit on an open net
// spread out on the grass: that's how Percy carries them off. He's strong,
// but cute. A crate is open and empty at first, gets a few things peeking
// out once you've put something in, and is closed with a lid once full.

import { PALETTE } from './palette';

export type CrateFill = 'empty' | 'some' | 'full';

export interface DeliveryScene {
  percy: boolean; // Percy is here (there's an order to fill)
  crates: CrateFill[]; // one per box in the order
}

type Sprite = string[];
const COLORS: Record<string, string> = {
  k: PALETTE.ink,
  l: PALETTE.lilac,
  v: PALETTE.lavender,
  w: PALETTE.white,
  m: PALETTE.mint,
  g: PALETTE.leaf,
  o: PALETTE.peach,
  r: PALETTE.rose,
  p: PALETTE.pink,
  c: PALETTE.cocoa,
  y: PALETTE.butter,
  b: PALETTE.ocean,
  s: PALETTE.sky,
  e: PALETTE.cream,
  h: PALETTE.blush,
  d: PALETTE.deep,
  x: PALETTE.berry,
};

// Percy, a round blue pigeon in a big red post cap with a gold badge, with
// a shimmery neck and a letter tucked under his wing. Blue and red so he
// stands apart from the pets, who are mostly lilac and pastel. His head
// and body are apart, so the head can bob on its own like a pigeon's.

// Facing you, like the pets do, wings out: how he waits in his meadow.
const PERCY_FRONT_HEAD: Sprite = [
  '.......rrrrrr.......',
  '.....rrrryrrrr......',
  '....rrrrrrrrrrr.....',
  '...kkkkkkkkkkkkk....',
  '....bbbbbbbbbbb.....',
  '...bbbbbbbbbbbbb....',
  '...bbwkbbbbbwkbb....',
  '...bbkkbbbbbkkbb....',
  '...bhhbboooobhhb....',
  '...bbbbbbooobbbbb...',
];
const PERCY_FRONT_BODY: Sprite = [
  '....bbmmmppmmmbb....',
  '.bbbbmmmppppmmmbbbb.',
  'bbdbbssssssssssbbdbb',
  'beeeebsssssssssbdbb.',
  'beexebssssssssssbbb.',
  'beeeebsssssssssssb..',
  '.bbbbssssssssssssb..',
  '....sssssssssssss...',
  '.....sssssssssss....',
  '.......oo...oo......',
  '......ooo...ooo.....',
];

// From the side, facing right: how he walks on journeys.
const PERCY_SIDE_HEAD: Sprite = [
  '.......rrrrr........',
  '......rrrryrrr......',
  '.....rrrrrrrrrr.....',
  '.....kkkkkkkkkkkkk..',
  '......bbbbbbbbbbb...',
  '.....bbbbbbbbbwkbb..',
  '.....bbbbbbbbbkkbbo.',
  '.....bbbbbbbbhhbbooo',
  '.....bbbbbbbbbbbbo..',
];
const PERCY_SIDE_BODY: Sprite = [
  '......bbbmmmppmmb...',
  '....bbbbbmmmppmmbb..',
  '..bbbbbbbbsssssssbb.',
  '.bbdbbbbbbsssssssss.',
  'bbbdbbeeeebssssssss.',
  'bbbbdbeexebssssssss.',
  '.bbbbbeeeebsssssss..',
  '..bbbbbbbbssssssss..',
  '....bbsssssssssss...',
  '......sssssssss.....',
];
// His feet from the side: standing, and the two steps of a walk.
const PERCY_SIDE_FEET: Sprite[] = [
  ['........oo..oo......', '.......ooo.ooo......'],
  ['........oo..oo......', '.......ooo..........'],
  ['........oo..oo......', '...........ooo......'],
];

function bobOf(timeMs: number): number {
  return Math.floor(timeMs / 450) % 4 === 1 ? 1 : 0;
}

// Percy from the side, facing right, with his feet on row `footY`. Every
// so often he bobs his head. While `walking`, he steps from foot to foot.
// His outline is dark blue, like a blue pet's.
export function drawPercy(ctx: CanvasRenderingContext2D, x: number, footY: number, timeMs: number, walking = false): void {
  const bob = bobOf(timeMs);
  const feet = PERCY_SIDE_FEET[walking ? 1 + (Math.floor(timeMs / 200) % 2) : 0];
  const body = [...PERCY_SIDE_BODY, ...feet];
  const bodyTop = footY + 1 - body.length;
  draw(ctx, body, x, bodyTop, PALETTE.deep);
  draw(ctx, PERCY_SIDE_HEAD, x + bob, bodyTop - PERCY_SIDE_HEAD.length + bob, PALETTE.deep);
  // The body's top again over the head's outline, so they look joined.
  draw(ctx, body.slice(0, 1), x, bodyTop);
}

// Percy facing you, with his feet on row `footY`. His head bobs down.
function drawPercyFront(ctx: CanvasRenderingContext2D, x: number, footY: number, timeMs: number): void {
  const bob = bobOf(timeMs);
  const bodyTop = footY + 1 - PERCY_FRONT_BODY.length;
  draw(ctx, PERCY_FRONT_BODY, x, bodyTop, PALETTE.deep);
  draw(ctx, PERCY_FRONT_HEAD, x, bodyTop - PERCY_FRONT_HEAD.length + bob, PALETTE.deep);
  draw(ctx, PERCY_FRONT_BODY.slice(0, 1), x, bodyTop);
}

// A small wooden crate, by how full it is.
const CRATES: Record<CrateFill, Sprite> = {
  empty: ['cccccccccc', 'ckkkkkkkkc', 'oooooooooo', 'occcccccco', 'oooooooooo', 'occcccccco', 'oooooooooo', 'cccccccccc'],
  some: ['..g.......', 'cgmrkkkkkc', 'oooooooooo', 'occcccccco', 'oooooooooo', 'occcccccco', 'oooooooooo', 'cccccccccc'],
  full: ['.cccccccc.', 'cyyyyyyyyc', 'cccccccccc', 'occcccccco', 'oooooooooo', 'occcccccco', 'oooooooooo', 'cccccccccc'],
};

const GRASS_TOP = 30;
const NET = { left: 21, right: 61, top: 37, bottom: 45 }; // the net on the grass
const CRATE_W = 10;
const CRATE_BOTTOM = 41; // the crates stand on the net

function draw(ctx: CanvasRenderingContext2D, sprite: Sprite, x: number, y: number, outline?: string): void {
  const paint = (ox: number, oy: number, solid?: string) =>
    sprite.forEach((row, sy) => {
      for (let sx = 0; sx < row.length; sx++) {
        const color = COLORS[row[sx]];
        if (!color) continue;
        ctx.fillStyle = solid ?? color;
        ctx.fillRect(Math.round(x) + sx + ox, Math.round(y) + sy + oy, 1, 1);
      }
    });
  if (outline) for (const [ox, oy] of [[-1, 0], [1, 0], [0, -1], [0, 1]]) paint(ox, oy, outline);
  paint(0, 0);
}

// The open net, spread flat: a criss-cross mesh with a rope edge and a
// knot at each corner.
function drawNet(ctx: CanvasRenderingContext2D): void {
  const { left, right, top, bottom } = NET;
  ctx.fillStyle = PALETTE.cream;
  for (let y = top; y <= bottom; y++) {
    for (let x = left; x <= right; x++) {
      if ((x + y) % 4 === 0 || (x - y + 400) % 4 === 0) ctx.fillRect(x, y, 1, 1);
    }
  }
  ctx.fillStyle = PALETTE.cocoa;
  ctx.fillRect(left, top, right - left + 1, 1);
  ctx.fillRect(left, bottom, right - left + 1, 1);
  ctx.fillRect(left, top, 1, bottom - top + 1);
  ctx.fillRect(right, top, 1, bottom - top + 1);
  for (const [x, y] of [[left, top], [right, top], [left, bottom], [right, bottom]]) {
    ctx.fillRect(x - 1, y - 1, 3, 3);
  }
}

export function drawDelivery(
  ctx: CanvasRenderingContext2D,
  width: number,
  height: number,
  scene: DeliveryScene,
  night: boolean,
  timeMs: number,
): void {
  // Sky, a far hill and grass.
  ctx.fillStyle = night ? PALETTE.plum : PALETTE.sky;
  ctx.fillRect(0, 0, width, height);
  if (night) {
    const twinkle = Math.floor(timeMs / 700) % 2;
    ctx.fillStyle = PALETTE.butter;
    ctx.fillRect(52, 4, 3, 1);
    ctx.fillRect(51, 5, 3, 2);
    ctx.fillRect(52, 7, 3, 1);
    ctx.fillStyle = PALETTE.white;
    ctx.fillRect(10, 5 + twinkle, 1, 1);
    ctx.fillRect(30, 3, 1, 1);
    ctx.fillRect(42, 10 - twinkle, 1, 1);
  } else {
    ctx.fillStyle = PALETTE.butter;
    ctx.fillRect(52, 3, 5, 5);
    const drift = Math.floor(timeMs / 1500) % (width + 12);
    ctx.fillStyle = PALETTE.white;
    ctx.fillRect(drift - 12, 9, 9, 2);
    ctx.fillRect(drift - 10, 8, 4, 1);
  }
  ctx.fillStyle = night ? PALETTE.lilac : PALETTE.mint;
  for (let x = 0; x < width; x++) {
    const h = Math.round(4 + 3 * Math.sin((x + 6) / 9));
    ctx.fillRect(x, GRASS_TOP - h, 1, h);
  }
  ctx.fillStyle = PALETTE.leaf;
  ctx.fillRect(0, GRASS_TOP, width, height - GRASS_TOP);
  ctx.fillStyle = PALETTE.mint;
  ctx.fillRect(0, GRASS_TOP, width, 1);
  for (const [x, y] of [[4, 44], [14, 33], [26, 34], [60, 33], [8, 38]]) {
    ctx.fillRect(x, y, 1, 1);
    ctx.fillRect(x + 2, y, 1, 1);
    ctx.fillRect(x + 1, y - 1, 1, 1);
  }

  drawNet(ctx);

  // The crates on the net, side by side and centred on it.
  const n = scene.crates.length;
  const gap = 3;
  const span = n * CRATE_W + (n - 1) * gap;
  const start = Math.round((NET.left + NET.right + 1 - span) / 2);
  scene.crates.forEach((fill, i) => {
    const crate = CRATES[fill];
    draw(ctx, crate, start + i * (CRATE_W + gap), CRATE_BOTTOM - crate.length, PALETTE.ink);
  });

  // Percy, on the grass beside his crates.
  if (scene.percy) drawPercyFront(ctx, 1, 41, timeMs);
}
