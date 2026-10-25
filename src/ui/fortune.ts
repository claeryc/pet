// The fortune cookie, opened on top of the mingle card: it wobbles,
// cracks down the middle and breaks in two, crumbs fly, and the slip
// unrolls with the fortune and some lucky numbers. All of it is CSS
// (style.css, "The fortune cookie"), timed from when the card opens.
// Tapping it skips to the open slip (skipFortuneOnTap).

import { PALETTE } from '../render/palette';

// The cookie, side on: n outline, y the top, o the shaded underside, w a
// shine. Columns 0-10 are its left half, the rest its right half.
const COOKIE = [
  '......nnnnnnnnnn......',
  '....nnyyyyyyyyyynn....',
  '...nyyyywwyyyyyyyyn...',
  '..nyyywwyyyyyyyyyyyn..',
  '.nyyywyyyyyyyyyyyyyon.',
  '.nyyyyyyyyyyyyyyyyyon.',
  'nyyyyyyyyyyyyyyyyyyoon',
  'nyyyyyyyyonnoyyyyyooon',
  'nooyyyyyon..noyyyoooon',
  'nooooyyon....noyooooon',
  '.nooooon......nooooon.',
  '..nnnnn........nnnnn..',
];
const COLOURS: Record<string, string> = { n: PALETTE.bark, y: PALETTE.butter, o: PALETTE.peach, w: PALETTE.cream };
// The crack, zigzagging down from the top before it breaks.
const CRACK = [[10, 0], [11, 1], [10, 2], [11, 3], [10, 4], [11, 5], [10, 6]];
// Where each crumb flies to, in px from the middle.
const CRUMBS = [[-34, -30], [30, -38], [-46, -6], [42, -2], [6, -48]];

function svg(cls: string, rects: string): string {
  return `<svg class="${cls}" viewBox="0 0 22 12" shape-rendering="crispEdges" aria-hidden="true">${rects}</svg>`;
}

function half(left: boolean): string {
  let rects = '';
  COOKIE.forEach((row, y) => [...row].forEach((ch, x) => {
    if (ch === '.' || left !== x <= 10) return;
    rects += `<rect x="${x}" y="${y}" width="1" height="1" fill="${COLOURS[ch]}"/>`;
  }));
  return rects;
}

const LEFT = svg('fortune-half fortune-left', half(true));
const RIGHT = svg('fortune-half fortune-right', half(false));
const CRACKED = svg('fortune-crack', CRACK.map(([x, y]) => `<rect x="${x}" y="${y}" width="1" height="1" fill="${PALETTE.bark}"/>`).join(''));

const escape = (text: string) => text.replace(/[&<>"]/g, (ch) => `&#${ch.charCodeAt(0)};`);

// The markup for a cookie that opens to `text`, with `lucky` underneath.
export function fortuneArt(text: string, lucky: string): string {
  const crumbs = CRUMBS.map(([dx, dy], i) =>
    `<span class="fortune-crumb" style="--dx:${dx}px;--dy:${dy}px;--c:${i % 2 ? PALETTE.peach : PALETTE.butter}"></span>`).join('');
  return `<div class="fortune">
    <div class="fortune-cookie">${LEFT}${RIGHT}${CRACKED}${crumbs}</div>
    <div class="fortune-slip">
      <p class="fortune-text">${escape(text)}</p>
      <p class="fortune-lucky">${escape(lucky)}</p>
    </div>
  </div>`;
}

// Lets a tap on an opening cookie skip straight to the open slip. Call
// once: it listens on the whole page, since the cookie comes and goes
// with the card it's on.
export function skipFortuneOnTap(): void {
  document.addEventListener('click', (e) => {
    (e.target as Element | null)?.closest?.('.fortune')?.classList.add('skip');
  });
}
