// The little map over the stat bars while you look at the current trip
// (see src/ui/trip.ts): an old paper map, folded in three, with the
// countryside along the way drawn on it. Home is a cottage at the left;
// the trail wiggles across fields, over a river by a little bridge, and on
// to the place, drawn as a landmark with a flag. The way to Mossy Woods
// passes the forest's edge and goes in among the trees, like the walk in
// the room (see journey.ts). The part they've walked is a solid red line,
// the rest dotted. The pets' pictures go on top, in the page (trip.ts).

import { PALETTE } from './palette';
import { paint, rect, type Sprite } from './places';

export const MAP_W = 160;
export const MAP_H = 48;
const FROM = { x: 17, y: 36 };
const TO = { x: 141, y: 19 };
const RIVER_AT = 0.42; // how far along the trail the river crosses it

// The trail's pixels from home to the place: a gentle wiggle, one pixel
// after another with no gaps.
function trailPixels(): { x: number; y: number }[] {
  const out: { x: number; y: number }[] = [];
  const steps = 800;
  for (let i = 0; i <= steps; i++) {
    const t = i / steps;
    const x = Math.round(FROM.x + (TO.x - FROM.x) * t);
    const y = Math.round(FROM.y + (TO.y - FROM.y) * t + Math.sin(t * Math.PI * 2.2) * 7 * Math.sin(t * Math.PI));
    const last = out[out.length - 1];
    if (!last || last.x !== x || last.y !== y) out.push({ x, y });
  }
  return out;
}
const TRAIL = trailPixels();

const at = (share: number) => TRAIL[Math.min(TRAIL.length - 1, Math.max(0, Math.round(share * (TRAIL.length - 1))))];

// Where on the map a share of the trip is, as percent across and down.
export function trailPoint(share: number): { left: number; top: number } {
  const p = at(share);
  return { left: ((p.x + 0.5) / MAP_W) * 100, top: ((p.y + 0.5) / MAP_H) * 100 };
}

// A number from 0 to 1 that's always the same for the same `n`.
function hash(n: number): number {
  let x = Math.imul(n | 0, 374761393) ^ 0x5bd1e995;
  x = Math.imul(x ^ (x >>> 13), 1274126177);
  return ((x ^ (x >>> 16)) >>> 0) / 0x100000000;
}

// How near (x, y) is to the trail, in pixels (roughly).
function fromTrail(x: number, y: number): number {
  let best = Infinity;
  for (let i = 0; i < TRAIL.length; i += 2) {
    const p = TRAIL[i];
    const d = Math.max(Math.abs(p.x - x), Math.abs(p.y - y));
    if (d < best) best = d;
  }
  return best;
}

// How far along the trail is nearest to x, 0 to 1.
function shareAtX(x: number): number {
  return Math.min(1, Math.max(0, (x - FROM.x) / (TO.x - FROM.x)));
}

// The sprites on the map, a pixel a letter (see places.ts).
const COTTAGE: Sprite = [
  '.....kk..',
  '...kkrkk.',
  '..krrrrrk',
  '.krrrrrrrk',
  'kkkkkkkkkk',
  '.keeeeeek.',
  '.keskcesk.',
  '.keekceek.',
  '.kkkkkkkk.',
];
const TREE: Sprite = ['.kk.', 'kmgk', 'kggk', 'knnk', '.kc.'];
const PINE: Sprite = ['..k..', '.kgk.', '.kgk.', 'kgmgk', 'kgggk', 'knnnk', '..c..'];
const BUSH: Sprite = ['.kk.', 'kmgk', 'kgnk'];
const BIG_TREE: Sprite = [
  '..kkkk..',
  '.kmmggk.',
  'kmgggggk',
  'kggggnnk',
  '.kgnnnk.',
  '..kkck..',
  '...kck..',
  '...kck..',
];
const HOUSE: Sprite = ['..kk..', '.krrk.', 'krrrrk', 'kekkek', 'keekek', 'kkkkkk'];
const FLAG: Sprite = ['kk...', 'krrr.', 'krrrr', 'krr..', 'k....', 'k....', 'k....'];
const MOUNTAIN: Sprite = [
  '....k....',
  '...kwk...',
  '..kwvlk..',
  '..kvlllk.',
  '.kvllluk.',
  'kvlllluuk',
  'kkkkkkkkk',
];
const COMPASS: Sprite = [
  '...k...',
  '..krk..',
  '..krk..',
  'kkkwkkk',
  '..kck..',
  '..kck..',
  '...k...',
];
const STAR: Sprite = ['..y..', '.yyy.', 'yyyyy', '.y.y.'];

