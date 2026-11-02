// Turns a map's Aseprite layers into what the game needs to make the map
// tappable (see docs/MAP_GUIDE.md):
//
//   - each "area:<id>" layer is the shape you tap for that area. Whatever is
//     painted on it counts, in any colour. It becomes an SVG path made of
//     rectangles, so it matches the painted pixels exactly.
//   - a slice called "label:<id>" says where the area's name sign goes (the
//     middle of its bottom edge), and "pin:<id>" where the pet, the boat or
//     a dot sits (its middle). Without them, both go in the middle of the
//     area's shape.
//
// Plain functions, no Aseprite, so they're easy to test. export-art.ts and
// make-map-art.ts use them.

import type { Pixels } from './png.ts';
import type { AseSlice } from './aseprite.ts';

export interface MapArea {
  shape: string; // SVG path, in map pixels
  box: [number, number, number, number]; // x, y, width, height
  label: [number, number];
  pin: [number, number];
}

export interface MapFile {
  width: number;
  height: number;
  night: boolean; // there's a <name>-night.png with the lights
  locked: string[]; // areas with a <name>-locked-<id>.png cover (clouds)
  areas: Record<string, MapArea>;
}

// The painted pixels of a layer (anything not fully see-through).
export function maskOf(pixels: Pixels): boolean[] {
  const mask: boolean[] = [];
  for (let i = 0; i < pixels.width * pixels.height; i++) mask.push(pixels.data[i * 4 + 3] > 0);
  return mask;
}

// The mask as one SVG path of rectangles: runs of painted pixels in a row,
// joined with the same run in the rows below.
export function pathOf(mask: readonly boolean[], width: number, height: number): string {
  const rects: { x: number; y: number; w: number; h: number }[] = [];
  let open = new Map<string, { x: number; y: number; w: number; h: number }>();
  for (let y = 0; y < height; y++) {
    const next = new Map<string, { x: number; y: number; w: number; h: number }>();
    let x = 0;
    while (x < width) {
      if (!mask[y * width + x]) { x++; continue; }
      let end = x;
      while (end < width && mask[y * width + end]) end++;
      const key = `${x}-${end}`;
      const rect = open.get(key);
      if (rect) { rect.h++; next.set(key, rect); open.delete(key); }
      else next.set(key, { x, y, w: end - x, h: 1 });
      x = end;
    }
    for (const r of open.values()) rects.push(r);
    open = next;
  }
  for (const r of open.values()) rects.push(r);
  rects.sort((a, b) => a.y - b.y || a.x - b.x);
  return rects.map((r) => `M${r.x} ${r.y}h${r.w}v${r.h}h-${r.w}z`).join('');
}

// Where the middle of a shape is: its centre of mass, or if that's outside
// the shape (a crescent), the painted pixel nearest to it.
export function middleOf(mask: readonly boolean[], width: number, height: number): [number, number] {
  let sx = 0, sy = 0, n = 0;
  for (let y = 0; y < height; y++) for (let x = 0; x < width; x++) if (mask[y * width + x]) { sx += x; sy += y; n++; }
  if (n === 0) return [0, 0];
  const cx = Math.round(sx / n), cy = Math.round(sy / n);
  if (mask[cy * width + cx]) return [cx, cy];
  let best: [number, number] = [cx, cy], bd = Infinity;
  for (let y = 0; y < height; y++) for (let x = 0; x < width; x++) {
    if (!mask[y * width + x]) continue;
    const d = (x - cx) ** 2 + (y - cy) ** 2;
    if (d < bd) { bd = d; best = [x, y]; }
  }
  return best;
}

function boxOf(mask: readonly boolean[], width: number, height: number): [number, number, number, number] {
  let x0 = width, y0 = height, x1 = -1, y1 = -1;
  for (let y = 0; y < height; y++) for (let x = 0; x < width; x++) {
    if (!mask[y * width + x]) continue;
    x0 = Math.min(x0, x); y0 = Math.min(y0, y); x1 = Math.max(x1, x); y1 = Math.max(y1, y);
  }
  return x1 < 0 ? [0, 0, 0, 0] : [x0, y0, x1 - x0 + 1, y1 - y0 + 1];
}

// The area id in a layer name ("area:backyard" -> "backyard"), or null.
export function layerArea(name: string, kind = 'area'): string | null {
  const m = new RegExp(`^${kind}\\s*:\\s*([a-z0-9-]+)$`, 'i').exec(name.trim());
  return m ? m[1].toLowerCase() : null;
}

export function mapData(
  width: number,
  height: number,
  areas: { id: string; pixels: Pixels }[],
  slices: AseSlice[],
  extras: { night: boolean; locked: string[] },
): MapFile {
  const slice = (name: string) => slices.find((s) => s.name.trim().toLowerCase() === name);
  const out: Record<string, MapArea> = {};
  for (const { id, pixels } of areas) {
    if (pixels.width !== width || pixels.height !== height) throw new Error(`area:${id} isn't the size of the map (${width}x${height})`);
    const mask = maskOf(pixels);
    if (!mask.some(Boolean)) throw new Error(`area:${id} is empty: paint the shape you tap for it`);
    const middle = middleOf(mask, width, height);
    const l = slice(`label:${id}`);
    const p = slice(`pin:${id}`);
    out[id] = {
      shape: pathOf(mask, width, height),
      box: boxOf(mask, width, height),
      label: l ? [l.x + Math.round(l.width / 2), l.y + l.height] : middle,
      pin: p ? [p.x + Math.round(p.width / 2), p.y + Math.round(p.height / 2)] : middle,
    };
  }
  return { width, height, night: extras.night, locked: extras.locked, areas: out };
}
