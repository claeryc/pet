// Makes the placeholder sprite sheets in public/sprites/ (cute blobs with
// faces), so the game has art before the real art exists.
//
//   npm run sprites
//
// These PNGs are exactly the same format your own Aseprite sprite sheets
// should use (see docs/ART_GUIDE.md), so you can open one in Aseprite to see
// the layout, or paint over it. Careful: running this script again
// overwrites the placeholder files listed at the bottom, so give your own
// art different file names (and point manifest.json at them).
//
// Runs with plain Node.js (version 22.18 or newer), no extra packages.

import { writeFileSync } from 'node:fs';
import { deflateSync } from 'node:zlib';
import { PALETTE } from '../src/render/palette.ts';

const FRAME = 32;

// ---------- A tiny drawing surface that can save itself as a PNG ----------

class PixelCanvas {
  readonly width: number;
  readonly height: number;
  readonly data: Uint8Array;
  fillStyle = '#000000';
  constructor(width: number, height: number) {
    this.width = width;
    this.height = height;
    this.data = new Uint8Array(width * height * 4); // starts fully transparent
  }
  fillRect(x: number, y: number, w: number, h: number): void {
    const hex = this.fillStyle.replace('#', '');
    const [r, g, b] = [0, 2, 4].map((i) => parseInt(hex.slice(i, i + 2), 16));
    for (let py = Math.max(0, y); py < Math.min(this.height, y + h); py++) {
      for (let px = Math.max(0, x); px < Math.min(this.width, x + w); px++) {
        const i = (py * this.width + px) * 4;
        this.data.set([r, g, b, 255], i);
      }
    }
  }
  toPNG(): Buffer {
    // A PNG is a signature plus "chunks": IHDR (size), IDAT (pixels), IEND.
    const crcTable = Array.from({ length: 256 }, (_, n) => {
      let c = n;
      for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
      return c >>> 0;
    });
    const crc32 = (buf: Buffer) => {
      let c = 0xffffffff;
      for (const byte of buf) c = crcTable[(c ^ byte) & 0xff] ^ (c >>> 8);
      return (c ^ 0xffffffff) >>> 0;
    };
    const chunk = (type: string, body: Buffer) => {
      const len = Buffer.alloc(4);
      len.writeUInt32BE(body.length);
      const typed = Buffer.concat([Buffer.from(type, 'ascii'), body]);
      const crc = Buffer.alloc(4);
      crc.writeUInt32BE(crc32(typed));
      return Buffer.concat([len, typed, crc]);
    };
    const header = Buffer.alloc(13);
    header.writeUInt32BE(this.width, 0);
    header.writeUInt32BE(this.height, 4);
    header[8] = 8; // 8 bits per channel
    header[9] = 6; // RGBA
    const rowBytes = this.width * 4;
    const raw = Buffer.alloc((rowBytes + 1) * this.height);
    for (let y = 0; y < this.height; y++) {
      raw[y * (rowBytes + 1)] = 0; // no filter
      Buffer.from(this.data.buffer, y * rowBytes, rowBytes).copy(raw, y * (rowBytes + 1) + 1);
    }
    return Buffer.concat([
      Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
      chunk('IHDR', header),
      chunk('IDAT', deflateSync(raw)),
      chunk('IEND', Buffer.alloc(0)),
    ]);
  }
}

// ---------- The creatures ----------

type Face = 'happy' | 'sad' | 'sleep' | 'sick' | 'eat' | 'joy';
type Topper = 'none' | 'nubs' | 'ears' | 'sprout' | 'fluff' | 'leaf';

interface Look {
  body: string;
  shade: string;
  width: number; // body size in pixels
  height: number;
  topper: Topper; // what sits on top of the head
}

// One frame: how high it hops, how squashed it is, and a counter for
// little extras like floating Zs.
type Frame = [bounce: number, squash: number, extra: number];

// Rows of every creature sheet, in order. Must match manifest.json.
const ROWS: [Face, Frame[]][] = [
  ['happy', [[0, 1, 0], [2, 0, 0], [3, 0, 0], [1, 0, 0]]], // idle
  ['sad', [[0, 1, 0], [0, 1, 0], [1, 0, 0], [0, 1, 0]]], // sad
  ['sleep', [[0, 1, 0], [0, 1, 1], [0, 0, 2], [0, 0, 3]]], // sleep
  ['sick', [[0, 1, 0], [0, 2, 1], [0, 1, 2], [0, 2, 3]]], // sick
  ['eat', [[0, 1, 0], [0, 0, 1], [0, 1, 0], [0, 0, 1]]], // eat (mouth open/closed)
  ['joy', [[0, 2, 0], [3, 0, 0], [5, 0, 0], [2, 0, 0]]], // happy (big hop)
];

