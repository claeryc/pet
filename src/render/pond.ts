// The pond shown while fishing. It takes the place of the stat bars, at the
// same size, and is drawn onto its own small canvas that CSS scales up with
// crisp pixels, like the room.
//
// What's in it: water with a moving surface, the bait hanging on the line,
// dark see-through fish swimming about, and bubbles. The bait splashes as it
// goes in and out, and tugs down when a fish bites. While you reel in the
// surface churns with bigger waves and foam. A landed fish leaves with a
// splash; one that got off the hook darts away. The fish, bubbles and foam
// each pick one of a few small sprites at random, so it never looks quite
// the same twice.

import { PALETTE } from './palette';
import type { FishingPhase } from '../ui/fishing';

// The pond is always this many pixels wide; its height follows the shape
// of the space it fills.
export const POND_WIDTH = 96;

// Little sprites drawn from text grids: "." is see-through, any other
// letter is a pixel in the colour the sprite is drawn with.
export type Sprite = string[];

// Fish shadows (facing right; flipped when swimming left).
const FISH: Sprite[] = [
  ['k.kkkk.', '.kkkkkk', 'k.kkkk.'],
  ['k...kkkk..', 'kk.kkkkkkk', 'kkkkkkkkk.', 'k...kkk...'],
  ['.......kk....', 'k...kkkkkkk..', 'kk.kkkkkkkkkk', 'k...kkkkkkkk.', '.....kk......'],
];
export const BUBBLES: Sprite[] = [['w'], ['.w.', 'w.w', '.w.'], ['.ww.', 'w..w', 'w..w', '.ww.']];
export const FOAM: Sprite[] = [
  ['w.w', '.w.'],
  ['.ww.', 'wwww', '.w..'],
  ['w..w.', '.www.', 'ww.ww'],
  ['.w', 'ww'],
];
// The bait: a little pink worm on a hook.
const BAIT: Sprite = ['..k..', '.ppk.', 'pp.k.', '.ppp.', '..pp.', 'k.pk.', '.kk..'];

export function drawSprite(
  ctx: CanvasRenderingContext2D,
  sprite: Sprite,
  x: number,
  y: number,
  colors: Record<string, string>,
  flip = false,
): void {
  const w = sprite[0].length;
  sprite.forEach((row, sy) => {
    for (let sx = 0; sx < w; sx++) {
      const color = colors[row[sx]];
      if (!color) continue;
      ctx.fillStyle = color;
      ctx.fillRect(Math.round(x) + (flip ? w - 1 - sx : sx), Math.round(y) + sy, 1, 1);
    }
  });
}

export const rand = (min: number, max: number) => min + Math.random() * (max - min);
export const pick = <T>(list: T[]): T => list[Math.floor(Math.random() * list.length)];

interface Fish {
  sprite: Sprite;
  x: number;
  y: number;
  vx: number;
  turnIn: number; // seconds until it may change its mind
}
interface Bubble {
  sprite: Sprite;
  x: number;
  y: number;
  vy: number;
  phase: number; // for the side-to-side wobble
}
interface Foam {
  sprite: Sprite;
  x: number;
  y: number;
  life: number; // seconds left
}
// Rings spreading out along the surface from a splash.
interface Ripple {
  x: number;
  age: number; // seconds
}
// The splash crown that jumps up from the surface for a moment.
const CROWN: Sprite[] = [
  ['w...w', '.w.w.'],
  ['w.....w', '.w.w.w.', '..w.w..'],
];
const RIPPLE_SECONDS = 0.7;

export interface Pond {
  canvas: HTMLCanvasElement;
  resize: () => void; // call after the pond's on-screen size changes
  draw: (phase: FishingPhase, timeMs: number) => void;
  landed: (caught: boolean) => void; // the catch is over: the fish leaves, one way or the other
  baitAt: () => { x: number; y: number }; // where the bait is, as shares of the pond's size
}

