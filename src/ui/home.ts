// The home screen: the pet's room, its stat bars and the action buttons.
// This file only shows things and passes button presses on. The rules for
// what Feed or Play actually do live in src/game/actions.ts.

import { STRINGS } from '../strings';
import { getMood } from '../game/stats';
import type { GameState } from '../game/state';
import { createMenu } from './menu';

export interface HomeCallbacks {
  onFeed: () => void;
  onPlay: () => void;
  onReset: () => void;
}

// A small gear drawn on a 12x12 pixel grid, so it matches the pixel-art style.
const GEAR_ICON = `
  <svg viewBox="0 0 12 12" width="24" height="24" shape-rendering="crispEdges" aria-hidden="true">
    <path fill="currentColor" d="M4 0h4v1H4zM1 1h2v1H1zM4 1h4v1H4zM9 1h2v1H9zM1 2h10v1H1zM2 3h8v1H2zM1 4h4v1H1zM7 4h4v1H7zM0 5h4v1H0zM8 5h4v1H8zM0 6h4v1H0zM8 6h4v1H8zM1 7h4v1H1zM7 7h4v1H7zM2 8h8v1H2zM1 9h10v1H1zM1 10h2v1H1zM4 10h4v1H4zM9 10h2v1H9zM4 11h4v1H4z"/>
  </svg>`;

export interface HomeScreen {
  canvas: HTMLCanvasElement;
  update: (state: GameState) => void;
}

function statBar(label: string): { el: HTMLElement; set: (v: number) => void } {
  const el = document.createElement('div');
  el.className = 'stat';
  el.innerHTML = `
    <span class="stat-label">${label}</span>
    <div class="stat-track"><div class="stat-fill"></div></div>
    <span class="stat-value"></span>`;
  const fill = el.querySelector<HTMLElement>('.stat-fill')!;
  const value = el.querySelector<HTMLElement>('.stat-value')!;
  return {
    el,
    set(v: number) {
      const rounded = Math.round(v);
      fill.style.width = `${v}%`;
      fill.classList.toggle('low', v < 30);
      value.textContent = String(rounded);
    },
  };
}

function button(label: string, className: string, onClick: () => void): HTMLButtonElement {
  const b = document.createElement('button');
  b.textContent = label;
  b.className = className;
  b.addEventListener('click', onClick);
  return b;
}

export function createHomeScreen(root: HTMLElement, cb: HomeCallbacks): HomeScreen {
  root.innerHTML = '';

  const title = document.createElement('h1');
  title.textContent = STRINGS.title;

  const canvas = document.createElement('canvas');
  canvas.className = 'room';

  const mood = document.createElement('p');
  mood.className = 'mood';

  const hunger = statBar(STRINGS.stats.hunger);
  const happiness = statBar(STRINGS.stats.happiness);
  const stats = document.createElement('div');
  stats.className = 'stats';
  stats.append(hunger.el, happiness.el);

  const actions = document.createElement('div');
  actions.className = 'actions';
  actions.append(
    button(STRINGS.buttons.feed, 'btn', cb.onFeed),
    button(STRINGS.buttons.play, 'btn', cb.onPlay),
  );

  // The gear button opens the menu (settings, shop and more).
  const menu = createMenu({ onReset: cb.onReset });
  const gear = button('', 'btn btn-icon', menu.open);
  gear.setAttribute('aria-label', STRINGS.buttons.menu);
  gear.innerHTML = GEAR_ICON;
  actions.append(gear);

  root.append(title, canvas, mood, stats, actions, menu.el);

  return {
    canvas,
    update(state) {
      hunger.set(state.pet.stats.hunger);
      happiness.set(state.pet.stats.happiness);
      mood.textContent = STRINGS.mood[getMood(state.pet.stats)](state.pet.name);
    },
  };
}
