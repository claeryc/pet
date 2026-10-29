// Makes the game's sound effects: the fishing mini-game's watery plops,
// splashes and reel clicks, the kitchen's chops, plops and bubbling pot,
// and the rest of the game's: munching, cuddles, the bath, the garden,
// sniffing and digging, the workbench, rewards, coins, Percy's bell and
// journeys. All made from scratch for this game, so there's nothing to license
// or credit. Each sound is a short recipe below, built from a few
// ingredients: bubbles (a quick sine whose pitch slides up, which is what a
// real bubble popping sounds like), filtered noise (for splashes, sizzles
// and whooshes), knocks (wood and pots being hit), pings and bells, crackle
// (soil, crumbs and paper) and coos (the pet's little voice).
//
//   npm run sfx
//
// Needs Node.js 22.18 or newer and ffmpeg (https://ffmpeg.org) to turn the
// sound into MP3. Tweak a recipe and run it again to make new versions.
// Files go to public/audio/sfx/, and src/audio/audio.ts says which sound
// plays when.

import { execFileSync } from 'node:child_process';
import { mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const RATE = 44100;
const OUT = join(dirname(fileURLToPath(import.meta.url)), '..', 'public', 'audio', 'sfx');

// A little seeded random, so every run makes the same files.
let seed = 11;
const rand = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
const between = (a: number, b: number) => a + rand() * (b - a);

const hz = (midi: number) => 440 * 2 ** ((midi - 69) / 12);

// ---------- Ingredients ----------

// A bubble: a sine that slides up in pitch as it fades (`rise` 1 doubles
// the pitch over its length; below 0 it slides down instead).
function bubble(buf: Float32Array, at: number, f: number, length: number, gain: number, rise = 1): void {
  const from = Math.round(at * RATE);
  const n = Math.min(Math.round(length * RATE), buf.length - from);
  let phase = 0;
  for (let i = 0; i < n; i++) {
    const t = i / RATE;
    phase += (2 * Math.PI * f * (1 + rise * (t / length))) / RATE;
    const env = Math.min(1, t / 0.002) * Math.exp(-t / (length / 4));
    buf[from + i] += gain * env * Math.sin(phase);
  }
}

// Noise through a band-pass filter whose centre moves from `f0` to `f1`,
// shaped by `env` (0 to 1 over the sound's length). Wide `width` sounds
// hissy, narrow sounds whistly.
function noise(
  buf: Float32Array,
  at: number,
  length: number,
  f0: number,
  f1: number,
  gain: number,
  env: (k: number) => number,
  width = 1,
): void {
  const from = Math.round(at * RATE);
  const n = Math.min(Math.round(length * RATE), buf.length - from);
  let low = 0;
  let band = 0;
  for (let i = 0; i < n; i++) {
    const k = i / n;
    const fc = f0 * (f1 / f0) ** k; // slides evenly in pitch
    const g = 2 * Math.sin((Math.PI * Math.min(fc, RATE / 6)) / RATE);
    const high = rand() * 2 - 1 - low - width * band;
    band += g * high;
    low += g * band;
    buf[from + i] += gain * env(k) * band;
  }
}

// A music-box ping, for the sparkly bits.
function ping(buf: Float32Array, at: number, f: number, gain: number, ring = 0.35): void {
  const from = Math.round(at * RATE);
  const n = Math.min(Math.round(ring * 4 * RATE), buf.length - from);
  for (let i = 0; i < n; i++) {
    const t = i / RATE;
    const attack = Math.min(1, t / 0.003);
    buf[from + i] += gain * attack * (
      Math.sin(2 * Math.PI * f * t) * Math.exp(-t / ring)
      + 0.2 * Math.sin(2 * Math.PI * 2 * f * t) * Math.exp(-t / (ring / 3))
    );
  }
}

// A knock: something solid being hit, like a knife on a board or a bowl
// set down. A low thump that drops in pitch, with a few higher ringing
// partials (`partials`, as multiples of `f`) that die away faster. Low and
// short sounds wooden; more partials and a longer `ring` sound like metal.
function knock(buf: Float32Array, at: number, f: number, gain: number, ring = 0.05, partials: number[] = [2.3, 3.9]): void {
  const from = Math.round(at * RATE);
  const n = Math.min(Math.round(ring * 6 * RATE), buf.length - from);
  let phase = 0;
  const phases = partials.map(() => 0);
  for (let i = 0; i < n; i++) {
    const t = i / RATE;
    phase += (2 * Math.PI * f * (1 + 0.6 * Math.exp(-t / 0.01))) / RATE;
    let x = Math.sin(phase) * Math.exp(-t / ring);
    partials.forEach((m, j) => {
      phases[j] += (2 * Math.PI * f * m) / RATE;
      x += (0.5 / (j + 1)) * Math.sin(phases[j]) * Math.exp(-t / (ring / (1.5 + j)));
    });
    buf[from + i] += gain * Math.min(1, t / 0.0008) * x;
  }
}

// A little pet voice: a soft hum gliding from `f0` to `f1`, with a wobble
// and a touch of a second harmonic so it sounds like a coo, not a beep.
function coo(buf: Float32Array, at: number, f0: number, f1: number, length: number, gain: number): void {
  const from = Math.round(at * RATE);
  const n = Math.min(Math.round(length * RATE), buf.length - from);
  let phase = 0;
  for (let i = 0; i < n; i++) {
    const k = i / n;
    const f = f0 * (f1 / f0) ** k * (1 + 0.025 * Math.sin(2 * Math.PI * 7 * (i / RATE)));
    phase += (2 * Math.PI * f) / RATE;
    const env = Math.min(1, k / 0.15) * Math.min(1, (1 - k) / 0.4);
    buf[from + i] += gain * env * (Math.sin(phase) + 0.3 * Math.sin(2 * phase) + 0.08 * Math.sin(3 * phase));
  }
}

// A bell: a ping with the out-of-tune partials real bells have, so it
// rings rather than beeps (a bicycle bell, a shop bell).
function chime(buf: Float32Array, at: number, f: number, gain: number, ring = 0.4): void {
  [[1, 1, 1], [2.76, 0.45, 0.5], [5.4, 0.25, 0.3], [8.9, 0.12, 0.2]].forEach(([m, g, r]) => ping(buf, at, f * m, gain * g, ring * r));
}

// Crackle: tiny clicks scattered over `length`, like dry soil, crumbs or
// paper. Each click is a short burst of high noise.
function crackle(buf: Float32Array, at: number, length: number, count: number, gain: number, f = 3500): void {
  for (let i = 0; i < count; i++) {
    noise(buf, at + rand() * length, 0.006, f, f * 0.7, gain * between(0.4, 1), hit(0.05, 0.3), 0.5);
  }
}

// Chewing: three quick chomps, each a short crunch (mid noise with crumbs
// cracking in it), a soft thump of the jaw and a little wet smack. Each
// chomp's pitch is scaled by its number in `pitches`. They use their own
// random numbers (from `ownSeed`), so the other sounds don't change.
function chomps(buf: Float32Array, ownSeed: number, pitches: number[]): void {
  const saved = seed;
  seed = ownSeed;
  pitches.forEach((p, i) => {
    const t = i * 0.17 + between(0, 0.02);
    noise(buf, t, 0.09, 1700 * p, 900 * p, 0.75, hit(0.02, 0.25), 0.8);
    noise(buf, t, 0.05, 4200 * p, 2600 * p, 0.35, hit(0.02, 0.3), 0.6);
    crackle(buf, t, 0.06, 8, 0.45, 3200 * p);
    knock(buf, t, 150 * p, 0.35, 0.015, [2.2]);
    bubble(buf, t + 0.06, 520 * p, 0.04, 0.15, -0.3);
  });
  seed = saved;
}

const bell = (k: number) => Math.sin(Math.PI * k) ** 2; // swells up, then away
const hit = (attack: number, decay: number) => (k: number) => Math.min(1, k / attack) * Math.exp(-k / decay);

// ---------- The sounds ----------

const RECIPES: Record<string, { seconds: number; make: (buf: Float32Array) => void }> = {
  // Casting: the line whooshes out with a whir of the reel, then the bait
  // lands with a plop.
  'fish-cast': {
    seconds: 0.8,
    make(buf) {
      noise(buf, 0, 0.38, 500, 3200, 0.35, bell, 0.7);
      for (let t = 0.04, gap = 0.009; t < 0.34; t += gap, gap *= 1.07) {
        noise(buf, t, 0.004, 4200, 4200, 0.25, hit(0.1, 0.3), 0.5);
      }
      bubble(buf, 0.42, 620, 0.13, 0.7, 1.3);
      noise(buf, 0.42, 0.1, 2400, 800, 0.25, hit(0.03, 0.25));
      bubble(buf, 0.5, 1150, 0.05, 0.18);
      bubble(buf, 0.56, 1350, 0.04, 0.12);
    },
  },
  // A nibble: one small bloop and a tinier one after it.
  'fish-nibble': {
    seconds: 0.22,
    make(buf) {
      bubble(buf, 0, 880, 0.07, 0.7, 0.9);
      bubble(buf, 0.08, 1250, 0.05, 0.3, 0.9);
    },
  },
  // A bite: a sudden splash with bubbles, and a bright "now!" double ping.
  'fish-bite': {
    seconds: 0.6,
    make(buf) {
      noise(buf, 0, 0.28, 3600, 700, 0.55, hit(0.01, 0.25));
      bubble(buf, 0, 430, 0.16, 0.65, 1.5);
      for (let i = 0; i < 6; i++) bubble(buf, between(0.05, 0.3), between(650, 1400), between(0.03, 0.06), between(0.12, 0.28));
      ping(buf, 0.02, hz(88), 0.22, 0.12); // E6
      ping(buf, 0.11, hz(93), 0.22, 0.16); // A6
    },
  },
  // One tick of the reel's ratchet; it plays over and over while you pull.
  'fish-reel': {
    seconds: 0.04,
    make(buf) {
      noise(buf, 0, 0.012, 3800, 3000, 0.9, hit(0.02, 0.15), 0.6);
      ping(buf, 0, 2600, 0.25, 0.005);
    },
  },
  // A landed fish: a big splash out of the water, then droplets falling back.
  'fish-splash': {
    seconds: 0.85,
    make(buf) {
      noise(buf, 0, 0.42, 4200, 600, 0.7, hit(0.015, 0.25));
      bubble(buf, 0, 340, 0.2, 0.6, 1.6);
      bubble(buf, 0.06, 520, 0.12, 0.3, 1.4);
      for (let i = 0; i < 7; i++) bubble(buf, between(0.25, 0.62), between(1500, 2600), 0.04, between(0.08, 0.18), 0.6);
    },
  },
  // Getting away: a swish off through the water and three bloops going down.
  'fish-escape': {
    seconds: 0.5,
    make(buf) {
      noise(buf, 0, 0.3, 1800, 450, 0.45, bell);
      bubble(buf, 0.05, 900, 0.09, 0.35, -0.3);
      bubble(buf, 0.15, 700, 0.09, 0.3, -0.3);
      bubble(buf, 0.26, 520, 0.12, 0.28, -0.3);
    },
  },
  // A perfect catch: a quick sparkly run up, with a twinkle on top.
  'fish-perfect': {
    seconds: 1.1,
    make(buf) {
      [84, 88, 91, 96].forEach((note, i) => ping(buf, i * 0.065, hz(note), 0.3)); // C6 E6 G6 C7
      for (let i = 0; i < 6; i++) ping(buf, between(0.2, 0.6), between(3000, 5500), between(0.03, 0.06), 0.08);
    },
  },
  // The pond filling up over the stat bars: a soft rush with bubbles rising.
  'pond-fill': {
    seconds: 0.85,
    make(buf) {
      noise(buf, 0, 0.8, 300, 1200, 0.2, (k) => Math.min(1, k / 0.55) * Math.min(1, (1 - k) / 0.3), 0.8);
      for (let i = 0; i < 10; i++) bubble(buf, i * 0.06 + between(0, 0.02), 300 + i * 60 + between(0, 60), 0.06, 0.35);
    },
  },
  // The pond draining away: a gurgle sinking lower.
  'pond-drain': {
    seconds: 0.6,
    make(buf) {
      noise(buf, 0, 0.5, 1000, 300, 0.2, (k) => Math.min(1, k / 0.1) * (1 - k), 0.8);
      for (let i = 0; i < 8; i++) bubble(buf, i * 0.055 + between(0, 0.015), 800 - i * 70, 0.06, 0.22, 0.5);
    },
  },

  // ---------- The kitchen ----------

  // Food set down on a plate or the board: a soft wooden tok.
  'kitchen-place': {
    seconds: 0.2,
    make(buf) {
      knock(buf, 0, 520, 0.8, 0.025, [2.7]);
      noise(buf, 0, 0.02, 3000, 1500, 0.25, hit(0.05, 0.3));
    },
  },
  // Food taken back off a plate: a lighter, higher tik.
  'kitchen-lift': {
    seconds: 0.15,
    make(buf) {
      knock(buf, 0, 900, 0.6, 0.015, [2.4]);
    },
  },
  // A chop: the knife's quick swish, then a thunk into the wooden board.
  chop: {
    seconds: 0.32,
    make(buf) {
      noise(buf, 0, 0.06, 2500, 6000, 0.25, bell, 0.6);
      knock(buf, 0.055, 190, 1, 0.045, [2.1, 3.7, 5.3]);
      noise(buf, 0.055, 0.05, 5000, 2000, 0.4, hit(0.02, 0.15), 0.8);
    },
  },
  // A chop right in the green: the same thunk with a bright ping on top.
  'chop-perfect': {
    seconds: 0.55,
    make(buf) {
      noise(buf, 0, 0.06, 2500, 6000, 0.25, bell, 0.6);
      knock(buf, 0.055, 190, 1, 0.045, [2.1, 3.7, 5.3]);
      noise(buf, 0.055, 0.05, 5000, 2000, 0.4, hit(0.02, 0.15), 0.8);
      ping(buf, 0.07, hz(93), 0.3, 0.12); // A6
      ping(buf, 0.07, hz(100), 0.12, 0.08); // E7
    },
  },
  // An ingredient dropping into the pot: a thick, soupy blorp with a
  // little splash.
  'pot-plop': {
    seconds: 0.35,
    make(buf) {
      bubble(buf, 0, 210, 0.16, 0.9, 1.8);
      noise(buf, 0, 0.12, 1800, 500, 0.3, hit(0.03, 0.3));
      bubble(buf, 0.07, 520, 0.06, 0.25, 1.2);
      bubble(buf, 0.12, 760, 0.05, 0.15);
    },
  },
  // The pot cooking: the burner catches with a soft whoomph, the stew
  // bubbles and sizzles, and the lid rattles as it comes to the boil.
  'pot-simmer': {
    seconds: 1.75,
    make(buf) {
      noise(buf, 0, 0.35, 200, 900, 0.5, hit(0.15, 0.4), 1.2); // whoomph
      noise(buf, 0.1, 1.6, 4500, 6500, 0.12, (k) => Math.min(1, k / 0.3) * Math.min(1, (1 - k) / 0.15), 1.4); // sizzle
      // Bubbles, coming faster as it heats up.
      for (let t = 0.2, gap = 0.12; t < 1.6; t += gap * between(0.6, 1.3), gap = Math.max(0.035, gap * 0.9)) {
        bubble(buf, t, between(180, 420), between(0.05, 0.1), between(0.25, 0.5), between(0.8, 1.6));
      }
      // The lid hopping on the pot: little metal clinks.
      for (let t = 0.85; t < 1.55; t += between(0.07, 0.12)) {
        knock(buf, t, between(1150, 1300), between(0.12, 0.22), 0.03, [2.76, 5.4, 8.9]);
      }
    },
  },
  // A dish ready: the lid lifts with a ting, and a happy little run up.
  'dish-ready': {
    seconds: 1.2,
    make(buf) {
      knock(buf, 0, 1240, 0.3, 0.12, [2.76, 5.4, 8.9]);
      noise(buf, 0, 0.35, 800, 3000, 0.12, hit(0.05, 0.4), 0.9); // steam puffing out
      [77, 81, 84, 89].forEach((note, i) => ping(buf, 0.12 + i * 0.08, hz(note), 0.32, 0.3)); // F5 A5 C6 F6
      for (let i = 0; i < 4; i++) ping(buf, between(0.4, 0.7), between(3500, 5500), between(0.03, 0.05), 0.07);
    },
  },
  // A Mushy mess: a sad, sloppy squelch going down.
  'dish-mushy': {
    seconds: 0.9,
    make(buf) {
      bubble(buf, 0, 260, 0.25, 0.8, -0.5);
      noise(buf, 0, 0.3, 900, 250, 0.35, hit(0.05, 0.4), 1.3);
      bubble(buf, 0.18, 200, 0.2, 0.5, -0.4);
      ping(buf, 0.3, hz(67), 0.22, 0.12); // G4
      ping(buf, 0.48, hz(63), 0.22, 0.2); // Eb4
    },
  },

  // ---------- Looking after the pet ----------

  // Eating: three quick, crunchy chomps, one bite's worth. A bite plays
  // one of munch, munch-2 and munch-3 in turn, so the chewing runs on
  // without repeating itself.
  munch: {
    seconds: 0.6,
    make(buf) {
      // The first munch was a single softer crunch. It still runs (into
      // nothing) so the random numbers the sounds after it get stay the
      // same, and they come out exactly as before.
      const old = new Float32Array(Math.round(0.2 * RATE));
      noise(old, 0, 0.07, 1800, 900, 0.6, hit(0.05, 0.35), 1.1);
      crackle(old, 0.005, 0.08, 7, 0.35, 2800);
      chomps(buf, 101, [1, 0.92, 1.06]);
    },
  },
  // A cuddle: two soft squishes and a happy coo.
  cuddle: {
    seconds: 0.9,
    make(buf) {
      noise(buf, 0.05, 0.12, 500, 300, 0.4, bell, 1.2);
      noise(buf, 0.45, 0.1, 500, 300, 0.25, bell, 1.2);
      coo(buf, 0.18, 520, 760, 0.32, 0.45);
      coo(buf, 0.52, 700, 640, 0.22, 0.3);
    },
  },
  // A tickle: a wriggly little giggle, quick chirps that calm down.
  giggle: {
    seconds: 1.2,
    make(buf) {
      [0, 0.11, 0.21, 0.32, 0.45, 0.6, 0.8].forEach((t, i) => {
        const f = (i % 2 ? 820 : 960) * (1 - i * 0.03);
        coo(buf, t, f, f * 1.25, 0.08 + i * 0.01, 0.5 - i * 0.04);
      });
    },
  },
  // Lights off: the switch clicks, and a sleepy two-note lullaby falls.
  'lights-off': {
    seconds: 1.1,
    make(buf) {
      knock(buf, 0, 2200, 0.5, 0.006, [1.7]);
      knock(buf, 0.03, 1500, 0.3, 0.006, [1.9]);
      ping(buf, 0.12, hz(76), 0.28, 0.35); // E5
      ping(buf, 0.36, hz(69), 0.28, 0.5); // A4
    },
  },
  // Lights on: the switch clicks, and a bright little run up wakes it.
  'lights-on': {
    seconds: 1.0,
    make(buf) {
      knock(buf, 0, 2200, 0.5, 0.006, [1.7]);
      knock(buf, 0.03, 1500, 0.3, 0.006, [1.9]);
      [72, 76, 79].forEach((note, i) => ping(buf, 0.1 + i * 0.07, hz(note), 0.26, 0.22)); // C5 E5 G5
      for (let i = 0; i < 4; i++) ping(buf, between(0.3, 0.5), between(3200, 5000), 0.05, 0.05);
    },
  },
  // Medicine: the spoon clinks, a gulp, a "bleh" shudder, then a twinkle
  // as it feels better. Timed to the moment in src/render/moments.ts.
  medicine: {
    seconds: 1.75,
    make(buf) {
      knock(buf, 0.5, 2600, 0.35, 0.03, [2.76, 5.4]); // spoon on teeth
      bubble(buf, 0.6, 300, 0.12, 0.7, -0.4); // gulp
      coo(buf, 0.72, 330, 250, 0.28, 0.35); // bleh
      noise(buf, 0.72, 0.25, 700, 500, 0.12, bell, 1.4);
      [84, 88, 91].forEach((note, i) => ping(buf, 1.3 + i * 0.06, hz(note), 0.18, 0.15)); // C6 E6 G6
    },
  },
  // Scooping up a poop: a squishy blorp and a little rustle of the bag.
  scoop: {
    seconds: 0.45,
    make(buf) {
      bubble(buf, 0, 180, 0.14, 0.7, 0.8);
      noise(buf, 0, 0.1, 900, 400, 0.3, hit(0.05, 0.3), 1.3);
      crackle(buf, 0.16, 0.2, 12, 0.18, 4200);
    },
  },

  // ---------- Bath time ----------

  // Scrubbing with the sponge: a squeaky, sudsy rub. Plays over and over
  // while you rub.
  scrub: {
    seconds: 0.18,
    make(buf) {
      noise(buf, 0, 0.16, 1400, 2600, 0.5, bell, 0.5);
      bubble(buf, 0.03, between(1400, 1900), 0.03, 0.15);
      bubble(buf, 0.09, between(1600, 2200), 0.03, 0.12);
    },
  },
  // Rinsed: a splash of water and drips.
  rinse: {
    seconds: 0.9,
    make(buf) {
      noise(buf, 0, 0.45, 3000, 900, 0.55, hit(0.04, 0.35), 0.9);
      bubble(buf, 0.02, 420, 0.14, 0.4, 1.3);
      for (let i = 0; i < 6; i++) bubble(buf, 0.3 + i * 0.08 + between(0, 0.03), between(1300, 2000), 0.04, 0.18, 0.7);
    },
  },
  // The dryer: a puff of warm air. Plays over and over while drying, each
  // one overlapping the last, so it sounds like one steady whoosh.
  dryer: {
    seconds: 0.35,
    make(buf) {
      noise(buf, 0, 0.35, 900, 1100, 0.6, bell, 1.3);
      noise(buf, 0, 0.35, 180, 200, 0.4, bell, 0.6); // the motor's hum
    },
  },
  // Clean and dry: sparkles and a happy chime.
  clean: {
    seconds: 1.2,
    make(buf) {
      [79, 84, 88, 91, 96].forEach((note, i) => ping(buf, i * 0.07, hz(note), 0.25, 0.25)); // G5 C6 E6 G6 C7
      for (let i = 0; i < 8; i++) ping(buf, between(0.1, 0.7), between(3500, 6000), between(0.03, 0.06), 0.06);
    },
  },

  // ---------- The garden ----------

  // Planting: a seed pressed in and the soil patted down twice.
  plant: {
    seconds: 0.55,
    make(buf) {
      crackle(buf, 0, 0.12, 10, 0.3, 2400);
      knock(buf, 0.16, 110, 0.8, 0.03, [1.8]);
      noise(buf, 0.16, 0.06, 600, 300, 0.3, hit(0.05, 0.3), 1.2);
      knock(buf, 0.32, 120, 0.6, 0.03, [1.8]);
      noise(buf, 0.32, 0.06, 600, 300, 0.22, hit(0.05, 0.3), 1.2);
    },
  },
  // Watering: water trickling out of the can onto the soil.
  water: {
    seconds: 0.9,
    make(buf) {
      noise(buf, 0, 0.85, 2200, 1500, 0.3, (k) => Math.min(1, k / 0.1) * Math.min(1, (1 - k) / 0.35), 0.9);
      for (let t = 0.03; t < 0.75; t += between(0.025, 0.06)) bubble(buf, t, between(900, 2200), 0.03, between(0.08, 0.2), 0.6);
    },
  },
  // A perfect pour: the same trickle, with a bright ping.
  'water-perfect': {
    seconds: 1.0,
    make(buf) {
      noise(buf, 0, 0.85, 2200, 1500, 0.3, (k) => Math.min(1, k / 0.1) * Math.min(1, (1 - k) / 0.35), 0.9);
      for (let t = 0.03; t < 0.75; t += between(0.025, 0.06)) bubble(buf, t, between(900, 2200), 0.03, between(0.08, 0.2), 0.6);
      ping(buf, 0.05, hz(88), 0.3, 0.12); // E6
      ping(buf, 0.13, hz(93), 0.3, 0.18); // A6
    },
  },
  // Fertilizer: a shake of the bag, granules pattering onto the soil.
  fertilize: {
    seconds: 0.7,
    make(buf) {
      noise(buf, 0, 0.15, 1200, 2000, 0.3, bell, 1.1);
      crackle(buf, 0.1, 0.5, 40, 0.35, 5000);
      crackle(buf, 0.12, 0.45, 15, 0.25, 2500);
    },
  },
  // The cure: two puffs of the spray bottle and a healing twinkle.
  cure: {
    seconds: 0.9,
    make(buf) {
      noise(buf, 0, 0.12, 6000, 5000, 0.5, hit(0.05, 0.4), 1.2);
      knock(buf, 0, 1800, 0.15, 0.01);
      noise(buf, 0.2, 0.12, 6000, 5000, 0.5, hit(0.05, 0.4), 1.2);
      knock(buf, 0.2, 1800, 0.15, 0.01);
      [81, 86, 89].forEach((note, i) => ping(buf, 0.38 + i * 0.07, hz(note), 0.2, 0.2)); // A5 D6 F6
    },
  },
  // Harvesting: a leafy rustle, then the crop pops out of the soil.
  harvest: {
    seconds: 0.6,
    make(buf) {
      noise(buf, 0, 0.18, 2500, 4000, 0.35, (k) => bell(k) * (0.6 + 0.4 * Math.sin(k * 40)), 0.7);
      crackle(buf, 0, 0.18, 8, 0.2, 3000);
      bubble(buf, 0.18, 260, 0.09, 0.8, 2.2); // the pop
      crackle(buf, 0.2, 0.15, 8, 0.2, 2000); // soil falling off
    },
  },
  // Clearing a dead plant: a dry rustle and the stalk pulled out.
  clear: {
    seconds: 0.6,
    make(buf) {
      noise(buf, 0, 0.35, 3000, 1800, 0.35, (k) => bell(k) * (0.5 + 0.5 * Math.sin(k * 55)), 0.6);
      crackle(buf, 0, 0.4, 25, 0.3, 3200);
      knock(buf, 0.36, 140, 0.4, 0.03);
    },
  },

  // ---------- Sniff and dig ----------

  // Sniffing: three quick little sniffs through the nose.
  sniff: {
    seconds: 0.5,
    make(buf) {
      [0, 0.12, 0.24].forEach((t, i) => noise(buf, t, 0.08, 1800 + i * 200, 2600 + i * 200, 0.6 - i * 0.08, hit(0.3, 0.4), 1.2));
    },
  },
  // Digging: the trowel crunches into the dirt and flicks it aside.
  dig: {
    seconds: 0.5,
    make(buf) {
      knock(buf, 0, 140, 0.7, 0.03, [2.1]);
      noise(buf, 0, 0.15, 1200, 500, 0.5, hit(0.03, 0.3), 1.3);
      crackle(buf, 0.01, 0.14, 16, 0.4, 2600);
      noise(buf, 0.2, 0.12, 1500, 2500, 0.25, bell, 1); // the flick
      crackle(buf, 0.26, 0.2, 10, 0.25, 3500); // dirt landing
    },
  },
  // Digging into a flooded square at the cove: a muddy splosh.
  'dig-splash': {
    seconds: 0.55,
    make(buf) {
      knock(buf, 0, 140, 0.5, 0.03, [2.1]);
      noise(buf, 0, 0.3, 2400, 600, 0.5, hit(0.02, 0.3), 1.1);
      bubble(buf, 0.01, 240, 0.16, 0.7, 1.4);
      bubble(buf, 0.12, 600, 0.06, 0.25);
    },
  },

  // ---------- The workbench ----------

  // A tap of the hammer on the bench.
  hammer: {
    seconds: 0.35,
    make(buf) {
      knock(buf, 0, 320, 0.9, 0.035, [2.4, 4.1]); // wood
      knock(buf, 0, 1900, 0.25, 0.06, [2.76, 5.4]); // the hammer's head
    },
  },
  // The piece is made: the last tap, then it pops up with a sparkle.
  crafted: {
    seconds: 1.1,
    make(buf) {
      knock(buf, 0, 320, 0.9, 0.035, [2.4, 4.1]);
      knock(buf, 0, 1900, 0.25, 0.06, [2.76, 5.4]);
      bubble(buf, 0.15, 400, 0.08, 0.5, 2);
      [79, 83, 86, 91].forEach((note, i) => ping(buf, 0.2 + i * 0.07, hz(note), 0.25, 0.25)); // G5 B5 D6 G6
    },
  },
  // Starting to build a project: a few strokes of the saw.
  build: {
    seconds: 1.0,
    make(buf) {
      for (let i = 0; i < 4; i++) noise(buf, i * 0.22, 0.2, i % 2 ? 2600 : 2000, i % 2 ? 2000 : 2600, 0.5, bell, 0.35);
      knock(buf, 0.9, 260, 0.4, 0.03, [2.4]);
    },
  },

  // ---------- Rewards ----------

  // Found something (on a dig, a trip, a lucky seed, a gift from Percy):
  // a cheerful little "ta-da".
  found: {
    seconds: 0.9,
    make(buf) {
      ping(buf, 0, hz(79), 0.3, 0.12); // G5
      ping(buf, 0.09, hz(84), 0.35, 0.3); // C6
      ping(buf, 0.09, hz(88), 0.15, 0.25); // E6
      for (let i = 0; i < 4; i++) ping(buf, between(0.15, 0.4), between(3500, 5500), 0.04, 0.05);
    },
  },
  // A badge or milestone: a bright little fanfare.
  badge: {
    seconds: 1.5,
    make(buf) {
      [[72, 0], [76, 0.1], [79, 0.2]].forEach(([note, t]) => chime(buf, t, hz(note), 0.3, 0.2)); // C5 E5 G5
      [84, 88, 91].forEach((note) => chime(buf, 0.36, hz(note), 0.22, 0.6)); // C6 E6 G6 together
      for (let i = 0; i < 6; i++) ping(buf, between(0.4, 0.9), between(3500, 6000), 0.05, 0.06);
    },
  },
  // A new Keeper level: a longer run up, all the way to the top.
  'level-up': {
    seconds: 1.6,
    make(buf) {
      [67, 72, 76, 79, 84, 88, 91, 96].forEach((note, i) => ping(buf, i * 0.06, hz(note), 0.24, 0.18)); // G4 up to C7
      [84, 91].forEach((note) => chime(buf, 0.5, hz(note), 0.2, 0.7));
      for (let i = 0; i < 8; i++) ping(buf, between(0.5, 1.1), between(3500, 6000), 0.04, 0.06);
    },
  },
  // Star fragments: glassy twinkles tumbling down.
  fragment: {
    seconds: 1.1,
    make(buf) {
      [100, 96, 93, 88, 91].forEach((note, i) => ping(buf, i * 0.07 + between(0, 0.02), hz(note), 0.25, 0.2)); // E7 C7 A6 E6 G6
      for (let i = 0; i < 5; i++) knock(buf, between(0, 0.35), between(3500, 4500), 0.08, 0.03, [2.76]);
    },
  },
  // Fragments locking together into a Revival Star: five glassy clicks.
  'star-lock': {
    seconds: 0.6,
    make(buf) {
      for (let i = 0; i < 5; i++) knock(buf, i * 0.06, 2400 + i * 180, 0.5, 0.04, [2.76, 5.4]);
      ping(buf, 0.3, hz(93), 0.25, 0.2); // A6
    },
  },
  // A Revival Star is made (or used): a rising shimmer and a warm chord.
  'star-made': {
    seconds: 2.0,
    make(buf) {
      noise(buf, 0, 0.6, 1500, 7000, 0.18, (k) => k ** 2, 0.4); // the rush up
      [69, 76, 81, 85, 88].forEach((note) => chime(buf, 0.55, hz(note), 0.2, 0.9)); // A major
      for (let i = 0; i < 12; i++) ping(buf, between(0.55, 1.4), between(3000, 6500), between(0.03, 0.06), 0.07);
    },
  },
  // The flash when a pet grows up: a magic whoosh and a bright chord.
  'grow-flash': {
    seconds: 1.8,
    make(buf) {
      noise(buf, 0, 0.5, 600, 5000, 0.25, (k) => k ** 2 * (1 - k * 0.3), 0.5);
      bubble(buf, 0.45, 300, 0.2, 0.5, 2.5);
      [72, 79, 84, 88, 91].forEach((note) => chime(buf, 0.48, hz(note), 0.2, 0.8)); // C major
      for (let i = 0; i < 10; i++) ping(buf, between(0.5, 1.2), between(3500, 6500), 0.04, 0.06);
    },
  },
  // Each star popping in under a grown-up's name.
  'star-pop': {
    seconds: 0.4,
    make(buf) {
      bubble(buf, 0, 700, 0.05, 0.4, 1.5);
      ping(buf, 0.01, hz(96), 0.3, 0.1); // C7
    },
  },
  // A little one on the way: two soft coos, a pet each.
  hearts: {
    seconds: 1.0,
    make(buf) {
      coo(buf, 0, 560, 760, 0.3, 0.4);
      coo(buf, 0.35, 700, 900, 0.3, 0.35);
      ping(buf, 0.65, hz(84), 0.2, 0.2); // C6
    },
  },
  // An egg hatching: the shell cracks, then a tiny first coo.
  hatch: {
    seconds: 1.2,
    make(buf) {
      [0, 0.18, 0.3].forEach((t, i) => {
        knock(buf, t, 1500 - i * 150, 0.4, 0.01, [2.2]);
        crackle(buf, t, 0.05, 6, 0.3, 4000);
      });
      noise(buf, 0.45, 0.1, 3000, 1500, 0.3, hit(0.05, 0.3)); // it breaks open
      crackle(buf, 0.45, 0.12, 10, 0.3, 3500);
      coo(buf, 0.65, 800, 1100, 0.25, 0.45);
    },
  },

  // ---------- Shop, Percy and visitors ----------

  // Paying: a few coins clinking down.
  coins: {
    seconds: 0.6,
    make(buf) {
      [0, 0.07, 0.12, 0.2].forEach((t, i) => knock(buf, t, 2900 + i * 230, 0.5 - i * 0.07, 0.05, [1.48, 2.76, 3.9]));
    },
  },
  // Every box of Percy's order full: coins and a sparkle.
  'gold-box': {
    seconds: 1.0,
    make(buf) {
      [0, 0.07, 0.12, 0.2].forEach((t, i) => knock(buf, t, 2900 + i * 230, 0.45 - i * 0.07, 0.05, [1.48, 2.76, 3.9]));
      [84, 88, 91, 96].forEach((note, i) => ping(buf, 0.25 + i * 0.06, hz(note), 0.25, 0.22)); // C6 E6 G6 C7
    },
  },
  // Percy's bicycle bell: ding ding (a new order, or a pickup).
  bell: {
    seconds: 1.0,
    make(buf) {
      chime(buf, 0, 2100, 0.5, 0.3);
      chime(buf, 0.16, 2100, 0.5, 0.45);
    },
  },
  // A visitor knocking at the door.
  knock: {
    seconds: 0.6,
    make(buf) {
      [0, 0.15, 0.3].forEach((t, i) => knock(buf, t, 170, 0.8 - i * 0.1, 0.035, [2.3, 3.6]));
    },
  },
  // A fortune cookie cracking open.
  cookie: {
    seconds: 0.5,
    make(buf) {
      knock(buf, 0, 900, 0.5, 0.012, [2.1]);
      noise(buf, 0, 0.08, 3500, 1800, 0.5, hit(0.03, 0.3), 0.8);
      crackle(buf, 0, 0.18, 18, 0.4, 3000);
      noise(buf, 0.2, 0.12, 4000, 5000, 0.15, bell, 0.6); // the paper slip
    },
  },
  // A gift: rustling paper and a ribbon popping off.
  gift: {
    seconds: 0.9,
    make(buf) {
      crackle(buf, 0, 0.3, 30, 0.3, 3200);
      noise(buf, 0, 0.3, 2500, 3500, 0.2, bell, 0.7);
      bubble(buf, 0.35, 500, 0.07, 0.5, 2);
      ping(buf, 0.42, hz(84), 0.25, 0.2); // C6
      ping(buf, 0.5, hz(91), 0.25, 0.3); // G6
    },
  },

  // ---------- Journeys ----------

  // Setting off: the bag goes on, a happy coo, then little hops away.
  // Timed to the send-off in src/render/moments.ts.
  'set-off': {
    seconds: 2.0,
    make(buf) {
      noise(buf, 0.22, 0.1, 1500, 900, 0.35, hit(0.05, 0.3), 1.2); // the bag
      knock(buf, 0.22, 400, 0.3, 0.02);
      coo(buf, 0.45, 600, 850, 0.3, 0.4);
      for (let i = 0; i < 6; i++) knock(buf, 1.0 + i * 0.15, 200 - i * 8, 0.6 * (1 - i * 0.13), 0.025, [2.2]);
    },
  },
  // Opening a backpack: the zip runs round.
  unzip: {
    seconds: 0.5,
    make(buf) {
      for (let t = 0, gap = 0.012; t < 0.36; t += gap, gap *= 0.985) {
        noise(buf, t, 0.005, 3000 + t * 3000, 3000, 0.35 + t, hit(0.1, 0.3), 0.6);
      }
      noise(buf, 0.38, 0.08, 1500, 900, 0.3, hit(0.05, 0.3), 1.2); // it flops open
    },
  },
  // Taking a snapshot: the camera's shutter.
  camera: {
    seconds: 0.35,
    make(buf) {
      noise(buf, 0, 0.02, 4500, 3000, 0.8, hit(0.05, 0.3), 0.6);
      knock(buf, 0, 1200, 0.3, 0.008);
      noise(buf, 0.07, 0.03, 3500, 2500, 0.6, hit(0.05, 0.3), 0.6);
      knock(buf, 0.07, 900, 0.25, 0.01);
    },
  },
  // Two more versions of the chomps, for the bites in between.
  'munch-2': {
    seconds: 0.6,
    make(buf) {
      chomps(buf, 202, [0.96, 1.08, 0.9]);
    },
  },
  'munch-3': {
    seconds: 0.6,
    make(buf) {
      chomps(buf, 303, [1.04, 0.95, 1.0]);
    },
  },
};

// ---------- Saving ----------

function wav(samples: Float32Array): Buffer {
  const n = samples.length;
  const out = Buffer.alloc(44 + n * 2);
  out.write('RIFF', 0);
  out.writeUInt32LE(36 + n * 2, 4);
  out.write('WAVEfmt ', 8);
  out.writeUInt32LE(16, 16);
  out.writeUInt16LE(1, 20); // plain PCM
  out.writeUInt16LE(1, 22); // mono
  out.writeUInt32LE(RATE, 24);
  out.writeUInt32LE(RATE * 2, 28);
  out.writeUInt16LE(2, 32);
  out.writeUInt16LE(16, 34);
  out.write('data', 36);
  out.writeUInt32LE(n * 2, 40);
  const clip = (x: number) => Math.max(-32768, Math.min(32767, Math.round(x * 32767)));
  for (let i = 0; i < n; i++) out.writeInt16LE(clip(samples[i]), 44 + i * 2);
  return out;
}

mkdirSync(OUT, { recursive: true });
for (const [name, { seconds, make }] of Object.entries(RECIPES)) {
  const buf = new Float32Array(Math.round(seconds * RATE));
  make(buf);
  // Every sound peaks at the same level (src/audio/audio.ts sets how loud
  // each one plays), and fades out over its last few milliseconds so it
  // never ends on a click.
  const peak = buf.reduce((m, x) => Math.max(m, Math.abs(x)), 0);
  const fade = Math.round(0.01 * RATE);
  for (let i = 0; i < buf.length; i++) buf[i] *= (0.9 / peak) * Math.min(1, (buf.length - i) / fade);
  const wavPath = join(OUT, `${name}.wav`);
  writeFileSync(wavPath, wav(buf));
  execFileSync('ffmpeg', ['-y', '-loglevel', 'error', '-i', wavPath, '-codec:a', 'libmp3lame', '-b:a', '64k', join(OUT, `${name}.mp3`)]);
  rmSync(wavPath);
  console.log(`${name}.mp3`);
}
