// The cooking pot. While you cook, the button row becomes
// [Close] [Food] [Recipes], and a kitchen counter slides up over the stat
// bars into a panel of the same size, just like the pond does for fishing.
//
// The counter shows the pot: a spot for each food it takes (three, four
// with the bigger pot), then "=" and the pot
// itself. Tap the pot to cook. When the spots hold a recipe you know, the
// pot shows the dish it will make. A mix that can't become any recipe,
// even with more added, shows a Mushy mess as a warning; anything else
// shows a "?".
//
// Food and Recipes open upward like Feed and Play, stopping short of the
// pot so you can watch it fill:
//  - Food: every ingredient with how many you have. Tap one to put it in
//    the pot; tap it in the pot to take it back out.
//  - Recipes: every recipe, with what it needs and how many you have
//    (missing food is greyed out). Recipes you haven't cooked yet show as
//    "???" with one ingredient as a hint. Tap a recipe to fill the pot.
//    Recipes for a kitchen item you don't have yet say what they need;
//    seasonal ones only show in their season (or once you've made them).
//
// Cooking takes a moment: each ingredient plops into the pot in turn, the
// lid rattles and steams while it cooks, and then the dish pops up.
//
// Tabs at the top of the counter switch between the pot and the cutting
// board. The board takes one fish: tap the board and a knife starts
// sliding along it; tap again to cut. A cut in the middle is a perfect
// one, but any cut makes the fillet. With double batch, a ×2 switch on
// the counter cooks two of a dish at once from two of everything.
//
// What a mix makes, and what cooking uses up, is decided in
// src/game/cooking.ts.

import { STRINGS } from '../strings';
import { CONFIG } from '../game/config';
import { foodCount } from '../game/economy';
import { recipeHints } from '../game/skills';
import {
  COUNTED_RECIPES, couldBeRecipe, haveAll, hasStation, ingredientsAt, inSeason, ingredientsFor, isPrep, knowsRecipe,
  matchRecipe, MAX_POT_SLOTS, maxBatch, recipeNeeds, recipeOpen, RECIPES, stationOf, stationSlots,
  type CookOptions, type Station,
} from '../game/cooking';
import type { Food, FoodId } from '../game/actions';
import type { GameState } from '../game/state';
import { createDrawer } from './drawer';
import { ITEM_ICONS } from './icons';
import { soldInShop, type ShopCategory } from './shop';

export interface CookingCallbacks {
  // Cooks what's on the station. Returns the dish made, or null if the
  // game refused (the reason is shown elsewhere).
  onCook: (items: FoodId[], opts: CookOptions) => FoodId | null;
  onExit: () => void;
  toast: (message: string, shop?: ShopCategory) => void; // `shop`: offer a button to that part of the Shop
}

export interface Cooking {
  row: HTMLElement; // the buttons, shown in place of the normal button row
  kitchen: HTMLElement; // the counter, shown in place of the stat bars
  start: () => void;
  stop: () => void;
  active: () => boolean;
  update: (state: GameState) => void;
}

// How long the counter takes to slide in and out (matches .kitchen in
// style.css).
export const KITCHEN_OUT_MS = 450;
// Cooking, step by step: the ingredients plop in one after another, then
// the lid rattles for a while, then the dish shows in the pot for a moment
// before the item reveal.
const PLOP_EVERY_MS = 200;
const PLOPS_MS = 600; // all of them are in by then
const SIMMER_MS = 1100;
// When the dish shows in the pot, and when the item reveal comes (it waits
// so the pot gets its moment first).
export const DISH_MS = PLOPS_MS + SIMMER_MS;
export const DONE_MS = DISH_MS + 1400;

const reduced = () => typeof matchMedia !== 'undefined' && matchMedia('(prefers-reduced-motion: reduce)').matches;
// Space kept between the pot and an open Food or Recipes panel.
const PANEL_GAP = 12;

const foodName = (id: FoodId) => STRINGS.foods[id];
const stars = (id: FoodId) => (CONFIG.foods as readonly Food[]).find((f) => f.id === id)?.stars ?? 0;
const inShop = (id: FoodId) => (CONFIG.foods as readonly Food[]).some((f) => f.id === id && soldInShop(f));
const countText = (n: number) => (n === Infinity ? '∞' : String(n));
const STATION_TABS: readonly Station[] = ['pot', 'board'];
// Every food that can go on any station, in the order of CONFIG.foods.
const ALL_INGREDIENTS: readonly FoodId[] = (CONFIG.foods as readonly Food[])
  .map((f) => f.id as FoodId)
  .filter((id) => STATION_TABS.some((st) => ingredientsAt(st).includes(id)));

