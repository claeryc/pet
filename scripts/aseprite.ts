// Writes .aseprite files (Aseprite's own format), so the placeholder art and
// the blank template open in Aseprite with layers, animation tags and the
// palette already set up. Format reference:
// https://github.com/aseprite/aseprite/blob/main/docs/ase-file-specs.md

import { deflateSync } from 'node:zlib';

export interface AseLayer {
  name: string;
  reference?: boolean; // a guide layer: visible while drawing, never exported
  hidden?: boolean; // starts with its eye closed in Aseprite
  opacity?: number; // 0-255, 255 if left out
  // One RGBA image (width x height x 4 bytes) per frame, or null for an
  // empty frame. If every frame is the same picture, pass `sameEveryFrame`.
  cels: (Uint8Array | null)[];
  sameEveryFrame?: boolean;
}

export interface AseFile {
  width: number;
  height: number;
  frameMs: number[]; // one duration per frame
  layers: AseLayer[]; // first layer is the bottom one
  tags: { name: string; from: number; to: number }[];
  palette: { name: string; hex: string }[];
  slices?: AseSlice[]; // named rectangles, the same on every frame
}

export interface AseSlice {
  name: string;
  x: number;
  y: number;
  width: number;
  height: number;
}

class Bytes {
  private parts: Buffer[] = [];
  byte(v: number) { this.parts.push(Buffer.from([v & 0xff])); return this; }
  word(v: number) { const b = Buffer.alloc(2); b.writeUInt16LE(v); this.parts.push(b); return this; }
  short(v: number) { const b = Buffer.alloc(2); b.writeInt16LE(v); this.parts.push(b); return this; }
  dword(v: number) { const b = Buffer.alloc(4); b.writeUInt32LE(v); this.parts.push(b); return this; }
  zeros(n: number) { this.parts.push(Buffer.alloc(n)); return this; }
  string(s: string) { const b = Buffer.from(s, 'utf8'); this.word(b.length); this.parts.push(b); return this; }
  raw(b: Buffer) { this.parts.push(b); return this; }
  done() { return Buffer.concat(this.parts); }
}

function chunk(type: number, body: Buffer): Buffer {
  return new Bytes().dword(body.length + 6).word(type).raw(body).done();
}

export function writeAseprite(file: AseFile): Buffer {
  const { width, height } = file;
  const frames: Buffer[] = [];

  file.frameMs.forEach((ms, f) => {
    const chunks: Buffer[] = [];
    if (f === 0) {
      // Palette (0x2019), then layers (0x2004), then tags (0x2018).
      const pal = new Bytes().dword(file.palette.length).dword(0).dword(file.palette.length - 1).zeros(8);
      for (const { name, hex } of file.palette) {
        const n = parseInt(hex.slice(1), 16);
        pal.word(1).byte(n >> 16).byte(n >> 8).byte(n).byte(255).string(name);
      }
      chunks.push(chunk(0x2019, pal.done()));
      for (const layer of file.layers) {
        const flags = (layer.hidden ? 0 : 1) | 2 | (layer.reference ? 64 : 0); // visible, editable, reference
        const body = new Bytes().word(flags).word(0).word(0).word(0).word(0).word(0).byte(layer.opacity ?? 255).zeros(3).string(layer.name);
        chunks.push(chunk(0x2004, body.done()));
      }
      const tags = new Bytes().word(file.tags.length).zeros(8);
      for (const t of file.tags) tags.word(t.from).word(t.to).byte(0).word(0).zeros(6).zeros(3).byte(0).string(t.name);
      chunks.push(chunk(0x2018, tags.done()));
      for (const sl of file.slices ?? []) {
        const body = new Bytes().dword(1).dword(0).dword(0).string(sl.name).dword(0).dword(sl.x).dword(sl.y).dword(sl.width).dword(sl.height);
        chunks.push(chunk(0x2022, body.done()));
      }
    }
    file.layers.forEach((layer, li) => {
      const head = new Bytes().word(li).short(0).short(0).byte(255);
      if (layer.sameEveryFrame && f > 0) {
        // A linked cel: "same picture as frame 0".
        chunks.push(chunk(0x2005, head.word(1).short(0).zeros(5).word(0).done()));
        return;
      }
      const image = layer.sameEveryFrame ? layer.cels[0] : layer.cels[f];
      if (!image) return;
      const body = head.word(2).short(0).zeros(5).word(width).word(height).raw(deflateSync(Buffer.from(image)));
      chunks.push(chunk(0x2005, body.done()));
    });
    const content = Buffer.concat(chunks);
    const header = new Bytes()
      .dword(content.length + 16)
      .word(0xf1fa)
      .word(Math.min(chunks.length, 0xffff))
      .word(ms)
      .zeros(2)
      .dword(chunks.length)
      .done();
    frames.push(header, content);
  });

  const body = Buffer.concat(frames);
  const header = new Bytes()
    .dword(body.length + 128)
    .word(0xa5e0)
    .word(file.frameMs.length)
    .word(width)
    .word(height)
    .word(32) // RGBA
    .dword(1) // layer opacity is valid
    .word(100)
    .dword(0)
    .dword(0)
    .byte(0)
    .zeros(3)
    .word(file.palette.length)
    .byte(1)
    .byte(1)
    .short(0)
    .short(0)
    .word(16)
    .word(16)
    .zeros(84)
    .done();
  return Buffer.concat([header, body]);
}

