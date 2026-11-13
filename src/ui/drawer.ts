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
  onPick?: (row: HTMLElement) => void; // gets the row tapped; leave out to show a disabled "coming soon" row
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
  // Shows the options in this order (indexes into `options`). Indexes for
  // setNote and friends stay the same.
  setOrder: (order: number[]) => void;
  // Grid only: shows only the options `test` lets through (a filter chip),
  // and updates the picked tile's bar after its note or chips change.
  setShown: (test: (index: number) => boolean) => void;
  refreshPick: () => void;
  // A small "new" dot on the button, or on one option.
  setNew: (isNew: boolean) => void;
  setOptionNew: (index: number, isNew: boolean) => void;
  // A small picture in the button's top corner (e.g. the drop when a pot
  // needs you), in place of the "new" dot, or null to take it off.
  // `label` is what screen readers say for it.
  setBadge: (badge: string | null, label?: string) => void;
  // A small picture on the corner of an option's icon (e.g. the heart on
  // what the pet is craving), or null to take it off.
  setOptionBadge: (index: number, badge: string | null) => void;
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
  // Shown above the options, under the grabber (e.g. "Feed" and Cook).
  header?: HTMLElement;
  // A grid of tiles to pick from, instead of a list to tap: a tap picks a
  // tile and shows it in a bar under the grid, whose button (labelled
  // `pickLabel`) does it. The panel stays open, so the pet can be watched.
  grid?: { pickLabel: string };
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
  if (setup.header) inner.append(setup.header);
  inner.append(options);
  body.append(inner);
  if (setup.grid) el.classList.add('is-grid');
  el.append(head, body);

  // Each option is one row: picture, name, then its effects on the right.
  const rows: HTMLButtonElement[] = [];
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
    if (opt.onPick && setup.grid) {
      b.addEventListener('click', () => select(i));
    } else if (opt.onPick) {
      b.addEventListener('click', () => {
        close();
        opt.onPick!(b);
      });
    } else {
      b.disabled = true;
    }
    rows.push(b);
    options.append(b);
  });

  // Grid only: the picked tile, shown in the bar under the grid.
  let picked = -1;
  const bar = document.createElement('div');
  bar.className = 'drawer-pick';
  const barIcon = document.createElement('span');
  barIcon.className = 'drawer-pick-icon';
  const barText = document.createElement('span');
  barText.className = 'drawer-pick-text';
  const barGo = document.createElement('button');
  barGo.className = 'drawer-pick-go';
  barGo.textContent = setup.grid?.pickLabel ?? '';
  barGo.addEventListener('click', () => {
    const row = rows[picked];
    if (row && !row.hidden) setup.options![picked].onPick?.(row);
  });
  bar.append(barIcon, barText, barGo);
  if (setup.grid) inner.append(bar);
  function select(i: number): void {
    rows[picked]?.classList.remove('is-picked');
    picked = i;
    const row = rows[i];
    bar.hidden = !row;
    if (!row) return;
    row.classList.add('is-picked');
    barIcon.innerHTML = row.querySelector('.drawer-option-icon')!.innerHTML;
    barIcon.querySelector('.drawer-option-badge')?.remove();
    const name = document.createElement('b');
    name.textContent = setup.options![i].label;
    const note = row.querySelector('.drawer-option-note')?.textContent;
    if (note) {
      const small = document.createElement('small');
      small.textContent = note;
      name.append(' ', small);
    }
    const chips = row.querySelector('.drawer-option-effects')!.cloneNode(true) as HTMLElement;
    barText.replaceChildren(name, chips);
    barGo.setAttribute('aria-label', `${setup.grid?.pickLabel ?? ''}: ${setup.options![i].label}`);
  }
  // Keeps a picked tile that's still there, or else picks the first one
  // showing (the order puts what the pet is craving first).
  function repick(): void {
    if (!setup.grid) return;
    const still = rows[picked] && !rows[picked].hidden && rows[picked].style.display !== 'none';
    if (still) return select(picked);
    const first = [...options.children].find((r) => !(r as HTMLElement).hidden && (r as HTMLElement).style.display !== 'none');
    select(first ? rows.indexOf(first as HTMLButtonElement) : -1);
  }

  function open(): void {
    const blocked = setup.beforeOpen();
    if (blocked) return setup.onBlocked(blocked);
    setup.onOpen?.();
    setup.row.dataset.open = setup.id;
    // The rows slide in one after another, counting only the ones showing,
    // so a food far down the list doesn't keep you waiting.
    [...options.children]
      .filter((row) => !(row as HTMLElement).hidden)
      .forEach((row, i) => (row as HTMLElement).style.setProperty('--i', String(i)));
    el.classList.add('is-open');
    head.setAttribute('aria-expanded', 'true');
    // Each time it opens, the first tile is picked: what the pet is
    // craving, or else what it ate last.
    rows[picked]?.classList.remove('is-picked');
    picked = -1;
    repick();
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
  head.addEventListener('click', () => {
    if (isOpen()) close();
    else open();
  });

  return {
    el,
    isOpen,
    open,
    close,
    setDim: (dim) => el.classList.toggle('dim', dim),
    setNote(index, text, faded = false) {
      const row = rows[index];
      if (!row) return;
      row.querySelector('.drawer-option-note')!.textContent = text;
      row.classList.toggle('faded', faded);
    },
    setHidden(index, hidden) {
      const row = rows[index];
      if (!row || row.hidden === hidden) return;
      row.hidden = hidden;
      if (isOpen()) repick();
    },
    setShown(test) {
      rows.forEach((row, i) => (row.style.display = test(i) ? '' : 'none'));
      if (isOpen()) repick();
    },
    refreshPick: () => repick(),
    setOrder(order) {
      order.forEach((index) => {
        const row = rows[index];
        if (!row) return;
        options.append(row); // moves it to the end, so they end up in order
      });
    },
    setNew: (isNew) => head.classList.toggle('has-new', isNew),
    setOptionNew(index, isNew) {
      rows[index]?.classList.toggle('has-new', isNew);
    },
    setBadge(badge, label = '') {
      head.querySelector('.drawer-head-badge')?.remove();
      head.classList.toggle('has-badge', !!badge);
      el.classList.toggle('has-badge', !!badge);
      if (!badge) return;
      const b = document.createElement('span');
      b.className = 'drawer-head-badge';
      b.innerHTML = badge;
      b.setAttribute('role', 'img');
      b.setAttribute('aria-label', label);
      head.append(b);
    },
    setOptionBadge(index, badge) {
      const icon = rows[index]?.querySelector('.drawer-option-icon');
      if (!icon) return;
      icon.querySelector('.drawer-option-badge')?.remove();
      if (!badge) return;
      const b = document.createElement('span');
      b.className = 'drawer-option-badge';
      b.innerHTML = badge;
      icon.append(b);
    },
  };
}