export function createCooking(cb: CookingCallbacks): Cooking {
  let state: GameState | null = null;
  let active = false;
  const pot: FoodId[] = []; // what's in the pot, in the order it went in
  let justMade: FoodId | null = null;
  // While cooking: what's still plopping in (shown in the spots), and
  // whether the lid is on.
  let plopping: FoodId[] = [];
  let simmering = false;
  let cookTimers: number[] = [];
  let outTimer = 0;
  let station: Station = 'pot';
  let batch = 1; // 2 while the ×2 switch is on
  // The cutting game: when the knife started sliding (0 while it isn't).
  let cutStart = 0;
  let cutFrame = 0;

  // ---- The counter with the pot ----
  const kitchen = document.createElement('div');
  kitchen.className = 'kitchen';
  kitchen.hidden = true;
  // The top of the counter: the station tabs, and the ×2 switch.
  const top = document.createElement('div');
  top.className = 'kitchen-top';
  const tabs = document.createElement('div');
  tabs.className = 'kitchen-tabs';
  tabs.setAttribute('role', 'tablist');
  const tabButtons = STATION_TABS.map((st) => {
    const b = document.createElement('button');
    b.className = 'kitchen-tab';
    b.setAttribute('role', 'tab');
    b.textContent = STRINGS.cooking.stations[st];
    b.addEventListener('click', () => switchTo(st));
    tabs.append(b);
    return { st, b };
  });
  const batchBtn = document.createElement('button');
  batchBtn.className = 'kitchen-batch';
  batchBtn.textContent = '×2';
  batchBtn.addEventListener('click', () => {
    if (busy()) return;
    batch = batch === 2 ? 1 : 2;
    render();
  });
  top.append(tabs, batchBtn);
  const potRow = document.createElement('div');
  potRow.className = 'pot-row';
  // Spots for the biggest pot; the ones this pot doesn't have are hidden,
  // with the "+" in front of them.
  const slots = Array.from({ length: MAX_POT_SLOTS }, (_, i) => {
    const b = document.createElement('button');
    b.className = 'pot-slot';
    b.addEventListener('click', () => {
      if (pot[i] === undefined || busy()) return;
      pot.splice(i, 1);
      stopCut();
      render();
    });
    return b;
  });
  const pluses: HTMLElement[] = [];
  slots.forEach((s, i) => {
    if (i > 0) potRow.append(pluses[i] = sign('+'));
    potRow.append(s);
  });
  potRow.append(sign('='));
  // The pot is the Cook button.
  const potBtn = document.createElement('button');
  potBtn.className = 'pot-result';
  const steam = document.createElement('span');
  steam.className = 'pot-steam';
  steam.setAttribute('aria-hidden', 'true');
  const potIcon = document.createElement('span');
  potIcon.className = 'pot-result-icon';
  // On the board: the knife's track, with the perfect stretch marked.
  const knife = document.createElement('span');
  knife.className = 'cut-track';
  knife.setAttribute('aria-hidden', 'true');
  const band = document.createElement('span');
  band.className = 'cut-band';
  const { start: bandStart, end: bandEnd } = CONFIG.cooking.cutting.band;
  band.style.left = `${bandStart * 100}%`;
  band.style.width = `${(bandEnd - bandStart) * 100}%`;
  const blade = document.createElement('span');
  blade.className = 'cut-blade';
  knife.append(band, blade);
  const batchTag = document.createElement('span');
  batchTag.className = 'pot-batch';
  batchTag.textContent = '×2';
  batchTag.setAttribute('aria-hidden', 'true');
  potBtn.append(steam, potIcon, knife, batchTag);
  potBtn.addEventListener('click', cookIt);
  potRow.append(potBtn);
  kitchen.append(top, potRow);

  function sign(text: string): HTMLElement {
    const s = document.createElement('span');
    s.className = 'pot-sign';
    s.textContent = text;
    s.setAttribute('aria-hidden', 'true');
    return s;
  }

  // ---- The buttons: [Close] [Food] [Recipes] ----
  const row = document.createElement('div');
  row.className = 'actions cooking-row';
  row.hidden = true;
  const close = document.createElement('button');
  close.className = 'btn btn-soft';
  close.textContent = STRINGS.cooking.close;

  // Food: a grid of every ingredient and how many are left out of the pot.
  const pantry = document.createElement('div');
  pantry.className = 'pantry';
  const pantryItems = ALL_INGREDIENTS.map((id) => {
    const b = document.createElement('button');
    b.className = 'pantry-item';
    b.innerHTML = ITEM_ICONS[id];
    const count = document.createElement('small');
    count.className = 'pantry-count';
    b.append(count);
    b.addEventListener('click', () => addToPot(id));
    return { id, b, count };
  });
  pantry.append(...pantryItems.map((p) => p.b));

  // Recipes: one row per recipe, the dish on the left and what it needs on
  // the right.
  const book = document.createElement('div');
  book.className = 'recipe-book';
  const bookHead = document.createElement('div');
  bookHead.className = 'recipe-book-head';
  const bookRows = RECIPES.map((recipe) => {
    const b = document.createElement('button');
    b.className = 'recipe';
    const icon = document.createElement('span');
    icon.className = 'recipe-icon';
    const label = document.createElement('span');
    label.className = 'recipe-name';
    const needs = document.createElement('span');
    needs.className = 'recipe-needs';
    b.append(icon, label, needs);
    b.addEventListener('click', () => pickRecipe(recipe.id));
    return { recipe, b, icon, label, needs };
  });
  book.append(bookHead, ...bookRows.map((r) => r.b));

  const drawerSetup = {
    row,
    comingSoon: STRINGS.menu.comingSoon,
    beforeOpen: () => null,
    onBlocked: cb.toast,
  };
  const foodDrawer = createDrawer({
    ...drawerSetup,
    id: 'cook-food',
    label: STRINGS.cooking.food,
    content: pantry,
    onOpen: () => fitPanel(foodDrawer.el),
  });
  const recipeDrawer = createDrawer({
    ...drawerSetup,
    id: 'cook-recipes',
    label: STRINGS.cooking.recipes,
    content: book,
    onOpen: () => fitPanel(recipeDrawer.el),
  });
  row.append(close, foodDrawer.el, recipeDrawer.el);

  // Keeps an open panel below the pot, so the pot stays in view. The
  // panel's list scrolls if it doesn't all fit.
  function fitPanel(drawer: HTMLElement): void {
    const list = drawer.querySelector<HTMLElement>('.drawer-options')!;
    const room = row.getBoundingClientRect().bottom - kitchen.getBoundingClientRect().bottom - PANEL_GAP;
    // The panel's button, frame and padding take about this much.
    const chrome = 52 + 6 + 16;
    list.style.setProperty('--fit', `${Math.max(120, Math.floor(room - chrome))}px`);
  }

  // The batch size in use: the ×2 switch only counts on the pot, and only
  // while you have double batch.
  const batchNow = () => (state && batch > maxBatch(state, station) ? 1 : batch);

  // How many of a food are still out of the pot (each one in it takes two
  // with the ×2 switch on).
  function left(id: FoodId): number {
    if (!state) return 0;
    return foodCount(state, id) - pot.filter((p) => p === id).length * batchNow();
  }

  const busy = () => simmering || plopping.length > 0;
  const onBoard = () => isPrep(station);

  function switchTo(next: Station): void {
    if (busy() || next === station) return;
    station = next;
    stopCut();
    clearDone();
    pot.length = 0;
    render();
    cb.toast(onBoard() ? STRINGS.cooking.boardStart : STRINGS.cooking.start);
  }

  function addToPot(id: FoodId): void {
    if (busy() || !state) return;
    if (!ingredientsAt(station).includes(id)) return;
    if (pot.length >= stationSlots(state, station)) {
      return cb.toast(onBoard() ? STRINGS.cooking.boardFull : STRINGS.cooking.full);
    }
    if (left(id) < batchNow()) return cb.toast(STRINGS.cooking.noneLeft(foodName(id)), inShop(id) ? 'food' : undefined);
    clearDone();
    pot.push(id);
    render();
  }

  function pickRecipe(id: FoodId): void {
    if (!state || busy()) return;
    const recipe = RECIPES.find((r) => r.id === id)!;
    const needs = recipeNeeds(state, recipe);
    if (needs) return cb.toast(STRINGS.cooking.needs[needs]);
    if (!knowsRecipe(state, id)) return cb.toast(STRINGS.cooking.hint(foodName(recipe.ingredients[0])));
    if (!recipeOpen(state, recipe)) return cb.toast(STRINGS.cooking.outOfSeason);
    const missing = ingredientsFor(state, recipe).filter((i) => i.have < i.need);
    if (missing.length > 0) {
      return cb.toast(STRINGS.cooking.missing(missing.map((i) => foodName(i.id)).join(', ')));
    }
    // A board recipe takes you to the board (and the ×2 switch goes off
    // there).
    const at = stationOf(recipe);
    if (at !== station) {
      station = at;
      stopCut();
    }
    const short = ingredientsFor(state, recipe).filter((i) => i.have < i.need * batchNow());
    if (short.length > 0) {
      // Not enough for two: cook one instead, and say why.
      batch = 1;
      cb.toast(STRINGS.cooking.batchNeeds(short.map((i) => foodName(i.id)).join(', ')));
    }
    clearDone();
    pot.splice(0, pot.length, ...recipe.ingredients);
    recipeDrawer.close();
    render();
  }

  // The knife's place along the board, 0-1, sliding there and back.
  function cutAt(now: number): number {
    const t = ((now - cutStart) / (CONFIG.cooking.cutting.sweepSeconds * 1000)) % 2;
    return t <= 1 ? t : 2 - t;
  }

  function startCut(): void {
    cutStart = performance.now();
    potRow.classList.add('cutting');
    const step = () => {
      blade.style.left = `${cutAt(performance.now()) * 100}%`;
      cutFrame = requestAnimationFrame(step);
    };
    step();
    potBtn.setAttribute('aria-label', STRINGS.cooking.cutNow);
  }

  function stopCut(): void {
    cancelAnimationFrame(cutFrame);
    cutStart = 0;
    potRow.classList.remove('cutting');
  }

  function cookIt(): void {
    if (busy() || !state) return;
    if (pot.length === 0) return cb.toast(onBoard() ? STRINGS.cooking.boardEmpty : STRINGS.cooking.emptyPot);
    const items = [...pot];
    let perfect = false;
    if (onBoard()) {
      // First tap: the knife starts. Second tap: cut where it is.
      if (!matchRecipe(items, station)) return cb.toast(STRINGS.cooking.needMore(foodName(items[0])));
      if (!cutStart) return startCut();
      const at = cutAt(performance.now());
      const { start, end } = CONFIG.cooking.cutting.band;
      perfect = at >= start && at <= end;
      stopCut();
    }
    const dish = cb.onCook(items, { station, batch: batchNow(), perfect });
    if (!dish) return;
    if (onBoard()) cb.toast(perfect ? STRINGS.cooking.perfectCut : STRINGS.cooking.goodCut);
    clearDone();
    pot.length = 0;
    foodDrawer.close();
    recipeDrawer.close();
    plopping = items;
    simmering = true;
    potRow.classList.add('simmering');
    // In they go, one by one from the left.
    items.forEach((id, i) => later(i * PLOP_EVERY_MS, () => plop(id)));
    // Lid off: the dish pops up.
    later(DISH_MS, () => {
      simmering = false;
      plopping = [];
      potRow.classList.remove('simmering');
      justMade = dish;
      potRow.classList.add('cooked');
      render();
    });
    later(DONE_MS, () => {
      justMade = null;
      potRow.classList.remove('cooked');
      render();
    });
    render();
  }

  function later(ms: number, fn: () => void): void {
    cookTimers.push(window.setTimeout(fn, ms));
  }

  // The first ingredient left in the spots hops into the pot, and the pot
  // squishes with a little splash.
  function plop(id: FoodId): void {
    const from = slots[0].getBoundingClientRect();
    const to = potBtn.getBoundingClientRect();
    plopping = plopping.slice(1);
    render();
    if (reduced() || from.width === 0) return;
    const bit = document.createElement('span');
    bit.className = 'pot-plop';
    bit.innerHTML = ITEM_ICONS[id];
    bit.style.left = `${from.left + from.width / 2}px`;
    bit.style.top = `${from.top + from.height / 2}px`;
    bit.style.width = bit.style.height = `${from.width * 0.7}px`;
    document.body.append(bit);
    const dx = to.left + to.width / 2 - (from.left + from.width / 2);
    const dy = to.top + to.height * 0.3 - (from.top + from.height / 2);
    bit.animate(
      [
        { transform: 'translate(-50%, -50%) scale(1)' },
        { transform: `translate(calc(-50% + ${dx * 0.5}px), calc(-50% + ${dy - 34}px)) scale(0.85)`, offset: 0.5 },
        { transform: `translate(calc(-50% + ${dx}px), calc(-50% + ${dy}px)) scale(0.4)` },
      ],
      { duration: 280, easing: 'cubic-bezier(0.4, 0, 0.6, 1)' },
    ).onfinish = () => {
      bit.remove();
      potBtn.classList.remove('plop');
      void potBtn.offsetWidth;
      potBtn.classList.add('plop');
      for (const side of [-1, 1]) {
        const drop = document.createElement('span');
        drop.className = 'pot-drop';
        drop.style.setProperty('--side', String(side));
        potBtn.append(drop);
        drop.addEventListener('animationend', () => drop.remove(), { once: true });
      }
    };
  }

  function clearDone(): void {
    for (const t of cookTimers) clearTimeout(t);
    cookTimers = [];
    justMade = null;
    plopping = [];
    simmering = false;
    potRow.classList.remove('cooked', 'simmering');
  }

  // Board-only icons and words, in place of the pot's.
  const emptyIcon = () => (onBoard() ? ITEM_ICONS.cuttingBoard : ITEM_ICONS.cooking);

  // Redraws everything from the pot and the latest state.
  function render(): void {
    if (!state) return;
    const s = state;
    // Drop anything from the pot you no longer have (e.g. eaten meanwhile).
    for (let i = pot.length - 1; i >= 0; i--) if (left(pot[i]) < 0) pot.splice(i, 1);

    // The top: which station is open, and the ×2 switch (on the pot, once
    // you have double batch).
    for (const t of tabButtons) {
      t.b.classList.toggle('on', t.st === station);
      t.b.setAttribute('aria-selected', String(t.st === station));
      t.b.hidden = !hasStation(s, t.st);
    }
    const canBatch = maxBatch(s, station) > 1;
    batchBtn.hidden = !canBatch;
    batchBtn.classList.toggle('on', batchNow() === 2);
    batchBtn.setAttribute('aria-pressed', String(batchNow() === 2));
    batchBtn.setAttribute('aria-label', STRINGS.cooking.batch(batchNow() === 2));
    batchTag.hidden = batchNow() !== 2 || pot.length === 0;
    potRow.dataset.station = station;
    potRow.dataset.slots = String(stationSlots(s, station));

    const inSpots = plopping.length > 0 ? plopping : pot;
    const size = stationSlots(s, station);
    slots.forEach((slot, i) => {
      // (Not `hidden`: .pot-slot sets its own display.)
      slot.style.display = i >= size ? 'none' : '';
      if (pluses[i]) pluses[i].style.display = i >= size ? 'none' : '';
      const id = inSpots[i];
      slot.innerHTML = id ? ITEM_ICONS[id] : '';
      slot.classList.toggle('filled', id !== undefined);
      slot.setAttribute('aria-label', id
        ? (onBoard() ? STRINGS.cooking.onBoard : STRINGS.cooking.inPot)(foodName(id))
        : onBoard() ? STRINGS.cooking.emptyBoard : STRINGS.cooking.emptySlot);
    });

    // The pot: the dish you just made, the dish a known recipe will make,
    // a "?" for anything else, or the empty pot.
    // (On the board, what a fish turns into is no secret.)
    const known = matchRecipe(pot, station);
    const preview = justMade ?? (known && (knowsRecipe(s, known.id) || onBoard()) && recipeOpen(s, known) ? known.id : null);
    const mush = !preview && pot.length > 0 && !couldBeRecipe(pot, station);
    potIcon.innerHTML =
      simmering ? emptyIcon()
      : preview ? ITEM_ICONS[preview]
      : mush ? ITEM_ICONS[CONFIG.cooking.mess]
      : pot.length > 0 ? ITEM_ICONS.unknown
      : emptyIcon();
    potBtn.dataset.kind = simmering ? 'simmer' : justMade ? 'done' : preview ? 'known' : mush ? 'mush' : pot.length > 0 ? 'mystery' : 'empty';
    potBtn.setAttribute(
      'aria-label',
      simmering
        ? STRINGS.cooking.simmering
        : justMade
        ? foodName(justMade)
        : pot.length === 0
          ? STRINGS.cooking.emptyPotLabel
          : preview
            ? (onBoard() ? STRINGS.cooking.cutInto : STRINGS.cooking.cookInto)(foodName(preview))
            : mush
              ? STRINGS.cooking.cookMush
              : STRINGS.cooking.cookMystery,
    );
    potBtn.title = mush ? STRINGS.cooking.cookMush : '';

    const here = ingredientsAt(station);
    for (const p of pantryItems) {
      p.b.style.display = here.includes(p.id) ? '' : 'none';
      const n = left(p.id);
      p.count.textContent = countText(n);
      p.b.classList.toggle('faded', n <= 0);
      p.b.setAttribute('aria-label', (onBoard() ? STRINGS.cooking.addToBoard : STRINGS.cooking.addToPot)(foodName(p.id), countText(n)));
      p.b.title = foodName(p.id);
    }

    const found = COUNTED_RECIPES.filter((r) => knowsRecipe(s, r.id)).length;
    bookHead.textContent = STRINGS.cooking.found(found, COUNTED_RECIPES.length);
    const hints = recipeHints(s); // the Chef's nose skill
    for (const r of bookRows) {
      const isKnown = knowsRecipe(s, r.recipe.id);
      r.b.style.display = !isKnown && !inSeason(r.recipe, s.lastUpdated) ? 'none' : '';
      const lacks = recipeNeeds(s, r.recipe);
      const needs = ingredientsFor(s, r.recipe);
      r.b.classList.toggle('unknown', !isKnown || lacks !== null);
      r.b.classList.toggle('ready', isKnown && recipeOpen(s, r.recipe) && haveAll(s, r.recipe.ingredients));
      r.icon.innerHTML = isKnown ? ITEM_ICONS[r.recipe.id] : ITEM_ICONS.unknown;
      r.label.textContent = lacks ? STRINGS.cooking.needs[lacks]
        : isKnown || hints.name ? foodName(r.recipe.id) : STRINGS.cooking.unknown;
      const n = stars(r.recipe.id);
      if (isKnown && n) {
        const st = document.createElement('small');
        st.className = 'recipe-stars';
        st.textContent = STRINGS.stars(n);
        r.label.append(st);
      }
      // Each ingredient: its icon and "have/need". Unknown recipes only
      // show their first ingredient (more with Chef's nose); the rest are
      // question marks.
      r.needs.replaceChildren(
        ...needs.map((need, i) => {
          const chip = document.createElement('span');
          chip.className = 'recipe-need';
          const hidden = !isKnown && i >= hints.ingredients;
          chip.innerHTML = hidden ? ITEM_ICONS.unknown : ITEM_ICONS[need.id];
          if (!hidden) {
            chip.classList.toggle('missing', need.have < need.need);
            if (isKnown) chip.append(`${countText(need.have)}/${need.need}`);
            chip.title = `${foodName(need.id)}: ${countText(need.have)}/${need.need}`;
          }
          return chip;
        }),
      );
      r.b.setAttribute(
        'aria-label',
        lacks
          ? STRINGS.cooking.needs[lacks]
          : isKnown
          ? `${foodName(r.recipe.id)}. ${needs.map((x) => `${foodName(x.id)} ${countText(x.have)}/${x.need}`).join(', ')}`
          : STRINGS.cooking.hint(foodName(r.recipe.ingredients[0])),
      );
    }
  }

  close.addEventListener('click', () => {
    stop();
    cb.onExit();
  });

  function stop(): void {
    if (!active) return;
    active = false;
    foodDrawer.close();
    recipeDrawer.close();
    row.hidden = true;
    stopCut();
    clearDone();
    kitchen.classList.remove('is-in');
    clearTimeout(outTimer);
    outTimer = window.setTimeout(() => (kitchen.hidden = true), KITCHEN_OUT_MS);
  }

  return {
    row,
    kitchen,
    start() {
      active = true;
      pot.length = 0;
      station = 'pot';
      row.hidden = false;
      clearTimeout(outTimer);
      kitchen.hidden = false;
      render();
      // Start below the stat bars, then slide up over them on the next frame.
      void kitchen.offsetHeight;
      kitchen.classList.add('is-in');
      cb.toast(STRINGS.cooking.start);
    },
    stop,
    active: () => active,
    update(next) {
      state = next;
      if (active) render();
    },
  };
}
