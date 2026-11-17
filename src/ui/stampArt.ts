// Pixel art for the stamp calendar: the ink paw stamp, the binder rings,
// the ribbon-wrapped gift boxes, sparkles and the room chip's calendar.
// Drawn as crisp SVG squares like the rest of the icons.

const P: Record<string, string> = {
  k: '#2b2140', w: '#ffffff', r: '#e05a7a', p: '#f48fb1', u: '#5b3f6e', l: '#a68bc9', b: '#ffe596', o: '#e8b84a',
};

function svg(rows: readonly string[], cls: string, extra: Record<string, string> = {}, style = ''): string {
  const pal = { ...P, ...extra };
  let r = '';
  rows.forEach((row, y) =>
    [...row].forEach((ch, x) => {
      if (pal[ch]) r += `<rect x="${x}" y="${y}" width="1" height="1" fill="${pal[ch]}"/>`;
    }),
  );
  return `<svg class="px ${cls}" style="--c:${rows[0].length};--r:${rows.length};${style}" viewBox="0 0 ${rows[0].length} ${rows.length}" shape-rendering="crispEdges" aria-hidden="true">${r}</svg>`;
}

// The paw: four toe beans and a pad.
const PAW = ['...rr...rr...', '..rrrr.rrrr..', '..rrrr.rrrr..', 'rr.rr...rr.rr', 'rrr.......rrr', 'rrr..rrr..rrr', '.r..rrrrr..r.', '...rrrrrrr...', '..rrrrrrrrr..', '..rrrrrrrrr..', '...rrr.rrr...'];

// A small hash, so each day's stamp misses the same few edge pixels.
function hash(a: number, b: number, c: number): number {
  let h = (a * 73856093) ^ (b * 19349663) ^ (c * 83492791);
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  return ((h ^ (h >>> 16)) >>> 0) / 4294967295;
}

// The ink paw, like a real rubber stamp: a few edge pixels didn't take.
export function inkPaw(seed: number, cls = '', style = ''): string {
  const g = PAW.map((r) => [...r]);
  const edge = (x: number, y: number) => [[1, 0], [-1, 0], [0, 1], [0, -1]].some(([a, b]) => (g[y + b] ?? [])[x + a] !== 'r');
  const rows = g.map((row, y) => row.map((ch, x) => (ch === 'r' && edge(x, y) && hash(x + 1, y + 1, seed + 7) < 0.13 ? '.' : ch)).join(''));
  return svg(rows, `paw ${cls}`, {}, style);
}

// One binder ring at the top of the calendar.
export const ring = (): string => svg(['.ll.', 'luul', 'luul', 'luul', 'luul', 'luul', 'kuuk', '.kk.'], 'ring');

// A ribbon-wrapped gift box, coloured for its week (the last one gold).
const GIFT = ['...kk....kk...', '..kbbk..kbbk..', '..kbbbkkbbbk..', '...kkbbbbkk...', '.kkkkkbbkkkkk.', 'kxxxxkbbkxxxxk', 'kxxxxkbbkxxxxk', 'kkkkkkbbkkkkkk', '.kzzzkbbkzzzk.', '.kzzzkbbkzzzk.', '.kzzzkbbkzzzk.', '.kzzzkbbkzzzk.', '.kkkkkkkkkkkk.'];
const GIFT_COLOURS: Record<string, string>[] = [
  { x: '#f8bfd0', z: '#f48fb1' },
  { x: '#c4e6f7', z: '#9ad3f0' },
  { x: '#c9f1e0', z: '#a8e6cf' },
  { x: '#ffe596', z: '#f6c95a', b: '#e05a7a' },
];
export const gift = (week: number): string => svg(GIFT, 'gift', GIFT_COLOURS[Math.min(3, Math.max(0, week))]);

// Sparkles for the stamp card.
export const spark = (style: string, colours: Record<string, string> = {}): string =>
  svg(['..o..', '..o..', 'ooboo', '..o..', '..o..'], 'spark', colours, style);
export const sparkSmall = (style: string, colours: Record<string, string> = {}): string =>
  svg(['.o.', 'obo', '.o.'], 'spark', colours, style);

// The room chip's little calendar, with a paw on the page.
export const calendarIcon = (): string =>
  svg(['.u..u..u..', 'kkkkkkkkkk', 'krrrrrrrrk', 'krrrrrrrrk', 'kwwwwwwwwk', 'kwwrwwrwwk', 'kwrwwwwrwk', 'kwwwrrwwwk', 'kwwrrrrwwk', 'kwwrrrrwwk', 'kwwwwwwwwk', 'kkkkkkkkkk'], 'chip-ic');
