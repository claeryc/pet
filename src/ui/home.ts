// The home screen: the pet's room, its stat bars and the action buttons.
// This file only shows things and passes button presses on. The rules for
// what Feed or Play actually do live in src/game/actions.ts.

import { STRINGS } from '../strings';
import { getMood } from '../game/stats';
import type { GameState } from '../game/state';

export interface HomeCallbacks {
  onFeed: () => void;
  onPlay: () => void;
  onReset: () => void;
}

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

  const footer = document.createElement('div');
  footer.className = 'footer';
  footer.append(button(STRINGS.buttons.reset, 'btn-small', cb.onReset));

  root.append(title, canvas, mood, stats, actions, footer);

  return {
    canvas,
    update(state) {
      hunger.set(state.pet.stats.hunger);
      happiness.set(state.pet.stats.happiness);
      mood.textContent = STRINGS.mood[getMood(state.pet.stats)](state.pet.name);
    },
  };
}
