// Toys in the room (see src/ui/toys.ts): the ball, the feather on its
// wand, soap bubbles and the star kite, drawn in room pixels. Placeholder
// pixel art, in the room's own palette.

import { PALETTE } from './palette';

export type ToyThingKind = 'ball' | 'feather' | 'bubble' | 'kite';

// One thing to draw, its middle at (x, y) in room pixels. `pop` (0 to 1)
// is a bubble bursting.
export interface ToyThing {
  kind: ToyThingKind;
  x: number;
  y: number;
  pop?: number;
}

export interface ToyScene {
  things: ToyThing[];
  // A string or stick from (x1, y1) to the thing: the wand's stick, the
  // kite's string.
  line?: { x1: number; y1: number; x2: number; y2: number; kind: 'stick' | 'string' };
  petDx: number; // how far the pet has run from its spot (room pixels)
  hop: boolean; // the pet is hopping (chasing, pouncing)
  shadowX?: number; // the ball's shadow on the floor, while it flies
}

const C: Record<string, string> = {
  k: PALETTE.ink,
  w: PALETTE.white,
  r: PALETTE.rose,
  p: PALETTE.pink,
  y: PALETTE.butter,
  s: PALETTE.sky,
  b: PALETTE.ocean,
};

const ART: Record<ToyThingKind, string[]> = {
  ball: ['.kkk.', 'kwrrk', 'kyyyk', 'krrrk', '.kkk.'],
  feather: ['.kk.', 'kppk', 'kpwk', 'kppk', 'kppk', '.kk.'],
  bubble: ['.ss.', 'sw.s', 's..s', '.ss.'],
  kite: ['..k..', '.kyk.', 'kyyyk', '.kyk.', '.k.k.'],
};

function drawArt(ctx: CanvasRenderingContext2D, rows: string[], x: number, y: number): void {
  const w = rows[0].length;
  const h = rows.length;
  const left = Math.round(x - w / 2);
  const top = Math.round(y - h / 2);
  rows.forEach((row, j) => {
    [...row].forEach((ch, i) => {
      const colour = C[ch];
      if (!colour) return;
      ctx.fillStyle = colour;
      ctx.fillRect(left + i, top + j, 1, 1);
    });
  });
}

// A line of single pixels from one point to another.
function drawLine(ctx: CanvasRenderingContext2D, x1: number, y1: number, x2: number, y2: number, colour: string, every = 1): void {
  const steps = Math.max(1, Math.round(Math.max(Math.abs(x2 - x1), Math.abs(y2 - y1))));
  ctx.fillStyle = colour;
  for (let i = 0; i <= steps; i += every) {
    const t = i / steps;
    ctx.fillRect(Math.round(x1 + (x2 - x1) * t), Math.round(y1 + (y2 - y1) * t), 1, 1);
  }
}

export function drawToys(ctx: CanvasRenderingContext2D, toy: ToyScene): void {
  if (toy.shadowX !== undefined) {
    ctx.fillStyle = 'rgba(43, 33, 64, 0.18)';
    ctx.fillRect(Math.round(toy.shadowX) - 2, 40, 5, 1);
  }
  if (toy.line) {
    const { x1, y1, x2, y2, kind } = toy.line;
    if (kind === 'stick') drawLine(ctx, x1, y1, x2, y2, PALETTE.cocoa);
    else drawLine(ctx, x1, y1, x2, y2, PALETTE.rose, 2);
  }
  for (const t of toy.things) {
    if (t.kind === 'bubble' && t.pop !== undefined) {
      // A burst: four sparkles flying out.
      const d = 1 + Math.round(t.pop * 3);
      ctx.fillStyle = PALETTE.sky;
      ctx.globalAlpha = 1 - t.pop;
      for (const [dx, dy] of [[-d, 0], [d, 0], [0, -d], [0, d]]) ctx.fillRect(Math.round(t.x + dx), Math.round(t.y + dy), 1, 1);
      ctx.globalAlpha = 1;
      continue;
    }
    drawArt(ctx, ART[t.kind], t.x, t.y);
  }
}
