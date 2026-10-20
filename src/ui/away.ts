// The "While you were away" card: floats over the screen when you come back
// after a while, listing what happened (worked out in src/game/away.ts),
// one line each with a little picture. Styled like the naming box; tap
// Got it to close.

import { STRINGS } from '../strings';
import type { AwayNote } from '../game/away';
import type { FoodId } from '../game/actions';
import { ITEM_ICONS, STAT_ICONS } from './icons';
import { formatDuration } from './time';

export interface AwayCard {
  open: (notes: AwayNote[], petName: string, awayMs: number) => void;
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
  }
}

export function createAwayCard(root: HTMLElement): AwayCard {
  const backdrop = document.createElement('div');
  backdrop.className = 'name-backdrop';
  backdrop.hidden = true;
  const box = document.createElement('div');
  box.className = 'name-box away-box';
  box.setAttribute('role', 'dialog');
  box.setAttribute('aria-modal', 'true');
  box.setAttribute('aria-labelledby', 'away-box-title');
  const title = document.createElement('h2');
  title.id = 'away-box-title';
  title.textContent = STRINGS.away.title;
  const gone = document.createElement('p');
  gone.className = 'name-ask';
  const list = document.createElement('ul');
  list.className = 'away-list';
  const ok = document.createElement('button');
  ok.className = 'shop-btn choice-btn';
  ok.textContent = STRINGS.away.ok;
  box.append(title, gone, list, ok);
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
    open(notes, petName, awayMs) {
      open = true;
      gone.textContent = STRINGS.away.gone(formatDuration(awayMs));
      list.replaceChildren(
        ...notes.map((note) => {
          const { icon, text } = line(note, petName);
          const li = document.createElement('li');
          const pic = document.createElement('span');
          pic.className = 'away-icon';
          pic.innerHTML = icon;
          pic.setAttribute('aria-hidden', 'true');
          li.append(pic, text);
          return li;
        }),
      );
      backdrop.hidden = false;
      ok.focus();
    },
    isOpen: () => open,
  };
}