// The place at the end of the trail: Mossy Woods is a thick wood, Market
// Town a cluster of roofs, Coral Cove a little bay with a rock arch,
// Starlit Hill a big hill under a star, the Meadow flowers and a big tree.
function landmark(ctx: CanvasRenderingContext2D, place: string): void {
  const { x, y } = TO;
  if (place === 'market') {
    for (const [dx, dy] of [[-12, -7], [-5, -10], [2, -7], [-9, 0], [4, 0]]) paint(ctx, HOUSE, x + dx, y + dy);
  } else if (place === 'cove') {
    // A bay of sea, out to the map's edge, with a sandy rim, waves, and a rock arch.
    for (let dy = -12; dy <= 2; dy++) {
      const half = Math.round(17 * Math.sqrt(Math.max(0, 1 - ((dy + 5) / 8) ** 2)));
      if (!half) continue;
      rect(ctx, PALETTE.butter, x + 2 - half - 1, y + dy, half * 2 + 2, 1);
      rect(ctx, PALETTE.ocean, x + 2 - half + 1, y + dy, Math.max(0, half * 2 - 2), 1);
    }
    for (const [dx, dy] of [[-10, -8], [-3, -4], [-12, -2], [2, -10], [-6, 0]]) rect(ctx, PALETTE.sky, x + dx, y + dy, 3, 1);
    for (let dy = -9; dy <= -4; dy++) {
      const inner = dy < -7 ? 0 : 1;
      rect(ctx, PALETTE.lilac, x + 6, y + dy, 5, 1);
      if (inner) rect(ctx, PALETTE.ocean, x + 8, y + dy, 1, 1);
    }
    rect(ctx, PALETTE.plum, x + 6, y - 10, 5, 1);
    rect(ctx, PALETTE.pink, x - 15, y, 1, 1); // a shell on the sand
  } else if (place === 'hill') {
    for (let dx = -16; dx <= 12; dx++) {
      const top = y - 3 - Math.round(7 * Math.cos((dx / 16) * (Math.PI / 2)));
      rect(ctx, PALETTE.leaf, x + dx, top, 1, y + 2 - top);
      rect(ctx, PALETTE.moss, x + dx, top, 1, 1);
    }
    paint(ctx, STAR, x - 5, y - 18);
  } else if (place === 'meadow') {
    paint(ctx, BIG_TREE, x - 2, y - 13);
    for (let i = 0; i < 9; i++) rect(ctx, [PALETTE.pink, PALETTE.butter, PALETTE.white][i % 3], x - 12 + Math.floor(hash(i + 50) * 22), y - 6 + Math.floor(hash(i + 70) * 9), 1, 1);
  } else {
    // A wood: pines packed close, the near ones lower.
    for (const [dx, dy] of [[-16, -9], [-9, -12], [-2, -14], [5, -11], [11, -8], [-12, -3], [-5, -6], [2, -4], [8, -2]]) paint(ctx, PINE, x + dx, y + dy);
  }
}

// The countryside along the way, between home and the place.
function countryside(ctx: CanvasRenderingContext2D, place: string): void {
  const woods = place === 'woods';
  // Mountains far off along the top.
  for (const [mx, my] of [[34, 2], [43, 4], [70, 1], [84, 3]]) paint(ctx, MOUNTAIN, mx, my);
  // Fields near home: little crop rows in patches, with fences.
  for (const [fx, fy, fw] of [[30, 38, 12], [44, 28, 9], [8, 18, 10]]) {
    for (let r = 0; r < 4; r++) rect(ctx, r % 2 ? PALETTE.mint : PALETTE.leaf, fx, fy + r, fw, 1);
    for (let i = 0; i <= fw; i += 2) rect(ctx, PALETTE.cocoa, fx - 1 + i, fy - 1, 1, 1);
  }
  // A river crossing the trail, with a bridge where they meet.
  const cross = at(RIVER_AT);
  for (let y = 0; y < MAP_H; y++) {
    const x = cross.x + Math.round(Math.sin((y - cross.y) / 6) * 4);
    if (Math.abs(y - cross.y) <= 1) continue;
    rect(ctx, PALETTE.sky, x - 1, y, 3, 1);
    if (y % 5 === 0) rect(ctx, PALETTE.white, x, y, 1, 1); // ripples
    rect(ctx, PALETTE.ocean, x + 2, y, 1, 1);
  }
  // Trees and bushes dotted about on a loose grid, more of them nearer the
  // woods; pines from the forest's edge on, on the way to Mossy Woods.
  for (let gx = 0; gx < MAP_W; gx += 9) {
    for (let gy = 4; gy < MAP_H - 6; gy += 8) {
      const n = gx * 31 + gy;
      const x = gx + Math.floor(hash(n) * 6);
      const y = gy + Math.floor(hash(n + 999) * 4);
      const s = shareAtX(x);
      if (fromTrail(x + 2, y + 3) < 5 || Math.abs(x + 2 - cross.x) < 7) continue;
      if (x > TO.x - 24 && y < TO.y + 8) continue; // the place
      if (x < FROM.x + 6 && y > FROM.y - 14) continue; // home
      if (x < 14 && y < 14) continue; // the compass
      if (y < 12 && x > 30 && x < 96) continue; // the mountains
      if (x + 4 > MAP_W - 3 || y + 7 > MAP_H - 3) continue;
      const thick = woods ? 0.25 + s * 0.7 : 0.3;
      if (hash(n + 7) > thick) {
        // A tuft of grass instead, now and then.
        if (hash(n + 11) < 0.5) {
          rect(ctx, PALETTE.mint, x + 1, y + 4, 1, 2);
          rect(ctx, PALETTE.leaf, x + 3, y + 3, 1, 3);
        }
        continue;
      }
      const pine = woods && (s > 0.6 || (s > 0.3 && hash(n + 3) < 0.6));
      paint(ctx, pine ? PINE : hash(n + 5) < 0.4 ? BUSH : TREE, x, y);
    }
  }
}

