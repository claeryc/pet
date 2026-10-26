// The menu inside the gear button's panel (it opens like Feed and Play). It
// has a main list (Shop, Messages, Journeys, Collection, Skills, Family Tree,
// Guide, Settings) and a page for each, plus the Wardrobe, which opens when you
// hold the pet. The Journeys tile opens Journeys over the stat bars, as
// Play > Journeys does.
// Shop, Collection and Family Tree only appear once they've opened up (see
// src/game/unlocks.ts), with a "new" dot until you've looked at them.
// Items for features we haven't built yet are shown greyed out with
// "Coming soon".

import { STRINGS } from '../strings';
import { CONFIG } from '../game/config';
import type { GameState } from '../game/state';
import { isNew, isUnlocked, type UnlockId } from '../game/unlocks';
import { LOCK_ICON, MENU_ICONS } from './icons';
import { fragmentPill, goldPill, shopPage, wardrobePage, type ShopCallbacks, type ShopCategory, type ShopView } from './shop';
import { collectionPage } from './collection';
import { familyTreePage, type FamilyCallbacks, type TreeView } from './family';
import { OWNER_MAX } from '../game/family';
import type { RegularId } from '../game/regulars';
import { messagesPage, type MessagesTab } from './messages';
import { unreadMail } from '../game/messages';
import { canLearnIn, showPickedSkill, skillsPage, type SkillsCallbacks, type SkillsView } from './skills';
import { TREES, pointsToSpend } from '../game/skills';
import { audioSettings, setAudioSettings } from '../audio/audio';
import type { JourneysCallbacks } from './journeys';
import { hasBackpack } from '../game/presence';
import { GUIDES, guideOpen, type GuideId } from '../game/guides';
import { GUIDE_ICONS, guideName, guidePageCount } from './guide';

export interface DebugCallbacks {
  onFastForward: (hours: number) => void;
  onResetClock: () => void;
  onGrowNow: () => void;
  onAddGold: () => void;
  onSetCare: (score: number) => void;
  onShowAllMenus: (on: boolean) => void;
  onVisitorNow: () => void;
  onFriendScore: () => void;
  onPoopNow: () => void;
  onSmellNow: () => void;
}

export interface MenuCallbacks extends DebugCallbacks, ShopCallbacks, FamilyCallbacks, SkillsCallbacks, JourneysCallbacks {
  onReset: () => void;
  onOwner: (name: string) => void; // the player typed their name in Settings
  onSeen: (id: UnlockId) => void; // the player has looked at something new
  onMessagesSeen: () => void; // the player opened Messages
  onRemoveFriend: (friend: string) => void;
  onInvite: (friend: string) => boolean; // true if they're coming over
  onRegular: (id: RegularId) => void; // a regular's rewards card (Percy)
  onReadGuide: (id: GuideId) => void; // opened a guide in Menu > Guide
  onGuide: (id: GuideId) => void; // got to a part of the game with a guide
}

// Things only the home screen can do, passed in by it.
export interface MenuActions {
  onOpenDelivery: () => void; // go out to Percy to fill Percy's order
  onOpenMeet: () => void; // meet whoever is over (Play > Meet)
  onOpenJourneys: () => void; // the journey board (Play > Journeys)
}

export interface Menu {
  el: HTMLElement; // the menu's contents, placed inside the gear panel
  reset: () => void; // go back to the main list
  update: (state: GameState) => void;
  showWardrobe: () => void;
  showShop: (category?: ShopCategory) => void; // open the Shop, at `category`'s tab
}

