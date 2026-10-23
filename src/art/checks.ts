// The art guide's consistency rules that a computer can check on an
// exported sheet: palette colours only, no soft edges, the right size, an
// empty top row, feet on the feet line and the pet centred, and (as a hint,
// since art can bend it) the outline rule.

import { OUTLINE_OF, OUTLINES, PALETTE, type ColourName } from '../render/palette';
import type { SpriteSheet } from '../render/sprites';

export interface Check {
  ok: boolean;
  label: string;
  // Only a hint: worth a look, but fine if it's on purpose. npm test
  // doesn't fail on it.
  warn?: boolean;
  detail?: string;
}

const PALETTE_RGB = new Map(
  Object.entries(PALETTE).map(([name, hex]) => [parseInt(hex.slice(1), 16), name] as const),
);

// Read once per picture, since the preview looks at them every frame.
const cache = new WeakMap<object, ImageData>();

export function pixelsOf(image: CanvasImageSource & { width: number; height: number }): ImageData {
  const known = cache.get(image);
  if (known) return known;
  const canvas = document.createElement('canvas');
  canvas.width = image.width;
  canvas.height = image.height;
  const ctx = canvas.getContext('2d', { willReadFrequently: true })!;
  ctx.drawImage(image, 0, 0);
  const pixels = ctx.getImageData(0, 0, canvas.width, canvas.height);
  cache.set(image, pixels);
  return pixels;
}

const hex = (rgb: number) => `#${rgb.toString(16).padStart(6, '0')}`;

// Every check for one sheet. `kind` picks which rules apply: hats and face
// sets only need the colour rules.
export function checkSheet(sheet: SpriteSheet, kind: CheckKind = 'pet'): Check[] {
  return checkPixels(pixelsOf(sheet.image), sheet, kind);
}

export type CheckKind = 'pet' | 'hat' | 'face';

// The same checks on pixels read some other way, so the tests can run them
// on the PNG files too (see scripts/art-checks.test.ts).
export function checkPixels(
  pixels: { data: Uint8ClampedArray | Uint8Array; width: number; height: number },
  sheet: Pick<SpriteSheet, 'frameWidth' | 'frameHeight' | 'animations'>,
  kind: CheckKind = 'pet',
): Check[] {
  const { data, width, height } = pixels;
  const checks: Check[] = [];
  const fw = sheet.frameWidth;
  const fh = sheet.frameHeight;

  // Colours.
  const strays = new Map<number, number>();
  let soft = 0;
  for (let i = 0; i < data.length; i += 4) {
    const a = data[i + 3];
    if (a === 0) continue;
    if (a !== 255) soft++;
    const rgb = (data[i] << 16) | (data[i + 1] << 8) | data[i + 2];
    if (!PALETTE_RGB.has(rgb)) strays.set(rgb, (strays.get(rgb) ?? 0) + 1);
  }
  checks.push({
    ok: strays.size === 0,
    label: 'Only palette colours',
    detail: strays.size
      ? `${strays.size} other colour${strays.size > 1 ? 's' : ''}: ` +
        [...strays].sort((a, b) => b[1] - a[1]).slice(0, 6).map(([c, n]) => `${hex(c)} (${n} px)`).join(', ') +
        '. Use Sprite → Color Mode → Indexed with the palette loaded.'
      : undefined,
  });
  checks.push({
    ok: soft === 0,
    label: 'No soft or see-through edges',
    detail: soft ? `${soft} pixels are partly see-through. Every pixel should be fully drawn or fully empty.` : undefined,
  });
  if (kind !== 'pet') return checks;

  // Size.
  const anims = Object.values(sheet.animations);
  const wantW = Math.max(...anims.map((a) => a.frames)) * fw;
  const wantH = (Math.max(...anims.map((a) => a.row)) + 1) * fh;
  checks.push({
    ok: width >= wantW && height >= wantH && width % fw === 0 && height % fh === 0,
    label: `Sheet size ${wantW} × ${wantH}`,
    detail: width !== wantW || height !== wantH ? `It's ${width} × ${height}. A missing tag or frame usually causes this.` : undefined,
  });

  const solid = (row: number, frame: number, x: number, y: number) => {
    const px = frame * fw + x;
    const py = row * fh + y;
    return px < width && py < height && data[(py * width + px) * 4 + 3] !== 0;
  };

  // The top row of every frame.
  const touching: string[] = [];
  for (const [name, a] of Object.entries(sheet.animations))
    for (let f = 0; f < a.frames; f++)
      for (let x = 0; x < fw; x++)
        if (solid(a.row, f, x, 0)) {
          touching.push(`${name} ${f + 1}`);
          break;
        }
  checks.push({
    ok: touching.length === 0,
    label: 'Top row empty in every frame',
    detail: touching.length ? `Drawn on the top row in: ${touching.join(', ')}. Hats can't follow a head that runs off the top.` : undefined,
  });

  // Feet and centre, in the first idle frame.
  const idle = sheet.animations.idle;
  if (idle) {
    let left = fw;
    let right = -1;
    let bottom = -1;
    for (let y = 0; y < fh; y++)
      for (let x = 0; x < fw; x++)
        if (solid(idle.row, 0, x, y)) {
          left = Math.min(left, x);
          right = Math.max(right, x);
          bottom = Math.max(bottom, y);
        }
    if (right >= 0) {
      checks.push({
        ok: bottom === 29 || bottom === 28,
        label: 'Feet on row 28, shadow on row 29',
        detail: bottom !== 29 && bottom !== 28 ? `The lowest drawn row of the first idle frame is ${bottom}.` : undefined,
      });
      const middle = (left + right) / 2;
      checks.push({
        ok: Math.abs(middle - (fw - 1) / 2) <= 1,
        label: 'Centred',
        detail: `Columns ${left} to ${right}, so the middle is at ${middle}${Math.abs(middle - (fw - 1) / 2) > 1 ? `, not ${(fw - 1) / 2}` : ''}.`,
      });
      checks.push(outlineCheck((x, y) => (solid(idle.row, 0, x, y) ? colourAt(data, ((idle.row * fh + y) * width + x) * 4) : null), fw, fh));
    }
  }
  return checks;
}

