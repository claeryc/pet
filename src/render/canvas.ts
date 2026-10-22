// Draws the pet's little room onto the canvas. The canvas is tiny (64x48
// "real" pixels) and CSS scales it up with crisp, blocky pixels.

import { drawBag } from './bags';
import { PALETTE } from './palette';
import { drawCurtains, drawWall } from './room';
import { frameFor } from './animations';
import { pickHatFrame, type SpriteSheet } from './sprites';
import type { FishingPhase } from '../ui/fishing';
import { drawGardenBackground, drawGardenPots, type GardenScene } from './garden';
import { drawDelivery, type DeliveryScene } from './delivery';
import { drawPlace } from './places';

export const ROOM_WIDTH = 64;
export const ROOM_HEIGHT = 48;

// Another pet drawn in the room: one sharing it with yours, or a friend
// visiting while they meet.
export interface OtherPet {
  sheet: SpriteSheet | undefined;
  hat?: SpriteSheet;
  animation: string;
  glow?: boolean; // brought back with a Revival Star
}

// What the room should look like right now.
export interface Scene {
  animation: string; // which pet animation to play
  glow?: boolean; // the pet was brought back with a Revival Star
  night: boolean; // night-time outside the window
  lightsOff: boolean; // the room is dark (pet is sleeping)
  fishing?: FishingPhase; // draws a little pond, rod and bobber while fishing
  garden?: GardenScene | null; // while gardening: the garden, with the pet on the left
  delivery?: DeliveryScene | null; // while filling Percy's order: his meadow
  // The other pet in the room, and whether yours stands on the left of it
  // (the older pet always stands on the left).
  housemate?: OtherPet | null;
  petOnLeft?: boolean;
  meeting?: (OtherPet & { hearts: boolean }) | null; // a friend over to play
  // How the room is decorated: a wallpaper id, and curtains (or none).
  room?: { wallpaper: string; curtains: string | null };
  // Nobody's home (out on a journey): no pet in the room. (Its note sits
  // in the room's corner, see src/ui/home.ts.)
  note?: boolean;
  // Looking at the current trip (tap the note): the place, with the pets
  // that went there, left to right.
  trip?: TripScene | null;
}

export interface TripScene {
  place: string; // a place id from CONFIG.journeys.places
  pets: OtherPet[];
  bag: string; // what they carry on a stick (see src/render/bags.ts)
}

export function setupCanvas(canvas: HTMLCanvasElement): CanvasRenderingContext2D {
  canvas.width = ROOM_WIDTH;
  canvas.height = ROOM_HEIGHT;
  const ctx = canvas.getContext('2d')!;
  ctx.imageSmoothingEnabled = false; // keep pixels sharp
  return ctx;
}

// The window's glass, in room pixels (its frame is one pixel bigger).
const WINDOW = { x: 6, y: 6, w: 14, h: 12 };

function drawWindow(ctx: CanvasRenderingContext2D, night: boolean, timeMs: number): void {
  const { x, y, w, h } = WINDOW;
  ctx.fillStyle = PALETTE.cocoa; // frame
  ctx.fillRect(x - 1, y - 1, w + 2, h + 2);
  ctx.fillStyle = night ? PALETTE.plum : PALETTE.sky; // sky
  ctx.fillRect(x, y, w, h);
  if (night) {
    // Moon and twinkling stars.
    // A crescent moon: a round blob with a bite taken out of its right side.
    ctx.fillStyle = PALETTE.butter;
    ctx.fillRect(x + 10, y + 1, 2, 1);
    ctx.fillRect(x + 9, y + 2, 2, 2);
    ctx.fillRect(x + 10, y + 4, 2, 1);
    const twinkle = Math.floor(timeMs / 700) % 2;
    ctx.fillStyle = PALETTE.white;
    ctx.fillRect(x + 2, y + 3 + twinkle, 1, 1);
    ctx.fillRect(x + 5, y + 8, 1, 1);
    ctx.fillRect(x + 11, y + 9 - twinkle, 1, 1);
  } else {
    // Sun and a little cloud.
    ctx.fillStyle = PALETTE.butter;
    ctx.fillRect(x + 9, y + 2, 3, 3);
    ctx.fillStyle = PALETTE.white;
    ctx.fillRect(x + 2, y + 7, 5, 2);
    ctx.fillRect(x + 3, y + 6, 2, 1);
  }
  ctx.fillStyle = PALETTE.cocoa; // cross bars
  ctx.fillRect(x + w / 2, y, 1, h);
  ctx.fillRect(x, y + h / 2, w, 1);
}

