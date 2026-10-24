// Saving and loading. Everything else in the game talks to this file instead
// of touching localStorage directly, so later we can swap localStorage for
// IndexedDB or a cloud save by changing only this file.

import { CONFIG } from '../game/config';
import type { GameState } from '../game/state';
import { characterKey, unlocksFor } from '../game/unlocks';
import { newGarden } from '../game/garden';
import { newJourneys, newKeeper } from '../game/state';
import { grownUpXp, levelInfo } from '../game/skills';
import { getCharacter } from '../game/growth';
import { guidesAlreadyKnown } from '../game/guides';
import { backfillRegulars } from '../game/regulars';
import { fitTrait, rollTrait } from '../game/traits';
import { carriedOf, genesAtGrowUp } from '../game/genes';
import { newHygiene } from '../game/hygiene';

const SAVE_KEY = 'cozy-pixel-pet-save';

// Bump this number whenever the shape of GameState changes, and teach
// migrate() how to upgrade older saves so players never lose their pet.
export const SAVE_VERSION = 27;

export interface SaveFile {
  version: number;
  // Older saves have a different shape, so we treat the contents loosely
  // here and only promise a proper GameState once migrate() is done.
  state: any;
}

// Upgrades an old save to the current version, one version at a time, so a
// player's pet survives every update to the game.
export function migrate(save: SaveFile): SaveFile {
  // Version 1 -> 2: added health, energy, sleep, sickness and the Care Score.
  if (save.version === 1) {
    const pet = save.state.pet;
    pet.stats.health = CONFIG.startingStats.health;
    pet.stats.energy = CONFIG.startingStats.energy;
    pet.asleep = false;
    pet.condition = 'healthy';
    pet.warningMinutes = 0;
    pet.recoveryUntil = null;
    pet.careScore = CONFIG.careScore.start;
    save.state.clockOffsetMs = 0;
    save.version = 2;
  }
  // Version 2 -> 3: added timed food effects.
  if (save.version === 2) {
    save.state.pet.buffs = [];
    save.version = 3;
  }
  // Version 3 -> 4: added life stages. Pets from before this update were
  // already up and about, so they continue as babies from now on.
  if (save.version === 3) {
    save.state.pet.stage = 'baby';
    save.state.pet.formId = 'baby';
    save.state.pet.stageStartedAt = save.state.lastUpdated;
    save.version = 4;
  }
  // Version 4 -> 5: adults became characters with themes and rarity. Old
  // adult forms move to the closest new character.
  if (save.version === 4) {
    const pet = save.state.pet;
    const oldAdults: Record<string, string> = { sunny: 'starwisp', puffy: 'cloudlet', mossy: 'sprig' };
    pet.character = pet.stage === 'adult' ? (oldAdults[pet.formId] ?? 'dumpling') : null;
    pet.variant = null;
    delete pet.formId;
    save.version = 5;
  }
  // Version 5 -> 6: added gold, the inventory, hats and check-in bonuses.
  if (save.version === 5) {
    save.state.pet.hat = null;
    save.state.gold = CONFIG.economy.startingGold;
    save.state.inventory = { food: { ...CONFIG.economy.startingFood }, hats: [] };
    save.state.checkIn = { day: '', count: 0, lastAt: 0 };
    save.version = 6;
  }
  // Version 6 -> 7: added cooking and the recipe book.
  if (save.version === 6) {
    save.state.recipesFound = [];
    save.version = 7;
  }
  // Version 7 -> 8: menus that open up as you play, and the Collection.
  // Fish in the pantry count as caught, and whatever is already open for
  // this pet counts as seen, so nothing shows up as "new" by surprise.
  if (save.version === 7) {
    const st = save.state;
    const pet = st.pet;
    st.recentFoods = [];
    st.caught = Object.keys(CONFIG.fishing.catchOdds.other).filter((id) => (st.inventory?.food?.[id] ?? 0) > 0);
    st.charactersFound = pet.stage === 'adult' && pet.character ? [characterKey(pet.character, pet.variant)] : [];
    st.showAllMenus = false;
    st.unlocked = unlocksFor(st as GameState);
    st.seen = [...st.unlocked];
    save.version = 8;
  }
  // Version 8 -> 9: naming the pet, the owner's name and the Family Tree.
  // Pets that already hatched keep their name, but get asked once whether
  // they'd like a different one. An egg's name hasn't been picked yet.
  if (save.version === 8) {
    const pet = save.state.pet;
    if (pet.stage === 'egg') pet.name = '';
    pet.named = false;
    pet.generation = 1;
    pet.parents = [];
    save.state.owner = '';
    save.state.family = [];
    save.version = 9;
  }
  // Version 9 -> 10: the garden, with seeds and garden supplies.
  if (save.version === 9) {
    save.state.garden = newGarden();
    save.state.inventory = { food: {}, hats: [], ...save.state.inventory, seeds: {}, supplies: {} };
    save.version = 10;
  }
  // Version 10 -> 11: Percy's delivery orders and the Messages page. Crops
  // in the pantry count as grown, so Percy can ask for them.
  if (save.version === 10) {
    const st = save.state;
    st.grown = CONFIG.garden.crops.map((c) => c.id as string).filter((id) => (st.inventory?.food?.[id] ?? 0) > 0);
    st.delivery = { order: null, nextAt: 0 };
    st.messages = [];
    st.messagesSeenAt = 0;
    save.version = 11;
  }
  // Version 11 -> 12: cravings (the thought bubble).
  if (save.version === 11) {
    save.state.craving = { food: null, until: 0, nextAt: 0, last: null };
    save.version = 12;
  }
  // Version 12 -> 13: friends, mingling and more than one pet in the room.
  if (save.version === 12) {
    const st = save.state;
    st.pet.themes = [];
    st.pet.partner = null;
    st.housemates = [];
    st.family = (st.family ?? []).map((m: any) => ({ ...m, fromWild: false }));
    st.friends = [];
    st.visit = { guest: null, friendId: null, until: 0, met: false, nextAt: 0, wildAt: 0, invitedDay: '' };
    save.version = 13;
  }
  // Version 13 -> 14: room decorations, bait, the energy drink and a 3rd
  // garden pot. Every room starts plain.
  if (save.version === 13) {
    const st = save.state;
    st.inventory = { ...st.inventory, decor: [] };
    st.room = { wallpaper: 'plain', curtains: null };
    st.stock = { day: '', bought: 0 };
    st.baitOn = false;
    save.version = 14;
  }
  // Version 14 -> 15: achievements. Nothing was counted before, so counts
  // start at zero, except what Messages still remembers: Percy's pickups
  // and little ones. (Badges for those are handed out on the next update.)
  if (save.version === 14) {
    const st = save.state;
    const messages: any[] = st.messages ?? [];
    st.tally = {
      deliveries: messages.filter((m) => m.kind === 'pickup' && m.tier !== 'none').length,
      littleOnes: messages.filter((m) => m.kind === 'littleOne').length,
    };
    st.badges = {};
    save.version = 15;
  }
  // Version 15 -> 16: Keeper XP and skills. Long-time players get XP back
  // for what they've already done (achievement counts, badges and pets that
  // grew up), quietly, so they open Skills with a few points to spend.
  if (save.version === 15) {
    const st = save.state;
    const K = CONFIG.skills;
    let xp = 0;
    for (const [id, n] of Object.entries(st.tally ?? {})) xp += (K.xp[id as keyof typeof K.xp] ?? 0) * (n as number);
    for (const tier of Object.values(st.badges ?? {})) {
      const reached = ['bronze', 'silver', 'gold'].slice(0, ['bronze', 'silver', 'gold'].indexOf(tier as string) + 1);
      for (const t of reached) xp += K.badgeXp[t as keyof typeof K.badgeXp];
    }
    const grown = [
      ...[st.pet, ...(st.housemates ?? [])].filter((p: any) => p?.stage === 'adult' && p.character),
      ...(st.family ?? []).filter((m: any) => m.character && !m.fromFriend && !m.fromWild),
    ];
    for (const p of grown) xp += grownUpXp(getCharacter(p.character)?.stars ?? 1);
    st.keeper = { ...newKeeper(), xp, grownUp: grown.map((p: any) => p.id) };
    st.keeper.level = levelInfo(xp).level;
    save.version = 16;
  }
  // Version 16 -> 17: a pet left sick too long can pass away. Pets sick
  // right now start the countdown from today. Added star fragments.
  if (save.version === 16) {
    const st = save.state;
    for (const p of [st.pet, ...(st.housemates ?? [])]) {
      if (!p) continue;
      p.sickMinutes = 0;
      p.starGlow = false;
    }
    st.fragments = { pieces: 0 };
    save.version = 17;
  }
  // Version 17 -> 18: star fragments come from good care days instead of
  // a daily streak, pets growing up and gold badges. Fragments already
  // found are kept; the care days start from today.
  if (save.version === 17) {
    const st = save.state;
    st.fragments = { pieces: st.fragments?.pieces ?? 0, careDays: 0, day: '', dayGood: false };
    save.version = 18;
  }
  // Version 18 -> 19: journeys and the travel journal. Nobody is away yet.
  if (save.version === 18) {
    const st = save.state;
    for (const p of [st.pet, ...(st.housemates ?? [])]) {
      if (!p) continue;
      p.trip = null;
      p.tripReadyAt = 0;
    }
    st.journeys = newJourneys();
    save.version = 19;
  }
  // Version 19 -> 20: "How it works" guides. Players who already got this
  // far aren't shown guides for what they know; they're all in Menu > Guide.
  if (save.version === 19) {
    const st = save.state;
    st.guidesRead = guidesAlreadyKnown({ ...st, pet: st.pet ?? {}, unlocked: st.unlocked ?? [] } as GameState);
    save.version = 20;
  }
  // Version 20 -> 21: regulars (Percy's hearts) and journey bags. Players who already filled
  // orders start partway; the rewards for those hearts are handed over on
  // the next update.
  if (save.version === 20) {
    const st = save.state;
    st.regulars = backfillRegulars(st.tally?.deliveries ?? 0);
    if (st.inventory) st.inventory.bags = [];
    save.version = 21;
  }
  // Version 21 -> 22: pets remember what their parents grew into, for the
  // 3-star parents bonus. Filled in from the family where we can.
  if (save.version === 21) {
    const st = save.state;
    const pets: any[] = [st.pet, ...(st.housemates ?? [])].filter(Boolean);
    const known = new Map<string, any>();
    for (const m of [...(st.family ?? []), ...(st.friends ?? []), ...pets]) known.set(m.id, m);
    for (const p of pets) {
      p.parentLooks = (p.parents ?? []).map((id: string) => ({
        character: known.get(id)?.character ?? null,
        variant: known.get(id)?.variant ?? null,
      }));
    }
    save.version = 22;
  }
  // Version 22 -> 23: more journey badges, and Milestone badges. Fill in
  // what the save can tell: an Adventure for each place whose best stamp is
  // epic, and the gold-frame orders still in Messages. The Milestones
  // themselves are handed out on the next update.
  if (save.version === 22) {
    const st = save.state;
    st.milestones = [];
    const pages = Object.values(st.journeys?.journal ?? {}) as { best?: string }[];
    const adventures = pages.filter((page) => page.best === 'epic').length;
    const goldOrders = (st.messages ?? []).filter((m: { kind: string; tier?: string }) => m.kind === 'pickup' && m.tier === 'gold').length;
    st.tally = { ...st.tally };
    if (adventures > 0) st.tally.adventures = Math.max(st.tally.adventures ?? 0, adventures);
    if (goldOrders > 0) st.tally.goldOrders = Math.max(st.tally.goldOrders ?? 0, goldOrders);
    save.version = 23;
  }
  // Version 23 -> 24: the starter themes. Basic became Bakery and Sparkle
  // became Starry, and retired characters turn into the new one of the same
  // theme and stars. (Old "cloudlet" was the 3-star Basic pet; the new
  // Cloudlet is Starry's 1-star.) Cave pets stay as they are.
  if (save.version === 23) {
    const st = save.state;
    const characters: Record<string, string> = {
      bunbun: 'puddling', cloudlet: 'cuppie', glimmer: 'cloudlet', starwisp: 'starhoot', mosscap: 'acornet', fernwhisk: 'stumpy',
    };
    const themes: Record<string, string> = { basic: 'bakery', sparkle: 'starry' };
    const fix = (thing: any) => {
      if (thing && typeof thing.character === 'string') thing.character = characters[thing.character] ?? thing.character;
    };
    const pets: any[] = [st.pet, ...(st.housemates ?? [])].filter(Boolean);
    for (const p of pets) {
      fix(p);
      p.themes = [...new Set((p.themes ?? []).map((t: string) => themes[t] ?? t))];
      for (const look of p.parentLooks ?? []) fix(look);
    }
    for (const m of [...(st.family ?? []), ...(st.friends ?? []), st.visit?.guest, ...(st.messages ?? [])]) fix(m);
    st.charactersFound = [
      ...new Set(
        (st.charactersFound ?? []).map((key: string) => {
          const [id, variant] = key.split(':');
          return [characters[id] ?? id, variant].filter(Boolean).join(':');
        }),
      ),
    ];
    save.version = 24;
  }
  // Version 24 -> 25: traits. Every pet gets the one its id rolls, and so
  // do the pets in the Family Tree (one their character allows).
  if (save.version === 24) {
    const st = save.state;
    for (const p of [st.pet, ...(st.housemates ?? []), ...(st.family ?? [])]) if (p && !p.trait) p.trait = fitTrait(p.id, rollTrait(p.id), getCharacter(p.character ?? null));
    save.version = 25;
  }
  // Version 25 -> 26: poop and bath time. Every pet starts out clean.
  if (save.version === 25) {
    const st = save.state;
    for (const p of [st.pet, ...(st.housemates ?? [])]) if (p && !p.hygiene) p.hygiene = newHygiene();
    save.version = 26;
  }
  // Version 26 -> 27: genes. Each pet remembers what its parents carry (the
  // genes their ids roll), and a grown-up gets the ones it would have
  // carried had genes been there when it grew up.
  if (save.version === 26) {
    const st = save.state;
    const pets: any[] = [st.pet, ...(st.housemates ?? [])].filter(Boolean);
    const known = new Map<string, any>();
    for (const m of [...(st.family ?? []), ...(st.friends ?? []), ...pets]) known.set(m.id, m);
    for (const p of pets) {
      p.parentCarried = (p.parents ?? []).map((id: string) => carriedOf(known.get(id) ?? { id }));
      const character = getCharacter(p.character ?? null);
      p.carried = p.stage === 'adult' && character ? genesAtGrowUp(p, character, p.variant ?? null) : null;
    }
    save.version = 27;
  }
  return save;
}

