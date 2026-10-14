// The home screen: the pet's room, its stat bars, status messages and the
// action buttons. This file only shows things and passes button presses on.
// The rules for what each button actually does live in src/game/actions.ts.

import { STRINGS } from '../strings';
import { CONFIG } from '../game/config';
import { getLook, isNight, isRecovering } from '../game/stats';
import { stageLengthMs } from '../game/growth';
import type { GameState, PetStats } from '../game/state';
import { createMenu, type DebugCallbacks } from './menu';
import { createDrawer, type DrawerOption, type Effect } from './drawer';
import { ITEM_ICONS, STAT_ICONS } from './icons';
import type { ActivityId, Food, FoodId } from '../game/actions';

export interface HomeCallbacks extends DebugCallbacks {
  onFeed: (food: FoodId) => void;
  onPlay: (activity: ActivityId) => void;
  onLights: () => void;
  onMedicine: () => void;
  onReset: () => void;
}

export interface HomeScreen {
  canvas: HTMLCanvasElement;
  update: (state: GameState, now: number) => void;
  toast: (message: string) => void;
}

// Pixel icons drawn on a 12x12 grid, so they match the pixel-art style.
const GEAR_ICON = `
  <svg viewBox="0 0 12 12" width="24" height="24" shape-rendering="crispEdges" aria-hidden="true">
    <path fill="currentColor" d="M4 0h4v1H4zM1 1h2v1H1zM4 1h4v1H4zM9 1h2v1H9zM1 2h10v1H1zM2 3h8v1H2zM1 4h4v1H1zM7 4h4v1H7zM0 5h4v1H0zM8 5h4v1H8zM0 6h4v1H0zM8 6h4v1H8zM1 7h4v1H1zM7 7h4v1H7zM2 8h8v1H2zM1 9h10v1H1zM1 10h2v1H1zM4 10h4v1H4zM9 10h2v1H9zM4 11h4v1H4z"/>
  </svg>`;
const MOON_ICON = `
  <svg viewBox="0 0 12 12" width="24" height="24" shape-rendering="crispEdges" aria-hidden="true">
    <path fill="currentColor" d="M4 1h4v1H4zM2 2h3v1H2zM1 3h3v2H1zM0 5h4v2H0zM1 7h4v1H1zM1 8h10v1H1zM2 9h8v1H2zM4 10h4v1H4zM6 7h5v1H6zM8 6h3v1H8z"/>
  </svg>`;
const SUN_ICON = `
  <svg viewBox="0 0 12 12" width="24" height="24" shape-rendering="crispEdges" aria-hidden="true">
    <path fill="currentColor" d="M5 0h2v2H5zM1 1h2v2H1zM9 1h2v2H9zM4 3h4v1H4zM3 4h6v4H3zM4 8h4v1H4zM0 5h2v2H0zM10 5h2v2h-2zM1 9h2v2H1zM9 9h2v2H9zM5 10h2v2H5z"/>
  </svg>`;

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
      fill.style.width = `${v}%`;
      fill.classList.toggle('low', v < CONFIG.lowStatThreshold);
      value.textContent = String(Math.round(v));
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

// "4h 12m" style text for a length of time.
function formatDuration(ms: number): string {
  const totalMinutes = Math.max(0, Math.ceil(ms / 60_000));
  const d = Math.floor(totalMinutes / 1440);
  const h = Math.floor((totalMinutes % 1440) / 60);
  const m = totalMinutes % 60;
  if (d > 0) return `${d}d ${h}h`;
  return h > 0 ? `${h}h ${m}m` : `${m}m`;
}

function formatClock(time: number): string {
  const d = new Date(time);
  const day = d.toLocaleDateString('en', { weekday: 'short' });
  const hm = d.toLocaleTimeString('en', { hour: '2-digit', minute: '2-digit', hour12: false });
  return `${day} ${hm} · ${isNight(time) ? STRINGS.clock.night : STRINGS.clock.day}`;
}

