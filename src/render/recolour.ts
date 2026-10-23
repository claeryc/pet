// Colour variants made by swapping palette colours, so they need no drawing
// of their own (see docs/ART_GUIDE.md). Kept free of browser code so
// scripts/export-art.ts can make the same previews the game shows.

// Swaps palette colours in RGBA pixels, in place. `swaps` uses palette
// names, e.g. { "cream": "mint" }, looked up in `palette` (name -> "#rrggbb").
// All swaps happen at once, so { "cream": "mint", "mint": "cream" } trades
// the two. Colours that aren't listed, and see-through pixels, stay as they
// are. Returns the swaps that use a colour missing from the palette.
export function recolourPixels(
  data: Uint8ClampedArray | Uint8Array,
  swaps: Record<string, string>,
  palette: Record<string, string>,
): string[] {
  const rgb = (hex: string) => parseInt(hex.slice(1), 16);
  const map = new Map<number, number>();
  const unknown: string[] = [];
  for (const [from, to] of Object.entries(swaps)) {
    if (!palette[from] || !palette[to]) unknown.push(`${from} -> ${to}`);
    else map.set(rgb(palette[from]), rgb(palette[to]));
  }
  for (let i = 0; i < data.length; i += 4) {
    if (data[i + 3] === 0) continue;
    const to = map.get((data[i] << 16) | (data[i + 1] << 8) | data[i + 2]);
    if (to === undefined) continue;
    data[i] = to >> 16;
    data[i + 1] = (to >> 8) & 0xff;
    data[i + 2] = to & 0xff;
  }
  return unknown;
}

// The outline swaps a set of body swaps calls for, by the outline rule:
// when every body colour a sheet `uses` with one outline is swapped to
// colours that share another outline, that outline is swapped too. An
// outline the swaps already change is left as it is. `outlineOf` maps a
// body colour to its outline (see OUTLINE_OF in palette.ts).
export function outlineSwaps(
  swaps: Record<string, string>,
  uses: readonly string[],
  outlineOf: Partial<Record<string, string>>,
): Record<string, string> {
  const out: Record<string, string> = {};
  const outlines = new Set(uses.map((c) => outlineOf[c]).filter((o): o is string => !!o && uses.includes(o)));
  for (const outline of outlines) {
    if (swaps[outline]) continue;
    const bodies = uses.filter((c) => outlineOf[c] === outline);
    const after = new Set(bodies.map((c) => outlineOf[swaps[c] ?? c]));
    const [to] = after;
    if (after.size === 1 && to && to !== outline) out[outline] = to;
  }
  return out;
}
