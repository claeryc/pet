// Little bits of feedback over the room, just for show: the stat changes
// floating up from the pet, hearts where you tap it, food hopping from the
// Feed panel to the pet and being eaten bite by bite, and coins flying to a
// gold counter that ticks up. They all live in one layer laid over the room and clean up after
// themselves. With "reduce motion" on, the moving parts are skipped.

import { STRINGS } from '../strings';
import { CONFIG } from '../game/config';
import type { PetStats } from '../game/state';
import { STAT_ICONS } from './icons';
import { goldPill } from './shop';
import { sound } from '../audio/audio';

// How much each stat changed, or 'full' for one that would have gone up
// but was already full.
export type Gains = Partial<Record<keyof PetStats, number | 'full'>>;

const reduced = () => typeof matchMedia !== 'undefined' && matchMedia('(prefers-reduced-motion: reduce)').matches;

// How long the gold counter stays after it's done counting, in ms.
const GOLD_STAYS_MS = 1600;
// How long food takes to hop over to the pet, in ms.
export const FOOD_HOP_MS = 420;
// The food in front of the pet, as a share of the room's width.
const FOOD_SIZE = 0.13;
// Where each bite but the last is taken, as shares of the food's picture
// (across, down). The last bite takes what's left.
const BITES = [
  [0.85, 0.05],
  [0.15, 0.2],
  [0.6, 0.5],
] as const;

export interface Fx {
  el: HTMLElement; // the layer, placed over the room
  gains: (gains: Gains) => void;
  hearts: (clientX: number, clientY: number) => void;
  feed: (from: HTMLElement, icon: string, then: () => void) => void;
  gold: (from: number, to: number) => void;
}