export function createHomeScreen(root: HTMLElement, cb: HomeCallbacks): HomeScreen {
  root.innerHTML = '';

  const title = document.createElement('h1');
  title.textContent = STRINGS.title;

  const clock = document.createElement('p');
  clock.className = 'clock';

  // "Mochi · Baby · 3h old"
  const age = document.createElement('p');
  age.className = 'age';

  const canvas = document.createElement('canvas');
  canvas.className = 'room';

  const mood = document.createElement('p');
  mood.className = 'mood';

  // Warning / sick / recovering banner, hidden when all is well.
  const banner = document.createElement('div');
  banner.className = 'banner';
  const bannerText = document.createElement('p');
  const medicine = button(STRINGS.buttons.medicine, 'btn btn-medicine', cb.onMedicine);
  banner.append(bannerText, medicine);

  const bars: Record<keyof PetStats, ReturnType<typeof statBar>> = {
    hunger: statBar(STRINGS.stats.hunger),
    happiness: statBar(STRINGS.stats.happiness),
    health: statBar(STRINGS.stats.health),
    energy: statBar(STRINGS.stats.energy),
  };
  const stats = document.createElement('div');
  stats.className = 'stats';
  stats.append(...Object.values(bars).map((b) => b.el));

  const actions = document.createElement('div');
  actions.className = 'actions';

  // Turns stat changes like { hunger: 20, energy: -8 } into effect chips.
  const statEffects = (changes: Partial<Record<keyof PetStats, number>>): Effect[] =>
    (Object.entries(changes) as [keyof PetStats, number][])
      .filter(([, v]) => v !== 0)
      .map(([stat, v]) => {
        const text = `${v > 0 ? '+' : ''}${v}`;
        return {
          icon: STAT_ICONS[stat],
          text,
          title: `${text} ${STRINGS.stats[stat]}`,
          kind: v > 0 ? 'up' : 'down',
        };
      });

  // The pet's name, for messages. Updated in update().
  let petName = '';
  let petAsleep = false;
  let petIsEgg = false;
  const drawerSetup = {
    row: actions,
    comingSoon: STRINGS.menu.comingSoon,
    beforeOpen: () =>
      petIsEgg ? STRINGS.blocked.egg(petName) : petAsleep ? STRINGS.blocked.asleep(petName) : null,
    onBlocked: (msg: string) => showToast(msg),
  };

  const feedOptions: DrawerOption[] = CONFIG.foods.map((f: Food) => {
    const effects = statEffects({ hunger: f.hunger, happiness: f.happiness, health: f.health });
    if (f.slowHunger) {
      const { hours, percent } = f.slowHunger;
      effects.push({
        icon: STAT_ICONS.timer,
        text: `${hours}h -${percent}%`,
        title: STRINGS.effects.slowHunger(percent, hours),
        kind: 'timer',
      });
    }
    return {
      icon: ITEM_ICONS[f.id],
      label: STRINGS.foods[f.id],
      effects,
      onPick: () => cb.onFeed(f.id),
    };
  });
  const playOptions: DrawerOption[] = [
    ...CONFIG.activities.map((a) => ({
      icon: ITEM_ICONS[a.id],
      label: STRINGS.activities[a.id],
      effects: statEffects({ happiness: a.happiness, energy: a.energy }),
      onPick: () => cb.onPlay(a.id),
    })),
    // Mini-games arrive in Milestone 4.
    { icon: ITEM_ICONS.catchTreats, label: STRINGS.minigames.catchTreats, effects: [] },
    { icon: ITEM_ICONS.memoryMatch, label: STRINGS.minigames.memoryMatch, effects: [] },
  ];

  const feedDrawer = createDrawer({ id: 'feed', label: STRINGS.buttons.feed, options: feedOptions, ...drawerSetup });
  const playDrawer = createDrawer({ id: 'play', label: STRINGS.buttons.play, options: playOptions, ...drawerSetup });
  const lights = button('', 'btn btn-icon', cb.onLights);

  // The gear button opens the menu (settings, shop and more).
  const menu = createMenu(cb);
  const gear = button('', 'btn btn-icon', menu.open);
  gear.setAttribute('aria-label', STRINGS.buttons.menu);
  gear.innerHTML = GEAR_ICON;

  actions.append(feedDrawer.el, playDrawer.el, lights, gear);

  // A short message that pops up and fades, e.g. "Mochi is asleep".
  const toastEl = document.createElement('div');
  toastEl.className = 'toast';
  let toastTimer = 0;
  function showToast(message: string): void {
    toastEl.textContent = message;
    toastEl.classList.add('show');
    clearTimeout(toastTimer);
    toastTimer = window.setTimeout(() => toastEl.classList.remove('show'), 2500);
  }

  root.append(title, clock, age, canvas, mood, banner, stats, actions, menu.el, toastEl);

  return {
    canvas,
    update(state, now) {
      const pet = state.pet;
      petName = pet.name;
      petAsleep = pet.asleep;
      const isEgg = pet.stage === 'egg';
      petIsEgg = isEgg;
      for (const key of Object.keys(bars) as (keyof PetStats)[]) bars[key].set(pet.stats[key]);
      stats.hidden = isEgg; // an egg has no needs yet
      clock.textContent = formatClock(now);
      age.textContent = `${pet.name} · ${STRINGS.age(STRINGS.stages[pet.stage], formatDuration(now - pet.bornAt))}`;
      mood.textContent = isEgg ? STRINGS.mood.egg(pet.name) : STRINGS.mood[getLook(pet)](pet.name);

      // Banner: hatching countdown, or sick beats recovering beats warning.
      let text = '';
      if (isEgg)
        text = STRINGS.status_egg(formatDuration(pet.stageStartedAt + stageLengthMs('egg') - now));
      else if (pet.condition === 'sick') text = STRINGS.status.sick(pet.name);
      else if (isRecovering(pet, now))
        text = STRINGS.status.recovering(pet.name, formatDuration(pet.recoveryUntil! - now));
      else if (pet.condition === 'warning') text = STRINGS.status.warning(pet.name);
      banner.hidden = text === '';
      banner.dataset.kind = pet.condition === 'sick' ? 'sick' : 'info';
      bannerText.textContent = text;
      medicine.hidden = pet.condition !== 'sick';

      // Lights button shows what pressing it will do.
      const label = pet.asleep ? STRINGS.buttons.lightsOn : STRINGS.buttons.lightsOff;
      lights.innerHTML = pet.asleep ? SUN_ICON : MOON_ICON;
      lights.setAttribute('aria-label', label);
      lights.title = label;
      // Dim Feed and Play while asleep. They still work when tapped, so the
      // game can explain why nothing happened.
      feedDrawer.setDim(pet.asleep || isEgg);
      playDrawer.setDim(pet.asleep || isEgg);
      lights.classList.toggle('dim', isEgg);
      // If the pet falls asleep while a panel is open, close it.
      if (pet.asleep) {
        feedDrawer.close();
        playDrawer.close();
      }

      menu.update(state);
    },
    toast: showToast,
  };
}