// A row button, or with an `icon`, a square tile for the main grid.
function item(label: string, onClick?: () => void, isNew = false, icon?: string): HTMLButtonElement {
  const b = document.createElement('button');
  if (icon) {
    b.className = 'menu-tile';
    const pic = document.createElement('span');
    pic.className = 'menu-tile-icon';
    pic.innerHTML = icon;
    const name = document.createElement('span');
    name.className = 'menu-tile-label';
    name.textContent = label;
    b.append(pic, name);
  } else {
    b.className = 'menu-item';
    b.textContent = label;
  }
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
export function createMenu(cb: MenuCallbacks & MenuActions, isOpen: () => boolean, close: () => void): Menu {
  const panel = document.createElement('div');
  panel.className = 'menu-panel';

  // The pages redraw whenever the game changes (after buying something,
  // for example), so we remember which page is showing.
  let state: GameState | null = null;
  let page: 'main' | 'settings' | 'shop' | 'wardrobe' | 'collection' | 'skills' | 'familyTree' | 'messages' | 'guide' = 'main';

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
      }), !!onClick && isNew(state, id), MENU_ICONS[id]), // no dot on "coming soon" items
    ];
  }

  // The main list, shown as a grid of icon tiles.
  function showMain(): void {
    page = 'main';
    toTop();
    const grid = document.createElement('div');
    grid.className = 'menu-grid';
    grid.append(
      ...unlockable('shop', STRINGS.menu.shop, () => {
        showShop();
        cb.onGuide('shop');
      }),
      ...messagesItem(),
      ...journeysItem(),
      ...unlockable('collection', STRINGS.menu.collection, () => {
        showCollection();
        cb.onGuide('collection');
      }),
      ...skillsItem(),
      ...unlockable('familyTree', STRINGS.menu.familyTree, () => showFamilyTree()),
      ...(state && guideOpen(state, 'basics') ? [item(STRINGS.menu.guide, () => showGuide(), false, MENU_ICONS.guide)] : []),
      item(STRINGS.menu.settings, showSettings, false, MENU_ICONS.settings),
    );
    panel.replaceChildren(grid);
  }

  // Messages, with a dot while there's new mail from Percy (or until it's
  // been looked at once).
  function messagesItem(): HTMLButtonElement[] {
    const entry = unlockable('messages', STRINGS.menu.messages, () => showMessages());
    if (entry.length && state && unreadMail(state) > 0 && !isNew(state, 'messages')) {
      const dot = document.createElement('span');
      dot.className = 'new-dot';
      dot.setAttribute('aria-label', STRINGS.messages.unread);
      entry[0].append(dot);
    }
    return entry;
  }

  // Journeys, with a dot while a backpack is waiting to be opened.
  function journeysItem(): HTMLButtonElement[] {
    const entry = unlockable('journeys', STRINGS.menu.journeys, () => {
      close();
      cb.onOpenJourneys();
    });
    if (entry.length && state && [state.pet, ...state.housemates].some(hasBackpack) && !isNew(state, 'journeys')) {
      const dot = document.createElement('span');
      dot.className = 'new-dot';
      dot.setAttribute('aria-label', STRINGS.journeys.backpackNote);
      entry[0].append(dot);
    }
    return entry;
  }

  // Skills, with a dot while there's a point to spend.
  function skillsItem(): HTMLButtonElement[] {
    const entry = unlockable('skills', STRINGS.menu.skills, () => {
      showSkills();
      cb.onGuide('skills');
    });
    if (entry.length && state && pointsToSpend(state) > 0 && !isNew(state, 'skills')) {
      const dot = document.createElement('span');
      dot.className = 'new-dot';
      dot.setAttribute('aria-label', STRINGS.skills.points(pointsToSpend(state)));
      entry[0].append(dot);
    }
    return entry;
  }

  // Mail or Friends, in Messages. Mail each time you go in.
  let messagesTab: MessagesTab = 'mail';
  function showMessages(fresh = true): void {
    if (fresh) {
      messagesTab = 'mail';
      toTop();
    }
    // Reading the page counts as reading the mail, new mail included.
    if (state && (fresh || unreadMail(state) > 0)) queueMicrotask(cb.onMessagesSeen);
    page = 'messages';
    const list = document.createElement('div');
    list.className = 'shop-list messages';
    if (state) {
      list.append(...messagesPage(state, state.lastUpdated, messagesTab, {
        onTab: (tab) => {
          messagesTab = tab;
          showMessages(false);
        },
        onOpenDelivery: () => {
          close();
          cb.onOpenDelivery();
        },
        onOpenMeet: () => {
          close();
          cb.onOpenMeet();
        },
        onRemoveFriend: cb.onRemoveFriend,
        onInvite: cb.onInvite,
        onRegular: cb.onRegular,
        characterImage: cb.characterImage,
      }));
    }
    panel.replaceChildren(header(STRINGS.messages.title, showMain), list);
  }

  // Which Collection categories are unfolded. Everything starts folded
  // each time you go into a page, and stays as you left it while the page
  // redraws.
  const openCategories = new Set<string>();
  // List or Tree, and whose tree, in the Family Tree. The choice of view
  // stays while the game is open; the tree starts at your pet each time.
  const treeView: TreeView = { mode: 'list', focus: null };
  // The tree tab and skill picked in Skills. Each visit starts at Fishing
  // (or the first tree with a point to spend) and its next skill.
  const skillsView: SkillsView = { tree: 'fishing', skill: null };
  // The Shop's tab. Each visit starts at the first one (Today).
  const shopView: ShopView = { tab: 'today' };

  // The Shop, Wardrobe and Collection: a header (with gold on the right in
  // the Shop, lined up with the prices), then the list.
  function showList(which: 'shop' | 'wardrobe' | 'collection' | 'skills' | 'familyTree', fresh: boolean): void {
    if (fresh) {
      openCategories.clear();
      shopView.tab = 'today';
      treeView.focus = null;
      toTop();
    }
    page = which;
    const list = document.createElement('div');
    list.className = 'shop-list';
    if (state) {
      if (which === 'shop') list.append(...shopPage(state, cb, shopView, () => {
        showShop(false);
        toTop();
      }));
      else if (which === 'wardrobe') list.append(...wardrobePage(state, cb));
      else if (which === 'collection') list.append(...collectionPage(state, cb, openCategories));
      else if (which === 'skills') list.append(...skillsPage(state, cb, skillsView, () => showSkills(false)));
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
      skills: STRINGS.skills.title,
      familyTree: STRINGS.menu.familyTree,
    }[which];
    // The Shop shows star fragments next to the gold.
    let right: HTMLElement | undefined;
    if (which === 'skills') right = goldPill(state?.gold ?? 0);
    if (which === 'shop') {
      right = document.createElement('span');
      right.className = 'shop-purse';
      right.append(goldPill(state?.gold ?? 0), fragmentPill(state?.fragments.pieces ?? 0));
    }
    panel.replaceChildren(header(title, showMain, right), list);
  }
  const showShop = (fresh = true) => showList('shop', fresh);
  const showWardrobe = (fresh = true) => showList('wardrobe', fresh);
  const showCollection = (fresh = true) => showList('collection', fresh);
  const showSkills = (fresh = true) => {
    if (fresh) {
      skillsView.tree = (state && TREES.find((t) => canLearnIn(state!, t))) ?? 'fishing';
      skillsView.skill = null;
    }
    showList('skills', fresh);
    // Open with the picked skill's Learn button in view, not under the bar.
    if (fresh) showPickedSkill(false, false);
  };
  const showFamilyTree = (fresh = true) => showList('familyTree', fresh);

  // The Guide: every "How it works" card, to read again. Ones not open yet
  // are locked; ones not read yet have a dot.
  function showGuide(fresh = true): void {
    if (fresh) toTop();
    page = 'guide';
    const G = STRINGS.guide;
    const intro = document.createElement('p');
    intro.className = 'guide-intro';
    intro.textContent = G.intro;
    const list = document.createElement('div');
    list.className = 'guide-list';
    const pet = state?.pet.name ?? '';
    for (const id of GUIDES) {
      const open = !!state && guideOpen(state, id);
      const read = !!state && state.guidesRead.includes(id);
      const row = document.createElement('button');
      row.className = 'guide-row';
      row.disabled = !open;
      const icon = document.createElement('span');
      icon.className = 'guide-row-icon';
      icon.innerHTML = open ? GUIDE_ICONS[id] : LOCK_ICON;
      const text = document.createElement('span');
      text.className = 'guide-row-text';
      const name = document.createElement('b');
      name.textContent = open ? guideName(id, pet) : '???';
      const about = document.createElement('small');
      about.textContent = open ? `${G.pages(guidePageCount(id))}${read ? ` · ${G.read}` : ''}` : G.locked;
      text.append(name, about);
      row.append(icon, text);
      if (open) {
        const go = document.createElement('span');
        go.className = 'guide-row-go';
        if (!read) {
          const dot = document.createElement('span');
          dot.className = 'new-dot';
          dot.setAttribute('aria-label', G.unread);
          go.append(dot);
        }
        go.append('›');
        row.append(go);
        row.addEventListener('click', () => cb.onReadGuide(id));
      }
      list.append(row);
    }
    panel.replaceChildren(header(G.title, showMain), intro, list);
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
    const visitor = document.createElement('button');
    visitor.className = 'chip';
    visitor.textContent = STRINGS.debug.visitorNow;
    visitor.addEventListener('click', cb.onVisitorNow);
    const friendship = document.createElement('button');
    friendship.className = 'chip';
    friendship.textContent = STRINGS.debug.friendScore(CONFIG.debug.friendScore);
    friendship.addEventListener('click', cb.onFriendScore);
    const poop = document.createElement('button');
    poop.className = 'chip';
    poop.textContent = STRINGS.debug.poopNow;
    poop.addEventListener('click', cb.onPoopNow);
    const smell = document.createElement('button');
    smell.className = 'chip';
    smell.textContent = STRINGS.debug.smellNow;
    smell.addEventListener('click', cb.onSmellNow);
    row.append(back, grow, gold, visitor, friendship, poop, smell);
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

  // Music and Sounds, each switched on or off.
  function audioToggles(): HTMLElement {
    const field = document.createElement('div');
    field.className = 'settings-field';
    for (const key of ['music', 'sounds'] as const) {
      const row = document.createElement('label');
      row.className = 'settings-toggle';
      const name = document.createElement('b');
      name.textContent = STRINGS.settings[key];
      const box = document.createElement('input');
      box.type = 'checkbox';
      box.setAttribute('role', 'switch');
      box.checked = audioSettings()[key];
      box.addEventListener('change', () => setAudioSettings({ ...audioSettings(), [key]: box.checked }));
      row.append(name, box);
      field.append(row);
    }
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
    panel.replaceChildren(header(STRINGS.menu.settings, showMain), ownerField(), audioToggles(), reset);
    if (CONFIG.debug.showTools) panel.append(debugSection());
  }

  showMain();
  return {
    el: panel,
    reset: showMain,
    showWardrobe: () => showWardrobe(),
    showShop: (category) => {
      showShop();
      if (category) {
        shopView.tab = category;
        showShop(false);
      }
    },
    update(next) {
      // Only redraw a page when something on it changed, so the list
      // doesn't jump while you scroll.
      // The Family Tree also shows the pet's stats and age, and the Shop
      // counts down to the next special.
      const key = (s: GameState | null) =>
        s &&
        JSON.stringify([
          s.gold, s.inventory, s.pet.hat, s.pet.stage, s.unlocked, s.seen, s.showAllMenus,
          s.recipesFound, s.caught, s.charactersFound, s.charactersMet, s.pet.name, s.pet.named, s.owner, s.family,
          s.messages, s.messagesSeenAt, s.keeper, s.delivery, s.friends, s.visit.guest, s.housemates.map((p) => [p.id, p.name, p.stage]),
          s.journeys, [s.pet, ...s.housemates].map((p) => [p.id, p.trip?.backAt, p.trip?.percy]), s.guidesRead,
          s.fragments.pieces, s.room, s.familyHome,
          page === 'messages' && Math.floor(s.lastUpdated / 60_000),
          page === 'shop' && Math.floor(s.lastUpdated / 3_600_000), // the special's countdown
          page === 'familyTree' && [Object.values(s.pet.stats).map(Math.round), Math.floor(s.lastUpdated / 3_600_000)],
        ]);
      const changed = key(state) !== key(next);
      state = next;
      if (changed) {
        if (page === 'main') showMain();
        else if (isOpen() && page === 'shop') showShop(false);
        else if (isOpen() && page === 'wardrobe') showWardrobe(false);
        else if (isOpen() && page === 'collection') showCollection(false);
        else if (isOpen() && page === 'skills') showSkills(false);
        else if (isOpen() && page === 'familyTree') showFamilyTree(false);
        else if (isOpen() && page === 'messages') showMessages(false);
        else if (isOpen() && page === 'guide') showGuide(false);
      }
      const p = next.pet;
      debugInfo.textContent = `${STRINGS.debug.careScore}: ${p.careScore.toFixed(1)} · ${STRINGS.debug.condition}: ${p.condition} · ${STRINGS.debug.character}: ${p.character ?? '-'}${p.variant ? ` (${p.variant})` : ''}`;
    },
  };
}
