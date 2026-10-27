// The walk to a place, drawn while you look at the current trip (tap the
// note on the wall) until the pets get there. The scenery scrolls past in
// layers, the far ones slower than the near ones, so it looks like the pets
// are walking, and it changes along the way: out across the fields, past
// the edge of the forest, then in among the trees. Near the end of the trip
// they're there, and the place itself shows (see places.ts).
//
// Only the walk to Mossy Woods so far; the other places show the place
// itself the whole time.

import { PALETTE } from './palette';
import { GROUND, paint, rect, stars, type Sprite } from './places';
import { drawPercy } from './delivery';

// A part of the way, with its own scenery.
export type Leg = 'fields' | 'edge' | 'woods';

// Each place's walk: which leg the pets are on until how far along the
// trip. Past the last one, they're there.
const ROUTES: Record<string, { leg: Leg; until: number }[]> = {
  woods: [
    { leg: 'fields', until: 0.3 },
    { leg: 'edge', until: 0.6 },
    { leg: 'woods', until: 0.9 },
  ],
};

// The leg the pets are on a `share` of the way along a trip to `place`, or
// null once they're there (and for a place with no walk yet).
export function legFor(place: string, share: number): Leg | null {
  return ROUTES[place]?.find((l) => share < l.until)?.leg ?? null;
}

// Whether the scenery should keep still (the player asked for less motion).
export function stillScenery(): boolean {
  return typeof matchMedia !== 'undefined' && matchMedia('(prefers-reduced-motion: reduce)').matches;
}

// How fast the ground goes by, in room pixels a millisecond. The other
// layers go by at a share of this (see SPEED).
export const WALK_SPEED = 0.012;
const SPEED = { clouds: 0.04, far: 0.2, mid: 0.5, ground: 1, front: 1.5 };

// The walk on screen: the leg it's on, the one before, and how far the
// ground had gone by (`switchAt`) when it changed. The new scenery starts
// just past the right-hand edge, so it walks into view instead of popping
// in, the far layers last.
export interface Walk {
  place: string;
  leg: Leg;
  from: Leg;
  switchAt: number;
}

// The walk after this frame: a fresh one (already on its leg) for a new
// place, and a change of scenery when the leg changes.
export function stepWalk(walk: Walk | null, place: string, leg: Leg, camera: number): Walk {
  if (!walk || walk.place !== place) return { place, leg, from: leg, switchAt: -Infinity };
  if (walk.leg === leg) return walk;
  return { place, leg, from: walk.leg, switchAt: camera };
}

// Which leg's scenery is at `x` along a layer going by at `speed`.
export function legAt(walk: Walk, x: number, speed: number, w: number): Leg {
  return x >= walk.switchAt * speed + w + 4 ? walk.leg : walk.from;
}

// A number from 0 to 1 that's always the same for the same `n`, for
// scattering things about.
function hash(n: number): number {
  let x = Math.imul(n | 0, 374761393) ^ 0x9e3779b9;
  x = Math.imul(x ^ (x >>> 13), 1274126177);
  return ((x ^ (x >>> 16)) >>> 0) / 0x100000000;
}

// Things standing by the way, drawn from text grids (see places.ts).
const BUSH: Sprite = [
  '...nnnn...',
  '..nmmggn..',
  '.nmmgggrn.',
  'nmggrggggn',
  'ngggggggnn',
  '.nnnnnnnn.',
];
const ROCK: Sprite = [
  '..uuuu..',
  '.uvvllu.',
  'uvllllu.',
  'ulllllluu',
];
const SIGN: Sprite = [
  'tccccc..',
  'cyyyyyc.',
  'cyttyyyc',
  'cyyyyyc.',
  'tccccc..',
  '..ct....',
  '..ct....',
  '..ct....',
  '..ct....',
  '.ncttn..',
];
const FERN: Sprite = [
  '.g...g.',
  'g.g.g.g',
  '.ggngg.',
  '..nnn..',
];
const MUSHROOMS: Sprite = [
  '.rrrr....',
  'rwrrrx...',
  'rrrrxx.rr',
  '..ee..rwx',
  '..ev...e.',
];
const STUMP: Sprite = [
  '.oyyo.',
  'tooyot',
  'tcccct',
  'tcctct',
  'ttcctt',
];

