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
    sleep: { row: 2, frames: 4, frameMs: 600 },
    sick: { row: 3, frames: 4, frameMs: 350 },
  },
};

type Face = 'happy' | 'sad' | 'sleep' | 'sick';

// Body colours for each face: [main colour, darker shade].
const BODY_COLORS: Record<Face, [string, string]> = {
  happy: [PALETTE.pink, PALETTE.rose],
  sad: [PALETTE.lavender, PALETTE.lilac],
  sleep: [PALETTE.pink, PALETTE.rose],
  sick: [PALETTE.mint, PALETTE.leaf],
};

// Draws one frame of the blob pet into a 32x32 cell at (ox, oy).
// `bounce` lifts the body up, `squash` makes it wider and shorter, and
// `extra` is a per-frame number used for small details like floating Zs.
function drawBlob(
  ctx: CanvasRenderingContext2D,
  ox: number,
  oy: number,
  bounce: number,
  squash: number,
  face: Face,
  extra = 0,
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
  const [body, shade] = BODY_COLORS[face];

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
  const mouthX = Math.floor(FRAME_SIZE / 2) - 1;

  if (face === 'happy') {
    px(eyeL, eyeY, 2, 2, PALETTE.ink);
    px(eyeR, eyeY, 2, 2, PALETTE.ink);
    px(eyeL, eyeY, 1, 1, PALETTE.white); // sparkle
    px(eyeR, eyeY, 1, 1, PALETTE.white);
    px(mouthX - 1, eyeY + 3, 1, 1, PALETTE.ink); // smile
    px(mouthX, eyeY + 4, 2, 1, PALETTE.ink);
    px(mouthX + 2, eyeY + 3, 1, 1, PALETTE.ink);
  } else if (face === 'sad') {
    px(eyeL, eyeY + 1, 2, 1, PALETTE.ink); // droopy eyes
    px(eyeR, eyeY + 1, 2, 1, PALETTE.ink);
    px(eyeL, eyeY + 3, 1, 2, PALETTE.sky); // a tear
    px(mouthX, eyeY + 4, 2, 1, PALETTE.ink);
  } else if (face === 'sleep') {
    px(eyeL - 1, eyeY + 1, 3, 1, PALETTE.ink); // closed eyes
    px(eyeR, eyeY + 1, 3, 1, PALETTE.ink);
    px(mouthX, eyeY + 4, 2, 1, PALETTE.plum);
    // Little Zs that float up and drift over the frames.
    const zx = left + bodyWidth - 1;
    const zy = top - 4 - extra;
    px(zx, zy, 4, 1, PALETTE.white);
    px(zx + 2, zy + 1, 1, 1, PALETTE.white);
    px(zx + 1, zy + 2, 1, 1, PALETTE.white);
    px(zx, zy + 3, 4, 1, PALETTE.white);
  } else {
    // Sick: swirly X eyes and a wobbly mouth.
    for (const ex of [eyeL, eyeR]) {
      px(ex, eyeY, 1, 1, PALETTE.ink);
      px(ex + 1, eyeY + 1, 1, 1, PALETTE.ink);
      px(ex + 1, eyeY, 1, 1, PALETTE.ink);
      px(ex, eyeY + 1, 1, 1, PALETTE.ink);
    }
    px(mouthX - 1, eyeY + 4, 1, 1, PALETTE.ink);
    px(mouthX, eyeY + 3, 1, 1, PALETTE.ink);
    px(mouthX + 1, eyeY + 4, 1, 1, PALETTE.ink);
    px(mouthX + 2, eyeY + 3, 1, 1, PALETTE.ink);
    // A sweat drop that slides down.
    px(left + bodyWidth - 3, top + 1 + extra, 1, 2, PALETTE.sky);
  }

  // Cheeks (not when sick: the pet looks pale).
  if (face !== 'sick') {
    px(eyeL - 2, eyeY + 2, 2, 1, PALETTE.blush);
    px(eyeR + 2, eyeY + 2, 2, 1, PALETTE.blush);
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

  // Each animation is a list of frames: [bounce, squash, extra].
  const rowsToDraw: [Face, [number, number, number][]][] = [
    ['happy', [[0, 1, 0], [2, 0, 0], [3, 0, 0], [1, 0, 0]]], // idle: a happy bounce
    ['sad', [[0, 1, 0], [0, 1, 0], [1, 0, 0], [0, 1, 0]]], // sad: a slow sway
    ['sleep', [[0, 1, 0], [0, 1, 1], [0, 0, 2], [0, 0, 3]]], // sleep: breathing + Zs
    ['sick', [[0, 1, 0], [0, 2, 1], [0, 1, 2], [0, 2, 3]]], // sick: a shivery wobble
  ];
  rowsToDraw.forEach(([face, frames], row) => {
    frames.forEach(([b, sq, ex], i) =>
      drawBlob(ctx, i * FRAME_SIZE, row * FRAME_SIZE, b, sq, face, ex),
    );
  });

  return { image: canvas, manifest: m };
}
