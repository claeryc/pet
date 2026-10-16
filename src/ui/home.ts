// The home screen: the pet's room, its stat bars, status messages and the
// action buttons. This file only shows things and passes button presses on.
// The rules for what each button actually does live in src/game/actions.ts.

import { STRINGS } from '../strings';
import { CONFIG } from '../game/config';
import { canPlayMinigames, getLook, isRecovering } from '../game/stats';
import { stageLengthMs } from '../game/growth';
import type { GameState, PetStats } from '../game/state';
import { createMenu, type MenuCallbacks } from './menu';
import { foodCount } from '../game/economy';
import { createDrawer, type DrawerOption, type Effect } from './drawer';
import { ITEM_ICONS, STAT_ICONS } from './icons';
import type { ActivityId, Food, FoodId } from '../game/actions';
import type { CatchGrade } from '../game/fishing';
import { createFishing, DRAIN_MS, type FishingPhase } from './fishing';
import { createCooking, KITCHEN_OUT_MS } from './cooking';
import { createGarden, GARDEN_OUT_MS } from './garden';
import type { CropId } from '../game/garden';
import { isNew, isUnlocked } from '../game/unlocks';
import { isOnPet, ROOM_HEIGHT, ROOM_WIDTH } from '../render/canvas';
import { formatDuration } from './time';

export interface HomeCallbacks extends MenuCallbacks {
  onFeed: (food: FoodId) => void;
  onPlay: (activity: ActivityId) => void;
  onLights: () => void;
  onMedicine: () => void;
  onCast: () => boolean; // throws the fishing line; false if refused
  onLand: (grade: CatchGrade) => void;
  onCook: (items: FoodId[]) => FoodId | null; // the dish made, or null if refused
  onPlant: (pot: number, crop: CropId) => void;
  onWater: (pot: number, perfect: boolean) => void;
  onFertilize: (pot: number) => void;
  onCure: (pot: number) => void;
  onHarvest: (pot: number) => void;
  onClear: (pot: number) => void;
  onPetTap: () => void; // a quick cuddle
}

