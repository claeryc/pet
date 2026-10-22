// Makes the placeholder art, so the game has pictures before the real art
// exists:
//   - sprite sheets (PNG) in public/sprites/, which the game loads, and
//   - matching Aseprite files in art/, ready to paint over, plus
//     art/_template.aseprite, a blank file for starting a new character.
//
//   npm run sprites           (only makes files that don't exist yet)
//   npm run sprites -- --force   (replaces all of them with placeholders)
//
// Without --force it never overwrites a file, so your own art is safe.
// See docs/ART_GUIDE.md. Runs with plain Node.js 22.18 or newer, no extra
// packages.

import { existsSync, mkdirSync, writeFileSync } from 'node:fs';
import { dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { deflateSync } from 'node:zlib';
import { PALETTE } from '../src/render/palette.ts';
import { writeAseprite, type AseLayer } from './aseprite.ts';

const FRAME = 32;

// ---------- A tiny drawing surface that can save itself as a PNG ----------

class PixelCanvas {
  readonly width: number;
  readonly height: number;
  readonly data: Uint8Array;
  fillStyle = '#000000';
  alpha = 255;
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
        this.data.set([r, g, b, this.alpha], i);
      }
    }
  }
  isEmpty(x: number, y: number): boolean {
    if (x < 0 || y < 0 || x >= this.width || y >= this.height) return true;
    return this.data[(y * this.width + x) * 4 + 3] === 0;
  }
  // Copies another canvas onto this one at (dx, dy), skipping see-through pixels.
  blit(src: PixelCanvas, dx: number, dy: number): void {
    for (let y = 0; y < src.height; y++)
      for (let x = 0; x < src.width; x++) {
        if (src.isEmpty(x, y)) continue;
        const i = (y * src.width + x) * 4;
        this.data.set(src.data.subarray(i, i + 4), ((dy + y) * this.width + dx + x) * 4);
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

type Face = 'happy' | 'sad' | 'sleep' | 'sick' | 'eat' | 'joy' | 'cheerful';
type Topper =
  | 'none' | 'nubs' | 'ears' | 'bunny' | 'sprout' | 'fluff' | 'spikes' | 'crystals' | 'shards'
  | 'leaves' | 'mushroom' | 'antenna' | 'halo' | 'moon';
type Extra = 'spots' | 'wings' | 'twinkle';

interface Look {
  body: string;
  shade: string;
  width: number; // body size in pixels
  height: number;
  topper: Topper; // what sits on top of the head
  detail?: string; // colour for spikes, spots and other details
  extras?: Extra[];
  idleSet?: string; // extra idle moves from IDLE_SETS, drawn below the usual rows
}

// One frame: how high it hops, how squashed it is (negative is stretched
// tall), a counter for little extras like floating Zs, and how far the top
// leans sideways (negative is left).
type Frame = [bounce: number, squash: number, extra: number, lean?: number];

// Rows of every creature sheet, in order. Must match manifest.json.
const ROWS: [tag: string, face: Face, frameMs: number, frames: Frame[]][] = [
  ['idle', 'happy', 220, [[0, 1, 0], [2, 0, 0], [3, 0, 0], [1, 0, 0]]],
  ['sad', 'sad', 400, [[0, 1, 0], [0, 1, 0], [1, 0, 0], [0, 1, 0]]],
  ['sleep', 'sleep', 600, [[0, 1, 0], [0, 1, 1], [0, 0, 2], [0, 0, 3]]],
  ['sick', 'sick', 350, [[0, 1, 0], [0, 2, 1], [0, 1, 2], [0, 2, 3]]],
  ['eat', 'eat', 180, [[0, 1, 0], [0, 0, 1], [0, 1, 0], [0, 0, 1]]], // mouth open/closed
  ['happy', 'joy', 140, [[0, 2, 0], [3, 0, 0], [4, 0, 0], [2, 0, 0]]], // big hop
  ['cheerful', 'cheerful', 320, [[0, 1, 0], [0, 0, 1], [0, 0, 2], [0, 1, 3]]], // calm and happy, no jump
];

// Idle sets: extra idle moves, on the rows after ROWS. Must match the
// 'idleSets' in manifest.json.
const IDLE_SETS: Record<string, typeof ROWS> = {
  curious: [
    ['idle-look', 'happy', 260, [[0, 0, 0, -1], [0, 0, 0, -2], [0, 0, 0, -2], [0, 0, 0, -1]]], // leans to look left
    ['idle-stretch', 'cheerful', 260, [[0, 0, 0], [0, -1, 0], [0, -2, 0], [0, -1, 0]]], // stretches up tall
  ],
};

// Adds a dark 1-pixel outline around everything drawn on the canvas.
function addOutline(c: PixelCanvas): void {
  const outline: [number, number][] = [];
  for (let y = 0; y < c.height; y++)
    for (let x = 0; x < c.width; x++)
      if (c.isEmpty(x, y) && [[1, 0], [-1, 0], [0, 1], [0, -1]].some(([dx, dy]) => !c.isEmpty(x + dx, y + dy)))
        outline.push([x, y]);
  c.fillStyle = PALETTE.ink;
  for (const [x, y] of outline) c.fillRect(x, y, 1, 1);
}

// Draws one 32x32 frame of a creature.
function drawCreature(look: Look, face: Face, [bounce, squash, extra, lean = 0]: Frame, col: number): PixelCanvas {
  const c = new PixelCanvas(FRAME, FRAME);
  const px = (x: number, y: number, w: number, h: number, color: string) => {
    c.fillStyle = color;
    c.fillRect(x, y, w, h);
  };
  const sickLook = face === 'sick';
  const body = sickLook ? PALETTE.mint : look.body;
  const shade = sickLook ? PALETTE.leaf : look.shade;
  const detail = look.detail ?? shade;
  const has = (e: Extra) => look.extras?.includes(e) ?? false;
  const bw = look.width + squash * 2;
  const bh = look.height - squash;
  const left = Math.round((FRAME - bw) / 2);
  const bottom = 28 - bounce;
  const top = bottom - bh;
  const mid = Math.floor(FRAME / 2);

  // Little wings / puffs on the sides (behind the body).
  if (has('wings')) {
    const wy = top + Math.floor(bh / 2) - 2 - (col % 2);
    px(left - 3, wy, 4, 3, PALETTE.white);
    px(left + bw - 1, wy, 4, 3, PALETTE.white);
  }

  // Rounded body, row by row.
  for (let y = top; y < bottom; y++) {
    const fromTop = y - top;
    const fromBottom = bottom - 1 - y;
    let inset = [4, 2, 1][fromTop] ?? 0;
    inset = Math.max(inset, [2, 1][fromBottom] ?? 0);
    px(left + inset, y, bw - inset * 2, 1, fromBottom <= 1 ? shade : body);
  }
  if (has('spots') && !sickLook) {
    px(left + 3, top + 3, 2, 1, detail);
    px(left + bw - 5, top + 4, 2, 1, detail);
    px(left + 4, bottom - 4, 1, 1, detail);
  }

  // Head topper.
  if (look.topper === 'nubs') {
    px(left + 3, top - 1, 2, 1, body);
    px(left + bw - 5, top - 1, 2, 1, body);
  } else if (look.topper === 'ears') {
    px(left + 3, top - 2, 2, 2, body);
    px(left + bw - 5, top - 2, 2, 2, body);
  } else if (look.topper === 'bunny') {
    // Two tall ears, pink inside.
    for (const x of [left + 4, left + bw - 7]) {
      px(x, top - 5, 3, 5, body);
      px(x + 1, top - 4, 1, 3, sickLook ? PALETTE.leaf : PALETTE.pink);
    }
  } else if (look.topper === 'sprout') {
    px(mid, top - 3, 1, 3, PALETTE.leaf);
    px(mid - 2, top - 4, 2, 2, PALETTE.leaf);
    px(mid + 1, top - 4, 2, 2, PALETTE.mint);
  } else if (look.topper === 'fluff') {
    for (let x = left + 3; x < left + bw - 3; x += 3) px(x, top - 2, 2, 2, PALETTE.white);
  } else if (look.topper === 'spikes') {
    for (let x = left + 4; x < left + bw - 5; x += 4) {
      px(x + 1, top - 2, 1, 1, detail);
      px(x, top - 1, 3, 1, detail);
    }
  } else if (look.topper === 'crystals') {
    const crystal = (x: number, h: number, color: string) => {
      px(x + 1, top - h - 1, 1, 1, color);
      px(x, top - h, 3, h, color);
      px(x, top - h, 1, h - 1, PALETTE.white);
    };
    crystal(left + 4, 3, PALETTE.pink);
    crystal(mid - 1, 5, PALETTE.sky);
    crystal(left + bw - 7, 3, PALETTE.lavender);
  } else if (look.topper === 'shards') {
    // A few crystals growing out of its back, leaning to one side.
    const crystal = (x: number, h: number, color: string) => {
      px(x + 1, top - h - 1, 1, 1, color);
      px(x, top - h, 3, h, color);
      px(x, top - h, 1, h - 1, PALETTE.white);
    };
    crystal(left + 4, 4, PALETTE.ocean);
    crystal(left + 8, 2, PALETTE.pink);
    crystal(left + bw - 7, 2, PALETTE.ocean);
  } else if (look.topper === 'leaves') {
    for (const x of [left + 3, left + bw - 6]) {
      px(x, top - 2, 3, 2, PALETTE.leaf);
      px(x + 1, top - 3, 1, 1, PALETTE.mint);
    }
    px(mid - 1, top - 4, 3, 1, PALETTE.pink); // flower
    px(mid - 2, top - 3, 5, 1, PALETTE.pink);
    px(mid - 1, top - 2, 3, 2, PALETTE.pink);
    px(mid, top - 3, 1, 1, PALETTE.butter);
  } else if (look.topper === 'mushroom') {
    // A spotty toadstool cap over the top of the head.
    const cap = sickLook ? PALETTE.leaf : PALETTE.rose;
    [[6, -3], [2, -2], [0, -1], [-1, 0], [-1, 1]].forEach(([inset, dy]) => px(left + inset, top + dy, bw - inset * 2, 1, cap));
    px(left + 4, top - 1, 2, 1, PALETTE.white);
    px(mid + 1, top - 2, 2, 1, PALETTE.white);
    px(left + bw - 5, top, 2, 1, PALETTE.white);
  } else if (look.topper === 'antenna') {
    px(mid, top - 4, 1, 4, PALETTE.ink);
    px(mid, top - 9, 1, 5, PALETTE.butter); // a little star
    px(mid - 2, top - 7, 5, 1, PALETTE.butter);
    px(mid - 1, top - 8, 3, 3, PALETTE.butter);
    px(mid, top - 7, 1, 1, PALETTE.white);
  } else if (look.topper === 'halo') {
    // A floating halo (the outline makes it a ring).
    px(mid - 4, top - 6, 9, 1, PALETTE.butter);
  } else if (look.topper === 'moon') {
    // A little crescent moon floating above the head.
    const x = mid - 2;
    px(x + 1, top - 8, 3, 1, PALETTE.butter);
    px(x, top - 7, 2, 3, PALETTE.butter);
    px(x + 1, top - 4, 3, 1, PALETTE.butter);
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
  } else if (face === 'cheerful') {
    for (const ex of [eyeL, eyeR]) {
      px(ex, eyeY + 1, 1, 1, PALETTE.ink); // soft ^ ^ eyes
      px(ex + 1, eyeY, 1, 1, PALETTE.ink);
      px(ex + 2, eyeY + 1, 1, 1, PALETTE.ink);
    }
    px(mx - 1, eyeY + 3, 1, 1, PALETTE.ink); // gentle smile
    px(mx, eyeY + 4, 2, 1, PALETTE.ink);
    px(mx + 2, eyeY + 3, 1, 1, PALETTE.ink);
  } else if (face === 'joy') {
    for (const ex of [eyeL, eyeR]) {
      px(ex, eyeY + 1, 1, 1, PALETTE.ink); // ^ ^ eyes
      px(ex + 1, eyeY, 1, 1, PALETTE.ink);
      px(ex + 2, eyeY + 1, 1, 1, PALETTE.ink);
    }
    px(mx - 1, eyeY + 3, 4, 1, PALETTE.ink); // big smile
    px(mx, eyeY + 4, 2, 1, PALETTE.rose);
  } else if (face === 'sad') {
    px(eyeL, eyeY + 1, 2, 1, PALETTE.ink);
    px(eyeR, eyeY + 1, 2, 1, PALETTE.ink);
    px(eyeL, eyeY + 3, 1, 2, PALETTE.ocean);
    px(mx, eyeY + 4, 2, 1, PALETTE.ink);
  } else if (face === 'sleep') {
    px(eyeL - 1, eyeY + 1, 3, 1, PALETTE.ink);
    px(eyeR, eyeY + 1, 3, 1, PALETTE.ink);
    px(mx, eyeY + 4, 2, 1, PALETTE.plum);
  } else {
    for (const ex of [eyeL, eyeR]) {
      px(ex, eyeY, 2, 2, PALETTE.ink); // dizzy eyes
      px(ex, eyeY, 1, 1, PALETTE.mint);
    }
    px(mx - 1, eyeY + 4, 1, 1, PALETTE.ink);
    px(mx, eyeY + 3, 1, 1, PALETTE.ink);
    px(mx + 1, eyeY + 4, 1, 1, PALETTE.ink);
    px(mx + 2, eyeY + 3, 1, 1, PALETTE.ink);
  }
  if (!sickLook) {
    px(eyeL - 2, eyeY + 2, 2, 1, PALETTE.blush);
    px(eyeR + 2, eyeY + 2, 2, 1, PALETTE.blush);
  }

  // Lean the top sideways: the feet stay put and each row moves a bit more
  // the higher it is, so the head moves the whole way.
  if (lean) {
    const copy = c.data.slice();
    c.data.fill(0);
    const pivot = bottom - 3;
    for (let y = 0; y < FRAME; y++) {
      const shift = Math.round(lean * Math.min(1, Math.max(0, (pivot - y) / (pivot - top))));
      for (let x = 0; x < FRAME; x++) {
        const tx = x + shift;
        if (tx < 0 || tx >= FRAME) continue;
        const i = (y * FRAME + x) * 4;
        c.data.set(copy.subarray(i, i + 4), (y * FRAME + tx) * 4);
      }
    }
  }

  // A dark outline around everything drawn so far, so the pet stands out
  // on any background.
  addOutline(c);

  // Floating effects, drawn on top without an outline.
  if (face === 'sleep') {
    const zx = Math.min(left + bw - 1, FRAME - 5);
    const zy = Math.max(0, top - 6 - extra);
    px(zx, zy, 4, 1, PALETTE.white);
    px(zx + 2, zy + 1, 1, 1, PALETTE.white);
    px(zx + 1, zy + 2, 1, 1, PALETTE.white);
    px(zx, zy + 3, 4, 1, PALETTE.white);
  } else if (face === 'sick') {
    px(left + bw - 3, top + 1 + extra, 1, 2, PALETTE.ocean); // sweat drop
  } else if (face === 'cheerful' && extra > 0) {
    const hx = Math.min(left + bw, FRAME - 6);
    const hy = Math.max(0, top + 2 - extra * 2); // a little heart floats up
    px(hx, hy, 2, 1, PALETTE.pink);
    px(hx + 3, hy, 2, 1, PALETTE.pink);
    px(hx, hy + 1, 5, 1, PALETTE.pink);
    px(hx + 1, hy + 2, 3, 1, PALETTE.pink);
    px(hx + 2, hy + 3, 1, 1, PALETTE.pink);
  } else if (face === 'joy' && extra === 0 && bounce > 0) {
    px(left + bw + 1, top - 2, 1, 1, PALETTE.butter); // sparkle
  }
  if (has('twinkle') && !sickLook) {
    const spots = [[left - 3, top + 2], [left + bw + 1, top + 6], [left - 2, bottom - 5], [left + bw, top - 3]];
    for (const [i, [x, y]] of spots.entries()) {
      if ((i + col) % 2 === 0) continue;
      px(x + 1, y, 1, 3, PALETTE.white);
      px(x, y + 1, 3, 1, PALETTE.white);
      px(x + 1, y + 1, 1, 1, PALETTE.butter);
    }
  }

  // Shadow on the floor (stays put while the body hops), behind everything.
  const shadow = new PixelCanvas(FRAME, FRAME);
  shadow.fillStyle = PALETTE.lavender;
  shadow.fillRect(left + 2, 29, bw - 4, 1);
  shadow.blit(c, 0, 0);
  return shadow;
}

interface Art {
  png: PixelCanvas; // the sheet the game loads
  layers: AseLayer[]; // the same art as Aseprite layers
  frameMs: number[];
  tags: { name: string; from: number; to: number }[];
}

// Faint lines that show where the feet go and where the middle is. They live
// on a "guides" layer in Aseprite, which is never exported.
function guides(): Uint8Array {
  const c = new PixelCanvas(FRAME, FRAME);
  c.alpha = 90;
  c.fillStyle = PALETTE.rose;
  c.fillRect(0, 28, FRAME, 1); // feet stand on this row
  c.fillStyle = PALETTE.lilac;
  c.fillRect(0, 29, FRAME, 1); // shadow row
  c.fillStyle = PALETTE.ocean;
  c.fillRect(15, 0, 2, 28); // centre
  return c.data;
}

function creatureArt(look: Look | null): Art {
  const rows = [...ROWS, ...(look?.idleSet ? IDLE_SETS[look.idleSet] : [])];
  const png = new PixelCanvas(FRAME * 4, FRAME * rows.length);
  const cels: (Uint8Array | null)[] = [];
  const frameMs: number[] = [];
  const tags: Art['tags'] = [];
  rows.forEach(([tag, face, ms, frames], row) => {
    tags.push({ name: tag, from: cels.length, to: cels.length + frames.length - 1 });
    frames.forEach((f, col) => {
      frameMs.push(ms);
      if (!look) return cels.push(null);
      const frame = drawCreature(look, face, f, col);
      for (let x = 0; x < FRAME; x++)
        if (!frame.isEmpty(x, 0)) {
          console.warn(`Warning: a ${tag} frame touches the top edge; hats can't follow it.`);
          break;
        }
      png.blit(frame, col * FRAME, row * FRAME);
      cels.push(frame.data);
    });
  });
  const layers: AseLayer[] = [
    { name: 'guides', reference: true, cels: [guides()], sameEveryFrame: true },
    { name: 'pet', cels },
  ];
  return { png, layers, frameMs, tags };
}

// The egg only has one animation: a gentle wobble.
function eggArt(): Art {
  const png = new PixelCanvas(FRAME * 4, FRAME);
  const cels: Uint8Array[] = [];
  [0, 1, 0, -1].forEach((tilt, col) => {
    const c = new PixelCanvas(FRAME, FRAME);
    const px = (x: number, y: number, w: number, h: number, color: string) => {
      c.fillStyle = color;
      c.fillRect(x, y, w, h);
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
    png.blit(c, col * FRAME, 0);
    cels.push(c.data);
  });
  return {
    png,
    layers: [
      { name: 'guides', reference: true, cels: [guides()], sameEveryFrame: true },
      { name: 'pet', cels },
    ],
    frameMs: [300, 300, 300, 300],
    tags: [{ name: 'idle', from: 0, to: 3 }],
  };
}


// ---------- Hats ----------
// A hat picture is 16x16. Its bottom middle (x 8, last row) sits on the
// pet's head point. Each hat comes in a small and a large size.

type HatKind = 'beanie' | 'party-hat' | 'flower-crown' | 'tiny-crown' | 'starry-cap';
const HAT = 16;

function drawHat(kind: HatKind, large: boolean): PixelCanvas {
  const c = new PixelCanvas(HAT, HAT);
  const px = (x: number, y: number, w: number, h: number, color: string) => {
    c.fillStyle = color;
    c.fillRect(x, y, w, h);
  };
  const w = large ? 12 : 8; // brim width
  const left = 8 - w / 2;
  const bottom = HAT - 1; // last row the hat may use (the outline goes around it)
  if (kind === 'beanie') {
    const h = large ? 5 : 4;
    for (let i = 0; i < h; i++) {
      const inset = [3, 1][i] ?? 0;
      px(left + inset, bottom - h + i, w - inset * 2, 1, PALETTE.rose);
    }
    px(left, bottom - 1, w, 2, PALETTE.cream); // folded band
    px(7, bottom - h - 2, 2, 2, PALETTE.white); // pom-pom
  } else if (kind === 'party-hat') {
    const h = large ? 9 : 7;
    for (let i = 0; i < h; i++) {
      const rowW = Math.max(1, Math.round(((i + 1) / h) * (w - 2)));
      px(8 - Math.ceil(rowW / 2), bottom - h + i, rowW, 1, i % 3 === 1 ? PALETTE.butter : PALETTE.sky);
    }
    px(7, bottom - h - 2, 2, 2, PALETTE.pink); // pom-pom on the tip
  } else if (kind === 'starry-cap') {
    // A floppy night-sky cap with little stars, bent over at the tip.
    const h = large ? 8 : 6;
    for (let i = 0; i < h; i++) {
      const rowW = Math.max(2, Math.round(((i + 1) / h) * w));
      px(8 - Math.ceil(rowW / 2), bottom - h + i, rowW, 1, PALETTE.plum);
    }
    px(left, bottom, w, 1, PALETTE.butter); // band
    px(8 + 1, bottom - h - 1, 2, 1, PALETTE.plum); // the tip flops over
    px(8 + 3, bottom - h, 1, 1, PALETTE.butter); // a star on the tip
    px(7, bottom - h + 3, 1, 1, PALETTE.butter);
    px(large ? 5 : 6, bottom - 2, 1, 1, PALETTE.white);
    px(large ? 10 : 9, bottom - 3, 1, 1, PALETTE.butter);
  } else if (kind === 'flower-crown') {
    px(left, bottom - 1, w, 2, PALETTE.leaf);
    const colors = [PALETTE.pink, PALETTE.butter, PALETTE.white, PALETTE.pink];
    const step = large ? 3 : 2;
    for (let x = left, i = 0; x + 1 < left + w; x += step, i++) px(x + (large ? 1 : 0), bottom - 3, 2, 2, colors[i % colors.length]);
  } else {
    const h = large ? 5 : 4;
    px(left + 1, bottom - 2, w - 2, 3, PALETTE.butter);
    for (let x = left + 1; x < left + w - 1; x += large ? 3 : 2) px(x, bottom - h, 1, h - 2, PALETTE.butter); // points
    px(left + w - 2, bottom - h, 1, h - 2, PALETTE.butter);
    px(7, bottom - 1, 2, 1, PALETTE.rose); // gem
  }
  addOutline(c);
  return c;
}

function hatArt(kind: HatKind): Art {
  const small = drawHat(kind, false);
  const big = drawHat(kind, true);
  const png = new PixelCanvas(HAT * 2, HAT);
  png.blit(small, 0, 0);
  png.blit(big, HAT, 0);
  return {
    png,
    layers: [{ name: 'hat', cels: [small.data, big.data] }],
    frameMs: [500, 500],
    tags: [
      { name: 'small', from: 0, to: 0 },
      { name: 'large', from: 1, to: 1 },
    ],
  };
}

// ---------- Achievement tiers ----------
// The badges in the Collection: a 16x16 hexagon frame for each tier,
// bronze (an empty frame), silver (a small gem inside) and gold (a big one).
// Their metal colours aren't in the shared palette, so the file adds them.

const BADGE = 16;
type Tier = 'bronze' | 'silver' | 'gold';
// Highlight, light, mid and dark shades of each metal.
const METALS: Record<Tier, [string, string, string, string]> = {
  bronze: ['#f0c8a0', '#d29a6c', '#b67a4c', '#8a5534'],
  silver: ['#ffffff', '#dfe4ee', '#b7c0d4', '#8590a8'],
  gold: ['#fff0b0', '#ffd966', '#f2c14e', '#c8902a'],
};

// How deep a pixel is inside the hexagon: 0 on its outer edge, 1 just
// inside that, and so on (-1 outside). The hexagon is 14 wide and 16 tall,
// with straight sides and 2:1 slopes at the top and bottom.
function hexDepth(x: number, y: number): number {
  const dx = Math.abs(x - 7.5);
  const dy = Math.abs(y - 7.5);
  for (let t = 0; ; t++) if (dx > 7 - t || dx + 2 * dy > 16 - 2.2 * t) return t - 1;
}

// Which shade a face gets, lit from the top left: 0 (highlight) to 3
// (dark). The faces of a pointy-top hexagon face right, up-right, up-left,
// left, down-left and down-right.
function faceShade(x: number, y: number): number {
  const angle = (Math.atan2(7.5 - y, x - 7.5) * 180) / Math.PI;
  const face = Math.round((((angle % 360) + 360) % 360) / 60) % 6;
  return [2, 1, 0, 1, 2, 3][face];
}

function drawBadge(tier: Tier): PixelCanvas {
  const c = new PixelCanvas(BADGE, BADGE);
  const shades = METALS[tier];
  // The frame: 2 pixels of metal between outlines.
  for (let y = 0; y < BADGE; y++) {
    for (let x = 0; x < BADGE; x++) {
      const d = hexDepth(x, y);
      if (d < 0 || d > 3) continue;
      c.fillStyle = d === 0 || d === 3 ? PALETTE.ink : shades[faceShade(x, y)];
      c.fillRect(x, y, 1, 1);
    }
  }
  // Inside, silver has a small gem with a gap around it, and gold a big
  // one filling the frame (H highlight, L light, M mid, D dark).
  const gem = {
    bronze: [],
    silver: ['.HL.', 'HHLM', 'LLMD', '.MD.'],
    gold: ['.HHLL.', 'HHHLLM', 'HHLLMM', 'LLLMMD', 'LMMMDD', '.MMDD.'],
  }[tier];
  gem.forEach((row, gy) =>
    [...row].forEach((ch, gx) => {
      const i = 'HLMD'.indexOf(ch);
      if (i < 0) return;
      c.fillStyle = shades[i];
      c.fillRect(8 - row.length / 2 + gx, 8 - gem.length / 2 + gy, 1, 1);
    }),
  );
  return c;
}

function badgeArt(): Art {
  const tiers: Tier[] = ['bronze', 'silver', 'gold'];
  const frames = tiers.map(drawBadge);
  const png = new PixelCanvas(BADGE * tiers.length, BADGE);
  frames.forEach((f, i) => png.blit(f, BADGE * i, 0));
  return {
    png,
    layers: [{ name: 'badge', cels: frames.map((f) => f.data) }],
    frameMs: tiers.map(() => 500),
    tags: tiers.map((name, i) => ({ name, from: i, to: i })),
  };
}

// ---------- Which files to make ----------

// Path (without .png / .aseprite) -> look. Paths must match manifest.json.
const LOOKS: Record<string, Look> = {
  'stages/baby': { body: PALETTE.pink, shade: PALETTE.rose, width: 14, height: 11, topper: 'nubs' },
  'stages/teen': { body: PALETTE.pink, shade: PALETTE.rose, width: 20, height: 16, topper: 'ears' },
  // Basic: soft and simple.
  'characters/basic/dumpling': { body: PALETTE.peach, shade: PALETTE.cocoa, width: 20, height: 15, topper: 'nubs' },
  'characters/basic/bunbun': { body: PALETTE.cream, shade: PALETTE.peach, width: 22, height: 15, topper: 'bunny', idleSet: 'curious' },
  'characters/basic/cloudlet': { body: PALETTE.lavender, shade: PALETTE.lilac, width: 24, height: 17, topper: 'fluff', extras: ['wings'] },
  // Nature: leafy and green.
  'characters/nature/sprig': { body: PALETTE.mint, shade: PALETTE.leaf, width: 20, height: 16, topper: 'sprout' },
  'characters/nature/mosscap': { body: PALETTE.peach, shade: PALETTE.leaf, width: 22, height: 15, topper: 'mushroom', idleSet: 'curious' },
  'characters/nature/fernwhisk': { body: PALETTE.leaf, shade: PALETTE.cocoa, width: 24, height: 18, topper: 'leaves' },
  // Cave: spiky and rocky.
  'characters/cave/pebblit': { body: PALETTE.lilac, shade: PALETTE.plum, detail: PALETTE.plum, width: 20, height: 15, topper: 'spikes', extras: ['spots'] },
  'characters/cave/pebblit-amber': { body: PALETTE.butter, shade: PALETTE.cocoa, detail: PALETTE.cocoa, width: 20, height: 15, topper: 'spikes', extras: ['spots'] },
  'characters/cave/crystalback': { body: PALETTE.lavender, shade: PALETTE.plum, detail: PALETTE.lilac, width: 22, height: 15, topper: 'shards', extras: ['spots'] },
  'characters/cave/geodon': { body: PALETTE.ocean, shade: PALETTE.plum, detail: PALETTE.lavender, width: 24, height: 16, topper: 'crystals', extras: ['spots'] },
  // Sparkle: shiny and magical.
  'characters/sparkle/glimmer': { body: PALETTE.butter, shade: PALETTE.peach, width: 18, height: 13, topper: 'antenna' },
  'characters/sparkle/moonpip': { body: PALETTE.pink, shade: PALETTE.rose, width: 22, height: 14, topper: 'moon', extras: ['twinkle'] },
  'characters/sparkle/starwisp': { body: PALETTE.sky, shade: PALETTE.lilac, width: 24, height: 16, topper: 'halo', extras: ['twinkle'] },
};

const force = process.argv.includes('--force');
const root = fileURLToPath(new URL('..', import.meta.url));
const written: string[] = [];
const skipped: string[] = [];
function save(path: string, make: () => Buffer): void {
  const full = root + path;
  if (existsSync(full) && !force) return void skipped.push(path);
  mkdirSync(dirname(full), { recursive: true });
  writeFileSync(full, make());
  written.push(path);
}
function saveArt(path: string, art: Art, size = FRAME): void {
  save(`public/sprites/${path}.png`, () => art.png.toPNG());
  save(`art/${path}.aseprite`, () =>
    writeAseprite({ width: size, height: size, palette, frameMs: art.frameMs, layers: art.layers, tags: art.tags }),
  );
}

const palette = Object.entries(PALETTE).map(([name, hex]) => ({ name, hex }));
saveArt('stages/egg', eggArt());
for (const [path, look] of Object.entries(LOOKS)) saveArt(path, creatureArt(look));
for (const kind of ['beanie', 'party-hat', 'flower-crown', 'tiny-crown', 'starry-cap'] as HatKind[]) saveArt(`hats/${kind}`, hatArt(kind), HAT);
// The badge file also gets the metal colours.
{
  const art = badgeArt();
  const metals = Object.entries(METALS).flatMap(([tier, hexes]) =>
    hexes.map((hex, i) => ({ name: `${tier}-${['highlight', 'light', 'mid', 'dark'][i]}`, hex })),
  );
  save('public/sprites/badges/tiers.png', () => art.png.toPNG());
  save('art/badges/tiers.aseprite', () =>
    writeAseprite({ width: BADGE, height: BADGE, palette: [...palette, ...metals], frameMs: art.frameMs, layers: art.layers, tags: art.tags }),
  );
}
// A blank file with the right size, tags, palette and guides.
const blank = creatureArt(null);
save('art/_template.aseprite', () =>
  writeAseprite({ width: FRAME, height: FRAME, palette, frameMs: blank.frameMs, layers: blank.layers, tags: blank.tags }),
);

console.log(`Wrote ${written.length} files.`);
if (skipped.length) console.log(`Kept ${skipped.length} existing files (use --force to replace them).`);
