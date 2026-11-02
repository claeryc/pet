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
// The style matches the pets: chunky pixels (the map is 180 x 270 and the
// game scales it up), the game's soft palette with a light and a dark
// shade per colour, flat fills, no dithering, and an ink outline around
// everything that stands up. The light comes from the top left.
//
// Every object is placed inside the area it belongs to: if its spot would
// put any of it in the sea, on a hedge, the coast, a path or another
// object, it's nudged to the nearest spot that fits (the script says so).

import { existsSync, mkdirSync, writeFileSync } from 'node:fs';
import { dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { writeAseprite, type AseLayer, type AseSlice } from './aseprite.ts';
import { mapData } from './map-data.ts';
import { writePng } from './png.ts';

// ---------- Colours ----------
//
// The game's palette (src/render/palette.ts), each with a shade either
// side where it needs one: [dark, base, light].

const INK = '#2b2140';
const C = {
  mint: ['#7fcfae', '#a8e6cf', '#cdf3e1'],
  leaf: ['#4fa27c', '#6cc19a', '#94d8b4'],
  meadow: ['#93c477', '#b5dc91', '#d6efb4'],
  blush: ['#e48ea3', '#f7b6c4', '#fcd6de'],
  butter: ['#e9c46a', '#ffe596', '#fff3c4'],
  peach: ['#eaa47c', '#ffc59e', '#ffe0c8'],
  sand: ['#e9c895', '#f6dfb4', '#fff1d8'],
  lavender: ['#b9a2d8', '#d9c8ee', '#efe6fa'],
  moss: ['#2f6a50', '#3f7d62', '#57997a'],
  plum: ['#3e2a55', '#5b3f6e', '#7d5f98'],
  lilac: ['#7d5f98', '#a68bc9', '#c7b0e3'],
  pink: ['#c9607f', '#f48fb1', '#fbb8cf'],
  rose: ['#a8405f', '#e05a7a', '#f48fb1'],
  sky: ['#5a8fd6', '#9ad3f0', '#d4eefa'],
  cream: ['#e6d3bd', '#fff7ec', '#ffffff'],
  cocoa: ['#5c3a2e', '#8a5a44', '#b07a5c'],
  stone: ['#7d7598', '#a8a2c0', '#d0cce0'],
};
type Shades = string[];
const WATER = { deep: '#4a7cc8', mid: '#5a8fd6', shallow: '#78ade4', light: '#9ad3f0', foam: '#ffffff' };
const PATH = ['#d39a6c', '#efc493', '#fbe1bd']; // packed earth
const LIT = ['#fff3c4', '#ffe596']; // a lit window, and its glow

const rgb = (h: string): [number, number, number] => { const n = parseInt(h.slice(1), 16); return [n >> 16, (n >> 8) & 255, n & 255]; };
const clamp = (v: number, a: number, b: number) => Math.max(a, Math.min(b, v));

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
  mix(x: number, y: number, colour: string, amount: number): void {
    if (!this.has(x, y)) return;
    const i = (y * this.width + x) * 4, c = rgb(colour);
    for (let k = 0; k < 3; k++) this.data[i + k] = Math.round(this.data[i + k] * (1 - amount) + c[k] * amount);
  }
  over(top: Layer): void {
    for (let i = 0; i < top.data.length; i += 4) {
      const a = top.data[i + 3];
      if (!a) continue;
      if (a === 255 || !this.data[i + 3]) { this.data.set(top.data.subarray(i, i + 4), i); continue; }
      for (let k = 0; k < 3; k++) this.data[i + k] = Math.round(this.data[i + k] * (1 - a / 255) + top.data[i + k] * (a / 255));
    }
  }
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
// Each draws into `L` with its bottom middle at (x, y). `sh` takes its
// shadow on the ground, `nt` its lights at night.

interface Ctx { L: Layer; sh: Layer; nt: Layer }
type Draw = (c: Ctx, x: number, y: number) => void;

function rect(L: Layer, x0: number, y0: number, w: number, h: number, colour: (x: number, y: number) => string | null): void {
  for (let y = y0; y < y0 + h; y++) for (let x = x0; x < x0 + w; x++) { const col = colour(x, y); if (col) L.set(x, y, col); }
}
function shadow(c: Ctx, x: number, y: number, rx: number, ry = 1): void {
  for (let j = -ry; j <= ry; j++) for (let i = -rx; i <= rx; i++) if ((i / (rx + 0.5)) ** 2 + (j / (ry + 0.5)) ** 2 <= 1) c.sh.set(x + i, y + j, INK, 70);
}
// Pixel rows: one letter per pixel ('.' empty), bottom middle at (x, y).
function rows(L: Layer, art: string[], x: number, y: number, key: Record<string, string>): void {
  const w = Math.max(...art.map((r) => r.length)), ox = x - Math.floor(w / 2), oy = y - art.length;
  art.forEach((r, j) => [...r].forEach((ch, i) => { if (ch !== '.') L.set(ox + i, oy + j, key[ch]); }));
}

// A round canopy: light on the top left, dark along the bottom right.
function canopy(L: Layer, cx: number, cy: number, r: number, s: Shades, seed: number): void {
  for (let y = Math.floor(cy - r - 1); y <= cy + r + 1; y++) for (let x = Math.floor(cx - r - 1); x <= cx + r + 1; x++) {
    const dx = (x - cx) / r, dy = (y - cy) / (r * 0.92);
    const d = Math.hypot(dx, dy) / (1 + 0.12 * Math.sin(Math.atan2(dy, dx) * 5 + seed));
    if (d > 1) continue;
    const light = -dx * 0.7 - dy * 0.7;
    const col = d > 0.7 && light < -0.15 ? s[0] : light > 0.25 && d > 0.25 && d < 0.8 && hash(x >> 1, y >> 1, seed) < 0.75 ? s[2] : s[1];
    L.set(x, y, col);
  }
}

function tree(c: Ctx, x: number, y: number, r = 6, s: Shades = C.leaf, seed = 1): void {
  shadow(c, x + 2, y, r, 1);
  rect(c.L, x - 1, y - 4, 2, 4, (xx) => (xx === x - 1 ? C.cocoa[1] : C.cocoa[0]));
  canopy(c.L, x, y - 4 - r * 0.8, r, s, seed);
}
function bush(c: Ctx, x: number, y: number, r = 3, s: Shades = C.leaf, seed = 2, berry?: string): void {
  shadow(c, x + 1, y, r, 0);
  canopy(c.L, x, y - r, r, s, seed);
  if (berry) for (const [i, j] of [[-1, -r - 1], [1, -r + 1], [-2, -r + 1]]) c.L.set(x + i, y + j, berry);
}
function pine(c: Ctx, x: number, y: number, h = 13): void {
  shadow(c, x + 2, y, 4, 1);
  rect(c.L, x - 1, y - 2, 2, 2, () => C.cocoa[0]);
  for (let t = 0; t < 3; t++) {
    const top = y - 2 - h + t * Math.round(h / 3.2), tall = Math.round(h / 2.4);
    for (let j = 0; j < tall; j++) {
      const half = Math.round(((j + 1) / tall) * (2 + t * 1.2));
      for (let i = -half; i <= half; i++) c.L.set(x + i, top + j, j === tall - 1 ? C.moss[0] : i < 0 ? C.moss[2] : C.moss[1]);
    }
  }
}

// A cottage: tiled roof, cream walls, two windows (lit at night), a door.
function house(c: Ctx, x: number, y: number, roof: Shades, o: { w?: number; chimney?: boolean; flowers?: string } = {}): void {
  const w = o.w ?? 22, wh = 8, rh = 8, x0 = x - Math.floor(w / 2), top = y - wh;
  shadow(c, x + 3, y, Math.round(w / 2) + 1, 1);
  rect(c.L, x0, top, w, wh, (xx, yy) => (yy === y - 1 ? C.stone[0] : yy === top ? C.cream[0] : xx >= x0 + w - 2 ? C.cream[0] : C.cream[1]));
  const win = (wx: number) => {
    rect(c.L, wx, top + 2, 3, 3, (xx, yy) => { c.nt.set(xx, yy, LIT[0]); return xx === wx && yy === top + 2 ? C.sky[2] : C.sky[1]; });
    for (let i = 0; i < 3; i++) c.L.set(wx + i, top + 5, i % 2 ? C.leaf[1] : o.flowers ?? C.pink[1]);
  };
  win(x0 + 2);
  win(x0 + w - 5);
  rect(c.L, x - 1, y - 6, 3, 5, (xx, yy) => (xx === x + 1 && yy === y - 4 ? C.butter[1] : yy === y - 6 ? C.cocoa[0] : C.cocoa[1]));
  // The roof: wider than the walls, lighter on the left, a row of tiles every 3.
  for (let j = 0; j < rh; j++) {
    const half = Math.floor(w / 2) + 1 - Math.floor((rh - 1 - j) * 0.6), yy = top - rh + j;
    for (let i = -half; i < half + (w % 2); i++) {
      const col = j === rh - 1 ? roof[0] : j === 0 ? roof[2] : j % 3 === 2 ? roof[0] : i < -half / 3 ? roof[2] : roof[1];
      c.L.set(x + i, yy, col);
    }
  }
  if (o.chimney !== false) { const cx = x + Math.floor(w / 4); rect(c.L, cx, top - rh - 2, 3, 4, (xx, yy) => (yy === top - rh - 2 || xx === cx ? C.stone[2] : C.stone[1])); }
}

const KEY: Record<string, string> = {
  k: INK, y: C.butter[1], Y: C.butter[0], h: C.butter[2], b: C.cocoa[1], B: C.cocoa[0], c: C.cocoa[2], s: C.sky[1], S: C.sky[2],
  r: C.rose[1], R: C.rose[0], p: C.pink[1], w: C.cream[1], W: C.cream[0], g: C.leaf[1], G: C.leaf[0], n: C.leaf[2],
  l: C.lilac[2], L: C.plum[1], t: C.stone[1], T: C.stone[0], u: C.stone[2], o: WATER.mid, e: C.peach[1],
};
const art = (a: string[], shadowW = 0): Draw => (c, x, y) => { if (shadowW) shadow(c, x + 2, y, shadowW, 1); rows(c.L, a, x, y, KEY); };

const skep = art(['..hy..', '.hyyy.', 'YYYYYY', 'hyyyyY', 'YYkkYY', 'hyykyY', 'bbbbbb'], 3);
const birdhouse = art(['..R..', '.RrR.', 'RrrrR', '.sks.', '.SsS.', '..b..', '..b..', '..b..'], 2);
const mailbox = art(['rrrY', 'rrr.', '.b..', '.b..', '.b..'], 2);
const bench = art(['cccccccc', 'bbbbbbbb', 'cccccccc', 'B.....B.'], 4);
const well = art(['.RRRRRRR.', 'RrrrrrrrR', '.b.....b.', '.b..W..b.', 'TuuuuuuuT', 'TtooootT.', 'TtttttttT', 'TTTTTTTTT'], 5);
const lamp = art(['kyk', 'yhy', 'kyk', '.t.', '.t.', '.t.', '.t.', 'ttt'], 1);
const bed = art(['cccccccccccc', 'cGgnGgnGgnGc', 'cBBBBBBBBBBc', 'bbbbbbbbbbbb'], 6);
const hay = art(['.hyyh.', 'hyyyyY', 'yyYyyY', 'YYYYYY'], 3);
const rock = art(['.uut.', 'uttTT', 'tTTTT'], 2);
const mushroom = art(['.rr.', 'rwrr', '.w..']);
const shell = art(['.p.', 'ppp']);
const coral = art(['r.r.r', 'rrr.r', '.rrr.', '..r..']);
const telescope = art(['......u', '....uuk', '..uuu..', '..t.t..', '.t...t.']);
const fence = (w: number): Draw => (c, x, y) => {
  const x0 = x - Math.floor(w / 2);
  for (let i = 0; i < w; i++) { c.L.set(x0 + i, y - 4, C.cocoa[2]); c.L.set(x0 + i, y - 2, C.cocoa[2]); c.sh.set(x0 + i + 1, y, INK, 50); }
  for (let i = 0; i < w; i += 4) for (let j = 1; j <= 5; j++) c.L.set(x0 + i, y - j, j === 5 ? C.cocoa[2] : C.cocoa[1]);
};
const bees: Draw = (c, x, y) => { for (const [i, j] of [[0, 0], [4, -2], [7, 1]]) { c.L.set(x + i, y + j, C.butter[1]); c.L.set(x + i + 1, y + j, INK); } };

function windmill(c: Ctx, x: number, y: number): void {
  shadow(c, x + 3, y, 7, 1);
  for (let j = 0; j < 16; j++) {
    const half = 5 - Math.floor(j / 5);
    for (let i = -half; i <= half; i++) c.L.set(x + i, y - 1 - j, i >= half - 1 ? C.cream[0] : C.cream[1]);
  }
  rect(c.L, x - 1, y - 5, 2, 4, () => C.cocoa[1]);
  rect(c.L, x - 1, y - 11, 2, 2, (xx, yy) => { c.nt.set(xx, yy, LIT[0]); return C.sky[1]; });
  for (let j = 0; j < 4; j++) for (let i = -3 + j; i <= 3 - j; i++) c.L.set(x + i, y - 17 - j, i < 0 ? C.rose[2] : C.rose[1]);
  const hx = x, hy = y - 16;
  for (let s = 0; s < 4; s++) {
    const a = Math.PI / 4 + (s * Math.PI) / 2, ca = Math.cos(a), sa = Math.sin(a);
    for (let t = 2; t < 11; t++) for (let k = 0; k <= 2; k++) c.L.set(hx + ca * t - sa * k, hy + sa * t + ca * k, k === 0 || t % 3 === 0 ? C.cocoa[1] : C.cream[1]);
  }
  c.L.set(hx, hy, C.cocoa[0]);
}
function dock(c: Ctx, x: number, y: number): void {
  for (let j = 0; j < 20; j++) for (let i = -3; i < 3; i++) c.L.set(x + i, y - 20 + j, j % 3 === 2 ? C.cocoa[0] : i === -3 ? C.cocoa[2] : C.cocoa[1]);
  for (const i of [-3, 2]) { c.L.set(x + i, y, C.cocoa[0]); c.L.set(x + i, y + 1, C.cocoa[0]); c.sh.set(x + i - 1, y + 2, WATER.foam, 255); c.sh.set(x + i + 1, y + 2, WATER.foam, 255); }
}
function ship(c: Ctx, x: number, y: number): void {
  for (let i = -11; i <= 11; i++) if (hash(i, 5) < 0.7) c.sh.set(x + i, y + 1, WATER.foam, 255);
  rows(c.L, [
    '.........r.........',
    '.........rr........',
    '.........bw........',
    '.........bww.......',
    '.........bwww......',
    '.........bwwww.....',
    '.........bwwwWW....',
    '.........bwwwwWW...',
    '.........b.........',
    'ccccccccccccccccccc',
    '.bbsbbbbbsbbbbbsbb.',
    '..BBBBBBBBBBBBBBB..',
  ], x, y, KEY);
}
function stall(c: Ctx, x: number, y: number): void {
  shadow(c, x + 2, y, 8, 1);
  rows(c.L, ['rwrwrwrwrwrwrwr', 'rwrwrwrwrwrwrwr', '.r.w.r.w.r.w.r.', '.b...........b.', '.byrgepyrgepyb.', 'ccccccccccccccc', 'bbbbbbbbbbbbbbb', '.B...........B.'], x, y, KEY);
}
function palm(c: Ctx, x: number, y: number): void {
  shadow(c, x + 3, y, 5, 1);
  for (let j = 0; j < 13; j++) { const bx = x + Math.round(Math.sin(j / 6) * 2); c.L.set(bx, y - 1 - j, j % 3 ? C.cocoa[2] : C.cocoa[1]); c.L.set(bx + 1, y - 1 - j, C.cocoa[0]); }
  const tx = x + Math.round(Math.sin(13 / 6) * 2), ty = y - 14;
  for (const [dx, dy] of [[-1, 0], [1, 0], [-0.8, 0.5], [0.8, 0.5], [0, -1], [-0.6, -0.6], [0.6, -0.6]]) {
    for (let t = 0; t < 6; t++) c.L.set(tx + dx * t, ty + dy * t + (t * t) / 12, t > 3 ? C.leaf[0] : C.leaf[1]);
  }
}
function pond(c: Ctx, x: number, y: number): void {
  const rx = 8, ry = 4;
  for (let j = -ry; j <= ry; j++) for (let i = -rx; i <= rx; i++) {
    const d = (i / (rx + 0.4)) ** 2 + (j / (ry + 0.4)) ** 2;
    if (d > 1) continue;
    c.L.set(x + i, y - ry + j, d > 0.6 && j < 0 ? WATER.mid : j < -1 && i < 0 ? WATER.light : WATER.shallow);
  }
  for (const [i, j] of [[-3, 0], [3, 1]]) { c.L.set(x + i, y - ry + j, C.leaf[1]); c.L.set(x + i + 1, y - ry + j, C.leaf[0]); }
  c.L.set(x - 5, y - ry - 1, WATER.foam);
}
function dome(c: Ctx, x: number, y: number): void {
  shadow(c, x + 2, y, 7, 1);
  rows(c.L, ['...lLlll...', '..llLllll..', '.lllLlllll.', 'llllLllllll', 'wwwwwwwwwwW', 'wwwwsswwwwW', 'wwwwsswwwwW', 'TTTTTTTTTTT'], x, y, KEY);
  c.nt.set(x, y - 3, LIT[0]); c.nt.set(x - 1, y - 3, LIT[0]);
}
function star(c: Ctx, x: number, y: number): void {
  for (const [i, j] of [[0, 0], [1, 0], [-1, 0], [0, 1], [0, -1]]) { c.L.set(x + i, y + j, i || j ? C.butter[1] : '#ffffff'); c.nt.set(x + i, y + j, LIT[0]); }
}

// ---------- A map ----------

interface Thing {
  draw: Draw;
  at: [number, number];
  bare?: boolean; // no outline
  free?: boolean; // placed as it is, not checked (the dock, the ship)
  water?: boolean; // belongs in the open water
}
const put = (draw: Draw, x: number, y: number, o: Partial<Thing> = {}): Thing => ({ draw, at: [x, y], ...o });

interface Area {
  id: string;
  at: [number, number]; // middle of its patch of ground
  r: number; // roughly how big
  sy?: number; // squash up-down
  ground: Shades;
  kind?: 'grass' | 'wheat' | 'sand';
  flowers?: string[];
  yard?: [number, number, number, number]; // a paved yard: middle x, y, radius x, y
  things: Thing[];
  label: [number, number]; // where the sign goes (bottom middle)
  pin?: [number, number]; // where the pet or a dot goes
  locked?: boolean; // gets a "locked:<id>" layer of clouds
  tap?: 'land' | 'box';
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
  sea: Thing[];
}

const CLIFF = 5;

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
  const cliff = new Int8Array(W * H);
  for (let x = 0; x < W; x++) for (let y = 0; y < H; y++) {
    if (!at(x, y) || at(x, y + 1)) continue;
    for (let k = 1; k <= CLIFF && y + k < H && !at(x, y + k); k++) cliff[(y + k) * W + x] = k;
  }
  const solid = (x: number, y: number) => x >= 0 && y >= 0 && x < W && y < H && (!!own[y * W + x] || cliff[y * W + x] > 0);

  // How far each sea pixel is from land.
  const far = new Float32Array(W * H).fill(99);
  const queue: number[] = [];
  for (let i = 0; i < W * H; i++) if (solid(i % W, Math.floor(i / W))) { far[i] = 0; queue.push(i); }
  for (let q = 0; q < queue.length; q++) {
    const i = queue[q], x = i % W, y = Math.floor(i / W);
    for (const [dx, dy, s] of [[1, 0, 1], [-1, 0, 1], [0, 1, 1], [0, -1, 1], [1, 1, 1.41], [-1, 1, 1.41], [1, -1, 1.41], [-1, -1, 1.41]]) {
      const nx = x + dx, ny = y + dy;
      if (nx < 0 || ny < 0 || nx >= W || ny >= H) continue;
      const j = ny * W + nx;
      if (far[j] > far[i] + s && far[i] + s < 30) { far[j] = far[i] + s; queue.push(j); }
    }
  }

  const ground = new Layer(W, H);
  // The sea in clean bands: foam, a light rim, shallows, then open water.
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
    if (solid(x, y)) continue;
    const d0 = far[y * W + x], d = d0 + noise(x, y, 5, 9) * 0.8;
    let col: string;
    if (d0 < 1.5) col = WATER.foam;
    else if (d < 3) col = WATER.light;
    else if (d > 4.3 && d < 5 && Math.floor((x + y) / 3) % 3 === 0) col = WATER.light; // a broken second wave
    else if (d < 7) col = WATER.shallow;
    else col = d > 14 + noise(x, y, 16, 3) * 4 ? WATER.deep : WATER.mid;
    ground.set(x, y, col);
  }
  for (let i = 0; i < 70; i++) {
    const x = Math.floor(hash(i, 1) * W), y = Math.floor(hash(i, 2) * H), len = 2 + Math.floor(hash(i, 3) * 3);
    let open = true;
    for (let k = -1; k <= len; k++) if (far[y * W + clamp(x + k, 0, W - 1)] < 9) open = false;
    if (open) for (let k = 0; k < len; k++) ground.set(x + k, y, WATER.light);
  }
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
    const k = cliff[y * W + x];
    if (k) ground.set(x, y, k === 1 ? C.cocoa[0] : k === 2 ? C.cocoa[2] : k === CLIFF ? C.cocoa[0] : (x + k * 2) % 7 === 0 ? C.cocoa[0] : C.cocoa[1]);
  }

  // Ground: flat colour, a few lighter patches, little tufts.
  const paved = new Uint8Array(W * H);
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
    const id = at(x, y);
    if (!id) continue;
    const a = byId[id], s = a.ground, n = noise(x, y, 9, 1);
    ground.set(x, y, a.kind === 'wheat' && y % 3 === 0 ? s[0] : n > 0.45 ? s[2] : s[1]);
    if (a.yard) {
      const [cx, cy, rx, ry] = a.yard;
      if (((x - cx) / rx) ** 2 + ((y - cy) / ry) ** 2 < 1) {
        paved[y * W + x] = 1;
        ground.set(x, y, y % 2 === 1 || (x + (y >> 1) * 2) % 4 === 3 ? C.sand[0] : C.sand[1]);
      }
    }
  }
  for (let y = 2; y < H; y++) for (let x = 1; x < W - 1; x++) {
    const id = at(x, y);
    if (!id || paved[y * W + x] || byId[id].kind === 'wheat') continue;
    const s = byId[id].ground;
    if (hash(x, y, 7) < 0.018 && at(x - 1, y) === id && at(x + 1, y) === id) { ground.set(x - 1, y, s[0]); ground.set(x + 1, y, s[0]); ground.set(x, y - 1, s[0]); }
  }
  for (const a of def.areas) if (a.flowers) for (let i = 0; i < 40; i++) {
    const fx = Math.round(a.at[0] + (hash(i, 31, a.r) - 0.5) * a.r * 1.8), fy = Math.round(a.at[1] + (hash(i, 32, a.r) - 0.5) * a.r * 1.5);
    if (at(fx, fy) !== a.id || at(fx, fy + 1) !== a.id || at(fx, fy - 2) !== a.id) continue;
    ground.set(fx, fy, a.flowers[i % a.flowers.length]);
    ground.set(fx, fy + 1, C.leaf[0]);
  }

  // Paths, 3 pixels wide, along smooth curves.
  const path = new Uint8Array(W * H);
  for (const pts of def.paths) {
    for (let i = 0; i < pts.length - 1; i++) {
      const p0 = pts[Math.max(0, i - 1)], p1 = pts[i], p2 = pts[i + 1], p3 = pts[Math.min(pts.length - 1, i + 2)];
      const n = Math.ceil(Math.hypot(p2[0] - p1[0], p2[1] - p1[1]) * 3);
      for (let j = 0; j <= n; j++) {
        const t = j / n, t2 = t * t, t3 = t2 * t;
        const cr = (a: number, b: number, c: number, d: number) => 0.5 * (2 * b + (-a + c) * t + (2 * a - 5 * b + 4 * c - d) * t2 + (-a + 3 * b - 3 * c + d) * t3);
        const px = cr(p0[0], p1[0], p2[0], p3[0]), py = cr(p0[1], p1[1], p2[1], p3[1]);
        for (let dy = -2; dy <= 2; dy++) for (let dx = -2; dx <= 2; dx++) {
          const x = Math.round(px + dx), y = Math.round(py + dy);
          if (at(x, y) && !paved[y * W + x] && Math.hypot(x - px, y - py) < 2.1) path[y * W + x] = 1;
        }
      }
    }
  }
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
    if (!path[y * W + x]) continue;
    const edge = !path[(y + 1) * W + x] || !path[(y - 1) * W + x] || !path[y * W + x + 1] || !path[y * W + x - 1];
    ground.set(x, y, edge ? PATH[0] : hash(x, y, 3) < 0.1 ? PATH[2] : PATH[1]);
  }

  // Hedges between areas; open where a path goes through.
  const hedge = new Uint8Array(W * H);
  const nearPath = (x: number, y: number) => { for (let dy = -3; dy <= 3; dy++) for (let dx = -3; dx <= 3; dx++) if (path[(y + dy) * W + x + dx]) return true; return false; };
  for (let y = 1; y < H - 1; y++) for (let x = 1; x < W - 1; x++) {
    const id = at(x, y);
    if (!id || nearPath(x, y)) continue;
    for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) { const o = at(x + dx, y + dy); if (o && o !== id) hedge[y * W + x] = 1; }
  }
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
    if (!hedge[y * W + x]) continue;
    ground.set(x, y, !hedge[(y - 1) * W + x] ? C.leaf[2] : C.leaf[0]);
    if (!hedge[(y + 1) * W + x] && at(x, y + 1)) ground.mix(x, y + 1, INK, 0.2);
  }
  // The coast: the land's light edge over a cliff, a dark line elsewhere.
  const coast = new Uint8Array(W * H);
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
    const id = at(x, y);
    if (!id) continue;
    if (y + 1 < H && cliff[(y + 1) * W + x] === 1) { ground.set(x, y, byId[id].ground[2]); coast[y * W + x] = 1; continue; }
    if (!solid(x, y - 1) || !solid(x - 1, y) || !solid(x + 1, y)) { ground.set(x, y, byId[id].ground[0]); coast[y * W + x] = 1; }
  }
  for (const r of def.routes ?? []) {
    let n = 0;
    for (let i = 0; i < r.length - 1; i++) {
      const [x0, y0] = r[i], [x1, y1] = r[i + 1];
      const steps = Math.max(Math.abs(x1 - x0), Math.abs(y1 - y0));
      for (let j = 0; j <= steps; j++) {
        const x = Math.round(x0 + ((x1 - x0) * j) / steps), y = Math.round(y0 + ((y1 - y0) * j) / steps);
        if (solid(x, y) || far[y * W + x] < 3) continue;
        if (n++ % 5 < 2) ground.set(x, y, WATER.foam);
      }
    }
  }

  // Things: each placed where all of it, outline too, fits.
  const taken = new Uint8Array(W * H);
  const fits = (L: Layer, area: string | null, water: boolean): boolean => {
    for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
      if (!L.has(x, y)) continue;
      const i = y * W + x;
      if (taken[i]) return false;
      if (water) { if (solid(x, y) || far[i] < 2) return false; continue; }
      if (at(x, y) !== area || hedge[i] || coast[i] || path[i]) return false;
    }
    return true;
  };
  const spiral: [number, number][] = [];
  for (let dy = -14; dy <= 14; dy++) for (let dx = -14; dx <= 14; dx++) spiral.push([dx, dy]);
  spiral.sort((a, b) => Math.hypot(...a) - Math.hypot(...b));
  const placed: { L: Layer; y: number }[] = [];
  const night = new Layer(W, H);
  const shadows = new Layer(W, H);
  const moved: string[] = [];
  const missing: string[] = [];
  const place = (t: Thing, area: string | null) => {
    for (const [dx, dy] of t.free ? [[0, 0] as [number, number]] : spiral) {
      const L = new Layer(W, H), sh = new Layer(W, H), nt = new Layer(W, H);
      t.draw({ L, sh, nt }, t.at[0] + dx, t.at[1] + dy);
      if (!t.bare) L.outline();
      if (!t.free && !fits(L, area, !!t.water)) continue;
      if (dx || dy) moved.push(`  ${def.name}/${area ?? 'sea'}: the thing at ${t.at} moved by ${dx}, ${dy}`);
      for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) if (L.has(x, y)) {
        for (let k = -1; k <= 1; k++) for (let m = -1; m <= 1; m++) if (x + m >= 0 && y + k >= 0 && x + m < W && y + k < H) taken[(y + k) * W + x + m] = 1;
      }
      shadows.over(sh); night.over(nt);
      placed.push({ L, y: t.at[1] + dy });
      return;
    }
    missing.push(`  ${def.name}/${area ?? 'sea'}: no room for the thing at ${t.at}`);
  };
  for (const t of def.sea.filter((t) => t.free)) place(t, null);
  for (const a of def.areas) for (const t of a.things) place(t, a.id);
  for (const t of def.sea.filter((t) => !t.free)) place(t, null);
  if (moved.length) console.log(`Moved to fit:\n${moved.join('\n')}`);
  if (missing.length) { console.log(`Left out, nowhere fits:\n${missing.join('\n')}`); process.exitCode = 1; }
  for (let i = 0; i < shadows.data.length; i += 4) {
    if (!shadows.data[i + 3]) continue;
    const x = (i / 4) % W, y = Math.floor(i / 4 / W);
    const c = '#' + [0, 1, 2].map((k) => shadows.data[i + k].toString(16).padStart(2, '0')).join('');
    ground.mix(x, y, c, shadows.data[i + 3] / 255);
  }
  const details = new Layer(W, H);
  for (const p of placed.sort((a, b) => a.y - b.y)) details.over(p.L);
  const glow = new Layer(W, H);
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
    if (night.has(x, y)) continue;
    for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1], [1, 1], [-1, -1], [1, -1], [-1, 1]]) if (night.has(x + dx, y + dy)) { glow.set(x, y, LIT[1], 110); break; }
  }
  night.over(glow);

  // Clouds over locked areas: round puffs, white on top, lavender below.
  const locked: Record<string, Layer> = {};
  for (const a of def.areas.filter((a) => a.locked)) {
    const l = new Layer(W, H);
    const puffs: [number, number, number][] = [];
    for (let y = 0; y < H; y += 5) for (let x = (y / 5) % 2 ? 3 : 0; x < W; x += 6) {
      if (at(x, y) !== a.id || hash(x, y, 9) < 0.4) continue; // gaps, to peek through
      puffs.push([x + (hash(x, y) - 0.5) * 3, y + (hash(y, x) - 0.5) * 2, 4 + hash(x, y, 2) * 3]);
    }
    for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
      if (at(x, y) !== a.id && cliff[y * W + x] === 0) continue;
      if (cliff[y * W + x] && at(x, y - cliff[y * W + x]) !== a.id) continue;
      let best = -1;
      for (const [px, py, pr] of puffs) {
        const dy = (y - py) / pr, d = ((x - px) / pr) ** 2 + dy * dy;
        if (d <= 1) best = Math.max(best, dy < -0.35 ? 2 : dy < 0.3 ? 1 : 0);
      }
      if (best >= 0) l.set(x, y, best === 2 ? '#ffffff' : best === 1 ? C.lavender[2] : C.lavender[1], 245);
    }
    const edge: number[] = [];
    for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) if (!l.has(x, y) && (l.has(x + 1, y) || l.has(x - 1, y) || l.has(x, y + 1) || l.has(x, y - 1)) && (at(x, y) === a.id)) edge.push(x, y);
    for (let i = 0; i < edge.length; i += 2) l.set(edge[i], edge[i + 1], C.lilac[1], 230);
    locked[a.id] = l;
  }

  // Tap shapes: the area's land and cliff, plus a few pixels of water round
  // a small island (so the ring follows its coast); for the ship, the
  // ship and dock with a margin.
  const colours = ['#f48fb1', '#ffe596', '#9ad3f0', '#a68bc9', '#a8e6cf', '#ffc59e', '#e05a7a', '#6cc19a'];
  const tap: Record<string, Layer> = {};
  const landOf = (x: number, y: number) => { if (!solid(x, y)) return null; const k = cliff[y * W + x]; return k ? at(x, y - k) : at(x, y); };
  def.areas.forEach((a, i) => {
    const l = new Layer(W, H);
    for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
      let on = false;
      if (a.tap === 'box') {
        const [bx, by, bw, bh] = a.tapBox!;
        if (x >= bx && y >= by && x < bx + bw && y < by + bh && !solid(x, y)) for (let dy = -2; dy <= 2 && !on; dy++) for (let dx = -2; dx <= 2; dx++) if (details.has(x + dx, y + dy) && !solid(x + dx, y + dy)) { on = true; break; }
      } else if (landOf(x, y) === a.id) on = true;
      else if (!solid(x, y) && !def.island) {
        for (let dy = -3; dy <= 3 && !on; dy++) for (let dx = -3; dx <= 3; dx++) if (dx * dx + dy * dy <= 9 && landOf(x + dx, y + dy) === a.id) { on = true; break; }
      }
      if (on) l.set(x, y, colours[i % colours.length]);
    }
    tap[a.id] = l;
  });
  const slices: AseSlice[] = def.areas.flatMap((a) => [
    { name: `label:${a.id}`, x: a.label[0] - 8, y: a.label[1] - 4, width: 16, height: 4 },
    ...(a.pin ? [{ name: `pin:${a.id}`, x: a.pin[0] - 3, y: a.pin[1] - 3, width: 6, height: 6 }] : []),
  ]);
  return { ground, details, night, locked, tap, slices };
}

