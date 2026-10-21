// The lunchbox for a journey: a wooden bento box seen from above, drawn in
// chunky pixels on a small canvas that CSS scales up. Open, it shows one big
// compartment and two small ones (the food sits on top as icons, see
// .bento-food in style.css). Closed, it has a wooden lid with a pink ribbon
// (the trip's label sits on the ribbon). Chopsticks in a paper sleeve lie
// along the top. The lid slides on and off in steps of a couple of pixels.

// The canvas size in pixels. The places of the compartments and the label
// in style.css are fractions of this.
export const BENTO_WIDTH = 119;
export const BENTO_HEIGHT = 57;

// How many steps the lid takes to go on or come off.
export const LID_FRAMES = 10;
const TOP = 9; // room above the box for the chopsticks
const LID_HEIGHT = 40;

// Where the lid's front edge is when it's `cover` (0 to 1) of the way on,
// in canvas pixels from the top. Everything above it is lid.
export function lidCover(cover: number): number {
  if (cover <= 0) return 0;
  return TOP + Math.min(LID_HEIGHT, Math.round((cover * LID_HEIGHT) / 2) * 2);
}

const OUTLINE = '#4a2a1a';
const RIM = '#f0c185';
const WOOD = '#d4935a';
const LID = '#e2a86c';
const LID_LIGHT = '#f7d39f';
const LID_GRAIN = '#c07f48';
const FRONT = '#a3612f';
const GRAIN = '#8a4f27';
const INSIDE = '#6e3a20';
const FLOOR = '#93553a';
const RIBBON = '#f48fb1';
const RIBBON_EDGE = '#e05a7a';
const STICK = '#f2cf96';
const SLEEVE = '#fff7ec';

// `cover` draws the open box with the lid part of the way on (0 to 1).
export function drawBento(canvas: HTMLCanvasElement, closed: boolean, cover = closed ? 1 : 0): void {
  canvas.width = BENTO_WIDTH;
  canvas.height = BENTO_HEIGHT;
  const g = canvas.getContext('2d');
  if (!g) return;
  g.clearRect(0, 0, BENTO_WIDTH, BENTO_HEIGHT);
  const rect = (x: number, y: number, w: number, h: number, c: string) => {
    g.fillStyle = c;
    g.fillRect(x, y, w, h);
  };
  // A box with its corners cut off in steps, `cut` pixels deep.
  const box = (x: number, y: number, w: number, h: number, c: string, cut: number) => {
    for (let i = 0; i < cut; i++) {
      rect(x + cut - i, y + i, w - 2 * (cut - i), 1, c);
      rect(x + cut - i, y + h - 1 - i, w - 2 * (cut - i), 1, c);
    }
    rect(x, y + cut, w, h - 2 * cut, c);
  };
  const top = TOP;
  const w = BENTO_WIDTH - 2;

  // The box, with its front side showing at the bottom.
  box(1, top, w, 48, OUTLINE, 6);
  box(2, top + 1, w - 2, 46, WOOD, 5);
  rect(3, top + 40, w - 4, 6, FRONT);
  rect(3, top + 39, w - 4, 1, RIM);
  for (const [x, y, len] of [[12, 42, 26], [48, 44, 34], [92, 42, 16], [24, 45, 18]]) rect(x, top + y, len, 1, GRAIN);
  rect(6, top + 1, w - 10, 1, RIM);
  rect(2, top + 5, 1, 32, RIM);

  // The lid, slid down by `dy` (0 = all the way on): drawn only over the
  // box, as if it comes in from the far edge.
  const lid = (dy: number) => {
    const edge = lidCover(cover);
    g.save();
    g.beginPath();
    g.rect(0, top, BENTO_WIDTH, edge - top + (dy === 0 ? 8 : 0));
    g.clip();
    g.translate(0, dy);
    box(2, top, w - 2, 40, OUTLINE, 5);
    box(3, top + 1, w - 4, 38, LID, 4);
    rect(7, top + 2, w - 12, 1, LID_LIGHT);
    for (const [x, y, len] of [[10, 8, 34], [74, 11, 30], [14, 19, 22], [84, 24, 22], [8, 30, 36], [76, 33, 26]]) {
      rect(x, top + y, len, 1, LID_GRAIN);
    }
    rect(3, top + 39, w - 4, 1, GRAIN);
    // The ribbon, over the lid and down the front.
    rect(56, top, 8, 47, RIBBON);
    rect(56, top, 1, 47, RIBBON_EDGE);
    rect(63, top, 1, 47, RIBBON_EDGE);
    g.restore();
  };

  if (!closed) {
    // Inside: the back wall in shadow, the floor, and the dividers.
    rect(7, top + 5, 106, 31, INSIDE);
    rect(7, top + 9, 106, 27, FLOOR);
    rect(6, top + 4, 108, 1, OUTLINE);
    rect(6, top + 36, 108, 1, RIM);
    rect(6, top + 4, 1, 33, OUTLINE);
    rect(113, top + 4, 1, 33, OUTLINE);
    rect(64, top + 5, 4, 31, WOOD);
    rect(64, top + 5, 1, 31, RIM);
    rect(67, top + 5, 1, 31, GRAIN);
    rect(68, top + 19, 45, 3, WOOD);
    rect(68, top + 19, 45, 1, RIM);
    rect(68, top + 21, 45, 1, GRAIN);
  }
  if (cover > 0) lid(lidCover(cover) - top - LID_HEIGHT);

  // Chopsticks in their paper sleeve.
  rect(10, 2, 96, 2, STICK);
  rect(12, 5, 94, 2, STICK);
  rect(10, 1, 96, 1, OUTLINE);
  rect(12, 7, 94, 1, OUTLINE);
  rect(34, 0, 66, 9, SLEEVE);
  rect(34, 0, 66, 1, OUTLINE);
  rect(34, 8, 66, 1, OUTLINE);
  rect(34, 0, 1, 9, OUTLINE);
  rect(99, 0, 1, 9, OUTLINE);
  rect(48, 4, 38, 1, RIBBON_EDGE);
  rect(64, 3, 6, 3, RIBBON_EDGE);
}
