// The item reveal: when you get something (a fish, a harvest, a dish, a
// seed), it shows off over the stat bars for a moment. A soft cloudy fog
// rolls in, light beams turn slowly behind the item, and its name and count
// sit underneath. It fades away by itself, or sooner if you tap it. Several
// in a row (a fish and a lucky seed) take turns.
//
// It only covers the stat bars' spot (or the pond, counter or garden
// panel sitting there), so the buttons below keep working: you can cast
// again straight away. Tapping the reveal skips it.

import { STRINGS } from '../strings';

export interface RevealItem {
  icon: string; // SVG markup
  name: string;
  count: number;
  stars: number; // 0 for none
  caption?: string; // a small line on top, e.g. "Perfect catch!" or "New recipe!"
  tier?: 'bronze' | 'silver' | 'gold'; // a badge: the beams take its colour
}

// How long one reveal stays (the CSS animations are timed to fit).
export const REVEAL_MS = 2200;
const OUT_MS = 300;

export interface Reveal {
  el: HTMLElement;
  show: (item: RevealItem) => void;
}

export function createReveal(): Reveal {
  const el = document.createElement('div');
  el.className = 'reveal';
  el.hidden = true;
  el.setAttribute('role', 'status');
  el.innerHTML = `
    <div class="reveal-fog" aria-hidden="true">
      <span></span><span></span><span></span><span></span><span></span>
    </div>
    <div class="reveal-beams" aria-hidden="true"></div>
    <div class="reveal-body">
      <p class="reveal-caption"></p>
      <div class="reveal-icon" aria-hidden="true"></div>
      <p class="reveal-name"></p>
      <p class="reveal-stars" aria-hidden="true"></p>
    </div>`;
  const caption = el.querySelector<HTMLElement>('.reveal-caption')!;
  const icon = el.querySelector<HTMLElement>('.reveal-icon')!;
  const name = el.querySelector<HTMLElement>('.reveal-name')!;
  const stars = el.querySelector<HTMLElement>('.reveal-stars')!;

  const queue: RevealItem[] = [];
  let timer = 0;
  let showing = false;

  function next(): void {
    const item = queue.shift();
    if (!item) {
      showing = false;
      el.hidden = true;
      return;
    }
    showing = true;
    caption.textContent = item.caption ?? '';
    caption.hidden = !item.caption;
    icon.innerHTML = item.icon;
    name.textContent = STRINGS.reveal.name(item.name, item.count);
    stars.textContent = STRINGS.stars(item.stars);
    stars.hidden = item.stars === 0;
    if (item.tier) el.dataset.tier = item.tier;
    else delete el.dataset.tier;
    // Restart the animations for this item.
    el.hidden = false;
    el.classList.remove('in', 'out');
    void el.offsetHeight;
    el.classList.add('in');
    clearTimeout(timer);
    timer = window.setTimeout(leave, REVEAL_MS);
  }

  function leave(): void {
    clearTimeout(timer);
    el.classList.add('out');
    timer = window.setTimeout(next, OUT_MS);
  }

  el.addEventListener('click', () => {
    if (showing && !el.classList.contains('out')) leave();
  });

  return {
    el,
    show(item) {
      queue.push(item);
      if (!showing) next();
    },
  };
}
