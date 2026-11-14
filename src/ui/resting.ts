// The card for pets resting under the stars (src/game/resting.ts), opened
// by tapping the star in the room's window. It shows each resting pet with
// "Bring back" (when a Revival Star is there and home has a free spot) and
// a quiet "Say goodbye", and how far the free star from fragments has
// come. Never a price: this is about care, not a sale.

import { STRINGS } from '../strings';
import type { Pet } from '../game/state';

export interface RestCardInfo {
  pets: Pet[];
  pieces: number; // star fragments so far
  perStar: number; // fragments for one Revival Star
  stars: number; // Revival Stars you have
  room: boolean; // a free spot at home
  portrait: (pet: Pet) => string | undefined; // an image URL for the pet
  onBringBack: (id: string) => void;
  onGoodbye: (id: string) => void;
}

export interface RestCard {
  open: (info: RestCardInfo) => void;
  close: () => void;
  isOpen: () => boolean;
}

const el = <K extends keyof HTMLElementTagNameMap>(tag: K, cls = '', text = ''): HTMLElementTagNameMap[K] => {
  const e = document.createElement(tag);
  if (cls) e.className = cls;
  if (text) e.textContent = text;
  return e;
};

export function createRestCard(root: HTMLElement): RestCard {
  const R = STRINGS.revival;
  const backdrop = el('div', 'name-backdrop');
  backdrop.hidden = true;
  const box = el('div', 'away-sheet rest-card');
  box.setAttribute('role', 'dialog');
  box.setAttribute('aria-modal', 'true');
  box.setAttribute('aria-labelledby', 'rest-card-title');
  backdrop.append(box);
  root.append(backdrop);

  let open = false;
  const close = () => {
    open = false;
    backdrop.hidden = true;
  };
  backdrop.addEventListener('click', (e) => {
    if (e.target === backdrop) close();
  });

  return {
    open(info) {
      if (info.pets.length === 0) return close();
      open = true;
      const one = info.pets.length === 1 ? info.pets[0] : null;
      const head = el('div', 'away-head');
      if (one) {
        const img = el('img');
        img.src = info.portrait(one) ?? '';
        img.alt = '';
        head.append(img);
      }
      const title = el('h2', '', one ? R.restTitle(one.name) : R.restTitleMany);
      title.id = 'rest-card-title';
      head.append(title, el('span', 'away-gone', R.restChip));
      const text = el('p', '', one ? R.restText(one.name) : R.restTextMany);
      const parts: HTMLElement[] = [head, text];
      if (info.stars > 0) {
        parts.push(el('small', '', R.haveStars(info.stars)));
      } else {
        const bar = el('div', 'rest-bar');
        const fill = el('i');
        fill.style.width = `${Math.min(100, (info.pieces / info.perStar) * 100)}%`;
        bar.append(fill);
        parts.push(bar, el('small', '', R.restProgress(info.pieces, info.perStar)));
      }
      if (info.stars > 0 && !info.room) parts.push(el('p', 'rest-note', R.restNoRoom));
      const can = info.stars > 0 && info.room;
      const list = el('ul', 'rest-list');
      for (const pet of info.pets) {
        const li = el('li', 'rest-pet');
        if (!one) {
          const img = el('img');
          img.src = info.portrait(pet) ?? '';
          img.alt = '';
          li.append(img, el('b', '', pet.name));
        }
        const back = el('button', `away-ok${can ? '' : ' is-off'}`, STRINGS.buttons.bringBack);
        back.disabled = !can;
        back.addEventListener('click', () => {
          close();
          info.onBringBack(pet.id);
        });
        const bye = el('button', 'rest-goodbye', R.goodbyeYes);
        bye.addEventListener('click', () => {
          close();
          info.onGoodbye(pet.id);
        });
        li.append(back, bye);
        list.append(li);
      }
      const shut = el('button', 'rest-close', R.restClose);
      shut.addEventListener('click', close);
      box.replaceChildren(...parts, list, shut);
      backdrop.hidden = false;
      shut.focus();
    },
    close,
    isOpen: () => open,
  };
}
