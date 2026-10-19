// The garden scene in the room. While you garden, the room becomes a little
// garden: sky, a picket fence and grass, with the pet on the left and the
// pots side by side on the right (two, or three once you buy another). The pot you picked has a small
// arrow over it, and a dry pot has a blinking water drop.
//
// A few small touches: the soil in each pot darkens pixel by pixel as it
// gets wetter, a watering can tips over the picked pot while you hold
// Water, a plant hops with a sparkle when it grows into its next look, and
// a harvested crop bounces out of its pot.

import { PALETTE } from './palette';

// What the room needs to know about each pot (worked out from the game
// state in main.ts, so this file only draws).
export interface GardenPotView {
  stage: 'empty' | 'growing' | 'sick' | 'ready' | 'dead';
  crop: string | null;
  grown: number; // 0-1, how far along it is
  dry: boolean;
  wet: number; // 0-1, how wet the soil is
}

export interface GardenScene {
  pots: GardenPotView[];
  selected: number;
  pouring?: boolean; // Water is being held on the picked pot
}

// Where each pot stands: its middle, in room pixels.
const POT_X: Record<number, number[]> = { 2: [40, 53], 3: [35, 46, 57] };
const potXs = (count: number) => POT_X[count] ?? POT_X[3];
const POT_TOP = 40; // the rim; the plant stands on it
const POT_W = 8;

// Little sprites from text grids: "." is see-through, other letters are
// palette colours. Plants are drawn standing on the pot's rim.
type Sprite = string[];
const COLORS: Record<string, string> = {
  k: PALETTE.ink,
  g: PALETTE.leaf,
  m: PALETTE.mint,
  o: PALETTE.peach,
  r: PALETTE.rose,
  p: PALETTE.pink,
  c: PALETTE.cocoa,
  y: PALETTE.butter,
  w: PALETTE.white,
  s: PALETTE.sky,
  b: PALETTE.ocean,
};

const POT: Sprite = ['oooooooo', 'cccccccc', '.cccccc.', '.cccccc.', '..cccc..'];
const SPROUT: Sprite = ['.g....g.', '.gg..gg.', '..gmmg..', '...gg...', '...gg...'];
const GROWING: Sprite = ['...gg...', '..gmmg..', 'g..gg..g', 'gm.gg.mg', '.gggggg.', '...gg...', '.g.gg.g.', '..gggg..'];
const READY: Record<string, Sprite> = {
  carrot: ['.g.g.g..', '..ggg...', '.gmgmg..', '..ggg...', '.ooooo..', '.ocooo..'],
  pumpkin: ['....g...', '...gc...', '.oooooo.', 'oocoocoo', 'oocoocoo', '.oooooo.'],
  dragonFruit: ['...pp...', '..pgpp..', '..pppp..', 'g..gg..g', 'gg.gg.gg', '.gggggg.', '...gg...', '...gg...'],
};
const SICK: Sprite = ['...cy...', '..c.c...', '.c..cc..', 'c...c.c.', '....c..c', '...cc...'];
const DEAD: Sprite = ['.c....c.', '..c..c..', '...cc...', '.cccccc.'];
const ARROW: Sprite = ['wwwww', '.www.', '..w..'];
const DROP: Sprite = ['.s.', 'sbs', '.s.'];
// The watering can, spout on the left. Drawn flipped for pots near the
// right edge so it stays in the room.
const CAN: Sprite = ['....ccc.', 'b..c...c', '.bssss.c', '..ssssc.', '..ssss..', '...ss...'];
// Soil pixels across the rim, darkening from the middle out as it gets wet.
const SOIL_ORDER = [2, 3, 1, 4, 0, 5];
const SOIL_STEP_MS = 70; // how fast the soil darkens or dries, a pixel at a time
const POP_MS = 360; // how long a plant hops after it grows
export const TOSS_MS = 700; // how long a harvested crop takes to bounce out

// Draws a sprite. With `outline`, it first gets a one-pixel ink outline
// (like the pet has), so green plants stand out against the grass. With
// `flip`, it faces the other way.
function draw(ctx: CanvasRenderingContext2D, sprite: Sprite, x: number, y: number, outline = false, flip = false): void {
  const paint = (ox: number, oy: number, solid?: string) =>
    sprite.forEach((row, sy) => {
      for (let sx = 0; sx < row.length; sx++) {
        const color = COLORS[row[sx]];
        if (!color) continue;
        ctx.fillStyle = solid ?? color;
        const px = flip ? row.length - 1 - sx : sx;
        ctx.fillRect(Math.round(x) + px + ox, Math.round(y) + sy + oy, 1, 1);
      }
    });
  if (outline) for (const [ox, oy] of [[-1, 0], [1, 0], [0, -1], [0, 1]]) paint(ox, oy, PALETTE.ink);
  paint(0, 0);
}

