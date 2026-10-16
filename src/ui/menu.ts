// The menu inside the gear button's panel (it opens like Feed and Play). It
// has a main list (Shop, Inventory, Mini-games, Family Tree, Settings) and a
// page for each.
// Items for features we haven't built yet are shown greyed out with
// "Coming soon".

import { STRINGS } from '../strings';
import { CONFIG } from '../game/config';
import type { GameState } from '../game/state';
import { goldPill, inventoryPage, shopPage, type ShopCallbacks } from './shop';

export interface DebugCallbacks {
  onFastForward: (hours: number) => void;
  onResetClock: () => void;
  onGrowNow: () => void;
  onAddGold: () => void;
  onSetCare: (score: number) => void;
}

export interface MenuCallbacks extends DebugCallbacks, ShopCallbacks {
  onReset: () => void;
}

export interface Menu {
  el: HTMLElement; // the menu's contents, placed inside the gear panel
  reset: () => void; // go back to the main list
  update: (state: GameState) => void;
}

function item(label: string, onClick?: () => void): HTMLButtonElement {
  const b = document.createElement('button');
  b.className = 'menu-item';
  b.textContent = label;
  if (onClick) {
    b.addEventListener('click', onClick);
  } else {
    // Not built yet: show it, but disabled.
    b.disabled = true;
    const soon = document.createElement('span');
    soon.className = 'menu-soon';
    soon.textContent = STRINGS.menu.comingSoon;
    b.append(soon);
  }
  return b;
}

// `isOpen` says whether the panel is showing; `close` folds it up.
export function createMenu(cb: MenuCallbacks, isOpen: () => boolean, close: () => void): Menu {
  const panel = document.createElement('div');
  panel.className = 'menu-panel';

  // The Shop and Inventory pages redraw whenever the game changes (after
  // buying something, for example), so we remember which page is showing.
  let state: GameState | null = null;
  let page: 'main' | 'settings' | 'shop' | 'inventory' = 'main';

  // Live readout for the testing tools, refreshed by update().
  const debugInfo = document.createElement('p');
  debugInfo.className = 'debug-info';

  // "‹  Shop" at the top of a page, with a button back to the main list.
  // (Tapping the gear bar above closes the whole panel.)
  function header(title: string, onBack: () => void, right?: HTMLElement): HTMLElement {
    const h = document.createElement('div');
    h.className = 'menu-header';
    const back = document.createElement('button');
    back.className = 'menu-header-btn';
    back.textContent = '‹';
    back.setAttribute('aria-label', STRINGS.menu.back);
    back.addEventListener('click', onBack);
    const t = document.createElement('h2');
    t.textContent = title;
    const end = document.createElement('span');
    end.className = 'menu-header-end';
    if (right) end.append(right);
    h.append(back, t, end);
    return h;
  }

  function showMain(): void {
    page = 'main';
    panel.replaceChildren(
      item(STRINGS.menu.shop, () => showShop()),
      item(STRINGS.menu.inventory, () => showInventory()),
      item(STRINGS.menu.minigames),
      item(STRINGS.menu.familyTree),
      item(STRINGS.menu.settings, showSettings),
    );
  }

  // Which categories (Food, Hats) are unfolded. Everything starts folded
  // each time you go into the Shop or Inventory, and stays as you left it
  // while the page redraws.
  const openCategories = new Set<string>();

  // The Shop and Inventory: gold on the right of the header, lined up with
  // the prices, then the categories.
  function showList(which: 'shop' | 'inventory', fresh: boolean): void {
    if (fresh) openCategories.clear();
    page = which;
    const list = document.createElement('div');
    list.className = 'shop-list';
    if (state) list.append(...(which === 'shop' ? shopPage : inventoryPage)(state, cb, openCategories));
    const title = which === 'shop' ? STRINGS.shop.title : STRINGS.inventory.title;
    panel.replaceChildren(header(title, showMain, goldPill(state?.gold ?? 0)), list);
  }
  const showShop = (fresh = true) => showList('shop', fresh);
  const showInventory = (fresh = true) => showList('inventory', fresh);

  function debugSection(): HTMLElement {
    const section = document.createElement('div');
    section.className = 'debug';
    const h = document.createElement('h3');
    h.textContent = STRINGS.debug.title;
    const label = document.createElement('p');
    label.textContent = STRINGS.debug.fastForwardLabel;
    const row = document.createElement('div');
    row.className = 'debug-row';
    for (const hours of CONFIG.debug.fastForwardHours) {
      const b = document.createElement('button');
      b.className = 'chip';
      b.textContent = STRINGS.debug.fastForward(hours);
      b.addEventListener('click', () => cb.onFastForward(hours));
      row.append(b);
    }
    const back = document.createElement('button');
    back.className = 'chip';
    back.textContent = STRINGS.debug.resetClock;
    back.addEventListener('click', cb.onResetClock);
    const grow = document.createElement('button');
    grow.className = 'chip';
    grow.textContent = STRINGS.debug.growNow;
    grow.addEventListener('click', cb.onGrowNow);
    const gold = document.createElement('button');
    gold.className = 'chip';
    gold.textContent = STRINGS.debug.addGold(CONFIG.debug.addGold);
    gold.addEventListener('click', cb.onAddGold);
    row.append(back, grow, gold);
    // Care Score presets, to try out which characters appear.
    const careLabel = document.createElement('p');
    careLabel.textContent = STRINGS.debug.setCare;
    const careRow = document.createElement('div');
    careRow.className = 'debug-row';
    for (const score of CONFIG.debug.careScores) {
      const b = document.createElement('button');
      b.className = 'chip';
      b.textContent = String(score);
      b.addEventListener('click', () => cb.onSetCare(score));
      careRow.append(b);
    }
    section.append(h, label, row, careLabel, careRow, debugInfo);
    return section;
  }

  function showSettings(): void {
    page = 'settings';
    const reset = item(STRINGS.buttons.reset, () => {
      close();
      cb.onReset();
    });
    reset.classList.add('menu-item-danger');
    panel.replaceChildren(header(STRINGS.menu.settings, showMain), reset);
    if (CONFIG.debug.showTools) panel.append(debugSection());
  }

  showMain();
  return {
    el: panel,
    reset: showMain,
    update(next) {
      // Only redraw the Shop or Inventory when something in it changed, so
      // the list doesn't jump while you scroll.
      const key = (s: GameState | null) => s && JSON.stringify([s.gold, s.inventory, s.pet.hat, s.pet.stage]);
      const changed = key(state) !== key(next);
      state = next;
      if (changed && isOpen() && page === 'shop') showShop(false);
      if (changed && isOpen() && page === 'inventory') showInventory(false);
      const p = next.pet;
      debugInfo.textContent = `${STRINGS.debug.careScore}: ${p.careScore.toFixed(1)} · ${STRINGS.debug.condition}: ${p.condition} · ${STRINGS.debug.character}: ${p.character ?? '-'}${p.variant ? ` (${p.variant})` : ''}`;
    },
  };
}
