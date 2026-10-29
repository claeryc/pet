// Walking along the kitchen counter. The stations stand side by side on
// the back counter: the one you're at in the middle, its neighbours
// peeking in at the edges (a little faded, with their names on small
// signs). A wooden sign hangs at the top with the station's name and a pip
// per station. Getting to the next one:
//  - swipe the counter or the room: it all follows your finger, and
//    letting go far enough (or quickly enough) walks you there;
//  - tap a tab on the scene's edge, or the peeking station itself.
// More stations (the oven, the mill) just stand further along.

import { STRINGS } from '../strings';

export interface WalkStation<T extends string> {
  id: T;
  icon: string;
  label: string;
  scene: HTMLElement; // what stands on the back counter
}

export interface WalkOptions<T extends string> {
  stations: readonly WalkStation<T>[];
  // Goes to a station. It may refuse (e.g. mid-cook): the station you're
  // at is read back with `current` to tell.
  pick: (id: T) => void;
  current: () => T;
  frame: HTMLElement; // gets --at, --drag and the walking classes
  room: HTMLElement; // where the stations, signs and edge tabs go
  swipeOn: HTMLElement[];
}

export interface Walk<T extends string> {
  // Shows you at `on`, leaving out the stations `shown` says no to.
  render: (on: T, shown?: (id: T) => boolean) => void;
}

// How far (px) a finger moves sideways before it counts as a swipe, and
// how far a swipe must go (or how fast, px/ms) to walk.
const START = 12;
const FAR = 70;
const FAST = 0.5;
const ARRIVE_MS = 360;

export function createWalk<T extends string>(o: WalkOptions<T>): Walk<T> {
  let on: T = o.stations[0].id;
  let shown: (id: T) => boolean = () => true;

  const track = document.createElement('div');
  track.className = 'walk-track';
  const spots = o.stations.map((st) => {
    const spot = document.createElement('div');
    spot.className = 'walk-spot';
    spot.dataset.station = st.id;
    spot.append(st.scene);
    // Tapping a peeking station walks there instead of using it.
    spot.addEventListener('click', (e) => {
      if (!spot.classList.contains('away')) return;
      e.stopPropagation();
      e.preventDefault();
      const list = open();
      const here = list.findIndex((it) => it.id === on);
      const there = list.findIndex((it) => it.id === st.id);
      if (there >= 0) step(there > here ? 1 : -1);
    }, { capture: true });
    track.append(spot);
    return { st, spot };
  });

  const sign = document.createElement('div');
  sign.className = 'walk-sign';
  sign.setAttribute('aria-live', 'polite');
  const signName = document.createElement('b');
  const pips = document.createElement('span');
  pips.className = 'walk-pips';
  pips.setAttribute('aria-hidden', 'true');
  sign.append(signName, pips);

  const peeks = ([-1, 1] as const).map((dir) => {
    const peek = document.createElement('span');
    peek.className = `walk-peek ${dir < 0 ? 'l' : 'r'}`;
    peek.setAttribute('aria-hidden', 'true');
    const edge = document.createElement('button');
    edge.className = `walk-edge ${dir < 0 ? 'l' : 'r'}`;
    edge.addEventListener('click', () => step(dir));
    return { dir, peek, edge };
  });
  o.room.append(track, sign, ...peeks.flatMap((p) => [p.peek, p.edge]));

  const open = () => o.stations.filter((st) => shown(st.id));
  // The station `dir` steps away from the one you're at, if there is one.
  function neighbour(dir: 1 | -1): WalkStation<T> | undefined {
    const list = open();
    return list[list.findIndex((st) => st.id === on) + dir];
  }

  // Walks to the next or previous station. False if there's none that way
  // or the station refused.
  let arriveTimer = 0;
  function step(dir: 1 | -1): boolean {
    const to = neighbour(dir);
    if (!to) return false;
    o.pick(to.id);
    if (o.current() !== to.id) return false;
    // The new station's controls slide in from the side you walked to.
    o.frame.classList.remove('arrive-l', 'arrive-r');
    void o.frame.offsetWidth;
    o.frame.classList.add(dir > 0 ? 'arrive-r' : 'arrive-l');
    clearTimeout(arriveTimer);
    arriveTimer = window.setTimeout(() => o.frame.classList.remove('arrive-l', 'arrive-r'), ARRIVE_MS);
    return true;
  }

  // ---- Swiping ----
  let startX = 0;
  let startY = 0;
  let startAt = 0;
  let pointer: number | null = null;
  let dragging = false;
  let swallowUntil = 0;
  const setDrag = (px: number) => o.frame.style.setProperty('--drag', `${px}px`);
  for (const area of o.swipeOn) {
    // A swipe isn't a tap: drop the click it may end in.
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
        o.frame.classList.add('is-dragging');
      }
      // Heavier past the last station, so it shows there's nothing more.
      setDrag(neighbour(dx < 0 ? 1 : -1) ? dx : dx / 4);
    });
    const end = (e: PointerEvent) => {
      if (e.pointerId !== pointer) return;
      pointer = null;
      if (!dragging) return;
      dragging = false;
      swallowUntil = performance.now() + 300;
      o.frame.classList.remove('is-dragging');
      setDrag(0);
      const dx = e.clientX - startX;
      const fast = Math.abs(dx) / Math.max(1, e.timeStamp - startAt) > FAST;
      if (e.type === 'pointerup' && (Math.abs(dx) > FAR || fast)) step(dx < 0 ? 1 : -1);
    };
    area.addEventListener('pointerup', end);
    area.addEventListener('pointercancel', end);
  }

  function render(now: T, show: (id: T) => boolean = () => true): void {
    on = now;
    shown = show;
    const list = open();
    const at = list.findIndex((st) => st.id === now);
    o.frame.style.setProperty('--at', String(at));
    let k = 0;
    for (const { st, spot } of spots) {
      spot.hidden = !show(st.id);
      if (spot.hidden) continue;
      spot.style.setProperty('--k', String(k++));
      spot.classList.toggle('away', st.id !== now);
      spot.setAttribute('aria-hidden', String(st.id !== now));
    }
    signName.textContent = list[at]?.label ?? '';
    pips.replaceChildren(...list.map((_, i) => {
      const pip = document.createElement('i');
      if (i === at) pip.className = 'on';
      return pip;
    }));
    sign.hidden = list.length < 2;
    for (const { dir, peek, edge } of peeks) {
      const to = neighbour(dir);
      peek.hidden = edge.hidden = !to;
      if (!to) continue;
      peek.textContent = to.label;
      edge.innerHTML = `<span aria-hidden="true">${dir < 0 ? '‹' : '›'}</span>${to.icon}`;
      edge.setAttribute('aria-label', STRINGS.stations.goTo(to.label));
    }
  }

  return { render };
}
