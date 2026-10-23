// Exports every Aseprite file in art/ to the PNG the game loads, in one go,
// using Aseprite's command line. Then makes a preview of every recoloured
// colour variant in public/sprites/manifest.json, so you can see it before
// you add it to characters.json.
//
//   npm run export-art                  (exports everything, then previews)
//   npm run export-art -- pebblit hats  (only files whose path has one of these words)
//   npm run export-art -- --previews    (only the previews, no Aseprite needed)
//
// art/characters/cave/pebblit.aseprite goes to
// public/sprites/characters/cave/pebblit.png, the same as exporting by hand
// (see docs/ART_GUIDE.md): each tag is one row, in the order of the tags.
// Hats and badges are one horizontal strip. The guides layer is left out,
// and so is a character's face layer (its face comes from a face set, see
// art/faces/ and docs/ART_GUIDE.md).
//
// It finds Aseprite in the usual places. If yours is somewhere else, set
// ASEPRITE to its path, e.g. ASEPRITE="D:\Tools\Aseprite.exe" npm run export-art
// Runs with plain Node.js 22.18 or newer, no extra packages.

import { spawnSync } from 'node:child_process';
import { existsSync, mkdirSync, mkdtempSync, readdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { homedir, tmpdir } from 'node:os';
import { dirname, join, relative, sep } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { PALETTE } from '../src/render/palette.ts';
import { recolourPixels } from '../src/render/recolour.ts';
import { readPng, scaleUp, sideBySide, stack, writePng, type Pixels } from './png.ts';

const root = fileURLToPath(new URL('..', import.meta.url));
const ART = join(root, 'art');
const SPRITES = join(root, 'public', 'sprites');
export const PREVIEWS = join(root, 'art', 'previews');

// Where the PNG for an Aseprite file goes, and whether it's one strip (hats
// and badges) or one row per tag. `file` is relative to art/, with / between
// folders. Returns null for files that aren't exported.
export function exportPlan(file: string): { png: string; strip: boolean } | null {
  if (!file.endsWith('.aseprite') || file.split('/').pop()!.startsWith('_')) return null;
  if (file.startsWith('previews/') || file.startsWith('shelved/')) return null; // shelved: retired characters
  return { png: file.replace(/\.aseprite$/, '.png'), strip: /^(hats|badges)\//.test(file) };
}

function findAseprite(): string {
  if (process.env.ASEPRITE) return process.env.ASEPRITE;
  const home = homedir();
  const places = [
    '/Applications/Aseprite.app/Contents/MacOS/aseprite',
    join(home, 'Applications/Aseprite.app/Contents/MacOS/aseprite'),
    join(home, 'Library/Application Support/Steam/steamapps/common/Aseprite/Aseprite.app/Contents/MacOS/aseprite'),
    'C:\\Program Files\\Aseprite\\Aseprite.exe',
    'C:\\Program Files (x86)\\Aseprite\\Aseprite.exe',
    'C:\\Program Files (x86)\\Steam\\steamapps\\common\\Aseprite\\Aseprite.exe',
    join(home, '.steam/debian-installation/steamapps/common/Aseprite/aseprite'),
    join(home, '.local/share/Steam/steamapps/common/Aseprite/aseprite'),
  ];
  return places.find((p) => existsSync(p)) ?? 'aseprite'; // otherwise hope it's on the PATH
}

function run(aseprite: string, args: string[]): string {
  const out = spawnSync(aseprite, args, { encoding: 'utf8' });
  if (out.error) {
    throw new Error(
      `Couldn't start Aseprite (${aseprite}). Set ASEPRITE to where Aseprite is installed, ` +
        'e.g. ASEPRITE="/Applications/Aseprite.app/Contents/MacOS/aseprite" npm run export-art',
    );
  }
  if (out.status !== 0) throw new Error(`Aseprite failed: ${out.stderr || out.stdout}`);
  return out.stdout;
}

function exportFile(aseprite: string, file: string, plan: { png: string; strip: boolean }, temp: string): Pixels {
  const source = join(ART, file);
  const strip = (out: string, tag?: string) => {
    run(aseprite, ['-b', '--ignore-layer', 'guides', '--ignore-layer', 'face', ...(tag ? ['--tag', tag] : []), source,
      '--sheet', out, '--sheet-type', 'horizontal', '--border-padding', '0', '--shape-padding', '0', '--inner-padding', '0']);
    return readPng(readFileSync(out));
  };
  if (plan.strip) return strip(join(temp, 'strip.png'));
  const tags = run(aseprite, ['-b', '--list-tags', source]).split(/\r?\n/).map((t) => t.trim()).filter(Boolean);
  if (tags.length === 0) return strip(join(temp, 'strip.png'));
  return stack(tags.map((tag, i) => strip(join(temp, `row-${i}.png`), tag)));
}

function allArt(dir = ART): string[] {
  return readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const full = join(dir, entry.name);
    return entry.isDirectory() ? allArt(full) : [relative(ART, full).split(sep).join('/')];
  });
}

