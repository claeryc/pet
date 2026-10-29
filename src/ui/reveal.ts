// The item reveal: when you get something (a fish, a harvest, a dish, a
// seed), it shows off for a moment. The item pops up on a round plate (like
// the kitchen's) in a warm glow, with light turning slowly behind it, its
// name on a pink ribbon underneath and a little tag on top ("New recipe!").
// It fades away by itself, or sooner if you tap it. Several in a row (a
// fish and a lucky seed) take turns.
//
// It only covers the stat bars' spot (or the pond or garden panel sitting
// there), so the buttons below keep working: you can cast again straight
// away. In the kitchen or at the workbench it floats over the wall
// instead, out of the way of the counter. Tapping the reveal skips it.

import { STRINGS } from '../strings';
import { sound, type SoundId } from '../audio/audio';

export interface RevealItem {
  icon: string; // SVG markup
  name: string;
  count: number;
  stars: number; // 0 for none
  caption?: string; // a small line on top, e.g. "Perfect catch!" or "New recipe!"
  tier?: 'bronze' | 'silver' | 'gold'; // a badge: the beams take its colour
  // Played as it shows. Left out when what made it already has its own
  // sound (a catch's splash, a dish coming out of the pot).
  sound?: SoundId;
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
    <div class="reveal-veil" aria-hidden="true"></div>
    <div class="reveal-glow" aria-hidden="true"></div>
    <div class="reveal-rays" aria-hidden="true"></div>
    <div class="reveal-body">
      <p class="reveal-caption"></p>
      <div class="reveal-plate" aria-hidden="true">
        <div class="reveal-icon"></div>
        <i class="reveal-spark">✦</i><i class="reveal-spark">✦</i><i class="reveal-spark">✦</i><i class="reveal-spark">✦</i>
      </div>
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
    place();
    // Restart the animations for this item.
    el.hidden = false;
    el.classList.remove('in', 'out');
    void el.offsetHeight;
    el.classList.add('in');
    if (item.sound) sound(item.sound);
    clearTimeout(timer);
    timer = window.setTimeout(leave, REVEAL_MS);
  }

  // In the kitchen (or at the workbench) the stat bars' spot is the front
  // counter, so the reveal floats over the wall above it instead.
  function place(): void {
    const wall = el.parentElement?.querySelector<HTMLElement>(':scope > .kitchen:not([hidden]) .kitchen-room');
    const free = !!wall && wall.offsetHeight > 0;
    el.classList.toggle('is-free', free);
    if (!free) {
      el.style.cssText = '';
      return;
    }
    const box = wall.getBoundingClientRect();
    const slot = el.parentElement!.getBoundingClientRect();
    el.style.inset = 'auto';
    el.style.left = `${box.left - slot.left}px`;
    el.style.top = `${box.top - slot.top}px`;
    el.style.width = `${box.width}px`;
    el.style.height = `${box.height}px`;
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
