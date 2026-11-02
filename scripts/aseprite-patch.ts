// Reads and changes the tap shapes and slices of a map's .aseprite file in
// place, for the map lab (map-lab.html). Only these change:
//
//   - the first frame's cel on each "area:<id>" layer (its painted pixels),
//   - "area:<id>" layers that don't exist yet are added on top, hidden,
//   - the "label:", "pin:" and "flag:" slices.
//
// Every other byte of the file (the picture, the clouds, the lights, other
// slices, tags, the palette...) is copied as it is, so an artist's file
// keeps everything Aseprite put in it. Format reference:
// https://github.com/aseprite/aseprite/blob/main/docs/ase-file-specs.md

import { deflateSync, inflateSync } from 'node:zlib';
import type { AseSlice } from './aseprite.ts';
import { layerArea } from './map-data.ts';

const LAYER = 0x2004;
const CEL = 0x2005;
const CEL_EXTRA = 0x2006;
const USER_DATA = 0x2020;
const SLICE = 0x2022;

// The slices the lab owns: everything else is left alone.
export const isLabSlice = (name: string): boolean => /^\s*(label|pin|flag)\s*:/i.test(name);

interface Chunk {
  type: number;
  bytes: Buffer; // the whole chunk, size and type included
}

interface Parsed {
  width: number;
  height: number;
  depth: number; // bits per pixel: 32 (RGBA), 16 (grey) or 8 (indexed)
  transparent: number; // the see-through index, for indexed files
  chunks: Chunk[]; // the first frame's chunks
  frameStart: number;
  frameEnd: number;
  layers: string[]; // every layer's name, in file order (its index)
}

function parse(file: Buffer): Parsed {
  if (file.readUInt16LE(4) !== 0xa5e0) throw new Error('Not an Aseprite file');
  const width = file.readUInt16LE(8), height = file.readUInt16LE(10), depth = file.readUInt16LE(12);
  const frameStart = 128;
  const frameEnd = frameStart + file.readUInt32LE(frameStart);
  const count = file.readUInt32LE(frameStart + 12) || file.readUInt16LE(frameStart + 6);
  const chunks: Chunk[] = [];
  const layers: string[] = [];
  let c = frameStart + 16;
  for (let i = 0; i < count && c < frameEnd; i++) {
    const size = file.readUInt32LE(c);
    const type = file.readUInt16LE(c + 4);
    chunks.push({ type, bytes: file.subarray(c, c + size) });
    if (type === LAYER) {
      const length = file.readUInt16LE(c + 6 + 16);
      layers.push(file.toString('utf8', c + 6 + 18, c + 6 + 18 + length));
    }
    c += size;
  }
  return { width, height, depth, transparent: file.readUInt8(28), chunks, frameStart, frameEnd, layers };
}

// Which pixels are painted in a cel, on the whole canvas.
function celMask(p: Parsed, cel: Buffer): Uint8Array {
  const mask = new Uint8Array(p.width * p.height);
  const x0 = cel.readInt16LE(8), y0 = cel.readInt16LE(10);
  const kind = cel.readUInt16LE(13);
  if (kind !== 0 && kind !== 2) return mask; // linked or tilemap: not used for tap shapes
  const w = cel.readUInt16LE(22), h = cel.readUInt16LE(24);
  const raw = kind === 2 ? inflateSync(cel.subarray(26)) : cel.subarray(26);
  const bpp = p.depth / 8;
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    const X = x0 + x, Y = y0 + y;
    if (X < 0 || Y < 0 || X >= p.width || Y >= p.height) continue;
    const i = (y * w + x) * bpp;
    const on = p.depth === 32 ? raw[i + 3] > 0 : p.depth === 16 ? raw[i + 1] > 0 : raw[i] !== p.transparent;
    if (on) mask[Y * p.width + X] = 1;
  }
  return mask;
}

// The tap shapes (one 0/1 mask per area) and every slice, as the lab needs them.
export function readMap(file: Buffer): { width: number; height: number; areas: Record<string, Uint8Array>; slices: AseSlice[]; layers: string[] } {
  const p = parse(file);
  const areas: Record<string, Uint8Array> = {};
  p.layers.forEach((name) => {
    const id = layerArea(name);
    if (id) areas[id] = new Uint8Array(p.width * p.height);
  });
  for (const ch of p.chunks) {
    if (ch.type !== CEL) continue;
    const id = layerArea(p.layers[ch.bytes.readUInt16LE(6)] ?? '');
    if (id) areas[id] = celMask(p, ch.bytes);
  }
  const slices: AseSlice[] = [];
  for (const ch of p.chunks) {
    if (ch.type !== SLICE) continue;
    const b = ch.bytes;
    const keys = b.readUInt32LE(6);
    const length = b.readUInt16LE(18);
    const name = b.toString('utf8', 20, 20 + length);
    if (!keys) continue;
    const k = 20 + length;
    slices.push({ name, x: b.readInt32LE(k + 4), y: b.readInt32LE(k + 8), width: b.readUInt32LE(k + 12), height: b.readUInt32LE(k + 16) });
  }
  return { width: p.width, height: p.height, areas, slices, layers: p.layers };
}

function chunk(type: number, body: Buffer): Buffer {
  const head = Buffer.alloc(6);
  head.writeUInt32LE(body.length + 6);
  head.writeUInt16LE(type, 4);
  return Buffer.concat([head, body]);
}

function str(s: string): Buffer {
  const b = Buffer.from(s, 'utf8');
  const len = Buffer.alloc(2);
  len.writeUInt16LE(b.length);
  return Buffer.concat([len, b]);
}

