// Playing with a toy (Play > Toys), in the tall room. The dock steps aside
// for a cream tray under the room:
//
//   [ball]  Playing ball                      [Done]
//           Mochi brought it back 3 times
//           ===========-----   (time left)
//
// and a hint sits over the room until the pet has played once. Each toy
// is a little game in room pixels; the pet runs after it (hopping) and
// each catch counts:
//
//   ball     swipe to throw it; it bounces, the pet fetches it and brings
//            it back to its spot.
//   wand     drag the feather about; the pet follows it and pounces when
//            it's low and close.
//   bubbles  tap to blow a few bubbles; they drift down and the pet hops
//            to pop them.
//   starKite drag to fly the kite up high; the pet leaps under it.
//
// When time runs out (or Done), the game ends and counts once on the pet's
// needs, if it played at all (see playToy() in src/game/toys.ts). With
// "reduce motion" on, the pet stays put and each throw, tap or swoop near
// it simply counts.

import { STRINGS } from '../strings';
import { CONFIG } from '../game/config';
import { ITEM_ICONS } from './icons';
import { sound } from '../audio/audio';
import type { ToyScene, ToyThing } from '../render/toys';

export interface ToyGameSetup {
  onCount: () => void; // the pet caught it: a little heart
  onFinish: (id: string, count: number) => void; // the game is over
}

export interface ToyGame {
  panel: HTMLElement; // the tray, in place of the stat bars
  hint: HTMLElement; // "Swipe to throw the ball", over the room
  start: (id: string, petName: string, homeX: number) => void;
  stop: () => void; // ends it now (Done, or from outside); counts what was played
  active: () => boolean;
  // Your finger over the room, in room pixels.
  down: (x: number, y: number) => void;
  move: (x: number, y: number) => void;
  up: (x: number, y: number) => void;
  // What the room draws. Also moves the game along, so it's called every
  // animation frame.
  scene: (timeMs: number) => ToyScene | null;
  petDx: () => number; // how far the pet has run from its spot
}

const FLOOR = 38; // the ball's middle when it lies on the floor
const LEFT = 3;
const RIGHT = 61;
const GRAVITY = 150; // room pixels a second, each second
const RUN = 38; // how fast the pet runs, room pixels a second
const MAX_THROW = 150;
const PET_REACH = 22; // how far the pet can run from its spot, each way

function el<K extends keyof HTMLElementTagNameMap>(tag: K, className: string, text?: string): HTMLElementTagNameMap[K] {
  const e = document.createElement(tag);
  e.className = className;
  if (text !== undefined) e.textContent = text;
  return e;
}

const reduced = () => typeof matchMedia !== 'undefined' && matchMedia('(prefers-reduced-motion: reduce)').matches;

