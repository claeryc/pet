// Bath time. Tapping a smelly pet slides this panel up over the stat bars,
// a little tiled bathroom:
//
//   Bath time for Mochi                    |  [bucket]
//   (suds bar, bubbles rising in it)       |  ========
//   (drying bar, blue turning warm yellow) |  [dryer]
//   Hold and rub Mochi with the sponge     |  ========
//
// and the button row becomes [Close]. The sponge is picked up from its
// bucket to start (the bucket stays on the shelf, empty): hold and rub the
// pet and suds build up until it's soapy, then it's rinsed and dripping
// wet, and the sponge goes back. Tap the dryer to take it off its shelf
// and hold it over the pet until it's dry, and it's clean (see bathe() in
// src/game/hygiene.ts). Closing before it's dry leaves it wet for a few
// seconds, then it smells again.
//
// The room draws the suds, drips, sponge and dryer (src/render/hygiene.ts)
// from scene(); home.ts passes on where your finger is, in room pixels.
// The bubbles and drops on the bars are src/render/bathfx.ts.

import { STRINGS } from '../strings';
import { CONFIG } from '../game/config';
import { ITEM_ICONS } from './icons';
import { SPARKLE_MS, type BathScene } from '../render/hygiene';
import { createBathFx, FX_HEADROOM, FX_PX, type FxBar } from '../render/bathfx';
import { sound } from '../audio/audio';

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
const MAX_FOAM = 18;
const FOAM_EVERY = 5; // room pixels of rubbing per new bubble
// Moving the dryer about dries this much faster than holding it still.
const DRY_MOVING = 1.6;
// The suds bar fizzes for this long after the sponge last moved.
const FIZZ_MS = 180;
// While scrubbing or drying, a squeak of suds or a puff of the dryer this
// often (each overlaps the last, so they run together).
const SCRUB_EVERY_MS = 150;
const DRYER_EVERY_MS = 200;
// The little bubbles rising inside the suds bar: [left %, bottom px, size px].
const SUDS_BUBBLES = [[6, 2, 6], [19, 6, 4], [32, 1, 5], [45, 7, 3], [58, 3, 6], [71, 5, 4], [84, 2, 5]];

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
  let rubbedAt = 0; // when the sponge last scrubbed, for the fizz
  let soundAt = 0; // when the last scrub or dryer sound played
  let lastFrame = 0;
  let sparkleFrom = 0;
  // After closing early: wet (and smell-free) until this time.
  let lingerUntil = 0;
  let lingerWet = 0;

  const panel = el('div', 'bath');
  panel.hidden = true;
  const main = el('div', 'bath-main');
  const title = el('b', 'bath-title');
  const hint = el('p', 'bath-hint');
  hint.setAttribute('aria-live', 'polite');

  // A glass bar that fills from the left: suds (bubbles rising in blue
  // water), or drying (blue turning warm yellow).
  function bar(kind: 'suds' | 'dry', label: string) {
    const b = el('div', `bath-bar bath-bar-${kind}`);
    b.setAttribute('role', 'meter');
    b.setAttribute('aria-label', label);
    b.setAttribute('aria-valuemin', '0');
    b.setAttribute('aria-valuemax', '100');
    const fill = el('span', 'bath-bar-fill');
    if (kind === 'suds') {
      for (const [left, bottom, size] of SUDS_BUBBLES) {
        const i = el('i', 'bath-bubble');
        i.style.cssText = `left:${left}%;bottom:${bottom}px;--s:${size}px;--d:${(left / 13) * 0.35}s`;
        fill.append(i);
      }
    }
    b.append(fill);
    return {
      el: b,
      level: 0,
      set(level: number) {
        this.level = level;
        const pct = Math.round(Math.max(0, Math.min(1, level)) * 100);
        fill.style.width = `${pct}%`;
        // The drying colours run along the whole bar, so the fill shows
        // more of the warm end the drier it gets.
        if (b.clientWidth) fill.style.setProperty('--bath-bar-w', `${b.clientWidth}px`);
        b.setAttribute('aria-valuenow', String(pct));
      },
    };
  }
  const sudsBar = bar('suds', STRINGS.bath.sponge);
  const dryBar = bar('dry', STRINGS.bath.dryer);
  const bars = el('div', 'bath-bars');
  const fx = createBathFx();
  bars.append(sudsBar.el, dryBar.el, fx.canvas);
  main.append(title, bars, hint);

  // The shelf: each tool has its spot, and is gone from it while in use.
  function spot(id: Tool, label: string) {
    const b = el('button', 'bath-spot');
    b.dataset.tool = id;
    b.setAttribute('aria-label', label);
    const art = el('span', 'bath-spot-art');
    const check = el('span', 'bath-check', '✓');
    check.setAttribute('aria-hidden', 'true');
    b.append(art, check);
    b.addEventListener('click', () => pick(id));
    return { el: b, art };
  }
  const sponge = spot('sponge', STRINGS.bath.sponge);
  const dryer = spot('dryer', STRINGS.bath.dryer);
  const shelf = el('div', 'bath-shelf');
  shelf.append(sponge.el, dryer.el);
  panel.append(main, shelf);

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
    sudsBar.set(phase === 'wash' ? Math.min(1, rubbed / H.rubNeeded) : 1);
    dryBar.set(phase === 'done' ? 1 : Math.min(1, dried / H.dryMs));
    // The sponge is out of its bucket while scrubbing, and the dryer off
    // its shelf while drying. Each is back, with a tick, once done.
    const spongeOut = phase === 'wash' && tool === 'sponge';
    const dryerOut = phase === 'wet' && tool === 'dryer';
    sponge.art.innerHTML = spongeOut ? ITEM_ICONS.bathBucketEmpty : ITEM_ICONS.bathBucket;
    dryer.art.innerHTML = dryerOut ? '' : ITEM_ICONS.bathDryer;
    sponge.el.classList.toggle('is-out', spongeOut);
    dryer.el.classList.toggle('is-out', dryerOut);
    sponge.el.classList.toggle('is-done', phase !== 'wash');
    dryer.el.classList.toggle('is-done', phase === 'done');
    dryer.el.classList.toggle('is-ready', phase === 'wet' && tool !== 'dryer');
    dryer.el.setAttribute('aria-disabled', String(phase === 'wash'));
    sponge.el.setAttribute('aria-pressed', String(spongeOut));
    dryer.el.setAttribute('aria-pressed', String(dryerOut));
    hint.textContent =
      phase === 'done' ? STRINGS.bath.done(name)
      : phase === 'wet' ? (tool === 'dryer' ? STRINGS.bath.dryingHint(name) : STRINGS.bath.dryHint)
      : tool === 'sponge' ? STRINGS.bath.rubHint(name) : STRINGS.bath.pickSponge;
  }

  // Where a bar sits on the fizz canvas, in canvas pixels. The canvas is
  // sized to the bars here too, in case the screen changed size.
  function fxBar(b: { el: HTMLElement; level: number }, active: boolean): FxBar {
    const box = bars.getBoundingClientRect();
    const r = b.el.getBoundingClientRect();
    const w = Math.round(box.width / FX_PX);
    const h = Math.round(box.height / FX_PX) + FX_HEADROOM;
    if (fx.canvas.width !== w || fx.canvas.height !== h) {
      fx.canvas.width = w;
      fx.canvas.height = h;
    }
    return {
      x: (r.left - box.left) / FX_PX + 1,
      y: (r.top - box.top) / FX_PX + FX_HEADROOM,
      w: r.width / FX_PX - 2,
      h: r.height / FX_PX,
      level: Math.min(1, b.level),
      active,
    };
  }

  const inside = (x: number, y: number, box: Box) => x >= box.x0 && x <= box.x1 && y >= box.y0 && y <= box.y1;

  function rub(x: number, y: number, box: Box): void {
    if (!pointer) return;
    const d = Math.hypot(x - pointer.x, y - pointer.y);
    if (!pointer.down || !inside(x, y, box) || tool !== 'sponge' || phase !== 'wash') return;
    rubbed += d;
    if (d > 0) rubbedAt = performance.now();
    if (d > 0 && rubbedAt - soundAt >= SCRUB_EVERY_MS) {
      soundAt = rubbedAt;
      sound('scrub');
    }
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
      fx.burst('suds');
      sound('rinse');
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
      fx.clear();
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
      const drying = phase === 'wet' && tool === 'dryer' && !!pointer?.down && !!pointer.onPet;
      if (drying) {
        const moving = performance.now() - movedAt < 150;
        dried += dt * (moving ? DRY_MOVING : 1);
        if (performance.now() - soundAt >= DRYER_EVERY_MS) {
          soundAt = performance.now();
          sound('dryer');
        }
        if (dried >= H.dryMs) {
          fx.burst('dry');
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
      fx.draw(timeMs, fxBar(sudsBar, phase === 'wash' && performance.now() - rubbedAt < FIZZ_MS), fxBar(dryBar, drying));
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