// A round crown of leaves, lit from the top left, with an outline.
function crown(ctx: CanvasRenderingContext2D, cx: number, cy: number, r: number): void {
  for (let dy = -r; dy <= r; dy++) {
    for (let dx = -r; dx <= r; dx++) {
      const d = dx * dx + dy * dy;
      if (d > r * r + r) continue;
      let c: string = PALETTE.leaf;
      if (d > r * r - r) c = PALETTE.moss;
      else if (dx + dy < -r * 0.7) c = PALETTE.mint;
      else if (dx + dy > r * 0.6) c = PALETTE.moss;
      rect(ctx, c, cx + dx, cy + dy, 1, 1);
    }
  }
}

// A tree trunk `tw` wide from `top` down to the grass, lighter on the left,
// with a knot and roots.
function trunk(ctx: CanvasRenderingContext2D, x: number, top: number, tw: number, seed: number): void {
  for (let i = 0; i < tw; i++) rect(ctx, i < tw / 2 ? PALETTE.cocoa : PALETTE.bark, x + i, top, 1, GROUND + 1 - top);
  rect(ctx, PALETTE.bark, x + 1, top + 5 + Math.floor(hash(seed) * 8), 1, 2);
  rect(ctx, PALETTE.bark, x - 1, GROUND, 1, 1);
  rect(ctx, PALETTE.bark, x + tw, GROUND, 1, 1);
  rect(ctx, PALETTE.moss, x, GROUND - 2, 2, 2); // moss at its foot
}

// Calls `draw` for each thing in a row of things spread about every `gap`
// pixels along a layer, with where it is on screen and a number to pick it
// by.
function along(offset: number, gap: number, w: number, draw: (sx: number, wx: number, pick: number) => void): void {
  for (let i = Math.floor((offset - 24) / gap); i <= Math.floor((offset + w + 24) / gap); i++) {
    const wx = i * gap + Math.floor(hash(i) * (gap / 2));
    draw(wx - offset, wx, hash(i * 13 + 7));
  }
}