function plantSprite(pot: GardenPotView): Sprite | null {
  if (pot.stage === 'empty') return null;
  if (pot.stage === 'dead') return DEAD;
  if (pot.stage === 'sick') return SICK;
  if (pot.stage === 'ready') return READY[pot.crop ?? ''] ?? GROWING;
  return pot.grown < 0.4 ? SPROUT : GROWING;
}

// The garden behind the pet: sky, fence and grass.
export function drawGardenBackground(
  ctx: CanvasRenderingContext2D,
  width: number,
  height: number,
  night: boolean,
  timeMs: number,
): void {
  ctx.fillStyle = night ? PALETTE.plum : PALETTE.sky;
  ctx.fillRect(0, 0, width, height);
  if (night) {
    ctx.fillStyle = PALETTE.butter;
    ctx.fillRect(52, 4, 3, 1);
    ctx.fillRect(51, 5, 3, 2);
    ctx.fillRect(52, 7, 3, 1);
    const twinkle = Math.floor(timeMs / 700) % 2;
    ctx.fillStyle = PALETTE.white;
    ctx.fillRect(8, 5 + twinkle, 1, 1);
    ctx.fillRect(30, 3, 1, 1);
    ctx.fillRect(42, 9 - twinkle, 1, 1);
  } else {
    // The sun and a slow cloud.
    ctx.fillStyle = PALETTE.butter;
    ctx.fillRect(52, 3, 5, 5);
    const drift = Math.floor(timeMs / 1500) % (width + 12);
    ctx.fillStyle = PALETTE.white;
    const cx = drift - 12;
    ctx.fillRect(cx, 8, 9, 2);
    ctx.fillRect(cx + 2, 7, 4, 1);
  }
  // The picket fence.
  const fenceTop = 20;
  ctx.fillStyle = night ? PALETTE.lavender : PALETTE.cream;
  ctx.fillRect(0, fenceTop + 3, width, 1);
  ctx.fillRect(0, fenceTop + 7, width, 1);
  for (let x = 1; x < width; x += 4) {
    ctx.fillRect(x, fenceTop + 1, 2, 10);
    ctx.fillRect(x, fenceTop, 1, 1);
  }
  // Grass, with a lighter strip along the top and a few tufts.
  const grassTop = 30;
  ctx.fillStyle = PALETTE.leaf;
  ctx.fillRect(0, grassTop, width, height - grassTop);
  ctx.fillStyle = PALETTE.mint;
  ctx.fillRect(0, grassTop, width, 1);
  for (const [x, y] of [[4, 36], [22, 44], [33, 33], [12, 41], [61, 46], [45, 46]]) {
    ctx.fillRect(x, y, 1, 1);
    ctx.fillRect(x + 2, y, 1, 1);
    ctx.fillRect(x + 1, y - 1, 1, 1);
  }
}

// What each pot looked like last frame, so changes can be shown: how many
// soil pixels are dark, which plant picture it had, and when it last grew.
interface Seen {
  plant: Sprite | null;
  stage: GardenPotView['stage'];
  crop: string | null;
  soil: number;
  soilAt: number;
  grewAt: number;
}
let seen: Seen[] = [];
let lastDrawn = 0;
// Harvested crops bouncing out of their pots.
let tossed: { x: number; crop: string; at: number }[] = [];

