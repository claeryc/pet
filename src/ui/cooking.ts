// The cooking pot. While you cook, the button row becomes
// [Close] [Recipes] [Cook], and a kitchen counter slides up over the stat
// bars into a panel of the same size, just like the pond does for fishing.
//
// The counter has two pages:
//  - the pot: three spots for food, what they will make, and your food
//    underneath. Tap your food to put it in the pot, tap it in the pot to
//    take it back out.
//  - the recipe book: every recipe, with what it needs and how many you
//    have (missing food is greyed out). Recipes you haven't cooked yet
//    show as "???" with one ingredient as a hint. Tap a recipe to fill
//    the pot with it.
//
// What a mix makes, and what cooking uses up, is decided in
// src/game/cooking.ts.

import { STRINGS } from '../strings';
import { CONFIG } from '../game/config';
import { foodCount } from '../game/economy';
import { haveAll, ingredientsFor, INGREDIENTS, knowsRecipe, matchRecipe, RECIPES } from '../game/cooking';
import type { Food, FoodId } from '../game/actions';
import type { GameState } from '../game/state';
import { ITEM_ICONS } from './icons';

export interface CookingCallbacks {
  // Cooks what's in the pot. Returns the dish made, or null if the game
  // refused (the reason is shown elsewhere).
  onCook: (items: FoodId[]) => FoodId | null;
  onExit: () => void;
  toast: (message: string) => void;
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
// How long the "just cooked" dish stays in the pot's result spot.
const DONE_MS = 1400;

const foodName = (id: FoodId) => STRINGS.foods[id];
const stars = (id: FoodId) => (CONFIG.foods as readonly Food[]).find((f) => f.id === id)?.stars ?? 0;
const countText = (n: number) => (n === Infinity ? '∞' : String(n));

export function createCooking(cb: CookingCallbacks): Cooking {
  let state: GameState | null = null;
  let active = false;
  let page: 'pot' | 'book' = 'pot';
  const pot: FoodId[] = []; // what's in the pot, in the order it went in
  let justMade: FoodId | null = null;
  let doneTimer = 0;
  let outTimer = 0;

  // ---- The buttons ----
  const row = document.createElement('div');
  row.className = 'actions cooking-row';
  row.hidden = true;
  const close = document.createElement('button');
  close.className = 'btn btn-soft';
  close.textContent = STRINGS.cooking.close;
  const flip = document.createElement('button');
  flip.className = 'btn btn-soft cooking-flip';
  const cookBtn = document.createElement('button');
  cookBtn.className = 'btn cooking-main';
  cookBtn.textContent = STRINGS.cooking.cook;
  row.append(close, flip, cookBtn);

  // ---- The counter ----
  const kitchen = document.createElement('div');
  kitchen.className = 'kitchen';
  kitchen.hidden = true;

  // Page 1: the pot.
  const potPage = document.createElement('div');
  potPage.className = 'kitchen-page pot-page';
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
  const result = document.createElement('div');
  result.className = 'pot-result';
  result.setAttribute('role', 'img');
  const steam = document.createElement('span');
  steam.className = 'pot-steam';
  steam.setAttribute('aria-hidden', 'true');
  const resultIcon = document.createElement('span');
  resultIcon.className = 'pot-result-icon';
  result.append(steam, resultIcon);
  potRow.append(result);

  const pantry = document.createElement('div');
  pantry.className = 'pantry';
  pantry.setAttribute('role', 'group');
  pantry.setAttribute('aria-label', STRINGS.cooking.pantry);
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
  potPage.append(potRow, pantry);

  // Page 2: the recipe book.
  const book = document.createElement('div');
  book.className = 'kitchen-page recipe-book';
  book.setAttribute('role', 'list');
  book.setAttribute('aria-label', STRINGS.cooking.book);
  const bookRows = RECIPES.map((recipe) => {
    const b = document.createElement('button');
    b.className = 'recipe';
    b.setAttribute('role', 'listitem');
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
  const bookHead = document.createElement('div');
  bookHead.className = 'recipe-book-head';
  book.append(bookHead, ...bookRows.map((r) => r.b));

  kitchen.append(potPage, book);

  function sign(text: string): HTMLElement {
    const s = document.createElement('span');
    s.className = 'pot-sign';
    s.textContent = text;
    s.setAttribute('aria-hidden', 'true');
    return s;
  }

  // How many of a food are still out of the pot.
  function left(id: FoodId): number {
    if (!state) return 0;
    return foodCount(state, id) - pot.filter((p) => p === id).length;
  }

  function addToPot(id: FoodId): void {
    if (pot.length >= CONFIG.cooking.slots) return cb.toast(STRINGS.cooking.full);
    if (left(id) <= 0) return cb.toast(STRINGS.cooking.noneLeft(foodName(id)));
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
    showPage('pot');
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
    showPage('pot');
  }

  function clearDone(): void {
    clearTimeout(doneTimer);
    justMade = null;
    potRow.classList.remove('cooked');
  }

  function showPage(next: 'pot' | 'book'): void {
    page = next;
    kitchen.dataset.page = next;
    flip.textContent = next === 'pot' ? STRINGS.cooking.recipes : STRINGS.cooking.pot;
    if (next === 'book') book.scrollTop = 0;
    render();
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

    // The result spot: the dish you just made, the dish a known recipe will
    // make, a "?" for anything else, or the empty pot.
    const known = matchRecipe(pot);
    const preview = justMade ?? (known && knowsRecipe(s, known.id) ? known.id : null);
    resultIcon.innerHTML = preview ? ITEM_ICONS[preview] : pot.length > 0 ? ITEM_ICONS.unknown : ITEM_ICONS.cooking;
    result.dataset.kind = justMade ? 'done' : preview ? 'known' : pot.length > 0 ? 'mystery' : 'empty';
    result.setAttribute(
      'aria-label',
      preview ? STRINGS.cooking.willMake(foodName(preview)) : pot.length > 0 ? STRINGS.cooking.mystery : STRINGS.cooking.result,
    );

    for (const p of pantryItems) {
      const n = left(p.id);
      p.count.textContent = countText(n);
      p.b.classList.toggle('faded', n <= 0);
      p.b.setAttribute('aria-label', STRINGS.cooking.addToPot(foodName(p.id), countText(n)));
    }
    cookBtn.disabled = pot.length === 0;

    const found = RECIPES.filter((r) => knowsRecipe(s, r.id)).length;
    bookHead.textContent = `${STRINGS.cooking.book} · ${STRINGS.cooking.found(found, RECIPES.length)}`;
    for (const r of bookRows) {
      const isKnown = knowsRecipe(s, r.recipe.id);
      const needs = ingredientsFor(s, r.recipe);
      const ready = isKnown && haveAll(s, r.recipe.ingredients);
      r.b.classList.toggle('unknown', !isKnown);
      r.b.classList.toggle('ready', ready);
      r.icon.innerHTML = isKnown ? ITEM_ICONS[r.recipe.id] : ITEM_ICONS.unknown;
      const n = stars(r.recipe.id);
      r.label.textContent = isKnown ? foodName(r.recipe.id) : STRINGS.cooking.unknown;
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
            const missing = need.have < need.need;
            chip.classList.toggle('missing', missing);
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

  flip.addEventListener('click', () => showPage(page === 'pot' ? 'book' : 'pot'));
  cookBtn.addEventListener('click', cookIt);
  close.addEventListener('click', () => {
    stop();
    cb.onExit();
  });

  function stop(): void {
    if (!active) return;
    active = false;
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
      showPage('pot');
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
