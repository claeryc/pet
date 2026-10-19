// Loads the pet's sprite sheets. The game finds art ONLY through
// public/sprites/manifest.json, so new or replacement art needs no code
// changes: drop a PNG into public/sprites/ and add it to the manifest.
// See docs/ART_GUIDE.md for how to make a sheet in Aseprite.

export interface Animation {
  row: number; // which row of the sheet
  frames: number; // how many frames, left to right
  frameMs: number; // how long each frame shows, in milliseconds
}

// Where a hat sits on a character: the pixel (in the first idle frame)
// where the bottom middle of the hat goes, and which hat size fits.
export interface Head {
  x: number;
  y: number;
  size: 'small' | 'large';
}

// A small fix for one hat on one shape: pixels right (x) and down (y), and
// which hat size to use instead of the head's.
export interface HatFit {
  x?: number;
  y?: number;
  size?: 'small' | 'large';
}

// A body shape shared by every character drawn on the same body, so where
// hats sit is set up once per shape instead of once per character.
export interface Shape {
  head: Head;
  headOffsets?: Record<string, number[]>; // optional fix for every sheet of this shape
  hats?: Record<string, HatFit>; // by hat sheet name
}

export interface ManifestSheet {
  file: string;
  animations?: Record<string, Animation>;
  frameWidth?: number; // only if different from the shared size (hats)
  frameHeight?: number;
  shape?: string; // pet sheets: a name from the manifest's 'shapes'
  headOffsets?: Record<string, number[]>; // optional fix for the automatic tracking
}

export interface ManifestFile {
  frameWidth: number;
  frameHeight: number;
  animations: Record<string, Animation>;
  shapes?: Record<string, Shape>;
  sheets: Record<string, ManifestSheet>;
}

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
  hats?: Record<string, HatFit>; // fixes for single hats, from the shape
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
  await Promise.all(
    Object.entries(manifest.sheets).map(async ([name, sheet]) => {
      try {
        const shape = shapeOf(manifest, name);
        const loaded: SpriteSheet = {
          name,
          image: await loadImage(base + sheet.file),
          frameWidth: sheet.frameWidth ?? manifest.frameWidth,
          frameHeight: sheet.frameHeight ?? manifest.frameHeight,
          // A sheet's own animation list replaces the shared one.
          animations: sheet.animations ?? manifest.animations,
          head: shape?.head,
          hats: shape?.hats,
        };
        // Hand-written offsets in the manifest win over the automatic ones,
        // and the sheet's own win over its shape's.
        if (shape)
          loaded.headOffsets = {
            ...findHeadOffsets(loaded, shape.head),
            ...shape.headOffsets,
            ...sheet.headOffsets,
          };
        library.set(name, loaded);
      } catch (err) {
        console.warn(err);
      }
    }),
  );
  return library;
}

// The body shape a sheet is drawn on, or undefined for sheets without one
// (the egg, hats). Warns about a shape name that isn't in the list.
export function shapeOf(manifest: ManifestFile, sheetName: string): Shape | undefined {
  const name = manifest.sheets[sheetName]?.shape;
  if (!name) return undefined;
  const shape = manifest.shapes?.[name];
  if (!shape) console.warn(`Sheet "${sheetName}" uses shape "${name}", which isn't in manifest.json's shapes`);
  return shape;
}

// For every frame, works out how far the top of the head has moved compared
// with the first idle frame. It looks at a few columns around the head
// point, finds the top of the picture in each, and takes the lowest one:
// spikes, ears or a sprout only raise some columns, so the lowest top is
// the head itself. Effects to the side (Zs, sparkles, hearts) are outside
// those columns, so they don't confuse it.
function findHeadOffsets(sheet: SpriteSheet, head: Head): Record<string, number[]> {
  const canvas = document.createElement('canvas');
  canvas.width = sheet.image.width;
  canvas.height = sheet.image.height;
  const ctx = canvas.getContext('2d', { willReadFrequently: true })!;
  ctx.drawImage(sheet.image, 0, 0);
  const { data, width } = ctx.getImageData(0, 0, canvas.width, canvas.height);
  const topOf = (row: number, frame: number): number => {
    const ox = frame * sheet.frameWidth;
    const oy = row * sheet.frameHeight;
    let lowest = 0;
    for (let x = head.x - 2; x <= head.x + 2; x++) {
      let y = 0;
      while (y < sheet.frameHeight && data[((oy + y) * width + ox + x) * 4 + 3] === 0) y++;
      lowest = Math.max(lowest, y);
    }
    return lowest;
  };
  const idle = sheet.animations.idle;
  const base = idle ? topOf(idle.row, 0) : 0;
  const offsets: Record<string, number[]> = {};
  for (const [name, anim] of Object.entries(sheet.animations))
    offsets[name] = Array.from({ length: anim.frames }, (_, f) => topOf(anim.row, f) - base);
  return offsets;
}
