// The garden. While you garden, a bed of grass with three pots slides up
// over the stat bars into a panel of the same size, like the pond does for
// fishing, and the button row becomes [Cancel] plus the buttons for the
// pot you've picked:
//
//   empty: Plant (opens your seeds)    growing: Water, Fertilize
//   sick: Cure, Water                  ready: Harvest
//   dead: Clear
//
// Tap a pot to pick it. Water is held down: a meter fills while you hold,
// and letting go in the green band is a perfect pour.
//
// How plants grow, and what each button does to them, is decided in
// src/game/garden.ts.

import { STRINGS } from '../strings';
import { CONFIG } from '../game/config';
import {
  CROPS,
  diesAt,
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
  beds: HTMLElement; // the pots, shown in place of the stat bars
  start: () => void;
  stop: () => void;
  active: () => boolean;
  update: (state: GameState, now: number) => void;
}

// How long the bed takes to slide in and out (matches .garden in style.css).
export const GARDEN_OUT_MS = 450;
// How long the pour meter stays up after letting go.
const POUR_RESULT_MS = 700;
// Space kept between the pots and the open Plant panel.
const PANEL_GAP = 12;

const cropName = (id: string) => STRINGS.foods[id as CropId];

// What a pot shows growing in it.
function plantIcon(plot: Plot, stage: PlotStage): string {
  if (stage === 'empty') return '';
  if (stage === 'dead') return ITEM_ICONS.plantDead;
  if (stage === 'sick') return ITEM_ICONS.plantSick;
  if (stage === 'ready') return ITEM_ICONS[plot.crop!];
  return progress(plot) < 0.4 ? ITEM_ICONS.plantSprout : ITEM_ICONS.plantGrowing;
}

export function createGarden(cb: GardenCallbacks): Garden {
  let state: GameState | null = null;
  let now = 0;
  let active = false;
  let selected = 0;
  let outTimer = 0;

  // ---- The bed with its pots ----
  const beds = document.createElement('div');
  beds.className = 'garden';
  beds.hidden = true;
  const potRow = document.createElement('div');
  potRow.className = 'garden-pots';
  const pots = Array.from({ length: CONFIG.garden.plots }, (_, i) => {
    const b = document.createElement('button');
    b.className = 'garden-pot';
    const plant = document.createElement('span');
    plant.className = 'garden-plant';
    const pot = document.createElement('span');
    pot.className = 'garden-pot-body';
    const meter = document.createElement('span');
    meter.className = 'garden-moisture';
    meter.setAttribute('aria-hidden', 'true');
    const fill = document.createElement('span');
    meter.append(fill);
    const status = document.createElement('small');
    status.className = 'garden-status';
    const badge = document.createElement('span');
    badge.className = 'garden-badge';
    badge.setAttribute('aria-hidden', 'true');
    b.append(badge, plant, pot, meter, status);
    b.addEventListener('click', () => select(i));
    return { b, plant, fill, status, badge };
  });
  potRow.append(...pots.map((p) => p.b));

  // The pour meter, along the bottom of the bed while you hold Water.
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
  beds.append(potRow, pour);

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

  // Redraws the pots and buttons from the latest state.
  function render(): void {
    if (!state) return;
    const s = state;
    s.garden.forEach((plot, i) => {
      const p = pots[i];
      const stage = plotStage(plot);
      p.b.dataset.stage = stage;
      p.b.classList.toggle('selected', i === selected);
      p.b.setAttribute('aria-pressed', String(i === selected));
      p.plant.innerHTML = plantIcon(plot, stage);
      const wet = moisture(plot, now);
      p.fill.style.width = `${Math.round(wet * 100)}%`;
      p.b.classList.toggle('dry', (stage === 'growing' || stage === 'sick') && wet <= 0);
      p.b.classList.toggle('fertilized', stage === 'growing' && isFertilized(plot, now));
      const status =
        stage === 'empty' ? STRINGS.garden.empty
        : stage === 'ready' ? STRINGS.garden.ready
        : stage === 'dead' ? STRINGS.garden.dead
        : stage === 'sick' ? STRINGS.garden.diesIn(formatDuration(diesAt(plot)! - now))
        : STRINGS.garden.timeLeft(formatDuration(timeLeft(plot, now)));
      p.status.textContent = status;
      // A little drop over a pot that needs water.
      p.badge.innerHTML = p.b.classList.contains('dry') ? STAT_ICONS.drop : '';
      const what = plot.crop ? cropName(plot.crop) : STRINGS.garden.empty;
      const extra = [
        p.b.classList.contains('dry') ? STRINGS.garden.dry : '',
        p.b.classList.contains('fertilized') ? STRINGS.garden.fertilized : '',
      ].filter(Boolean).join(', ');
      p.b.setAttribute('aria-label', STRINGS.garden.potLabel(i + 1, what, [status, extra].filter(Boolean).join('. ')));
    });

    // The buttons for the picked pot.
    const stage = plotStage(s.garden[selected]);
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
    update(next, at) {
      state = next;
      now = at;
      if (active) render();
    },
  };
}