export function createToyGame(setup: ToyGameSetup): ToyGame {
  const panel = el('div', 'toy-panel');
  panel.hidden = true;
  const icon = el('span', 'toy-icon');
  icon.setAttribute('aria-hidden', 'true');
  const words = el('div', 'toy-words');
  const title = el('b', 'toy-title');
  const count = el('small', 'toy-count');
  count.setAttribute('aria-live', 'polite');
  const time = el('div', 'toy-time');
  time.setAttribute('aria-hidden', 'true');
  const timeFill = el('i', '');
  time.append(timeFill);
  words.append(title, count, time);
  const done = el('button', 'toy-done', STRINGS.toys.done);
  done.type = 'button';
  panel.append(icon, words, done);
  const hint = el('div', 'toy-hint');
  hint.hidden = true;

  let id = '';
  let name = '';
  let active = false;
  let caught = 0;
  let startedAt = 0;
  let last = 0;
  let homeX = 32;
  let petDx = 0;
  let hopUntil = 0;
  let lastCatch = 0;
  let still = false; // reduce motion
  // The ball.
  let ball = { x: 0, y: FLOOR, vx: 0, vy: 0 };
  let ballState: 'held' | 'flying' | 'fetch' | 'return' = 'held';
  // The feather, the kite and where your finger is.
  let target: { x: number; y: number } | null = null;
  let thing = { x: 0, y: 0 };
  let pointer: { x: number; y: number; at: number; px: number; py: number; pat: number } | null = null;
  // Bubbles: drifting down; `pop` from when they burst.
  let bubbles: { x: number; y: number; vx: number; vy: number; born: number; pop?: number }[] = [];

  const petX = () => homeX + petDx;

  function showCount(): void {
    count.textContent = STRINGS.toys.count[id]?.(name, caught) ?? '';
  }

  function catchIt(now: number): void {
    caught++;
    lastCatch = now;
    hopUntil = now + 450;
    hint.hidden = true;
    showCount();
    sound('giggle');
    setup.onCount();
  }

  function start(toy: string, petName: string, x: number): void {
    id = toy;
    name = petName;
    homeX = x;
    active = true;
    caught = 0;
    petDx = 0;
    hopUntil = 0;
    lastCatch = 0;
    still = reduced();
    startedAt = performance.now();
    last = startedAt;
    ball = { x: homeX + 9, y: FLOOR, vx: 0, vy: 0 };
    ballState = 'held';
    target = null;
    pointer = null;
    bubbles = [];
    thing = toy === 'starKite' ? { x: homeX + 10, y: 6 } : { x: homeX + 14, y: 26 };
    icon.innerHTML = ITEM_ICONS[`toy_${toy}`] ?? '';
    title.textContent = STRINGS.toys.playing[toy] ?? '';
    hint.textContent = STRINGS.toys.hint[toy] ?? '';
    hint.hidden = false;
    timeFill.style.width = '100%';
    showCount();
    panel.hidden = false;
    done.focus({ preventScroll: true });
  }

  function stop(): void {
    if (!active) return;
    active = false;
    panel.hidden = true;
    hint.hidden = true;
    setup.onFinish(id, caught);
  }
  done.addEventListener('click', stop);

  // Runs the pet towards `x` (its middle), hopping while it runs. True
  // once it's there.
  function runTo(x: number, dt: number): boolean {
    const want = Math.max(-PET_REACH, Math.min(PET_REACH, x - homeX));
    const gap = want - petDx;
    if (Math.abs(gap) < 1) return Math.abs(x - homeX - petDx) < 2.5;
    petDx += Math.sign(gap) * Math.min(Math.abs(gap), RUN * dt);
    hopUntil = Math.max(hopUntil, performance.now() + 80);
    return false;
  }

  function stepBall(now: number, dt: number): void {
    if (ballState === 'held') {
      ball.x = petX() + 9;
      ball.y = FLOOR;
      return;
    }
    if (ballState === 'flying') {
      ball.vy += GRAVITY * dt;
      ball.x += ball.vx * dt;
      ball.y += ball.vy * dt;
      if (ball.x < LEFT || ball.x > RIGHT) {
        ball.x = Math.max(LEFT, Math.min(RIGHT, ball.x));
        ball.vx *= -0.7;
      }
      if (ball.y >= FLOOR) {
        ball.y = FLOOR;
        if (Math.abs(ball.vy) > 25) {
          ball.vy *= -0.5;
          sound('potPlop');
        } else ball.vy = 0;
        ball.vx *= 0.82;
      }
      // Once it's slow, or as soon as it's down, the pet goes after it.
      if (ball.y >= FLOOR - 0.5 && Math.abs(ball.vy) < 30) ballState = 'fetch';
    }
    if (ballState === 'fetch') {
      ball.vx *= 0.9;
      ball.x = Math.max(LEFT, Math.min(RIGHT, ball.x + ball.vx * dt));
      const atEdge = Math.abs(petDx) >= PET_REACH - 0.5 && Math.sign(ball.x - homeX) === Math.sign(petDx) && Math.abs(ball.vx) < 8;
      // Caught up with it (or as far as it can go: it reaches out for it).
      if (runTo(ball.x, dt) || Math.abs(ball.x - petX()) < 3 || atEdge) ballState = 'return';
    }
    if (ballState === 'return') {
      // In its mouth, on the way back.
      ball.x = petX() + 4;
      ball.y = 30;
      if (runTo(homeX, dt) || Math.abs(petDx) < 1) {
        petDx = 0;
        ballState = 'held';
        catchIt(now);
      }
    }
  }

  function stepWand(now: number, dt: number): void {
    if (target) {
      thing.x += (target.x - thing.x) * Math.min(1, dt * 14);
      thing.y += (target.y - thing.y) * Math.min(1, dt * 14);
    }
    thing.x = Math.max(LEFT, Math.min(RIGHT, thing.x));
    thing.y = Math.max(-40, Math.min(FLOOR, thing.y));
    if (still) {
      if (Math.abs(thing.x - homeX) < 6 && thing.y > 22 && now - lastCatch > 900) catchIt(now);
      return;
    }
    const there = runTo(thing.x, dt);
    if ((there || Math.abs(thing.x - petX()) < 4) && thing.y > 22 && now - lastCatch > 900) catchIt(now);
  }

  function stepKite(now: number, dt: number): void {
    const t = now / 1000;
    const goal = target ?? { x: thing.x + Math.sin(t * 0.9) * 0.4, y: thing.y + Math.cos(t * 1.3) * 0.2 };
    // It lags behind, like a kite on the wind, and stays up high.
    thing.x += (goal.x - thing.x) * Math.min(1, dt * 3);
    thing.y += (Math.min(16, goal.y) - thing.y) * Math.min(1, dt * 3);
    thing.x = Math.max(LEFT + 2, Math.min(RIGHT - 2, thing.x));
    if (still) {
      if (Math.abs(thing.x - homeX) < 6 && now - lastCatch > 1500) catchIt(now);
      return;
    }
    const there = runTo(thing.x, dt);
    if ((there || Math.abs(thing.x - petX()) < 4) && now - lastCatch > 1500) catchIt(now);
  }

  function stepBubbles(now: number, dt: number): void {
    const t = now / 1000;
    for (const b of bubbles) {
      if (b.pop !== undefined) continue;
      b.x += (b.vx + Math.sin(t * 2 + b.born) * 3) * dt;
      b.y += b.vy * dt;
      b.x = Math.max(LEFT, Math.min(RIGHT, b.x));
      if (b.y >= FLOOR) b.pop = now; // landed: it bursts by itself
    }
    const live = bubbles.filter((b) => b.pop === undefined);
    if (still) {
      const near = live.find((b) => now - b.born > 600);
      if (near) {
        near.pop = now;
        catchIt(now);
      }
    } else if (live.length > 0) {
      // After the lowest one.
      const next = live.reduce((a, b) => (b.y > a.y ? b : a));
      runTo(next.x, dt);
      const hit = live.find((b) => b.y > 22 && Math.abs(b.x - petX()) < 5);
      if (hit) {
        hit.pop = now;
        sound('potPlop');
        catchIt(now);
      }
    }
    bubbles = bubbles.filter((b) => b.pop === undefined || now - b.pop < 300);
  }

  function scene(timeMs: number): ToyScene | null {
    if (!active) return null;
    const now = performance.now();
    const dt = Math.min(0.05, (now - last) / 1000);
    last = now;
    const left = 1 - (now - startedAt) / (CONFIG.toyPlay.playSeconds * 1000);
    timeFill.style.width = `${Math.max(0, left) * 100}%`;
    if (left <= 0) {
      stop();
      return null;
    }
    if (id === 'ball') stepBall(now, dt);
    else if (id === 'wand') stepWand(now, dt);
    else if (id === 'bubbles') stepBubbles(now, dt);
    else stepKite(now, dt);
    const things: ToyThing[] = [];
    let line: ToyScene['line'];
    let shadowX: number | undefined;
    if (id === 'ball') {
      things.push({ kind: 'ball', x: ball.x, y: ball.y });
      if (ballState === 'flying' && ball.y < FLOOR - 2) shadowX = ball.x;
    } else if (id === 'wand') {
      things.push({ kind: 'feather', x: thing.x, y: thing.y });
      line = { x1: thing.x + 1, y1: thing.y + 3, x2: thing.x + 9, y2: thing.y + 15, kind: 'stick' };
    } else if (id === 'bubbles') {
      for (const b of bubbles) things.push({ kind: 'bubble', x: b.x, y: b.y, ...(b.pop !== undefined ? { pop: (now - b.pop) / 300 } : {}) });
    } else {
      things.push({ kind: 'kite', x: thing.x, y: thing.y });
      line = { x1: thing.x, y1: thing.y + 3, x2: 63, y2: 47, kind: 'string' };
    }
    void timeMs;
    return { things, line, petDx: Math.round(petDx), hop: !still && now < hopUntil, shadowX };
  }

  return {
    panel,
    hint,
    start,
    stop,
    active: () => active,
    down(x, y) {
      if (!active) return;
      const now = performance.now();
      pointer = { x, y, at: now, px: x, py: y, pat: now };
      if (id === 'wand' || id === 'starKite') target = { x, y };
      if (id === 'bubbles' && bubbles.filter((b) => b.pop === undefined).length < 9) {
        sound('place');
        for (let i = 0; i < 3; i++) {
          bubbles.push({ x: x + (i - 1) * 4, y: Math.min(y, 20) - i * 2, vx: (i - 1) * 4, vy: 7 + i * 2, born: now + i * 120 });
        }
      }
    },
    move(x, y) {
      if (!active || !pointer) return;
      const now = performance.now();
      // Keeps a point from a moment ago, for the throw's speed.
      if (now - pointer.pat > 60) {
        pointer.px = pointer.x;
        pointer.py = pointer.y;
        pointer.pat = pointer.at;
      }
      pointer.x = x;
      pointer.y = y;
      pointer.at = now;
      if (id === 'wand' || id === 'starKite') target = { x, y };
    },
    up(x, y) {
      if (!active || !pointer) return;
      const now = performance.now();
      const dt = Math.max(0.016, (now - pointer.pat) / 1000);
      const vx = (x - pointer.px) / dt;
      const vy = (y - pointer.py) / dt;
      pointer = null;
      if (id === 'wand' || id === 'starKite') target = null;
      if (id !== 'ball' || ballState !== 'held') return;
      const speed = Math.hypot(vx, vy);
      if (speed < 25) return; // a tap, not a throw
      if (still) {
        catchIt(now); // no chase: it counts straight away
        return;
      }
      const k = Math.min(1, MAX_THROW / speed);
      ball = { x: ball.x, y: FLOOR - 2, vx: vx * k, vy: Math.min(-40, vy * k) };
      ballState = 'flying';
      sound('place');
    },
    scene,
    petDx: () => Math.round(petDx),
  };
}
