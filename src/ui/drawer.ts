// A Feed or Play button that opens into a panel of choices.
//
// How it looks: tap the button and it slides wider to fill the whole row
// (the other buttons shrink away), then it grows upward to reveal a soft
// white-pink area with the options inside, framed by the pink button. Tap
// the button part (at the bottom) again to close it. The animation itself lives in style.css
// (look for "drawer"); this file just builds the pieces and flips a few
// data attributes that the CSS reacts to.

// One effect shown on the right of a row, e.g. [apple icon] "+20".
export interface Effect {
  icon: string; // SVG markup
  text: string;
  title: string; // full description, read out by screen readers
  kind?: 'up' | 'down' | 'timer'; // colours the chip
}

export interface DrawerOption {
  icon: string; // SVG markup for the item's picture
  label: string;
  effects: Effect[];
  onPick?: () => void; // leave out to show a disabled "coming soon" row
}

export interface Drawer {
  el: HTMLElement;
  isOpen: () => boolean;
  open: () => void;
  close: () => void;
  setDim: (dim: boolean) => void;
  // Small text next to an option's name, e.g. "x2", and whether that
  // option looks faded (e.g. none left).
  setNote: (index: number, note: string, faded?: boolean) => void;
  // Hides or shows an option (e.g. a dish you haven't cooked yet).
  setHidden: (index: number, hidden: boolean) => void;
}

export interface DrawerSetup {
  id: string; // used by the CSS, e.g. "feed"
  label: string; // the button text (or, with an icon, its name for screen readers)
  icon?: string; // SVG markup: shows this icon on the button instead of the text
  options?: DrawerOption[]; // a list of choices...
  content?: HTMLElement; // ...or anything else to show inside the panel
  onOpen?: () => void; // called each time the panel opens
  row: HTMLElement; // the row of buttons this drawer lives in
  comingSoon: string;
  // Called before opening. Return a message to show instead of opening
  // (e.g. "Mochi is asleep"), or null to open.
  beforeOpen: () => string | null;
  onBlocked: (message: string) => void;
}

export function createDrawer(setup: DrawerSetup): Drawer {
  const el = document.createElement('div');
  el.className = 'drawer';
  el.dataset.drawer = setup.id;

  const head = document.createElement('button');
  head.className = 'drawer-head';
  head.setAttribute('aria-expanded', 'false');
  head.innerHTML = `<span class="drawer-label"></span><span class="drawer-chevron" aria-hidden="true"></span>`;
  const headLabel = head.querySelector<HTMLElement>('.drawer-label')!;
  if (setup.icon) {
    headLabel.innerHTML = setup.icon;
    head.setAttribute('aria-label', setup.label);
  } else {
    headLabel.textContent = setup.label;
  }

  // The body uses a CSS trick (grid rows going from 0fr to 1fr) so it can
  // animate to exactly the height of its contents.
  const body = document.createElement('div');
  body.className = 'drawer-body';
  const inner = document.createElement('div');
  inner.className = 'drawer-inner';
  const options = document.createElement('div');
  options.className = 'drawer-options';
  if (setup.content) {
    options.classList.add('drawer-content');
    options.append(setup.content);
  }
  inner.append(options);
  body.append(inner);
  el.append(head, body);

  // Each option is one row: picture, name, then its effects on the right.
  (setup.options ?? []).forEach((opt, i) => {
    const b = document.createElement('button');
    b.className = 'drawer-option';
    b.style.setProperty('--i', String(i)); // used to stagger the pop-in

    const icon = document.createElement('span');
    icon.className = 'drawer-option-icon';
    icon.innerHTML = opt.icon;

    const label = document.createElement('span');
    label.className = 'drawer-option-label';
    label.textContent = opt.label;
    const note = document.createElement('small');
    note.className = 'drawer-option-note';
    label.append(note);

    const effects = document.createElement('span');
    effects.className = 'drawer-option-effects';
    if (opt.onPick) {
      for (const e of opt.effects) {
        const chip = document.createElement('span');
        chip.className = `chip-effect chip-${e.kind ?? 'up'}`;
        chip.title = e.title;
        chip.setAttribute('aria-label', e.title);
        chip.innerHTML = e.icon;
        chip.append(e.text);
        effects.append(chip);
      }
    } else {
      effects.textContent = setup.comingSoon;
      effects.classList.add('soon');
    }

    b.append(icon, label, effects);
    if (opt.onPick) {
      b.addEventListener('click', () => {
        close();
        opt.onPick!();
      });
    } else {
      b.disabled = true;
    }
    options.append(b);
  });

  function open(): void {
    const blocked = setup.beforeOpen();
    if (blocked) return setup.onBlocked(blocked);
    setup.onOpen?.();
    setup.row.dataset.open = setup.id;
    el.classList.add('is-open');
    head.setAttribute('aria-expanded', 'true');
    // On short screens, gently scroll so the whole panel is visible once
    // it has finished growing.
    window.setTimeout(() => el.scrollIntoView({ behavior: 'smooth', block: 'nearest' }), 650);
  }

  function close(): void {
    if (setup.row.dataset.open === setup.id) delete setup.row.dataset.open;
    el.classList.remove('is-open');
    head.setAttribute('aria-expanded', 'false');
  }

  const isOpen = () => el.classList.contains('is-open');
  head.addEventListener('click', () => (isOpen() ? close() : open()));

  return {
    el,
    isOpen,
    open,
    close,
    setDim: (dim) => el.classList.toggle('dim', dim),
    setNote(index, text, faded = false) {
      const row = options.children[index] as HTMLElement | undefined;
      if (!row) return;
      row.querySelector('.drawer-option-note')!.textContent = text;
      row.classList.toggle('faded', faded);
    },
    setHidden(index, hidden) {
      const row = options.children[index] as HTMLElement | undefined;
      if (row) row.hidden = hidden;
    },
  };
}