// The pots, their plants, and the markers.
export function drawGardenPots(ctx: CanvasRenderingContext2D, scene: GardenScene, timeMs: number): void {
  const bob = Math.floor(timeMs / 400) % 2;
  const xs = potXs(scene.pots.length);
  // Back after a while away: take things as they are, without replaying.
  if (timeMs - lastDrawn > 500) {
    seen = [];
    tossed = [];
  }
  lastDrawn = timeMs;
  scene.pots.forEach((pot, i) => {
    const left = xs[i] - POT_W / 2;
    const plant = plantSprite(pot);
    const soil = Math.round(Math.max(0, Math.min(1, pot.wet)) * SOIL_ORDER.length);
    const was = (seen[i] ??= { plant, stage: pot.stage, crop: pot.crop, soil, soilAt: timeMs, grewAt: -Infinity });
    if (was.plant !== plant) {
      if (was.stage === 'ready' && pot.stage === 'empty' && was.crop) tossed.push({ x: left, crop: was.crop, at: timeMs });
      else if (plant) was.grewAt = timeMs;
      was.plant = plant;
    }
    was.stage = pot.stage;
    was.crop = pot.crop;
    if (was.soil !== soil && timeMs - was.soilAt >= SOIL_STEP_MS) {
      was.soil += Math.sign(soil - was.soil);
      was.soilAt = timeMs;
    }

    const grew = timeMs - was.grewAt;
    if (plant) {
      // Ready plants hop a little, to say "pick me". A plant that just grew
      // jumps up and settles, in pixel steps.
      const hop = grew < POP_MS ? [2, 1, 0][Math.floor((grew / POP_MS) * 3)] : pot.stage === 'ready' ? bob : 0;
      draw(ctx, plant, left, POT_TOP - plant.length - hop, true);
      if (grew < POP_MS) sparkle(ctx, left + POT_W / 2, POT_TOP - plant.length / 2, plant.length / 2 + 2 + Math.floor(grew / 90));
    }
    draw(ctx, POT, left, POT_TOP, true);
    SOIL_ORDER.forEach((x, k) => {
      ctx.fillStyle = k < was.soil ? PALETTE.plum : PALETTE.butter;
      ctx.fillRect(left + 1 + x, POT_TOP, 1, 1);
    });
    const top = POT_TOP - (plant?.length ?? 0) - 2;
    const pouring = scene.pouring && i === scene.selected;
    if (pouring) drawCan(ctx, xs[i], top, timeMs);
    else if (pot.dry && Math.floor(timeMs / 600) % 2 === 0) draw(ctx, DROP, left + 6, top - 4, true);
    if (i === scene.selected && !pouring) draw(ctx, ARROW, left + 1, top - 4 - bob, true);
  });

  // Harvested crops: up out of the pot in a little arc, a bounce on the
  // grass, then gone.
  tossed = tossed.filter((c) => timeMs - c.at < TOSS_MS);
  for (const c of tossed) {
    const sprite = READY[c.crop];
    if (!sprite) continue;
    const k = (timeMs - c.at) / TOSS_MS;
    const steps = Math.floor(k * 10) / 10; // choppy, like the rest
    const dx = -Math.round(steps * 8);
    const dy = steps < 0.6 ? -Math.round(Math.sin((steps / 0.6) * Math.PI) * 9) : -Math.round(Math.sin(((steps - 0.6) / 0.4) * Math.PI) * 3);
    draw(ctx, sprite, c.x + dx, POT_TOP - sprite.length + dy, true);
  }
}

// Four little twinkles around a point, `r` pixels out.
function sparkle(ctx: CanvasRenderingContext2D, x: number, y: number, r: number): void {
  ctx.fillStyle = PALETTE.white;
  for (const [ox, oy] of [[-1, -1], [1, -1], [-1, 1], [1, 1]]) {
    ctx.fillRect(Math.round(x + ox * r), Math.round(y + oy * r * 0.7), 1, 1);
  }
  ctx.fillStyle = PALETTE.butter;
  ctx.fillRect(Math.round(x), Math.round(y - r), 1, 1);
}

// The watering can tipping over a pot, with drops falling from its spout
// onto the plant. `x` is the pot's middle and `top` just above the plant.
function drawCan(ctx: CanvasRenderingContext2D, x: number, top: number, timeMs: number): void {
  const flip = x > 50; // near the right edge: stand on the left, spout right
  const canX = flip ? x - 9 : x + 1;
  const canY = top - 8 + (Math.floor(timeMs / 300) % 2);
  draw(ctx, CAN, canX, canY, true, flip);
  const spoutX = flip ? canX + CAN[0].length : canX - 1;
  const fall = POT_TOP - (canY + 1);
  ctx.fillStyle = PALETTE.ocean;
  for (let k = 0; k < 3; k++) {
    const d = Math.floor(timeMs / 60 + k * (fall / 3)) % fall;
    ctx.fillRect(spoutX + (d % 2), canY + 1 + d, 1, 1);
  }
}

// Which of `count` pots a point in room pixels is on, or -1. Generous, so
// small fingers don't miss.
export function potAt(x: number, y: number, count: number): number {
  if (y < 22 || y > 47) return -1;
  return potXs(count).findIndex((cx) => Math.abs(x - cx) <= 5);
}
