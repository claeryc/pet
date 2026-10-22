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
