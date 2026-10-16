// The garden. While you garden, the room turns into a little garden with
// the pet on the left and three pots on the right (drawn in
// src/render/garden.ts). Tap a pot in the room, or one of the 1 / 2 / 3
// tabs, to pick it.
//
// A panel slides up over the stat bars, like the pond does for fishing,
// and shows how the picked plant is doing: a water tank that drains as the
// soil dries, a fertilizer tank that empties as the boost wears off, the
// plant's face (happy, sad when dry, ill, wilted), and how long until it's
// ready. The button row becomes [Cancel] plus the buttons for that pot:
//
//   empty: Plant (opens your seeds)    growing: Water, Fertilize
//   sick: Cure, Water                  ready: Harvest
//   dead: Clear
//
// Water is held down: a meter fills while you hold, and letting go in the
// green band is a perfect pour.
//
// How plants grow, and what each button does to them, is decided in
// src/game/garden.ts.

import { STRINGS } from '../strings';
import { CONFIG } from '../game/config';
import {
  CROPS,
  diesAt,
  getCrop,
  isFertilized,
  moisture,
  plotStage,
  progress,
  seedCount,
  supplyCount,
  timeLeft,
  type CropId,
  type PlotStage,
} from '../game/garden';
import type { GameState, Plot } from '../game/state';
import type { Food } from '../game/actions';
import type { GardenScene } from '../render/garden';
import { createDrawer } from './drawer';
import { ITEM_ICONS, STAT_ICONS } from './icons';
import { formatDuration } from './time';

export interface GardenCallbacks {
  onPlant: (pot: number, crop: CropId) => void;
  onWater: (pot: number, perfect: boolean) => void;
  onFertilize: (pot: number) => void;
  onCure: (pot: number) => void;
  onHarvest: (pot: number) => void;
  onClear: (pot: number) => void;
  onExit: () => void;
  toast: (message: string) => void;
}

export interface Garden {
  row: HTMLElement; // the buttons, shown in place of the normal button row
  beds: HTMLElement; // the plant panel, shown in place of the stat bars
  pour: HTMLElement; // the pour meter, shown below the panel while watering
  start: () => void;
  stop: () => void;
  active: () => boolean;
  update: (state: GameState, now: number) => void;
  select: (pot: number) => void; // picks a pot (e.g. tapped in the room)
  scene: () => GardenScene | null; // what the room should draw, while gardening
}

// How long the panel takes to slide in and out (matches .garden in style.css).
export const GARDEN_OUT_MS = 450;
// How long the pour meter stays up after letting go.
const POUR_RESULT_MS = 700;
// Space kept between the garden panel and the open Plant panel.
const PANEL_GAP = 12;

const cropName = (id: string) => STRINGS.foods[id as CropId];
const cropStars = (id: string) => (CONFIG.foods as readonly Food[]).find((f) => f.id === id)?.stars ?? 0;
const FERTILIZER_MS = CONFIG.garden.fertilizer.hours * 3_600_000;

// The little picture on a pot's tab.
function plantIcon(plot: Plot, stage: PlotStage): string {
  if (stage === 'empty') return '';
  if (stage === 'dead') return ITEM_ICONS.plantDead;
  if (stage === 'sick') return ITEM_ICONS.plantSick;
  if (stage === 'ready') return ITEM_ICONS[plot.crop!];
  return progress(plot) < 0.4 ? ITEM_ICONS.plantSprout : ITEM_ICONS.plantGrowing;
}

// How the plant feels: happy, sad when its soil is dry, ill, or wilted.
type Mood = 'happy' | 'sad' | 'ill' | 'wilted';
function moodOf(plot: Plot, stage: PlotStage, now: number): Mood | null {
  if (stage === 'empty') return null;
  if (stage === 'dead') return 'wilted';
  if (stage === 'sick') return 'ill';
  if (stage === 'growing' && moisture(plot, now) <= 0) return 'sad';
  return 'happy';
}
const FACES: Record<Mood, string> = {
  happy: ITEM_ICONS.faceHappy,
  sad: ITEM_ICONS.faceSad,
  ill: ITEM_ICONS.faceIll,
  wilted: ITEM_ICONS.faceWilted,
};

// A small upright tank that fills from the bottom, with an icon under it.
function tank(className: string, icon: string, label: string) {
  const el = document.createElement('div');
  el.className = `garden-tank ${className}`;
  el.setAttribute('role', 'meter');
  el.setAttribute('aria-label', label);
  el.setAttribute('aria-valuemin', '0');
  el.setAttribute('aria-valuemax', '100');
  el.title = label;
  const glass = document.createElement('div');
  glass.className = 'garden-tank-glass';
  const fill = document.createElement('div');
  fill.className = 'garden-tank-fill';
  glass.append(fill);
  const i = document.createElement('span');
  i.className = 'garden-tank-icon';
  i.innerHTML = icon;
  el.append(glass, i);
  return {
    el,
    set(level: number) {
      const pct = Math.round(Math.max(0, Math.min(1, level)) * 100);
      fill.style.height = `${pct}%`;
      el.setAttribute('aria-valuenow', String(pct));
      el.classList.toggle('empty', pct === 0);
    },
  };
}

