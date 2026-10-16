// Saving and loading. Everything else in the game talks to this file instead
// of touching localStorage directly, so later we can swap localStorage for
// IndexedDB or a cloud save by changing only this file.

import { CONFIG } from '../game/config';
import type { GameState } from '../game/state';
import { characterKey, unlocksFor } from '../game/unlocks';

const SAVE_KEY = 'cozy-pixel-pet-save';

// Bump this number whenever the shape of GameState changes, and teach
// migrate() how to upgrade older saves so players never lose their pet.
export const SAVE_VERSION = 8;

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
