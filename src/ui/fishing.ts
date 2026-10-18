// The fishing mini-game's buttons and pond. While you fish, the button row
// becomes [Cancel] [Cast], where Cast turns into Reel in once the line is
// out, and Reel in turns into Catch once a fish is hooked. Water rises up
// over the stat bars into a pond of the same size (see src/render/pond.ts),
// and drains away again when you stop. The catch bar shows up at the
// bottom of the pond while you reel in.
//
// Only the timing lives here. What a catch is worth, and what casting costs,
// is decided in src/game/fishing.ts.

import { STRINGS } from '../strings';
import { ITEM_ICONS } from './icons';
import { CONFIG } from '../game/config';
import { createFroth, createPond } from '../render/pond';
import { biteDelayMs, gradeAt, markerAt, placeZones, sweptOut, type CatchGrade, type CatchZones } from '../game/fishing';

// ready: line in, waiting for you to cast. waiting: line out, no bite yet.
// bite: a fish is nibbling, tap Reel in now! reeling: the catch bar is up.
export type FishingPhase = 'off' | 'ready' | 'waiting' | 'bite' | 'reeling';

export interface FishingCallbacks {
  onCast: () => boolean; // false if the game refused (the reason is shown elsewhere)
  onLand: (grade: CatchGrade) => void;
  onExit: () => void;
  toast: (message: string) => void;
}

export interface Fishing {
  row: HTMLElement; // the buttons, shown in place of the normal button row
  pond: HTMLElement; // the pond with its catch bar, shown in place of the stat bars
  start: () => void;
  stop: () => void;
  phase: () => FishingPhase;
  setBait: (count: number) => void; // the bait you have left, shown in the pond's corner
}

// How long the bar stays up after Catch, showing where the marker stopped.
const RESULT_MS = 900;
// How long the water takes to rise and to drain away (matches .pond in
// style.css). The fizzy edge shows for that long.
const RISE_MS = 700;
export const DRAIN_MS = 450;

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

  // The bar: blue, with green, yellow and red zones painted on, and a marker.
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
  bar.append(track);

  const pondView = createPond();
  const pond = document.createElement('div');
  pond.className = 'pond';
  pond.hidden = true;
  const froth = createFroth();
  // Bait you have, in the corner (only when you have some).
  const bait = document.createElement('div');
  bait.className = 'pond-bait';
  bait.hidden = true;
  const baitIcon = document.createElement('span');
  baitIcon.innerHTML = ITEM_ICONS.bait;
  baitIcon.setAttribute('aria-hidden', 'true');
  const baitCount = document.createElement('b');
  bait.append(baitIcon, baitCount);
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
  let zones: CatchZones | null = null;
  let reelStart = 0;

  function clearTimers(): void {
    clearTimeout(timer);
    cancelAnimationFrame(frame);
  }

  function setPhase(next: FishingPhase): void {
    phase = next;
    row.dataset.phase = next;
    main.textContent =
      next === 'reeling' ? STRINGS.fishing.catch
      : next === 'waiting' || next === 'bite' ? STRINGS.fishing.reelIn
      : STRINGS.fishing.cast;
    main.disabled = false;
  }

  // Paints the zones onto the bar with hard colour edges, pixel style.
  function paintZones(z: CatchZones): void {
    const pct = (n: number) => `${(n * 100).toFixed(2)}%`;
    const stops: [string, number, number][] = [
      ['var(--catch-miss)', 0, z.weak.start],
      ['var(--catch-weak)', z.weak.start, z.good.start],
      ['var(--catch-good)', z.good.start, z.perfect.start],
      ['var(--catch-perfect)', z.perfect.start, z.perfect.end],
      ['var(--catch-good)', z.perfect.end, z.good.end],
      ['var(--catch-weak)', z.good.end, z.weak.end],
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
    setPhase('waiting');
    timer = window.setTimeout(bite, biteDelayMs(Math.random()));
  }

  function bite(): void {
    setPhase('bite');
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
    zones = placeZones(Math.random());
    paintZones(zones);
    moveMarker(0);
    bar.hidden = false;
    setPhase('reeling');
    reelStart = performance.now();
    const tick = (t: number) => {
      const elapsed = t - reelStart;
      if (sweptOut(elapsed)) {
        cb.toast(STRINGS.fishing.slack);
        return backToReady();
      }
      moveMarker(markerAt(elapsed));
      frame = requestAnimationFrame(tick);
    };
    frame = requestAnimationFrame(tick);
  }

  function tryCatch(): void {
    clearTimers();
    const position = markerAt(performance.now() - reelStart);
    moveMarker(position);
    const grade = gradeAt(zones!, position);
    bar.dataset.grade = grade;
    cb.onLand(grade);
    backToReady(RESULT_MS);
  }

  main.addEventListener('click', () => {
    if (phase === 'ready') castLine();
    else if (phase === 'waiting' || phase === 'bite') reelIn();
    else if (phase === 'reeling') tryCatch();
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
    setBait(count) {
      bait.hidden = count <= 0;
      baitCount.textContent = String(count);
      bait.title = STRINGS.fishing.baitLeft(count);
    },
    start() {
      row.hidden = false;
      clearTimeout(drainTimer);
      cancelAnimationFrame(pondFrame);
      pond.hidden = false;
      pondView.resize();
      setPhase('ready');
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
