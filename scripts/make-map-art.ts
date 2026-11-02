// Makes the placeholder art for the map (src/ui/map.ts): an Aseprite file
// per map in art/map/, set up the way docs/MAP_GUIDE.md explains, and the
// PNGs and JSON the game loads in public/sprites/map/, so the game works
// before anyone opens Aseprite.
//
//   npm run map-art             (only writes files that aren't there yet)
//   npm run map-art -- --force  (replaces them: your Aseprite edits are lost!)
//
// After drawing over the .aseprite files, run `npm run export-art -- map`
// instead: that reads your layers and makes the PNGs and JSON again.
// Runs with plain Node.js 22.18 or newer, no extra packages.
//
// The art is lit from the top left: every shape is lighter on its top-left
// side, darker on its bottom-right, and drops a soft shadow to the bottom
// right. Each material has its own ramp of shades (RAMPS below), dark to
// light. The map is 360 x 540, and the houses and trees are drawn at the
// same pixel size as the ground.

import { existsSync, mkdirSync, writeFileSync } from 'node:fs';
import { dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { writeAseprite, type AseLayer, type AseSlice } from './aseprite.ts';
import { mapData } from './map-data.ts';
import { writePng } from './png.ts';

// ---------- Colours ----------

const INK = '#2b2140';
const RAMPS = {
  // Ground, one per area so they read as different places.
  lawn: ['#41704f', '#5a955f', '#7bb57a', '#a2d39a', '#c9e9bd'],
  fresh: ['#356b55', '#4b9070', '#6db38b', '#97d3a9', '#c4ecce'],
  meadow: ['#55803f', '#73a24d', '#97c464', '#bfdf86', '#e2f2b5'],
  teal: ['#33665f', '#478a7d', '#68ad9b', '#93cfbb', '#c3ead9'],
  wheat: ['#9c6a33', '#c48f45', '#e2b65f', '#f2d68a', '#fbedbd'],
  forest: ['#27503f', '#356b55', '#4b8a69', '#6aa982', '#93c9a2'],
  plaza: ['#a77a56', '#c49870', '#dcb88e', '#eed4ae', '#fbebd0'],
  sand: ['#b88552', '#d6a86f', '#ebc78f', '#f7e0b3', '#fff2d6'],
  heath: ['#4a3460', '#64497f', '#8366a3', '#a68bc9', '#cbb6e4'],
  // Things.
  leaf: ['#24493a', '#35694f', '#4f9068', '#76b585', '#a6d8a8'],
  blossom: ['#8c3654', '#c25677', '#e57d98', '#f6a9bc', '#fdd5df'],
  hedge: ['#21422f', '#2f5f43', '#447f58', '#63a06f', '#8cc08d'],
  cliff: ['#3e2620', '#5c3a2e', '#7a4e3a', '#9a6a4c', '#bb8c64'],
  path: ['#9a6b47', '#b7875c', '#d0a676', '#e5c597', '#f4dfba'],
  wood: ['#3b241d', '#5c3a2e', '#7d5139', '#a06e4d', '#c39267'],
  stone: ['#4c4560', '#6c6584', '#8f88a8', '#b4aeca', '#dcd8ea'],
  wall: ['#a88b7a', '#cdb29c', '#e6d3bd', '#f6eadb', '#fffaf2'],
  roofRed: ['#6e2235', '#9a3450', '#c64d6c', '#e47690', '#f5a3b5'],
  roofBlue: ['#25386a', '#344f8e', '#4870b4', '#6a96d4', '#9cc2ec'],
  roofLilac: ['#3e2a55', '#5b3f6e', '#7d5f98', '#a283c0', '#c9b0e0'],
  roofPeach: ['#7c3f2c', '#a85a3c', '#d27d52', '#eba273', '#f8c9a0'],
  butter: ['#9b6b22', '#c99232', '#e9bb4b', '#f8da7a', '#fff0b8'],
  cloth: ['#b9a58f', '#d8c7b2', '#ece0d0', '#f8f1e7', '#ffffff'],
  glass: ['#2f4f86', '#4a77b8', '#79a9dc', '#b7dcf4', '#ffffff'],
  cloud: ['#8e78b0', '#b3a2d1', '#d6cbea', '#efe9f8', '#ffffff'],
  rose: ['#7a2036', '#a8304f', '#d64d6c', '#f07a93', '#ffb3c3'],
};
type Ramp = string[];
const WATER = { deep: '#3f6db8', mid: '#4f86cf', shallow: '#66a3df', shallower: '#86c0eb', light: '#b2def5', foam: '#ffffff' };
const LIT = ['#fff0b8', '#ffe596', '#ffd166']; // a lit window: brightest, middle, edge

const rgb = (h: string): [number, number, number] => { const n = parseInt(h.slice(1), 16); return [n >> 16, (n >> 8) & 255, n & 255]; };

// ---------- Helpers ----------

// A number from 0 to 1 that's always the same for the same inputs.
function hash(a: number, b: number, c = 0): number {
  let x = Math.imul(a | 0, 374761393) ^ Math.imul(b | 0, 668265263) ^ Math.imul(c | 0, 2246822519) ^ 0x5bd1e995;
  x = Math.imul(x ^ (x >>> 13), 1274126177);
  return ((x ^ (x >>> 16)) >>> 0) / 0x100000000;
}
// Smooth noise from -1 to 1, in blobs about `s` pixels across.
function noise(x: number, y: number, s: number, seed = 0): number {
  const gx = x / s, gy = y / s, x0 = Math.floor(gx), y0 = Math.floor(gy);
  const fx = gx - x0, fy = gy - y0, u = fx * fx * (3 - 2 * fx), v = fy * fy * (3 - 2 * fy);
  const h = (i: number, j: number) => hash(x0 + i, y0 + j, seed) * 2 - 1;
  return (h(0, 0) * (1 - u) + h(1, 0) * u) * (1 - v) + (h(0, 1) * (1 - u) + h(1, 1) * u) * v;
}
const BAYER = [0, 8, 2, 10, 12, 4, 14, 6, 3, 11, 1, 9, 15, 7, 13, 5];
const bayer = (x: number, y: number) => (BAYER[(y & 3) * 4 + (x & 3)] + 0.5) / 16;
const clamp = (v: number, a: number, b: number) => Math.max(a, Math.min(b, v));
// A shade from a ramp for a brightness from 0 to 1, with a little dither
// where two shades meet so the steps aren't straight lines.
function shade(r: Ramp, v: number, x: number, y: number, dither = 0.35): string {
  const f = clamp(v, 0, 1) * (r.length - 1);
  return r[clamp(Math.floor(f + (bayer(x, y) - 0.5) * dither + 0.5), 0, r.length - 1)];
}

class Layer {
  data: Uint8Array;
  width: number;
  height: number;
  constructor(width: number, height: number) { this.width = width; this.height = height; this.data = new Uint8Array(width * height * 4); }
  inside(x: number, y: number): boolean { return x >= 0 && y >= 0 && x < this.width && y < this.height; }
  set(x: number, y: number, colour: string | null, alpha = 255): void {
    x = Math.round(x); y = Math.round(y);
    if (!this.inside(x, y)) return;
    const i = (y * this.width + x) * 4;
    if (colour === null) { this.data.fill(0, i, i + 4); return; }
    const [r, g, b] = rgb(colour);
    this.data[i] = r; this.data[i + 1] = g; this.data[i + 2] = b; this.data[i + 3] = alpha;
  }
  has(x: number, y: number): boolean { return this.inside(x, y) && this.data[(y * this.width + x) * 4 + 3] > 0; }
  // Mixes `colour` into what's there (a shadow on the ground).
  mix(x: number, y: number, colour: string, amount: number): void {
    if (!this.has(x, y)) return;
    const i = (y * this.width + x) * 4, c = rgb(colour);
    for (let k = 0; k < 3; k++) this.data[i + k] = Math.round(this.data[i + k] * (1 - amount) + c[k] * amount);
  }
  // Puts `top` over this layer.
  over(top: Layer): void {
    for (let i = 0; i < top.data.length; i += 4) {
      const a = top.data[i + 3];
      if (!a) continue;
      if (a === 255 || !this.data[i + 3]) { this.data.set(top.data.subarray(i, i + 4), i); continue; }
      for (let k = 0; k < 3; k++) this.data[i + k] = Math.round(this.data[i + k] * (1 - a / 255) + top.data[i + k] * (a / 255));
    }
  }
  // A dark outline around everything drawn (only on empty pixels).
  outline(colour = INK): void {
    const add: number[] = [];
    for (let y = 0; y < this.height; y++) for (let x = 0; x < this.width; x++) {
      if (this.has(x, y)) continue;
      if (this.has(x + 1, y) || this.has(x - 1, y) || this.has(x, y + 1) || this.has(x, y - 1)) add.push(x, y);
    }
    for (let i = 0; i < add.length; i += 2) this.set(add[i], add[i + 1], colour);
  }
}

// ---------- Things on the map ----------
//
// Each one draws into its own layer `L` (so it can be outlined on its own),
// with its bottom middle at (x, y). `sh` is the shadow layer under
// everything, `nt` the night lights.

interface Ctx { L: Layer; sh: Layer; nt: Layer }

function ellipseShadow(c: Ctx, x: number, y: number, rx: number, ry: number, amount = 0.32): void {
  for (let j = -ry; j <= ry; j++) for (let i = -rx; i <= rx; i++) {
    if ((i / rx) ** 2 + (j / ry) ** 2 > 1) continue;
    c.sh.set(x + i, y + j, INK, Math.round(amount * 255));
  }
}

function rect(L: Layer, x0: number, y0: number, w: number, h: number, colour: (x: number, y: number) => string | null): void {
  for (let y = y0; y < y0 + h; y++) for (let x = x0; x < x0 + w; x++) { const col = colour(x, y); if (col) L.set(x, y, col); }
}

// A round canopy (trees, bushes): lobes lit from the top left, darkest at
// the bottom, shaded in clusters rather than smoothly.
function canopy(L: Layer, cx: number, cy: number, r: number, ramp: Ramp, seed: number): void {
  const lobes: [number, number, number][] = [[0, 0, r * 0.82]];
  const n = Math.max(4, Math.round(r / 2.2));
  for (let i = 0; i < n; i++) {
    const a = (i / n) * Math.PI * 2 + hash(seed, i) * 0.6;
    lobes.push([Math.cos(a) * r * 0.5, Math.sin(a) * r * 0.42, r * (0.42 + hash(seed, i, 1) * 0.12)]);
  }
  for (let y = Math.floor(cy - r * 1.1); y <= cy + r; y++) for (let x = Math.floor(cx - r * 1.2); x <= cx + r * 1.2; x++) {
    let found = false, bv = -9, by = -999;
    for (const [lx, ly, lr] of lobes) {
      const dx = (x - cx - lx) / lr, dy = (y - cy - ly) / lr, d = dx * dx + dy * dy;
      if (d > 1) continue;
      const nz = Math.sqrt(1 - d);
      const v = 0.25 + (-dx * 0.55 - dy * 0.7 + nz * 0.55) * 0.5;
      // The lobe in front (lower down) wins.
      if (!found || ly > by) { bv = v; by = ly; }
      found = true;
    }
    if (!found) continue;
    const below = (y - cy) / r;
    const v = bv - Math.max(0, below) * 0.3 + noise(x, y, 2.2, seed) * 0.12;
    L.set(x, y, shade(ramp, v, x, y, 0.25));
  }
}

function tree(c: Ctx, x: number, y: number, r = 12, ramp: Ramp = RAMPS.leaf, seed = 1): void {
  ellipseShadow(c, x + Math.round(r * 0.35), y, Math.round(r * 0.95), Math.max(3, Math.round(r * 0.32)));
  const th = Math.round(r * 0.7);
  for (let j = 0; j < th; j++) for (let i = -2; i <= 1; i++) c.L.set(x + i, y - 1 - j, RAMPS.wood[i === -2 ? 3 : i === 1 ? 1 : 2]);
  c.L.set(x - 3, y - 1, RAMPS.wood[2]); c.L.set(x + 2, y - 1, RAMPS.wood[1]);
  canopy(c.L, x, y - th - r * 0.75, r, ramp, seed);
}

function bush(c: Ctx, x: number, y: number, r = 6, ramp: Ramp = RAMPS.leaf, seed = 2, berries?: string): void {
  ellipseShadow(c, x + Math.round(r * 0.3), y, r + 1, Math.max(2, Math.round(r * 0.35)));
  canopy(c.L, x, y - r * 0.7, r, ramp, seed);
  if (berries) for (let i = 0; i < r; i++) {
    const bx = x + Math.round((hash(seed, i, 7) - 0.5) * r * 1.4), by = y - Math.round(r * 0.3 + hash(seed, i, 8) * r);
    if (c.L.has(bx, by)) c.L.set(bx, by, berries);
  }
}

function pine(c: Ctx, x: number, y: number, h = 26, seed = 3): void {
  const w = Math.round(h * 0.42);
  ellipseShadow(c, x + Math.round(w * 0.4), y, w + 1, 3);
  for (let j = 0; j < 3; j++) { c.L.set(x - 1, y - 1 - j, RAMPS.wood[2]); c.L.set(x, y - 1 - j, RAMPS.wood[1]); }
  const tiers = 4;
  for (let t = 0; t < tiers; t++) {
    const top = y - 3 - h + (t * h) / tiers, bottom = top + h / tiers + 5, hw = (w * (t + 1.6)) / (tiers + 0.6);
    for (let yy = Math.round(top); yy <= bottom; yy++) {
      const f = (yy - top) / (bottom - top), half = Math.round(hw * f);
      for (let i = -half; i <= half; i++) {
        const side = i / Math.max(1, half);
        const v = 0.62 - side * 0.35 - (f > 0.82 ? 0.3 : 0) + noise(x + i, yy, 2, seed) * 0.1;
        c.L.set(x + i, yy, shade(RAMPS.forest, v, x + i, yy, 0.3));
      }
    }
  }
}

// A house in three-quarter view: a tiled roof over a front wall with two
// windows (lit at night), a door, flower boxes and a chimney.
function house(c: Ctx, x: number, y: number, o: { w?: number; roof: Ramp; wall?: Ramp; door?: Ramp; flowers?: string; chimney?: boolean }): void {
  const w = o.w ?? 40, wall = o.wall ?? RAMPS.wall, roof = o.roof, door = o.door ?? RAMPS.wood;
  const wh = Math.round(w * 0.38), rh = Math.round(w * 0.42);
  const x0 = Math.round(x - w / 2), wallTop = y - wh;
  ellipseShadow(c, x + Math.round(w * 0.18), y + 1, Math.round(w * 0.58), Math.round(w * 0.14), 0.35);
  // Front wall: timber posts, light on the left, shade on the right.
  rect(c.L, x0, wallTop, w, wh, (xx, yy) => {
    const i = xx - x0, j = yy - wallTop;
    if (j >= wh - 2) return RAMPS.stone[j === wh - 1 ? 1 : 2];
    if (i === 0 || i === w - 1) return RAMPS.wood[i === 0 ? 3 : 1];
    if (j <= 2) return wall[1];
    if (i >= w - 4) return wall[2];
    return wall[3];
  });
  // Windows with flower boxes.
  const win = (wx: number) => {
    const wy = wallTop + 4, ww = 7, wwh = 7;
    rect(c.L, wx - 1, wy - 1, ww + 2, wwh + 2, () => RAMPS.wood[1]);
    rect(c.L, wx, wy, ww, wwh, (xx, yy) => {
      const i = xx - wx, j = yy - wy;
      if (i === 3 || j === 3) return RAMPS.wood[2];
      c.nt.set(xx, yy, i + j < 3 ? LIT[0] : i + j > 8 ? LIT[2] : LIT[1]);
      return i + j < 2 ? RAMPS.glass[4] : i + j < 5 ? RAMPS.glass[3] : i + j < 9 ? RAMPS.glass[2] : RAMPS.glass[1];
    });
    rect(c.L, wx - 1, wy + wwh + 1, ww + 2, 2, (_, yy) => (yy === wy + wwh + 1 ? RAMPS.wood[3] : RAMPS.wood[1]));
    for (let i = 0; i < ww + 1; i += 2) { c.L.set(wx + i, wy + wwh, o.flowers ?? RAMPS.rose[3]); c.L.set(wx + i + 1, wy + wwh, RAMPS.leaf[3]); }
  };
  const dw = 8, dx = Math.round(x - dw / 2);
  win(Math.round((x0 + dx) / 2) - 3);
  win(Math.round((dx + dw + x0 + w) / 2) - 4);
  // Door: rounded top, planks, a brass knob, a stone step.
  const dh = wh - 3;
  rect(c.L, dx, y - dh - 2, dw, dh, (xx, yy) => {
    const i = xx - dx, j = yy - (y - dh - 2);
    if (j === 0 && (i === 0 || i === dw - 1)) return null;
    if (i === 0 || i === dw - 1 || j === 0) return door[0];
    if (i === dw - 2 && j === Math.round(dh / 2)) return RAMPS.butter[3];
    return i % 2 === 0 ? door[2] : door[3];
  });
  rect(c.L, dx - 1, y - 2, dw + 2, 2, (_, yy) => RAMPS.stone[yy === y - 2 ? 4 : 2]);
  // Roof: courses of tiles, lighter towards the top left, a dark eave.
  const over = 3, top = wallTop - rh;
  for (let j = 0; j <= rh; j++) {
    const yy = top + j, half = Math.round(w / 2 + over - ((rh - j) / rh) * (w * 0.2));
    for (let xx = x - half; xx < x + half; xx++) {
      const i = xx - (x - half), course = Math.floor(j / 4), seam = (i + (course % 2) * 3) % 6 === 0;
      let v = 0.66 - (i / (half * 2)) * 0.42 - (j / rh) * 0.08;
      if (j === rh) v = 0.0;
      else if (j % 4 === 3) v -= 0.22;
      else if (seam) v -= 0.12;
      if (j === 0) v = 0.95;
      c.L.set(xx, yy, shade(roof, v, xx, yy, 0.2));
    }
  }
  rect(c.L, x0, wallTop + 1, w, 1, () => wall[0]); // shadow under the eave
  if (o.chimney !== false) {
    const cx = x + Math.round(w * 0.2), cy = top + 3;
    rect(c.L, cx, cy - 7, 6, 8, (xx, yy) => (xx === cx ? RAMPS.stone[4] : xx === cx + 5 ? RAMPS.stone[1] : (yy + (xx >> 1)) % 3 === 0 ? RAMPS.stone[2] : RAMPS.stone[3]));
    rect(c.L, cx - 1, cy - 9, 8, 2, (xx, yy) => (yy === cy - 9 ? RAMPS.stone[4] : xx === cx + 6 ? RAMPS.stone[1] : RAMPS.stone[2]));
  }
}

function skep(c: Ctx, x: number, y: number): void {
  ellipseShadow(c, x + 3, y, 9, 3);
  rect(c.L, x - 7, y - 3, 14, 3, (_, yy) => (yy === y - 3 ? RAMPS.wood[3] : RAMPS.wood[1]));
  for (let j = 0; j < 14; j++) {
    const yy = y - 4 - j, half = Math.round(7 * Math.sqrt(1 - (j / 14.5) ** 2));
    for (let i = -half; i <= half; i++) {
      const v = 0.68 - (i / 8) * 0.35 + (j % 3 === 0 ? -0.25 : 0) + (j > 10 ? 0.1 : 0);
      c.L.set(x + i, yy, shade(RAMPS.butter, v, x + i, yy, 0.2));
    }
  }
  rect(c.L, x - 1, y - 7, 3, 3, () => RAMPS.wood[0]);
}

function bees(c: Ctx, x: number, y: number): void {
  for (const [bx, by] of [[-4, -3], [5, 0], [8, -6]]) { c.L.set(x + bx, y + by, RAMPS.butter[3]); c.L.set(x + bx + 1, y + by, INK); }
}

function birdhouse(c: Ctx, x: number, y: number): void {
  ellipseShadow(c, x + 3, y, 5, 2);
  rect(c.L, x - 1, y - 14, 3, 14, (xx) => RAMPS.wood[xx === x - 1 ? 3 : 1]);
  rect(c.L, x - 5, y - 24, 11, 10, (xx) => (xx === x - 5 ? RAMPS.glass[3] : xx >= x + 4 ? RAMPS.glass[1] : RAMPS.glass[2]));
  rect(c.L, x - 1, y - 21, 3, 3, () => INK);
  for (let j = 0; j < 6; j++) for (let i = -7 + j; i <= 7 - j; i++) c.L.set(x + i, y - 25 - j, shade(RAMPS.roofRed, 0.65 - i * 0.04 - (j === 0 ? 0.3 : 0), x + i, y - 25 - j));
}

function bed(c: Ctx, x: number, y: number, w = 28, crop = RAMPS.leaf, fruit?: string): void {
  const h = 11, x0 = Math.round(x - w / 2), top = y - h;
  ellipseShadow(c, x + 3, y + 1, Math.round(w / 2) + 2, 3, 0.25);
  rect(c.L, x0, top, w, h, (xx, yy) => {
    const i = xx - x0, j = yy - top;
    if (j >= h - 3) return j === h - 3 ? RAMPS.wood[3] : RAMPS.wood[1];
    if (i === 0 || i === w - 1 || j === 0) return RAMPS.wood[i === w - 1 ? 1 : 3];
    return j % 3 === 1 ? RAMPS.cliff[1] : RAMPS.cliff[2];
  });
  for (let i = 3; i < w - 3; i += 5) for (const row of [3, 6]) {
    const sx = x0 + i + (row === 6 ? 2 : 0), sy = top + row;
    c.L.set(sx, sy - 1, crop[3]); c.L.set(sx - 1, sy - 2, crop[4]); c.L.set(sx + 1, sy - 2, crop[2]); c.L.set(sx, sy, crop[1]);
    if (fruit && (i + row) % 2) c.L.set(sx + 1, sy - 1, fruit);
  }
}

function fence(c: Ctx, x: number, y: number, w = 40): void {
  const x0 = Math.round(x - w / 2);
  for (let i = 0; i < w; i++) {
    c.L.set(x0 + i, y - 8, RAMPS.wood[4]); c.L.set(x0 + i, y - 7, RAMPS.wood[2]);
    c.L.set(x0 + i, y - 4, RAMPS.wood[4]); c.L.set(x0 + i, y - 3, RAMPS.wood[2]);
    c.sh.set(x0 + i + 2, y + 1, INK, 70);
  }
  for (let i = 0; i < w; i += 6) rect(c.L, x0 + i, y - 11, 2, 11, (xx, yy) => (yy === y - 11 ? RAMPS.wood[4] : xx === x0 + i ? RAMPS.wood[3] : RAMPS.wood[1]));
}

function well(c: Ctx, x: number, y: number): void {
  ellipseShadow(c, x + 4, y, 11, 3);
  for (let j = 0; j < 8; j++) for (let i = -8; i <= 8; i++) {
    const yy = y - 1 - j, mortar = j % 3 === 2 || (i + 8 + (Math.floor(j / 3) % 2) * 2) % 5 === 0;
    c.L.set(x + i, yy, j === 7 ? RAMPS.stone[4] : mortar ? RAMPS.stone[1] : RAMPS.stone[i < 2 ? 3 : 2]);
  }
  rect(c.L, x - 6, y - 10, 13, 2, (_, yy) => (yy === y - 10 ? RAMPS.glass[0] : RAMPS.glass[1]));
  for (const px of [x - 8, x + 7]) rect(c.L, px, y - 22, 2, 14, (xx) => RAMPS.wood[xx === px ? 3 : 1]);
  for (let j = 0; j < 5; j++) for (let i = -10 + j; i <= 10 - j; i++) c.L.set(x + i, y - 23 - j, shade(RAMPS.roofRed, 0.7 - i * 0.03 - (j === 0 ? 0.35 : 0), x + i, y - 23 - j));
  rect(c.L, x - 1, y - 19, 3, 4, (xx) => RAMPS.wood[xx === x - 1 ? 4 : 2]);
}

function mailbox(c: Ctx, x: number, y: number): void {
  ellipseShadow(c, x + 3, y, 4, 2);
  rect(c.L, x, y - 9, 2, 9, (xx) => RAMPS.wood[xx === x ? 3 : 1]);
  rect(c.L, x - 3, y - 15, 8, 6, (xx, yy) => (yy === y - 15 ? RAMPS.rose[4] : xx >= x + 3 ? RAMPS.rose[1] : RAMPS.rose[2]));
  rect(c.L, x + 5, y - 17, 1, 5, () => RAMPS.butter[3]);
}

function bench(c: Ctx, x: number, y: number): void {
  ellipseShadow(c, x + 3, y, 10, 2, 0.25);
  for (const lx of [x - 7, x + 6]) rect(c.L, lx, y - 4, 2, 4, () => RAMPS.wood[0]);
  rect(c.L, x - 9, y - 7, 19, 3, (_, yy) => RAMPS.wood[yy === y - 7 ? 4 : yy === y - 6 ? 3 : 1]);
  rect(c.L, x - 9, y - 12, 19, 3, (_, yy) => RAMPS.wood[yy === y - 12 ? 4 : 2]);
  for (const lx of [x - 7, x + 6]) rect(c.L, lx, y - 9, 2, 2, () => RAMPS.wood[1]);
}

function windmill(c: Ctx, x: number, y: number): void {
  ellipseShadow(c, x + 6, y, 16, 4);
  const h = 38;
  for (let j = 0; j < h; j++) {
    const half = Math.round(10 - (j / h) * 4), yy = y - 1 - j;
    for (let i = -half; i <= half; i++) {
      const brick = (j % 4 === 0) || ((i + half + (j >> 2) * 3) % 6 === 0);
      const v = 0.8 - ((i + half) / (half * 2)) * 0.5 - (brick ? 0.15 : 0);
      c.L.set(x + i, yy, shade(RAMPS.wall, v, x + i, yy, 0.2));
    }
  }
  rect(c.L, x - 3, y - 10, 6, 9, (xx, yy) => (yy === y - 10 && (xx === x - 3 || xx === x + 2) ? null : xx === x - 3 ? RAMPS.wood[1] : RAMPS.wood[2]));
  rect(c.L, x - 2, y - 24, 4, 5, (xx, yy) => { c.nt.set(xx, yy, LIT[1]); return RAMPS.glass[xx === x - 2 && yy === y - 24 ? 4 : 2]; });
  for (let j = 0; j < 10; j++) for (let i = -8 + Math.round(j * 0.7); i <= 8 - Math.round(j * 0.7); i++) c.L.set(x + i, y - h - j, shade(RAMPS.roofRed, 0.65 - i * 0.035 - (j === 0 ? 0.3 : 0), x + i, y - h - j));
  // Sails: four lattice blades around the hub.
  const hx = x, hy = y - h + 2;
  for (let s = 0; s < 4; s++) {
    const a = Math.PI / 4 + (s * Math.PI) / 2, ca = Math.cos(a), sa = Math.sin(a);
    for (let t = 3; t < 25; t++) for (let k = 0; k <= 5; k++) {
      const px = hx + ca * t - sa * k, py = hy + sa * t + ca * k;
      const frame = k === 0 || k === 5 || t % 5 === 0 || t === 24;
      c.L.set(px, py, frame ? RAMPS.wood[k === 0 ? 1 : 2] : (s % 2 ? RAMPS.cloth[2] : RAMPS.cloth[3]));
    }
  }
  rect(c.L, hx - 2, hy - 2, 4, 4, () => RAMPS.wood[0]);
}

function dock(c: Ctx, x: number, y: number, len = 40): void {
  const w = 12, x0 = x - w / 2;
  for (let j = 0; j < len; j++) {
    const yy = y - len + j;
    for (let i = 0; i < w; i++) c.L.set(x0 + i, yy, j % 4 === 3 ? RAMPS.wood[1] : i === 0 ? RAMPS.wood[4] : i >= w - 2 ? RAMPS.wood[2] : (j >> 2) % 2 ? RAMPS.wood[3] : RAMPS.wood[2]);
    c.sh.set(x0 + w + 1, yy + 2, INK, 80);
    c.sh.set(x0 + w + 2, yy + 2, INK, 50);
  }
  for (let j = 0; j < 4; j++) for (const px of [x0, x0 + w - 2]) rect(c.L, px, y + j, 2, 1, (xx) => RAMPS.wood[xx === px ? 2 : 0]);
  for (const px of [x0 - 1, x0 + w - 2]) { c.sh.set(px, y + 5, WATER.foam, 255); c.sh.set(px + 2, y + 5, WATER.foam, 255); }
}

function ship(c: Ctx, x: number, y: number): void {
  const w = 36;
  for (let i = -w / 2 - 4; i < w / 2 + 5; i++) if (hash(i, 3) < 0.75) c.sh.set(x + i, y + 1, WATER.foam, 230);
  for (let i = -w / 2 + 2; i < w / 2; i += 3) c.sh.set(x + i + 3, y + 3, INK, 60);
  for (let j = 0; j < 9; j++) {
    const yy = y - j, half = Math.round(w / 2 - Math.max(0, 4 - j) * 1.6);
    for (let i = -half; i <= half; i++) {
      const v = j === 8 ? 0.95 : j === 7 ? 0.2 : j === 3 ? 0.25 : 0.62 - (i / half) * 0.25 - (j < 2 ? 0.25 : 0);
      c.L.set(x + i, yy, shade(RAMPS.wood, v, x + i, yy, 0.2));
    }
  }
  for (let i = -12; i <= 12; i += 6) { c.L.set(x + i, y - 5, RAMPS.glass[3]); c.L.set(x + i + 1, y - 5, RAMPS.glass[1]); }
  rect(c.L, x - 1, y - 40, 2, 32, (xx) => RAMPS.wood[xx === x - 1 ? 3 : 1]);
  // A sail bellied by the wind, shaded on its far side.
  for (let j = 0; j < 26; j++) {
    const yy = y - 37 + j, wdt = Math.round(4 + j * 0.62 + Math.sin((j / 26) * Math.PI) * 3);
    for (let i = 1; i <= wdt; i++) c.L.set(x + i, yy, shade(RAMPS.cloth, 0.85 - (i / wdt) * 0.5 - (j > 23 ? 0.3 : 0), x + i, yy, 0.3));
  }
  for (let j = 0; j < 4; j++) for (let i = 0; i < 7 - j * 2; i++) c.L.set(x - 2 - i, y - 41 + j, RAMPS.rose[j === 0 ? 3 : 2]);
}

function stall(c: Ctx, x: number, y: number): void {
  const w = 34, x0 = x - w / 2;
  ellipseShadow(c, x + 4, y, 20, 3);
  for (const px of [x0 + 1, x0 + w - 3]) rect(c.L, px, y - 20, 2, 20, (xx) => RAMPS.wood[xx === px ? 3 : 1]);
  rect(c.L, x0, y - 10, w, 6, (_, yy) => (yy === y - 10 ? RAMPS.wood[4] : yy === y - 9 ? RAMPS.wood[3] : RAMPS.wood[1]));
  const goods = [RAMPS.rose[3], RAMPS.butter[3], RAMPS.leaf[3], RAMPS.roofPeach[3], RAMPS.roofLilac[3]];
  for (let i = 2; i < w - 3; i += 4) { const g = goods[(i >> 2) % goods.length]; rect(c.L, x0 + i, y - 13, 3, 3, (xx, yy) => (xx === x0 + i && yy === y - 13 ? RAMPS.wall[4] : g)); }
  for (let j = 0; j < 9; j++) for (let i = -2; i < w + 2; i++) {
    const stripe = Math.floor((i + 2) / 4) % 2, yy = y - 29 + j;
    if (j === 8 && (i + 2) % 4 === 3) continue;
    c.L.set(x0 + i, yy, stripe ? RAMPS.rose[j > 6 ? 1 : 2] : RAMPS.cloth[j > 6 ? 1 : 3]);
  }
}

function lamp(c: Ctx, x: number, y: number): void {
  ellipseShadow(c, x + 2, y, 3, 1);
  rect(c.L, x, y - 14, 2, 14, (xx) => (xx === x ? RAMPS.stone[2] : RAMPS.stone[0]));
  rect(c.L, x - 2, y - 19, 6, 5, (xx, yy) => { const lit = xx > x - 2 && xx < x + 3 && yy > y - 19 && yy < y - 15; if (lit) c.nt.set(xx, yy, LIT[0]); return lit ? RAMPS.butter[4] : RAMPS.stone[0]; });
}

function palm(c: Ctx, x: number, y: number): void {
  ellipseShadow(c, x + 8, y, 12, 3);
  for (let j = 0; j < 30; j++) { const bx = x + Math.round(Math.sin(j / 12) * 4); for (let i = -1; i <= 2; i++) c.L.set(bx + i, y - 1 - j, j % 4 === 0 ? RAMPS.wood[1] : RAMPS.wood[i < 1 ? 3 : 2]); }
  const tx = x + Math.round(Math.sin(30 / 12) * 4), ty = y - 31;
  for (let f = 0; f < 6; f++) {
    const a = (f / 6) * Math.PI * 2 + 0.3, dx = Math.cos(a), len = 15;
    for (let t = 0; t < len; t++) {
      const px = tx + dx * t, py = ty + Math.sin(a) * t * 0.45 + (t * t) / 40;
      for (let k = -1; k <= 1; k++) c.L.set(px, py + k, RAMPS.leaf[k === -1 ? 4 : k === 0 ? 3 : 1]);
    }
  }
  rect(c.L, tx - 2, ty, 4, 3, () => RAMPS.wood[1]);
}

function rock(c: Ctx, x: number, y: number, r = 6): void {
  ellipseShadow(c, x + 2, y, r + 1, 2, 0.25);
  for (let j = 0; j < r * 1.4; j++) for (let i = -r; i <= r; i++) {
    const dy = (j / (r * 1.4)) * 2 - 1, d = (i / r) ** 2 + dy * dy;
    if (d > 1) continue;
    c.L.set(x + i, y - 1 - j, shade(RAMPS.stone, 0.45 - (i / r) * 0.25 + dy * 0.3 + (d < 0.25 ? 0.1 : 0), x + i, y - 1 - j, 0.3));
  }
}

function dome(c: Ctx, x: number, y: number): void {
  ellipseShadow(c, x + 5, y, 16, 4);
  rect(c.L, x - 13, y - 14, 26, 14, (xx, yy) => {
    if (yy >= y - 2) return RAMPS.stone[1];
    if (xx >= x + 9) return RAMPS.wall[1];
    return (y - yy) % 4 === 0 ? RAMPS.wall[2] : RAMPS.wall[3];
  });
  rect(c.L, x - 3, y - 10, 6, 8, (xx, yy) => { c.nt.set(xx, yy, LIT[1]); return RAMPS.glass[2]; });
  for (let j = 0; j < 14; j++) {
    const half = Math.round(14 * Math.sqrt(1 - (j / 14) ** 2));
    for (let i = -half; i <= half; i++) c.L.set(x + i, y - 15 - j, shade(RAMPS.roofLilac, 0.7 - (i / 14) * 0.4 + (j / 14) * 0.15, x + i, y - 15 - j, 0.3));
  }
  rect(c.L, x - 1, y - 29, 3, 12, () => RAMPS.roofLilac[0]);
}

function telescope(c: Ctx, x: number, y: number): void {
  for (const a of [-4, 0, 4]) for (let j = 0; j < 9; j++) c.L.set(x + a * (1 - j / 9), y - j, RAMPS.wood[1]);
  for (let t = 0; t < 14; t++) for (let k = 0; k < 3; k++) c.L.set(x - 4 + t, y - 9 - t * 0.55 + k, k === 0 ? RAMPS.butter[4] : RAMPS.butter[2]);
}

function mushroom(c: Ctx, x: number, y: number): void {
  rect(c.L, x - 1, y - 4, 3, 4, (xx) => RAMPS.wall[xx === x - 1 ? 4 : 2]);
  for (let j = 0; j < 4; j++) for (let i = -4 + (j === 0 ? 1 : 0); i <= 4 - (j === 0 ? 1 : 0); i++) c.L.set(x + i, y - 5 - j, (i + j) % 3 === 0 && j > 0 ? RAMPS.wall[4] : RAMPS.rose[j === 0 ? 1 : 2]);
}

function pond(c: Ctx, x: number, y: number, rx = 14, ry = 7): void {
  for (let j = -ry; j <= ry; j++) for (let i = -rx; i <= rx; i++) {
    const d = (i / rx) ** 2 + (j / ry) ** 2;
    if (d > 1) continue;
    const rim = d > 0.72;
    const v = rim ? (j < 0 ? 0.15 : 0.55) : 0.45 + (j / ry) * 0.25 + (d < 0.2 ? 0.1 : 0);
    c.L.set(x + i, y - ry + j, rim ? shade(RAMPS.stone, v + 0.2, x + i, y + j) : shade(RAMPS.glass, v, x + i, y + j, 0.5));
  }
  for (const [px, py] of [[-6, -1], [4, 2], [7, -2]]) { c.L.set(x + px, y - ry + py, RAMPS.leaf[3]); c.L.set(x + px + 1, y - ry + py, RAMPS.leaf[2]); c.L.set(x + px, y - ry + py + 1, RAMPS.leaf[1]); }
  c.L.set(x + 5, y - ry + 1, RAMPS.rose[4]);
  for (const [px, py] of [[-9, -3], [-3, -4], [2, 3]]) { c.L.set(x + px, y - ry + py, RAMPS.glass[4]); c.L.set(x + px + 1, y - ry + py, RAMPS.glass[4]); }
}

function hay(c: Ctx, x: number, y: number): void {
  ellipseShadow(c, x + 3, y, 8, 2);
  for (let j = 0; j < 9; j++) {
    const half = Math.round(7 * Math.sqrt(1 - ((j - 3) / 7) ** 2));
    for (let i = -half; i <= half; i++) c.L.set(x + i, y - 1 - j, shade(RAMPS.wheat, 0.75 - (i / 8) * 0.4 + (j > 6 ? 0.1 : 0) - ((i + j) % 4 === 0 ? 0.15 : 0), x + i, y - 1 - j, 0.3));
  }
}

function coral(c: Ctx, x: number, y: number): void {
  for (const [dx, h] of [[-4, 7], [-1, 11], [2, 8], [5, 5]]) for (let j = 0; j < h; j++) {
    c.L.set(x + dx, y - j, RAMPS.rose[j > h - 2 ? 4 : 2]); c.L.set(x + dx + 1, y - j, RAMPS.rose[j > h - 2 ? 3 : 1]);
    if (j === h - 4) c.L.set(x + dx + 2, y - j, RAMPS.rose[3]);
  }
  for (let i = -6; i <= 8; i++) if (hash(i, x) < 0.6) c.sh.set(x + i, y + 1, WATER.light, 255);
}

function shell(c: Ctx, x: number, y: number): void {
  for (const [i, j, k] of [[0, -3, 4], [-1, -2, 3], [0, -2, 4], [1, -2, 3], [-2, -1, 3], [-1, -1, 4], [0, -1, 3], [1, -1, 4], [2, -1, 2], [-1, 0, 2], [0, 0, 2], [1, 0, 2]]) c.L.set(x + i, y + j, RAMPS.blossom[k]);
}

function starfish(c: Ctx, x: number, y: number): void {
  for (const [i, j] of [[0, -3], [0, -2], [-1, -1], [0, -1], [1, -1], [-3, -1], [3, -1], [-2, -1], [2, -1], [0, 0], [-1, 1], [1, 1], [-2, 2], [2, 2]]) c.L.set(x + i, y + j, j < 0 ? RAMPS.roofPeach[3] : RAMPS.roofPeach[2]);
}

function star(c: Ctx, x: number, y: number, s = 2): void {
  for (let i = -s; i <= s; i++) { c.L.set(x + i, y, RAMPS.butter[4]); c.L.set(x, y + i, RAMPS.butter[4]); c.nt.set(x + i, y, LIT[0]); c.nt.set(x, y + i, LIT[0]); }
  c.L.set(x, y, '#ffffff');
}

type Draw = (c: Ctx, x: number, y: number) => void;
type Thing = [Draw, number, number, boolean?]; // draw, x, y, no outline
const T = {
  tree: (r = 12, ramp?: Ramp, seed?: number): Draw => (c, x, y) => tree(c, x, y, r, ramp, seed),
  bush: (r = 6, ramp?: Ramp, seed?: number, berries?: string): Draw => (c, x, y) => bush(c, x, y, r, ramp, seed, berries),
  pine: (h = 26, seed?: number): Draw => (c, x, y) => pine(c, x, y, h, seed),
  house: (o: Parameters<typeof house>[3]): Draw => (c, x, y) => house(c, x, y, o),
  bed: (w?: number, crop?: Ramp, fruit?: string): Draw => (c, x, y) => bed(c, x, y, w, crop, fruit),
  fence: (w?: number): Draw => (c, x, y) => fence(c, x, y, w),
  rock: (r?: number): Draw => (c, x, y) => rock(c, x, y, r),
  star: (s?: number): Draw => (c, x, y) => star(c, x, y, s),
  pond: (rx?: number, ry?: number): Draw => (c, x, y) => pond(c, x, y, rx, ry),
};

// Flowers are painted straight onto the ground: no outline.
function flowerPatch(g: Layer, x: number, y: number, seed: number, colours: string[], n = 5): void {
  for (let i = 0; i < n; i++) {
    const fx = x + Math.round((hash(seed, i) - 0.5) * 14), fy = y + Math.round((hash(seed, i, 1) - 0.5) * 8);
    const col = colours[Math.floor(hash(seed, i, 2) * colours.length)];
    g.set(fx, fy + 2, RAMPS.leaf[1]); g.set(fx + 1, fy + 1, RAMPS.leaf[2]);
    g.set(fx + 1, fy, col); g.set(fx - 1, fy, col); g.set(fx, fy - 1, col); g.set(fx, fy + 1, col);
    g.set(fx, fy, RAMPS.butter[4]);
  }
}

// ---------- A map ----------

interface Area {
  id: string;
  at: [number, number]; // middle of its patch of ground
  r: number; // roughly how big
  sy?: number; // squash up-down
  ground: Ramp;
  kind?: 'grass' | 'wheat' | 'sand';
  flowers?: string[]; // flower colours scattered on it
  petals?: string; // blossom petals scattered on it
  yard?: [number, number, number, number]; // a cobbled yard: middle x, y, radius x, y
  things: Thing[];
  label: [number, number]; // where the sign goes (bottom middle)
  pin?: [number, number]; // where the pet or a dot goes
  locked?: boolean; // gets a "locked:<id>" layer of clouds
  tap?: 'land' | 'land+sea' | 'box';
  tapBox?: [number, number, number, number];
}

interface MapDef {
  name: string;
  width: number;
  height: number;
  areas: Area[];
  island?: { cx: number; cy: number; r: number; sy: number }; // one island cut into areas
  paths: [number, number][][];
  routes?: [number, number][][]; // dotted lines over the sea
  sea: Thing[]; // things in the water
}

const CLIFF = 9; // how tall the cliffs under the land are

function build(def: MapDef) {
  const { width: W, height: H } = def;
  // Which area each pixel belongs to (null: sea).
  const own: (string | null)[] = new Array(W * H).fill(null);
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
    let best: Area | null = null, bd = Infinity;
    def.areas.forEach((a, i) => {
      if (a.tap === 'box') return;
      const dx = x - a.at[0], dy = (y - a.at[1]) * (a.sy ?? 1);
      const ang = Math.atan2(dy, dx);
      const wob = 1 + 0.08 * Math.sin(ang * 3 + i * 1.7) + 0.05 * Math.sin(ang * 6 + i * 2.3) + 0.025 * Math.sin(ang * 13 + i);
      const d = Math.hypot(dx, dy) / (a.r * wob);
      if (d < bd) { bd = d; best = a; }
    });
    let land: boolean;
    if (def.island) {
      const b = def.island, ix = x - b.cx, iy = (y - b.cy) * b.sy, ia = Math.atan2(iy, ix);
      land = Math.hypot(ix, iy) < b.r * (1 + 0.06 * Math.sin(ia * 5 + 1) + 0.04 * Math.sin(ia * 9) + 0.02 * Math.sin(ia * 17)) && bd < 1.6;
    } else land = bd < 1;
    own[y * W + x] = land ? best!.id : null;
  }
  const at = (x: number, y: number) => (x < 0 || y < 0 || x >= W || y >= H ? null : own[y * W + x]);
  const byId = Object.fromEntries(def.areas.map((a) => [a.id, a]));

  // Cliffs: the rock face under each stretch of south-facing coast.
  const cliff = new Int8Array(W * H); // how far down the face (1..CLIFF), 0 if none
  for (let x = 0; x < W; x++) for (let y = 0; y < H; y++) {
    if (!at(x, y) || at(x, y + 1)) continue;
    for (let k = 1; k <= CLIFF && y + k < H && !at(x, y + k); k++) cliff[(y + k) * W + x] = k;
  }
  const solid = (x: number, y: number) => x >= 0 && y >= 0 && x < W && y < H && (!!own[y * W + x] || cliff[y * W + x] > 0);

  // How far each sea pixel is from land (for the shallows and the foam).
  const far = new Float32Array(W * H).fill(99);
  const queue: number[] = [];
  for (let i = 0; i < W * H; i++) if (solid(i % W, Math.floor(i / W))) { far[i] = 0; queue.push(i); }
  for (let q = 0; q < queue.length; q++) {
    const i = queue[q], x = i % W, y = Math.floor(i / W);
    for (const [dx, dy, s] of [[1, 0, 1], [-1, 0, 1], [0, 1, 1], [0, -1, 1], [1, 1, 1.41], [-1, 1, 1.41], [1, -1, 1.41], [-1, -1, 1.41]]) {
      const nx = x + dx, ny = y + dy;
      if (nx < 0 || ny < 0 || nx >= W || ny >= H) continue;
      const j = ny * W + nx;
      if (far[j] > far[i] + s && far[i] + s < 40) { far[j] = far[i] + s; queue.push(j); }
    }
  }

  const ground = new Layer(W, H);
  // The sea: foam on the rocks, a ring of shallows, a dashed second wave,
  // then deeper water in slow patches.
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
    if (solid(x, y)) continue;
    const d0 = far[y * W + x], d = d0 + noise(x, y, 6, 9) * 1.2;
    let col: string;
    if (d0 < 1.5) col = hash(x >> 1, y, 4) < 0.85 ? WATER.foam : WATER.light;
    else if (d < 3) col = WATER.light;
    else if (d < 5.5) col = shade([WATER.shallower, WATER.light], (5.5 - d) / 2.5, x, y, 0.8);
    else if (d > 6.5 && d < 7.6 && Math.floor((x + y * 0.5) / 5) % 3 !== 0) col = WATER.light; // a second, broken wave
    else if (d < 14) col = shade([WATER.shallow, WATER.shallower], (14 - d) / 8, x, y, 0.8);
    else if (d < 24) col = shade([WATER.mid, WATER.shallow], (24 - d) / 10, x, y, 0.8);
    else col = shade([WATER.mid, WATER.deep], clamp((d - 24) / 10 + noise(x, y, 30, 3) * 0.25, 0, 1), x, y, 0.9); // deep out at sea, the screen's colour
    ground.set(x, y, col);
  }
  // Glints on the open sea.
  for (let i = 0; i < 90; i++) {
    const x = Math.floor(hash(i, 1) * W), y = Math.floor(hash(i, 2) * H), len = 3 + Math.floor(hash(i, 3) * 5);
    let open = true;
    for (let k = -2; k < len + 2; k++) if (solid(x + k, y) || far[y * W + clamp(x + k, 0, W - 1)] < 16) open = false;
    if (!open) continue;
    for (let k = 0; k < len; k++) ground.set(x + k, y, WATER.light);
    for (let k = 1; k < len - 1; k++) ground.set(x + k, y + 1, WATER.deep);
  }
  // Cliff faces: a shadow under the grass lip, then layered rock.
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
    const k = cliff[y * W + x];
    if (!k) continue;
    let v: number;
    if (k === 1) v = 0.1;
    else if (k === 2) v = 0.85;
    else if (k >= CLIFF - 1) v = k === CLIFF ? 0.0 : 0.22;
    else {
      v = 0.55 + noise(x, y, 3, 5) * 0.2;
      if ((x + Math.floor(noise(x, 0, 5, 6) * 3)) % 9 === 0) v = 0.25;
      if ((k + Math.floor(noise(x, 0, 8, 7) * 2)) % 3 === 0) v -= 0.12;
    }
    ground.set(x, y, shade(RAMPS.cliff, v, x, y, 0.25));
  }

  // Ground.
  const paved = new Uint8Array(W * H);
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
    const id = at(x, y);
    if (!id) continue;
    const a = byId[id], r = a.ground;
    let v = 0.5 + noise(x, y, 14, 1) * 0.22 + noise(x, y, 4, 2) * 0.1;
    if (a.kind === 'wheat') v = 0.52 + noise(x, y, 10, 1) * 0.15 + (y % 4 === 0 ? -0.3 : y % 4 === 1 ? 0.2 : 0) + (hash(x, y) < 0.06 ? 0.25 : 0);
    if (a.kind === 'sand') v = 0.62 + noise(x, y, 12, 1) * 0.15;
    ground.set(x, y, shade(r, v, x, y, 0.5));
    if (a.yard) {
      const [cx, cy, rx, ry] = a.yard, d = ((x - cx) / rx) ** 2 + ((y - cy) / ry) ** 2 + noise(x, y, 5, 3) * 0.15;
      if (d < 1) {
        paved[y * W + x] = 1;
        const row = Math.floor(y / 3), off = (row % 2) * 2, col = Math.floor((x + off) / 4), mortar = y % 3 === 2 || (x + off) % 4 === 3;
        ground.set(x, y, mortar ? RAMPS.plaza[1] : shade(RAMPS.plaza, 0.62 + hash(col, row) * 0.3 - (d > 0.8 ? 0.2 : 0), x, y, 0.2));
      }
    }
  }
  // Grass tufts and petals.
  for (let y = 2; y < H; y += 2) for (let x = 1; x < W; x += 2) {
    const id = at(x, y);
    if (!id) continue;
    const a = byId[id], hx = hash(x * 7, y * 11);
    if ((a.kind ?? 'grass') === 'grass' && hx < 0.05 && at(x + 2, y) === id && at(x, y - 1) === id) {
      ground.set(x, y, a.ground[1]); ground.set(x + 2, y, a.ground[1]); ground.set(x + 1, y - 1, a.ground[1]);
      ground.set(x + 1, y, a.ground[4]); ground.set(x, y - 1, a.ground[3]);
    }
    if (a.petals && hx > 0.965) { ground.set(x, y, a.petals); if (hx > 0.985) ground.set(x + 1, y, a.ground[4]); }
  }
  for (const a of def.areas) if (a.flowers) {
    for (let i = 0; i < 26; i++) {
      const fx = Math.round(a.at[0] + (hash(i, 31, a.r) - 0.5) * a.r * 1.8), fy = Math.round(a.at[1] + (hash(i, 32, a.r) - 0.5) * a.r * 1.5);
      if (at(fx, fy) === a.id && at(fx + 9, fy) === a.id && at(fx - 9, fy) === a.id && at(fx, fy + 6) === a.id) flowerPatch(ground, fx, fy, i * 13 + a.r, a.flowers, 4);
    }
  }
  // Paths: smooth curves of packed earth, lighter in the middle.
  const pathAt = new Float32Array(W * H).fill(99);
  for (const pts of def.paths) {
    for (let i = 0; i < pts.length - 1; i++) {
      const p0 = pts[Math.max(0, i - 1)], p1 = pts[i], p2 = pts[i + 1], p3 = pts[Math.min(pts.length - 1, i + 2)];
      const n = Math.ceil(Math.hypot(p2[0] - p1[0], p2[1] - p1[1]) * 2);
      for (let j = 0; j <= n; j++) {
        const t = j / n, t2 = t * t, t3 = t2 * t;
        const cr = (a: number, b: number, c: number, d: number) => 0.5 * (2 * b + (-a + c) * t + (2 * a - 5 * b + 4 * c - d) * t2 + (-a + 3 * b - 3 * c + d) * t3);
        const px = cr(p0[0], p1[0], p2[0], p3[0]), py = cr(p0[1], p1[1], p2[1], p3[1]);
        for (let dy = -5; dy <= 5; dy++) for (let dx = -5; dx <= 5; dx++) {
          const x = Math.round(px + dx), y = Math.round(py + dy);
          if (!at(x, y)) continue;
          const d = Math.hypot(x - px, y - py);
          if (d < pathAt[y * W + x]) pathAt[y * W + x] = d;
        }
      }
    }
  }
  const PATH = 3.2;
  const onPath = (x: number, y: number) => x >= 0 && y >= 0 && x < W && y < H && !paved[y * W + x] && pathAt[y * W + x] + noise(x, y, 3, 8) * 0.5 < PATH;
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
    if (onPath(x, y)) {
      const d = pathAt[y * W + x];
      let v = 0.78 - (d / PATH) * 0.45;
      if (!onPath(x, y - 1)) v = 0.25; // a darker top edge, where the grass overhangs
      if (hash(x, y, 5) < 0.04) v = 0.95;
      ground.set(x, y, hash(x, y, 6) < 0.02 ? RAMPS.stone[2] : shade(RAMPS.path, v, x, y, 0.4));
    } else if (at(x, y) && onPath(x, y - 1)) ground.mix(x, y, INK, 0.25); // shade under its bottom edge
  }
  // Hedges between areas, open where a path goes through.
  const hedge = new Uint8Array(W * H);
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
    const id = at(x, y);
    if (!id || pathAt[y * W + x] < PATH + 3) continue;
    for (let dy = -2; dy <= 2; dy++) for (let dx = -2; dx <= 2; dx++) { const o = at(x + dx, y + dy); if (o && o !== id && dx * dx + dy * dy <= 5) hedge[y * W + x] = 1; }
  }
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
    if (hedge[y * W + x] !== 1) continue;
    const up = noise(x, 0, 3, 11) > 0 ? 3 : 2;
    for (let k = 1; k <= up; k++) if (at(x, y - k) && !hedge[(y - k) * W + x] && pathAt[(y - k) * W + x] >= PATH + 3) hedge[(y - k) * W + x] = 2;
  }
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
    if (!hedge[y * W + x]) continue;
    const topEdge = y === 0 || !hedge[(y - 1) * W + x], bottom = y + 1 >= H || !hedge[(y + 1) * W + x];
    const v = topEdge ? 0.85 : bottom ? 0.1 : 0.5 + noise(x, y, 2, 12) * 0.25;
    ground.set(x, y, shade(RAMPS.hedge, v, x, y, 0.3));
    if (bottom) for (let k = 1; k <= 2; k++) if (at(x, y + k) && !hedge[(y + k) * W + x]) ground.mix(x + 1, y + k, INK, 0.3 / k);
  }
  // The coast: a light lip where the land meets its cliff, a dark line
  // where it meets the water on the other sides.
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
    const id = at(x, y);
    if (!id) continue;
    if (y + 1 < H && cliff[(y + 1) * W + x] === 1) { ground.set(x, y, byId[id].ground[4]); continue; }
    if (!solid(x, y - 1) || !solid(x - 1, y) || !solid(x + 1, y)) ground.set(x, y, byId[id].ground[0]);
  }
  // Dotted routes over the sea.
  for (const r of def.routes ?? []) {
    let n = 0;
    for (let i = 0; i < r.length - 1; i++) {
      const [x0, y0] = r[i], [x1, y1] = r[i + 1];
      const steps = Math.max(Math.abs(x1 - x0), Math.abs(y1 - y0));
      for (let j = 0; j <= steps; j++) {
        const x = Math.round(x0 + ((x1 - x0) * j) / steps), y = Math.round(y0 + ((y1 - y0) * j) / steps);
        if (solid(x, y) || far[y * W + x] < 5) continue;
        if (n++ % 10 < 4) for (const [dx, dy] of [[0, 0], [1, 0], [0, 1], [1, 1]]) ground.set(x + dx, y + dy, WATER.foam);
      }
    }
  }

  // Things, nearest (lowest) last, each outlined on its own.
  const details = new Layer(W, H);
  const night = new Layer(W, H);
  const shadows = new Layer(W, H);
  const all = [...def.areas.flatMap((a) => a.things), ...def.sea].sort((p, q) => p[2] - q[2]);
  for (const [draw, x, y, bare] of all) {
    const L = new Layer(W, H);
    draw({ L, sh: shadows, nt: night }, x, y);
    if (!bare) L.outline();
    details.over(L);
  }
  // Shadows darken the ground (mixed in, so they take on its colour).
  for (let i = 0; i < shadows.data.length; i += 4) {
    const a = shadows.data[i + 3];
    if (!a) continue;
    const x = (i / 4) % W, y = Math.floor(i / 4 / W);
    const c = '#' + [0, 1, 2].map((k) => shadows.data[i + k].toString(16).padStart(2, '0')).join('');
    ground.mix(x, y, c, a / 255);
  }
  // A soft glow around each light at night.
  const glow = new Layer(W, H);
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
    if (night.has(x, y)) continue;
    let best = 0;
    for (let dy = -4; dy <= 4; dy++) for (let dx = -4; dx <= 4; dx++) if (night.has(x + dx, y + dy)) best = Math.max(best, 1 - Math.hypot(dx, dy) / 5);
    if (best > 0) glow.set(x, y, LIT[2], Math.round(best * 90 * (bayer(x, y) < 0.75 ? 1 : 0.6)));
  }
  night.over(glow);

  // Clouds over locked areas: soft puffs, lit from the top left.
  const locked: Record<string, Layer> = {};
  for (const a of def.areas.filter((a) => a.locked)) {
    const l = new Layer(W, H);
    const puffs: [number, number, number][] = [];
    for (let y = 0; y < H; y += 9) for (let x = (y / 9) % 2 ? 5 : 0; x < W; x += 11) {
      if (at(x, y) !== a.id || hash(x, y, 9) < 0.3) continue; // gaps, to peek through
      puffs.push([x + (hash(x, y) - 0.5) * 6, y + (hash(y, x) - 0.5) * 4, 8 + hash(x, y, 2) * 5]);
    }
    for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
      let near = false;
      for (let dy = -2; dy <= 2 && !near; dy++) for (let dx = -2; dx <= 2; dx++) if (at(x + dx, y + dy) === a.id) { near = true; break; }
      if (!near) continue;
      let v = -1;
      for (const [px, py, pr] of puffs) {
        const dx = (x - px) / pr, dy = (y - py) / pr, d = dx * dx + dy * dy;
        if (d > 1) continue;
        v = Math.max(v, 0.42 - dx * 0.22 - dy * 0.4 + Math.sqrt(1 - d) * 0.12 - (d > 0.8 ? 0.15 : 0));
      }
      if (v < 0) continue;
      l.set(x, y, shade(RAMPS.cloud, v, x, y, 0.3), 236);
    }
    const edge: number[] = [];
    for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) if (!l.has(x, y) && (l.has(x + 1, y) || l.has(x - 1, y) || l.has(x, y + 1) || l.has(x, y - 1))) edge.push(x, y);
    for (let i = 0; i < edge.length; i += 2) l.set(edge[i], edge[i + 1], RAMPS.cloud[0], 210);
    locked[a.id] = l;
  }

  // The shapes you tap: the area's land and its cliff, plus the sea around
  // a small island, or a box (the ship).
  const colours = ['#f48fb1', '#ffe596', '#9ad3f0', '#a68bc9', '#a8e6cf', '#ffc59e', '#e05a7a', '#6cc19a'];
  const tap: Record<string, Layer> = {};
  def.areas.forEach((a, i) => {
    const l = new Layer(W, H);
    for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
      const k = cliff[y * W + x];
      let on = at(x, y) === a.id || (k > 0 && at(x, y - k) === a.id);
      if (a.tap === 'land+sea' && !on && !solid(x, y)) on = Math.hypot(x - a.at[0], (y - a.at[1]) * (a.sy ?? 1)) < a.r * 1.25;
      if (a.tap === 'box') {
        // What's drawn in the box (the ship and the dock), with a margin.
        const [bx, by, bw, bh] = a.tapBox!;
        on = false;
        if (x >= bx && y >= by && x < bx + bw && y < by + bh) for (let dy = -4; dy <= 4 && !on; dy++) for (let dx = -4; dx <= 4; dx++) if (dx * dx + dy * dy <= 16 && details.has(x + dx, y + dy) && !at(x + dx, y + dy)) { on = true; break; }
      }
      if (on) l.set(x, y, colours[i % colours.length]);
    }
    tap[a.id] = l;
  });
  const slices: AseSlice[] = def.areas.flatMap((a) => [
    { name: `label:${a.id}`, x: a.label[0] - 16, y: a.label[1] - 8, width: 32, height: 8 },
    ...(a.pin ? [{ name: `pin:${a.id}`, x: a.pin[0] - 6, y: a.pin[1] - 6, width: 12, height: 12 }] : []),
  ]);
  return { ground, details, night, locked, tap, slices };
}