export function createPond(): Pond {
  const canvas = document.createElement('canvas');
  canvas.className = 'pond-canvas';
  const ctx = canvas.getContext('2d')!;
  let W = POND_WIDTH;
  let H = 36;
  const SURFACE = 3; // the water's surface line

  let fish: Fish[] = [];
  const bubbles: Bubble[] = [];
  const foam: Foam[] = [];
  let lastMs = 0;
  let bubbleIn = 0;
  let foamIn = 0;
  let bait = { x: 0, y: 0 }; // where the bait hangs (moves when sinking or reeling)
  let biter: Fish | null = null; // the fish going for the bait
  let letGo = false; // the catch is over, though the bar is still showing
  let tug = 0; // how far a biting fish pulls the bait down
  const ripples: Ripple[] = [];
  let crown = { x: 0, life: 0 };

  function newFish(sprite: Sprite): Fish {
    const vx = rand(4, 9) * (Math.random() < 0.5 ? -1 : 1);
    return {
      sprite,
      x: rand(0, W - sprite[0].length),
      y: rand(SURFACE + 5, H - sprite.length - 2),
      vx,
      turnIn: rand(2, 5),
    };
  }

  function resize(): void {
    const rect = canvas.getBoundingClientRect();
    W = POND_WIDTH;
    H = rect.width > 0 ? Math.max(24, Math.round((POND_WIDTH * rect.height) / rect.width)) : 36;
    canvas.width = W;
    canvas.height = H;
    ctx.imageSmoothingEnabled = false;
    // A few fish of mixed sizes, at random spots.
    fish = [pick(FISH), pick(FISH), FISH[0], FISH[1]].map(newFish);
    bubbles.length = 0;
    foam.length = 0;
    bait = { x: Math.round(W * 0.62), y: SURFACE - 6 };
    biter = null;
  }

  function spawnBubble(x: number, y: number): void {
    bubbles.push({ sprite: pick(BUBBLES), x, y, vy: rand(6, 14), phase: rand(0, 6) });
  }

  function spawnFoam(x: number): void {
    const sprite = pick(FOAM);
    foam.push({ sprite, x: x - sprite[0].length / 2, y: SURFACE - 1 + rand(-1, 2), life: rand(0.3, 0.8) });
  }

  // A splash where the bait meets the water: a crown of drops, rings
  // spreading out and a puff of foam.
  function splash(x: number): void {
    crown = { x, life: 0.22 };
    ripples.push({ x, age: 0 });
    for (let i = 0; i < 4; i++) spawnFoam(x + rand(-6, 6));
    for (let i = 0; i < 3; i++) spawnBubble(x + rand(-3, 4), SURFACE + rand(3, 7));
  }

  function update(phase: FishingPhase, dt: number, t: number): void {
    if (phase !== 'reeling') letGo = false;
    const reeling = phase === 'reeling' && !letGo;
    const biting = phase === 'bite';

    // The bait sinks to about halfway down once cast, and comes back up
    // out of the water when the line is in. It splashes going in and out.
    const targetY = phase === 'ready' ? -10 : Math.round(H * 0.45);
    const wasY = bait.y;
    bait.y += Math.sign(targetY - bait.y) * Math.min(Math.abs(targetY - bait.y), 14 * dt);
    if ((wasY < SURFACE) !== (bait.y < SURFACE)) splash(bait.x + 2);
    const jerk = biting || reeling ? Math.round(Math.sin(t / 60)) : 0;
    // A bite tugs the bait down in sharp little pulls.
    tug = biting ? [3, 3, 1, 0][Math.floor(t / 110) % 4] : 0;

    // Pick a fish to go for the bait once it's in the water.
    if (phase === 'waiting' || biting || reeling) biter ??= pick(fish);
    else biter = null;

    for (const f of fish) {
      const fw = f.sprite[0].length;
      if (f === biter) {
        // Swim to the bait, head first. Slowly while waiting, then right up
        // to it when it bites, and thrash about while reeled in.
        const facingRight = f.x + fw / 2 < bait.x;
        const goalX = facingRight ? bait.x - fw + 2 : bait.x + 3;
        const goalY = bait.y + 2 - Math.floor(f.sprite.length / 2);
        const speed = phase === 'waiting' ? 0.6 : 6;
        f.x += (goalX - f.x) * Math.min(1, speed * dt);
        f.y += (goalY - f.y) * Math.min(1, speed * dt);
        f.vx = Math.abs(f.vx) * (facingRight ? 1 : -1);
        if (reeling) {
          f.x += rand(-1, 1);
          f.y += rand(-0.7, 0.7);
        }
        continue;
      }
      // Everyone else wanders, turning now and then or at the edges. One
      // that got off the hook darts away, then slows down again.
      f.x += f.vx * dt * (reeling ? 1.6 : 1); // the splashing spooks them
      if (Math.abs(f.vx) > 9) f.vx *= 1 - Math.min(1, dt * 1.5);
      f.turnIn -= dt;
      if (f.turnIn <= 0) {
        f.turnIn = rand(2, 5);
        if (Math.random() < 0.4) f.vx = -f.vx;
        f.y = Math.min(H - f.sprite.length - 2, Math.max(SURFACE + 5, f.y + rand(-3, 3)));
      }
      if (f.x < -fw) f.vx = Math.abs(f.vx);
      if (f.x > W) f.vx = -Math.abs(f.vx);
    }

    // Bubbles: a few drift up from the fish all the time, a burst at a
    // bite, and lots while reeling.
    bubbleIn -= dt;
    if (bubbleIn <= 0) {
      bubbleIn = reeling ? rand(0.04, 0.12) : biting ? rand(0.08, 0.2) : rand(0.5, 1.2);
      const near = (biting || reeling) && biter ? bait : null;
      const from = near ?? pick(fish);
      spawnBubble((near ? near.x : from.x) + rand(-3, 6), from.y + rand(0, 3));
    }
    for (let i = bubbles.length - 1; i >= 0; i--) {
      const b = bubbles[i];
      b.y -= b.vy * dt;
      b.phase += dt * 5;
      if (b.y <= SURFACE) {
        bubbles.splice(i, 1);
        if (Math.random() < 0.5) spawnFoam(b.x); // pops into a little foam
      }
    }

    // Foam around the line while reeling.
    foamIn -= dt;
    if (reeling && foamIn <= 0) {
      foamIn = rand(0.03, 0.09);
      spawnFoam(bait.x + rand(-12, 12) + jerk);
    }
    for (let i = foam.length - 1; i >= 0; i--) {
      foam[i].life -= dt;
      if (foam[i].life <= 0) foam.splice(i, 1);
    }
    for (let i = ripples.length - 1; i >= 0; i--) {
      ripples[i].age += dt;
      if (ripples[i].age >= RIPPLE_SECONDS) ripples.splice(i, 1);
    }
    crown.life -= dt;
    bait.x = Math.round(W * 0.62) + jerk;
  }

  function drawWater(phase: FishingPhase, t: number): void {
    // Light water near the top, deep water lower down, with a checker
    // pattern where they meet (pixel-art shading).
    const shallow = Math.round(H * 0.4);
    ctx.fillStyle = PALETTE.sky;
    ctx.fillRect(0, 0, W, H);
    ctx.fillStyle = PALETTE.ocean;
    ctx.fillRect(0, shallow + 3, W, H - shallow - 3);
    const shade = [(n: number) => n % 4 === 0, (n: number) => n % 2 === 0, (n: number) => n % 4 !== 0];
    shade.forEach((dark, k) => {
      for (let x = 0; x < W; x++) if (dark(x + k)) ctx.fillRect(x, shallow + k, 1, 1);
    });
    // Light rays that slowly drift in the shallow part.
    ctx.fillStyle = PALETTE.white;
    ctx.globalAlpha = 0.18;
    for (let i = 0; i < 3; i++) {
      const x0 = ((i * 37 + t / 250) % (W + 20)) - 10;
      for (let y = SURFACE; y < shallow; y++) ctx.fillRect(Math.round(x0 + (y - SURFACE) / 2), y, 3, 1);
    }
    ctx.globalAlpha = 1;

    // The surface: a white wavy line. It gets choppier near the line
    // while reeling in.
    const reeling = phase === 'reeling';
    for (let x = 0; x < W; x++) {
      const near = reeling ? Math.max(0, 1 - Math.abs(x - bait.x) / 24) : 0;
      const amp = 0.6 + near * 2;
      const y = SURFACE + Math.round(Math.sin(x / 4 + t / 400) * amp + (reeling ? Math.sin(x / 2 - t / 90) * near : 0));
      ctx.fillStyle = PALETTE.white;
      ctx.fillRect(x, y - 1, 1, 1);
      ctx.fillStyle = PALETTE.lavender;
      ctx.fillRect(x, y, 1, 1);
    }
  }

  function draw(phase: FishingPhase, timeMs: number): void {
    const dt = lastMs ? Math.min(0.1, (timeMs - lastMs) / 1000) : 0;
    lastMs = timeMs;
    update(phase, dt, timeMs);
    drawWater(phase, timeMs);

    // Fish shadows: dark and see-through, as if deep under the water.
    ctx.globalAlpha = 0.35;
    for (const f of fish) drawSprite(ctx, f.sprite, f.x, f.y, { k: PALETTE.ink }, f.vx < 0);
    ctx.globalAlpha = 1;

    // The line comes in from above, down to the bait.
    if (bait.y > -7) {
      const y = bait.y + tug;
      ctx.fillStyle = PALETTE.ink;
      ctx.fillRect(bait.x + 2, 0, 1, Math.max(0, Math.round(y)));
      drawSprite(ctx, BAIT, bait.x, y, { k: PALETTE.ink, p: PALETTE.pink });
    }

    // Splashes: rings running out along the surface in pixel steps, and
    // the crown of drops for a moment.
    ctx.fillStyle = PALETTE.white;
    for (const r of ripples) {
      const reach = 2 + Math.floor((r.age / RIPPLE_SECONDS) * 5) * 2;
      for (const side of [-1, 1]) {
        ctx.fillRect(Math.round(r.x + side * reach), SURFACE, 2, 1);
        if (reach > 4) ctx.fillRect(Math.round(r.x + side * (reach - 4)), SURFACE + 1, 1, 1);
      }
    }
    if (crown.life > 0) {
      const sprite = CROWN[crown.life > 0.11 ? 0 : 1];
      drawSprite(ctx, sprite, crown.x - Math.floor(sprite[0].length / 2), SURFACE - 2, { w: PALETTE.white });
    }

    ctx.globalAlpha = 0.85;
    for (const b of bubbles) {
      drawSprite(ctx, b.sprite, b.x + Math.round(Math.sin(b.phase)), b.y, { w: PALETTE.white });
    }
    ctx.globalAlpha = 1;
    for (const f of foam) drawSprite(ctx, f.sprite, f.x, f.y, { w: PALETTE.white });

    // A bite: little rings around the bait.
    if (phase === 'bite' && Math.floor(timeMs / 180) % 2 === 0) {
      const y = bait.y + tug;
      ctx.fillStyle = PALETTE.white;
      ctx.fillRect(bait.x - 3, y + 2, 1, 1);
      ctx.fillRect(bait.x + 5, y + 1, 1, 1);
      ctx.fillRect(bait.x + 1, y - 3, 1, 1);
    }
  }

  function landed(caught: boolean): void {
    letGo = true;
    const f = biter;
    biter = null;
    if (!f) return;
    if (caught) {
      // Out of the water it goes; a new fish swims in from the side later.
      splash(bait.x + 2);
      fish.splice(fish.indexOf(f), 1);
      const next = newFish(f.sprite);
      next.x = Math.random() < 0.5 ? -next.sprite[0].length - 20 : W + 20;
      next.vx = next.x < 0 ? Math.abs(next.vx) : -Math.abs(next.vx);
      fish.push(next);
    } else {
      // Off the hook: it darts away.
      f.vx = f.x + f.sprite[0].length / 2 < bait.x ? -40 : 40;
      f.turnIn = 3;
    }
  }

  return {
    canvas,
    resize,
    draw,
    landed,
    baitAt: () => ({ x: (bait.x + 2) / W, y: Math.max(0, bait.y + 3) / H }),
  };
}

