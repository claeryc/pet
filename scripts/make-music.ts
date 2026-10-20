// Makes the game's background music: soft music-box loops written for this
// game, so there's nothing to license. Each song is a list of notes below,
// played by a few tiny made-up instruments and saved as an MP3 that loops
// without a gap.
//
//   npm run music
//
// Needs Node.js 22.18 or newer and ffmpeg (https://ffmpeg.org) to turn the
// sound into MP3. Change the notes or tempo below and run it again to make
// new versions. Files go to public/audio/music/, and src/audio/audio.ts
// lists them along with how long each loop is.

import { execFileSync } from 'node:child_process';
import { mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const RATE = 44100;
const OUT = join(dirname(fileURLToPath(import.meta.url)), '..', 'public', 'audio', 'music');

// ---------- Notes ----------

// MIDI note numbers: 60 is middle C, each step is a semitone.
const hz = (midi: number) => 440 * 2 ** ((midi - 69) / 12);
const D3 = 50, F3 = 53, G3 = 55, A3 = 57, Bb3 = 58, C4 = 60, D4 = 62, E4 = 64, F4 = 65, G4 = 67, A4 = 69, Bb4 = 70;
const C5 = 72, D5 = 74, E5 = 76, F5 = 77, G5 = 79;

const CHORDS: Record<string, number[]> = {
  F: [F3, A3, C4], Dm: [D3, F3, A3], Bb: [Bb3, D4, F4], C: [G3, C4, E4],
  Am: [A3, C4, E4], Gm: [G3, Bb3, D4],
};
// The bass plays each chord's root an octave below.
const ROOT: Record<string, number> = { F: F3 - 12, Dm: D3 - 12, Bb: Bb3 - 12, C: C4 - 24, Am: A3 - 12, Gm: G3 - 12 };

interface Song {
  name: string;
  bpm: number;
  chords: string[]; // one chord per bar of four beats
  // [beat within the bar, length in beats, note], one list per bar
  melody: [number, number, number][][];
  arpeggio: boolean; // a quiet run of eighth notes under the tune
  melodyUp: number; // semitones to shift the tune by
}

// Daytime: a gentle walk around the room.
const DAY: Song = {
  name: 'day',
  bpm: 80,
  arpeggio: true,
  melodyUp: 0,
  chords: ['F', 'Dm', 'Bb', 'C', 'F', 'Am', 'Bb', 'C', 'Dm', 'Bb', 'F', 'C', 'Bb', 'C', 'F', 'F'],
  melody: [
    [[0, 1, C5], [1, 1, A4], [2, 1, C5], [3, 1, F5]],
    [[0, 1.5, E5], [1.5, 0.5, D5], [2, 2, A4]],
    [[0, 1, D5], [1, 1, C5], [2, 1, Bb4], [3, 1, D5]],
    [[0, 3, C5], [3, 1, G4]],
    [[0, 1, A4], [1, 1, C5], [2, 1, F5], [3, 1, E5]],
    [[0, 1, E5], [1, 1, C5], [2, 2, A4]],
    [[0, 1, Bb4], [1, 1, D5], [2, 1, F5], [3, 1, D5]],
    [[0, 2, E5], [2, 1, G5], [3, 1, E5]],
    [[0, 1.5, F5], [1.5, 0.5, E5], [2, 1, D5], [3, 1, A4]],
    [[0, 1, D5], [1, 1, F5], [2, 2, D5]],
    [[0, 1, C5], [1, 1, A4], [2, 1, C5], [3, 1, A4]],
    [[0, 1, G4], [1, 1, C5], [2, 2, E5]],
    [[0, 1, D5], [1, 1, Bb4], [2, 1, F4], [3, 1, Bb4]],
    [[0, 1, C5], [1, 1, E5], [2, 2, G5]],
    [[0, 2, F5], [2, 2, C5]],
    [[0, 4, A4]],
  ],
};

// Night: slower and sparser, for when the lights are off.
const NIGHT: Song = {
  name: 'night',
  bpm: 60,
  arpeggio: false,
  melodyUp: 12,
  chords: ['Bb', 'F', 'Gm', 'C', 'Bb', 'F', 'Dm', 'C'],
  melody: [
    [[0, 2, D5], [2, 2, C5]],
    [[0, 4, A4]],
    [[0, 2, Bb4], [2, 1, D5], [3, 1, C5]],
    [[0, 4, G4]],
    [[0, 2, F5], [2, 2, D5]],
    [[0, 3, C5], [3, 1, A4]],
    [[0, 2, D5], [2, 2, F5]],
    [[0, 4, E5]],
  ],
};

// ---------- Instruments ----------

// A little seeded random, so every run makes the same file.
let seed = 7;
const rand = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);

function add(buf: Float32Array, start: number, length: number, sample: (t: number) => number): void {
  const from = Math.round(start * RATE);
  const n = Math.min(Math.round(length * RATE), buf.length - from);
  for (let i = 0; i < n; i++) buf[from + i] += sample(i / RATE);
}

// A music box: a bright ping that fades, with a faint bell-like overtone.
function musicBox(buf: Float32Array, at: number, midi: number, gain: number): void {
  const f = hz(midi);
  add(buf, at, 3, (t) => {
    const attack = Math.min(1, t / 0.004);
    return gain * attack * (
      Math.sin(2 * Math.PI * f * t) * Math.exp(-t / 0.9)
      + 0.25 * Math.sin(2 * Math.PI * 2 * f * t) * Math.exp(-t / 0.35)
      + 0.08 * Math.sin(2 * Math.PI * 4.02 * f * t) * Math.exp(-t / 0.12)
    );
  });
}

