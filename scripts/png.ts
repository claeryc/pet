// Reads and writes PNG files with plain Node.js, for the art scripts.
// Reads the kinds Aseprite saves (RGBA, RGB, grey and indexed colour, 8 bits
// per channel, not interlaced) and always writes RGBA.

import { deflateSync, inflateSync } from 'node:zlib';

export interface Pixels {
  width: number;
  height: number;
  data: Uint8Array; // RGBA, row by row
}

const SIGNATURE = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]);

const crcTable = Array.from({ length: 256 }, (_, n) => {
  let c = n;
  for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
  return c >>> 0;
});
function crc32(buf: Buffer): number {
  let c = 0xffffffff;
  for (const byte of buf) c = crcTable[(c ^ byte) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}

export function readPng(file: Buffer): Pixels {
  if (!file.subarray(0, 8).equals(SIGNATURE)) throw new Error('Not a PNG file');
  let width = 0, height = 0, depth = 0, type = 0, interlace = 0;
  let palette: Buffer | null = null;
  let alphas: Buffer | null = null;
  const idat: Buffer[] = [];
  for (let at = 8; at < file.length; ) {
    const length = file.readUInt32BE(at);
    const kind = file.toString('latin1', at + 4, at + 8);
    const body = file.subarray(at + 8, at + 8 + length);
    if (kind === 'IHDR') {
      width = body.readUInt32BE(0);
      height = body.readUInt32BE(4);
      [depth, type] = [body[8], body[9]];
      interlace = body[12];
    } else if (kind === 'PLTE') palette = body;
    else if (kind === 'tRNS') alphas = body;
    else if (kind === 'IDAT') idat.push(body);
    at += 12 + length;
  }
  if (depth !== 8 || interlace !== 0) throw new Error('Only 8-bit, non-interlaced PNGs are supported');
  const channels = ({ 0: 1, 2: 3, 3: 1, 4: 2, 6: 4 } as Record<number, number>)[type];
  if (!channels) throw new Error(`Unknown PNG colour type ${type}`);
  const raw = inflateSync(Buffer.concat(idat));
  const stride = width * channels;
  const rows = Buffer.alloc(stride * height);
  // Undo the per-row filters.
  for (let y = 0; y < height; y++) {
    const filter = raw[y * (stride + 1)];
    const line = raw.subarray(y * (stride + 1) + 1, (y + 1) * (stride + 1));
    for (let x = 0; x < stride; x++) {
      const a = x >= channels ? rows[y * stride + x - channels] : 0;
      const b = y > 0 ? rows[(y - 1) * stride + x] : 0;
      const c = x >= channels && y > 0 ? rows[(y - 1) * stride + x - channels] : 0;
      let v = line[x];
      if (filter === 1) v += a;
      else if (filter === 2) v += b;
      else if (filter === 3) v += (a + b) >> 1;
      else if (filter === 4) {
        const p = a + b - c;
        const [pa, pb, pc] = [Math.abs(p - a), Math.abs(p - b), Math.abs(p - c)];
        v += pa <= pb && pa <= pc ? a : pb <= pc ? b : c;
      }
      rows[y * stride + x] = v & 0xff;
    }
  }
  const data = new Uint8Array(width * height * 4);
  for (let i = 0; i < width * height; i++) {
    const s = rows.subarray(i * channels, (i + 1) * channels);
    let rgba: number[];
    if (type === 6) rgba = [s[0], s[1], s[2], s[3]];
    else if (type === 2) rgba = [s[0], s[1], s[2], 255];
    else if (type === 4) rgba = [s[0], s[0], s[0], s[1]];
    else if (type === 0) rgba = [s[0], s[0], s[0], 255];
    else rgba = [palette![s[0] * 3], palette![s[0] * 3 + 1], palette![s[0] * 3 + 2], alphas?.[s[0]] ?? 255];
    data.set(rgba, i * 4);
  }
  return { width, height, data };
}

export function writePng({ width, height, data }: Pixels): Buffer {
  const chunk = (kind: string, body: Buffer) => {
    const len = Buffer.alloc(4);
    len.writeUInt32BE(body.length);
    const typed = Buffer.concat([Buffer.from(kind, 'latin1'), body]);
    const crc = Buffer.alloc(4);
    crc.writeUInt32BE(crc32(typed));
    return Buffer.concat([len, typed, crc]);
  };
  const header = Buffer.alloc(13);
  header.writeUInt32BE(width, 0);
  header.writeUInt32BE(height, 4);
  header[8] = 8; // bits per channel
  header[9] = 6; // RGBA
  const raw = Buffer.alloc((width * 4 + 1) * height);
  for (let y = 0; y < height; y++)
    raw.set(data.subarray(y * width * 4, (y + 1) * width * 4), y * (width * 4 + 1) + 1);
  return Buffer.concat([SIGNATURE, chunk('IHDR', header), chunk('IDAT', deflateSync(raw)), chunk('IEND', Buffer.alloc(0))]);
}

// A copy scaled up `times` times with no smoothing, so pixel art stays sharp.
export function scaleUp({ width, height, data }: Pixels, times: number): Pixels {
  const out = new Uint8Array(width * times * height * times * 4);
  for (let y = 0; y < height * times; y++)
    for (let x = 0; x < width * times; x++) {
      const from = (Math.floor(y / times) * width + Math.floor(x / times)) * 4;
      out.set(data.subarray(from, from + 4), (y * width * times + x) * 4);
    }
  return { width: width * times, height: height * times, data: out };
}

// Pictures side by side, top-aligned, with `gap` see-through pixels between.
export function sideBySide(pictures: Pixels[], gap: number): Pixels {
  const width = pictures.reduce((w, p) => w + p.width, 0) + gap * (pictures.length - 1);
  const height = Math.max(...pictures.map((p) => p.height));
  const data = new Uint8Array(width * height * 4);
  let left = 0;
  for (const p of pictures) {
    for (let y = 0; y < p.height; y++)
      data.set(p.data.subarray(y * p.width * 4, (y + 1) * p.width * 4), (y * width + left) * 4);
    left += p.width + gap;
  }
  return { width, height, data };
}

// Pictures one under the other, left-aligned, like the rows of a sheet.
export function stack(pictures: Pixels[]): Pixels {
  const width = Math.max(...pictures.map((p) => p.width));
  const height = pictures.reduce((h, p) => h + p.height, 0);
  const data = new Uint8Array(width * height * 4);
  let top = 0;
  for (const p of pictures) {
    for (let y = 0; y < p.height; y++)
      data.set(p.data.subarray(y * p.width * 4, (y + 1) * p.width * 4), ((top + y) * width) * 4);
    top += p.height;
  }
  return { width, height, data };
}
