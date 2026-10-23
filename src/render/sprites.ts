// Loads the pet's sprite sheets. The game finds art ONLY through
// public/sprites/manifest.json, so new or replacement art needs no code
// changes: drop a PNG into public/sprites/ and add it to the manifest.
// See docs/ART_GUIDE.md for how to make a sheet in Aseprite.

import { PALETTE } from './palette';
import { recolourPixels } from './recolour';
import { countFaceFrames, type FaceSheet } from './faces';
import {
  idleSetOf,
  onlyDrawn,
  resolveSheet,
  shapeOf,
  sheetAnimations,
  type Animation,
  type HatFit,
  type Head,
  type ManifestFile,
} from './manifest';

export * from './manifest';

export interface SpriteSheet {
  name: string; // its name in the manifest
  image: HTMLImageElement;
  frameWidth: number;
  frameHeight: number;
  animations: Record<string, Animation>;
  head?: Head;
  // How far the top of the head moves up or down in each frame compared to
  // the first idle frame, per animation. Worked out from the picture, so a
  // hat bobs along with the pet without you listing every frame.
  headOffsets?: Record<string, number[]>;
  // The same for sideways: how far the head has moved right (or left, when
  // negative), so a hat follows a lean or a look around.
  headShifts?: Record<string, number[]>;
  idleMoves?: string[]; // names of its idle set's moves
  hats?: Record<string, HatFit>; // fixes for single hats, from the shape
  // Hat sheets: how wide the drawing in each frame is, left to right.
  hatWidths?: number[];
  // Pets with a face layer: where the face goes, its face set, and the
  // set used for expressions that one leaves out.
  face?: { x: number; y: number };
  faceSet?: FaceSheet;
  faceFallback?: FaceSheet;
}

export type SpriteLibrary = Map<string, SpriteSheet>;

function loadImage(url: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error(`Could not load sprite ${url}`));
    img.src = url;
  });
}

// Reads the manifest and loads every sheet it lists. A sheet that fails to
// load is skipped with a warning (the game then draws a "?" in its place)
// instead of breaking the whole game.
export async function loadSprites(): Promise<SpriteLibrary> {
  const base = `${import.meta.env.BASE_URL}sprites/`;
  const library: SpriteLibrary = new Map();
  let manifest: ManifestFile;
  try {
    manifest = await (await fetch(`${base}manifest.json`)).json();
  } catch (err) {
    console.warn('Could not read sprites/manifest.json:', err);
    return library;
  }
  const faceSets = new Map<string, FaceSheet>();
  await Promise.all(
    Object.entries(manifest.faceSets ?? {}).map(async ([name, set]) => {
      try {
        const image = await loadImage(base + set.file);
        const fw = manifest.frameWidth;
        const fh = manifest.frameHeight;
        faceSets.set(name, { name, image, frameWidth: fw, frameHeight: fh, frames: countFaceFrames(pixelsOf(image), fw, fh) });
      } catch (err) {
        console.warn(err);
      }
    }),
  );
  await Promise.all(
    Object.keys(manifest.sheets).map(async (name) => {
      try {
        const sheet = resolveSheet(manifest, name);
        const shape = shapeOf(manifest, name);
        const idleSet = idleSetOf(manifest, name);
        let image = await loadImage(base + sheet.file);
        if (manifest.sheets[name].recolour) image = await recolourImage(image, manifest.sheets[name].recolour!);
        const pixels = pixelsOf(image);
        const frameWidth = sheet.frameWidth ?? manifest.frameWidth;
        const frameHeight = sheet.frameHeight ?? manifest.frameHeight;
        const loaded: SpriteSheet = {
          name,
          image,
          frameWidth,
          frameHeight,
          animations: onlyDrawn(sheetAnimations(manifest, name, image.height), pixels, frameWidth, frameHeight),
          head: shape?.head,
          hats: shape?.hats,
        };
        if (idleSet) loaded.idleMoves = Object.keys(idleSet.animations).filter((move) => loaded.animations[move]);
        // Hand-written offsets in the manifest win over the automatic ones:
        // the sheet's own over its idle set's, and those over its shape's.
        if (shape) {
          const found = measureHead(pixels, loaded, shape.head, loaded.idleMoves);
          loaded.headOffsets = {
            ...found.offsets,
            ...shape.headOffsets,
            ...idleSet?.headOffsets,
            ...sheet.headOffsets,
          };
          loaded.headShifts = {
            ...found.shifts,
            ...shape.headShifts,
            ...idleSet?.headShifts,
            ...sheet.headShifts,
          };
        }
        if (name.startsWith('hat-')) loaded.hatWidths = measureHatWidths(loaded);
        if (shape?.face) {
          const setName = shape.faces ?? 'blob';
          if (!faceSets.has(setName)) console.warn(`Sheet "${name}" uses face set "${setName}", which didn't load`);
          loaded.face = shape.face;
          loaded.faceSet = faceSets.get(setName);
          loaded.faceFallback = faceSets.get('blob');
        }
        library.set(name, loaded);
      } catch (err) {
        console.warn(err);
      }
    }),
  );
  return library;
}

// A copy of a sheet's picture with palette colours swapped.
function recolourImage(image: HTMLImageElement, swaps: Record<string, string>): Promise<HTMLImageElement> {
  const pixels = pixelsOf(image);
  for (const swap of recolourPixels(pixels.data, swaps, PALETTE))
    console.warn(`Recolour ${swap} uses a colour that isn't in the palette`);
  const canvas = document.createElement('canvas');
  canvas.width = image.width;
  canvas.height = image.height;
  canvas.getContext('2d')!.putImageData(pixels, 0, 0);
  return loadImage(canvas.toDataURL());
}