// ---------- The two maps ----------

const T = {
  tree: (r?: number, s?: Shades, seed?: number): Draw => (c, x, y) => tree(c, x, y, r, s, seed),
  bush: (r?: number, s?: Shades, seed?: number, berry?: string): Draw => (c, x, y) => bush(c, x, y, r, s, seed, berry),
  pine: (h?: number): Draw => (c, x, y) => pine(c, x, y, h),
  house: (roof: Shades, o?: Parameters<typeof house>[4]): Draw => (c, x, y) => house(c, x, y, roof, o),
};
const FLOWERS = [C.rose[1], C.butter[1], '#ffffff', C.lilac[1], C.pink[1]];

// The home island: the places you walk to. The ship sails to the journeys.
const ISLAND: MapDef = {
  name: 'island',
  width: 180,
  height: 270,
  island: { cx: 90, cy: 128, r: 86, sy: 0.74 },
  paths: [
    [[101, 152], [116, 132], [132, 116]], // backyard
    [[79, 152], [64, 132], [46, 116]], // meadow
    [[98, 156], [106, 186], [124, 214]], // friends
    [[82, 156], [68, 176], [54, 202]], // the fields
    [[90, 157], [91, 200], [90, 232]], // the dock
  ],
  areas: [
    {
      id: 'home', at: [90, 138], r: 30, ground: C.mint, label: [90, 180], pin: [72, 160], yard: [90, 152, 12, 4],
      things: [
        put(T.house(C.rose, { w: 24 }), 90, 147), put(T.tree(6, C.leaf, 4), 66, 142),
        put(well, 110, 168), put(mailbox, 76, 166), put(lamp, 104, 158), put(T.bush(3, C.leaf, 5, C.rose[1]), 114, 146),
      ],
    },
    {
      id: 'backyard', at: [136, 90], r: 34, ground: C.leaf, label: [138, 58], pin: [146, 108],
      things: [
        put(fence(28), 134, 74), put(skep, 120, 94), put(skep, 129, 96), put(bees, 122, 84, { bare: true }), put(birdhouse, 150, 96),
        put(bed, 122, 122), put(bed, 154, 124), put(T.tree(6, C.leaf, 6), 160, 88), put(T.tree(5, C.leaf, 18), 114, 80),
        put(T.bush(3, C.leaf, 19, C.lilac[1]), 166, 110),
      ],
    },
    {
      id: 'meadow', at: [44, 96], r: 34, ground: C.meadow, flowers: FLOWERS, label: [44, 60], pin: [40, 122],
      things: [
        put(pond, 34, 112), put(T.tree(7, C.leaf, 8), 28, 90), put(T.tree(5, C.leaf, 20), 60, 82),
        put(bench, 54, 98), put(T.bush(3, C.leaf, 9), 62, 118), put(rock, 24, 128),
      ],
    },
    {
      id: 'friends', at: [134, 192], r: 32, ground: C.blush, label: [134, 238], pin: [118, 222], yard: [130, 213, 9, 3],
      things: [
        put(T.house(C.sky, { w: 22, flowers: C.butter[1] }), 130, 207), put(T.tree(6, C.pink, 10), 160, 200), put(T.tree(5, C.pink, 22), 122, 178),
        put(bench, 112, 228), put(mailbox, 144, 214), put(lamp, 116, 210), put(T.bush(3, C.pink, 11), 150, 226),
      ],
    },
    {
      id: 'fields', at: [46, 192], r: 32, ground: C.butter, kind: 'wheat', label: [46, 238], locked: true,
      things: [put(windmill, 44, 210), put(hay, 30, 192), put(hay, 60, 222), put(hay, 34, 226)],
    },
    {
      id: 'ship', at: [90, 250], r: 1, ground: C.sand, label: [150, 266], pin: [112, 254], tap: 'box', tapBox: [80, 222, 48, 46],
      things: [],
    },
  ],
  sea: [
    put(dock, 90, 251, { free: true }), put(ship, 114, 264, { free: true }),
    put(rock, 24, 240, { water: true }), put(rock, 166, 246, { water: true }), put(rock, 174, 64, { water: true }),
  ],
};

