// Opening the backpack a pet brought home from a journey: a cloth sack
// tied with a rope. It sits over the stat bars (like the item reveal),
// wiggling, until it's tapped: then the knot flies off, the sack flops
// open with a little hop and some sparkles, and the finds come out one by
// one as reveals.

import { STRINGS } from '../strings';

// How long the sack takes to open before the finds come out.
export const BACKPACK_OPEN_MS = 650;
const OUT_MS = 300;

// The sack, drawn like the other pixel icons (see icons.ts): one letter a
// pixel, "." see-through. A cloth bag tied at the neck with a rope; open,
// its mouth flops wide. The knot is drawn on its own so it can fly off.
const COLORS: Record<string, string> = {
  k: '#3b1f14', D: '#7a3f22', M: '#b5653a', H: '#d9915a', L: '#efc995', r: '#e6c79a', R: '#a8875e', c: '#4a2616',
};
const TIED = [
  '..................',
  '.....kk.kk.kk.....',
  '....kHMkMHkMDk....',
  '....kMHMMMMMDk....',
  '.....kDMMMMDk.....',
  '.....kRrrrrRk.kk..',
  '....kkRrrrrRkkrrk.',
  '...kMMkkkkkkMkkrk.',
  '..kMHLHMMMMMMDkk..',
  '.kMHLLHMMMMMMMDk..',
  '.kMHHHMMMMMMMMDk..',
  '.kMHHMMMMMMMMMDk..',
  '.kMMMMMMMMMMMDDk..',
  '.kDMMMMMMMMMMDDk..',
  '..kDMMMMMMMMDDk...',
  '...kkDDDMMDDkk....',
  '.....kkkkkkkk.....',
  '..................',
];
const OPEN = [
  '..................',
  '..................',
  '..................',
  '..kk..........kk..',
  '.kHMk.kkkkkk.kMDk.',
  '.kMMMkccccccckMDk.',
  '..kMkcccccccccDk..',
  '..kMkcccccccccDk..',
  '..kMHkcccccccDMk..',
  '.kMHLHkkkkkkkMMDk.',
  '.kMHLLHMMMMMMMMDk.',
  '.kMHHHMMMMMMMMMDk.',
  '.kMMMMMMMMMMMMDDk.',
  '.kDMMMMMMMMMMMDDk.',
  '..kDMMMMMMMMMDDk..',
  '...kkDDDMMMDDkk...',
  '.....kkkkkkkkk....',
  '..................',
];
const KNOT = [
  '..................',
  '..................',
  '..................',
  '..................',
  '..................',
  '.....kRrrrrRk.kk..',
  '....kkRrrrrRkkrrk.',
  '...........kkkrk..',
];

function pixels(rows: string[], className: string): string {
  let rects = '';
  rows.forEach((row, y) => [...row].forEach((ch, x) => {
    if (COLORS[ch]) rects += `<rect x="${x}" y="${y}" width="1" height="1" fill="${COLORS[ch]}"/>`;
  }));
  return `<svg class="${className}" viewBox="0 0 18 18" shape-rendering="crispEdges" aria-hidden="true">${rects}</svg>`;
}

export interface Backpack {
  el: HTMLElement;
  // Shows `name`'s backpack; `onOpen` runs once it's tapped open.
  show: (name: string, onOpen: () => void) => void;
}

export function createBackpack(): Backpack {
  const T = STRINGS.journeys;
  const el = document.createElement('button');
  el.className = 'pack-open';
  el.hidden = true;
  el.innerHTML = `
    <b class="pack-open-title"></b>
    <span class="pack-open-bag">
      <span class="pack-open-glow" aria-hidden="true"></span>
      ${pixels(TIED, 'pack-open-tied')}${pixels(OPEN, 'pack-open-open')}${pixels(KNOT, 'pack-open-knot')}
      <i class="pack-open-spark s1" aria-hidden="true">✦</i><i class="pack-open-spark s2" aria-hidden="true">✧</i>
      <i class="pack-open-spark s3" aria-hidden="true">✦</i><i class="pack-open-spark s4" aria-hidden="true">✧</i>
    </span>
    <small class="pack-open-hint">${T.tapToOpenBag}</small>`;
  const title = el.querySelector<HTMLElement>('.pack-open-title')!;
  let opened: (() => void) | null = null;
  let timer = 0;

  el.addEventListener('click', () => {
    const open = opened;
    if (!open) return;
    opened = null;
    el.classList.add('is-open');
    timer = window.setTimeout(() => {
      open();
      el.classList.add('out');
      timer = window.setTimeout(() => (el.hidden = true), OUT_MS);
    }, BACKPACK_OPEN_MS);
  });

  return {
    el,
    show(name, onOpen) {
      if (opened) return; // already waiting to be opened
      clearTimeout(timer);
      opened = onOpen;
      title.textContent = T.backpackOf(name);
      el.setAttribute('aria-label', `${T.backpackOf(name)}. ${T.tapToOpenBag}`);
      el.hidden = false;
      el.classList.remove('is-open', 'out');
      void el.offsetHeight;
      el.classList.add('in');
    },
  };
}
