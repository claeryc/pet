// Crafting a Revival Star from star fragments. It plays over the stat bars,
// like the item reveal: the five fragments fly in from both sides and lock
// together point-out into a star, the star spins faster and faster, light
// rings burst out from the middle, and the Revival Star pops out of the
// flash with its name underneath. Tapping skips to the end.

import { STRINGS } from '../strings';

// When each step starts, in ms (the CSS in style.css is timed to match).
const LOCK_MS = 1000; // the last fragment has landed
const STAR_MS = 2400; // the flash, and the star appears
const DONE_MS = 4200; // it fades away
const OUT_MS = 300;
const PIECES = 5;

export interface Craft {
  el: HTMLElement;
  // Plays it once. `onLock` and `onStar` fire as those moments happen (for
  // sounds).
  play: (opts: { fragment: string; star: string; onLock?: () => void; onStar?: () => void }) => void;
}

export function createCraft(): Craft {
  const el = document.createElement('div');
  el.className = 'craft';
  el.hidden = true;
  el.setAttribute('role', 'status');
  el.innerHTML = `
    <div class="craft-beams" aria-hidden="true"></div>
    <div class="craft-rings" aria-hidden="true"><span></span><span></span><span></span></div>
    <div class="craft-body" aria-hidden="true"><div class="craft-ring"></div></div>
    <div class="craft-flash" aria-hidden="true"></div>
    <div class="craft-result">
      <div class="craft-star" aria-hidden="true"></div>
      <p class="craft-name"></p>
    </div>`;
  const ring = el.querySelector<HTMLElement>('.craft-ring')!;
  const star = el.querySelector<HTMLElement>('.craft-star')!;
  const name = el.querySelector<HTMLElement>('.craft-name')!;
  let timers: number[] = [];
  let playing = false;
  let starShown: (() => void) | null = null; // fires onStar once

  function stop(): void {
    timers.forEach(clearTimeout);
    timers = [];
  }

  function leave(): void {
    stop();
    el.classList.add('out');
    timers.push(window.setTimeout(() => {
      el.hidden = true;
      el.classList.remove('in', 'out', 'skip');
      playing = false;
    }, OUT_MS));
  }

  // Tapping while it builds jumps to the finished star; tapping once the
  // star is out closes it.
  el.addEventListener('click', () => {
    if (!playing || el.classList.contains('out')) return;
    if (el.classList.contains('skip') || !starShown) return leave();
    el.classList.add('skip');
    stop();
    starShown?.();
    timers.push(window.setTimeout(leave, DONE_MS - STAR_MS));
  });

  return {
    el,
    play({ fragment, star: starIcon, onLock, onStar }) {
      stop();
      ring.innerHTML = '';
      for (let i = 0; i < PIECES; i++) {
        const angle = (360 / PIECES) * i;
        // Fly in from the left or right edge, a little above or below.
        const side = i % 2 === 0 ? -1 : 1;
        const sx = side * 240;
        const sy = (i - 2) * 26;
        // The piece sits rotated, so turn the start point into its frame.
        const rad = (-angle * Math.PI) / 180;
        const lx = sx * Math.cos(rad) - sy * Math.sin(rad);
        const ly = sx * Math.sin(rad) + sy * Math.cos(rad);
        const piece = document.createElement('div');
        piece.className = 'craft-piece';
        piece.style.setProperty('--angle', `${angle}deg`);
        piece.innerHTML = `<div class="craft-fly" style="--fx:${lx.toFixed(1)}px;--fy:${ly.toFixed(1)}px;--delay:${i * 120}ms">${fragment}</div>`;
        ring.append(piece);
      }
      star.innerHTML = starIcon;
      name.textContent = STRINGS.shop.revivalStar;
      el.hidden = false;
      el.classList.remove('in', 'out', 'skip');
      void el.offsetHeight;
      el.classList.add('in');
      playing = true;
      if (onLock) timers.push(window.setTimeout(onLock, LOCK_MS));
      starShown = () => {
        starShown = null;
        onStar?.();
      };
      timers.push(window.setTimeout(() => starShown?.(), STAR_MS));
      timers.push(window.setTimeout(leave, DONE_MS));
    },
  };
}
