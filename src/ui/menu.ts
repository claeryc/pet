// The menu inside the gear button's panel (it opens like Feed and Play). It
// has a main list (Shop, Collection, Family Tree, Settings) and a page for
// each, plus the Wardrobe, which opens when you hold the pet.
// Shop, Collection and Family Tree only appear once they've opened up (see
// src/game/unlocks.ts), with a "new" dot until you've looked at them.
// Items for features we haven't built yet are shown greyed out with
// "Coming soon".

import { STRINGS } from '../strings';
import { CONFIG } from '../game/config';
import type { GameState } from '../game/state';
import { isNew, isUnlocked, type UnlockId } from '../game/unlocks';
import { goldPill, shopPage, wardrobePage, type ShopCallbacks } from './shop';
import { collectionPage } from './collection';
import { familyTreePage, type FamilyCallbacks, type TreeView } from './family';
import { OWNER_MAX } from '../game/family';

export interface DebugCallbacks {
  onFastForward: (hours: number) => void;
  onResetClock: () => void;
  onGrowNow: () => void;
  onAddGold: () => void;
  onSetCare: (score: number) => void;
  onShowAllMenus: (on: boolean) => void;
}

export interface MenuCallbacks extends DebugCallbacks, ShopCallbacks, FamilyCallbacks {
  onReset: () => void;
  onOwner: (name: string) => void; // the player typed their name in Settings
  onSeen: (id: UnlockId) => void; // the player has looked at something new
}

export interface Menu {
  el: HTMLElement; // the menu's contents, placed inside the gear panel
  reset: () => void; // go back to the main list
  update: (state: GameState) => void;
  showWardrobe: () => void;
}

