// The grow-up reveal: when a pet grows into a teen or (the big one) into
// its grown-up character, the whole screen stops for it. Over a dim
// backdrop, the old look glows as a dark silhouette and wobbles while light
// beams turn behind it, then a flash, and the new look pops out in full
// colour. For a grown-up, its name follows and its stars pop in one at a
// time (gold beams and sparkles for a 3-star), with a "New in the
// Collection!" stamp the first time anyone grows into it.
//
// Tapping during the build-up skips to the reveal; the button closes it.
// Two pets growing up at once take turns.

import { STRINGS } from '../strings';

export interface GrowUp {
  name: string; // the pet's name
  stage: 'teen' | 'adult';
  // Portraits as image URLs (see characterImage in main.ts). They're
  // asked for again while the build-up plays, in case a sprite sheet is
  // still loading.
  before: () => string | undefined;
  after: () => string | undefined;
  character?: string; // "Acornet", or "Acornet (Amber)" (adults only)
  stars?: number; // 1 to 3 (adults only)
  isNew?: boolean; // first time this look was found
}

export interface GrowUpReveal {
  show: (g: GrowUp) => void;
  isOpen: () => boolean;
}

// The build-up (silhouette and wobble) before the flash, and the gap
// between stars popping in. The CSS animations are timed to fit.
const BUILD_MS = 1900;
const STAR_MS = 380;

export function createGrowUpReveal(root: HTMLElement, onChange: (moment: 'flash' | 'star' | 'done') => void): GrowUpReveal {
  const backdrop = document.createElement('div');
  backdrop.className = 'growup';
  backdrop.hidden = true;
  backdrop.setAttribute('role', 'dialog');
  backdrop.setAttribute('aria-modal', 'true');
  backdrop.setAttribute('aria-labelledby', 'growup-title');
  backdrop.innerHTML = `
    <div class="growup-beams" aria-hidden="true"></div>
    <div class="growup-sparkles" aria-hidden="true">${'<span></span>'.repeat(10)}</div>
    <div class="growup-body">
      <p class="growup-caption"></p>
      <div class="growup-stage" aria-hidden="true">
        <span class="growup-glow"></span>
        <span class="growup-pic growup-before portrait"></span>
        <span class="growup-pic growup-after portrait"></span>
        <span class="growup-flash"></span>
      </div>
      <h2 class="growup-title" id="growup-title"></h2>
      <p class="growup-stars" aria-hidden="true"></p>
      <p class="growup-new"></p>
      <button class="btn growup-btn" type="button"></button>
    </div>`;
  root.append(backdrop);
  const q = <T extends HTMLElement>(sel: string) => backdrop.querySelector<T>(sel)!;
  const caption = q('.growup-caption');
  const beforePic = q('.growup-before');
  const afterPic = q('.growup-after');
  const title = q('.growup-title');
  const stars = q('.growup-stars');
  const stamp = q('.growup-new');
  const button = q<HTMLButtonElement>('.growup-btn');

  const queue: GrowUp[] = [];
  let current: GrowUp | null = null;
  let timers: number[] = [];
  let revealed = false;

  const later = (ms: number, f: () => void) => timers.push(window.setTimeout(f, ms));
  const picture = (el: HTMLElement, url: string | undefined) => {
    el.style.backgroundImage = url ? `url('${url}')` : '';
  };

  function start(g: GrowUp): void {
    current = g;
    revealed = false;
    const S = STRINGS.growUp;
    backdrop.className = `growup is-building is-${g.stage} stars-${g.stars ?? 0}`;
    backdrop.hidden = false;
    caption.textContent = S.building(g.name);
    title.textContent = '';
    stars.replaceChildren();
    stamp.textContent = '';
    button.hidden = true;
    picture(beforePic, g.before());
    picture(afterPic, g.after());
    // Sheets that were still loading: try again while it builds up.
    for (let ms = 300; ms < BUILD_MS; ms += 300) {
      later(ms, () => {
        if (!beforePic.style.backgroundImage) picture(beforePic, g.before());
        if (!afterPic.style.backgroundImage) picture(afterPic, g.after());
      });
    }
    later(BUILD_MS, reveal);
  }

  function reveal(): void {
    const g = current;
    if (!g || revealed) return;
    revealed = true;
    timers.forEach(clearTimeout);
    timers = [];
    if (!afterPic.style.backgroundImage) picture(afterPic, g.after());
    const S = STRINGS.growUp;
    backdrop.classList.replace('is-building', 'is-revealed');
    onChange('flash');
    caption.textContent = g.stage === 'adult' ? S.grewInto(g.name) : S.teen(g.name);
    title.textContent = g.stage === 'adult' ? (g.character ?? '') : g.name;
    button.textContent = S.hello(g.stage === 'adult' ? (g.character ?? g.name) : g.name);
    const count = g.stage === 'adult' ? (g.stars ?? 1) : 0;
    stars.setAttribute('aria-label', STRINGS.stars(count));
    // Stars pop in one at a time after the name, then the stamp and button.
    for (let i = 0; i < count; i++) {
      later(700 + i * STAR_MS, () => {
        const star = document.createElement('span');
        star.className = 'growup-star';
        star.textContent = '★';
        stars.append(star);
        onChange('star');
      });
    }
    later(700 + count * STAR_MS + 150, () => {
      if (g.isNew) stamp.textContent = S.newInCollection;
      button.hidden = false;
      button.focus();
    });
  }

  function close(): void {
    timers.forEach(clearTimeout);
    timers = [];
    current = null;
    const next = queue.shift();
    if (next) return start(next);
    backdrop.hidden = true;
    onChange('done');
  }

  backdrop.addEventListener('click', (e) => {
    if (!revealed) return reveal();
    if (e.target === button) close();
  });

  return {
    show(g) {
      if (current) queue.push(g);
      else start(g);
    },
    isOpen: () => current !== null,
  };
}
