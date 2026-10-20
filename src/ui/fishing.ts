// The fishing mini-game's buttons and pond. While you fish, the button row
// becomes [Cancel] [Cast], where Cast turns into Reel in once the line is
// out, and Reel in turns into Pull once a fish is hooked: hold it to drag
// the dot right on the catch bar, let go and it drifts back left. Water rises up
// over the stat bars into a pond of the same size (see src/render/pond.ts),
// and drains away again when you stop. The catch bar shows up at the
// bottom of the pond while you reel in.
//
// A bite buzzes the phone. A landed fish flips up out of the water before
// it's shown to you, and a perfect catch gets a big "Perfect!" with a count
// of perfects in a row.
//
// Only the timing lives here. What a catch is worth, and what casting costs,
// is decided in src/game/fishing.ts.

import { STRINGS } from '../strings';
import { ITEM_ICONS } from './icons';
import { CONFIG } from '../game/config';
import { createFroth, createPond } from '../render/pond';
import {
  biteDelayMs,
  reelGrade,
  reelOutcome,
  reelZones,
  startReel,
  stepReel,
  type CatchGrade,
  type CatchZones,
  type Reel,
} from '../game/fishing';
import type { ReelPerks } from '../game/skills';

// ready: line in, waiting for you to cast. waiting: line out, no bite yet.
// bite: a fish is nibbling, tap Reel in now! reeling: the catch bar is up.
export type FishingPhase = 'off' | 'ready' | 'waiting' | 'bite' | 'reeling';

export interface FishingCallbacks {
  onCast: () => boolean; // false if the game refused (the reason is shown elsewhere)
  onLand: (grade: CatchGrade) => string | null; // the fish landed (a food id), or null if it got away
  onExit: () => void;
  onToggleBait: () => void;
  toast: (message: string) => void;
}

export interface Fishing {
  row: HTMLElement; // the buttons, shown in place of the normal button row
  pond: HTMLElement; // the pond with its catch bar, shown in place of the stat bars
  start: () => void;
  stop: () => void;
  phase: () => FishingPhase;
  setBait: (count: number, on: boolean) => void; // the bait you have, and whether it's switched on
  setPerks: (perks: ReelPerks) => void; // the fishing skills, for the next reel
}

// How long the bar stays up after a catch, showing where the dot ended up.
const RESULT_MS = 900;
// How long the water takes to rise and to drain away (matches .pond in
// style.css). The fizzy edge shows for that long.
const RISE_MS = 700;
export const DRAIN_MS = 450;
// How long a landed fish takes to flip up out of the water.
export const LEAP_MS = 650;
// How long "Perfect!" stays up.
const PERFECT_MS = 1100;

const reduced = () => typeof matchMedia !== 'undefined' && matchMedia('(prefers-reduced-motion: reduce)').matches;

