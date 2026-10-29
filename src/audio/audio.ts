// Music and sound effects. The background music plays all the time, and
// each part of the game has its own sounds: fishing, cooking, looking
// after the pet, the bath, the garden, sniff and dig, the workbench,
// journeys and the rewards. Buttons and menus stay quiet on purpose. The
// game just says what happened, sound('bite'), and this file does the rest.
//
// The files live in public/audio/ (see public/audio/CREDITS.md for where
// they came from). To swap a sound, drop in a new MP3 with the same name, or
// point an entry below at a different file.
//
// Browsers keep a page silent until the player first taps it, so nothing
// plays before that; the music starts with the first tap. Leaving the app
// pauses everything.

import { loadAudioSettings, saveAudioSettings, type AudioSettings } from '../storage/storage';

// Each sound effect: its file in public/audio/sfx/ and how loud it plays
// (0 to 1).
const SOUNDS = {
  // All made by scripts/make-sfx.ts.
  // Fishing
  cast: { file: 'fish-cast', volume: 0.5 }, // the line whooshes out, the bait plops in
  nibble: { file: 'fish-nibble', volume: 0.3 }, // only a nibble: a small bloop
  bite: { file: 'fish-bite', volume: 0.65 }, // a fish is biting: splash and a ping
  reel: { file: 'fish-reel', volume: 0.22 }, // one ratchet tick, over and over while you pull
  splash: { file: 'fish-splash', volume: 0.6 }, // a fish leaps out of the water
  perfect: { file: 'fish-perfect', volume: 0.5 },
  escape: { file: 'fish-escape', volume: 0.5 }, // the fish swims off
  pondIn: { file: 'pond-fill', volume: 0.4 },
  pondOut: { file: 'pond-drain', volume: 0.35 },
  // Cooking
  place: { file: 'kitchen-place', volume: 0.45 }, // food set on a plate or the board
  lift: { file: 'kitchen-lift', volume: 0.35 }, // food taken back off a plate
  chop: { file: 'chop', volume: 0.6 },
  chopPerfect: { file: 'chop-perfect', volume: 0.6 }, // a chop in the green
  potPlop: { file: 'pot-plop', volume: 0.5 }, // each ingredient dropping in
  simmer: { file: 'pot-simmer', volume: 0.45 }, // the burner, bubbling and the lid rattling
  dishReady: { file: 'dish-ready', volume: 0.55 }, // the dish (or a fillet) pops up
  mushy: { file: 'dish-mushy', volume: 0.5 }, // it came out a Mushy mess
  // Looking after the pet
  munch: { file: 'munch', volume: 0.4 }, // each bite of food
  cuddle: { file: 'cuddle', volume: 0.35 },
  giggle: { file: 'giggle', volume: 0.35 }, // a tickle, or playing with a friend
  lightsOff: { file: 'lights-off', volume: 0.35 },
  lightsOn: { file: 'lights-on', volume: 0.35 },
  medicine: { file: 'medicine', volume: 0.45 }, // spoon, gulp, bleh, better
  scoop: { file: 'scoop', volume: 0.4 }, // a poop picked up
  gift: { file: 'gift', volume: 0.4 }, // a present for a friend
  // Bath time
  scrub: { file: 'scrub', volume: 0.25 }, // over and over while you rub
  rinse: { file: 'rinse', volume: 0.45 },
  dryer: { file: 'dryer', volume: 0.2 }, // over and over while drying
  clean: { file: 'clean', volume: 0.4 },
  // The garden
  plant: { file: 'plant', volume: 0.5 },
  water: { file: 'water', volume: 0.4 },
  waterPerfect: { file: 'water-perfect', volume: 0.4 },
  fertilize: { file: 'fertilize', volume: 0.5 },
  cure: { file: 'cure', volume: 0.4 },
  harvest: { file: 'harvest', volume: 0.55 },
  clear: { file: 'clear', volume: 0.45 },
  // Sniff and dig
  sniff: { file: 'sniff', volume: 0.45 },
  dig: { file: 'dig', volume: 0.55 },
  digSplash: { file: 'dig-splash', volume: 0.5 }, // a flooded square at the cove
  // The workbench
  hammer: { file: 'hammer', volume: 0.5 },
  crafted: { file: 'crafted', volume: 0.5 }, // the last tap, and the piece pops up
  build: { file: 'build', volume: 0.4 }, // a project's next stage started
  starLock: { file: 'star-lock', volume: 0.4 }, // fragments locking into a Revival Star
  starMade: { file: 'star-made', volume: 0.45 }, // ...and the star (also when one brings a pet back)
  // Rewards (played as each one shows, see src/ui/reveal.ts)
  found: { file: 'found', volume: 0.4 },
  badge: { file: 'badge', volume: 0.45 },
  levelUp: { file: 'level-up', volume: 0.45 },
  fragment: { file: 'fragment', volume: 0.4 },
  growFlash: { file: 'grow-flash', volume: 0.5 }, // a pet growing up
  starPop: { file: 'star-pop', volume: 0.35 }, // each of a grown-up's stars
  hearts: { file: 'hearts', volume: 0.35 }, // two pets spending time together
  hatch: { file: 'hatch', volume: 0.45 },
  // Shop, Percy and visitors
  coins: { file: 'coins', volume: 0.4 }, // buying something, or the check-in gold
  goldBox: { file: 'gold-box', volume: 0.4 }, // every box of Percy's order full
  bell: { file: 'bell', volume: 0.3 }, // Percy's bicycle bell: news from him
  knock: { file: 'knock', volume: 0.5 }, // a visitor at the door
  cookie: { file: 'cookie', volume: 0.5 }, // a fortune cookie cracked open
  // Journeys
  setOff: { file: 'set-off', volume: 0.4 },
  unzip: { file: 'unzip', volume: 0.45 }, // a backpack opened
  camera: { file: 'camera', volume: 0.45 }, // a snapshot for the journal
} as const;
export type SoundId = keyof typeof SOUNDS;

