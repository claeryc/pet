// Opening a backpack a pet brought home from a journey. The bag sits over
// the stat bars (like the item reveal), wiggling, until it's tapped: then
// the flap flips open with a little hop and some sparkles, and the finds
// come out one by one as reveals.

import { STRINGS } from '../strings';
import { PALETTE } from '../render/palette';

// How long the flap takes to open before the finds come out.
export const BACKPACK_OPEN_MS = 650;
const OUT_MS = 300;

// The bag and its flap, drawn like the other pixel icons (see icons.ts):
// one letter a pixel, "." see-through. The flap sits on top of the bag and
// covers its dark inside until it flips up.
const COLORS: Record<string, string> = {
  k: PALETTE.ink, r: PALETTE.rose, p: PALETTE.pink, y: PALETTE.butter, c: PALETTE.cocoa,
};
const BAG = [
  '......kkkk......',
  '.....kk..kk.....',
  '...kkkkkkkkkk...',
  '..kcccccccccck..',
  '..kcccccccccck..',
  '..krrrrrrrrrrk..',
  '..krrrrrrrrrrk..',
  '..krrrrrrrrrrk..',
  '..krrrrrrrrrrk..',
  '..kkrrrrrrrrkk..',
  '..krkkkkkkkkrk..',
  '..krkppppppkrk..',
  '..krkppppppkrk..',
  '..krkkkkkkkkrk..',
  '..krrrrrrrrrrk..',
  '...kkkkkkkkkk...',
];
const FLAP = [
  '................',
  '................',
  '..kkkkkkkkkkkk..',
  '..kppppppppppk..',
  '..kppppppppppk..',
  '..kppppppppppk..',
  '..kkkkkyykkkkk..',
  '......kyyk......',
  '......kkkk......',
];

function pixels(rows: string[], className: string): string {
  let rects = '';
  rows.forEach((row, y) => [...row].forEach((ch, x) => {
    if (COLORS[ch]) rects += `<rect x="${x}" y="${y}" width="1" height="1" fill="${COLORS[ch]}"/>`;
  }));
  return `<svg class="${className}" viewBox="0 0 16 16" shape-rendering="crispEdges" aria-hidden="true">${rects}</svg>`;
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
      ${pixels(BAG, 'pack-open-body')}${pixels(FLAP, 'pack-open-flap')}
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