// A hidden, editable, top-level layer at 55% opacity (a tap shape).
function layerChunk(name: string): Buffer {
  const head = Buffer.alloc(16);
  head.writeUInt16LE(2, 0); // flags: editable, not visible
  head.writeUInt16LE(0, 2); // normal layer
  head.writeUInt16LE(0, 4); // top level
  head.writeUInt8(140, 12); // opacity
  return chunk(LAYER, Buffer.concat([head, str(name)]));
}

// A whole-canvas compressed cel: painted pixels pink, the rest see-through.
function celChunk(layer: number, mask: Uint8Array, width: number, height: number): Buffer {
  const rgba = Buffer.alloc(width * height * 4);
  for (let i = 0; i < mask.length; i++) if (mask[i]) rgba.set([255, 64, 160, 255], i * 4);
  const head = Buffer.alloc(20);
  head.writeUInt16LE(layer, 0);
  head.writeInt16LE(0, 2);
  head.writeInt16LE(0, 4);
  head.writeUInt8(255, 6);
  head.writeUInt16LE(2, 7); // compressed image
  head.writeUInt16LE(width, 16);
  head.writeUInt16LE(height, 18);
  return chunk(CEL, Buffer.concat([head, deflateSync(rgba)]));
}

function sliceChunk(s: AseSlice): Buffer {
  const head = Buffer.alloc(12);
  head.writeUInt32LE(1, 0); // one key
  const key = Buffer.alloc(20);
  key.writeUInt32LE(0, 0); // from frame 0
  key.writeInt32LE(s.x, 4);
  key.writeInt32LE(s.y, 8);
  key.writeUInt32LE(s.width, 12);
  key.writeUInt32LE(s.height, 16);
  return chunk(SLICE, Buffer.concat([head, str(s.name), key]));
}

// The file with these tap shapes and lab slices. `areas` has a 0/1 mask per
// area to change (new ids get a new layer); `slices` replaces every label:,
// pin: and flag: slice.
export function patchMap(file: Buffer, change: { areas: Record<string, Uint8Array>; slices: AseSlice[] }): Buffer {
  const p = parse(file);
  if (p.depth !== 32) throw new Error('The map lab can only save RGBA files (Sprite → Color Mode → RGB Color in Aseprite).');
  for (const [id, mask] of Object.entries(change.areas)) {
    if (!/^[a-z0-9-]+$/.test(id)) throw new Error(`"${id}" isn't a good area id: use lowercase letters, numbers and -`);
    if (mask.length !== p.width * p.height) throw new Error(`area:${id} isn't the size of the map`);
  }
  const indexOf = (id: string) => p.layers.findIndex((n) => layerArea(n) === id);
  const changing = new Set(Object.keys(change.areas).map(indexOf).filter((i) => i >= 0));

  // Drop the old cels of the shapes we change and the lab's slices, with
  // the user data or extras that belong to them (they follow their chunk).
  const kept: Chunk[] = [];
  let dropping = false;
  for (const ch of p.chunks) {
    if (ch.type === USER_DATA || ch.type === CEL_EXTRA) {
      if (!dropping) kept.push(ch);
      continue;
    }
    dropping = false;
    if (ch.type === CEL && changing.has(ch.bytes.readUInt16LE(6))) dropping = true;
    if (ch.type === SLICE && isLabSlice(ch.bytes.toString('utf8', 20, 20 + ch.bytes.readUInt16LE(18)))) dropping = true;
    if (!dropping) kept.push(ch);
  }

  // New area layers go on top: after the last layer chunk and its user data.
  let lastLayer = -1;
  kept.forEach((ch, i) => { if (ch.type === LAYER) lastLayer = i; });
  while (kept[lastLayer + 1]?.type === USER_DATA) lastLayer++;
  const added: Chunk[] = [];
  let next = p.layers.length;
  const layerOf = new Map<string, number>();
  for (const id of Object.keys(change.areas)) {
    let i = indexOf(id);
    if (i < 0) {
      i = next++;
      added.push({ type: LAYER, bytes: layerChunk(`area:${id}`) });
    }
    layerOf.set(id, i);
  }
  const out: Buffer[] = [
    ...kept.slice(0, lastLayer + 1).map((c) => c.bytes),
    ...added.map((c) => c.bytes),
    ...kept.slice(lastLayer + 1).map((c) => c.bytes),
  ];
  for (const [id, mask] of Object.entries(change.areas)) {
    if (mask.some(Boolean)) out.push(celChunk(layerOf.get(id)!, mask, p.width, p.height));
  }
  for (const s of change.slices) if (isLabSlice(s.name)) out.push(sliceChunk(s));

  const body = Buffer.concat(out);
  const header = Buffer.from(file.subarray(p.frameStart, p.frameStart + 16));
  header.writeUInt32LE(body.length + 16, 0);
  header.writeUInt16LE(Math.min(out.length, 0xffff), 6);
  header.writeUInt32LE(out.length, 12);
  const result = Buffer.concat([file.subarray(0, p.frameStart), header, body, file.subarray(p.frameEnd)]);
  result.writeUInt32LE(result.length, 0);
  return result;
}

// Masks travel as base64 bitsets: one bit per pixel, row by row.
export function packMask(mask: ArrayLike<number | boolean>): string {
  const bytes = Buffer.alloc(Math.ceil(mask.length / 8));
  for (let i = 0; i < mask.length; i++) if (mask[i]) bytes[i >> 3] |= 1 << (i & 7);
  return bytes.toString('base64');
}

export function unpackMask(text: string, length: number): Uint8Array {
  const bytes = Buffer.from(text, 'base64');
  const mask = new Uint8Array(length);
  for (let i = 0; i < length; i++) mask[i] = (bytes[i >> 3] >> (i & 7)) & 1;
  return mask;
}
