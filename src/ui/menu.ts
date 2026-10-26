// The menu inside the gear button's panel (it opens like Feed and Play). It
// has a main list (Shop, Messages, Journeys, Collection, Skills, Family Tree,
// Guide, Settings) and a page for each, plus the Wardrobe, which opens when you
// hold the pet. The Journeys tile opens Journeys over the stat bars, as
// Play > Journeys does.
// The main page puts Shop and Journeys first and biggest, then the rest as
// smaller tiles with a line each, then Guide and Settings. Tiles only
// appear once their part of the game has opened up (see
// src/game/unlocks.ts), with a "new" dot until you've looked at them.

import { STRINGS } from '../strings';
import { CONFIG } from '../game/config';
import type { GameState } from '../game/state';
import { isNew, isUnlocked, type UnlockId } from '../game/unlocks';
import { LOCK_ICON, MENU_ICONS } from './icons';
import { goldPill, shopPage, wardrobePage, type ShopCallbacks, type ShopCategory, type ShopView } from './shop';
import { collectionPage } from './collection';
import { journalPage } from './journal';
import { familyTreePage, type FamilyCallbacks, type TreeView } from './family';
import { meadowPage, type MeadowCallbacks } from './meadow';
import { OWNER_MAX } from '../game/family';
import type { RegularId } from '../game/regulars';
import { messagesPage, type MessagesTab } from './messages';
import { unreadMail } from '../game/messages';
import { canLearnIn, showPickedSkill, skillsPage, type SkillsCallbacks, type SkillsView } from './skills';
import { TREES, keeperLevel, pointsToSpend } from '../game/skills';
import { audioSettings, setAudioSettings } from '../audio/audio';
import type { JourneysCallbacks } from './journeys';
import { hasBackpack, isAway } from '../game/presence';
import { badgeCount } from '../game/achievements';
import { dailySpecial, getHat, ownsSpecial } from '../game/economy';
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
  onMeadowVisitNow: () => void;
  onFriendScore: () => void;
  onPoopNow: () => void;
  onSmellNow: () => void;
}

export interface MenuCallbacks extends DebugCallbacks, ShopCallbacks, FamilyCallbacks, SkillsCallbacks, JourneysCallbacks, MeadowCallbacks {
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
  showJournal: (place: string) => void; // the travel journal, at a place
}

// Text for a tile's line, which is set as HTML (for the special's pink
// "25% off").
const escapeHtml = (t: string) => t.replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]!);

// A row button (Settings' Start over).
function item(label: string, onClick: () => void): HTMLButtonElement {
  const b = document.createElement('button');
  b.className = 'menu-item';
  b.textContent = label;
  b.addEventListener('click', onClick);
  return b;
}

export type MenuPage = 'main' | 'settings' | 'shop' | 'wardrobe' | 'collection' | 'skills' | 'familyTree' | 'meadow' | 'messages' | 'guide' | 'journal';