export function createGarden(cb: GardenCallbacks): Garden {
  let state: GameState | null = null;
  let now = 0;
  let active = false;
  let selected = 0;
  let outTimer = 0;

  // ---- The panel for the picked pot ----
  const beds = document.createElement('div');
  beds.className = 'garden';
  beds.hidden = true;

  // Tabs: 1 / 2 / 3, each with a little picture of what's growing.
  const tabs = document.createElement('div');
  tabs.className = 'garden-tabs';
  tabs.setAttribute('role', 'tablist');
  const tabButtons = Array.from({ length: CONFIG.garden.plots }, (_, i) => {
    const b = document.createElement('button');
    b.className = 'garden-tab';
    b.setAttribute('role', 'tab');
    const num = document.createElement('b');
    num.textContent = String(i + 1);
    const icon = document.createElement('span');
    icon.className = 'garden-tab-icon';
    const drop = document.createElement('span');
    drop.className = 'garden-tab-drop';
    drop.innerHTML = STAT_ICONS.drop;
    drop.setAttribute('aria-hidden', 'true');
    b.append(num, icon, drop);
    b.addEventListener('click', () => select(i));
    return { b, icon };
  });
  tabs.append(...tabButtons.map((t) => t.b));

  // The picked plant: tanks, face, name, growth bar and status.
  const info = document.createElement('div');
  info.className = 'garden-info';
  const waterTank = tank('water', STAT_ICONS.drop, STRINGS.garden.moisture);
  const fertTank = tank('fert', ITEM_ICONS.fertilizer, STRINGS.garden.fertilized);
  const face = document.createElement('span');
  face.className = 'garden-face';
  const details = document.createElement('div');
  details.className = 'garden-details';
  const name = document.createElement('b');
  name.className = 'garden-name';
  const grow = document.createElement('div');
  grow.className = 'garden-grow';
  grow.setAttribute('role', 'progressbar');
  grow.setAttribute('aria-valuemin', '0');
  grow.setAttribute('aria-valuemax', '100');
  const growFill = document.createElement('div');
  growFill.className = 'garden-grow-fill';
  grow.append(growFill);
  const status = document.createElement('small');
  status.className = 'garden-status';
  details.append(name, grow, status);
  info.append(waterTank.el, fertTank.el, face, details);

  // The pour meter, shown just below the panel while you hold Water, so
  // it never covers the tanks.
  const pour = document.createElement('div');
  pour.className = 'catch-bar pour-bar';
  pour.hidden = true;
  pour.setAttribute('role', 'img');
  pour.setAttribute('aria-label', STRINGS.garden.holdToWater);
  const pourTrack = document.createElement('div');
  pourTrack.className = 'catch-track pour-track';
  const { start: bandStart, end: bandEnd } = CONFIG.garden.pour.band;
  pourTrack.style.setProperty('--band-start', `${bandStart * 100}%`);
  pourTrack.style.setProperty('--band-end', `${bandEnd * 100}%`);
  const pourFill = document.createElement('div');
  pourFill.className = 'pour-fill';
  pourTrack.append(pourFill);
  pour.append(pourTrack);
  beds.append(tabs, info);

  // ---- The buttons ----
  const row = document.createElement('div');
  row.className = 'actions garden-row';
  row.hidden = true;
  const btn = (label: string, className = 'btn') => {
    const b = document.createElement('button');
    b.className = className;
    b.textContent = label;
    return b;
  };
  const cancel = btn(STRINGS.garden.cancel, 'btn btn-soft');

  // Plant: a panel listing your seeds.
  const seedOptions = CROPS.map((c) => ({
    icon: ITEM_ICONS[`seed_${c.id}`],
    label: STRINGS.garden.seedName(cropName(c.id)),
    effects: [{ icon: STAT_ICONS.timer, text: `${c.hours}h`, title: `${c.hours}h`, kind: 'timer' as const }],
    onPick: () => cb.onPlant(selected, c.id as CropId),
  }));
  const plantDrawer = createDrawer({
    id: 'plant',
    label: STRINGS.garden.plant,
    options: seedOptions,
    row,
    comingSoon: STRINGS.menu.comingSoon,
    beforeOpen: () => (state && CROPS.some((c) => seedCount(state!, c.id as CropId) > 0) ? null : STRINGS.garden.noSeeds),
    onBlocked: cb.toast,
    onOpen: () => fitPanel(),
  });
  const waterBtn = btn(STRINGS.garden.water, 'btn garden-water');
  const fertilizeBtn = btn(STRINGS.garden.fertilize);
  const cureBtn = btn(STRINGS.garden.cure);
  const harvestBtn = btn(STRINGS.garden.harvest);
  const clearBtn = btn(STRINGS.garden.clear);
  row.append(cancel, plantDrawer.el, waterBtn, cureBtn, fertilizeBtn, harvestBtn, clearBtn);

  // Keeps the open Plant panel below the pots, so they stay in view.
  function fitPanel(): void {
    const list = plantDrawer.el.querySelector<HTMLElement>('.drawer-options')!;
    const room = row.getBoundingClientRect().bottom - beds.getBoundingClientRect().bottom - PANEL_GAP;
    const chrome = 52 + 6 + 16;
    list.style.setProperty('--fit', `${Math.max(120, Math.floor(room - chrome))}px`);
  }

  fertilizeBtn.addEventListener('click', () => cb.onFertilize(selected));
  cureBtn.addEventListener('click', () => cb.onCure(selected));
  harvestBtn.addEventListener('click', () => cb.onHarvest(selected));
  clearBtn.addEventListener('click', () => cb.onClear(selected));
  cancel.addEventListener('click', () => {
    stop();
    cb.onExit();
  });

  // ---- Hold to water ----
  let pourStart = 0;
  let pourFrame = 0;
  let pouring = false;
  let pourTimer = 0;
  const fillMs = CONFIG.garden.pour.fillSeconds * 1000;
  const levelAt = (t: number) => Math.min(1, (t - pourStart) / fillMs);

  function startPour(): void {
    if (pouring) return;
    pouring = true;
    clearTimeout(pourTimer);
    pourStart = performance.now();
    pour.hidden = false;
    delete pour.dataset.result;
    waterBtn.classList.add('pouring');
    const tick = (t: number) => {
      const level = levelAt(t);
      pourFill.style.width = `${(level * 100).toFixed(1)}%`;
      if (level >= 1) return endPour(); // the can is empty: it overflowed
      pourFrame = requestAnimationFrame(tick);
    };
    pourFrame = requestAnimationFrame(tick);
  }

  function endPour(): void {
    if (!pouring) return;
    pouring = false;
    cancelAnimationFrame(pourFrame);
    waterBtn.classList.remove('pouring');
    const level = levelAt(performance.now());
    pourFill.style.width = `${(level * 100).toFixed(1)}%`;
    const perfect = level >= bandStart && level <= bandEnd;
    pour.dataset.result = perfect ? 'perfect' : 'ok';
    cb.onWater(selected, perfect);
    pourTimer = window.setTimeout(() => (pour.hidden = true), POUR_RESULT_MS);
  }

  waterBtn.addEventListener('pointerdown', (e) => {
    e.preventDefault();
    waterBtn.setPointerCapture?.(e.pointerId);
    startPour();
  });
  waterBtn.addEventListener('pointerup', endPour);
  waterBtn.addEventListener('pointercancel', endPour);
  waterBtn.addEventListener('lostpointercapture', endPour);
  waterBtn.addEventListener('contextmenu', (e) => e.preventDefault()); // long press on phones
  waterBtn.addEventListener('keydown', (e) => {
    if (e.key !== 'Enter' && e.key !== ' ') return;
    e.preventDefault();
    if (!e.repeat) startPour();
  });
  waterBtn.addEventListener('keyup', (e) => {
    if (e.key !== 'Enter' && e.key !== ' ') return;
    e.preventDefault();
    endPour();
  });

  function select(i: number): void {
    if (pouring) return;
    selected = i;
    plantDrawer.close();
    render();
  }

  // Redraws the panel and buttons from the latest state.
  function render(): void {
    if (!state) return;
    const s = state;
    s.garden.forEach((plot, i) => {
      const t = tabButtons[i];
      const stage = plotStage(plot);
      t.b.classList.toggle('selected', i === selected);
      t.b.setAttribute('aria-selected', String(i === selected));
      t.b.classList.toggle('dry', (stage === 'growing' || stage === 'sick') && moisture(plot, now) <= 0);
      t.b.dataset.stage = stage;
      t.icon.innerHTML = plantIcon(plot, stage);
      t.b.setAttribute('aria-label', STRINGS.garden.potLabel(i + 1, plot.crop ? cropName(plot.crop) : STRINGS.garden.empty, ''));
    });

    // The picked plant.
    const plot = s.garden[selected];
    const stage = plotStage(plot);
    beds.dataset.stage = stage;
    const wet = moisture(plot, now);
    const tended = stage === 'growing' || stage === 'sick';
    waterTank.set(tended ? wet : 0);
    fertTank.set(stage === 'growing' ? (plot.fertilizedUntil - now) / FERTILIZER_MS : 0);
    const mood = moodOf(plot, stage, now);
    face.innerHTML = mood ? FACES[mood] : ITEM_ICONS.garden;
    face.dataset.mood = mood ?? 'empty';
    face.setAttribute('role', 'img');
    face.setAttribute('aria-label', mood ? STRINGS.garden.moods[mood] : STRINGS.garden.empty);
    face.title = mood ? STRINGS.garden.moods[mood] : '';
    const crop = plot.crop;
    name.textContent = crop
      ? `${cropName(crop)} ${STRINGS.stars(cropStars(crop))}`
      : STRINGS.garden.pot(selected + 1);
    const grown = progress(plot);
    growFill.style.width = `${Math.round(grown * 100)}%`;
    grow.setAttribute('aria-valuenow', String(Math.round(grown * 100)));
    grow.hidden = stage === 'empty';
    status.textContent =
      stage === 'empty' ? STRINGS.garden.emptyHint
      : stage === 'ready' ? STRINGS.garden.ready
      : stage === 'dead' ? STRINGS.garden.dead
      : stage === 'sick' ? STRINGS.garden.diesIn(formatDuration(diesAt(plot)! - now))
      : wet <= 0 ? `${STRINGS.garden.timeLeft(formatDuration(timeLeft(plot, now)))} · ${STRINGS.garden.dry}`
      : STRINGS.garden.timeLeft(formatDuration(timeLeft(plot, now)));
    if (crop) grow.title = `${getCrop(crop).hours}h`;

    // The buttons for the picked pot.
    plantDrawer.el.hidden = stage !== 'empty';
    waterBtn.hidden = stage !== 'growing' && stage !== 'sick';
    fertilizeBtn.hidden = stage !== 'growing';
    cureBtn.hidden = stage !== 'sick';
    harvestBtn.hidden = stage !== 'ready';
    clearBtn.hidden = stage !== 'dead';
    if (stage !== 'empty') plantDrawer.close();
    // Out of something: still tappable, so it can say where to get more.
    const fert = supplyCount(s, 'fertilizer');
    const cures = supplyCount(s, 'plantCure');
    fertilizeBtn.textContent = `${STRINGS.garden.fertilize} ×${fert}`;
    fertilizeBtn.classList.toggle('faded', fert === 0 || isFertilized(s.garden[selected], now));
    cureBtn.textContent = `${STRINGS.garden.cure} ×${cures}`;
    cureBtn.classList.toggle('faded', cures === 0);
    // The seeds you have.
    CROPS.forEach((c, i) => {
      const n = seedCount(s, c.id as CropId);
      plantDrawer.setHidden(i, n === 0);
      plantDrawer.setNote(i, `× ${n}`);
    });
  }

  function stop(): void {
    if (!active) return;
    active = false;
    if (pouring) {
      pouring = false;
      cancelAnimationFrame(pourFrame);
      waterBtn.classList.remove('pouring');
    }
    pour.hidden = true;
    plantDrawer.close();
    row.hidden = true;
    beds.classList.remove('is-in');
    clearTimeout(outTimer);
    outTimer = window.setTimeout(() => (beds.hidden = true), GARDEN_OUT_MS);
  }

  return {
    row,
    beds,
    pour,
    start() {
      active = true;
      // Start on the pot that most needs you, or the first one.
      if (state) {
        const order: PlotStage[] = ['ready', 'sick', 'dead'];
        const urgent = order.map((st) => state!.garden.findIndex((p) => plotStage(p) === st)).find((i) => i >= 0);
        const dry = state.garden.findIndex((p) => plotStage(p) === 'growing' && moisture(p, now) <= 0);
        selected = urgent ?? (dry >= 0 ? dry : 0);
      }
      row.hidden = false;
      clearTimeout(outTimer);
      beds.hidden = false;
      render();
      void beds.offsetHeight;
      beds.classList.add('is-in');
      cb.toast(STRINGS.garden.start);
    },
    stop,
    active: () => active,
    select,
    scene() {
      if (!active || !state) return null;
      return {
        selected,
        pots: state.garden.map((p) => {
          const stage = plotStage(p);
          return {
            stage,
            crop: p.crop,
            grown: progress(p),
            dry: (stage === 'growing' || stage === 'sick') && moisture(p, now) <= 0,
          };
        }),
      };
    },
    update(next, at) {
      state = next;
      now = at;
      if (active) render();
    },
  };
}
