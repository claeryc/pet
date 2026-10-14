// Loads the pet's sprite sheets. The game finds art ONLY through
// public/sprites/manifest.json, so new or replacement art needs no code
// changes: drop a PNG into public/sprites/ and add it to the manifest.
// See docs/ART_GUIDE.md for how to make a sheet in Aseprite.

export interface Animation {
  row: number; // which row of the sheet
  frames: number; // how many frames, left to right
  frameMs: number; // how long each frame shows, in milliseconds
}

interface ManifestFile {
  frameWidth: number;
  frameHeight: number;
  animations: Record<string, Animation>;
  sheets: Record<string, { file: string; animations?: Record<string, Animation> }>;
}

export interface SpriteSheet {
  image: HTMLImageElement;
  frameWidth: number;
  frameHeight: number;
  animations: Record<string, Animation>;
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
        library.set(name, {
          image: await loadImage(base + sheet.file),
          frameWidth: manifest.frameWidth,
          frameHeight: manifest.frameHeight,
          // A sheet's own animation list replaces the shared one.
          animations: sheet.animations ?? manifest.animations,
        });
      } catch (err) {
        console.warn(err);
      }
    }),
  );
  return library;
}
