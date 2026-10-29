// Makes the game's sound effects: the fishing mini-game's watery plops,
// splashes and reel clicks, and the kitchen's chops, plops and bubbling
// pot. All made from scratch for this game, so there's nothing to license
// or credit. Each sound is a short recipe below, built from a few
// ingredients: bubbles (a quick sine whose pitch slides up, which is what a
// real bubble popping sounds like), filtered noise (for splashes, sizzles
// and whooshes), knocks (wood and pots being hit) and pings.
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
