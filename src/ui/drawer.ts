// A Feed or Play button that opens into a panel of choices.
//
// How it looks: tap the button and it slides wider to fill the whole row
// (the other buttons shrink away), then it grows taller to reveal a soft
// white-pink area with the options inside, framed by the pink button. Tap
// the top part again to close it. The animation itself lives in style.css
// (look for "drawer"); this file just builds the pieces and flips a few
// data attributes that the CSS reacts to.

export interface DrawerOption {
  label: string;
  hint?: string; // small text under the label, e.g. "+20 Tummy"
  onPick?: () => void; // leave out to show a disabled "coming soon" option
}

export interface Drawer {
  el: HTMLElement;
  isOpen: () => boolean;
  open: () => void;
  close: () => void;
  setDim: (dim: boolean) => void;
}

export interface DrawerSetup {
  id: string; // used by the CSS, e.g. "feed"
  label: string;
  options: DrawerOption[];
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
  head.querySelector('.drawer-label')!.textContent = setup.label;

  // The body uses a CSS trick (grid rows going from 0fr to 1fr) so it can
  // animate to exactly the height of its contents.
  const body = document.createElement('div');
  body.className = 'drawer-body';
  const inner = document.createElement('div');
  inner.className = 'drawer-inner';
  const options = document.createElement('div');
  options.className = 'drawer-options';
  inner.append(options);
  body.append(inner);
  el.append(head, body);

  setup.options.forEach((opt, i) => {
    const b = document.createElement('button');
    b.className = 'drawer-option';
    b.style.setProperty('--i', String(i)); // used to stagger the pop-in
    const label = document.createElement('span');
    label.className = 'drawer-option-label';
    label.textContent = opt.label;
    const hint = document.createElement('span');
    hint.className = 'drawer-option-hint';
    hint.textContent = opt.onPick ? (opt.hint ?? '') : setup.comingSoon;
    b.append(label, hint);
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
  };
}