// ---------- The two maps ----------
//
// Laid out on a 180 x 270 grid and doubled (`scale`), so the numbers stay
// small. The sizes of things are in real pixels.

const F = 2;
const dbl = (x: number, y: number): [number, number] => [x * F, y * F];
const put = (draw: Draw, x: number, y: number, bare = false): Thing => [draw, x * F, y * F, bare];
function scale(def: MapDef): MapDef {
  return {
    ...def,
    width: def.width * F, height: def.height * F,
    island: def.island && { ...def.island, cx: def.island.cx * F, cy: def.island.cy * F, r: def.island.r * F },
    paths: def.paths.map((pts) => pts.map(([x, y]) => dbl(x, y))),
    routes: def.routes?.map((pts) => pts.map(([x, y]) => dbl(x, y))),
    areas: def.areas.map((a) => ({
      ...a, at: dbl(...a.at), r: a.r * F, label: dbl(...a.label), pin: a.pin && dbl(...a.pin),
      yard: a.yard && [a.yard[0] * F, a.yard[1] * F, a.yard[2] * F, a.yard[3] * F],
      tapBox: a.tapBox && [a.tapBox[0] * F, a.tapBox[1] * F, a.tapBox[2] * F, a.tapBox[3] * F],
    })),
  };
}
const FLOWERS = [RAMPS.rose[3], RAMPS.butter[3], '#ffffff', RAMPS.roofLilac[3]];