// A soft pad holding the chord, fading in and out so chords blend.
function pad(buf: Float32Array, at: number, length: number, midi: number, gain: number): void {
  const f = hz(midi);
  const fade = 0.7;
  add(buf, at, length + fade, (t) => {
    const env = Math.min(1, t / fade) * Math.min(1, Math.max(0, (length + fade - t) / fade));
    const wobble = 1 + 0.002 * Math.sin(2 * Math.PI * 4.5 * t);
    const p = 2 * Math.PI * f * wobble * t;
    return gain * env * (Math.sin(p) + 0.2 * Math.sin(2 * p) + 0.05 * Math.sin(3 * p));
  });
}

// A round, plucked bass note.
function bass(buf: Float32Array, at: number, midi: number, gain: number): void {
  const f = hz(midi);
  add(buf, at, 2.5, (t) => {
    const attack = Math.min(1, t / 0.01);
    const p = 2 * Math.PI * f * t;
    return gain * attack * Math.exp(-t / 0.8) * (Math.sin(p) + 0.15 * Math.sin(2 * p));
  });
}

// A kalimba-like pluck for the quiet eighth notes.
function pluck(buf: Float32Array, at: number, midi: number, gain: number): void {
  const f = hz(midi);
  add(buf, at, 1, (t) => {
    const attack = Math.min(1, t / 0.003);
    return gain * attack * Math.exp(-t / 0.22) * (Math.sin(2 * Math.PI * f * t) + 0.15 * Math.sin(2 * Math.PI * 3 * f * t));
  });
}

// ---------- A small room reverb (a few echoing delay lines) ----------

function comb(input: Float32Array, delay: number, feedback: number): Float32Array {
  const out = new Float32Array(input.length);
  let damp = 0;
  for (let i = 0; i < input.length; i++) {
    const back = i >= delay ? out[i - delay] : 0;
    damp = back * 0.6 + damp * 0.4; // softens each echo a little
    out[i] = input[i] + damp * feedback;
  }
  return out;
}

function allpass(input: Float32Array, delay: number): Float32Array {
  const out = new Float32Array(input.length);
  const buf = new Float32Array(input.length);
  for (let i = 0; i < input.length; i++) {
    const back = i >= delay ? buf[i - delay] : 0;
    buf[i] = input[i] + back * 0.5;
    out[i] = back - input[i] * 0.5;
  }
  return out;
}

function reverb(dry: Float32Array, spread: number): Float32Array {
  const wet = new Float32Array(dry.length);
  for (const d of [1557, 1617, 1491, 1422]) {
    const c = comb(dry, d + spread, 0.82);
    for (let i = 0; i < wet.length; i++) wet[i] += c[i] / 4;
  }
  return allpass(allpass(wet, 556 + spread), 341 + spread);
}

// ---------- Putting a song together ----------

function render(song: Song): { left: Float32Array; right: Float32Array; seconds: number } {
  const beat = 60 / song.bpm;
  const seconds = song.chords.length * 4 * beat;
  const tail = 5; // room for notes and echoes to ring past the end
  const dry = new Float32Array(Math.ceil((seconds + tail) * RATE));
  const bar = 4 * beat;
  song.chords.forEach((name, i) => {
    const at = i * bar;
    for (const n of CHORDS[name]) pad(dry, at, bar, n, 0.06);
    bass(dry, at, ROOT[name], 0.22);
    bass(dry, at + 2 * beat, ROOT[name] + (song.arpeggio ? 7 : 0), 0.14);
    if (song.arpeggio) {
      const tones = [...CHORDS[name], CHORDS[name][1] + 12, CHORDS[name][0] + 12];
      const order = [0, 1, 2, 3, 4, 3, 2, 1];
      order.forEach((k, j) => pluck(dry, at + j * beat / 2, tones[k], j % 2 ? 0.035 : 0.05));
    }
    for (const [b, , note] of song.melody[i]) {
      // A touch of timing and loudness wobble, like someone playing it.
      musicBox(dry, at + b * beat + rand() * 0.012, note + song.melodyUp, 0.16 + rand() * 0.03);
    }
  });
  const left = reverb(dry, 0);
  const right = reverb(dry, 23);
  for (let i = 0; i < dry.length; i++) {
    left[i] = dry[i] * 0.75 + left[i] * 0.35;
    right[i] = dry[i] * 0.75 + right[i] * 0.35;
  }
  // Fold the ringing tail back onto the start, so the end flows straight
  // into the beginning when it loops.
  const n = Math.round(seconds * RATE);
  for (let i = n; i < dry.length; i++) {
    left[i - n] += left[i];
    right[i - n] += right[i];
  }
  let peak = 0;
  for (let i = 0; i < n; i++) peak = Math.max(peak, Math.abs(left[i]), Math.abs(right[i]));
  const scale = 0.7 / peak;
  return { left: left.subarray(0, n).map((x) => x * scale), right: right.subarray(0, n).map((x) => x * scale), seconds };
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
for (const song of [DAY, NIGHT]) {
  const { left, right, seconds } = render(song);
  const wavPath = join(OUT, `${song.name}.wav`);
  writeFileSync(wavPath, wav(left, right));
  execFileSync('ffmpeg', ['-y', '-loglevel', 'error', '-i', wavPath, '-codec:a', 'libmp3lame', '-b:a', '112k', join(OUT, `${song.name}.mp3`)]);
  rmSync(wavPath);
  console.log(`${song.name}.mp3: a ${seconds.toFixed(3)} second loop`);
}
