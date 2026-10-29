// Makes the game's background music: one cosy, gently swinging loop
// written for this game, so there's nothing to license or credit. The song
// is a list of chords and notes below, played by a few tiny made-up
// instruments (soft electric piano, kalimba, a plucked guitar, a round
// bass and brushed drums) and saved as an MP3 that loops without a gap.
//
//   npm run music
//
// Needs Node.js 22.18 or newer and ffmpeg (https://ffmpeg.org) to turn the
// sound into MP3. Change the notes or tempo below and run it again to make
// a new version. The file goes to public/audio/music/, and
// src/audio/audio.ts lists it along with how long the loop is (this script
// prints it).

import { execFileSync } from 'node:child_process';
import { mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const RATE = 44100;
const OUT = join(dirname(fileURLToPath(import.meta.url)), '..', 'public', 'audio', 'music');

// A little seeded random, so every run makes the same file.
let seed = 5;
const rand = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
const between = (a: number, b: number) => a + rand() * (b - a);

// ---------- The song ----------

// MIDI note numbers: 60 is middle C, each step is a semitone.
const hz = (midi: number) => 440 * 2 ** ((midi - 69) / 12);
const G4 = 67, A4 = 69, Bb4 = 70, C5 = 72, D5 = 74, E5 = 76, F5 = 77, Fs5 = 78, G5 = 79, A5 = 81, Bb5 = 82;

// Each chord: the bass note, and the notes the piano holds.
const CHORDS: Record<string, { root: number; keys: number[] }> = {
  Fmaj7: { root: 41, keys: [57, 60, 64] },
  Dm7: { root: 38, keys: [57, 60, 65] },
  Gm7: { root: 43, keys: [58, 62, 65] },
  C7: { root: 36, keys: [58, 64, 67] },
  Am7: { root: 45, keys: [55, 60, 64] },
  D7: { root: 38, keys: [54, 57, 60] },
  Bbmaj7: { root: 46, keys: [57, 62, 65] },
};

const BPM = 90;
// Off-beat eighth notes land a little late, which gives the tune its easy
// swing (0 would be straight).
const SWING = 0.08;

// One entry per bar of four beats: its chord (or two, a half bar each),
// and the tune as [beat within the bar, length in beats, note].
type Bar = { chords: string[]; tune: [number, number, number][] };
const SONG: Bar[] = [
  // A: a stroll round the room.
  { chords: ['Fmaj7'], tune: [[0, 1.5, C5], [1.5, 0.5, A4], [2, 1, C5], [3, 1, D5]] },
  { chords: ['Dm7'], tune: [[0, 2, F5], [2, 1, E5], [3, 1, D5]] },
  { chords: ['Gm7'], tune: [[0, 1.5, D5], [1.5, 0.5, Bb4], [2, 2, G4]] },
  { chords: ['C7'], tune: [[0, 1, A4], [1, 1, Bb4], [2, 1, C5], [3, 1, E5]] },
  { chords: ['Fmaj7'], tune: [[0, 1.5, F5], [1.5, 0.5, E5], [2, 1, C5], [3, 1, A4]] },
  { chords: ['Am7'], tune: [[0, 1, G4], [1, 1, A4], [2, 2, E5]] },
  { chords: ['Bbmaj7'], tune: [[0, 1, D5], [1, 1, C5], [2, 1, D5], [3, 1, F5]] },
  { chords: ['C7'], tune: [[0, 2, E5], [2, 1, D5], [3, 1, C5]] },
  // A again, climbing higher this time.
  { chords: ['Fmaj7'], tune: [[0, 1.5, C5], [1.5, 0.5, A4], [2, 1, C5], [3, 1, D5]] },
  { chords: ['Dm7'], tune: [[0, 2, F5], [2, 1, G5], [3, 1, A5]] },
  { chords: ['Gm7'], tune: [[0, 1.5, G5], [1.5, 0.5, F5], [2, 1, D5], [3, 1, Bb4]] },
  { chords: ['C7'], tune: [[0, 2, C5], [2, 2, E5]] },
  { chords: ['Am7'], tune: [[0, 1.5, E5], [1.5, 0.5, D5], [2, 1, C5], [3, 1, E5]] },
  { chords: ['D7'], tune: [[0, 2, Fs5], [2, 1, D5], [3, 1, A4]] },
  { chords: ['Gm7', 'C7'], tune: [[0, 1, Bb4], [1, 1, D5], [2, 1, G5], [3, 1, E5]] },
  { chords: ['Fmaj7'], tune: [[0, 3, F5]] },
  // B: a bouncier middle, the tune answering itself.
  { chords: ['Bbmaj7'], tune: [[0, 1, F5], [1, 0.5, D5], [1.5, 0.5, F5], [2, 2, A5]] },
  { chords: ['Am7'], tune: [[0, 1, G5], [1, 0.5, E5], [1.5, 0.5, G5], [2, 2, E5]] },
  { chords: ['Gm7'], tune: [[0, 1, F5], [1, 0.5, D5], [1.5, 0.5, F5], [2, 1, Bb5], [3, 1, A5]] },
  { chords: ['Fmaj7'], tune: [[0, 2, A5], [2, 2, E5]] },
  { chords: ['Bbmaj7'], tune: [[0, 1, D5], [1, 1, F5], [2, 1, A5], [3, 1, G5]] },
  { chords: ['Am7', 'D7'], tune: [[0, 1, E5], [1, 1, C5], [2, 1, Fs5], [3, 1, A5]] },
  { chords: ['Gm7'], tune: [[0, 1.5, G5], [1.5, 0.5, F5], [2, 1, D5], [3, 1, Bb4]] },
  // ...and back round to the start.
  { chords: ['C7'], tune: [[0, 2, C5], [2, 0.5, D5], [2.5, 0.5, E5], [3, 1, G5]] },
];

// ---------- Instruments ----------

// Adds `sample(t)` into both channels from `start` for `length` seconds,
// `pan` from -1 (left) to 1 (right).
function add(L: Float32Array, R: Float32Array, start: number, length: number, pan: number, sample: (t: number) => number): void {
  const from = Math.round(start * RATE);
  const n = Math.min(Math.round(length * RATE), L.length - from);
  const l = Math.cos(((pan + 1) * Math.PI) / 4);
  const r = Math.sin(((pan + 1) * Math.PI) / 4);
  for (let i = 0; i < n; i++) {
    const x = sample(i / RATE);
    L[from + i] += x * l;
    R[from + i] += x * r;
  }
}

// How a held note fades: swells in over `attack`, dies away slowly, and
// lets go over `release` once its `length` is up.
const envelope = (t: number, length: number, attack: number, decay: number, release: number) =>
  Math.min(1, t / attack) * Math.exp(-t / decay) * Math.min(1, Math.max(0, (length + release - t) / release));

// A soft electric piano: a sine bent by another sine, which gives it that
// warm "bell in a pillow" tone, with a slow wobble.
function keys(L: Float32Array, R: Float32Array, at: number, length: number, midi: number, gain: number): void {
  const f = hz(midi);
  add(L, R, at, length + 0.4, -0.35, (t) => {
    const bend = 1.4 * Math.exp(-t / 0.25);
    const wobble = 1 + 0.12 * Math.sin(2 * Math.PI * 4.2 * t);
    return gain * wobble * envelope(t, length, 0.006, 1.6, 0.4)
      * Math.sin(2 * Math.PI * f * t + bend * Math.sin(2 * Math.PI * f * t));
  });
}

// A kalimba for the tune: a round tine with a little metallic click as
// it's plucked.
function kalimba(L: Float32Array, R: Float32Array, at: number, length: number, midi: number, gain: number): void {
  const f = hz(midi);
  add(L, R, at, Math.max(length, 0.5) + 1.2, 0.05, (t) => {
    const ring = Math.min(1, t / 0.002) * Math.min(1, Math.max(0, (Math.max(length, 0.5) + 1.2 - t) / 0.3));
    return gain * ring * (
      Math.sin(2 * Math.PI * f * t) * Math.exp(-t / 0.65)
      + 0.3 * Math.sin(2 * Math.PI * 2 * f * t) * Math.exp(-t / 0.2)
      + 0.12 * Math.sin(2 * Math.PI * 5.95 * f * t) * Math.exp(-t / 0.03)
    );
  });
}

// A plucked nylon string (a little burst of noise ringing round a delay
// line that matches the note: the Karplus-Strong trick).
function guitar(L: Float32Array, R: Float32Array, at: number, midi: number, gain: number): void {
  const period = RATE / hz(midi);
  const size = Math.round(period);
  const line = new Float32Array(size);
  let soft = 0;
  for (let i = 0; i < size; i++) line[i] = soft = 0.85 * soft + 0.45 * (rand() * 2 - 1); // a soft thumb, not a pick
  let i = 0;
  add(L, R, at, 1.4, 0.45, (t) => {
    const j = i % size;
    const next = line[(i + 1) % size];
    const x = line[j];
    line[j] = 0.993 * 0.5 * (x + next);
    i++;
    return gain * x * Math.min(1, (1.4 - t) / 0.2);
  });
}

// A round bass, with a bit of its octave so it still shows on phone
// speakers.
function bass(L: Float32Array, R: Float32Array, at: number, length: number, midi: number, gain: number): void {
  const f = hz(midi);
  add(L, R, at, length + 0.15, 0, (t) => {
    const p = 2 * Math.PI * f * t;
    return gain * envelope(t, length, 0.008, 0.9, 0.12) * Math.tanh(1.5 * (Math.sin(p) + 0.35 * Math.sin(2 * p)));
  });
}

// Noise through a band-pass filter (for the brushes and shaker).
function hiss(L: Float32Array, R: Float32Array, at: number, length: number, f: number, pan: number, gain: number, env: (t: number) => number): void {
  let low = 0;
  let band = 0;
  const g = 2 * Math.sin((Math.PI * Math.min(f, RATE / 6)) / RATE);
  add(L, R, at, length, pan, (t) => {
    const high = rand() * 2 - 1 - low - 0.9 * band;
    band += g * high;
    low += g * band;
    return gain * env(t) * band;
  });
}

// A soft kick: a low thump that drops in pitch.
function kick(L: Float32Array, R: Float32Array, at: number, gain: number): void {
  let phase = 0;
  add(L, R, at, 0.4, 0, (t) => {
    phase += (2 * Math.PI * (48 + 70 * Math.exp(-t / 0.03))) / RATE;
    return gain * Math.min(1, t / 0.003) * Math.exp(-t / 0.13) * Math.sin(phase);
  });
}

// ---------- A small room reverb (a few echoing delay lines) ----------

// The reverb runs over the loop twice and keeps the second time round, so
// the echoes from the end are already there at the start.
function comb(input: Float32Array, delay: number, feedback: number): Float32Array {
  const n = input.length;
  const out = new Float32Array(n);
  let damp = 0;
  for (let pass = 0; pass < 2; pass++) {
    for (let i = 0; i < n; i++) {
      const back = out[(i - delay + n) % n];
      damp = back * 0.55 + damp * 0.45; // softens each echo a little
      out[i] = input[i] + damp * feedback;
    }
  }
  return out;
}

function allpass(input: Float32Array, delay: number): Float32Array {
  const n = input.length;
  const out = new Float32Array(n);
  const buf = new Float32Array(n);
  for (let pass = 0; pass < 2; pass++) {
    for (let i = 0; i < n; i++) {
      const back = buf[(i - delay + n) % n];
      buf[i] = input[i] + back * 0.5;
      out[i] = back - input[i] * 0.5;
    }
  }
  return out;
}

function reverb(dry: Float32Array, spread: number): Float32Array {
  const wet = new Float32Array(dry.length);
  for (const d of [1557, 1617, 1491, 1422]) {
    const c = comb(dry, d + spread, 0.8);
    for (let i = 0; i < wet.length; i++) wet[i] += c[i] / 4;
  }
  return allpass(allpass(wet, 556 + spread), 341 + spread);
}

// ---------- Putting it together ----------

function render(): { left: Float32Array; right: Float32Array; seconds: number } {
  const beat = 60 / BPM;
  const bar = 4 * beat;
  const seconds = SONG.length * bar;
  const tail = 4; // room for notes to ring past the end
  const L = new Float32Array(Math.ceil((seconds + tail) * RATE));
  const R = new Float32Array(L.length);
  // Where a beat in a bar lands, with the swing (and a touch of wobble,
  // like someone playing it).
  const when = (barAt: number, b: number, loose = 0.006) =>
    barAt + (b + (b % 1 === 0.5 ? SWING : 0)) * beat + between(0, loose);

  SONG.forEach(({ chords, tune }, n) => {
    const at = n * bar;
    const section = n < 8 ? 'A' : n < 16 ? 'A2' : 'B';
    const half = 4 / chords.length;
    chords.forEach((name, c) => {
      const { root, keys: notes } = CHORDS[name];
      const from = c * half;
      // Piano: the chord on the beat, then again just before the next one,
      // a little quieter.
      for (const note of notes) {
        keys(L, R, when(at, from, 0.012), half * beat * 0.7, note, 0.05);
        if (half === 4) keys(L, R, when(at, 2.5, 0.012), 1.3 * beat, note, 0.032);
      }
      // Bass: the root, then the fifth, with a step up to the next bar.
      bass(L, R, when(at, from), (half === 4 ? 1.4 : 1.2) * beat, root, 0.26);
      if (half === 4) {
        bass(L, R, when(at, 2), 1.3 * beat, root + 7, 0.2);
        bass(L, R, when(at, 3.5), 0.4 * beat, root + 12, 0.14);
      }
      // Guitar: the chord rolled out in eighth notes, once the tune has
      // gone round once.
      if (section !== 'A') {
        const tones = [notes[0], notes[1], notes[2], notes[1] + 12, notes[2], notes[1], notes[0] + 12, notes[2]];
        for (let e = 0; e < half * 2; e++) guitar(L, R, when(at, from + e / 2), tones[e % tones.length] - 12, e % 2 ? 0.05 : 0.07);
      }
    });
    // The tune on the kalimba; in the middle it's doubled an octave up,
    // very quietly, to sparkle.
    for (const [b, len, note] of tune) {
      kalimba(L, R, when(at, b, 0.01), len * beat, note, 0.2 + between(0, 0.03));
      if (section === 'B') kalimba(L, R, when(at, b, 0.01), len * beat, note + 12, 0.045);
    }
    // Drums: the shaker on every swung eighth, a brush on 2 and 4, and a
    // soft kick on 1 and the "and" of 2 (from the second time round).
    for (let e = 0; e < 8; e++) {
      hiss(L, R, when(at, e / 2, 0.004), 0.08, 7500, 0.5, e % 2 ? 0.05 : 0.03, (t) => Math.min(1, t / 0.012) * Math.exp(-t / 0.025));
    }
    for (const b of [1, 3]) {
      hiss(L, R, when(at, b, 0.004), 0.3, 3000, -0.2, 0.09, (t) => Math.min(1, t / 0.004) * Math.exp(-t / 0.07));
    }
    if (section !== 'A') for (const b of [0, 1.5, 2]) kick(L, R, when(at, b, 0.003), b === 0 ? 0.32 : 0.2);
  });

  // Fold the ringing tail back onto the start, so the end flows straight
  // into the beginning when it loops.
  const n = Math.round(seconds * RATE);
  const dryL = L.slice(0, n);
  const dryR = R.slice(0, n);
  for (let i = n; i < L.length; i++) {
    dryL[i - n] += L[i];
    dryR[i - n] += R[i];
  }
  const wetL = reverb(dryL, 0);
  const wetR = reverb(dryR, 23);
  const left = new Float32Array(n);
  const right = new Float32Array(n);
  for (let i = 0; i < n; i++) {
    left[i] = dryL[i] * 0.8 + wetL[i] * 0.3;
    right[i] = dryR[i] * 0.8 + wetR[i] * 0.3;
  }
  let peak = 0;
  for (let i = 0; i < n; i++) peak = Math.max(peak, Math.abs(left[i]), Math.abs(right[i]));
  const scale = 0.8 / peak;
  return { left: left.map((x) => x * scale), right: right.map((x) => x * scale), seconds };
}

function wav(left: Float32Array, right: Float32Array): Buffer {
  const n = left.length;
  const out = Buffer.alloc(44 + n * 4);
  out.write('RIFF', 0);
  out.writeUInt32LE(36 + n * 4, 4);
  out.write('WAVEfmt ', 8);
  out.writeUInt32LE(16, 16);
  out.writeUInt16LE(1, 20); // plain PCM
  out.writeUInt16LE(2, 22); // stereo
  out.writeUInt32LE(RATE, 24);
  out.writeUInt32LE(RATE * 4, 28);
  out.writeUInt16LE(4, 32);
  out.writeUInt16LE(16, 34);
  out.write('data', 36);
  out.writeUInt32LE(n * 4, 40);
  const clip = (x: number) => Math.max(-32768, Math.min(32767, Math.round(x * 32767)));
  for (let i = 0; i < n; i++) {
    out.writeInt16LE(clip(left[i]), 44 + i * 4);
    out.writeInt16LE(clip(right[i]), 46 + i * 4);
  }
  return out;
}

mkdirSync(OUT, { recursive: true });
const { left, right, seconds } = render();
const wavPath = join(OUT, 'theme.wav');
writeFileSync(wavPath, wav(left, right));
execFileSync('ffmpeg', ['-y', '-loglevel', 'error', '-i', wavPath, '-codec:a', 'libmp3lame', '-b:a', '112k', join(OUT, 'theme.mp3')]);
rmSync(wavPath);
console.log(`theme.mp3: a ${seconds.toFixed(3)} second loop`);
