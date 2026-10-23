// Bath time. Tapping a smelly pet slides this panel up over the stat bars:
//
//   Bath time for Mochi
//   [sponge] Sponge  ▮▮▮▮▮▯▯▯▯▯
//   [dryer]  Dryer   ▯▯▯▯▯▯▯▯▯▯
//   Hold and rub Mochi with the sponge
//
// and the button row becomes [Close]. Pick the sponge, then hold and rub
// the pet: suds build up until it's soapy, then it's rinsed and dripping
// wet. Pick the dryer and hold it over the pet until it's dry, and it's
// clean (see bathe() in src/game/hygiene.ts). Closing before it's dry
// leaves it wet for a few seconds, then it smells again.
//
// The room draws the suds, drips, sponge and dryer (src/render/hygiene.ts)
// from scene(); home.ts passes on where your finger is, in room pixels.

import { STRINGS } from '../strings';
import { CONFIG } from '../game/config';
import { ITEM_ICONS } from './icons';
import { SPARKLE_MS, type BathScene } from '../render/hygiene';

export interface BathCallbacks {
  onClean: () => boolean; // it's dry: wash the smell off (false if refused)
  onExit: () => void;
  toast: (message: string) => void;
}

type Box = { x0: number; x1: number; y0: number; y1: number };
type Tool = 'sponge' | 'dryer';

export interface Bath {
  row: HTMLElement; // [Close], in place of the normal button row
  panel: HTMLElement; // in place of the stat bars
  start: (name: string) => void;
  stop: () => void; // closed from outside (the pet fell asleep, say)
  active: () => boolean;
  // Your finger (or mouse) over the room, in room pixels. `box` is the
  // pet's body there.
  down: (x: number, y: number, box: Box) => void;
  move: (x: number, y: number, box: Box) => void;
  up: () => void;
  // What the room should draw, or null. Also moves the drying along, so
  // it's called every animation frame.
  scene: (timeMs: number) => BathScene | null;
  // True while the smell lines shouldn't show (it's soapy, wet or just
  // washed).
  hidesSmell: () => boolean;
}

// How long the panel takes to slide in and out (matches .bath in style.css).
export const BATH_OUT_MS = 450;
const SEGMENTS = 10;
const MAX_FOAM = 18;
const FOAM_EVERY = 5; // room pixels of rubbing per new bubble
// Moving the dryer about dries this much faster than holding it still.
const DRY_MOVING = 1.6;

function el<K extends keyof HTMLElementTagNameMap>(tag: K, className: string, text?: string): HTMLElementTagNameMap[K] {
  const e = document.createElement(tag);
  e.className = className;
  if (text !== undefined) e.textContent = text;
  return e;
}