function item(label: string, onClick?: () => void, isNew = false): HTMLButtonElement {
  const b = document.createElement('button');
  b.className = 'menu-item';
  b.textContent = label;
  if (isNew) {
    const dot = document.createElement('span');
    dot.className = 'new-dot';
    dot.setAttribute('aria-label', STRINGS.menu.new);
    b.append(dot);
  }
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

  // The pages redraw whenever the game changes (after buying something,
  // for example), so we remember which page is showing.
  let state: GameState | null = null;
  let page: 'main' | 'settings' | 'shop' | 'wardrobe' | 'collection' | 'familyTree' = 'main';

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

  // The panel keeps one height, so a long page scrolls inside it. Start
  // each newly opened page at the top.
  const toTop = () => panel.parentElement?.scrollTo(0, 0);

  // An entry that only shows once it has opened up. Opening it the first
  // time clears its "new" dot.
  function unlockable(id: UnlockId, label: string, onClick?: () => void): HTMLButtonElement[] {
    if (!state || !isUnlocked(state, id)) return [];
    return [
      item(label, onClick && (() => {
        cb.onSeen(id);
        onClick();
      }), !!onClick && isNew(state, id)), // no dot on "coming soon" items
    ];
  }

  function showMain(): void {
    page = 'main';
    toTop();
    panel.replaceChildren(
      ...unlockable('shop', STRINGS.menu.shop, () => showShop()),
      ...unlockable('collection', STRINGS.menu.collection, () => showCollection()),
      ...unlockable('familyTree', STRINGS.menu.familyTree, () => showFamilyTree()),
      item(STRINGS.menu.settings, showSettings),
    );
  }

  // Which categories (Food, Hats...) are unfolded. Everything starts folded
  // each time you go into a page, and stays as you left it while the page
  // redraws.
  const openCategories = new Set<string>();
  // List or Tree, and whose tree, in the Family Tree. The choice of view
  // stays while the game is open; the tree starts at your pet each time.
  const treeView: TreeView = { mode: 'list', focus: null };

  // The Shop, Wardrobe and Collection: a header (with gold on the right in
  // the Shop, lined up with the prices), then the list.
  function showList(which: 'shop' | 'wardrobe' | 'collection' | 'familyTree', fresh: boolean): void {
    if (fresh) {
      openCategories.clear();
      treeView.focus = null;
      toTop();
    }
    page = which;
    const list = document.createElement('div');
    list.className = 'shop-list';
    if (state) {
      if (which === 'shop') list.append(...shopPage(state, cb, openCategories));
      else if (which === 'wardrobe') list.append(...wardrobePage(state, cb));
      else if (which === 'collection') list.append(...collectionPage(state, cb, openCategories));
      else {
        list.classList.add('tree');
        list.append(...familyTreePage(state, cb, treeView, () => {
          showFamilyTree(false);
          toTop();
        }));
      }
    }
    const title = {
      shop: STRINGS.shop.title,
      wardrobe: STRINGS.wardrobe.title,
      collection: STRINGS.menu.collection,
      familyTree: STRINGS.menu.familyTree,
    }[which];
    const right = which === 'shop' ? goldPill(state?.gold ?? 0) : undefined;
    panel.replaceChildren(header(title, showMain, right), list);
  }
  const showShop = (fresh = true) => showList('shop', fresh);
  const showWardrobe = (fresh = true) => showList('wardrobe', fresh);
  const showCollection = (fresh = true) => showList('collection', fresh);
  const showFamilyTree = (fresh = true) => showList('familyTree', fresh);

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
    // Skip unlocking: every menu shows straight away.
    const allMenus = document.createElement('label');
    allMenus.className = 'debug-toggle';
    const box = document.createElement('input');
    box.type = 'checkbox';
    box.checked = state?.showAllMenus ?? false;
    box.addEventListener('change', () => cb.onShowAllMenus(box.checked));
    allMenus.append(box, STRINGS.debug.showAllMenus);
    section.append(h, label, row, careLabel, careRow, allMenus, debugInfo);
    return section;
  }

  // "Your name", saved when you leave the box or press Enter.
  function ownerField(): HTMLElement {
    const field = document.createElement('label');
    field.className = 'settings-field';
    const name = document.createElement('b');
    name.textContent = STRINGS.settings.owner;
    const input = document.createElement('input');
    input.type = 'text';
    input.maxLength = OWNER_MAX * 2; // trimmed to OWNER_MAX letters when saved
    input.setAttribute('autocomplete', 'nickname');
    input.placeholder = STRINGS.settings.ownerPlaceholder;
    input.value = state?.owner ?? '';
    input.setAttribute('enterkeyhint', 'done');
    const save = () => {
      cb.onOwner(input.value);
      input.value = state?.owner ?? '';
    };
    input.addEventListener('change', save);
    input.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') input.blur();
    });
    const hint = document.createElement('small');
    hint.textContent = STRINGS.settings.ownerHint;
    field.append(name, input, hint);
    return field;
  }

  function showSettings(): void {
    page = 'settings';
    toTop();
    const reset = item(STRINGS.buttons.reset, () => {
      close();
      cb.onReset();
    });
    reset.classList.add('menu-item-danger');
    panel.replaceChildren(header(STRINGS.menu.settings, showMain), ownerField(), reset);
    if (CONFIG.debug.showTools) panel.append(debugSection());
  }

  showMain();
  return {
    el: panel,
    reset: showMain,
    showWardrobe: () => showWardrobe(),
    update(next) {
      // Only redraw a page when something on it changed, so the list
      // doesn't jump while you scroll.
      // The Family Tree also shows the pet's stats and age.
      const key = (s: GameState | null) =>
        s &&
        JSON.stringify([
          s.gold, s.inventory, s.pet.hat, s.pet.stage, s.unlocked, s.seen, s.showAllMenus,
          s.recipesFound, s.caught, s.charactersFound, s.pet.name, s.pet.named, s.owner, s.family,
          page === 'familyTree' && [Object.values(s.pet.stats).map(Math.round), Math.floor(s.lastUpdated / 3_600_000)],
        ]);
      const changed = key(state) !== key(next);
      state = next;
      if (changed) {
        if (page === 'main') showMain();
        else if (isOpen() && page === 'shop') showShop(false);
        else if (isOpen() && page === 'wardrobe') showWardrobe(false);
        else if (isOpen() && page === 'collection') showCollection(false);
        else if (isOpen() && page === 'familyTree') showFamilyTree(false);
      }
      const p = next.pet;
      debugInfo.textContent = `${STRINGS.debug.careScore}: ${p.careScore.toFixed(1)} · ${STRINGS.debug.condition}: ${p.condition} · ${STRINGS.debug.character}: ${p.character ?? '-'}${p.variant ? ` (${p.variant})` : ''}`;
    },
  };
}