// While fishing, the pet holds a rod with the line running down out of
// the room into the pond below it (drawn in src/render/pond.ts). A "!"
// pops up when a fish bites, and the rod tip shakes while reeling in.
function drawFishing(ctx: CanvasRenderingContext2D, phase: FishingPhase, timeMs: number): void {
  const shake = phase === 'reeling' ? Math.floor(timeMs / 80) % 2 : 0;
  ctx.fillStyle = PALETTE.cocoa;
  for (let i = 0; i < 9; i++) ctx.fillRect(42 + i, 29 - i + (i > 5 ? shake : 0), 1, 1);
  if (phase === 'ready') return;
  // The line, from the rod tip straight down past the bottom of the room.
  const tipX = 51, tipY = 21 + shake;
  ctx.fillStyle = PALETTE.ink;
  ctx.fillRect(tipX, tipY, 1, ROOM_HEIGHT - tipY);
  if (phase === 'bite') {
    ctx.fillStyle = PALETTE.rose;
    ctx.fillRect(tipX + 4, tipY - 2, 2, 5);
    ctx.fillRect(tipX + 4, tipY + 4, 2, 2);
  }
}

// Where a pet stands (the left edge of its 32-pixel frame): in the middle
// on its own, or on the left or right when two share the room.
const SPOTS = { middle: 16, left: 2, right: 30 } as const;
type Spot = keyof typeof SPOTS;

// Which pet a point in room pixels (0-64 across, 0-48 down) is on or near:
// 'pet' (the one you're looking after), 'housemate' or null. Generous, so
// small fingers don't miss. `two` says whether two pets share the room.
export function petAt(x: number, y: number, two: boolean, petOnLeft: boolean): 'pet' | 'housemate' | null {
  if (y < 4 || y > 44) return null;
  if (!two) return x >= 12 && x <= ROOM_WIDTH - 12 ? 'pet' : null;
  if (x < 2 || x > ROOM_WIDTH - 2) return null;
  const onLeft = x < ROOM_WIDTH / 2;
  return onLeft === petOnLeft ? 'pet' : 'housemate';
}

export function isOnPet(x: number, y: number): boolean {
  return petAt(x, y, false, true) === 'pet';
}