export function createBath(cb: BathCallbacks): Bath {
  const H = CONFIG.hygiene;
  let active = false;
  let outTimer = 0;
  let closeTimer = 0;
  let name = '';

  // 'wash': rubbing with the sponge; 'wet': rinsed, waiting for the dryer;
  // 'done': dry and sparkling, about to close.
  let phase: 'wash' | 'wet' | 'done' = 'wash';
  let tool: Tool | null = null;
  let rubbed = 0; // room pixels rubbed so far
  let dried = 0; // ms of drying so far
  let foam: { x: number; y: number }[] = [];
  let travel = 0; // rubbing since the last bubble
  let pointer: { x: number; y: number; down: boolean; onPet: boolean } | null = null;
  let movedAt = 0; // when the dryer last moved, for drying faster
  let lastFrame = 0;
  let sparkleFrom = 0;
  // After closing early: wet (and smell-free) until this time.
  let lingerUntil = 0;
  let lingerWet = 0;

  const panel = el('div', 'bath');
  panel.hidden = true;
  const title = el('b', 'bath-title');
  const hint = el('p', 'bath-hint');
  hint.setAttribute('aria-live', 'polite');

  // One row per tool: its icon, name and a bar of blocks like the stats.
  function toolRow(id: Tool, label: string) {
    const b = el('button', 'bath-tool');
    b.dataset.tool = id;
    const icon = el('span', 'bath-tool-icon');
    icon.innerHTML = ITEM_ICONS[id];
    const track = el('span', 'stat-segments');
    const segs = Array.from({ length: SEGMENTS }, () => el('span', 'stat-seg'));
    track.append(...segs);
    b.append(icon, el('span', 'bath-tool-name', label), track);
    b.addEventListener('click', () => pick(id));
    return {
      el: b,
      set(fill: number) {
        const lit = Math.floor(fill * SEGMENTS + 1e-6);
        segs.forEach((s, i) => s.classList.toggle('on', i < lit));
        b.setAttribute('aria-label', `${label}: ${Math.round(fill * 100)}%`);
      },
    };
  }
  const sponge = toolRow('sponge', STRINGS.bath.sponge);
  const dryer = toolRow('dryer', STRINGS.bath.dryer);
  panel.append(title, sponge.el, dryer.el, hint);

  const row = el('div', 'actions bath-row');
  row.hidden = true;
  const close = el('button', 'btn btn-soft', STRINGS.bath.close);
  close.addEventListener('click', () => {
    const started = rubbed > 0 && phase !== 'done';
    stop();
    if (started) {
      // Still wet: it drips for a little while, then the smell comes back.
      lingerUntil = performance.now() + H.smellsAgainMs;
      lingerWet = phase === 'wet' ? 1 - dried / H.dryMs : rubbed / H.rubNeeded;
      cb.toast(STRINGS.bath.stillWet(name));
    }
    cb.onExit();
  });
  row.append(close);

  function pick(id: Tool): void {
    if (phase === 'done') return;
    if (id === 'dryer' && phase !== 'wet') return cb.toast(STRINGS.bath.dryFirst);
    if (id === 'sponge' && phase === 'wet') return; // already washed
    tool = id;
    render();
  }

  function render(): void {
    sponge.set(phase === 'wash' ? Math.min(1, rubbed / H.rubNeeded) : 1);
    dryer.set(phase === 'done' ? 1 : Math.min(1, dried / H.dryMs));
    sponge.el.classList.toggle('is-picked', tool === 'sponge');
    dryer.el.classList.toggle('is-picked', tool === 'dryer');
    sponge.el.classList.toggle('is-done', phase !== 'wash');
    dryer.el.classList.toggle('is-ready', phase === 'wet' && tool !== 'dryer');
    dryer.el.setAttribute('aria-disabled', String(phase === 'wash'));
    hint.textContent =
      phase === 'done' ? STRINGS.bath.done(name)
      : phase === 'wet' ? (tool === 'dryer' ? STRINGS.bath.dryingHint(name) : STRINGS.bath.dryHint)
      : tool === 'sponge' ? STRINGS.bath.rubHint(name) : STRINGS.bath.pickSponge;
  }

  const inside = (x: number, y: number, box: Box) => x >= box.x0 && x <= box.x1 && y >= box.y0 && y <= box.y1;

  function rub(x: number, y: number, box: Box): void {
    if (!pointer) return;
    const d = Math.hypot(x - pointer.x, y - pointer.y);
    if (!pointer.down || !inside(x, y, box) || tool !== 'sponge' || phase !== 'wash') return;
    rubbed += d;
    travel += d;
    while (travel >= FOAM_EVERY) {
      travel -= FOAM_EVERY;
      const spot = { x: Math.round(x + (Math.random() - 0.5) * 6), y: Math.round(y + (Math.random() - 0.5) * 6) };
      spot.x = Math.max(box.x0 + 3, Math.min(box.x1 - 4, spot.x));
      spot.y = Math.max(box.y0 + 4, Math.min(box.y1 - 4, spot.y));
      if (foam.length < MAX_FOAM) foam.push(spot);
      else foam[Math.floor(Math.random() * MAX_FOAM)] = spot;
    }
    if (rubbed >= H.rubNeeded) {
      // Rinsed off: dripping wet. On to the dryer.
      phase = 'wet';
      tool = null;
      foam = [];
      navigator.vibrate?.(15);
    }
    render();
  }

  function stop(): void {
    if (!active) return;
    active = false;
    row.hidden = true;
    pointer = null;
    clearTimeout(closeTimer);
    panel.classList.remove('is-in');
    clearTimeout(outTimer);
    outTimer = window.setTimeout(() => (panel.hidden = true), BATH_OUT_MS);
  }

  return {
    row,
    panel,
    start(petName) {
      name = petName;
      active = true;
      phase = 'wash';
      tool = 'sponge'; // ready to go: most people reach for the sponge first
      rubbed = dried = travel = 0;
      foam = [];
      sparkleFrom = 0;
      lingerUntil = 0;
      pointer = null;
      title.textContent = STRINGS.bath.title(name);
      row.hidden = false;
      clearTimeout(outTimer);
      panel.hidden = false;
      render();
      void panel.offsetHeight;
      panel.classList.add('is-in');
    },
    stop,
    active: () => active,
    down(x, y, box) {
      if (!active) return;
      pointer = { x, y, down: true, onPet: inside(x, y, box) };
      movedAt = performance.now();
    },
    move(x, y, box) {
      if (!active) return;
      if (!pointer) pointer = { x, y, down: false, onPet: false };
      rub(x, y, box);
      if (Math.hypot(x - pointer.x, y - pointer.y) > 0.5) movedAt = performance.now();
      pointer = { ...pointer, x, y, onPet: inside(x, y, box) };
    },
    up() {
      if (pointer) pointer = { ...pointer, down: false };
    },
    scene(timeMs) {
      const dt = lastFrame ? Math.min(100, Math.max(0, timeMs - lastFrame)) : 0;
      lastFrame = timeMs;
      if (!active) {
        // Closed early: drips for a few more seconds.
        const left = (lingerUntil - performance.now()) / H.smellsAgainMs;
        if (left <= 0) return null;
        return { foam: [], wet: Math.max(0.25, lingerWet) * Math.min(1, left * 2), tool: null, pointer: null, sparkleFrom: 0 };
      }
      // The dryer dries while held over the pet.
      if (phase === 'wet' && tool === 'dryer' && pointer?.down && pointer.onPet) {
        const moving = performance.now() - movedAt < 150;
        dried += dt * (moving ? DRY_MOVING : 1);
        if (dried >= H.dryMs) {
          if (cb.onClean()) {
            phase = 'done';
            sparkleFrom = timeMs;
            tool = null;
            closeTimer = window.setTimeout(() => {
              if (!active || phase !== 'done') return;
              stop();
              cb.onExit();
            }, SPARKLE_MS);
          } else {
            stop();
            cb.onExit();
          }
        }
        render();
      }
      return {
        foam,
        wet: phase === 'wet' ? 1 - dried / H.dryMs : 0,
        tool,
        pointer: pointer && { x: pointer.x, y: pointer.y, down: pointer.down },
        sparkleFrom,
      };
    },
    hidesSmell() {
      if (active) return phase !== 'wash' || rubbed >= H.rubNeeded / 2;
      return performance.now() < lingerUntil;
    },
  };
}