// The home island: the places you walk to. The ship sails to the journeys.
const ISLAND: MapDef = scale({
  name: 'island',
  width: 180,
  height: 270,
  island: { cx: 90, cy: 128, r: 86, sy: 0.74 },
  paths: [
    [[103, 150], [116, 132], [130, 116]], // backyard
    [[77, 150], [64, 132], [46, 116]], // meadow
    [[100, 156], [112, 176], [124, 206]], // friends
    [[80, 156], [68, 176], [54, 200]], // the fields
    [[90, 158], [91, 200], [90, 230]], // the dock
    [[46, 116], [36, 152], [52, 200]], // meadow - fields
    [[130, 116], [146, 152], [126, 206]], // backyard - friends
  ],
  areas: [
    {
      id: 'home', at: [90, 138], r: 30, ground: RAMPS.lawn, label: [90, 180], pin: [72, 160], yard: [90, 152, 14, 6],
      things: [
        put(T.house({ w: 52, roof: RAMPS.roofRed }), 90, 147),
        put(T.tree(13, RAMPS.leaf, 4), 62, 142),
        put(T.bush(6, RAMPS.leaf, 5, RAMPS.rose[3]), 118, 150), put(T.bush(4, RAMPS.leaf, 17), 66, 152),
        put(well, 112, 168), put(mailbox, 75, 164), put(lamp, 104, 160),
      ],
    },
    {
      id: 'backyard', at: [136, 90], r: 34, ground: RAMPS.fresh, label: [138, 58], pin: [146, 108],
      things: [
        put(T.fence(64), 136, 70), put(T.tree(13, RAMPS.leaf, 6), 164, 90), put(T.tree(11, RAMPS.leaf, 18), 108, 74),
        put(skep, 118, 94), put(skep, 128, 97), put(bees, 124, 78, true), put(birdhouse, 150, 96),
        put(T.bed(30, RAMPS.leaf, RAMPS.rose[3]), 122, 120), put(T.bed(30, RAMPS.leaf, RAMPS.butter[3]), 156, 122), put(T.bed(24, RAMPS.leaf), 162, 138),
        put(T.bush(5, RAMPS.leaf, 19, RAMPS.roofLilac[3]), 172, 110),
      ],
    },
    {
      id: 'meadow', at: [44, 96], r: 34, ground: RAMPS.meadow, flowers: FLOWERS, label: [44, 60], pin: [40, 120],
      things: [
        put(T.pond(15, 7), 30, 112), put(T.tree(15, RAMPS.leaf, 8), 20, 88), put(T.tree(10, RAMPS.leaf, 20), 66, 76),
        put(bench, 56, 94), put(T.bush(6, RAMPS.leaf, 9), 66, 118), put(T.rock(5), 18, 128), put(T.bush(4, RAMPS.leaf, 21, RAMPS.butter[3]), 40, 78),
      ],
    },
    {
      id: 'friends', at: [134, 192], r: 32, ground: RAMPS.teal, petals: RAMPS.blossom[3], label: [134, 238], pin: [112, 216],
      things: [
        put(T.house({ w: 44, roof: RAMPS.roofBlue, flowers: RAMPS.butter[3] }), 132, 202),
        put(T.tree(13, RAMPS.blossom, 10), 162, 196), put(T.tree(10, RAMPS.blossom, 22), 152, 176), put(T.bush(5, RAMPS.blossom, 11), 154, 222),
        put(bench, 112, 226), put(mailbox, 150, 208), put(lamp, 118, 206), put(T.bush(4, RAMPS.leaf, 23), 102, 192),
      ],
    },
    {
      id: 'fields', at: [46, 192], r: 32, ground: RAMPS.wheat, kind: 'wheat', label: [46, 238], locked: true,
      things: [put(windmill, 46, 208), put(hay, 26, 190), put(hay, 66, 222), put(hay, 32, 226)],
    },
    {
      id: 'ship', at: [90, 250], r: 1, ground: RAMPS.sand, label: [150, 266], pin: [112, 254], tap: 'box', tapBox: [82, 222, 46, 46],
      things: [],
    },
  ],
  sea: [put(dock, 90, 250), put(ship, 114, 262), put(T.rock(4), 26, 236), put(T.rock(3), 162, 246), put(T.rock(3), 172, 72)],
});