// Draws one pet standing on the floor with its left edge at `x`, and its
// hat. The hat's bottom middle sits on the shape's head point, moved along
// with the head. The hat sheet's sizes go left to right, and the
// widest one that fits the head's width is used.
function drawPetAt(
  ctx: CanvasRenderingContext2D,
  sheet: SpriteSheet | undefined,
  animation: string,
  x: number,
  timeMs: number,
  hat?: SpriteSheet,
): void {
  if (!sheet) {
    // The sprite is missing (or still loading): draw a little "?" box so
    // it's obvious something needs fixing in manifest.json.
    const cx = x + 10;
    ctx.fillStyle = PALETTE.lilac;
    ctx.fillRect(cx, 22, 12, 14);
    ctx.fillStyle = PALETTE.white;
    ctx.fillRect(cx + 4, 25, 4, 1);
    ctx.fillRect(cx + 7, 26, 1, 3);
    ctx.fillRect(cx + 5, 29, 2, 1);
    ctx.fillRect(cx + 5, 32, 2, 2);
    return;
  }
  const { frameWidth: w, frameHeight: h } = sheet;
  // A pet that passed away lies still with its eyes closed, faded and
  // grey, with a little halo floating over its head.
  const passed = animation === 'passed';
  if (passed) {
    ctx.save();
    ctx.filter = 'grayscale(1)';
    ctx.globalAlpha = 0.6;
  }
  // Where it stands keeps two pets' idle moves from happening together.
  const { sx, sy, headOffset, headShift } = frameFor(sheet, passed ? 'sleep' : animation, passed ? 0 : timeMs, x);
  const dy = 40 - h;
  ctx.drawImage(sheet.image, sx, sy, w, h, x, dy, w, h);
  if (passed) {
    ctx.restore();
    const head = sheet.head ?? { x: w / 2, y: 6 };
    drawHalo(ctx, x + head.x, dy + head.y + headOffset, timeMs);
    return; // no hat
  }
  if (hat && sheet.head) {
    const { frameWidth: hw, frameHeight: hh } = hat;
    // The pet's shape can nudge this one hat, or give it a different width.
    const fit = sheet.hats?.[hat.name];
    const col = pickHatFrame(hat.hatWidths ?? [hw], fit?.width ?? sheet.head.width);
    const hx = x + sheet.head.x + (fit?.x ?? 0) + headShift - Math.floor(hw / 2);
    const hy = dy + sheet.head.y + (fit?.y ?? 0) + headOffset - hh;
    ctx.drawImage(hat.image, col * hw, 0, hw, hh, hx, hy, hw, hh);
  }
}

// A revived pet's faint star-glow: a few tiny sparkles that twinkle in
// and out around it, two at a time. `x` is the pet's left edge.
const GLOW_SPOTS = [[5, 14], [27, 18], [3, 30], [29, 31], [16, 8]];
function drawGlow(ctx: CanvasRenderingContext2D, x: number, timeMs: number): void {
  const at = Math.floor(timeMs / 450);
  ctx.fillStyle = PALETTE.butter;
  for (let i = 0; i < GLOW_SPOTS.length; i++) {
    if ((at + i * 2) % 5 > 1) continue;
    const [dx, dy] = GLOW_SPOTS[i];
    ctx.fillRect(x + dx, dy - 1, 1, 3);
    ctx.fillRect(x + dx - 1, dy, 3, 1);
  }
}

// A small golden ring, bobbing gently, its middle at (cx, just above y).
function drawHalo(ctx: CanvasRenderingContext2D, cx: number, y: number, timeMs: number): void {
  const bob = Math.floor(timeMs / 600) % 2;
  const top = y - 7 - bob;
  ctx.fillStyle = PALETTE.butter;
  ctx.fillRect(cx - 3, top, 6, 1);
  ctx.fillRect(cx - 4, top + 1, 1, 1);
  ctx.fillRect(cx + 3, top + 1, 1, 1);
  ctx.fillRect(cx - 3, top + 2, 6, 1);
}

// Little hearts floating up between two pets that are playing together.
function drawHearts(ctx: CanvasRenderingContext2D, timeMs: number): void {
  for (let i = 0; i < 3; i++) {
    const t = ((timeMs / 1400 + i / 3) % 1);
    const x = 29 + [0, 4, -3][i] + Math.round(Math.sin(t * 6 + i) * 1.5);
    const y = Math.round(26 - t * 20);
    ctx.globalAlpha = 1 - t;
    ctx.fillStyle = PALETTE.rose;
    ctx.fillRect(x, y, 1, 1);
    ctx.fillRect(x + 2, y, 1, 1);
    ctx.fillRect(x - 0, y + 1, 3, 1);
    ctx.fillRect(x + 1, y + 2, 1, 1);
  }
  ctx.globalAlpha = 1;
}

// A soft rug under the pet you're looking after, when two share the room.
function drawRug(ctx: CanvasRenderingContext2D, x: number): void {
  ctx.fillStyle = PALETTE.butter;
  ctx.fillRect(x + 6, 37, 20, 2);
  ctx.fillRect(x + 8, 39, 16, 1);
}