// The paper: cream with a little texture, a darker edge worn unevenly, and
// two folds.
function paper(ctx: CanvasRenderingContext2D): void {
  rect(ctx, PALETTE.cream, 0, 0, MAP_W, MAP_H);
  for (let i = 0; i < 160; i++) rect(ctx, PALETTE.butter, Math.floor(hash(i + 300) * MAP_W), Math.floor(hash(i + 600) * MAP_H), 1, 1);
  for (let x = 0; x < MAP_W; x++) {
    const top = 1 + Math.floor(hash(x + 1200) * 2);
    const bottom = 1 + Math.floor(hash(x + 1400) * 2);
    rect(ctx, PALETTE.butter, x, 0, 1, top + 1);
    rect(ctx, PALETTE.peach, x, 0, 1, top);
    rect(ctx, PALETTE.butter, x, MAP_H - bottom - 1, 1, bottom + 1);
    rect(ctx, PALETTE.peach, x, MAP_H - bottom, 1, bottom);
  }
  for (let y = 0; y < MAP_H; y++) {
    const left = 1 + Math.floor(hash(y + 1600) * 2);
    const right = 1 + Math.floor(hash(y + 1800) * 2);
    rect(ctx, PALETTE.peach, 0, y, left, 1);
    rect(ctx, PALETTE.peach, MAP_W - right, y, right, 1);
  }
  for (const fold of [Math.round(MAP_W / 3), Math.round((MAP_W * 2) / 3)]) {
    for (let y = 2; y < MAP_H - 2; y++) {
      if (y % 7 === 3) continue;
      rect(ctx, PALETTE.butter, fold, y, 1, 1);
      rect(ctx, PALETTE.white, fold + 1, y, 1, 1);
    }
  }
}

// Draws the map for a trip to `place` a `share` of the way along.
export function drawTripMap(ctx: CanvasRenderingContext2D, place: string, share: number): void {
  paper(ctx);
  countryside(ctx, place);
  paint(ctx, COMPASS, 4, 4);
  // The trail: a solid red line as far as they've got, dotted after.
  const reached = share * (TRAIL.length - 1);
  TRAIL.forEach((p, i) => {
    if (i > reached && i % 4 === 0) rect(ctx, PALETTE.cocoa, p.x, p.y, 2, 2);
  });
  TRAIL.forEach((p, i) => {
    if (i > reached) return;
    rect(ctx, PALETTE.berry, p.x, p.y + 1, 2, 2);
    rect(ctx, PALETTE.rose, p.x, p.y, 2, 2);
  });
  // The bridge over the river, over the trail.
  const cross = at(RIVER_AT);
  rect(ctx, PALETTE.bark, cross.x - 3, cross.y - 2, 8, 1);
  rect(ctx, PALETTE.bark, cross.x - 3, cross.y + 3, 8, 1);
  for (let i = -3; i <= 4; i++) rect(ctx, i % 2 ? PALETTE.peach : PALETTE.cocoa, cross.x + i, cross.y - 1, 1, 4);
  // Home, and the place with its flag and an X.
  paint(ctx, COTTAGE, FROM.x - 13, FROM.y - 8);
  rect(ctx, PALETTE.lavender, FROM.x - 7, FROM.y - 11, 1, 1); // smoke from the chimney
  rect(ctx, PALETTE.lavender, FROM.x - 6, FROM.y - 13, 1, 1);
  landmark(ctx, place);
  for (let i = -2; i <= 2; i++) {
    rect(ctx, PALETTE.rose, TO.x + i, TO.y + i, 1, 1);
    rect(ctx, PALETTE.rose, TO.x + i, TO.y - i, 1, 1);
  }
  paint(ctx, FLAG, TO.x + 4, TO.y - 10);
}