// `isOpen` says whether the panel is showing; `close` folds it up.
// `onPage` hears which page is showing, each time one is drawn.
export function createMenu(cb: MenuCallbacks & MenuActions, isOpen: () => boolean, close: () => void, onPage?: (page: MenuPage) => void): Menu {
  const panel = document.createElement('div');
  panel.className = 'menu-panel';

  // The pages redraw whenever the game changes (after buying something,
  // for example), so we remember which page is showing.
  let state: GameState | null = null;
  let page: MenuPage = 'main';
  function setPage(next: MenuPage): void {
    // Leaving the Shop puts back whatever was being tried on.
    if (page === 'shop' && next !== 'shop') cb.onTryOn(null);
    page = next;
    onPage?.(next);
  }
  let journalPlace = 'market'; // which page of the travel journal is open

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

  // A tile on the main page. `size` sets its place: big (Shop and
  // Journeys, two across), medium (with a line under the name) or a quiet
  // pill at the bottom (Guide, Settings). `badge` is a number in its
  // corner (new mail, skill points), `dot` a "new" dot, each with what
  // screen readers say for it.
  type TileSize = 'big' | 'mid' | 'quiet';
  function tile(size: TileSize, label: string, icon: string, onClick: () => void, line = '', dot: string | null = null, badge = 0): HTMLButtonElement {
    const b = document.createElement('button');
    b.className = `menu-tile is-${size}`;
    const pic = document.createElement('span');
    pic.className = 'menu-tile-icon';
    pic.innerHTML = icon;
    const text = document.createElement('span');
    text.className = 'menu-tile-text';
    const name = document.createElement('span');
    name.className = 'menu-tile-label';
    name.textContent = label;
    text.append(name);
    if (line && size !== 'quiet') {
      const small = document.createElement('small');
      small.className = 'menu-tile-line';
      small.innerHTML = line;
      text.append(small);
    }
    b.append(pic, text);
    if (badge > 0) {
      const n = document.createElement('span');
      n.className = 'menu-badge';
      n.textContent = String(badge);
      if (dot) n.setAttribute('aria-label', dot);
      b.append(n);
    } else if (dot) {
      const d = document.createElement('span');
      d.className = 'new-dot';
      d.setAttribute('aria-label', dot);
      b.append(d);
    }
    b.addEventListener('click', onClick);
    return b;
  }

  // A tile that only shows once it has opened up. Opening it the first
  // time clears its "new" dot.
  function unlockable(id: UnlockId, size: TileSize, label: string, onClick: () => void, line = '', dot: string | null = null, badge = 0): HTMLButtonElement[] {
    if (!state || !isUnlocked(state, id)) return [];
    const fresh = isNew(state, id);
    const b = tile(size, label, MENU_ICONS[id], () => {
      cb.onSeen(id);
      onClick();
    }, line, fresh ? STRINGS.menu.new : dot, fresh ? 0 : badge);
    b.dataset.id = id;
    return [b];
  }

  // The main page: Shop and Journeys first and biggest, then the places
  // you visit now and then, then Guide and Settings, quietly at the bottom.
  function showMain(): void {
    setPage('main');
    toTop();
    const s = state;
    const M = STRINGS.menu;
    const big = document.createElement('div');
    big.className = 'menu-grid is-big';
    big.append(
      ...unlockable('shop', 'big', M.shop, () => {
        showShop();
        cb.onGuide('shop');
      }, s ? shopLine(s) : ''),
      ...journeysItem(),
    );
    const mid = document.createElement('div');
    mid.className = 'menu-grid is-mid';
    mid.append(
      ...messagesItem(),
      ...unlockable('collection', 'mid', M.collection, () => {
        showCollection();
        cb.onGuide('collection');
      }, s ? M.collectionLine(badgeCount(s).earned, badgeCount(s).total) : ''),
      ...skillsItem(),
      ...unlockable('familyTree', 'mid', M.familyTree, () => showFamilyTree(), s ? M.familyLine : ''),
      // The Meadow, once a pet has moved there.
      ...(s && (s.meadow.length > 0 || s.keepsakes.length > 0) ? [tile('mid', M.meadow, MENU_ICONS.meadow, () => showMeadow(), M.meadowLine(s.meadow.length))] : []),
    );
    const quiet = document.createElement('div');
    quiet.className = 'menu-grid is-quiet';
    quiet.append(
      ...(s && guideOpen(s, 'basics') ? [tile('quiet', M.guide, MENU_ICONS.guide, () => showGuide())] : []),
      tile('quiet', M.settings, MENU_ICONS.settings, showSettings),
    );
    panel.replaceChildren(...[big, mid, quiet].filter((g) => g.children.length > 0));
  }

  // Under the Shop's name: today's special while it's still to buy.
  function shopLine(s: GameState): string {
    const special = dailySpecial(s);
    if (!special || ownsSpecial(s, special)) return STRINGS.menu.shopLine;
    const names = special.kind === 'wallpaper' ? STRINGS.shop.wallpapers : special.kind === 'curtains' ? STRINGS.shop.curtains : STRINGS.shop.furniture;
    const name = special.kind === 'hat' ? getHat(special.id)?.name ?? special.id : names[special.id] ?? special.id;
    return STRINGS.menu.shopSpecial(Math.round(CONFIG.dailySpecial.off * 100), escapeHtml(name));
  }

  // Messages, with the number of new letters from Percy (or a "new" dot
  // until it's been looked at once).
  function messagesItem(): HTMLButtonElement[] {
    const unread = state ? unreadMail(state) : 0;
    return unlockable('messages', 'mid', STRINGS.menu.messages, () => showMessages(),
      unread > 0 ? STRINGS.menu.messagesNew(unread) : STRINGS.menu.messagesLine, STRINGS.messages.unread, unread);
  }

  // Journeys, with a dot while a backpack is waiting to be opened.
  function journeysItem(): HTMLButtonElement[] {
    if (!state) return [];
    const backpack = [state.pet, ...state.housemates].some(hasBackpack);
    const line = backpack ? STRINGS.menu.journeysBackpack : isAway(state.pet) ? STRINGS.menu.journeysAway(escapeHtml(state.pet.name)) : STRINGS.menu.journeysLine;
    return unlockable('journeys', 'big', STRINGS.menu.journeys, () => {
      close();
      cb.onOpenJourneys();
    }, line, backpack ? STRINGS.journeys.backpackNote : null);
  }

  // Skills, with the number of points to spend.
  function skillsItem(): HTMLButtonElement[] {
    if (!state) return [];
    const points = pointsToSpend(state);
    return unlockable('skills', 'mid', STRINGS.menu.skills, () => {
      showSkills();
      cb.onGuide('skills');
    }, points > 0 ? STRINGS.skills.points(points) : STRINGS.menu.skillsLine(keeperLevel(state)), STRINGS.skills.points(points), points);
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
    setPage('messages');
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
      shopView.scroll = 0;
      shopView.open = undefined;
      treeView.focus = null;
      toTop();
    }
    setPage(which);
    const list = document.createElement('div');
    list.className = 'shop-list';
    if (state) {
      if (which === 'shop') {
        // The Shop has its own header, under its awning.
        const tabBefore = shopView.tab;
        panel.replaceChildren(...shopPage(state, cb, shopView, () => {
          const scroll = panel.parentElement?.scrollTop ?? 0;
          showShop(false);
          // A new tab starts at the top; a sheet opening or closing stays put.
          if (shopView.tab !== tabBefore) toTop();
          else panel.parentElement?.scrollTo(0, scroll);
        }, showMain));
        return;
      } else if (which === 'wardrobe') list.append(...wardrobePage(state, cb));
      else if (which === 'collection') list.append(...collectionPage(state, { ...cb, onJournal: (place) => showJournal(place) }, openCategories));
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
    let right: HTMLElement | undefined;
    if (which === 'skills') right = goldPill(state?.gold ?? 0);
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

  // The travel journal, at a place's page (back goes to the Collection).
  function showJournal(place = journalPlace, fresh = true): void {
    if (fresh) toTop();
    setPage('journal');
    journalPlace = place;
    const list = document.createElement('div');
    list.className = 'shop-list journal';
    if (state) list.append(...journalPage(state, place, { characterImage: cb.characterImage, onPlace: (p) => showJournal(p) }));
    panel.replaceChildren(header(STRINGS.journeys.journal, () => showCollection()), list);
  }

  // The Meadow: its scene, everyone there, and their keepsakes.
  function showMeadow(fresh = true): void {
    if (fresh) toTop();
    setPage('meadow');
    const list = document.createElement('div');
    list.className = 'shop-list meadow';
    if (state) list.append(...meadowPage(state, cb));
    panel.replaceChildren(header(STRINGS.meadow.title, showMain), list);
  }

  // The Guide: every "How it works" card, to read again. Ones not open yet
  // are locked; ones not read yet have a dot.
  function showGuide(fresh = true): void {
    if (fresh) toTop();
    setPage('guide');
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
    const meadowVisit = document.createElement('button');
    meadowVisit.className = 'chip';
    meadowVisit.textContent = STRINGS.meadow.debugVisit;
    meadowVisit.addEventListener('click', cb.onMeadowVisitNow);
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
    row.append(back, grow, gold, visitor, meadowVisit, friendship, poop, smell);
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
    setPage('settings');
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
    showJournal: (place) => showJournal(place),
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
          page === 'meadow' && [s.meadow, s.keepsakes, s.room, s.familyHome.room, s.visit.meadowId, s.pet.room, Math.floor(s.lastUpdated / 3_600_000)],
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
        else if (isOpen() && page === 'meadow') showMeadow(false);
        else if (isOpen() && page === 'journal') showJournal(journalPlace, false);
        else if (isOpen() && page === 'messages') showMessages(false);
        else if (isOpen() && page === 'guide') showGuide(false);
      }
      const p = next.pet;
      debugInfo.textContent = `${STRINGS.debug.careScore}: ${p.careScore.toFixed(1)} · ${STRINGS.debug.condition}: ${p.condition} · ${STRINGS.debug.character}: ${p.character ?? '-'}${p.variant ? ` (${p.variant})` : ''}`;
    },
  };
}