function colourAt(data: Uint8ClampedArray | Uint8Array, i: number): ColourName | undefined {
  return PALETTE_RGB.get((data[i] << 16) | (data[i + 1] << 8) | data[i + 2]) as ColourName | undefined;
}

// The outline rule, on the first idle frame: every pixel on the outer edge
// (next to see-through) should be an outline colour, and the outline of a
// part it touches. Ink always passes. The shadow rows are left out.
function outlineCheck(at: (x: number, y: number) => ColourName | undefined | null, fw: number, fh: number): Check {
  const bare: string[] = [];
  const wrong: string[] = [];
  const outlines = new Set<string>(OUTLINES);
  for (let y = 0; y < Math.min(fh, 29); y++)
    for (let x = 0; x < fw; x++) {
      const c = at(x, y);
      if (!c) continue;
      const around = [at(x + 1, y), at(x - 1, y), at(x, y + 1), at(x, y - 1)];
      if (!around.includes(null)) continue; // not on the outer edge
      if (!outlines.has(c)) {
        bare.push(`${c} at (${x}, ${y})`);
        continue;
      }
      if (c === 'ink') continue;
      const wanted = around.map((n) => (n ? OUTLINE_OF[n] : undefined)).filter((o): o is ColourName => !!o);
      if (wanted.length && !wanted.includes(c)) wrong.push(`${c} at (${x}, ${y}), next to a part that takes ${[...new Set(wanted)].join(' or ')}`);
    }
  const list = (items: string[]) => items.slice(0, 4).join('; ') + (items.length > 4 ? ` and ${items.length - 4} more` : '');
  const detail = [
    bare.length ? `No outline: ${list(bare)}.` : '',
    wrong.length ? `Another part's outline: ${list(wrong)}.` : '',
  ].filter(Boolean).join(' ');
  return {
    ok: !bare.length && !wrong.length,
    warn: true,
    label: 'Outline in each part’s own dark colour (first idle frame)',
    detail: detail ? `${detail} Fine if it's on purpose.` : undefined,
  };
}
