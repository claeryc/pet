// Saving and loading. Everything else in the game talks to this file instead
// of touching localStorage directly, so later we can swap localStorage for
// IndexedDB or a cloud save by changing only this file.

import { CONFIG } from '../game/config';
import type { GameState } from '../game/state';

const SAVE_KEY = 'cozy-pixel-pet-save';

// Bump this number whenever the shape of GameState changes, and teach
// migrate() how to upgrade older saves so players never lose their pet.
export const SAVE_VERSION = 2;

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
