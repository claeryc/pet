// The fizz on the bath panel's two bars (src/ui/bath.ts), drawn like the
// froth on the fishing pond: pixel bubbles pop up off the suds bar while
// you scrub, and drops of water flick off the drying bar while the dryer
// works. A full bar gives one last burst.
//
// One small canvas lies over both bars, a little taller so the bubbles
// have room to rise. Its pixels are FX_PX screen pixels each.

import { PALETTE } from './palette';
import { BUBBLES, FOAM, drawSprite, pick, rand, type Sprite } from './pond';

export const FX_PX = 3;
// Room above the top bar for bubbles to rise into, in canvas pixels.
export const FX_HEADROOM = 5;

// Where a bar is on the canvas (canvas pixels), how full it is (0-1) and
// whether it's moving right now.
export interface FxBar {
  x: number;
  y: number;
  w: number;
  h: number;
  level: number;
  active: boolean;
}

interface Bubble { sprite: Sprite; x: number; y: number; vy: number; phase: number; top: number }
interface Cap { sprite: Sprite; x: number; y: number; life: number }
interface Drop { x: number; y: number; vx: number; vy: number; life: number }

const DROP: Sprite = ['b', 'b'];
const GRAVITY = 70; // canvas pixels a second, a second

export interface BathFx {
  canvas: HTMLCanvasElement;
  draw: (timeMs: number, suds: FxBar, dry: FxBar) => void;
  burst: (which: 'suds' | 'dry') => void; // a bar just filled up
  clear: () => void;
}

export function createBathFx(): BathFx {
  const canvas = document.createElement('canvas');
  canvas.className = 'bath-fx';
  canvas.setAttribute('aria-hidden', 'true');
  const ctx = canvas.getContext('2d')!;
  let bubbles: Bubble[] = [];
  let caps: Cap[] = [];
  let drops: Drop[] = [];
  let bursts: ('suds' | 'dry')[] = [];
  let lastMs = 0;

  // Bubbles from the filled part of the suds bar, popping a little way up.
  function addBubbles(bar: FxBar, n: number, wide = false): void {
    const end = bar.x + Math.max(2, bar.w * (wide ? 1 : bar.level));
    for (let i = 0; i < n; i++) {
      const x = wide ? rand(bar.x, end) : rand(Math.max(bar.x, end - 14), end);
      bubbles.push({ sprite: pick(BUBBLES), x, y: bar.y - 1, vy: rand(10, 24), phase: rand(0, 6), top: rand(0, bar.y - 3) });
    }
  }
  // Drops flicking up and back off the leading edge of the drying bar.
  function addDrops(bar: FxBar, n: number, wide = false): void {
    const edge = bar.x + bar.w * bar.level;
    for (let i = 0; i < n; i++) {
      const x = wide ? rand(bar.x, bar.x + bar.w) : edge + rand(-1, 2);
      drops.push({ x, y: bar.y + rand(0, bar.h / 2), vx: rand(4, 16), vy: -rand(14, 30), life: rand(0.4, 0.8) });
    }
  }

  return {
    canvas,
    burst: (which) => bursts.push(which),
    clear() {
      bubbles = [];
      caps = [];
      drops = [];
      bursts = [];
      ctx.clearRect(0, 0, canvas.width, canvas.height);
    },
    draw(timeMs, suds, dry) {
      const dt = lastMs ? Math.min(0.1, (timeMs - lastMs) / 1000) : 0;
      lastMs = timeMs;
      for (const b of bursts) {
        if (b === 'suds') addBubbles(suds, 26, true);
        else addDrops(dry, 18, true);
      }
      bursts = [];
      if (suds.active) {
        addBubbles(suds, Math.round(dt * 40) || (Math.random() < 0.4 ? 1 : 0));
        if (Math.random() < dt * 14) {
          const sprite = pick(FOAM);
          const end = suds.x + suds.w * suds.level;
          caps.push({ sprite, x: rand(Math.max(suds.x, end - 10), end - 2), y: suds.y - sprite.length + 1, life: rand(0.15, 0.35) });
        }
      }
      if (dry.active && Math.random() < dt * 18) addDrops(dry, 1);

      for (let i = bubbles.length - 1; i >= 0; i--) {
        const b = bubbles[i];
        b.y -= b.vy * dt;
        b.phase += dt * 6;
        if (b.y < b.top) bubbles.splice(i, 1); // pop
      }
      for (let i = caps.length - 1; i >= 0; i--) if ((caps[i].life -= dt) <= 0) caps.splice(i, 1);
      for (let i = drops.length - 1; i >= 0; i--) {
        const d = drops[i];
        d.vy += GRAVITY * dt;
        d.x += d.vx * dt;
        d.y += d.vy * dt;
        if ((d.life -= dt) <= 0 || d.y > canvas.height) drops.splice(i, 1);
      }

      ctx.clearRect(0, 0, canvas.width, canvas.height);
      // A fizzy white line along the top of the suds while you scrub.
      if (suds.active) {
        ctx.fillStyle = PALETTE.white;
        const end = Math.round(suds.x + suds.w * suds.level);
        for (let x = Math.round(suds.x) + 2; x < end - 1; x++) {
          if (Math.sin(x * 1.7 + timeMs / 70) > -0.2) ctx.fillRect(x, Math.round(suds.y) + 1, 1, 1);
        }
      }
      for (const c of caps) {
        drawSprite(ctx, c.sprite, c.x, c.y + 1, { w: PALETTE.sky });
        drawSprite(ctx, c.sprite, c.x, c.y, { w: PALETTE.white });
      }
      for (const b of bubbles) {
        const x = b.x + Math.round(Math.sin(b.phase));
        drawSprite(ctx, b.sprite, x, b.y, { w: PALETTE.sky });
        if (b.sprite.length > 1) drawSprite(ctx, ['w'], x + 1, b.y + 1, { w: PALETTE.white });
      }
      for (const d of drops) drawSprite(ctx, DROP, d.x, d.y, { b: PALETTE.ocean });
    },
  };
}