function drawCreature(c: PixelCanvas, ox: number, oy: number, look: Look, face: Face, [bounce, squash, extra]: Frame) {
  const px = (x: number, y: number, w: number, h: number, color: string) => {
    c.fillStyle = color;
    c.fillRect(ox + x, oy + y, w, h);
  };
  const sickLook = face === 'sick';
  const body = sickLook ? PALETTE.mint : look.body;
  const shade = sickLook ? PALETTE.leaf : look.shade;
  const bw = look.width + squash * 2;
  const bh = look.height - squash;
  const left = Math.round((FRAME - bw) / 2);
  const bottom = 28 - bounce;
  const top = bottom - bh;

  // Shadow on the floor (stays put while the body hops).
  px(left + 2, 29, bw - 4, 1, PALETTE.lavender);

  // Rounded body, row by row.
  for (let y = top; y < bottom; y++) {
    const fromTop = y - top;
    const fromBottom = bottom - 1 - y;
    let inset = [4, 2, 1][fromTop] ?? 0;
    inset = Math.max(inset, [2, 1][fromBottom] ?? 0);
    px(left + inset, y, bw - inset * 2, 1, fromBottom <= 1 ? shade : body);
  }

  // Head topper.
  const mid = Math.floor(FRAME / 2);
  if (look.topper === 'nubs') {
    px(left + 3, top - 1, 2, 1, body);
    px(left + bw - 5, top - 1, 2, 1, body);
  } else if (look.topper === 'ears') {
    px(left + 3, top - 2, 2, 2, body);
    px(left + bw - 5, top - 2, 2, 2, body);
  } else if (look.topper === 'sprout') {
    px(mid, top - 3, 1, 3, PALETTE.leaf);
    px(mid - 2, top - 4, 2, 2, PALETTE.leaf);
    px(mid + 1, top - 4, 2, 2, PALETTE.mint);
  } else if (look.topper === 'fluff') {
    for (let x = left + 3; x < left + bw - 3; x += 3) px(x, top - 2, 2, 2, body);
  } else if (look.topper === 'leaf') {
    px(mid - 3, top - 2, 6, 2, PALETTE.leaf);
    px(mid - 1, top - 3, 2, 1, PALETTE.leaf);
  }

  // Face.
  const eyeY = top + Math.floor(bh / 2) - 2;
  const eyeL = left + Math.floor(bw / 4);
  const eyeR = left + bw - Math.floor(bw / 4) - 2;
  const mx = mid - 1;
  if (face === 'happy' || face === 'eat') {
    px(eyeL, eyeY, 2, 2, PALETTE.ink);
    px(eyeR, eyeY, 2, 2, PALETTE.ink);
    px(eyeL, eyeY, 1, 1, PALETTE.white);
    px(eyeR, eyeY, 1, 1, PALETTE.white);
    if (face === 'eat' && extra === 1) {
      px(mx, eyeY + 3, 2, 2, PALETTE.ink); // mouth wide open: nom!
      px(mx, eyeY + 4, 2, 1, PALETTE.rose);
    } else if (face === 'eat') {
      px(mx - 1, eyeY + 4, 4, 1, PALETTE.ink); // chewing
    } else {
      px(mx - 1, eyeY + 3, 1, 1, PALETTE.ink);
      px(mx, eyeY + 4, 2, 1, PALETTE.ink);
      px(mx + 2, eyeY + 3, 1, 1, PALETTE.ink);
    }
  } else if (face === 'joy') {
    for (const ex of [eyeL, eyeR]) {
      px(ex, eyeY + 1, 1, 1, PALETTE.ink); // ^ ^ eyes
      px(ex + 1, eyeY, 1, 1, PALETTE.ink);
      px(ex + 2, eyeY + 1, 1, 1, PALETTE.ink);
    }
    px(mx - 1, eyeY + 3, 4, 1, PALETTE.ink); // big smile
    px(mx, eyeY + 4, 2, 1, PALETTE.rose);
    if (extra === 0 && bounce > 0) px(left + bw, top - 2, 1, 1, PALETTE.butter); // sparkle
  } else if (face === 'sad') {
    px(eyeL, eyeY + 1, 2, 1, PALETTE.ink);
    px(eyeR, eyeY + 1, 2, 1, PALETTE.ink);
    px(eyeL, eyeY + 3, 1, 2, PALETTE.sky);
    px(mx, eyeY + 4, 2, 1, PALETTE.ink);
  } else if (face === 'sleep') {
    px(eyeL - 1, eyeY + 1, 3, 1, PALETTE.ink);
    px(eyeR, eyeY + 1, 3, 1, PALETTE.ink);
    px(mx, eyeY + 4, 2, 1, PALETTE.plum);
    const zx = Math.min(left + bw - 1, FRAME - 5);
    const zy = Math.max(0, top - 4 - extra);
    px(zx, zy, 4, 1, PALETTE.white);
    px(zx + 2, zy + 1, 1, 1, PALETTE.white);
    px(zx + 1, zy + 2, 1, 1, PALETTE.white);
    px(zx, zy + 3, 4, 1, PALETTE.white);
  } else {
    for (const ex of [eyeL, eyeR]) {
      px(ex, eyeY, 2, 2, PALETTE.ink); // dizzy eyes
      px(ex, eyeY, 1, 1, PALETTE.mint);
    }
    px(mx - 1, eyeY + 4, 1, 1, PALETTE.ink);
    px(mx, eyeY + 3, 1, 1, PALETTE.ink);
    px(mx + 1, eyeY + 4, 1, 1, PALETTE.ink);
    px(mx + 2, eyeY + 3, 1, 1, PALETTE.ink);
    px(left + bw - 3, top + 1 + extra, 1, 2, PALETTE.sky); // sweat drop
  }
  if (!sickLook) {
    px(eyeL - 2, eyeY + 2, 2, 1, PALETTE.blush);
    px(eyeR + 2, eyeY + 2, 2, 1, PALETTE.blush);
  }
}

