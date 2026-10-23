// Faces drawn on top of a pet's body. A face set is a sheet of small faces
// (eyes, brows, mouth, cheeks and extras like tears or hearts), one row per
// expression, shared by every pet whose body has its face in the same kind
// of spot. See docs/ART_GUIDE.md ("Faces"). Which expression shows is
// worked out in src/game/expressions.ts.

import { EXPRESSIONS, type Expression } from '../game/expressions';

// How long each frame shows, in milliseconds.
export const FACE_FRAME_MS: Record<Expression, number> = {
  content: 300, happy: 300, pouting: 500, sad: 600, crying: 300, surprised: 300,
  inLove: 350, grumpy: 500, sleepy: 700, hungry: 400, chewing: 180, sick: 600,
};

// Every face set draws its faces around this pixel of a frame, and a
// body's face point says where that pixel goes on the body.
export const FACE_ANCHOR = { x: 16, y: 18 };

export interface FaceSheet {
  name: string;
  image: HTMLImageElement | ImageBitmap;
  frameWidth: number;
  frameHeight: number;
  // How many frames each row has drawn (0 = the set leaves it out).
  frames: number[];
}

// The frame to draw for an expression at `timeMs`: from `set`, or from
// `fallback` when `set` leaves that expression out, or the content face.
export function faceFrame(
  set: FaceSheet | undefined,
  fallback: FaceSheet | undefined,
  expression: Expression,
  timeMs: number,
): { sheet: FaceSheet; sx: number; sy: number } | null {
  const row = EXPRESSIONS.indexOf(expression);
  for (const [sheet, r] of [[set, row], [fallback, row], [set, 0], [fallback, 0]] as const) {
    const frames = sheet?.frames[r] ?? 0;
    if (!sheet || frames === 0) continue;
    const ms = FACE_FRAME_MS[EXPRESSIONS[r]];
    return { sheet, sx: (Math.floor(timeMs / ms) % frames) * sheet.frameWidth, sy: r * sheet.frameHeight };
  }
  return null;
}

// How many frames each row of a face sheet has: frames are counted from
// the left up to the last one with anything drawn in it.
export function countFaceFrames(
  pixels: { data: Uint8ClampedArray | Uint8Array; width: number; height: number },
  frameWidth: number,
  frameHeight: number,
): number[] {
  const rows = Math.floor(pixels.height / frameHeight);
  const cols = Math.floor(pixels.width / frameWidth);
  const drawn = (row: number, col: number) => {
    for (let y = row * frameHeight; y < (row + 1) * frameHeight; y++)
      for (let x = col * frameWidth; x < (col + 1) * frameWidth; x++)
        if (pixels.data[(y * pixels.width + x) * 4 + 3] !== 0) return true;
    return false;
  };
  return EXPRESSIONS.map((_, row) => {
    if (row >= rows) return 0;
    let n = 0;
    for (let col = 0; col < cols; col++) if (drawn(row, col)) n = col + 1;
    return n;
  });
}

// Draws a pet's face onto `ctx`, for a body frame drawn with its top left
// at (x, y) whose head has moved `down` and `right` (see frameFor). Does
// nothing for a pet whose face is drawn on its body.
export function drawFace(
  ctx: CanvasRenderingContext2D,
  sheet: { face?: { x: number; y: number }; faceSet?: FaceSheet; faceFallback?: FaceSheet },
  expression: Expression,
  x: number,
  y: number,
  timeMs: number,
  down = 0,
  right = 0,
): void {
  if (!sheet.face) return;
  const frame = faceFrame(sheet.faceSet, sheet.faceFallback, expression, timeMs);
  if (!frame) return;
  const { frameWidth: w, frameHeight: h } = frame.sheet;
  const fx = x + sheet.face.x - FACE_ANCHOR.x + right;
  const fy = y + sheet.face.y - FACE_ANCHOR.y + down;
  ctx.drawImage(frame.sheet.image, frame.sx, frame.sy, w, h, fx, fy, w, h);
}
