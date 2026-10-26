// Decorating the room, and the keepsake shelf up close. Both take over the
// stat bars and the buttons, like a trip does (see src/ui/trip.ts).
//
// Decorating (Shop > Room > Decorate): the room shows a little frame round
// each of its five spots and the pets step out of the way. Tap a spot in
// the room, then a piece below to put there:
//
//   Wall                          Tap a spot in the room
//   [Nothing] [Garland] [Portrait] [Keepsake shelf]
//   [Shop] [Done]
//
// The shelf up close (tap the keepsake shelf in the room): the room turns
// into the shelf, big, and below it just the name of the one picked.
//
//   Bean's seashell  · Golden
//   [Back] [Change]

import { STRINGS } from '../strings';
import { SPOTS, piecesFor } from '../game/decor';
import { keepsakeKind, keepsakeOf, roomKeepsakes } from '../game/meadow';
import { roomDecor } from '../game/rooms';
import type { FurnitureSlot, GameState } from '../game/state';
import { ITEM_ICONS } from './icons';

function el<K extends keyof HTMLElementTagNameMap>(tag: K, className: string, text?: string): HTMLElementTagNameMap[K] {
  const e = document.createElement(tag);
  e.className = className;
  if (text !== undefined) e.textContent = text;
  return e;
}

function icon(svg: string, className: string): HTMLElement {
  const e = el('span', className);
  e.innerHTML = svg;
  e.setAttribute('aria-hidden', 'true');
  return e;
}

const pieceName = (id: string) => STRINGS.shop.furniture[id] ?? id;

// --- Decorating ---------------------------------------------------------

export interface DecorateView {
  panel: HTMLElement; // in place of the stat bars
  row: HTMLElement; // [Shop] [Done], in place of the buttons
  open: (spot?: FurnitureSlot) => void;
  close: () => void;
  active: () => boolean;
  pick: (spot: FurnitureSlot) => void; // a spot tapped in the room
  update: (state: GameState) => void;
  scene: () => { spot: FurnitureSlot | null } | null; // for the room
}

export interface DecorateSetup {
  onPlace: (spot: FurnitureSlot, id: string | null) => void;
  onShop: () => void; // the Shop's Room tab
  onClose: () => void; // back to the stat bars
}

export function createDecorateView({ onPlace, onShop, onClose }: DecorateSetup): DecorateView {
  const T = STRINGS.decorate;
  const panel = el('div', 'deco-panel');
  panel.hidden = true;
  const head = el('div', 'deco-head');
  const title = el('b', 'deco-title');
  head.append(title, el('span', 'deco-hint', T.hint));
  const tiles = el('div', 'deco-tiles');
  panel.append(head, tiles);

  const row = el('div', 'actions trip-row');
  row.hidden = true;
  const shopBtn = el('button', 'btn btn-soft', T.shop);
  const doneBtn = el('button', 'btn', T.done);
  row.append(shopBtn, doneBtn);

  let open = false;
  let spot: FurnitureSlot = 'wall';
  let latest: GameState | null = null;

  function render(): void {
    title.textContent = T.spots[spot];
    tiles.replaceChildren();
    if (!latest) return;
    const here = roomDecor(latest).furniture ?? {};
    const pieces = piecesFor(latest, spot);
    const tile = (id: string | null) => {
      const b = el('button', 'deco-tile');
      const on = (here[spot] ?? null) === id;
      b.classList.toggle('is-on', on);
      b.setAttribute('aria-pressed', String(on));
      b.append(id ? icon(ITEM_ICONS[`furniture_${id}`] ?? ITEM_ICONS.unknown, 'deco-tile-icon') : el('span', 'deco-tile-icon'), el('small', '', id ? pieceName(id) : T.empty));
      if (!id) b.classList.add('is-empty');
      // Up in another spot: it moves over.
      const elsewhere = id && SPOTS.find((s) => s !== spot && here[s] === id);
      if (elsewhere) b.classList.add('is-elsewhere');
      b.addEventListener('click', () => {
        if (!on) onPlace(spot, id);
      });
      return b;
    };
    if (!pieces.length) {
      tiles.append(el('p', 'deco-none', T.nothingFits));
      return;
    }
    tiles.append(tile(null), ...pieces.map(tile));
  }

  function close(): void {
    if (!open) return;
    open = false;
    panel.hidden = true;
    row.hidden = true;
    onClose();
  }

  shopBtn.addEventListener('click', () => {
    close();
    onShop();
  });
  doneBtn.addEventListener('click', close);

  return {
    panel,
    row,
    open: (at) => {
      open = true;
      // Start at the first spot with something for it.
      spot = at ?? (latest && SPOTS.find((s) => piecesFor(latest!, s).length > 0)) ?? 'wall';
      panel.hidden = false;
      row.hidden = false;
      render();
    },
    close,
    active: () => open,
    pick: (s) => {
      spot = s;
      render();
    },
    update: (state) => {
      latest = state;
      if (open) render();
    },
    scene: () => (open ? { spot } : null),
  };
}

// --- The shelf up close -------------------------------------------------

export interface ShelfView {
  panel: HTMLElement;
  row: HTMLElement; // [Back] [Change]
  open: () => void;
  close: () => void;
  active: () => boolean;
  pick: (i: number) => void; // a thing tapped on the shelf
  update: (state: GameState) => void;
  scene: () => { picked: number | null } | null;
}

export interface ShelfSetup {
  onChange: () => void; // the Meadow page, to swap what's on it
  onClose: () => void;
}

export function createShelfView({ onChange, onClose }: ShelfSetup): ShelfView {
  const T = STRINGS.decorate;
  const panel = el('div', 'shelf-panel');
  panel.hidden = true;
  const name = el('b', 'shelf-name');
  const tag = el('span', 'shelf-tag', T.golden);
  panel.append(name, tag);

  const row = el('div', 'actions trip-row');
  row.hidden = true;
  const backBtn = el('button', 'btn btn-soft', T.back);
  const changeBtn = el('button', 'btn', T.change);
  row.append(backBtn, changeBtn);

  let open = false;
  let picked = 0;
  let latest: GameState | null = null;

  function render(): void {
    const ids = latest ? roomKeepsakes(roomDecor(latest)).shelf : [];
    const k = latest && ids[picked] ? keepsakeOf(latest, ids[picked]!) : undefined;
    name.textContent = k ? T.thing(k.name, STRINGS.meadow.things[keepsakeKind(k)] ?? '') : T.emptySpot;
    tag.hidden = k?.tier !== 'golden';
  }

  function close(): void {
    if (!open) return;
    open = false;
    panel.hidden = true;
    row.hidden = true;
    onClose();
  }

  backBtn.addEventListener('click', close);
  changeBtn.addEventListener('click', () => {
    close();
    onChange();
  });

  return {
    panel,
    row,
    open: () => {
      open = true;
      // Start on the first thing that's there.
      const ids = latest ? roomKeepsakes(roomDecor(latest)).shelf : [];
      picked = Math.max(0, ids.findIndex(Boolean));
      panel.hidden = false;
      row.hidden = false;
      render();
    },
    close,
    active: () => open,
    pick: (i) => {
      picked = i;
      render();
    },
    update: (state) => {
      latest = state;
      if (open) render();
    },
    scene: () => (open ? { picked } : null),
  };
}