function creatureSheet(look: Look): PixelCanvas {
  const c = new PixelCanvas(FRAME * 4, FRAME * ROWS.length);
  ROWS.forEach(([face, frames], row) =>
    frames.forEach((f, col) => drawCreature(c, col * FRAME, row * FRAME, look, face, f)),
  );
  return c;
}

// The egg only has one animation: a gentle wobble.
function eggSheet(): PixelCanvas {
  const c = new PixelCanvas(FRAME * 4, FRAME);
  const tilts = [0, 1, 0, -1];
  tilts.forEach((tilt, col) => {
    const ox = col * FRAME;
    const px = (x: number, y: number, w: number, h: number, color: string) => {
      c.fillStyle = color;
      c.fillRect(ox + x, y, w, h);
    };
    px(10, 29, 12, 1, PALETTE.lavender); // shadow
    const widths = [4, 8, 10, 12, 12, 14, 14, 14, 14, 14, 14, 14, 12, 12, 10, 8];
    widths.forEach((w, i) => {
      const y = 13 + i;
      const shift = Math.round((tilt * (16 - i)) / 8); // lean the top
      const x = 16 - w / 2 + shift;
      px(x, y, w, 1, i > 13 ? PALETTE.peach : PALETTE.cream);
      px(x - 1, y, 1, 1, PALETTE.ink);
      px(x + w, y, 1, 1, PALETTE.ink);
    });
    px(14 + Math.round(tilt * 2), 12, 4, 1, PALETTE.ink); // top outline
    px(11, 29, 10, 1, PALETTE.ink); // bottom outline
    px(13 + tilt, 18, 2, 2, PALETTE.pink); // spots
    px(18 + tilt, 22, 3, 2, PALETTE.sky);
    px(12, 25, 2, 1, PALETTE.butter);
  });
  return c;
}

// ---------- Which files to make ----------

const LOOKS: Record<string, Look> = {
  baby: { body: PALETTE.pink, shade: PALETTE.rose, width: 14, height: 11, topper: 'nubs' },
  teen: { body: PALETTE.pink, shade: PALETTE.rose, width: 20, height: 16, topper: 'ears' },
  'adult-sunny': { body: PALETTE.butter, shade: PALETTE.peach, width: 22, height: 18, topper: 'sprout' },
  'adult-puffy': { body: PALETTE.lavender, shade: PALETTE.lilac, width: 24, height: 17, topper: 'fluff' },
  'adult-mossy': { body: PALETTE.sky, shade: PALETTE.ocean, width: 22, height: 17, topper: 'leaf' },
};

const out = new URL('../public/sprites/', import.meta.url);
writeFileSync(new URL('egg.png', out), eggSheet().toPNG());
for (const [name, look] of Object.entries(LOOKS)) {
  writeFileSync(new URL(`${name}.png`, out), creatureSheet(look).toPNG());
}
console.log('Placeholder sprites written to public/sprites/');