// The sky, the far layer and the middle layer: everything behind the pets.
export function drawWalk(ctx: CanvasRenderingContext2D, walk: Walk, camera: number, w: number, h: number, night: boolean, timeMs: number): void {
  const far = Math.floor(camera * SPEED.far);
  const mid = Math.floor(camera * SPEED.mid);
  const ground = Math.floor(camera);
  const legOf = (x: number, speed: number) => legAt(walk, x, speed, w);

  // The sky: blue and paler near the hills by day, starry at night, and
  // a green gloom under the trees.
  for (let x = 0; x < w; x++) {
    const inWoods = legOf(x + far, SPEED.far) === 'woods';
    for (let y = 0; y < GROUND; y++) {
      let c: string = night ? PALETTE.plum : PALETTE.sky;
      if (inWoods) c = night ? PALETTE.plum : PALETTE.mint;
      else if (y > 21 || (y > 17 && (x + y) % 2 === 0)) c = night ? PALETTE.lilac : PALETTE.cream;
      else if (night && y < 3) c = PALETTE.ink;
      rect(ctx, c, x, y, 1, 1);
    }
  }
  if (night) {
    stars(ctx, w, 16, timeMs);
    if (legOf(far + 50, SPEED.far) !== 'woods') {
      rect(ctx, PALETTE.butter, 47, 4, 4, 4);
      rect(ctx, PALETTE.butter, 46, 5, 6, 2);
      rect(ctx, PALETTE.plum, 49, 4, 3, 3); // a bite out of it: a crescent
    }
  } else {
    // Clouds drift by on their own as well as going by.
    const drift = camera * SPEED.clouds + timeMs * 0.0015;
    for (const [base, cy, cw] of [[8, 4, 10], [52, 9, 7], [90, 2, 12]]) {
      const cx = Math.floor(((base - drift) % 120 + 120) % 120) - 20;
      for (let x = cx; x < cx + cw; x++) {
        if (x < 0 || x >= w || legOf(x + far, SPEED.far) === 'woods') continue;
        if (x > cx + 1 && x < cx + cw - 2) rect(ctx, PALETTE.white, x, cy, 1, 1);
        rect(ctx, PALETTE.white, x, cy + 1, 1, 1);
        rect(ctx, PALETTE.lavender, x, cy + 2, 1, 1);
      }
    }
  }

  // Far away: rolling hills, then a dark line of trees as the forest
  // nears, then pale trunks deep in the woods.
  for (let x = 0; x < w; x++) {
    const fx = x + far;
    const leg = legOf(fx, SPEED.far);
    if (leg === 'fields') {
      const top = 23 + Math.round(3 * Math.sin((fx * 2 * Math.PI) / 70) + 1.5 * Math.sin((fx * 2 * Math.PI) / 23));
      for (let y = top; y < GROUND; y++) {
        const light = y === top || (y < top + 3 && (x + y) % 2 === 0);
        rect(ctx, light ? PALETTE.mint : PALETTE.leaf, x, y, 1, 1);
      }
    } else if (leg === 'edge') {
      const top = 15 + Math.floor(hash(Math.floor(fx / 3)) * 4) + Math.round(2 * Math.sin(fx / 9));
      for (let y = top; y < GROUND; y++) rect(ctx, y === top || (y === top + 1 && x % 2) ? PALETTE.leaf : PALETTE.moss, x, y, 1, 1);
    } else {
      if (fx % 9 === 0 || fx % 9 === 1) rect(ctx, night ? PALETTE.lilac : PALETTE.leaf, x, 6, 1, GROUND - 6);
      rect(ctx, PALETTE.moss, x, 0, 1, 7 + Math.floor(hash(Math.floor(fx / 4)) * 3));
    }
  }

  // The middle: a fence, bushes and the odd signpost in the fields; trees
  // at the forest's edge; big trunks, ferns and mushrooms in the woods.
  for (let x = 0; x < w; x++) {
    const mx = x + mid;
    if (legOf(mx, SPEED.mid) !== 'fields') continue;
    rect(ctx, PALETTE.cocoa, x, GROUND - 5, 1, 1);
    rect(ctx, PALETTE.bark, x, GROUND - 4, 1, 1);
    if (mx % 8 === 0) {
      rect(ctx, PALETTE.cocoa, x, GROUND - 7, 1, 7);
      rect(ctx, PALETTE.bark, x + 1, GROUND - 7, 1, 7);
    }
  }
  along(mid, 16, w, (sx, wx, pick) => {
    const leg = legOf(wx, SPEED.mid);
    if (leg === 'fields') {
      if (pick < 0.4) paint(ctx, BUSH, sx, GROUND - 5);
      else if (pick < 0.6) paint(ctx, ROCK, sx, GROUND - 3);
      else if (pick < 0.7) paint(ctx, SIGN, sx, GROUND - 9);
      else if (pick < 0.9) {
        trunk(ctx, sx + 4, GROUND - 9, 2, wx);
        crown(ctx, sx + 5, GROUND - 13, 5);
      }
    } else if (leg === 'edge') {
      if (pick < 0.65) {
        trunk(ctx, sx, 12, 3, wx);
        crown(ctx, sx + 1, 9 + Math.floor(pick * 6), 7);
      } else if (pick < 0.85) paint(ctx, BUSH, sx, GROUND - 5);
      else paint(ctx, FERN, sx, GROUND - 3);
    } else {
      if (pick < 0.7) trunk(ctx, sx, 0, 4, wx);
      if (pick > 0.5) paint(ctx, pick > 0.8 ? STUMP : FERN, sx + 6, GROUND - (pick > 0.8 ? 4 : 3));
    }
  });
  // The canopy over the woods, lumpy and lighter at the tips.
  for (let x = 0; x < w; x++) {
    const mx = x + mid;
    if (legOf(mx, SPEED.mid) !== 'woods') continue;
    const lump = Math.floor(mx / 5);
    const edge = mx % 5 === 0 || mx % 5 === 4 ? 1 : 0;
    const dip = 5 + Math.floor(hash(lump) * 4) - edge;
    rect(ctx, PALETTE.moss, x, 0, 1, dip - 1);
    rect(ctx, PALETTE.leaf, x, dip - 1, 1, 1);
    if (hash(mx * 3) < 0.25) rect(ctx, PALETTE.mint, x, Math.floor(hash(mx) * (dip - 2)), 1, 1);
  }
  // Sunlight slanting through the trees by day; fireflies at night.
  if (night) {
    along(mid, 11, w, (sx, wx, pick) => {
      if (legOf(wx, SPEED.mid) !== 'woods') return;
      const t = timeMs / 900 + pick * 10;
      if (Math.sin(t * 2.3) < -0.2) return; // blinking
      rect(ctx, PALETTE.butter, sx + Math.round(Math.sin(t) * 3), 14 + Math.floor(pick * 14) + Math.round(Math.cos(t * 0.7) * 2), 1, 1);
    });
  } else {
    along(mid, 29, w, (sx, wx, pick) => {
      if (pick > 0.6 || legOf(wx, SPEED.mid) !== 'woods') return;
      for (let y = 9; y < GROUND; y++) {
        const x = sx + Math.floor((y - 9) / 2);
        for (let i = 0; i < 3; i++) if ((x + i + y) % 2 === 0) rect(ctx, PALETTE.butter, x + i, y, 1, 1);
      }
    });
  }

  // The ground: grass, and a dirt path the pets walk along.
  const PATH_TOP = 37;
  const PATH_BOTTOM = 44;
  for (let x = 0; x < w; x++) {
    const gx = x + ground;
    const woods = legOf(gx, SPEED.ground) === 'woods';
    const grass = woods ? PALETTE.moss : PALETTE.leaf;
    rect(ctx, woods ? PALETTE.leaf : PALETTE.mint, x, GROUND, 1, 1);
    for (let y = GROUND + 1; y < h; y++) {
      let c: string = grass;
      if (y >= PATH_TOP && y <= PATH_BOTTOM) {
        c = PALETTE.peach;
        if (y === PATH_TOP) c = woods ? PALETTE.cocoa : PALETTE.butter;
        else if (y === PATH_BOTTOM) c = PALETTE.cocoa;
        else if (hash(gx * 31 + y) < 0.1) c = woods ? PALETTE.cocoa : PALETTE.butter;
      } else if (hash(gx * 17 + y) < 0.1) c = woods ? PALETTE.leaf : PALETTE.mint;
      rect(ctx, c, x, y, 1, 1);
    }
    // Flowers by the path in the fields, mushrooms in the woods.
    const r = hash(gx * 7);
    if (!woods && r < 0.06) rect(ctx, [PALETTE.pink, PALETTE.butter, PALETTE.white][Math.floor(r * 50) % 3], x, GROUND + 1 + Math.floor(r * 30) % 2, 1, 1);
    if (gx % 23 === 0) {
      rect(ctx, PALETTE.lilac, x, 41, 2, 1); // a pebble
      rect(ctx, PALETTE.plum, x + 1, 42, 1, 1);
    }
  }
  along(ground, 34, w, (sx, wx, pick) => {
    if (pick < 0.5 && legOf(wx, SPEED.ground) === 'woods') paint(ctx, MUSHROOMS, sx, GROUND - 2);
  });
}

