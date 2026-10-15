// The menu that slides up when you tap the gear button. It has a main list
// (Shop, Inventory, Mini-games, Family Tree, Settings) and a page for each.
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
  el: HTMLElement;
  open: () => void;
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

export function createMenu(cb: MenuCallbacks): Menu {
  // A see-through backdrop covering the screen, with the panel on top.
  const el = document.createElement('div');
  el.className = 'menu-backdrop';
  el.hidden = true;

  const panel = document.createElement('div');
  panel.className = 'menu-panel';
  panel.setAttribute('role', 'dialog');
  el.append(panel);

  const close = () => (el.hidden = true);

  // The Shop and Inventory pages redraw whenever the game changes (after
  // buying something, for example), so we remember which page is showing.
  let state: GameState | null = null;
  let page: 'main' | 'settings' | 'shop' | 'inventory' = 'main';
  // Tapping outside the panel closes the menu.
  el.addEventListener('click', (e) => {
    if (e.target === el) close();
  });

  // Live readout for the testing tools, refreshed by update().
  const debugInfo = document.createElement('p');
  debugInfo.className = 'debug-info';

  function header(title: string, onBack?: () => void): HTMLElement {
    const h = document.createElement('div');
    h.className = 'menu-header';
    const left = document.createElement('button');
    left.className = 'menu-header-btn';
    if (onBack) {
      left.textContent = '‹';
      left.setAttribute('aria-label', STRINGS.menu.back);
      left.addEventListener('click', onBack);
    } else {
      left.style.visibility = 'hidden';
    }
    const t = document.createElement('h2');
    t.textContent = title;
    const x = document.createElement('button');
    x.className = 'menu-header-btn';
    x.textContent = '×';
    x.setAttribute('aria-label', STRINGS.menu.close);
    x.addEventListener('click', close);
    h.append(left, t, x);
    return h;
  }

  function showMain(): void {
    page = 'main';
    panel.replaceChildren(
      header(STRINGS.menu.title),
      item(STRINGS.menu.shop, showShop),
      item(STRINGS.menu.inventory, showInventory),
      item(STRINGS.menu.minigames),
      item(STRINGS.menu.familyTree),
      item(STRINGS.menu.settings, showSettings),
    );
  }

  // The gold you have, shown at the top of the Shop and Inventory.
  function goldLine(): HTMLElement {
    const p = document.createElement('div');
    p.className = 'menu-gold';
    p.append(goldPill(state?.gold ?? 0));
    return p;
  }

  function showShop(): void {
    page = 'shop';
    const list = document.createElement('div');
    list.className = 'shop-list';
    if (state) list.append(...shopPage(state, cb));
    panel.replaceChildren(header(STRINGS.shop.title, showMain), goldLine(), list);
  }

  function showInventory(): void {
    page = 'inventory';
    const list = document.createElement('div');
    list.className = 'shop-list';
    if (state) list.append(...inventoryPage(state, cb));
    panel.replaceChildren(header(STRINGS.inventory.title, showMain), goldLine(), list);
  }

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

  return {
    el,
    open() {
      showMain();
      el.hidden = false;
    },
    update(next) {
      // Only redraw the Shop or Inventory when something in it changed, so
      // the list doesn't jump while you scroll.
      const key = (s: GameState | null) => s && JSON.stringify([s.gold, s.inventory, s.pet.hat, s.pet.stage]);
      const changed = key(state) !== key(next);
      state = next;
      if (changed && !el.hidden && page === 'shop') showShop();
      if (changed && !el.hidden && page === 'inventory') showInventory();
      const p = next.pet;
      debugInfo.textContent = `${STRINGS.debug.careScore}: ${p.careScore.toFixed(1)} · ${STRINGS.debug.condition}: ${p.condition} · ${STRINGS.debug.character}: ${p.character ?? '-'}${p.variant ? ` (${p.variant})` : ''}`;
    },
  };
}
