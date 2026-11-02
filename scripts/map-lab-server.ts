// The map lab's half on the dev server (only while `npm run dev` runs; see
// map-lab.html and docs/MAP_GUIDE.md):
//
//   GET  /__map-lab/map?id=island  a map's tap shapes and slices, read
//                                  straight from art/map/<id>.aseprite
//   POST /__map-lab/save           writes the lab's tap shapes and signs,
//                                  pins and flags back into that file, the
//                                  game's <id>.json next to the picture,
//                                  and new areas into src/data/map.json
//
// And it watches: saving a map in Aseprite exports it (when Aseprite is
// installed), and any new export tells the lab page to load it again.

import { spawn } from 'node:child_process';
import { copyFileSync, existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import type { Plugin } from 'vite';
import { packMask, patchMap, readMap, unpackMask } from './aseprite-patch.ts';
import type { AseSlice } from './aseprite.ts';
import { mapData } from './map-data.ts';

const ROOT = fileURLToPath(new URL('..', import.meta.url));
const ART = join(ROOT, 'art/map');
const OUT = join(ROOT, 'public/sprites/map');
const MAP_JSON = join(ROOT, 'src/data/map.json');
const BACKUP = join(ART, '.lab-backup');

export interface LabSave {
  id: string;
  areas: Record<string, string>; // packed masks (see packMask)
  slices: AseSlice[];
  added: { id: string; name: string }[]; // new areas, for map.json
}

const safeId = (id: string) => /^[a-z0-9-]+$/.test(id);

export function loadMap(id: string) {
  if (!safeId(id)) throw new Error('No such map');
  const m = readMap(readFileSync(join(ART, `${id}.aseprite`)));
  const exported = existsSync(join(OUT, `${id}.json`)) ? JSON.parse(readFileSync(join(OUT, `${id}.json`), 'utf8')) : {};
  return {
    width: m.width,
    height: m.height,
    areas: Object.fromEntries(Object.entries(m.areas).map(([a, mask]) => [a, packMask(mask)])),
    slices: m.slices,
    night: !!exported.night,
    locked: exported.locked ?? [],
  };
}

export function saveMap(save: LabSave): string[] {
  if (!safeId(save.id)) throw new Error('No such map');
  const file = join(ART, `${save.id}.aseprite`);
  const before = readFileSync(file);
  const { width, height } = readMap(before);
  const areas = Object.fromEntries(Object.entries(save.areas).map(([a, text]) => [a, unpackMask(text, width * height)]));
  for (const [a, mask] of Object.entries(areas)) if (!mask.some(Boolean)) throw new Error(`${a} has no tap shape: paint some of the map for it first`);
  const after = patchMap(before, { areas, slices: save.slices });

  // The game's file: the shapes as SVG paths, with the signs and pins.
  const exported = existsSync(join(OUT, `${save.id}.json`)) ? JSON.parse(readFileSync(join(OUT, `${save.id}.json`), 'utf8')) : {};
  const all = readMap(after);
  const data = mapData(
    width, height,
    Object.entries(all.areas).map(([a, mask]) => {
      const rgba = new Uint8Array(width * height * 4);
      mask.forEach((on, i) => { if (on) rgba[i * 4 + 3] = 255; });
      return { id: a, pixels: { width, height, data: rgba } };
    }),
    all.slices,
    { night: !!exported.night, locked: exported.locked ?? [] },
  );

  mkdirSync(BACKUP, { recursive: true });
  copyFileSync(file, join(BACKUP, `${save.id}.aseprite`));
  ourWrite = Date.now();
  writeFileSync(file, after);
  writeFileSync(join(OUT, `${save.id}.json`), JSON.stringify(data) + '\n');
  const notes = [`Saved art/map/${save.id}.aseprite (the old one is in art/map/.lab-backup/).`];

  // New areas: a line each in map.json, opening nothing yet. Added as text,
  // so the file keeps its one-area-a-line layout.
  if (save.added.length) {
    let text = readFileSync(MAP_JSON, 'utf8');
    const known: { id: string }[] = JSON.parse(text).maps[save.id]?.areas ?? [];
    const lines = save.added
      .filter((a) => safeId(a.id) && !known.some((x) => x.id === a.id))
      .map((a) => `        { "id": ${JSON.stringify(a.id)}, "name": ${JSON.stringify(a.name || a.id)}, "opens": "soon", "soonText": "Coming later" }`);
    if (lines.length) {
      text = addToAreas(text, save.id, lines);
      JSON.parse(text); // still good JSON, or nothing is written
      writeFileSync(MAP_JSON, text);
      notes.push(`Added ${save.added.map((a) => `"${a.id}"`).join(', ')} to src/data/map.json, opening nothing yet: set "opens" there.`);
    }
  }
  return notes;
}

// Puts `lines` at the end of map `id`'s "areas" list in map.json's text.
export function addToAreas(text: string, id: string, lines: string[]): string {
  const start = text.indexOf(`"${id}": {`);
  const list = start < 0 ? -1 : text.indexOf('"areas": [', start);
  if (list < 0) throw new Error(`map.json has no map "${id}"`);
  let depth = 0;
  for (let i = text.indexOf('[', list); i < text.length; i++) {
    if (text[i] === '[') depth++;
    else if (text[i] === ']' && --depth === 0) {
      const before = text.slice(0, i).replace(/\s*$/, '');
      return `${before},\n${lines.join(',\n')}\n      ${text.slice(i)}`;
    }
  }
  throw new Error('map.json: the areas list never ends');
}

let ourWrite = 0;

async function body(req: NodeJS.ReadableStream): Promise<string> {
  let text = '';
  for await (const part of req) text += part;
  return text;
}

export function mapLab(): Plugin {
  return {
    name: 'map-lab',
    apply: 'serve',
    configureServer(server) {
      server.middlewares.use('/__map-lab/', async (req, res) => {
        const send = (status: number, data: unknown) => {
          res.statusCode = status;
          res.setHeader('content-type', 'application/json');
          res.end(JSON.stringify(data));
        };
        try {
          const url = new URL(req.url ?? '', 'http://lab');
          if (req.method === 'GET' && url.pathname === '/map') return send(200, loadMap(url.searchParams.get('id') ?? ''));
          if (req.method === 'POST' && url.pathname === '/save') return send(200, { notes: saveMap(JSON.parse(await body(req))) });
          send(404, { error: 'Not found' });
        } catch (err) {
          send(400, { error: (err as Error).message });
        }
      });

      // A map saved in Aseprite: export it (needs Aseprite), then the
      // lab hears about the new files.
      server.watcher.add([ART, OUT]);
      let timer: ReturnType<typeof setTimeout> | undefined;
      server.watcher.on('change', (path) => {
        if (path.startsWith(OUT)) {
          clearTimeout(timer);
          timer = setTimeout(() => server.ws.send({ type: 'custom', event: 'map-lab:changed' }), 150);
          return;
        }
        const m = /([a-z0-9-]+)\.aseprite$/.exec(path);
        if (!path.startsWith(ART) || !m || path.includes('.lab-backup') || Date.now() - ourWrite < 3000) return;
        const run = spawn(process.execPath, [join(ROOT, 'scripts/export-art.ts'), `map/${m[1]}`], { cwd: ROOT });
        let out = '';
        run.stdout.on('data', (d) => (out += d));
        run.stderr.on('data', (d) => (out += d));
        run.on('close', (code) => {
          server.ws.send({ type: 'custom', event: 'map-lab:export', data: { ok: code === 0, map: m[1], text: out.trim() } });
        });
      });
    },
  };
}