export function createFishing(cb: FishingCallbacks): Fishing {
  const row = document.createElement('div');
  row.className = 'actions fishing-row';
  row.hidden = true;
  const cancel = document.createElement('button');
  cancel.className = 'btn btn-soft';
  cancel.textContent = STRINGS.fishing.cancel;
  const main = document.createElement('button');
  main.className = 'btn fishing-main';
  row.append(cancel, main);

  // The bar: blue, with red, yellow and green zones painted on, the dot,
  // and the catch meter along its bottom.
  const bar = document.createElement('div');
  bar.className = 'catch-bar';
  bar.hidden = true;
  bar.setAttribute('role', 'img');
  bar.setAttribute('aria-label', STRINGS.fishing.bar);
  const track = document.createElement('div');
  track.className = 'catch-track';
  const marker = document.createElement('div');
  marker.className = 'catch-marker';
  track.append(marker);
  const meter = document.createElement('div');
  meter.className = 'catch-meter';
  const meterFill = document.createElement('div');
  meterFill.className = 'catch-meter-fill';
  meter.append(meterFill);
  bar.append(track, meter);

  const pondView = createPond();
  const pond = document.createElement('div');
  pond.className = 'pond';
  pond.hidden = true;
  const froth = createFroth();
  // Bait you have, in the corner (only when you have some). Tap it to
  // switch bait on: the little ring fills in.
  const bait = document.createElement('button');
  bait.className = 'pond-bait';
  bait.hidden = true;
  bait.setAttribute('role', 'switch');
  const baitDot = document.createElement('i');
  baitDot.className = 'pond-bait-dot';
  const baitIcon = document.createElement('span');
  baitIcon.innerHTML = ITEM_ICONS.bait;
  baitIcon.setAttribute('aria-hidden', 'true');
  const baitCount = document.createElement('b');
  bait.append(baitDot, baitIcon, baitCount);
  bait.addEventListener('click', () => cb.onToggleBait());
  pond.append(froth.canvas, pondView.canvas, bait, bar);
  // Shows the fizzy edge for a while, then fades it out.
  let frothTimer = 0;
  function fizz(ms: number): void {
    pond.classList.add('fizzing');
    clearTimeout(frothTimer);
    frothTimer = window.setTimeout(() => pond.classList.remove('fizzing'), ms);
  }
  // Keeps the pond moving while fishing (and while it drains away).
  let pondFrame = 0;
  let drainTimer = 0;
  const animatePond = (t: number) => {
    pondView.draw(phase === 'off' ? 'ready' : phase, t);
    froth.draw(t); // cheap, and keeps fizzing while it fades out
    pondFrame = requestAnimationFrame(animatePond);
  };

  let phase: FishingPhase = 'off';
  let timer = 0;
  let frame = 0;
  let reel: Reel | null = null;
  let held = false; // Pull is held down
  // Perfect catches in a row, and whether the last cast ended in one.
  let streak = 0;
  let lastPerfect = false;
  // The fishing skills (see src/game/skills.ts), set by the home screen.
  let perks: ReelPerks = { widen: 1, meterStart: CONFIG.fishing.reel.meterStart };

  function clearTimers(): void {
    clearTimeout(timer);
    cancelAnimationFrame(frame);
    setHeld(false);
  }

  function setHeld(on: boolean): void {
    held = on && phase === 'reeling';
    main.classList.toggle('pulling', held);
  }

  function setPhase(next: FishingPhase): void {
    phase = next;
    row.dataset.phase = next;
    main.textContent =
      next === 'reeling' ? STRINGS.fishing.pull
      : next === 'waiting' || next === 'bite' ? STRINGS.fishing.reelIn
      : STRINGS.fishing.cast;
    main.disabled = false;
  }

  // Paints the zones onto the bar with hard colour edges, pixel style.
  function paintZones(z: CatchZones): void {
    const pct = (n: number) => `${(n * 100).toFixed(2)}%`;
    const stops: [string, number, number][] = [
      ['var(--catch-miss)', 0, z.weak.start],
      ['var(--catch-red)', z.weak.start, z.good.start],
      ['var(--catch-yellow)', z.good.start, z.perfect.start],
      ['var(--catch-green)', z.perfect.start, z.perfect.end],
      ['var(--catch-yellow)', z.perfect.end, z.good.end],
      ['var(--catch-red)', z.good.end, z.weak.end],
      ['var(--catch-miss)', z.weak.end, 1],
    ];
    track.style.background = `linear-gradient(to right, ${stops
      .map(([c, a, b]) => `${c} ${pct(a)} ${pct(b)}`)
      .join(', ')})`;
  }

  function moveMarker(position: number): void {
    marker.style.left = `${(position * 100).toFixed(2)}%`;
  }

  // Back to "ready to cast" after a short pause, so the toast can be read.
  function backToReady(delay = 0): void {
    clearTimers();
    main.disabled = true;
    timer = window.setTimeout(() => {
      bar.hidden = true;
      delete bar.dataset.grade;
      setPhase('ready');
    }, delay);
  }

  function castLine(): void {
    if (!cb.onCast()) return;
    if (!lastPerfect) streak = 0;
    lastPerfect = false;
    setPhase('waiting');
    timer = window.setTimeout(bite, biteDelayMs(Math.random()));
  }

  function bite(): void {
    setPhase('bite');
    navigator.vibrate?.([30, 40, 30]);
    timer = window.setTimeout(() => {
      cb.toast(STRINGS.fishing.gotAway);
      backToReady();
    }, CONFIG.fishing.biteWindowSeconds * 1000);
  }

  function reelIn(): void {
    clearTimers();
    if (phase === 'waiting') {
      cb.toast(STRINGS.fishing.tooSoon);
      return backToReady();
    }
    reel = startReel(Math.random(), perks);
    showReel(reel);
    bar.hidden = false;
    setPhase('reeling');
    cb.toast(STRINGS.fishing.hold);
    let last = performance.now();
    const tick = (t: number) => {
      reel = stepReel(reel!, held, t - last, Math.random());
      last = t;
      showReel(reel);
      const outcome = reelOutcome(reel);
      if (outcome === 'lost') {
        cb.toast(STRINGS.fishing.slack);
        return backToReady();
      }
      if (outcome === 'landed') return landed(reel);
      frame = requestAnimationFrame(tick);
    };
    frame = requestAnimationFrame(tick);
  }

  function showReel(r: Reel): void {
    paintZones(reelZones(r));
    moveMarker(r.marker);
    meterFill.style.width = `${(r.meter * 100).toFixed(1)}%`;
  }

  function landed(r: Reel): void {
    clearTimers();
    const grade = reelGrade(r);
    bar.dataset.grade = grade;
    const caught = cb.onLand(grade);
    pondView.landed(caught !== null);
    if (caught) leap(ITEM_ICONS[caught] ?? '');
    if (grade === 'perfect') {
      lastPerfect = true;
      streak++;
      cheer();
    }
    backToReady(RESULT_MS);
  }

  // The landed fish flips up out of the water where the bait was, turning
  // in quarter turns, and is gone at the top of its jump.
  function leap(icon: string): void {
    if (reduced() || !icon) return;
    const box = pondView.canvas.getBoundingClientRect();
    const at = pondView.baitAt();
    const fish = document.createElement('span');
    fish.className = 'fish-leap';
    fish.innerHTML = icon;
    fish.style.left = `${box.left + at.x * box.width}px`;
    fish.style.top = `${box.top + at.y * box.height}px`;
    document.body.append(fish);
    const rise = at.y * box.height + 90;
    const frames = 8;
    fish.animate(
      Array.from({ length: frames + 1 }, (_, i) => {
        const k = i / frames;
        const up = Math.round(rise * (1 - (1 - k) * (1 - k)));
        return {
          transform: `translate(-50%, calc(-50% - ${up}px)) rotate(${i * 90}deg) scale(${k < 0.2 ? 0.6 : 1})`,
          opacity: i === frames ? 0 : 1,
          easing: 'steps(1)',
        };
      }),
      { duration: LEAP_MS },
    ).onfinish = () => fish.remove();
  }

  // "Perfect!" pops up over the pond, with the count of perfects in a row.
  let cheerEl: HTMLElement | null = null;
  function cheer(): void {
    cheerEl?.remove();
    const el = document.createElement('div');
    el.className = 'catch-cheer';
    el.textContent = STRINGS.fishing.perfect;
    if (streak > 1) {
      const n = document.createElement('small');
      n.textContent = STRINGS.fishing.streak(streak);
      el.append(n);
    }
    pond.append(el);
    cheerEl = el;
    window.setTimeout(() => el.remove(), PERFECT_MS);
  }

  main.addEventListener('click', () => {
    if (phase === 'ready') castLine();
    else if (phase === 'waiting' || phase === 'bite') reelIn();
  });
  // Pull is held, not tapped: hold to drag the dot right.
  main.addEventListener('pointerdown', (e) => {
    if (phase !== 'reeling') return;
    e.preventDefault();
    main.setPointerCapture?.(e.pointerId);
    setHeld(true);
  });
  for (const type of ['pointerup', 'pointercancel', 'lostpointercapture'] as const) {
    main.addEventListener(type, () => setHeld(false));
  }
  main.addEventListener('contextmenu', (e) => e.preventDefault()); // long press on phones
  main.addEventListener('keydown', (e) => {
    if (phase !== 'reeling' || (e.key !== 'Enter' && e.key !== ' ')) return;
    e.preventDefault();
    setHeld(true);
  });
  main.addEventListener('keyup', (e) => {
    if (e.key !== 'Enter' && e.key !== ' ') return;
    if (phase === 'reeling') e.preventDefault();
    setHeld(false);
  });
  cancel.addEventListener('click', () => {
    stop();
    cb.onExit();
  });

  function stop(): void {
    clearTimers();
    phase = 'off';
    row.hidden = true;
    bar.hidden = true;
    delete bar.dataset.grade;
    // Let the water drain away, then stop drawing it.
    pond.classList.remove('is-in');
    fizz(DRAIN_MS);
    clearTimeout(drainTimer);
    drainTimer = window.setTimeout(() => {
      cancelAnimationFrame(pondFrame);
      pond.hidden = true;
    }, DRAIN_MS);
  }

  return {
    row,
    pond,
    setPerks(next) {
      perks = next;
    },
    setBait(count, on) {
      bait.hidden = count <= 0;
      bait.classList.toggle('on', on);
      bait.setAttribute('aria-checked', String(on));
      baitCount.textContent = String(count);
      bait.setAttribute('aria-label', STRINGS.fishing.bait(count, on));
    },
    start() {
      row.hidden = false;
      clearTimeout(drainTimer);
      cancelAnimationFrame(pondFrame);
      pond.hidden = false;
      pondView.resize();
      setPhase('ready');
      streak = 0;
      lastPerfect = false;
      pondFrame = requestAnimationFrame(animatePond);
      // Start below the stat bars, then rise up over them on the next frame.
      void pond.offsetHeight;
      pond.classList.add('is-in');
      fizz(RISE_MS);
      cb.toast(STRINGS.fishing.start);
    },
    stop,
    phase: () => phase,
  };
}