// The fizzy edge of the water while it rises over the stat bars (and while
// it drains away): bubbles bob up from the surface and pop, with foam caps
// along it. Drawn on a thin strip of its own that sits on top of the pond.
export const FROTH_HEIGHT = 14;

export interface Froth {
  canvas: HTMLCanvasElement;
  draw: (timeMs: number) => void;
}

export function createFroth(): Froth {
  const canvas = document.createElement('canvas');
  canvas.className = 'pond-froth';
  canvas.width = POND_WIDTH;
  canvas.height = FROTH_HEIGHT;
  const ctx = canvas.getContext('2d')!;
  const bottom = FROTH_HEIGHT - 1; // the water's surface
  const bubbles: Bubble[] = [];
  const caps: Foam[] = [];
  let lastMs = 0;

  function draw(timeMs: number): void {
    const dt = lastMs ? Math.min(0.1, (timeMs - lastMs) / 1000) : 0;
    lastMs = timeMs;

    // Lots of bubbles all along the surface, each popping a little way up.
    const spawn = Math.round(dt * 120) || (Math.random() < 0.5 ? 1 : 0);
    for (let i = 0; i < spawn; i++) {
      bubbles.push({ sprite: pick(BUBBLES), x: rand(-2, POND_WIDTH), y: bottom - 2, vy: rand(8, 22), phase: rand(0, 6) });
    }
    if (Math.random() < dt * 30) {
      const sprite = pick(FOAM);
      caps.push({ sprite, x: rand(-3, POND_WIDTH), y: bottom - sprite.length + 1, life: rand(0.15, 0.4) });
    }
    for (let i = bubbles.length - 1; i >= 0; i--) {
      const b = bubbles[i];
      b.y -= b.vy * dt;
      b.phase += dt * 6;
      if (b.y < rand(-2, 4)) bubbles.splice(i, 1); // pop
    }
    for (let i = caps.length - 1; i >= 0; i--) {
      caps[i].life -= dt;
      if (caps[i].life <= 0) caps.splice(i, 1);
    }

    ctx.clearRect(0, 0, POND_WIDTH, FROTH_HEIGHT);
    // A white foamy line hugging the surface.
    ctx.fillStyle = PALETTE.white;
    for (let x = 0; x < POND_WIDTH; x++) {
      if (Math.sin(x * 1.7 + timeMs / 70) > -0.3) ctx.fillRect(x, bottom, 1, 1);
    }
    // Foam caps: white with a light blue shadow so they show against the
    // cream stat panel behind them.
    for (const c of caps) {
      drawSprite(ctx, c.sprite, c.x, c.y + 1, { w: PALETTE.sky });
      drawSprite(ctx, c.sprite, c.x, c.y, { w: PALETTE.white });
    }
    // Bubbles: blue rings with a white glint.
    for (const b of bubbles) {
      const x = b.x + Math.round(Math.sin(b.phase));
      drawSprite(ctx, b.sprite, x, b.y, { w: PALETTE.sky });
      if (b.sprite.length > 1) drawSprite(ctx, ['w'], x + 1, b.y + 1, { w: PALETTE.white });
    }
  }

  return { canvas, draw };
}
