// The cooking pot. While you cook, the button row becomes
// [Close] [Food] [Recipes], and a kitchen counter slides up over the stat
// bars into a panel of the same size, just like the pond does for fishing.
//
// The counter shows the pot: three spots for food, then "=" and the pot
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
//
// What a mix makes, and what cooking uses up, is decided in
// src/game/cooking.ts.

import { STRINGS } from '../strings';
import { CONFIG } from '../game/config';
import { foodCount } from '../game/economy';
import { couldBeRecipe, haveAll, ingredientsFor, INGREDIENTS, knowsRecipe, matchRecipe, RECIPES } from '../game/cooking';
import type { Food, FoodId } from '../game/actions';
import type { GameState } from '../game/state';
import { createDrawer } from './drawer';
import { ITEM_ICONS } from './icons';
import { soldInShop, type ShopCategory } from './shop';

export interface CookingCallbacks {
  // Cooks what's in the pot. Returns the dish made, or null if the game
  // refused (the reason is shown elsewhere).
  onCook: (items: FoodId[]) => FoodId | null;
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
// How long the "just cooked" dish stays in the pot (the item reveal waits
// for it, so the pot gets its moment first).
export const DONE_MS = 1400;
// Space kept between the pot and an open Food or Recipes panel.
const PANEL_GAP = 12;

const foodName = (id: FoodId) => STRINGS.foods[id];
const stars = (id: FoodId) => (CONFIG.foods as readonly Food[]).find((f) => f.id === id)?.stars ?? 0;
const inShop = (id: FoodId) => (CONFIG.foods as readonly Food[]).some((f) => f.id === id && soldInShop(f));
const countText = (n: number) => (n === Infinity ? '∞' : String(n));

export function createCooking(cb: CookingCallbacks): Cooking {
  let state: GameState | null = null;
  let active = false;
  const pot: FoodId[] = []; // what's in the pot, in the order it went in
  let justMade: FoodId | null = null;
  let doneTimer = 0;
  let outTimer = 0;

  // ---- The counter with the pot ----
  const kitchen = document.createElement('div');
  kitchen.className = 'kitchen';
  kitchen.hidden = true;
  const potRow = document.createElement('div');
  potRow.className = 'pot-row';
  const slots = Array.from({ length: CONFIG.cooking.slots }, (_, i) => {
    const b = document.createElement('button');
    b.className = 'pot-slot';
    b.addEventListener('click', () => {
      if (pot[i] === undefined) return;
      pot.splice(i, 1);
      render();
    });
    return b;
  });
  slots.forEach((s, i) => {
    if (i > 0) potRow.append(sign('+'));
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
  potBtn.append(steam, potIcon);
  potBtn.addEventListener('click', cookIt);
  potRow.append(potBtn);
  kitchen.append(potRow);

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
  const pantryItems = INGREDIENTS.map((id) => {
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

  // How many of a food are still out of the pot.
  function left(id: FoodId): number {
    if (!state) return 0;
    return foodCount(state, id) - pot.filter((p) => p === id).length;
  }

  function addToPot(id: FoodId): void {
    if (pot.length >= CONFIG.cooking.slots) return cb.toast(STRINGS.cooking.full);
    if (left(id) <= 0) return cb.toast(STRINGS.cooking.noneLeft(foodName(id)), inShop(id) ? 'food' : undefined);
    clearDone();
    pot.push(id);
    render();
  }

  function pickRecipe(id: FoodId): void {
    if (!state) return;
    const recipe = RECIPES.find((r) => r.id === id)!;
    if (!knowsRecipe(state, id)) return cb.toast(STRINGS.cooking.hint(foodName(recipe.ingredients[0])));
    const missing = ingredientsFor(state, recipe).filter((i) => i.have < i.need);
    if (missing.length > 0) {
      return cb.toast(STRINGS.cooking.missing(missing.map((i) => foodName(i.id)).join(', ')));
    }
    clearDone();
    pot.splice(0, pot.length, ...recipe.ingredients);
    recipeDrawer.close();
    render();
  }

  function cookIt(): void {
    if (pot.length === 0) return cb.toast(STRINGS.cooking.emptyPot);
    const dish = cb.onCook([...pot]);
    if (!dish) return;
    pot.length = 0;
    justMade = dish;
    // Replay the bubbling animation.
    potRow.classList.remove('cooked');
    void potRow.offsetHeight;
    potRow.classList.add('cooked');
    clearTimeout(doneTimer);
    doneTimer = window.setTimeout(() => {
      justMade = null;
      potRow.classList.remove('cooked');
      render();
    }, DONE_MS);
    render();
  }

  function clearDone(): void {
    clearTimeout(doneTimer);
    justMade = null;
    potRow.classList.remove('cooked');
  }

  // Redraws everything from the pot and the latest state.
  function render(): void {
    if (!state) return;
    const s = state;
    // Drop anything from the pot you no longer have (e.g. eaten meanwhile).
    for (let i = pot.length - 1; i >= 0; i--) if (left(pot[i]) < 0) pot.splice(i, 1);

    slots.forEach((slot, i) => {
      const id = pot[i];
      slot.innerHTML = id ? ITEM_ICONS[id] : '';
      slot.classList.toggle('filled', id !== undefined);
      slot.setAttribute('aria-label', id ? STRINGS.cooking.inPot(foodName(id)) : STRINGS.cooking.emptySlot);
    });

    // The pot: the dish you just made, the dish a known recipe will make,
    // a "?" for anything else, or the empty pot.
    const known = matchRecipe(pot);
    const preview = justMade ?? (known && knowsRecipe(s, known.id) ? known.id : null);
    const mush = !preview && pot.length > 0 && !couldBeRecipe(pot);
    potIcon.innerHTML =
      preview ? ITEM_ICONS[preview]
      : mush ? ITEM_ICONS[CONFIG.cooking.mess]
      : pot.length > 0 ? ITEM_ICONS.unknown
      : ITEM_ICONS.cooking;
    potBtn.dataset.kind = justMade ? 'done' : preview ? 'known' : mush ? 'mush' : pot.length > 0 ? 'mystery' : 'empty';
    potBtn.setAttribute(
      'aria-label',
      justMade
        ? foodName(justMade)
        : pot.length === 0
          ? STRINGS.cooking.emptyPotLabel
          : preview
            ? STRINGS.cooking.cookInto(foodName(preview))
            : mush
              ? STRINGS.cooking.cookMush
              : STRINGS.cooking.cookMystery,
    );
    potBtn.title = mush ? STRINGS.cooking.cookMush : '';

    for (const p of pantryItems) {
      const n = left(p.id);
      p.count.textContent = countText(n);
      p.b.classList.toggle('faded', n <= 0);
      p.b.setAttribute('aria-label', STRINGS.cooking.addToPot(foodName(p.id), countText(n)));
      p.b.title = foodName(p.id);
    }

    const found = RECIPES.filter((r) => knowsRecipe(s, r.id)).length;
    bookHead.textContent = STRINGS.cooking.found(found, RECIPES.length);
    for (const r of bookRows) {
      const isKnown = knowsRecipe(s, r.recipe.id);
      const needs = ingredientsFor(s, r.recipe);
      r.b.classList.toggle('unknown', !isKnown);
      r.b.classList.toggle('ready', isKnown && haveAll(s, r.recipe.ingredients));
      r.icon.innerHTML = isKnown ? ITEM_ICONS[r.recipe.id] : ITEM_ICONS.unknown;
      r.label.textContent = isKnown ? foodName(r.recipe.id) : STRINGS.cooking.unknown;
      const n = stars(r.recipe.id);
      if (isKnown && n) {
        const st = document.createElement('small');
        st.className = 'recipe-stars';
        st.textContent = STRINGS.stars(n);
        r.label.append(st);
      }
      // Each ingredient: its icon and "have/need". Unknown recipes only
      // show their first ingredient; the rest are question marks.
      r.needs.replaceChildren(
        ...needs.map((need, i) => {
          const chip = document.createElement('span');
          chip.className = 'recipe-need';
          const hidden = !isKnown && i > 0;
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
        isKnown
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
