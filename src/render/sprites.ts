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

interface ManifestSheet {
  file: string;
  animations?: Record<string, Animation>;
  frameWidth?: number; // only if different from the shared size (hats)
  frameHeight?: number;
  head?: Head;
}

interface ManifestFile {
  frameWidth: number;
  frameHeight: number;
  animations: Record<string, Animation>;
  sheets: Record<string, ManifestSheet>;
}

export interface SpriteSheet {
  image: HTMLImageElement;
  frameWidth: number;
  frameHeight: number;
  animations: Record<string, Animation>;
  head?: Head;
  // How far the top of the head moves up or down in each frame compared to
  // the first idle frame, per animation. Worked out from the picture, so a
  // hat bobs along with the pet without you listing every frame.
  headOffsets?: Record<string, number[]>;
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
        const loaded: SpriteSheet = {
          image: await loadImage(base + sheet.file),
          frameWidth: sheet.frameWidth ?? manifest.frameWidth,
          frameHeight: sheet.frameHeight ?? manifest.frameHeight,
          // A sheet's own animation list replaces the shared one.
          animations: sheet.animations ?? manifest.animations,
          head: sheet.head,
        };
        if (loaded.head) loaded.headOffsets = findHeadOffsets(loaded, loaded.head);
        library.set(name, loaded);
      } catch (err) {
        console.warn(err);
      }
    }),
  );
  return library;
}

// For every frame, finds the highest see-through-free pixel in a thin
// column around the head point, and compares it with the first idle frame.
// Effects to the side (Zs, sparkles) are outside that column, so they don't
// confuse it.
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
    for (let y = 0; y < sheet.frameHeight; y++)
      for (let x = head.x - 1; x <= head.x + 1; x++)
        if (data[((oy + y) * width + ox + x) * 4 + 3] > 0) return y;
    return sheet.frameHeight;
  };
  const idle = sheet.animations.idle;
  const base = idle ? topOf(idle.row, 0) : 0;
  const offsets: Record<string, number[]> = {};
  for (const [name, anim] of Object.entries(sheet.animations))
    offsets[name] = Array.from({ length: anim.frames }, (_, f) => topOf(anim.row, f) - base);
  return offsets;
}