// The sea behind the ship: each journey place is its own island.
const SEA: MapDef = scale({
  name: 'sea',
  width: 180,
  height: 270,
  paths: [[[104, 100], [130, 92], [156, 102]]],
  routes: [[[96, 236], [56, 172]], [[96, 236], [136, 198]], [[96, 236], [122, 112]], [[96, 236], [66, 92]]],
  areas: [
    {
      id: 'woods', at: [44, 140], r: 30, sy: 1.05, ground: RAMPS.forest, label: [44, 106], pin: [56, 170], tap: 'land+sea', locked: true,
      things: [
        ...Array.from({ length: 12 }, (_, i) => put(T.pine(22 + Math.round(hash(7, i) * 10), i), Math.round(24 + hash(5, i) * 40), Math.round(124 + hash(6, i) * 32))),
        put(T.house({ w: 30, roof: RAMPS.roofPeach }), 42, 168), put(mushroom, 62, 166), put(mushroom, 26, 164),
      ],
    },
    {
      id: 'market', at: [130, 76], r: 30, ground: RAMPS.sand, kind: 'sand', label: [130, 42], pin: [116, 108], tap: 'land+sea', locked: true, yard: [130, 98, 20, 9],
      things: [
        put(T.house({ w: 34, roof: RAMPS.roofLilac }), 114, 82), put(T.house({ w: 32, roof: RAMPS.roofRed, chimney: false }), 147, 86),
        put(stall, 130, 106), put(lamp, 110, 96), put(lamp, 150, 100), put(T.tree(8, RAMPS.leaf, 24), 108, 64), put(T.bush(4, RAMPS.leaf, 25, RAMPS.rose[3]), 160, 70),
      ],
    },
    {
      id: 'cove', at: [140, 172], r: 28, ground: RAMPS.sand, kind: 'sand', label: [140, 142], pin: [136, 196], tap: 'land+sea', locked: true,
      things: [put(palm, 130, 176), put(palm, 152, 166), put(T.rock(6), 156, 186), put(T.rock(4), 120, 170), put(T.bush(5, RAMPS.leaf, 12), 140, 158), put(shell, 128, 190, true), put(shell, 146, 194, true), put(starfish, 138, 186, true)],
    },
    {
      id: 'hill', at: [58, 58], r: 26, ground: RAMPS.heath, label: [58, 28], pin: [70, 84], tap: 'land+sea', locked: true,
      things: [put(dome, 54, 68), put(telescope, 72, 68), put(T.rock(4), 40, 76), put(T.star(2), 40, 44, true), put(T.star(1), 76, 42, true), put(T.star(2), 66, 36, true)],
    },
    {
      id: 'home', at: [90, 304], r: 66, ground: RAMPS.fresh, label: [90, 262], pin: [96, 236], tap: 'land+sea',
      things: [put(T.tree(13, RAMPS.leaf, 13), 52, 268), put(T.tree(12, RAMPS.leaf, 14), 134, 270), put(T.bush(5, RAMPS.leaf, 15), 70, 262)],
    },
  ],
  sea: [put(coral, 170, 204, true), put(coral, 110, 208, true), put(coral, 168, 150, true), put(dock, 90, 250), put(ship, 112, 240), put(T.rock(4), 96, 162), put(T.rock(3), 20, 212)],
});