// Grass going by in front of the pets, quicker than the ground.
export function drawWalkFront(ctx: CanvasRenderingContext2D, walk: Walk, camera: number, w: number, h: number): void {
  along(Math.floor(camera * SPEED.front), 21, w, (sx, wx, pick) => {
    if (pick > 0.55) return;
    const woods = legAt(walk, wx, SPEED.front, w) === 'woods';
    const tall = 3 + Math.floor(pick * 6);
    for (const [dx, lean] of [[0, 0], [2, 1], [4, 0], [5, -1]]) {
      rect(ctx, woods ? PALETTE.moss : PALETTE.leaf, sx + dx, h - tall + Math.abs(lean), 1, tall);
      rect(ctx, woods ? PALETTE.leaf : PALETTE.mint, sx + dx + lean, h - tall - 1 + Math.abs(lean), 1, 1);
    }
  });
}

// ---- Spotted on the way ----
// Over the walk (and over a place, once they're there, or a place with no
// walk yet): now and then something glints on the ground, and once a trip
// Percy hurries past and drops a parcel. Tap one to pick it up (see
// src/ui/trip.ts and spotFind in src/game/journeys.ts). On a walk they go
// by with the ground; otherwise they stay put for a while.

// What's showing, by when it started, on the same clock as `timeMs`.
export interface SpotScene {
  glint: number | null; // when something came into view on the ground
  percy: number | null; // when Percy came in from the left
  parcelTaken: boolean; // his parcel's been picked up
  picked: { at: number; x: number; y: number } | null; // a little burst where something was picked up
}

const LINGER_MS = 30000; // how long a thing stays on a place with no walk
const PERCY_SPEED = 0.02; // room pixels a millisecond, on screen
const PERCY_FROM = -22; // just off the left edge (he's about 20 pixels wide)
const PERCY_DROP_X = 38; // where he drops the parcel
const PERCY_FLOOR = 47; // he walks along the front of the path
export const PERCY_DROP_MS = (PERCY_DROP_X - PERCY_FROM) / PERCY_SPEED;
const PICKED_MS = 600;

