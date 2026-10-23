// What public/sprites/manifest.json holds, and how a sheet's entry is
// filled in from its recolour source, shape and idle sets. Kept free of
// browser code (and of imports) so scripts/export-art.ts can use it too.
// src/render/sprites.ts loads the sheets.

export interface Animation {
  row: number; // which row of the sheet
  frames: number; // how many frames, left to right
  frameMs: number; // how long each frame shows, in milliseconds
}

// Where a hat sits on a character: the pixel (in the first idle frame)
// where the bottom middle of the hat goes, and how many pixels wide a hat
// may be there (the room between ears or horns, or the whole head).
export interface Head {
  x: number;
  y: number;
  width: number;
}

// A small fix for one hat on one shape: pixels right (x) and down (y), and
// a different width to pick that hat's size with.
export interface HatFit {
  x?: number;
  y?: number;
  width?: number;
}

// A body shape shared by every character drawn on the same body, so where
// hats sit is set up once per shape instead of once per character.
export interface Shape {
  head: Head;
  // Where the face goes (the pixel in the first idle frame that a face
  // set's FACE_ANCHOR lands on), and which face set to use. A shape
  // without a face point has its face drawn on the body.
  face?: { x: number; y: number };
  faces?: string;
  headOffsets?: Record<string, number[]>; // optional fix for every sheet of this shape
  headShifts?: Record<string, number[]>; // the same, for moving sideways
  hats?: Record<string, HatFit>; // by hat sheet name
}

// Extra idle moves (a stretch, a look around...) shared by every sheet that
// has them drawn on the same rows. The pet plays one now and then instead
// of its plain idle. See src/render/animations.ts.
export interface IdleSet {
  animations: Record<string, Animation>;
  headOffsets?: Record<string, number[]>; // optional fix for every sheet using this set
  headShifts?: Record<string, number[]>;
}

export interface ManifestSheet {
  file?: string;
  // A colour variant made from another sheet instead of its own PNG: the
  // sheet it's painted from (which has a file), and which palette colours
  // to swap, e.g. { "cream": "mint", "peach": "leaf" }. It uses that
  // sheet's shape, idle set and animations unless it lists its own.
  from?: string;
  recolour?: Record<string, string>;
  animations?: Record<string, Animation>;
  frameWidth?: number; // only if different from the shared size (hats)
  frameHeight?: number;
  shape?: string; // pet sheets: a name from the manifest's 'shapes'
  // A name from the manifest's 'idleSets', or a list of them to mix their
  // moves (their rows must not clash).
  idleSet?: string | string[];
  headOffsets?: Record<string, number[]>; // optional fix for the automatic tracking
  headShifts?: Record<string, number[]>;
  // A sheet can change its shape's points for itself only, so a character
  // drawn a pixel lower doesn't need a shape of its own: its own hat point,
  // face point, face set and hat nudges win over its shape's.
  head?: Head;
  face?: { x: number; y: number };
  faces?: string;
  hats?: Record<string, HatFit>;
}

export interface ManifestFile {
  frameWidth: number;
  frameHeight: number;
  animations: Record<string, Animation>;
  shapes?: Record<string, Shape>;
  idleSets?: Record<string, IdleSet>;
  // Face sets: sheets of faces, one row per expression (see faces.ts).
  // 'blob' is also the fallback for expressions another set leaves out.
  faceSets?: Record<string, { file: string }>;
  sheets: Record<string, ManifestSheet>;
}

// A sheet's manifest entry, filled in from the sheet it's painted from if
// it's a recolour. Warns if that sheet isn't there or has no file itself.
export function resolveSheet(manifest: ManifestFile, sheetName: string): ManifestSheet {
  const sheet = manifest.sheets[sheetName];
  if (!sheet?.from) return sheet;
  const from = manifest.sheets[sheet.from];
  if (!from?.file) {
    console.warn(`Sheet "${sheetName}" is made from "${sheet.from}", which isn't a sheet with a file in manifest.json`);
    return sheet;
  }
  return { ...from, ...sheet, file: from.file };
}

// A sheet's animations: the shared ones, with any the sheet lists itself
// changed or added, and its idle set's moves. Only rows the picture is tall
// enough for are kept (`height` in pixels), so a sheet with only some rows
// drawn falls back to idle for the rest.
export function sheetAnimations(manifest: ManifestFile, sheetName: string, height = Infinity): Record<string, Animation> {
  const sheet = resolveSheet(manifest, sheetName);
  const frameHeight = sheet.frameHeight ?? manifest.frameHeight;
  const all = { ...manifest.animations, ...sheet.animations, ...idleSetOf(manifest, sheetName)?.animations };
  return Object.fromEntries(Object.entries(all).filter(([, a]) => (a.row + 1) * frameHeight <= height));
}

// Leaves out animations with nothing drawn on their row (a tag that wasn't
// drawn yet when the sheet was exported), so they fall back to idle too.
// Hats and other sheets with only an empty idle row keep it.
export function onlyDrawn(
  animations: Record<string, Animation>,
  pixels: { data: Uint8ClampedArray | Uint8Array; width: number },
  frameWidth: number,
  frameHeight: number,
): Record<string, Animation> {
  const drawn = (a: Animation) => {
    for (let y = a.row * frameHeight; y < (a.row + 1) * frameHeight; y++)
      for (let x = 0; x < Math.min(a.frames * frameWidth, pixels.width); x++)
        if (pixels.data[(y * pixels.width + x) * 4 + 3] !== 0) return true;
    return false;
  };
  return Object.fromEntries(Object.entries(animations).filter(([name, a]) => name === 'idle' || drawn(a)));
}

// The body shape a sheet is drawn on, with the sheet's own hat point, face
// point, face set and hat nudges in place of the shape's, or undefined for
// sheets without one (the egg, hats). Warns about a shape name that isn't
// in the list.
export function shapeOf(manifest: ManifestFile, sheetName: string): Shape | undefined {
  const sheet = resolveSheet(manifest, sheetName);
  const name = sheet?.shape;
  if (!name) return undefined;
  const shape = manifest.shapes?.[name];
  if (!shape) {
    console.warn(`Sheet "${sheetName}" uses shape "${name}", which isn't in manifest.json's shapes`);
    return undefined;
  }
  if (!sheet.head && !sheet.face && !sheet.faces && !sheet.hats) return shape;
  return {
    ...shape,
    head: sheet.head ?? shape.head,
    face: sheet.face ?? shape.face,
    faces: sheet.faces ?? shape.faces,
    hats: sheet.hats || shape.hats ? { ...shape.hats, ...sheet.hats } : undefined,
  };
}

// The idle set a sheet uses (several mixed into one, if it lists more than
// one), or undefined. Warns about a name that isn't in the list.
export function idleSetOf(manifest: ManifestFile, sheetName: string): IdleSet | undefined {
  const names = [resolveSheet(manifest, sheetName)?.idleSet ?? []].flat();
  const sets = names.flatMap((name) => {
    const set = manifest.idleSets?.[name];
    if (!set) console.warn(`Sheet "${sheetName}" uses idle set "${name}", which isn't in manifest.json's idleSets`);
    return set ? [set] : [];
  });
  if (sets.length <= 1) return sets[0];
  return {
    animations: Object.assign({}, ...sets.map((set) => set.animations)),
    headOffsets: Object.assign({}, ...sets.map((set) => set.headOffsets)),
    headShifts: Object.assign({}, ...sets.map((set) => set.headShifts)),
  };
}