export interface HomeScreen {
  canvas: HTMLCanvasElement;
  update: (state: GameState, now: number) => void;
  toast: (message: string) => void;
  // Like toast, but waits for the message showing now to finish first.
  notice: (message: string) => void;
  fishingPhase: () => FishingPhase; // so the room can draw the line and bobber
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

// One stat: its icon, then a bar of 10 little blocks. Each block is 10
// points, and a block lights up as soon as the stat reaches into it.
const STAT_SEGMENTS = 10;

// After a mini-game closes, the bars start empty and fill back up one block
// at a time, this many ms per block: a full bar takes 1.5 seconds, a bar at
// 10% just a moment.
const REFILL_MS_PER_SEGMENT = 150;

interface StatBar {
  el: HTMLElement;
  set: (v: number) => void;
  // Empties the bar, waits `delayMs`, then fills it back up to its value.
  refill: (delayMs: number) => void;
}

function statBar(label: string, icon: string): StatBar {
  const el = document.createElement('div');
  el.className = 'stat';
  el.setAttribute('role', 'meter');
  el.setAttribute('aria-label', label);
  el.setAttribute('aria-valuemin', '0');
  el.setAttribute('aria-valuemax', '100');
  el.title = label;
  const iconEl = document.createElement('span');
  iconEl.className = 'stat-icon';
  iconEl.innerHTML = icon;
  const track = document.createElement('div');
  track.className = 'stat-segments';
  const segments = Array.from({ length: STAT_SEGMENTS }, () => {
    const seg = document.createElement('span');
    seg.className = 'stat-seg';
    return seg;
  });
  track.append(...segments);
  el.append(iconEl, track);
  let value = 0;
  let filling = false; // true while refilling: shown blocks count up on their own
  let timer = 0;
  const litFor = (v: number) => Math.ceil(v / (100 / STAT_SEGMENTS));
  function show(lit: number): void {
    const low = value < CONFIG.lowStatThreshold;
    segments.forEach((seg, i) => {
      seg.classList.toggle('on', i < lit);
      seg.classList.toggle('low', low);
    });
  }
  return {
    el,
    set(v: number) {
      value = v;
      if (!filling) show(litFor(v));
      el.setAttribute('aria-valuenow', String(Math.round(v)));
      el.title = `${label}: ${Math.round(v)}`;
    },
    refill(delayMs) {
      clearTimeout(timer);
      filling = true;
      show(0);
      let lit = 0;
      // One more block each step, until it reaches the bar's value (which
      // may change while it fills).
      const step = () => {
        if (lit >= litFor(value)) {
          filling = false;
          show(litFor(value));
          return;
        }
        show(++lit);
        timer = window.setTimeout(step, REFILL_MS_PER_SEGMENT);
      };
      timer = window.setTimeout(step, delayMs);
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

  // The home screen is kept quiet: just the pet, its bars and the buttons.
  // The pet's name and character are saved for the Family Tree, and gold
  // shows in the Shop. How the pet feels is read out to
  // screen readers through the room's label.
  const canvas = document.createElement('canvas');
  canvas.className = 'room';
  canvas.setAttribute('role', 'img');

  // Warning / sick / recovering banner, hidden when all is well.
  const banner = document.createElement('div');
  banner.className = 'banner';
  const bannerText = document.createElement('p');
  const medicine = button(STRINGS.buttons.medicine, 'btn btn-medicine', cb.onMedicine);
  banner.append(bannerText, medicine);

  const bars: Record<keyof PetStats, StatBar> = {
    hunger: statBar(STRINGS.stats.hunger, STAT_ICONS.hunger),
    happiness: statBar(STRINGS.stats.happiness, STAT_ICONS.happiness),
    health: statBar(STRINGS.stats.health, STAT_ICONS.health),
    energy: statBar(STRINGS.stats.energy, STAT_ICONS.energy),
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

  // The Feed panel: the cooking pot first (once cooking has opened up),
  // then the food you have, most recently fed first.
  const feedOptions: DrawerOption[] = [
    {
      icon: ITEM_ICONS.cooking,
      label: STRINGS.cooking.open,
      effects: [],
      onPick: () => startCooking(),
    },
  ];
  const COOK_ROW = 0;
  const foodRow = (i: number) => i + 1; // the foods come after the pot
  for (const f of CONFIG.foods as readonly Food[]) {
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
    feedOptions.push({
      icon: ITEM_ICONS[f.id],
      label: STRINGS.foods[f.id],
      effects,
      onPick: () => cb.onFeed(f.id),
    });
  }
  // The order the Feed rows were last put in, so we only move them when
  // it changes.
  let feedOrderKey = '';
  const playOptions: DrawerOption[] = [
    ...CONFIG.activities.map((a) => ({
      icon: ITEM_ICONS[a.id],
      label: STRINGS.activities[a.id],
      effects: statEffects({ happiness: a.happiness, energy: a.energy }),
      onPick: () => cb.onPlay(a.id),
    })),
    {
      icon: ITEM_ICONS.fishing,
      label: STRINGS.minigames.fishing,
      effects: statEffects({ energy: -CONFIG.fishing.energyPerCast }), // per cast
      onPick: () => startFishing(),
    },
    {
      icon: ITEM_ICONS.garden,
      label: STRINGS.minigames.garden,
      effects: [],
      onPick: () => startGarden(),
    },
    // More mini-games arrive in Milestone 4.
    { icon: ITEM_ICONS.catchTreats, label: STRINGS.minigames.catchTreats, effects: [] },
    { icon: ITEM_ICONS.memoryMatch, label: STRINGS.minigames.memoryMatch, effects: [] },
  ];

  const GARDEN_ROW = CONFIG.activities.length + 1; // after Fishing
  const feedDrawer = createDrawer({ id: 'feed', label: STRINGS.buttons.feed, options: feedOptions, ...drawerSetup });
  const playDrawer = createDrawer({ id: 'play', label: STRINGS.buttons.play, options: playOptions, ...drawerSetup });

  // The gear button opens the menu (shop, inventory, settings and more) the
  // same way Feed and Play open. It always opens, even for an egg.
  let menuDrawer: ReturnType<typeof createDrawer> | null = null;
  const menu = createMenu(cb, () => menuDrawer?.isOpen() ?? false, () => menuDrawer?.close());
  menuDrawer = createDrawer({
    ...drawerSetup,
    id: 'menu',
    label: STRINGS.buttons.menu,
    icon: GEAR_ICON,
    content: menu.el,
    onOpen: menu.reset,
    beforeOpen: () => null,
  });
  const lights = button('', 'btn btn-icon', cb.onLights);

  actions.append(feedDrawer.el, playDrawer.el, menuDrawer.el, lights);

  // Holding the pet opens the Wardrobe, in the gear panel.
  function openWardrobe(): void {
    if (petIsEgg) return showToast(STRINGS.wardrobe.eggNoHat);
    feedDrawer.close();
    playDrawer.close();
    if (!menuDrawer!.isOpen()) menuDrawer!.open();
    menu.showWardrobe();
  }

  // Tap the pet to cuddle it; hold it to open the Wardrobe. Only while the
  // normal buttons are showing (not while fishing or cooking).
  canvas.tabIndex = 0;
  let holdTimer = 0;
  let press: { x: number; y: number; held: boolean } | null = null;
  let lastCuddle = -Infinity;
  const onPetAt = (e: PointerEvent) => {
    const rect = canvas.getBoundingClientRect();
    return isOnPet(((e.clientX - rect.left) / rect.width) * ROOM_WIDTH, ((e.clientY - rect.top) / rect.height) * ROOM_HEIGHT);
  };
  function cuddle(): void {
    const now = performance.now();
    if (now - lastCuddle < CONFIG.petting.tapCooldownMs) return; // one cuddle per burst of taps
    lastCuddle = now;
    cb.onPetTap();
  }
  canvas.addEventListener('pointerdown', (e) => {
    if (actions.hidden || !onPetAt(e)) return;
    press = { x: e.clientX, y: e.clientY, held: false };
    clearTimeout(holdTimer);
    holdTimer = window.setTimeout(() => {
      if (!press) return;
      press.held = true;
      navigator.vibrate?.(10);
      openWardrobe();
    }, CONFIG.petting.holdMs);
  });
  canvas.addEventListener('pointermove', (e) => {
    // Moving a finger away (to scroll, say) cancels the tap or hold.
    if (press && Math.hypot(e.clientX - press.x, e.clientY - press.y) > 10) {
      clearTimeout(holdTimer);
      press = null;
    }
  });
  canvas.addEventListener('pointerup', () => {
    clearTimeout(holdTimer);
    if (press && !press.held) cuddle();
    press = null;
  });
  canvas.addEventListener('pointercancel', () => {
    clearTimeout(holdTimer);
    press = null;
  });
  // A right-click, or the keyboard's menu key, opens the Wardrobe too, and
  // Enter or Space cuddles.
  canvas.addEventListener('contextmenu', (e) => {
    e.preventDefault();
    // Some phones send this for a long press too: count it as the hold.
    if (actions.hidden || press?.held) return;
    clearTimeout(holdTimer);
    if (press) press.held = true;
    openWardrobe();
  });
  canvas.addEventListener('keydown', (e) => {
    if (actions.hidden || (e.key !== 'Enter' && e.key !== ' ')) return;
    e.preventDefault();
    cuddle();
  });

  // Fishing swaps the button row for its own [Cancel] [Cast] row, and the
  // stat bars for a pond of the same size.
  const fishing = createFishing({
    onCast: cb.onCast,
    onLand: cb.onLand,
    onExit: () => showActions(DRAIN_MS),
    toast: (msg) => showToast(msg),
  });
  // The latest state, so Fishing can check the pet is up for it.
  let latest: { state: GameState; now: number } | null = null;
  function startFishing(): void {
    if (latest && !canPlayMinigames(latest.state.pet, latest.now)) {
      return showToast(STRINGS.blocked.resting(petName));
    }
    actions.hidden = true;
    stats.setAttribute('aria-hidden', 'true'); // under water for now
    fishing.start();
  }
  // Cooking works the same way: its own [Close] [Recipes] [Cook] row, and a
  // kitchen counter that slides up over the stat bars.
  const cooking = createCooking({
    onCook: cb.onCook,
    onExit: () => showActions(KITCHEN_OUT_MS),
    toast: (msg) => showToast(msg),
  });
  function startCooking(): void {
    cb.onSeen('cooking');
    actions.hidden = true;
    stats.setAttribute('aria-hidden', 'true'); // covered by the counter for now
    if (latest) cooking.update(latest.state);
    cooking.start();
  }
  // The garden too: its own buttons, and a bed of pots that slides up over
  // the stat bars.
  const garden = createGarden({
    onPlant: cb.onPlant,
    onWater: cb.onWater,
    onFertilize: cb.onFertilize,
    onCure: cb.onCure,
    onHarvest: cb.onHarvest,
    onClear: cb.onClear,
    onExit: () => showActions(GARDEN_OUT_MS),
    toast: (msg) => showToast(msg),
  });
  function startGarden(): void {
    cb.onSeen('garden');
    actions.hidden = true;
    stats.setAttribute('aria-hidden', 'true'); // covered by the garden for now
    if (latest) garden.update(latest.state, latest.now);
    garden.start();
  }
  function stopFishing(): void {
    if (fishing.phase() === 'off') return;
    fishing.stop();
    showActions();
  }
  // Back to the normal buttons, which pop back up. The stat bars appear
  // empty as the water drains and then fill back up to their values.
  function showActions(delayMs = DRAIN_MS): void {
    stats.removeAttribute('aria-hidden');
    if (!matchMedia('(prefers-reduced-motion: reduce)').matches) {
      for (const bar of Object.values(bars)) bar.refill(delayMs);
    }
    actions.hidden = false;
    actions.classList.remove('rise-in');
    void actions.offsetHeight;
    actions.classList.add('rise-in');
  }

  // The stat bars, the pond, the kitchen counter and the garden share one
  // spot: each of them rises over the bars.
  const statSlot = document.createElement('div');
  statSlot.className = 'stat-slot';
  statSlot.append(stats, fishing.pond, cooking.kitchen, garden.beds);

  // A short message that pops up and fades, e.g. "Mochi is asleep".
  const toastEl = document.createElement('div');
  toastEl.className = 'toast';
  let toastTimer = 0;
  const waiting: string[] = []; // notices waiting their turn
  function showToast(message: string): void {
    toastEl.textContent = message;
    toastEl.classList.add('show');
    clearTimeout(toastTimer);
    toastTimer = window.setTimeout(() => {
      toastEl.classList.remove('show');
      const next = waiting.shift();
      if (next) toastTimer = window.setTimeout(() => showToast(next), 300);
    }, 2500);
  }
  function showNotice(message: string): void {
    if (toastEl.classList.contains('show')) waiting.push(message);
    else showToast(message);
  }

  root.append(canvas, banner, statSlot, actions, fishing.row, cooking.row, garden.row, toastEl);

  return {
    canvas,
    update(state, now) {
      latest = { state, now };
      const pet = state.pet;
      petName = pet.name;
      petAsleep = pet.asleep;
      const isEgg = pet.stage === 'egg';
      petIsEgg = isEgg;
      for (const key of Object.keys(bars) as (keyof PetStats)[]) bars[key].set(pet.stats[key]);
      // How many of each food you have ("Free" for food that never runs out).
      // Caught fish and cooked dishes also show their stars. Dishes only
      // show up once you have some, to keep the list short.
      // Only food you have is listed.
      CONFIG.foods.forEach((f: Food, i) => {
        const count = foodCount(state, f.id);
        const stars = f.stars ? `${STRINGS.stars(f.stars)}  ` : '';
        feedDrawer.setNote(foodRow(i), count === Infinity ? STRINGS.shop.free : `${stars}× ${count}`);
        feedDrawer.setHidden(foodRow(i), count === 0);
      });
      feedDrawer.setHidden(COOK_ROW, !isUnlocked(state, 'cooking'));
      const cookIsNew = isNew(state, 'cooking');
      feedDrawer.setOptionNew(COOK_ROW, cookIsNew);
      feedDrawer.setNew(cookIsNew);
      menuDrawer!.setNew(isNew(state, 'shop') || isNew(state, 'collection') || isNew(state, 'familyTree'));
      // The pot, then what you fed most recently, then the rest as listed
      // in the config. Rows only move while the panel is closed.
      const ids = CONFIG.foods.map((f) => f.id as string);
      const recent = state.recentFoods.map((id) => ids.indexOf(id)).filter((i) => i >= 0);
      const order = [COOK_ROW, ...[...recent, ...ids.keys()].filter((i, n, all) => all.indexOf(i) === n).map(foodRow)];
      const orderKey = order.join();
      if (orderKey !== feedOrderKey && !feedDrawer.isOpen()) {
        feedOrderKey = orderKey;
        feedDrawer.setOrder(order);
      }
      cooking.update(state);
      garden.update(state, now);
      playDrawer.setHidden(GARDEN_ROW, !isUnlocked(state, 'garden'));
      const gardenIsNew = isNew(state, 'garden');
      playDrawer.setOptionNew(GARDEN_ROW, gardenIsNew);
      playDrawer.setNew(gardenIsNew);
      stats.hidden = isEgg; // an egg has no needs yet
      canvas.setAttribute('aria-label', isEgg ? STRINGS.mood.egg : STRINGS.mood[getLook(pet)](pet.name));

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
      // Fishing stops if the pet falls asleep or gets sick.
      if (!canPlayMinigames(pet, now) || isEgg) stopFishing();

      menu.update(state);
    },
    toast: showToast,
    notice: showNotice,
    fishingPhase: fishing.phase,
  };
}