// Where a thing that showed up at `since` is at `timeMs` (its middle), or
// null once it's gone: on a walk it comes in from the right (or from
// `from`) and goes by with the ground.
function goingBy(since: number, timeMs: number, walking: boolean, from: number, still: { x: number; y: number }): { x: number; y: number } | null {
  if (timeMs < since) return null;
  if (!walking) return timeMs - since < LINGER_MS ? still : null;
  const x = Math.round(from - (timeMs - since) * WALK_SPEED);
  return x > -4 ? { x, y: still.y } : null;
}

export function glintAt(since: number, timeMs: number, walking: boolean, w: number): { x: number; y: number } | null {
  return goingBy(since, timeMs, walking, w + 4, { x: 55, y: 42 });
}

export function parcelAt(percySince: number, timeMs: number, walking: boolean): { x: number; y: number } | null {
  return goingBy(percySince + PERCY_DROP_MS, timeMs, walking, PERCY_DROP_X + 7, { x: PERCY_DROP_X + 7, y: 43 });
}

// Where Percy is (his left edge), or null before he comes and once he's gone.
export function percyAt(since: number, timeMs: number, w: number): number | null {
  const x = Math.round(PERCY_FROM + (timeMs - since) * PERCY_SPEED);
  return timeMs >= since && x < w ? x : null;
}

const PARCEL: Sprite = [
  '..y....',
  'cccyccc',
  'ooocyoo',
  'oooyooo',
  'cccyccc',
];

// A twinkle: a bright four-pointed star whose rays grow and shrink, so a
// tiny thing on the ground catches the eye.
function twinkle(ctx: CanvasRenderingContext2D, x: number, y: number, timeMs: number): void {
  const reach = [1, 2, 3, 2][Math.floor(timeMs / 160) % 4];
  for (let i = 1; i <= reach; i++) {
    const c = i === reach ? PALETTE.butter : PALETTE.white;
    rect(ctx, c, x - i, y, 1, 1);
    rect(ctx, c, x + i, y, 1, 1);
    rect(ctx, c, x, y - i, 1, 1);
    rect(ctx, c, x, y + i, 1, 1);
  }
  if (reach === 3) {
    for (const [dx, dy] of [[-1, -1], [1, -1], [-1, 1], [1, 1]]) rect(ctx, PALETTE.butter, x + dx, y + dy, 1, 1);
  }
  rect(ctx, PALETTE.white, x, y, 1, 1);
}

// Draws what's spotted, over everything else.
export function drawSpotted(ctx: CanvasRenderingContext2D, spots: SpotScene, walking: boolean, w: number, timeMs: number): void {
  if (spots.glint !== null) {
    const at = glintAt(spots.glint, timeMs, walking, w);
    if (at) {
      // Something half in the ground, catching the light.
      rect(ctx, PALETTE.plum, at.x - 2, at.y + 1, 5, 1);
      rect(ctx, PALETTE.lilac, at.x - 2, at.y, 4, 1);
      rect(ctx, PALETTE.lavender, at.x - 1, at.y - 1, 2, 1);
      twinkle(ctx, at.x + 1, at.y - 3, timeMs);
    }
  }
  if (spots.percy !== null) {
    const parcel = spots.parcelTaken ? null : parcelAt(spots.percy, timeMs, walking);
    if (parcel) {
      paint(ctx, PARCEL, parcel.x - 3, parcel.y - 2);
      twinkle(ctx, parcel.x + 3, parcel.y - 4, timeMs);
    }
    const x = percyAt(spots.percy, timeMs, w);
    if (x !== null) drawPercy(ctx, x, PERCY_FLOOR, timeMs);
  }
  if (spots.picked && timeMs - spots.picked.at < PICKED_MS) {
    const r = 1 + Math.floor(((timeMs - spots.picked.at) / PICKED_MS) * 4);
    const { x, y } = spots.picked;
    for (const [dx, dy] of [[-1, -1], [1, -1], [-1, 1], [1, 1], [0, -1.4]]) {
      rect(ctx, PALETTE.butter, Math.round(x + dx * r), Math.round(y - r + dy * r), 1, 1);
    }
  }
}
