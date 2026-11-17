// The stamp calendar sheet (see src/game/stamps.ts): a paper desk calendar
// with 28 days, each showing its reward, stamped with an ink paw for every
// day visited. Gift days are ribbon-wrapped boxes. Today's day says "Tap":
// tapping it stamps it, and a little card shows what it gave. The pet's
// wishes for today sit underneath (src/game/wishes.ts).

import { STRINGS } from '../strings';
import type { FoodId } from '../game/actions';
import { isGiftDay } from '../game/stamps';
import { CONFIG } from '../game/config';
import { ACHIEVEMENT_ICONS, FRAGMENT_ICON, ITEM_ICONS, STAT_ICONS } from './icons';
import { calendarIcon, gift, inkPaw, ring, spark, sparkSmall } from './stampArt';

const T = STRINGS.stamps;

export interface WishView {
  id: string;
  goal: number;
  progress: number;
  claimed: boolean;
}

export interface CalendarInfo {
  stamped: number; // days stamped on the card (0 to 28)
  due: boolean; // today's stamp is still waiting
  next: number; // the day the next stamp goes on
  rewards: readonly (readonly string[])[]; // each day's entries
  petName: string;
  wishes: WishView[];
}

export interface CalendarCallbacks {
  onStamp: () => void; // tapped today's day
  onClaim: (i: number) => void; // claimed wish `i`
}

export interface Calendar {
  open: (info: CalendarInfo) => void;
  update: (info: CalendarInfo) => void; // redraws it, if it's open
  close: () => void;
  isOpen: () => boolean;
  // The card for a day just stamped. `onDone` runs once it's closed.
  showStamp: (day: number, reward: readonly string[], toGift: { days: number; words: string } | null, onDone?: () => void) => void;
  chipIcon: () => string;
}

// How one entry looks: its icon, a short label for the tile, and words.
export function entryLook(entry: string): { icon: string; label: string; words: string } {
  const [kind, id] = entry.split(':');
  if (kind === 'gold') return { icon: STAT_ICONS.gold, label: T.gold(Number(id)), words: T.goldWords(Number(id)) };
  if (kind === 'frag') return { icon: FRAGMENT_ICON, label: T.fragments(Number(id)), words: T.fragmentWords(Number(id)) };
  if (kind === 'seed') {
    const name = STRINGS.foods[id as FoodId] ?? id;
    return { icon: ITEM_ICONS[`seed_${id}`] ?? ITEM_ICONS[id] ?? '', label: T.seed, words: STRINGS.garden.seedName(name) };
  }
  if (kind === 'mat') {
    const name = STRINGS.crafting.material[id] ?? id;
    return { icon: ITEM_ICONS[`mat_${id}`] ?? '', label: name, words: name };
  }
  const name = STRINGS.foods[entry as FoodId] ?? entry;
  return { icon: ITEM_ICONS[entry] ?? '', label: T.treat, words: name };
}

// A day's tile: a gift box on gift days, else its (first) reward.
function dayLook(day: number, entries: readonly string[]): { icon: string; label: string } {
  if (isGiftDay(day)) {
    const frag = entries.find((e) => e.startsWith('frag:'));
    return { icon: gift(day / 7 - 1), label: frag ? T.fragments(Number(frag.slice(5))) : entryLook(entries[0]).label };
  }
  return entryLook(entries[0]);
}

// What a day gives, in words: "30 gold", "8 star fragments + Beeswax".
export const rewardWords = (entries: readonly string[]): string => entries.map((e) => entryLook(e).words).join(' + ');

// Small shifts so each day's stamp lands a little differently.
const OFFSETS = [[0, 0], [1, -1], [-1, 1], [1, 1], [0, -1], [-1, 0], [1, 0], [0, 1], [-1, -1], [1, -1], [0, 0]];

const el = <K extends keyof HTMLElementTagNameMap>(tag: K, cls = '', text = ''): HTMLElementTagNameMap[K] => {
  const e = document.createElement(tag);
  if (cls) e.className = cls;
  if (text) e.textContent = text;
  return e;
};

