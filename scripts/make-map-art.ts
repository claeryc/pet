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

import { existsSync, mkdirSync, writeFileSync } from 'node:fs';
import { dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { PALETTE, type ColourName } from '../src/render/palette.ts';
import { writeAseprite, type AseLayer, type AseSlice } from './aseprite.ts';
import { mapData } from './map-data.ts';
import { writePng } from './png.ts';

type Key = ColourName;

// ---------- A layer to paint on ----------

class Layer {
  data: Uint8Array;
  width: number;
  height: number;
  constructor(width: number, height: number) { this.width = width; this.height = height; this.data = new Uint8Array(width * height * 4); }
  set(x: number, y: number, colour: Key | null, alpha = 255): void {
    if (x < 0 || y < 0 || x >= this.width || y >= this.height) return;
    const i = (y * this.width + x) * 4;
    if (colour === null) { this.data.fill(0, i, i + 4); return; }
    const n = parseInt(PALETTE[colour].slice(1), 16);
    this.data[i] = n >> 16; this.data[i + 1] = (n >> 8) & 255; this.data[i + 2] = n & 255; this.data[i + 3] = alpha;
  }
  has(x: number, y: number): boolean { return x >= 0 && y >= 0 && x < this.width && y < this.height && this.data[(y * this.width + x) * 4 + 3] > 0; }
  // Paints a sprite (rows of letters, '.' see-through) with its bottom
  // middle at (x, y), each sprite pixel `k` x `k` map pixels.
  sprite(rows: string[], x: number, y: number, k = 2, map: Partial<Record<string, Key | null>> = {}): void {
    const w = rows[0].length, h = rows.length;
    const ox = Math.round(x - (w * k) / 2), oy = y - h * k;
    rows.forEach((row, j) => [...row].forEach((ch, i) => {
      if (ch === '.') return;
      const c = ch in map ? map[ch]! : KEY[ch];
      if (c === undefined) throw new Error(`no colour for "${ch}"`);
      for (let a = 0; a < k; a++) for (let b = 0; b < k; b++) this.set(ox + i * k + a, oy + j * k + b, c);
    }));
  }
}

// One letter per palette colour, for the sprites below.
const KEY: Record<string, Key> = {
  k: 'ink', u: 'plum', l: 'lilac', v: 'lavender', t: 'cream', w: 'white', h: 'blush', p: 'pink', e: 'peach', y: 'butter',
  n: 'mint', g: 'leaf', s: 'sky', z: 'sky', o: 'ocean', c: 'cocoa', r: 'rose', m: 'moss', d: 'deep', x: 'berry', b: 'bark',
};

// A number from 0 to 1 that's always the same for the same inputs.
function hash(a: number, b: number): number {
  let x = Math.imul(a | 0, 374761393) ^ Math.imul(b | 0, 668265263) ^ 0x5bd1e995;
  x = Math.imul(x ^ (x >>> 13), 1274126177);
  return ((x ^ (x >>> 16)) >>> 0) / 0x100000000;
}

// ---------- Sprites ----------

const centre = (rows: string[]) => { const w = Math.max(...rows.map((r) => r.length)); return rows.map((r) => { const l = Math.floor((w - r.length) / 2); return '.'.repeat(l) + r + '.'.repeat(w - r.length - l); }); };

function blob(w: number, h: number, fill: string, out: string, hi: string): string[] {
  const rows: string[] = [];
  for (let j = 0; j < h; j++) {
    let r = '';
    for (let i = 0; i < w; i++) {
      const dx = (i + 0.5 - w / 2) / (w / 2), dy = (j + 0.5 - h / 2) / (h / 2);
      const inner = ((i + 0.5 - w / 2) / (w / 2 - 1)) ** 2 + ((j + 0.5 - h / 2) / (h / 2 - 1)) ** 2;
      const d = dx * dx + dy * dy;
      r += d > 1 ? '.' : inner > 1 ? out : dx < -0.1 && dy < -0.15 && d > 0.12 && d < 0.5 ? hi : fill;
    }
    rows.push(r);
  }
  return rows;
}

// A house: a tiled roof, two windows ('s', lit at night) and a door.
function house(roof: string, roofHi: string, roofOut: string, wall: string, width = 19): string[] {
  const rows: string[] = [];
  const steps = Math.ceil((width + 2 - 5) / 4);
  for (let i = 0; i <= steps; i++) {
    const w = Math.min(5 + 4 * i, width + 2);
    let fill = '';
    for (let k = 0; k < w - 2; k++) fill += (k + i) % 4 === 0 ? roofHi : roof;
    rows.push(roofOut + fill + roofOut);
  }
  rows.push(roofOut.repeat(width + 2));
  const side = (width - 2 - 4 - 4 - 5) / 2; // wall either side of window-door-window
  const pad = (n: number) => wall.repeat(Math.max(1, Math.floor(n)));
  const mid = (a: string, b: string, c: string) => 'b' + pad(side / 2) + a + pad(side / 2) + b + pad(side / 2) + c + pad(side / 2) + 'b';
  rows.push('b' + wall.repeat(width - 2) + 'b');
  rows.push(mid('bbbb', 'bbbbb', 'bbbb'));
  rows.push(mid('bzwb', 'bcccb', 'bzwb'));
  rows.push(mid('bzzb', 'bcycb', 'bzzb'));
  rows.push(mid('bbbb', 'bcccb', 'bbbb'));
  rows.push('b' + pad(side + 3) + 'bcccb' + pad(side + 3) + 'b');
  rows.push('b'.repeat(width));
  return centre(rows);
}

const S = {
  cottage: house('r', 'p', 'x', 't'),
  houseBlue: house('o', 's', 'd', 't'),
  houseLilac: house('l', 'v', 'u', 'y'),
  housePink: house('p', 'h', 'x', 't'),
  tree: [...blob(11, 9, 'g', 'm', 'n'), ...centre(['bcb', 'bcb'])],
  bush: blob(7, 5, 'g', 'm', 'n'),
  pine: centre(['m', 'mgm', 'mgnm', 'mggnm', 'mgggnm', 'mggggnm', 'mgggggnm', 'mggggggnm', 'mgggggggnm', 'mmmmmmmmmm', 'bb', 'bb'].map((r) => (r.length % 2 ? r : r + 'm'))),
  hive: centre(['bbb', 'byyyb', 'beeeeeb', 'byyyyyyyb', 'beeeeeeeb', 'byyykyyyb', 'beekkkeeb', 'byykkkyyb', 'bbbbbbbbb', 'c.....c', 'c.....c']),
  perch: centre(['xxx', 'xrrrx', 'xrrrrrx', 'xxxxxxxxx', 'bssssssb', 'bsszzssb', 'bsszzssb', 'bbbbbbbb', 'cc', 'cc', 'cc', 'cc', 'cccccc']),
  bed: ['bbbbbbbbbbbbb', 'bccgccgccgccb', 'bcgnmcgnmcgnb', 'bccmccmccmccb', 'bbbbbbbbbbbbb'],
  fence: ['t.t.t.t.t.t.t.t.t', 'ttttttttttttttttt', 't.t.t.t.t.t.t.t.t', 'ttttttttttttttttt', 't.t.t.t.t.t.t.t.t'],
  well: centre(['bbbbbbb', 'b.....b', 'bcccccb', 'buuuuub', 'bsssssb', 'bbbbbbb']),
  bench: ['bbbbbbbbb', 'bcccccccb', 'bbbbbbbbb', '.b.....b.'],
  mailbox: ['bbbb', 'brrb', 'bbbb', '.c..', '.c..'],
  windmill: centre(['b.........b', '.b.......b.', '..bt...tb..', '...bt.tb...', '....beb....', '...tbbbt...', '..tb.b.bt..', '.tb..t..bt.', 'tb..btb..bt', '...bttttb..', '...bztttb..', '..bttccttb.', '..bttccttb.', '.bbbbbbbbbb']),
  ship: centre(['r', 'rr', 'b', 'bww', 'bwww', 'bwwww', 'bwwwww', 'bwwwwww', 'b', 'bbbbbbbbbbbbbbb', 'bcccccccccccccb', '.bcwcccwcccwcb.', '..bbbbbbbbbbb..']),
  dockV: ['bccb', 'beeb', 'bccb', 'beeb', 'bccb', 'beeb', 'bccb', 'beeb', 'bccb', 'b..b', 'b..b'],
  stall: centre(['xxxxxxxxxxxxxxx', 'xpwpwpwpwpwpwpx', 'xpwpwpwpwpwpwpx', 'xxxxxxxxxxxxxxx', 'b.............b', 'b.............b', 'bbbbbbbbbbbbbbb', 'byyrygyeyyrygyb', 'bcccccccccccccb', 'bc...........cb']),
  lamp: ['bbb', 'bzb', 'bbb', '.b.', '.b.', '.b.', 'bbb'],
  rock: blob(7, 5, 'l', 'u', 'v'),
  coral: ['r.r.', 'rprr', '.rp.', '.rr.'],
  shell: ['.p.', 'php', 'ppp'],
  palm: centre(['.gg...gg.', 'gnngggnng', '.gggggggg', 'gg..b..gg', '....b....', '....c....', '....c....', '....c....', '....c....']),
  heart: ['rr.rr', 'rrrrr', '.rrr.', '..r..'],
  tele: ['......bb', '....bbsb', '..bbbbb.', '...b.b..', '..b...b.'],
  dome: centre(['uuuuu', 'ullllu', 'ulllllu', 'ullslllu', 'uuuuuuuu', 'bttttttb', 'btzbtztb', 'bbbbbbbb']),
  mushroom: ['.rr.', 'rwrr', '.t..'],
  flowerP: ['.p.', 'pyp', '.p.', '.g.'],
  flowerY: ['.y.', 'ywy', '.y.', '.g.'],
  flowerW: ['.w.', 'wyw', '.w.', '.g.'],
  star: ['..y..', '.yyy.', 'yyyyy', '.yyy.', '..y..'],
  starS: ['.y.', 'yyy', '.y.'],
};

function hill(w: number, h: number): string[] {
  const rows: string[] = [];
  for (let j = 0; j < h; j++) {
    let r = '';
    for (let i = 0; i < w; i++) {
      const dx = (i - (w - 1) / 2) / (w / 2), dy = (h - j) / h;
      const inside = dx * dx + dy * dy < 1;
      const edge = inside && !((dx * 1.08) ** 2 + (dy * 1.12) ** 2 < 1);
      r += !inside ? '.' : edge ? 'u' : hash(i, j) < 0.1 ? 'v' : 'l';
    }
    rows.push(r);
  }
  return rows;
}

// ---------- A map ----------

interface Area {
  id: string;
  at: [number, number]; // middle of its patch of ground
  r: number; // roughly how big
  sy?: number; // squash up-down
  ground: Key;
  tuft?: Key; // small bits scattered on the ground
  furrows?: Key; // field rows
  sprites: [keyof typeof S | string[], number, number, number?][]; // sprite, x, y (bottom middle), scale
  label: [number, number]; // where the sign goes (bottom middle)
  pin?: [number, number]; // where the pet or a dot goes
  locked?: boolean; // gets a "locked:<id>" layer of clouds
  pathColour?: Key;
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
  sea: [keyof typeof S | string[], number, number, number?][]; // things in the water
}

function build(def: MapDef) {
  const { width: W, height: H } = def;
  // Which area each pixel belongs to (null: sea).
  const own: (string | null)[] = new Array(W * H).fill(null);
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
    let best: Area | null = null, bd = Infinity;
    def.areas.forEach((a, i) => {
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

  const ground = new Layer(W, H);
  // The sea: shallows by the coast, foam, and a few wave dashes.
  const near = (x: number, y: number, r: number) => { for (let dy = -r; dy <= r; dy++) for (let dx = -r; dx <= r; dx++) if (dx * dx + dy * dy <= r * r && at(x + dx, y + dy)) return true; return false; };
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
    if (at(x, y)) continue;
    if (near(x, y, 2)) ground.set(x, y, 'white');
    else if (near(x, y, 6)) ground.set(x, y, 'sky');
    else ground.set(x, y, 'ocean');
  }
  for (let i = 0; i < 70; i++) {
    const x = Math.floor(hash(i, 1) * W), y = Math.floor(hash(i, 2) * H);
    if (near(x, y, 9)) continue;
    for (let k = 0; k < 5; k++) ground.set(x + k, y, 'sky');
  }
  // Ground, with tufts or field rows.
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
    const id = at(x, y);
    if (!id) continue;
    const a = byId[id];
    ground.set(x, y, a.furrows && Math.floor(y / 2) % 3 === 0 ? a.furrows : a.ground);
  }
  for (let y = 2; y < H; y += 3) for (let x = 1; x < W; x += 3) {
    const id = at(x, y);
    if (!id || !byId[id].tuft || hash(x * 7, y * 11) > 0.06) continue;
    const t = byId[id].tuft!;
    ground.set(x, y, t); ground.set(x + 2, y, t); ground.set(x + 1, y + 1, t);
  }
  // Paths, 3 wide, wiggling a little.
  const pathCells = new Set<number>();
  for (const pts of def.paths) {
    for (let i = 0; i < pts.length - 1; i++) {
      const [x0, y0] = pts[i], [x1, y1] = pts[i + 1];
      const n = Math.max(Math.abs(x1 - x0), Math.abs(y1 - y0)) * 2 + 1;
      for (let j = 0; j <= n; j++) {
        const t = j / n;
        const wig = Math.sin(t * Math.PI * 2) * 2.5 * Math.sin(t * Math.PI);
        const len = Math.hypot(x1 - x0, y1 - y0) || 1;
        const x = Math.round(x0 + (x1 - x0) * t + (-(y1 - y0) / len) * wig);
        const y = Math.round(y0 + (y1 - y0) * t + ((x1 - x0) / len) * wig);
        for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) if (at(x + dx, y + dy)) pathCells.add((y + dy) * W + x + dx);
      }
    }
  }
  for (const i of pathCells) {
    const x = i % W, y = Math.floor(i / W);
    const a = byId[at(x, y)!];
    ground.set(x, y, a.pathColour ?? (hash(x >> 1, y >> 1) < 0.15 ? 'cream' : 'peach'));
    if (!pathCells.has(i + W) && at(x, y + 1) && !a.pathColour) ground.set(x, y + 1, 'cocoa');
  }
  // Borders between areas (2 wide, open where a path goes through) and the coast.
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
    const id = at(x, y);
    if (!id) continue;
    let coast = false, border = false;
    for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
      const o = at(x + dx, y + dy);
      if (!o) coast = true; else if (o !== id) border = true;
    }
    if (coast) ground.set(x, y, 'ink');
    else if (border && !pathCells.has(y * W + x)) ground.set(x, y, 'bark');
  }
  // A cliff under the coast, so the island has a bit of depth.
  for (let y = 1; y < H; y++) for (let x = 0; x < W; x++) {
    if (!at(x, y) && at(x, y - 1)) { ground.set(x, y, 'cocoa'); if (!at(x, y + 1)) ground.set(x, y + 1, 'bark'); }
  }
  // Dotted routes over the sea.
  for (const r of def.routes ?? []) {
    let n = 0;
    for (let i = 0; i < r.length - 1; i++) {
      const [x0, y0] = r[i], [x1, y1] = r[i + 1];
      const steps = Math.max(Math.abs(x1 - x0), Math.abs(y1 - y0));
      for (let j = 0; j <= steps; j++) {
        const x = Math.round(x0 + ((x1 - x0) * j) / steps), y = Math.round(y0 + ((y1 - y0) * j) / steps);
        if (!at(x, y) && n++ % 8 < 3) { ground.set(x, y, 'white'); ground.set(x + 1, y, 'white'); }
      }
    }
  }

  // Things on the ground, nearest (lowest) last.
  const details = new Layer(W, H);
  const night = new Layer(W, H);
  const all = [...def.areas.flatMap((a) => a.sprites), ...def.sea].sort((p, q) => p[2] - q[2]);
  for (const [s, x, y, k] of all) {
    const rows = typeof s === 'string' ? S[s] : s;
    details.sprite(rows, x, y, k ?? 2);
    // At night, windows ('z') light up.
    const lit = rows.map((r) => r.replace(/[^z]/g, '.').replace(/z/g, 'y'));
    if (rows.some((r) => r.includes('z'))) night.sprite(lit, x, y, k ?? 2);
  }
  // A soft glow around each lit window.
  const glow = new Layer(W, H);
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
    if (night.has(x, y)) continue;
    for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1], [2, 0], [-2, 0], [0, 2], [0, -2]]) if (night.has(x + dx, y + dy)) { glow.set(x, y, 'butter', 70); break; }
  }
  for (let i = 0; i < glow.data.length; i += 4) if (glow.data[i + 3] && !night.data[i + 3]) night.data.set(glow.data.subarray(i, i + 4), i);

  // Clouds over locked areas.
  const locked: Record<string, Layer> = {};
  for (const a of def.areas.filter((a) => a.locked)) {
    const l = new Layer(W, H);
    for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
      if (at(x, y) !== a.id) continue;
      let inner = true;
      for (const [dx, dy] of [[3, 0], [-3, 0], [0, 3], [0, -3]]) if (at(x + dx, y + dy) !== a.id) inner = false;
      if (!inner) continue;
      const puff = hash(x >> 3, y >> 3) < 0.35 || hash((x + 4) >> 3, (y + 4) >> 3) < 0.3;
      l.set(x, y, puff ? 'white' : 'lavender', 215);
    }
    locked[a.id] = l;
  }

  // The shapes you tap: the area's land, plus the sea around a small island.
  const colours: Key[] = ['pink', 'butter', 'sky', 'lilac', 'mint', 'peach', 'rose', 'leaf'];
  const tap: Record<string, Layer> = {};
  def.areas.forEach((a, i) => {
    const l = new Layer(W, H);
    for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
      let on = at(x, y) === a.id;
      if (a.tap === 'land+sea' && !on && !at(x, y)) on = Math.hypot(x - a.at[0], (y - a.at[1]) * (a.sy ?? 1)) < a.r * 1.25;
      if (a.tap === 'box') { const [bx, by, bw, bh] = a.tapBox!; on = x >= bx && y >= by && x < bx + bw && y < by + bh; }
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

// The home island: the places you walk to. The ship sails to the journeys.
const ISLAND: MapDef = {
  name: 'island',
  width: 180,
  height: 270,
  island: { cx: 90, cy: 128, r: 86, sy: 0.74 },
  paths: [
    [[90, 140], [116, 118], [134, 104]], // backyard
    [[90, 140], [64, 120], [46, 104]], // meadow
    [[90, 140], [114, 166], [132, 188]], // friends
    [[90, 140], [66, 166], [48, 186]], // the fields
    [[90, 140], [92, 196], [90, 236]], // the dock
    [[46, 104], [40, 146], [48, 186]], // meadow - fields
    [[134, 104], [142, 146], [132, 188]], // backyard - friends
  ],
  areas: [
    {
      id: 'home', at: [90, 138], r: 30, ground: 'lavender', tuft: 'white', label: [90, 176], pin: [72, 150],
      sprites: [['cottage', 92, 142], ['tree', 64, 132], ['bush', 118, 146], ['well', 110, 162], ['mailbox', 72, 162], ['flowerP', 104, 160], ['flowerY', 80, 166], ['flowerW', 120, 158]],
    },
    {
      id: 'backyard', at: [136, 90], r: 34, ground: 'mint', tuft: 'leaf', label: [138, 56], pin: [150, 70],
      sprites: [['fence', 136, 66], ['tree', 160, 82], ['hive', 124, 92], ['perch', 150, 96], ['bed', 122, 116], ['bed', 152, 118], ['flowerY', 110, 84]],
    },
    {
      id: 'meadow', at: [44, 96], r: 34, ground: 'mint', tuft: 'leaf', label: [44, 58], pin: [36, 110],
      sprites: [['tree', 22, 82], ['bench', 58, 86], ...Array.from({ length: 24 }, (_, i) => [(['flowerP', 'flowerY', 'flowerW'] as const)[i % 3], Math.round(16 + hash(11, i) * 56), Math.round(76 + hash(12, i) * 46)] as [keyof typeof S, number, number])],
    },
    {
      id: 'friends', at: [134, 192], r: 32, ground: 'blush', tuft: 'pink', label: [134, 232], pin: [118, 214],
      sprites: [['houseBlue', 124, 196], ['heart', 150, 176], ['bush', 150, 214], ['tree', 158, 192], ['bench', 112, 218]],
    },
    {
      id: 'fields', at: [46, 192], r: 32, ground: 'butter', furrows: 'peach', label: [46, 232], locked: true,
      sprites: [['windmill', 46, 204, 3]],
    },
    {
      id: 'ship', at: [90, 250], r: 1, ground: 'butter', label: [152, 266], pin: [112, 258], tap: 'box', tapBox: [78, 228, 50, 42],
      sprites: [],
    },
  ],
  sea: [['dockV', 90, 254], ['ship', 116, 268]],
};
// The ship isn't a patch of ground: it's tapped by its box.
ISLAND.areas.find((a) => a.id === 'ship')!.r = 0.01;

// The sea behind the ship: each journey place is its own island.
const SEA: MapDef = {
  name: 'sea',
  width: 180,
  height: 270,
  paths: [],
  routes: [[[90, 228], [52, 168]], [[90, 228], [138, 196]], [[90, 228], [118, 104]], [[90, 228], [70, 84]]],
  areas: [
    {
      id: 'woods', at: [44, 140], r: 30, sy: 1.05, ground: 'moss', tuft: 'leaf', label: [44, 104], pin: [52, 168], tap: 'land+sea', locked: true,
      sprites: [
        ...Array.from({ length: 13 }, (_, i) => [i % 4 === 3 ? 'tree' : 'pine', Math.round(24 + hash(5, i) * 42), Math.round(124 + hash(6, i) * 36)] as [keyof typeof S, number, number]),
        ['houseBlue', 40, 168], ['mushroom', 62, 166], ['mushroom', 26, 160],
      ],
    },
    {
      id: 'market', at: [130, 76], r: 30, ground: 'peach', tuft: 'cream', label: [130, 40], pin: [118, 104], tap: 'land+sea', pathColour: 'cream', locked: true,
      sprites: [['houseLilac', 116, 76], ['housePink', 146, 82], ['stall', 128, 100], ['lamp', 104, 98], ['lamp', 156, 100]],
    },
    {
      id: 'cove', at: [140, 172], r: 28, ground: 'butter', tuft: 'cream', label: [140, 140], pin: [138, 196], tap: 'land+sea', locked: true,
      sprites: [['palm', 132, 172, 3], ['rock', 154, 176], ['shell', 124, 186], ['shell', 150, 162], ['rock', 118, 166]],
    },
    {
      id: 'hill', at: [58, 58], r: 26, ground: 'plum', tuft: 'lilac', label: [58, 26], pin: [70, 84], tap: 'land+sea', locked: true,
      sprites: [[hill(24, 9), 58, 74], ['dome', 52, 62], ['tele', 70, 60], ['star', 40, 46, 1], ['starS', 76, 42], ['star', 66, 40, 1]],
    },
    {
      id: 'home', at: [90, 304], r: 66, ground: 'mint', tuft: 'leaf', label: [90, 262], pin: [90, 236], tap: 'land+sea',
      sprites: [['tree', 52, 266], ['tree', 132, 268]],
    },
  ],
  sea: [['coral', 168, 196], ['coral', 112, 196], ['coral', 160, 150], ['dockV', 90, 250], ['ship', 112, 240]],
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

const palette = Object.entries(PALETTE).map(([name, hex]) => ({ name, hex }));
for (const def of [ISLAND, SEA]) {
  const art = build(def);
  const { width, height } = def;
  const picture = new Layer(width, height);
  for (const l of [art.ground, art.details]) for (let i = 0; i < l.data.length; i += 4) if (l.data[i + 3]) picture.data.set(l.data.subarray(i, i + 4), i);
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