// `petSpot` says where the pet is in the room, as shares of its width and
// height: its middle across, and how far down its head and mouth are, and
// where food sits in front of it (just under the mouth, so it shows).
export function createFx(petSpot: () => { x: number; head: number; mouth: number; food: number }): Fx {
  const el = document.createElement('div');
  el.className = 'fx';
  el.setAttribute('aria-hidden', 'true');

  // A point on the pet (its head or mouth), in the layer's pixels.
  function petPoint(where: 'head' | 'mouth' | 'food'): { x: number; y: number } {
    const spot = petSpot();
    return { x: el.clientWidth * spot.x, y: el.clientHeight * spot[where] };
  }

  // Removes `node` once its animation has run.
  function once(node: HTMLElement): void {
    node.addEventListener('animationend', () => node.remove(), { once: true });
  }

  // The gold counter: shows up in the corner when gold comes in, counts up,
  // then fades away again so the room stays quiet.
  let counter: HTMLElement | null = null;
  let counterTimer = 0;
  let countFrame = 0;
  function showCounter(value: number): HTMLElement {
    if (!counter) {
      counter = document.createElement('div');
      counter.className = 'fx-gold';
      el.append(counter);
    }
    counter.replaceChildren(goldPill(value));
    counter.classList.remove('out');
    clearTimeout(counterTimer);
    return counter;
  }
  function hideCounterSoon(): void {
    clearTimeout(counterTimer);
    counterTimer = window.setTimeout(() => {
      counter?.classList.add('out');
      counterTimer = window.setTimeout(() => {
        counter?.remove();
        counter = null;
      }, 300);
    }, GOLD_STAYS_MS);
  }

  // The food being eaten right now, if any.
  let eating: HTMLElement | null = null;

  // Takes CONFIG.eating.bites bites out of the food's picture, one pixel
  // at a time (each pixel is one <rect>), with crumbs falling, then it's
  // gone.
  function eatInBites(food: HTMLElement): void {
    const { ms, bites } = CONFIG.eating;
    const pixels = [...food.querySelectorAll('rect')].map((r) => ({
      r,
      x: Number(r.getAttribute('x')) + 0.5,
      y: Number(r.getAttribute('y')) + 0.5,
    }));
    if (pixels.length === 0) return;
    const left = Math.min(...pixels.map((p) => p.x));
    const top = Math.min(...pixels.map((p) => p.y));
    const w = Math.max(...pixels.map((p) => p.x)) - left + 1;
    const h = Math.max(...pixels.map((p) => p.y)) - top + 1;
    const radius = 0.34 * Math.max(w, h);
    // The bites come evenly, the last a little before the pet stops chewing.
    const every = (ms * 0.85) / bites;
    for (let i = 0; i < bites; i++) {
      window.setTimeout(() => {
        if (eating !== food) return;
        const last = i === bites - 1 || i >= BITES.length;
        const [bx, by] = last ? [0, 0] : BITES[i];
        const cx = left + bx * w;
        const cy = top + by * h;
        const gone = pixels.filter((p) => {
          if (!p.r.isConnected) return false;
          if (last) return true;
          // A ragged edge, like teeth marks.
          const jag = ((p.x * 7 + p.y * 3) % 3) * 0.35;
          return Math.hypot(p.x - cx, p.y - cy) < radius + jag;
        });
        crumbs(food, gone, w, h);
        sound('munch');
        for (const p of gone) p.r.remove();
        food.classList.remove('bite');
        void food.offsetWidth;
        food.classList.add('bite');
        if (last) {
          eating = null;
          window.setTimeout(() => food.remove(), 400);
        }
      }, every * (i + 0.5));
    }
  }

  // A few crumbs, in the colours of the bitten pixels, fall from the food.
  function crumbs(food: HTMLElement, gone: { r: SVGRectElement; x: number; y: number }[], w: number, h: number): void {
    const size = food.clientWidth;
    const box = food.getBoundingClientRect();
    const layer = el.getBoundingClientRect();
    for (let i = 0; i < Math.min(3, gone.length); i++) {
      const p = gone[Math.floor(((i + 1) * gone.length) / 4) % gone.length];
      const crumb = document.createElement('span');
      crumb.className = 'fx-crumb';
      crumb.style.background = p.r.getAttribute('fill') ?? '';
      crumb.style.left = `${box.left - layer.left + (p.x / Math.max(12, w)) * size}px`;
      crumb.style.top = `${box.top - layer.top + (p.y / Math.max(12, h)) * size}px`;
      crumb.style.setProperty('--drift', `${(i - 1) * 8}px`);
      el.append(crumb);
      once(crumb);
    }
  }

  return {
    el,

    // "+20" chips for each stat that changed, rising from the pet's head.
    gains(gains) {
      const chips = (Object.entries(gains) as [keyof PetStats, number | 'full'][])
        .map(([stat, v]) => [stat, v === 'full' ? v : Math.round(v)] as const)
        .filter(([, v]) => v !== 0);
      if (chips.length === 0) return;
      const group = document.createElement('div');
      group.className = 'fx-gains';
      const { x, y } = petPoint('head');
      group.style.left = `${x}px`;
      group.style.top = `${y}px`;
      for (const [stat, v] of chips) {
        const chip = document.createElement('span');
        const text = v === 'full' ? STRINGS.effects.full : `${v > 0 ? '+' : ''}${v}`;
        chip.className = `chip-effect chip-${v === 'full' || v > 0 ? 'up' : 'down'}`;
        chip.innerHTML = STAT_ICONS[stat];
        chip.append(text);
        chip.title = `${text} ${STRINGS.stats[stat]}`;
        group.append(chip);
      }
      el.append(group);
      once(group);
    },

    // A couple of hearts floating up from where the pet was tapped.
    hearts(clientX, clientY) {
      if (reduced()) return;
      const box = el.getBoundingClientRect();
      for (let i = 0; i < 2; i++) {
        const heart = document.createElement('span');
        heart.className = 'fx-heart';
        heart.innerHTML = STAT_ICONS.happiness;
        heart.style.left = `${clientX - box.left + (i ? 10 : -8)}px`;
        heart.style.top = `${clientY - box.top}px`;
        heart.style.animationDelay = `${i * 110}ms`;
        el.append(heart);
        once(heart);
      }
    },

    // The food's picture hops from its row in the Feed panel to just in
    // front of the pet, a little bigger, then `then` runs (the pet starts
    // eating) and the food goes in bites.
    feed(from, icon, then) {
      const start = from.getBoundingClientRect();
      if (reduced() || start.width === 0) return then();
      eating?.remove(); // a second helping takes the place of the first
      const box = el.getBoundingClientRect();
      const end = petPoint('food');
      const size = Math.round(el.clientWidth * FOOD_SIZE);
      const food = document.createElement('span');
      food.className = 'fx-food';
      food.innerHTML = icon;
      food.style.width = food.style.height = `${size}px`;
      food.style.left = `${end.x}px`;
      food.style.top = `${end.y}px`;
      el.append(food);
      eating = food;
      const dx = start.left - box.left + start.width / 2 - end.x;
      const dy = start.top - box.top + start.height / 2 - end.y;
      const from1 = start.width / size;
      // From the panel, up in an arc, then down in front of the pet.
      const hop = food.animate(
        [
          { transform: `translate(calc(-50% + ${dx}px), calc(-50% + ${dy}px)) scale(${from1})` },
          { transform: `translate(calc(-50% + ${dx * 0.5}px), calc(-50% + ${dy * 0.5 - 40}px)) scale(${(from1 + 1) / 2})`, offset: 0.5 },
          { transform: 'translate(-50%, -50%) scale(1)' },
        ],
        { duration: FOOD_HOP_MS, easing: 'cubic-bezier(0.4, 0, 0.6, 1)' },
      );
      hop.onfinish = () => {
        if (eating !== food) return;
        then();
        eatInBites(food);
      };
    },

    // Gold came in: coins fly from the pet to the counter, which counts up.
    gold(from, to) {
      if (to <= from) return;
      const box = showCounter(from);
      if (reduced()) {
        showCounter(to);
        hideCounterSoon();
        return;
      }
      const start = petPoint('mouth');
      const target = { x: box.offsetLeft + 16, y: box.offsetTop + box.offsetHeight / 2 };
      const coins = Math.min(5, 2 + Math.floor((to - from) / 20));
      for (let i = 0; i < coins; i++) {
        const coin = document.createElement('span');
        coin.className = 'fx-coin';
        coin.innerHTML = STAT_ICONS.gold;
        coin.style.left = `${start.x}px`;
        coin.style.top = `${start.y}px`;
        el.append(coin);
        const spread = (i - (coins - 1) / 2) * 14;
        coin
          .animate(
            [
              { transform: 'translate(-50%, -50%) scale(0.6)', opacity: 0 },
              { transform: `translate(calc(-50% + ${spread}px), calc(-50% - 24px)) scale(1)`, opacity: 1, offset: 0.3 },
              { transform: `translate(calc(-50% + ${target.x - start.x}px), calc(-50% + ${target.y - start.y}px)) scale(0.8)`, opacity: 1 },
            ],
            { duration: 650, delay: i * 70, easing: 'ease-in', fill: 'backwards' },
          )
          .onfinish = () => coin.remove();
      }
      // Count up once the first coins land.
      cancelAnimationFrame(countFrame);
      const begin = performance.now() + 450;
      const length = 500;
      const tick = (t: number) => {
        const k = Math.max(0, Math.min(1, (t - begin) / length));
        showCounter(Math.round(from + (to - from) * k));
        if (k < 1) countFrame = requestAnimationFrame(tick);
        else {
          counter?.classList.remove('bump');
          void counter?.offsetWidth;
          counter?.classList.add('bump');
          hideCounterSoon();
        }
      };
      countFrame = requestAnimationFrame(tick);
    },
  };
}
