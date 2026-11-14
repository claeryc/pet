// The "While you were away" card: floats over the screen when you come back
// after a while, listing what happened (worked out in src/game/away.ts),
// one line each with a little picture. Styled like the naming box; tap
// Got it to close.

import { STRINGS } from '../strings';
import type { AwayNote } from '../game/away';
import type { FoodId } from '../game/actions';
import { ITEM_ICONS, MENU_ICONS, STAT_ICONS } from './icons';
import { formatDuration } from './time';

export interface AwayCard {
  // `onMedicine`, when medicine would help now: a button on the sick line.
  open: (notes: AwayNote[], petName: string, awayMs: number, onMedicine?: () => void) => void;
  isOpen: () => boolean;
}

const food = (id: string) => STRINGS.foods[id as FoodId] ?? id;

// The picture and text for one line of the card.
function line(note: AwayNote, name: string): { icon: string; text: string } {
  const t = STRINGS.away;
  switch (note.kind) {
    case 'ready':
      return { icon: ITEM_ICONS[note.crop ?? ''] ?? ITEM_ICONS.plantGrowing, text: t.ready(note.count) };
    case 'dry':
      return { icon: STAT_ICONS.drop, text: t.dry(note.count) };
    case 'sickPlant':
      return { icon: ITEM_ICONS.plantSick, text: t.sickPlant(note.count) };
    case 'deadPlant':
      return { icon: ITEM_ICONS.plantDead, text: t.deadPlant(note.count) };
    case 'missedCraving':
      return { icon: ITEM_ICONS[note.food] ?? '', text: t.missedCraving(name, food(note.food)) };
    case 'craving':
      return { icon: ITEM_ICONS[note.food] ?? '', text: t.craving(name, food(note.food)) };
    case 'low':
      return { icon: STAT_ICONS[note.stat], text: t.low[note.stat](name) };
    case 'sick':
      return { icon: STAT_ICONS.health, text: t.sick(name) };
    case 'warning':
      return { icon: STAT_ICONS.health, text: t.warning(name) };
    case 'critical':
      return { icon: STAT_ICONS.health, text: t.critical(note.name, formatDuration(note.timeLeft)) };
    case 'passed':
      return { icon: ITEM_ICONS.revivalStar, text: t.passed(note.name) };
    case 'autoHoliday':
      return { icon: MENU_ICONS.meadow, text: STRINGS.journeys.autoHoliday(note.name, note.days) };
    case 'tripHome':
      return { icon: ITEM_ICONS.journey, text: t.tripHome(note.name, STRINGS.journeys.places[note.place] ?? note.place) };
  }
}

export function createAwayCard(root: HTMLElement): AwayCard {
  const backdrop = document.createElement('div');
  backdrop.className = 'name-backdrop';
  backdrop.hidden = true;
  const box = document.createElement('div');
  box.className = 'away-sheet';
  box.setAttribute('role', 'dialog');
  box.setAttribute('aria-modal', 'true');
  box.setAttribute('aria-labelledby', 'away-box-title');
  const head = document.createElement('div');
  head.className = 'away-head';
  const title = document.createElement('h2');
  title.id = 'away-box-title';
  title.textContent = STRINGS.away.title;
  const gone = document.createElement('span');
  gone.className = 'away-gone';
  head.append(title, gone);
  const list = document.createElement('ul');
  list.className = 'away-list';
  const ok = document.createElement('button');
  ok.className = 'away-ok';
  box.append(head, list, ok);
  backdrop.append(box);
  root.append(backdrop);

  let open = false;
  const close = () => {
    open = false;
    backdrop.hidden = true;
  };
  ok.addEventListener('click', close);
  backdrop.addEventListener('click', (e) => {
    if (e.target === backdrop) close();
  });

  return {
    open(notes, petName, awayMs, onMedicine) {
      open = true;
      gone.textContent = STRINGS.away.awayFor(formatDuration(awayMs));
      ok.textContent = STRINGS.away.backTo(petName);
      // The worst news first: sick, then the rest as it came.
      const urgent = (n: AwayNote) => n.kind === 'critical' || n.kind === 'sick' || n.kind === 'warning' || n.kind === 'passed';
      const sorted = [...notes.filter(urgent), ...notes.filter((n) => !urgent(n))];
      list.replaceChildren(
        ...sorted.map((note) => {
          const { icon, text } = line(note, petName);
          const li = document.createElement('li');
          li.dataset.kind = note.kind;
          if (urgent(note)) li.classList.add('is-urgent');
          const pic = document.createElement('span');
          pic.className = 'away-icon';
          pic.innerHTML = icon;
          pic.setAttribute('aria-hidden', 'true');
          const words = document.createElement('span');
          words.className = 'away-words';
          words.textContent = text;
          li.append(pic, words);
          if (onMedicine && (note.kind === 'sick' || note.kind === 'critical')) {
            const give = document.createElement('button');
            give.className = 'away-medicine';
            give.textContent = STRINGS.away.giveMedicine;
            give.addEventListener('click', () => {
              close();
              onMedicine();
            });
            li.append(give);
          }
          return li;
        }),
      );
      backdrop.hidden = false;
      ok.focus();
    },
    isOpen: () => open,
  };
}
