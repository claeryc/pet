// Sound effects. For now only the fishing mini-game has them. The game just
// says what happened, sound('bite'), and this file does the rest.
//
// The files live in public/audio/sfx/ (see public/audio/CREDITS.md for where
// they came from). To swap a sound, drop in a new MP3 with the same name, or
// point an entry below at a different file.
//
// Browsers keep a page silent until the player first taps it, so nothing
// plays before that. Leaving the app pauses everything.

import { loadAudioSettings, saveAudioSettings, type AudioSettings } from '../storage/storage';

// Each sound effect: its file in public/audio/sfx/ and how loud it plays
// (0 to 1).
const SOUNDS = {
  // Made by scripts/make-sfx.ts
  cast: { file: 'fish-cast', volume: 0.5 }, // the line whooshes out, the bait plops in
  nibble: { file: 'fish-nibble', volume: 0.3 }, // only a nibble: a small bloop
  bite: { file: 'fish-bite', volume: 0.65 }, // a fish is biting: splash and a ping
  reel: { file: 'fish-reel', volume: 0.22 }, // one ratchet tick, over and over while you pull
  splash: { file: 'fish-splash', volume: 0.6 }, // a fish leaps out of the water
  perfect: { file: 'fish-perfect', volume: 0.5 },
  escape: { file: 'fish-escape', volume: 0.5 }, // the fish swims off
  pondIn: { file: 'pond-fill', volume: 0.4 },
  pondOut: { file: 'pond-drain', volume: 0.35 },
} as const;
export type SoundId = keyof typeof SOUNDS;

let settings: AudioSettings = loadAudioSettings();
let ctx: AudioContext | null = null;
let sfxBus: GainNode;
const buffers = new Map<string, Promise<AudioBuffer | null>>();
const lastPlayed = new Map<SoundId, number>();

// Made on the first tap, when the browser allows sound.
function context(): AudioContext | null {
  if (ctx || typeof AudioContext === 'undefined') return ctx;
  ctx = new AudioContext();
  sfxBus = ctx.createGain();
  sfxBus.gain.value = settings.sounds ? 1 : 0;
  sfxBus.connect(ctx.destination);
  return ctx;
}

function load(path: string): Promise<AudioBuffer | null> {
  let buffer = buffers.get(path);
  if (!buffer) {
    buffer = fetch(`${import.meta.env.BASE_URL}audio/${path}.mp3`)
      .then((r) => r.arrayBuffer())
      .then((data) => ctx!.decodeAudioData(data))
      .catch((err) => {
        console.warn(`Could not load audio/${path}.mp3:`, err);
        return null;
      });
    buffers.set(path, buffer);
  }
  return buffer;
}

export function sound(id: SoundId): void {
  if (!settings.sounds || !ctx || ctx.state !== 'running') return;
  // The same sound twice at once just sounds louder, so skip the second.
  const now = performance.now();
  if (now - (lastPlayed.get(id) ?? -Infinity) < 80) return;
  lastPlayed.set(id, now);
  const { file, volume } = SOUNDS[id];
  load(`sfx/${file}`).then((buffer) => {
    if (!buffer || !ctx) return;
    const source = ctx.createBufferSource();
    const gain = ctx.createGain();
    source.buffer = buffer;
    gain.gain.value = volume;
    source.connect(gain).connect(sfxBus);
    source.start();
  });
}

export function audioSettings(): AudioSettings {
  return settings;
}

export function setAudioSettings(next: AudioSettings): void {
  settings = next;
  saveAudioSettings(settings);
  if (!ctx) return;
  sfxBus.gain.setTargetAtTime(settings.sounds ? 1 : 0, ctx.currentTime, 0.05);
}

// Called once at startup: waits for the first tap to switch sound on, and
// pauses while the app is out of sight.
export function startAudio(): void {
  const unlock = () => {
    const c = context();
    if (!c) return;
    c.resume();
  };
  document.addEventListener('pointerdown', unlock, { capture: true });
  document.addEventListener('keydown', unlock, { capture: true });
  document.addEventListener('visibilitychange', () => {
    if (!ctx) return;
    if (document.visibilityState === 'hidden') ctx.suspend();
    else ctx.resume();
  });
}
