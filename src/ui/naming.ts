// The box that asks for the pet's name: when the egg hatches, and when you
// rename it from the Family Tree. It floats over the whole screen. The rules
// (what counts as a name) live in src/game/family.ts.

import { STRINGS } from '../strings';
import { NAME_MAX } from '../game/family';

export interface NameRequest {
  title: string;
  ask: string; // a line under the title ('' for none)
  value: string; // the name filled in to start with
  canCancel: boolean; // false when hatching: the pet needs a name
  suggest: (current: string) => string; // another name idea
  // Returns a message to show if the name was refused, or null if saved.
  onSave: (name: string) => string | null;
}

export interface NamingBox {
  open: (request: NameRequest) => void;
  close: () => void;
  isOpen: () => boolean;
}

// A pixel die, for "Pick a name for me".
const DICE_ICON = `
  <svg viewBox="0 0 12 12" width="22" height="22" shape-rendering="crispEdges" aria-hidden="true">
    <path fill="currentColor" d="M2 0h8v1H2zM1 1h1v1H1zM10 1h1v1h-1zM0 2h1v8H0zM11 2h1v8h-1zM1 10h1v1H1zM10 10h1v1h-1zM2 11h8v1H2zM3 3h2v2H3zM7 3h2v2H7zM5 5h2v2H5zM3 7h2v2H3zM7 7h2v2H7z"/>
  </svg>`;

export function createNamingBox(root: HTMLElement): NamingBox {
  const backdrop = document.createElement('div');
  backdrop.className = 'name-backdrop';
  backdrop.hidden = true;

  const box = document.createElement('form');
  box.className = 'name-box';
  box.setAttribute('role', 'dialog');
  box.setAttribute('aria-modal', 'true');
  box.setAttribute('aria-labelledby', 'name-box-title');
  box.noValidate = true;

  const title = document.createElement('h2');
  title.id = 'name-box-title';
  const ask = document.createElement('p');
  ask.className = 'name-ask';

  const field = document.createElement('div');
  field.className = 'name-field';
  const input = document.createElement('input');
  input.type = 'text';
  input.maxLength = NAME_MAX * 2; // emoji take two; cleanName() trims to NAME_MAX letters
  input.autocomplete = 'off';
  input.spellcheck = false;
  input.setAttribute('aria-label', STRINGS.naming.label);
  input.setAttribute('enterkeyhint', 'done');
  const dice = document.createElement('button');
  dice.type = 'button';
  dice.className = 'name-dice';
  dice.innerHTML = DICE_ICON;
  dice.title = STRINGS.naming.random;
  dice.setAttribute('aria-label', STRINGS.naming.random);
  field.append(input, dice);

  const error = document.createElement('p');
  error.className = 'name-error';
  error.setAttribute('role', 'alert');

  const buttons = document.createElement('div');
  buttons.className = 'name-buttons';
  const cancel = document.createElement('button');
  cancel.type = 'button';
  cancel.className = 'shop-btn shop-btn-soft';
  cancel.textContent = STRINGS.naming.cancel;
  const save = document.createElement('button');
  save.type = 'submit';
  save.className = 'shop-btn';
  save.textContent = STRINGS.naming.save;
  buttons.append(cancel, save);

  box.append(title, ask, field, error, buttons);
  backdrop.append(box);
  root.append(backdrop);

  let request: NameRequest | null = null;

  function close(): void {
    request = null;
    backdrop.hidden = true;
  }

  dice.addEventListener('click', () => {
    if (!request) return;
    input.value = request.suggest(input.value.trim());
    error.textContent = '';
    dice.classList.remove('roll');
    void dice.offsetWidth; // restart the little spin
    dice.classList.add('roll');
  });
  input.addEventListener('input', () => (error.textContent = ''));
  box.addEventListener('submit', (e) => {
    e.preventDefault();
    if (!request) return;
    const refused = request.onSave(input.value);
    if (refused) {
      error.textContent = refused;
      input.focus();
    } else {
      close();
    }
  });
  cancel.addEventListener('click', close);
  backdrop.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && request?.canCancel) close();
  });

  return {
    open(next) {
      request = next;
      title.textContent = next.title;
      ask.textContent = next.ask;
      ask.hidden = next.ask === '';
      input.value = next.value;
      error.textContent = '';
      cancel.hidden = !next.canCancel;
      backdrop.hidden = false;
      input.focus();
      input.select();
    },
    close,
    isOpen: () => request !== null,
  };
}