// ---------- Saving ----------

const force = process.argv.includes('--force');
const root = fileURLToPath(new URL('..', import.meta.url));
const written: string[] = [];
const skipped: string[] = [];
function save(path: string, make: () => Buffer | string): void {
  const full = root + path;
  if (existsSync(full) && !force) return void skipped.push(path);
  mkdirSync(dirname(full), { recursive: true });
  writeFileSync(full, make());
  written.push(path);
}

// The file's palette: every ramp, so it's there to pick from in Aseprite.
const palette = [
  ...Object.entries(RAMPS).flatMap(([name, r]) => r.map((hex, i) => ({ name: `${name} ${i + 1}`, hex }))),
  ...Object.entries(WATER).map(([name, hex]) => ({ name: `water ${name}`, hex })),
  { name: 'ink', hex: INK },
  ...LIT.map((hex, i) => ({ name: `light ${i + 1}`, hex })),
];
for (const def of [ISLAND, SEA]) {
  const art = build(def);
  const { width, height } = def;
  const picture = new Layer(width, height);
  picture.over(art.ground);
  picture.over(art.details);
  const layers: AseLayer[] = [
    { name: 'ground', cels: [art.ground.data] },
    { name: 'details', cels: [art.details.data] },
    ...Object.entries(art.locked).map(([id, l]) => ({ name: `locked:${id}`, cels: [l.data] })),
    { name: 'night', cels: [art.night.data], hidden: true },
    ...Object.entries(art.tap).map(([id, l]) => ({ name: `area:${id}`, cels: [l.data], hidden: true, opacity: 140 })),
  ];
  save(`art/map/${def.name}.aseprite`, () =>
    writeAseprite({ width, height, frameMs: [100], layers, tags: [], palette, slices: art.slices }),
  );
  const px = (l: Layer) => ({ width, height, data: l.data });
  save(`public/sprites/map/${def.name}.png`, () => writePng(px(picture)));
  save(`public/sprites/map/${def.name}-night.png`, () => writePng(px(art.night)));
  for (const [id, l] of Object.entries(art.locked)) save(`public/sprites/map/${def.name}-locked-${id}.png`, () => writePng(px(l)));
  const data = mapData(width, height, Object.entries(art.tap).map(([id, l]) => ({ id, pixels: px(l) })), art.slices, { night: true, locked: Object.keys(art.locked) });
  save(`public/sprites/map/${def.name}.json`, () => JSON.stringify(data) + '\n');
}

console.log(`Wrote ${written.length} files.`);
if (skipped.length) console.log(`Kept ${skipped.length} existing files (use --force to replace them).`);
