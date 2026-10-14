// Sprites are described the same way real art will be: a sprite sheet image
// plus a manifest that says how big each frame is and which row holds which
// animation. Until real PNGs exist, we *draw* a placeholder sheet in code.
// Swapping to real art later means loading a PNG + manifest instead of
// calling makePlaceholderSheet(), with no changes to the rest of the game.

import { PALETTE } from './palette';

export const FRAME_SIZE = 32;

export interface SpriteManifest {
  frameWidth: number;
  frameHeight: number;
  // Each animation is one row of the sheet with `frames` frames in it.
  animations: Record<string, { row: number; frames: number; frameMs: number }>;
}

export interface SpriteSheet {
  image: CanvasImageSource;
  manifest: SpriteManifest;
}

export const PLACEHOLDER_MANIFEST: SpriteManifest = {
  frameWidth: FRAME_SIZE,
  frameHeight: FRAME_SIZE,
  animations: {
    idle: { row: 0, frames: 4, frameMs: 220 },
    sad: { row: 1, frames: 4, frameMs: 400 },
  },
};

// Draws one frame of the blob pet into a 32x32 cell at (ox, oy).
// `bounce` lifts the body up, `squash` makes it wider and shorter.
function drawBlob(
  ctx: CanvasRenderingContext2D,
  ox: number,
  oy: number,
  bounce: number,
  squash: number,
  sad: boolean,
): void {
  const px = (x: number, y: number, w: number, h: number, color: string) => {
    ctx.fillStyle = color;
    ctx.fillRect(ox + x, oy + y, w, h);
  };

  // Body: a rounded blob built from rows of pixels (no anti-aliasing).
  const bodyWidth = 20 + squash * 2;
  const bodyHeight = 16 - squash;
  const left = Math.round((FRAME_SIZE - bodyWidth) / 2);
  const bottom = 28 - bounce;
  const top = bottom - bodyHeight;
  const body = sad ? PALETTE.lavender : PALETTE.pink;
  const shade = sad ? PALETTE.lilac : PALETTE.rose;

  for (let y = top; y < bottom; y++) {
    // Trim the corners to make the shape round.
    const fromTop = y - top;
    const fromBottom = bottom - 1 - y;
    let inset = 0;
    if (fromTop === 0) inset = 4;
    else if (fromTop === 1) inset = 2;
    else if (fromTop === 2) inset = 1;
    if (fromBottom === 0) inset = Math.max(inset, 2);
    else if (fromBottom === 1) inset = Math.max(inset, 1);
    px(left + inset, y, bodyWidth - inset * 2, 1, fromBottom <= 1 ? shade : body);
  }

  // Little ears on top.
  px(left + 3, top - 2, 2, 2, body);
  px(left + bodyWidth - 5, top - 2, 2, 2, body);

  // Eyes.
  const eyeY = top + Math.floor(bodyHeight / 2) - 2;
  const eyeL = left + 5;
  const eyeR = left + bodyWidth - 7;
  if (sad) {
    // Droopy eyes and a tear.
    px(eyeL, eyeY + 1, 2, 1, PALETTE.ink);
    px(eyeR, eyeY + 1, 2, 1, PALETTE.ink);
    px(eyeL, eyeY + 3, 1, 2, PALETTE.sky);
  } else {
    px(eyeL, eyeY, 2, 2, PALETTE.ink);
    px(eyeR, eyeY, 2, 2, PALETTE.ink);
    px(eyeL, eyeY, 1, 1, PALETTE.white); // sparkle
    px(eyeR, eyeY, 1, 1, PALETTE.white);
  }

  // Cheeks.
  px(eyeL - 2, eyeY + 2, 2, 1, PALETTE.blush);
  px(eyeR + 2, eyeY + 2, 2, 1, PALETTE.blush);

  // Mouth.
  const mouthX = Math.floor(FRAME_SIZE / 2) - 1;
  if (sad) px(mouthX, eyeY + 4, 2, 1, PALETTE.ink);
  else {
    px(mouthX - 1, eyeY + 3, 1, 1, PALETTE.ink);
    px(mouthX, eyeY + 4, 2, 1, PALETTE.ink);
    px(mouthX + 2, eyeY + 3, 1, 1, PALETTE.ink);
  }

  // Shadow on the floor (stays put while the body bounces).
  px(left + 2, 29, bodyWidth - 4, 1, PALETTE.lavender);
}

// Builds the placeholder sprite sheet: one row per animation.
export function makePlaceholderSheet(): SpriteSheet {
  const m = PLACEHOLDER_MANIFEST;
  const rows = Object.keys(m.animations).length;
  const maxFrames = Math.max(...Object.values(m.animations).map((a) => a.frames));

  const canvas = document.createElement('canvas');
  canvas.width = m.frameWidth * maxFrames;
  canvas.height = m.frameHeight * rows;
  const ctx = canvas.getContext('2d')!;

  // Idle: a happy bounce. Each entry is [bounce, squash] for one frame.
  const idleFrames: [number, number][] = [[0, 1], [2, 0], [3, 0], [1, 0]];
  idleFrames.forEach(([b, s], i) => drawBlob(ctx, i * FRAME_SIZE, 0, b, s, false));

  // Sad: a slow, small sway.
  const sadFrames: [number, number][] = [[0, 1], [0, 1], [1, 0], [0, 1]];
  sadFrames.forEach(([b, s], i) => drawBlob(ctx, i * FRAME_SIZE, FRAME_SIZE, b, s, true));

  return { image: canvas, manifest: m };
}