// The sea behind the ship: each journey place is its own island.
const SEA: MapDef = {
  name: 'sea',
  width: 180,
  height: 270,
  paths: [],
  routes: [[[96, 236], [56, 172]], [[96, 236], [136, 198]], [[96, 236], [122, 112]], [[96, 236], [66, 92]]],
  areas: [
    {
      id: 'woods', at: [44, 140], r: 30, sy: 1.05, ground: C.leaf, label: [44, 106], pin: [56, 170], locked: true,
      things: [
        put(T.house(C.peach, { w: 16 }), 42, 164), put(mushroom, 58, 164), put(mushroom, 28, 160),
        put(T.pine(15), 30, 132), put(T.pine(13), 44, 128), put(T.pine(14), 58, 136), put(T.pine(12), 24, 150), put(T.pine(15), 62, 154),
      ],
    },
    {
      id: 'market', at: [130, 76], r: 30, ground: C.sand, kind: 'sand', label: [130, 42], pin: [116, 108], locked: true, yard: [130, 100, 18, 6],
      things: [
        put(T.house(C.lilac, { w: 18 }), 116, 84), put(T.house(C.rose, { w: 18, chimney: false }), 144, 86),
        put(stall, 130, 106), put(lamp, 110, 100), put(lamp, 150, 102), put(T.tree(4, C.leaf, 24), 120, 64),
      ],
    },
    {
      id: 'cove', at: [140, 172], r: 28, ground: C.sand, kind: 'sand', label: [140, 142], pin: [136, 196], locked: true,
      things: [put(palm, 132, 178), put(palm, 150, 168), put(rock, 152, 186), put(rock, 122, 170), put(shell, 128, 190), put(shell, 144, 194)],
    },
    {
      id: 'hill', at: [58, 58], r: 26, ground: C.lavender, label: [58, 28], pin: [70, 84], locked: true,
      things: [put(dome, 54, 68), put(telescope, 70, 68), put(rock, 42, 74), put(star, 44, 46, { bare: true }), put(star, 70, 44, { bare: true })],
    },
    {
      id: 'home', at: [90, 304], r: 66, ground: C.leaf, label: [90, 262], pin: [96, 236],
      things: [put(T.tree(6, C.leaf, 13), 56, 266), put(T.tree(6, C.leaf, 14), 130, 266), put(T.bush(3, C.leaf, 15), 72, 262)],
    },
  ],
  sea: [
    put(dock, 90, 251, { free: true }), put(ship, 112, 242, { free: true }),
    put(coral, 168, 206, { water: true }), put(coral, 108, 210, { water: true }), put(coral, 168, 150, { water: true }),
    put(rock, 96, 162, { water: true }), put(rock, 18, 212, { water: true }),
  ],
};

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

// The file's palette: every colour above, to pick from in Aseprite.
const palette = [
  { name: 'ink', hex: INK },
  ...Object.entries(C).flatMap(([name, s]) => s.map((hex, i) => ({ name: `${name} ${['dark', 'base', 'light'][i]}`, hex }))),
  ...Object.entries(WATER).map(([name, hex]) => ({ name: `water ${name}`, hex })),
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