// Going outside and back (to the garden, or to Percy's meadow for his
// orders): the outside grows up from the bottom of the room with a grassy
// edge, like the water rising for fishing (in the garden the pet walks
// over to the left). It takes as long as the panel takes to slide in and out under the
// room (see .garden and .delivery in style.css).
const OUTSIDE_IN_MS = 700;
const OUTSIDE_OUT_MS = 450;
type Outside = { garden: GardenScene } | { delivery: DeliveryScene };
let outsideMix = 0; // 0 = the room, 1 = outside
let lastOutside: Outside | null = null; // kept while it sinks away
let lastFrameMs = 0;

const easeInOut = (t: number) => (t < 0.5 ? 2 * t * t : 1 - (-2 * t + 2) ** 2 / 2);

// Moves the swap along by one frame and returns how far along it is (0-1,
// eased) and what's outside.
function stepOutside(scene: Scene, timeMs: number): { mix: number; outside: Outside | null } {
  const dt = lastFrameMs ? Math.max(0, timeMs - lastFrameMs) : 0;
  lastFrameMs = timeMs;
  const now: Outside | null =
    scene.garden ? { garden: scene.garden } : scene.delivery ? { delivery: scene.delivery } : null;
  if (now) lastOutside = now;
  const target = now ? 1 : 0;
  const instant = typeof matchMedia !== 'undefined' && matchMedia('(prefers-reduced-motion: reduce)').matches;
  const step = instant ? 1 : dt / (target ? OUTSIDE_IN_MS : OUTSIDE_OUT_MS);
  outsideMix = target > outsideMix ? Math.min(target, outsideMix + step) : Math.max(target, outsideMix - step);
  return { mix: easeInOut(outsideMix), outside: outsideMix > 0 ? lastOutside : null };
}

// Looking at the trip and back: the place fades in over the room.
const TRIP_FADE_MS = 300;
let tripMix = 0; // 0 = the room, 1 = the place
let lastTrip: TripScene | null = null; // kept while it fades away
let lastTripFrameMs = 0;

function stepTrip(scene: Scene, timeMs: number): number {
  const dt = lastTripFrameMs ? Math.max(0, timeMs - lastTripFrameMs) : 0;
  lastTripFrameMs = timeMs;
  if (scene.trip) lastTrip = scene.trip;
  const target = scene.trip ? 1 : 0;
  const instant = typeof matchMedia !== 'undefined' && matchMedia('(prefers-reduced-motion: reduce)').matches;
  const step = instant ? 1 : dt / TRIP_FADE_MS;
  tripMix = target > tripMix ? Math.min(target, tripMix + step) : Math.max(target, tripMix - step);
  return tripMix;
}

// The place the pets went to, with them standing in it (one in the
// middle, two side by side), each with a bag on a stick behind it.
function drawTrip(ctx: CanvasRenderingContext2D, trip: TripScene, night: boolean, timeMs: number): void {
  drawPlace(ctx, trip.place, ROOM_WIDTH, ROOM_HEIGHT, night, timeMs);
  const spots: Spot[] = trip.pets.length > 1 ? ['left', 'right'] : ['middle'];
  trip.pets.slice(0, 2).forEach((p, i) => {
    drawBag(ctx, trip.bag, SPOTS[spots[i]], spots.length > 1);
    drawPetAt(ctx, p.sheet, p.animation, SPOTS[spots[i]], timeMs, p.hat);
    if (p.glow) drawGlow(ctx, SPOTS[spots[i]], timeMs);
  });
}

// Clips drawing to everything below a grassy edge `edge` pixels down.
function clipBelowGrass(ctx: CanvasRenderingContext2D, edge: number, timeMs: number): void {
  const sway = Math.floor(timeMs / 120) % 3;
  ctx.beginPath();
  for (let x = 0; x < ROOM_WIDTH; x += 2) {
    const tuft = [0, 2, 1][(x / 2 + sway) % 3];
    ctx.rect(x, Math.round(edge) - tuft, 2, ROOM_HEIGHT);
  }
  ctx.clip();
}

