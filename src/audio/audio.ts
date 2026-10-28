// Music and sound effects. The rest of the game just says what happened,
// sound('purchase') or music('night'), and this file does the rest.
//
// The files live in public/audio/ (see public/audio/CREDITS.md for where
// each one came from and its licence). To swap a sound, drop in a new MP3
// with the same name, or point an entry below at a different file.
//
// Browsers keep a page silent until the player first taps it, so nothing
// plays before that; music starts with the first tap. Leaving the app
// pauses everything.

import { loadAudioSettings, saveAudioSettings, type AudioSettings } from '../storage/storage';

// Each sound effect: its file in public/audio/sfx/ and how loud it plays
// (0 to 1).
const SOUNDS = {
  open: { file: 'open', volume: 0.5 }, // a Feed, Play or menu panel opens
  close: { file: 'close', volume: 0.45 },
  eat: { file: 'receive', volume: 0.6 }, // food handed to the pet
  cuddle: { file: 'reaction', volume: 0.55 }, // playing, a cuddle, meeting a friend
  gold: { file: 'reward', volume: 0.6 }, // coins fly to the gold counter
  purchase: { file: 'purchase', volume: 0.6 },
  blocked: { file: 'blocked', volume: 0.5 }, // "can't do that" messages
  got: { file: 'bonus', volume: 0.65 }, // something new to show off: a catch, a harvest, a dish
  levelUp: { file: 'level-up', volume: 0.7 },
  badge: { file: 'badge', volume: 0.65 },
  unlock: { file: 'unlock', volume: 0.6 }, // a new feature opened up, a skill learned
  grewUp: { file: 'achievement', volume: 0.75 },
  mail: { file: 'notification', volume: 0.55 }, // news from Percy or a visitor
  bite: { file: 'mention', volume: 0.65 }, // a fish is biting
  nibble: { file: 'mention', volume: 0.2 }, // only a nibble: a much quieter blip
  missed: { file: 'cancel', volume: 0.5 },
  cast: { file: 'send', volume: 0.55 }, // casting the line, giving a gift
  place: { file: 'drop', volume: 0.6 }, // planting, filling a box
  water: { file: 'swipe', volume: 0.5 },
  done: { file: 'success', volume: 0.65 }, // naming the pet, a full order
  lightsOff: { file: 'sleep', volume: 0.5 },
  lightsOn: { file: 'wake', volume: 0.5 },
} as const;
export type SoundId = keyof typeof SOUNDS;

// Each music loop in public/audio/music/ and its exact length in seconds
// (scripts/make-music.ts prints it), so it loops without a gap.
const TRACKS = {
  day: { file: 'day', seconds: 48 },
  night: { file: 'night', seconds: 32 },
} as const;
export type TrackId = keyof typeof TRACKS;

const MUSIC_VOLUME = 0.35;
const FADE_S = 1.5; // how long one song takes to fade into the next

let settings: AudioSettings = loadAudioSettings();
let ctx: AudioContext | null = null;
let sfxBus: GainNode;
let musicBus: GainNode;
const buffers = new Map<string, Promise<AudioBuffer | null>>();
const lastPlayed = new Map<SoundId, number>();
let wanted: TrackId | null = null; // the song that should be playing
let playing: { id: TrackId; source: AudioBufferSourceNode; gain: GainNode } | null = null;

// Made on the first tap, when the browser allows sound.
function context(): AudioContext | null {
  if (ctx || typeof AudioContext === 'undefined') return ctx;
  ctx = new AudioContext();
  sfxBus = ctx.createGain();
  sfxBus.gain.value = settings.sounds ? 1 : 0;
  sfxBus.connect(ctx.destination);
  musicBus = ctx.createGain();
  musicBus.gain.value = settings.music ? MUSIC_VOLUME : 0;
  musicBus.connect(ctx.destination);
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

// Where the loop really starts. Some browsers keep the MP3's few
// milliseconds of silence at the front; looping that would leave a tiny gap.
function loopStart(buffer: AudioBuffer, seconds: number): number {
  if (buffer.duration - seconds < 0.01) return 0;
  const data = buffer.getChannelData(0);
  const limit = Math.min(data.length, 4096);
  for (let i = 0; i < limit; i++) if (Math.abs(data[i]) > 0.01) return i / buffer.sampleRate;
  return 0;
}

// Which song should play (null for none). Safe to call often: it only
// changes anything when the song changes.
export function music(id: TrackId | null): void {
  if (id === wanted) return;
  wanted = id;
  startWanted();
}

function startWanted(): void {
  if (!ctx || ctx.state !== 'running' || !settings.music || playing?.id === wanted) return;
  const old = playing;
  playing = null;
  if (old) {
    old.gain.gain.setTargetAtTime(0, ctx.currentTime, FADE_S / 3);
    old.source.stop(ctx.currentTime + FADE_S * 2);
  }
  const id = wanted;
  if (!id) return;
  const { file, seconds } = TRACKS[id];
  load(`music/${file}`).then((buffer) => {
    if (!buffer || !ctx || wanted !== id || playing) return;
    const source = ctx.createBufferSource();
    const gain = ctx.createGain();
    source.buffer = buffer;
    source.loop = true;
    source.loopStart = loopStart(buffer, seconds);
    source.loopEnd = source.loopStart + seconds;
    gain.gain.value = 0;
    gain.gain.setTargetAtTime(1, ctx.currentTime, FADE_S / 3);
    source.connect(gain).connect(musicBus);
    source.start(0, source.loopStart);
    playing = { id, source, gain };
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
  musicBus.gain.setTargetAtTime(settings.music ? MUSIC_VOLUME : 0, ctx.currentTime, 0.2);
  if (settings.music) startWanted();
}

// Called once at startup: waits for the first tap to switch sound on, and
// pauses while the app is out of sight.
export function startAudio(): void {
  const unlock = () => {
    const c = context();
    if (!c) return;
    c.resume().then(startWanted);
  };
  document.addEventListener('pointerdown', unlock, { capture: true });
  document.addEventListener('keydown', unlock, { capture: true });
  document.addEventListener('visibilitychange', () => {
    if (!ctx) return;
    if (document.visibilityState === 'hidden') ctx.suspend();
    else ctx.resume().then(startWanted);
  });
}
