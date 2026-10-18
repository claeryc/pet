// The doorstep, for Percy's orders. While you fill an order, the room
// becomes the front of the house: the front door behind the pet on the
// left, and on the right a mailbox with Percy the pigeon perched on top
// (in a little mail cap, with a satchel), bobbing his head.

import { PALETTE } from './palette';

export interface DeliveryScene {
  percy: boolean; // Percy is here (there's an order to fill)
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
  c: PALETTE.cocoa,
  y: PALETTE.butter,
  b: PALETTE.ocean,
  p: PALETTE.plum,
};

// Percy, facing left towards the pet: head and body apart, so the head can
// bob on its own like a pigeon's does.
const PERCY_HEAD: Sprite = [
  '...bbbb.....',
  '..bbbbbb....',
  '.byyyyyyb...',
  'oollkllll...',
  '..lllllll...',
  '...mmgmm....',
];
const PERCY_BODY: Sprite = [
  '..mmmmmll...',
  '..llllvvvlll',
  '.lllvvvvvvvl',
  '.lccccvvvll.',
  '..cycclvll..',
  '...cccll....',
  '....r..r....',
  '...rr.rr....',
];

const MAILBOX_X = 43; // the box's left edge
const MAILBOX_TOP = 24;
const GROUND = 34;

function draw(ctx: CanvasRenderingContext2D, sprite: Sprite, x: number, y: number, outline = false): void {
  const paint = (ox: number, oy: number, solid?: string) =>
    sprite.forEach((row, sy) => {
      for (let sx = 0; sx < row.length; sx++) {
        const color = COLORS[row[sx]];
        if (!color) continue;
        ctx.fillStyle = solid ?? color;
        ctx.fillRect(Math.round(x) + sx + ox, Math.round(y) + sy + oy, 1, 1);
      }
    });
  if (outline) for (const [ox, oy] of [[-1, 0], [1, 0], [0, -1], [0, 1]]) paint(ox, oy, PALETTE.ink);
  paint(0, 0);
}

export function drawDelivery(
  ctx: CanvasRenderingContext2D,
  width: number,
  height: number,
  scene: DeliveryScene,
  night: boolean,
  timeMs: number,
): void {
  // Sky on the right, past the corner of the house.
  ctx.fillStyle = night ? PALETTE.plum : PALETTE.sky;
  ctx.fillRect(0, 0, width, height);
  if (night) {
    const twinkle = Math.floor(timeMs / 700) % 2;
    ctx.fillStyle = PALETTE.white;
    ctx.fillRect(44, 5 + twinkle, 1, 1);
    ctx.fillRect(58, 12, 1, 1);
    ctx.fillRect(51, 3 - twinkle, 1, 1);
  } else {
    ctx.fillStyle = PALETTE.butter;
    ctx.fillRect(55, 4, 5, 5);
    ctx.fillStyle = PALETTE.white;
    ctx.fillRect(40, 9, 8, 2);
    ctx.fillRect(42, 8, 3, 1);
  }

  // The house wall, with siding lines, and its corner post.
  const wallW = 36;
  ctx.fillStyle = night ? PALETTE.lavender : PALETTE.peach;
  ctx.fillRect(0, 0, wallW, GROUND);
  ctx.fillStyle = night ? PALETTE.lilac : PALETTE.cream;
  for (let y = 3; y < GROUND; y += 4) ctx.fillRect(0, y, wallW, 1);
  ctx.fillStyle = PALETTE.cocoa;
  ctx.fillRect(wallW, 0, 2, GROUND);

  // The front door, with a round window, a knob and a lamp beside it.
  ctx.fillStyle = PALETTE.cocoa;
  ctx.fillRect(9, 10, 16, GROUND - 10);
  ctx.fillStyle = PALETTE.rose;
  ctx.fillRect(10, 11, 14, GROUND - 11);
  ctx.fillStyle = night ? PALETTE.butter : PALETTE.sky;
  ctx.fillRect(15, 14, 4, 3);
  ctx.fillRect(16, 13, 2, 5);
  ctx.fillStyle = PALETTE.butter;
  ctx.fillRect(21, 23, 2, 2);
  ctx.fillStyle = PALETTE.ink;
  ctx.fillRect(29, 12, 3, 1);
  ctx.fillStyle = PALETTE.butter;
  ctx.fillRect(29, 13, 3, 3);

  // Grass, a stone path from the door and a doormat.
  ctx.fillStyle = PALETTE.leaf;
  ctx.fillRect(0, GROUND, width, height - GROUND);
  ctx.fillStyle = PALETTE.mint;
  ctx.fillRect(0, GROUND, width, 1);
  ctx.fillStyle = PALETTE.lavender;
  for (const [x, y] of [[11, 38], [18, 41], [12, 44], [20, 46]]) ctx.fillRect(x, y, 5, 2);
  ctx.fillStyle = PALETTE.pink;
  ctx.fillRect(7, GROUND, 20, 2);

  // The mailbox on its post: a red box with a rounded top and a slot. Its
  // flag is up while there's an order.
  ctx.fillStyle = PALETTE.cocoa;
  ctx.fillRect(MAILBOX_X + 6, MAILBOX_TOP + 7, 2, height - MAILBOX_TOP - 9);
  draw(ctx, ['..rrrrrrrrrr..', '.rrrrrrrrrrrr.', 'rrrrrrrrrrrrrr', 'rrkkkkkrrrrrrr', 'rrrrrrrrrrrrrr', 'rrrrrrrrrrrrrr', 'cccccccccccccc'],
    MAILBOX_X, MAILBOX_TOP, true);
  ctx.fillStyle = PALETTE.ink;
  ctx.fillRect(MAILBOX_X + 6, MAILBOX_TOP + 8, 2, height - MAILBOX_TOP - 9);
  ctx.fillStyle = PALETTE.cocoa;
  ctx.fillRect(MAILBOX_X + 6, MAILBOX_TOP + 8, 1, height - MAILBOX_TOP - 9);
  if (scene.percy) {
    ctx.fillStyle = PALETTE.ink;
    ctx.fillRect(MAILBOX_X + 15, MAILBOX_TOP - 3, 1, 7);
    ctx.fillStyle = PALETTE.butter;
    ctx.fillRect(MAILBOX_X + 16, MAILBOX_TOP - 3, 3, 2);
  } else {
    ctx.fillStyle = PALETTE.butter;
    ctx.fillRect(MAILBOX_X + 15, MAILBOX_TOP + 3, 4, 1);
  }

  // Percy, perched on the mailbox. Every so often he bobs his head.
  if (scene.percy) {
    const bob = Math.floor(timeMs / 450) % 4 === 1 ? 1 : 0;
    const x = MAILBOX_X + 1;
    const bodyTop = MAILBOX_TOP - PERCY_BODY.length + 1;
    draw(ctx, PERCY_BODY, x, bodyTop, true);
    draw(ctx, PERCY_HEAD, x - bob, bodyTop - PERCY_HEAD.length + bob, true);
    // The body again over the head's outline, so they look joined.
    draw(ctx, PERCY_BODY.slice(0, 1), x, bodyTop);
  }
}