export function createCalendar(root: HTMLElement, cb: CalendarCallbacks): Calendar {
  const backdrop = el('div', 'name-backdrop cal-backdrop');
  backdrop.hidden = true;
  const sheet = el('div', 'cal-sheet');
  sheet.setAttribute('role', 'dialog');
  sheet.setAttribute('aria-modal', 'true');
  sheet.setAttribute('aria-labelledby', 'cal-title');
  backdrop.append(sheet);

  const moment = el('div', 'name-backdrop cal-moment');
  moment.hidden = true;
  root.append(backdrop, moment);

  let open = false;
  const close = () => {
    open = false;
    backdrop.hidden = true;
  };
  backdrop.addEventListener('click', (e) => {
    if (e.target === backdrop) close();
  });

  function render(info: CalendarInfo): void {
    // The day to tap (when due), else the last one stamped.
    const today = info.due ? info.next : info.stamped;
    const shown = info.due && info.next === 1 ? 0 : info.stamped; // a new card starts empty
    const cal = el('div', 'cal');
    const rings = el('div', 'cal-rings');
    rings.innerHTML = ring().repeat(11);
    const top = el('div', 'cal-top');
    const h2 = el('h2', '', T.title);
    h2.id = 'cal-title';
    h2.append(el('small', '', T.subtitle));
    const tag = el('span', 'cal-tag');
    tag.innerHTML = inkPaw(99);
    tag.append(T.count(shown));
    top.append(h2, tag);
    const grid = el('div', 'cal-grid');
    info.rewards.forEach((entries, i) => {
      const n = i + 1;
      const look = dayLook(n, entries);
      const got = n <= shown;
      const isToday = info.due && n === today;
      const tile = el(isToday ? 'button' : 'div', `cal-day${isGiftDay(n) ? ' is-gift' : ''}${got ? ' is-got' : ''}${isToday ? ' is-today' : ''}`);
      tile.append(el('span', 'cal-n', String(n)));
      const icon = el('span', 'cal-ic');
      icon.innerHTML = look.icon;
      tile.append(icon, el('b', '', isToday ? T.tap : look.label));
      if (got) {
        const [dx, dy] = OFFSETS[n % OFFSETS.length];
        const st = el('span', 'cal-st');
        st.style.transform = `translate(${dx}px, ${dy}px)`;
        st.innerHTML = inkPaw(n + 3, 'ghost', 'transform:translate(2px,2px)') + inkPaw(n);
        tile.append(st);
      }
      if (isToday) {
        tile.setAttribute('aria-label', `${T.day} ${n}: ${rewardWords(entries)}. ${T.tap}`);
        tile.addEventListener('click', () => cb.onStamp());
      }
      grid.append(tile);
    });
    cal.append(rings, top, grid);

    const foot = el('p', 'cal-foot');
    if (info.stamped >= info.rewards.length && !info.due) {
      foot.textContent = T.full;
    } else {
      const day = info.next;
      const what = rewardWords(info.rewards[day - 1]);
      foot.append(el('b', '', info.due ? T.today(what) : T.next(what)), ' ', T.rule(day));
    }

    const label = el('div', 'cal-label', T.wishesTitle(info.petName));
    const wishes = el('div', 'cal-wishes');
    if (info.wishes.length === 0) wishes.append(el('p', 'cal-foot', T.noWishes));
    info.wishes.forEach((w, i) => {
      const done = w.progress >= w.goal;
      const row = el('div', `cal-wish${done ? ' is-done' : ''}${w.claimed ? ' is-claimed' : ''}`);
      const ic = el('span', 'cal-wi');
      ic.innerHTML = WISH_ICONS[w.id] ?? '';
      const t = el('span', 'cal-wt', (T.wishes[w.id] ?? (() => w.id))(w.goal));
      const small = el('small');
      small.innerHTML = STAT_ICONS.gold;
      small.append(T.wishGold(CONFIG.wishes.gold));
      t.append(small);
      row.append(ic, t);
      if (done && !w.claimed) {
        const claim = el('button', 'cal-claim', T.claim);
        claim.addEventListener('click', () => cb.onClaim(i));
        row.append(claim);
      } else {
        row.append(el('span', 'cal-count', w.claimed ? '✓' : `${w.progress}/${w.goal}`));
      }
      wishes.append(row);
    });
    sheet.replaceChildren(cal, foot, label, wishes);
  }

  return {
    open(info) {
      open = true;
      render(info);
      backdrop.hidden = false;
      sheet.querySelector<HTMLElement>('.cal-day.is-today')?.focus();
    },
    update(info) {
      if (open) render(info);
    },
    close,
    isOpen: () => open,
    showStamp(day, reward, toGift, onDone) {
      const card = el('div', 'cal-card');
      card.setAttribute('role', 'dialog');
      card.setAttribute('aria-modal', 'true');
      const stage = el('div', 'cal-stage');
      const gold = { o: '#e8b84a', b: '#ffe596' };
      const pink = { o: '#f48fb1', b: '#ffffff' };
      stage.innerHTML =
        `<div class="cal-page"><div class="cal-page-rings">${ring().repeat(4)}</div><div class="cal-page-hd">${T.day}</div>` +
        `<span class="cal-page-num">${day}</span>${inkPaw(day, 'ghost')}${inkPaw(day)}</div>` +
        spark('left:2px;top:30px;--u:3px', gold) + sparkSmall('left:16px;top:84px;--u:3px', gold) +
        spark('right:0;top:76px;--u:2px', pink) + sparkSmall('right:8px;top:12px;--u:3px', gold);
      const text = isGiftDay(day)
        ? day === 28 ? T.lastDay : T.giftToday
        : toGift ? T.toGift(toGift.days, toGift.words) : '';
      const pill = el('div', 'cal-reward');
      pill.append(el('i', '', T.todayTag));
      for (const e of reward) {
        const look = entryLook(e);
        const one = el('span');
        one.innerHTML = look.icon;
        one.append(look.words);
        pill.append(one);
      }
      const ok = el('button', 'cal-ok', T.lovely);
      card.append(stage, el('h3', '', T.stamped(day)), ...(text ? [el('p', '', text)] : []), pill, ok);
      moment.replaceChildren(card);
      moment.hidden = false;
      const done = () => {
        moment.hidden = true;
        onDone?.();
      };
      ok.addEventListener('click', done, { once: true });
      ok.focus();
    },
    chipIcon: () => calendarIcon(),
  };
}

// Each wish shows its badge's icon (they count the same things).
const WISH_ICONS: Record<string, string> = ACHIEVEMENT_ICONS;
