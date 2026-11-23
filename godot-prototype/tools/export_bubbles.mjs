// Writes the map's round bubbles (src/ui/mapBubbles.ts) as SVG files the
// Godot prototype imports, one per icon. Run from the repository root:
//   node godot-prototype/tools/export_bubbles.mjs
import { writeFileSync, mkdirSync } from 'node:fs';
import { bubbleHtml } from '../../src/ui/mapBubbles.ts';

const OUT = 'godot-prototype/art/map/bubbles';
mkdirSync(OUT, { recursive: true });
for (const icon of ['fish', 'dig', 'water', 'crop', 'mail', 'trip', 'lock', 'star', 'visitor', 'project', 'honey']) {
  const html = bubbleHtml(icon);
  const shape = html.match(/<svg class="map-bubble-shape" viewBox="0 0 54 66" aria-hidden="true">(.*?)<\/svg>/s)[1];
  const inner = html.match(/<svg class="map-bubble-icon" viewBox="0 0 40 40" aria-hidden="true">(.*?)<\/svg>/s)[1];
  // The icon sits in the middle, 41% down, 58% of the bubble's width.
  const w = 54 * 0.58, x = 27 - w / 2, y = 66 * 0.41 - w / 2;
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="54" height="66" viewBox="0 0 54 66">${shape}`
    + `<svg x="${x}" y="${y}" width="${w}" height="${w}" viewBox="0 0 40 40">${inner}</svg></svg>`;
  writeFileSync(`${OUT}/${icon}.svg`, svg);
}
console.log('bubbles written');