function exportAll(only: string[]): void {
  const aseprite = findAseprite();
  const temp = mkdtempSync(join(tmpdir(), 'export-art-'));
  let done = 0;
  try {
    for (const file of allArt()) {
      const plan = exportPlan(file);
      if (!plan || (only.length && !only.some((word) => file.includes(word)))) continue;
      const target = join(SPRITES, plan.png);
      const picture = exportFile(aseprite, file, plan, temp);
      // A sheet that changes size usually means a missing or extra tag or
      // frame, so it's worth a look.
      if (existsSync(target)) {
        const before = readPng(readFileSync(target));
        if (before.width !== picture.width || before.height !== picture.height)
          console.warn(`! ${plan.png} changed size: ${before.width}x${before.height} -> ${picture.width}x${picture.height}`);
      }
      mkdirSync(dirname(target), { recursive: true });
      writeFileSync(target, writePng(picture));
      console.log(`  ${file} -> public/sprites/${plan.png}`);
      done++;
    }
  } finally {
    rmSync(temp, { recursive: true, force: true });
  }
  console.log(`Exported ${done} sheet${done === 1 ? '' : 's'}.`);
}

// For each recoloured sheet in the manifest, writes two files to art/previews/:
//   <name>.png     the recoloured sheet at its real size. Open it in Aseprite
//                  to touch it up and save it as a drawn variant instead.
//   <name>-x4.png  the original and the recolour side by side, 4 times bigger.
function makePreviews(): void {
  const manifest = JSON.parse(readFileSync(join(SPRITES, 'manifest.json'), 'utf8'));
  const recolours = Object.entries(manifest.sheets as Record<string, any>).filter(([, s]) => s.recolour);
  if (recolours.length === 0) return;
  mkdirSync(PREVIEWS, { recursive: true });
  for (const [name, sheet] of recolours) {
    const file = manifest.sheets[sheet.from]?.file;
    if (!file) {
      console.warn(`! ${name} is made from "${sheet.from}", which isn't a sheet with a file`);
      continue;
    }
    const original = readPng(readFileSync(join(SPRITES, file)));
    const recoloured = { ...original, data: original.data.slice() };
    for (const swap of recolourPixels(recoloured.data, sheet.recolour, PALETTE))
      console.warn(`! ${name}: ${swap} uses a colour that isn't in the palette`);
    writeFileSync(join(PREVIEWS, `${name}.png`), writePng(recoloured));
    writeFileSync(join(PREVIEWS, `${name}-x4.png`), writePng(scaleUp(sideBySide([original, recoloured], 8), 4)));
  }
  console.log(`Previews of ${recolours.length} recolour${recolours.length === 1 ? '' : 's'} are in art/previews/.`);
}

if (import.meta.url === pathToFileURL(process.argv[1]).href) {
  const args = process.argv.slice(2);
  try {
    if (!args.includes('--previews')) exportAll(args.filter((a) => !a.startsWith('--')));
    makePreviews();
  } catch (err) {
    console.error((err as Error).message);
    process.exit(1);
  }
}