export function saveGame(state: GameState): void {
  const file: SaveFile = { version: SAVE_VERSION, state };
  try {
    localStorage.setItem(SAVE_KEY, JSON.stringify(file));
  } catch (err) {
    // Storage can be full or blocked (e.g. private browsing). The game keeps
    // working in memory; we just can't save right now.
    console.warn('Could not save the game:', err);
  }
}

// Returns the saved game, or null if there is none (or it can't be read).
export function loadGame(): GameState | null {
  try {
    const raw = localStorage.getItem(SAVE_KEY);
    if (!raw) return null;
    const file = migrate(JSON.parse(raw) as SaveFile);
    if (file.version !== SAVE_VERSION) return null;
    return file.state as GameState;
  } catch (err) {
    console.warn('Could not load the save, starting fresh:', err);
    return null;
  }
}

export function clearSave(): void {
  try {
    localStorage.removeItem(SAVE_KEY);
  } catch {
    // Nothing to do if storage is unavailable.
  }
}

// Music and sound on or off. Kept apart from the game save, so starting a
// new game keeps them as they were.
const AUDIO_KEY = 'cozy-pixel-pet-audio';

export interface AudioSettings {
  music: boolean;
  sounds: boolean;
}

export function loadAudioSettings(): AudioSettings {
  try {
    const saved = JSON.parse(localStorage.getItem(AUDIO_KEY) ?? '{}');
    return { music: saved.music !== false, sounds: saved.sounds !== false };
  } catch {
    return { music: true, sounds: true };
  }
}

export function saveAudioSettings(settings: AudioSettings): void {
  try {
    localStorage.setItem(AUDIO_KEY, JSON.stringify(settings));
  } catch {
    // Not saved this time; they stay as set until the game closes.
  }
}
