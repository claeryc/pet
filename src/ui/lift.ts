// The frame the kitchen and the workbench share: it reaches from the room
// down to just over the buttons, and when a Food/Recipes (or Materials/
// Patterns) panel opens, the front counter rides up on top of it.
//
// Both panels are always the same height, so the counter sits in the same
// place whatever's inside them (the list scrolls), and it follows the
// panel's top edge frame by frame while it grows or folds, so the two
// never drift apart.

// Space kept between the frame and the buttons under it.
const ROW_GAP = 12;
// How much of the frame the stations keep while a panel is open, at least
// and at most (px), and the front counter and back counter strip (match
// --front and --band in style.css).
const STATIONS_MIN = 170;
const STATIONS_MAX = 280;
const FRONT = 112;
const BAND = 20;
// The panel's button, frame and padding take about this much.
const CHROME = 52 + 6 + 16;
// How long a panel takes to grow open or fold away (drawer.ts's CSS), with
// a little to spare.
const RIDE_MS = 900;

export interface Lift {
  // A panel opened (call from the drawer's onOpen).
  fit: (drawer: HTMLElement) => void;
  // Fits the open panel again, if there is one (e.g. after switching station).
  refit: () => void;
  // Stretches the frame from the top of the room down to the buttons.
  reach: (roomBox: DOMRect) => void;
}

export function createLift(frame: HTMLElement, row: HTMLElement): Lift {
  let lifting: HTMLElement | null = null;

  function fit(drawer: HTMLElement): void {
    const list = drawer.querySelector<HTMLElement>('.drawer-options')!;
    const box = frame.getBoundingClientRect();
    const rowBottom = row.getBoundingClientRect().bottom;
    const keep = Math.min(STATIONS_MAX, Math.max(STATIONS_MIN, box.height * 0.36));
    const room = Math.floor(rowBottom - (box.top + keep + BAND + FRONT) - CHROME);
    list.style.setProperty('--fit', `${Math.max(120, room)}px`);
    frame.classList.add('lifted');
    lifting = drawer;
    ride();
  }

  // ...and it all comes back down when the panel closes.
  new MutationObserver(() => {
    if (lifting && !lifting.classList.contains('is-open')) {
      lifting = null;
      frame.classList.remove('lifted');
      ride();
    }
  }).observe(row, { subtree: true, attributes: true, attributeFilter: ['class'] });

  let rideUntil = 0;
  let rideFrame = 0;
  function ride(): void {
    rideUntil = performance.now() + RIDE_MS;
    if (rideFrame) return;
    const step = () => {
      const tops = [...row.children].map((c) => c.getBoundingClientRect()).filter((r) => r.height > 0).map((r) => r.top);
      const panelTop = Math.min(Infinity, ...tops);
      const lift = Math.max(0, frame.getBoundingClientRect().bottom - panelTop);
      frame.style.setProperty('--lift', `${Math.round(lift)}px`);
      rideFrame = performance.now() < rideUntil ? requestAnimationFrame(step) : 0;
    };
    step();
  }

  function reach(roomBox: DOMRect): void {
    const slot = frame.parentElement;
    if (!slot) return;
    const { top } = slot.getBoundingClientRect();
    frame.style.setProperty('--kitchen-up', `${Math.max(0, top - roomBox.top)}px`);
    frame.style.setProperty('--kitchen-gap', `${Math.max(0, top - roomBox.bottom)}px`);
    // (offsetTop: the row may still be rising in.)
    const rowTop = row.offsetTop - slot.offsetTop - slot.offsetHeight;
    frame.style.setProperty('--kitchen-down', `${Math.max(0, rowTop - ROW_GAP)}px`);
  }

  return { fit, refit: () => lifting && fit(lifting), reach };
}