export function drawRoom(
  ctx: CanvasRenderingContext2D,
  sheet: SpriteSheet | undefined,
  scene: Scene,
  timeMs: number,
  hat?: SpriteSheet, // the hat's sheet, if the pet wears one
): void {
  const { mix, outside } = stepOutside(scene, timeMs);
  if (mix < 1) {
    // Wall and floor (the wall is a little bluer at night).
    drawWall(ctx, scene.room?.wallpaper ?? 'plain', scene.night, ROOM_WIDTH, 34);
    ctx.fillStyle = PALETTE.peach;
    ctx.fillRect(0, 34, ROOM_WIDTH, ROOM_HEIGHT - 34);
    ctx.fillStyle = PALETTE.butter;
    ctx.fillRect(0, 34, ROOM_WIDTH, 1);
    drawWindow(ctx, scene.night, timeMs);
    if (scene.room?.curtains) drawCurtains(ctx, scene.room.curtains, WINDOW.x, WINDOW.y, WINDOW.w, WINDOW.h);
    if (scene.fishing && scene.fishing !== 'off') drawFishing(ctx, scene.fishing, timeMs);
  }

  // The pet, centred and standing on the floor. In the garden it walks over
  // to the left as the garden grows in, to make room for the pots. Percy's
  // meadow is his alone: it grows up over the pet, who stays inside.
  const percys = !!outside && 'delivery' in outside;
  // While a friend is over to play, the two stand side by side. With two
  // pets in the room (and nothing else going on), the other one stands
  // beside yours.
  const inRoom = !outside && (!scene.fishing || scene.fishing === 'off');
  const meeting = inRoom ? scene.meeting : null;
  const housemate = inRoom && !meeting ? scene.housemate : null;
  const spot: Spot = meeting ? 'left' : housemate ? (scene.petOnLeft ? 'left' : 'right') : 'middle';
  const drawPet = (slide: number) => {
    const centre = SPOTS[spot];
    const x = Math.round(centre + (-2 - centre) * slide);
    if (housemate) {
      drawRug(ctx, x);
      const hx = SPOTS[spot === 'left' ? 'right' : 'left'];
      drawPetAt(ctx, housemate.sheet, housemate.animation, hx, timeMs, housemate.hat);
      if (housemate.glow) drawGlow(ctx, hx, timeMs);
    }
    drawPetAt(ctx, sheet, scene.animation, x, timeMs, hat);
    if (scene.glow) drawGlow(ctx, x, timeMs);
    if (meeting) {
      drawPetAt(ctx, meeting.sheet, meeting.animation, SPOTS.right, timeMs, meeting.hat);
      if (meeting.hearts) drawHearts(ctx, timeMs);
    }
  };
  if (percys && !scene.note) drawPet(0);
  if (outside) {
    // The garden or Percy's meadow, rising up from the bottom (or all of it,
    // once it's in).
    const edge = (ROOM_HEIGHT + 3) * (1 - mix);
    ctx.save();
    if (mix < 1) clipBelowGrass(ctx, edge, timeMs);
    if ('garden' in outside) {
      drawGardenBackground(ctx, ROOM_WIDTH, ROOM_HEIGHT, scene.night, timeMs);
      drawGardenPots(ctx, outside.garden, timeMs);
    } else {
      drawDelivery(ctx, ROOM_WIDTH, ROOM_HEIGHT, outside.delivery, scene.night, timeMs);
    }
    ctx.restore();
  }

  if (!percys && !scene.note) drawPet(mix);

  const trip = stepTrip(scene, timeMs);
  if (trip > 0 && lastTrip) {
    ctx.globalAlpha = trip;
    drawTrip(ctx, lastTrip, scene.night, timeMs);
    ctx.globalAlpha = 1;
  }

  // Lights off: dim the whole room.
  if (scene.lightsOff) {
    ctx.fillStyle = PALETTE.ink;
    ctx.globalAlpha = 0.45;
    ctx.fillRect(0, 0, ROOM_WIDTH, ROOM_HEIGHT);
    ctx.globalAlpha = 1;
  }
}