// Which frame of a hat sheet to draw on a head with `room` pixels: the
// widest drawing that fits, or the narrowest one if none does.
export function pickHatFrame(widths: number[], room: number): number {
  let best = -1;
  for (let i = 0; i < widths.length; i++)
    if (widths[i] <= room && (best < 0 || widths[i] > widths[best])) best = i;
  if (best >= 0) return best;
  return widths.indexOf(Math.min(...widths));
}

// How wide the drawing in each frame of a hat sheet is, from its leftmost
// to its rightmost coloured column.
function measureHatWidths(sheet: SpriteSheet): number[] {
  const { data, width } = pixelsOf(sheet.image);
  const frames = Math.max(1, Math.floor(sheet.image.width / sheet.frameWidth));
  return Array.from({ length: frames }, (_, f) => {
    let left = Infinity;
    let right = -Infinity;
    for (let x = 0; x < sheet.frameWidth; x++)
      for (let y = 0; y < sheet.frameHeight; y++)
        if (data[(y * width + f * sheet.frameWidth + x) * 4 + 3] !== 0) {
          left = Math.min(left, x);
          right = Math.max(right, x);
        }
    return right >= left ? right - left + 1 : 0;
  });
}

function pixelsOf(image: HTMLImageElement): ImageData {
  const canvas = document.createElement('canvas');
  canvas.width = image.width;
  canvas.height = image.height;
  const ctx = canvas.getContext('2d', { willReadFrequently: true })!;
  ctx.drawImage(image, 0, 0);
  return ctx.getImageData(0, 0, canvas.width, canvas.height);
}

// For every frame, works out how far the head has moved compared with the
// first idle frame: up or down (offsets) and sideways (shifts).
//
// Up and down: it looks at a few columns around the head point, finds the
// top of the picture in each, and takes the lowest one: spikes, ears or a
// sprout only raise some columns, so the lowest top is the head itself.
// Effects to the side (Zs, sparkles, hearts) are outside those columns, so
// they don't confuse it.
//
// Sideways: it looks along the head point's row, at the stretch of picture
// around the head point, and sees how far its left and right edges have
// moved. The head moved by the average of the two, so a squash or a stretch
// (both edges move apart or together) doesn't count. It only trusts that
// when the edges moved alike, give or take a pixel each, so a sparkle or a
// heart touching one side is left out. A small one can still look like a
// lean, so this is only done for the
// animations in `sideways` (the idle set's moves); in every other one the
// hat just goes up and down, as it always has.
export function measureHead(
  pixels: { data: Uint8ClampedArray | Uint8Array; width: number },
  sheet: { frameWidth: number; frameHeight: number; animations: Record<string, Animation> },
  head: Head,
  sideways: string[] = [],
): { offsets: Record<string, number[]>; shifts: Record<string, number[]> } {
  const { data, width } = pixels;
  const { frameWidth: fw, frameHeight: fh } = sheet;
  const solid = (row: number, frame: number, x: number, y: number) =>
    x >= 0 && x < fw && y >= 0 && y < fh && data[((row * fh + y) * width + frame * fw + x) * 4 + 3] !== 0;
  const topOf = (row: number, frame: number, cx: number): number => {
    let lowest = 0;
    for (let x = cx - 2; x <= cx + 2; x++) {
      let y = 0;
      while (y < fh && !solid(row, frame, x, y)) y++;
      lowest = Math.max(lowest, y);
    }
    return lowest;
  };
  // The left and right edges of the stretch of picture on row y that
  // includes the head point (or the nearest solid pixel to it).
  const spanAt = (row: number, frame: number, y: number): [number, number] | null => {
    let x = -1;
    for (let d = 0; d <= 4 && x < 0; d++)
      if (solid(row, frame, head.x - d, y)) x = head.x - d;
      else if (solid(row, frame, head.x + d, y)) x = head.x + d;
    if (x < 0) return null;
    let left = x;
    let right = x;
    while (solid(row, frame, left - 1, y)) left--;
    while (solid(row, frame, right + 1, y)) right++;
    return [left, right];
  };
  const idle = sheet.animations.idle;
  const baseTop = idle ? topOf(idle.row, 0, head.x) : 0;
  const baseSpan = idle ? spanAt(idle.row, 0, head.y) : null;
  const offsets: Record<string, number[]> = {};
  const shifts: Record<string, number[]> = {};
  for (const [name, anim] of Object.entries(sheet.animations)) {
    offsets[name] = [];
    shifts[name] = [];
    for (let f = 0; f < anim.frames; f++) {
      const dy = topOf(anim.row, f, head.x) - baseTop;
      const span = baseSpan && sideways.includes(name) && spanAt(anim.row, f, head.y + dy);
      let dx = 0;
      if (baseSpan && span) {
        const [left, right] = [span[0] - baseSpan[0], span[1] - baseSpan[1]];
        const middle = (left + right) / 2;
        if (Math.abs(left - middle) <= 1) dx = Math.trunc(middle);
      }
      // A head that moved sideways is measured again where it now is.
      offsets[name].push(dx ? topOf(anim.row, f, head.x + dx) - baseTop : dy);
      shifts[name].push(dx);
    }
  }
  return { offsets, shifts };
}