// The animation tags in an .aseprite file, in the order Aseprite lists
// them, with their first and last frame (counted from 0).
export function readTags(file: Buffer): { name: string; from: number; to: number }[] {
  if (file.readUInt16LE(4) !== 0xa5e0) throw new Error('Not an Aseprite file');
  const frames = file.readUInt16LE(6);
  const tags: { name: string; from: number; to: number }[] = [];
  let at = 128;
  for (let f = 0; f < frames; f++) {
    const frameEnd = at + file.readUInt32LE(at);
    const old = file.readUInt16LE(at + 6);
    const count = file.readUInt32LE(at + 12) || old;
    let c = at + 16;
    for (let i = 0; i < count && c < frameEnd; i++) {
      const size = file.readUInt32LE(c);
      if (file.readUInt16LE(c + 4) === 0x2018) {
        let p = c + 6;
        const n = file.readUInt16LE(p);
        p += 10;
        for (let t = 0; t < n; t++) {
          const from = file.readUInt16LE(p);
          const to = file.readUInt16LE(p + 2);
          p += 17;
          const length = file.readUInt16LE(p);
          tags.push({ name: file.toString('utf8', p + 2, p + 2 + length), from, to });
          p += 2 + length;
        }
      }
      c += size;
    }
    at = frameEnd;
  }
  return tags;
}

// Walks the chunks of an .aseprite file, calling `onChunk` with each chunk's
// type, where its body starts, and the frame it's in.
function eachChunk(file: Buffer, onChunk: (type: number, body: number, frame: number) => void): void {
  if (file.readUInt16LE(4) !== 0xa5e0) throw new Error('Not an Aseprite file');
  const frames = file.readUInt16LE(6);
  let at = 128;
  for (let f = 0; f < frames; f++) {
    const frameEnd = at + file.readUInt32LE(at);
    const old = file.readUInt16LE(at + 6);
    const count = file.readUInt32LE(at + 12) || old;
    let c = at + 16;
    for (let i = 0; i < count && c < frameEnd; i++) {
      onChunk(file.readUInt16LE(c + 4), c + 6, f);
      c += file.readUInt32LE(c);
    }
    at = frameEnd;
  }
}

// The layers' names, bottom one first, and whether each is a group.
export function readLayers(file: Buffer): { name: string; group: boolean; depth: number }[] {
  const layers: { name: string; group: boolean; depth: number }[] = [];
  eachChunk(file, (type, p) => {
    if (type !== 0x2004) return;
    const length = file.readUInt16LE(p + 16);
    layers.push({ name: file.toString('utf8', p + 18, p + 18 + length), group: file.readUInt16LE(p + 2) === 1, depth: file.readUInt16LE(p + 4) });
  });
  return layers;
}

// The slices (named rectangles), as they are on the first frame.
export function readSlices(file: Buffer): AseSlice[] {
  const slices: AseSlice[] = [];
  eachChunk(file, (type, p) => {
    if (type !== 0x2022) return;
    const keys = file.readUInt32LE(p);
    const flags = file.readUInt32LE(p + 4);
    const length = file.readUInt16LE(p + 12);
    const name = file.toString('utf8', p + 14, p + 14 + length);
    if (keys === 0) return;
    const k = p + 14 + length;
    slices.push({ name, x: file.readInt32LE(k + 4), y: file.readInt32LE(k + 8), width: file.readUInt32LE(k + 12), height: file.readUInt32LE(k + 16) });
    void flags;
  });
  return slices;
}
