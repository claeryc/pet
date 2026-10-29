// The station switch, shared by the kitchen (pot, board, and later the
// oven and the mill) and the workbench (bench, projects). Under the
// counter, down where the thumb is: [‹] the open station's icon and name,
// with a dot per station [›]. You can also swipe the counter (or the room)
// sideways: the station follows your finger, and letting go far enough
// slides the next one in. More stations just add dots.

import { STRINGS } from '../strings';

export interface StationItem<T extends string> {
  id: T;
  icon: string;
  label: string;
}

export interface StationSwitchOptions<T extends string> {
  items: readonly StationItem<T>[];
  // Opens a station. It may refuse (e.g. mid-cook): the open station is
  // read back with `current` to tell.
  pick: (id: T) => void;
  current: () => T;
  // The open station's scene and controls: what follows the finger.
  moving: () => HTMLElement[];
  // What you can swipe on (the room and the counter).
  swipeOn: HTMLElement[];
  // Gets `is-swiping` while a station is moving, so it can clip.
  frame: HTMLElement;
}

export interface StationSwitch<T extends string> {
  el: HTMLElement;
  // Shows `on` as the open station, leaving out the ones `shown` says no to.
  render: (on: T, shown?: (id: T) => boolean) => void;
}

// How far (px) a finger moves sideways before it counts as a swipe, and
// how far a swipe must go (or how fast, px/ms) to change station.
const START = 12;
const FAR = 70;
const FAST = 0.5;
const SLIDE_MS = 260;

export function createStationSwitch<T extends string>(o: StationSwitchOptions<T>): StationSwitch<T> {
  let on: T = o.items[0].id;
  let shown: (id: T) => boolean = () => true;

  const bar = document.createElement('div');
  bar.className = 'station-switch';
  const prev = arrow('‹', -1);
  const next = arrow('›', 1);
  const mid = document.createElement('div');
  mid.className = 'station-now';
  mid.setAttribute('aria-live', 'polite');
  const name = document.createElement('span');
  name.className = 'station-name';
  const dots = document.createElement('span');
  dots.className = 'station-dots';
  dots.setAttribute('aria-hidden', 'true');
  mid.append(name, dots);
  bar.append(prev, mid, next);

  function arrow(text: string, dir: 1 | -1): HTMLButtonElement {
    const b = document.createElement('button');
    b.className = 'station-step';
    b.textContent = text;
    b.addEventListener('click', () => step(dir));
    return b;
  }

  const open = () => o.items.filter((it) => shown(it.id));
  // The station `dir` steps away from the open one, if there is one.
  function neighbour(dir: 1 | -1): StationItem<T> | undefined {
    const list = open();
    return list[list.findIndex((it) => it.id === on) + dir];
  }

  // Opens the next or previous station, sliding it in from that side.
  // False if there's none that way or the station refused.
  function step(dir: 1 | -1): boolean {
    const to = neighbour(dir);
    if (!to) return false;
    o.pick(to.id);
    if (o.current() !== to.id) return false;
    slideIn(dir);
    return true;
  }

  function slideIn(dir: 1 | -1): void {
    o.frame.classList.add('is-swiping');
    for (const m of o.moving()) {
      m.style.transition = 'none';
      m.style.transform = `translateX(${dir * 40}%)`;
      m.style.opacity = '0';
    }
    requestAnimationFrame(() => requestAnimationFrame(() => settle()));
  }

  // Lets the moving parts ease back into place.
  let settleTimer = 0;
  function settle(): void {
    for (const m of o.moving()) {
      m.style.transition = `transform ${SLIDE_MS}ms cubic-bezier(0.2, 0.8, 0.3, 1), opacity ${SLIDE_MS}ms ease`;
      m.style.transform = '';
      m.style.opacity = '';
    }
    clearTimeout(settleTimer);
    settleTimer = window.setTimeout(() => {
      for (const m of o.moving()) m.style.transition = '';
      o.frame.classList.remove('is-swiping');
    }, SLIDE_MS);
  }

  // ---- Swiping ----
  let startX = 0;
  let startY = 0;
  let startAt = 0;
  let pointer: number | null = null;
  let dragging = false;
  let swallowUntil = 0;
  for (const area of o.swipeOn) {
    area.addEventListener('click', (c) => {
      if (performance.now() < swallowUntil) c.stopPropagation();
    }, { capture: true });
    area.addEventListener('pointerdown', (e) => {
      if (pointer !== null || (e.pointerType === 'mouse' && e.button !== 0)) return;
      pointer = e.pointerId;
      startX = e.clientX;
      startY = e.clientY;
      startAt = e.timeStamp;
      dragging = false;
    });
    area.addEventListener('pointermove', (e) => {
      if (e.pointerId !== pointer) return;
      const dx = e.clientX - startX;
      if (!dragging) {
        if (Math.abs(dx) < START || Math.abs(dx) < Math.abs(e.clientY - startY)) return;
        dragging = true;
        area.setPointerCapture(e.pointerId);
        o.frame.classList.add('is-swiping');
      }
      // Heavier past the last station, so it shows there's nothing more.
      const free = neighbour(dx < 0 ? 1 : -1) ? dx : dx / 4;
      const width = area.getBoundingClientRect().width || 1;
      for (const m of o.moving()) {
        m.style.transition = 'none';
        m.style.transform = `translateX(${free}px)`;
        m.style.opacity = String(1 - Math.min(0.6, Math.abs(free) / width));
      }
    });
    const end = (e: PointerEvent) => {
      if (e.pointerId !== pointer) return;
      pointer = null;
      if (!dragging) return;
      dragging = false;
      // A swipe isn't a tap: drop the click it may end in.
      swallowUntil = performance.now() + 300;
      const dx = e.clientX - startX;
      const fast = Math.abs(dx) / Math.max(1, e.timeStamp - startAt) > FAST;
      if (e.type === 'pointerup' && (Math.abs(dx) > FAR || fast) && step(dx < 0 ? 1 : -1)) return;
      settle();
    };
    area.addEventListener('pointerup', end);
    area.addEventListener('pointercancel', end);
  }

  function render(now: T, show: (id: T) => boolean = () => true): void {
    on = now;
    shown = show;
    const list = open();
    const at = list.findIndex((it) => it.id === now);
    const item = list[at];
    name.innerHTML = item ? `${item.icon}<b>${item.label}</b>` : '';
    dots.replaceChildren(...list.map((_, i) => {
      const d = document.createElement('i');
      if (i === at) d.className = 'on';
      return d;
    }));
    for (const [b, dir] of [[prev, -1], [next, 1]] as const) {
      const to = neighbour(dir);
      b.disabled = !to;
      b.setAttribute('aria-label', to ? STRINGS.stations.goTo(to.label) : '');
    }
    // Nothing to switch between: no bar.
    bar.hidden = list.length < 2;
  }

  return { el: bar, render };
}