// The background music in public/audio/music/ (made by
// scripts/make-music.ts) and the loop's exact length in seconds, which the
// script prints, so it loops without a gap.
const MUSIC = { file: 'theme', seconds: 64 };
const MUSIC_VOLUME = 0.3;

let settings: AudioSettings = loadAudioSettings();
let ctx: AudioContext | null = null;
let sfxBus: GainNode;
let musicBus: GainNode;
let musicPlaying = false;
const buffers = new Map<string, Promise<AudioBuffer | null>>();
const lastPlayed = new Map<SoundId, number>();

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

// Where the loop really starts. Browsers that don't trim the MP3's few
// milliseconds of encoder silence at the front would otherwise loop it as
// a tiny gap.
function loopStart(buffer: AudioBuffer, seconds: number): number {
  return buffer.duration - seconds < 0.01 ? 0 : 1105 / 44100; // LAME's usual delay
}

// Starts the music, fading in, once sound is allowed and Music is on. It
// keeps looping from then on (the Music switch only turns it down).
function startMusic(): void {
  if (musicPlaying || !ctx || ctx.state !== 'running' || !settings.music) return;
  musicPlaying = true;
  load(`music/${MUSIC.file}`).then((buffer) => {
    if (!buffer || !ctx) return;
    const source = ctx.createBufferSource();
    const fade = ctx.createGain();
    source.buffer = buffer;
    source.loop = true;
    source.loopStart = loopStart(buffer, MUSIC.seconds);
    source.loopEnd = source.loopStart + MUSIC.seconds;
    fade.gain.value = 0;
    fade.gain.setTargetAtTime(1, ctx.currentTime, 0.6);
    source.connect(fade).connect(musicBus);
    source.start(0, source.loopStart);
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
  startMusic();
}

// Called once at startup: waits for the first tap to switch sound and music
// on, and pauses while the app is out of sight.
export function startAudio(): void {
  const unlock = () => {
    const c = context();
    if (!c) return;
    c.resume().then(startMusic);
  };
  document.addEventListener('pointerdown', unlock, { capture: true });
  document.addEventListener('keydown', unlock, { capture: true });
  document.addEventListener('visibilitychange', () => {
    if (!ctx) return;
    if (document.visibilityState === 'hidden') ctx.suspend();
    else ctx.resume().then(startMusic);
  });
}
