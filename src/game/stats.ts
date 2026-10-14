// Small helpers for working with pet stats.

import { CONFIG, STAT_MAX, STAT_MIN } from './config';
import type { PetStats } from './state';

// Keeps a number inside the 0-100 range.
export function clampStat(value: number): number {
  return Math.min(STAT_MAX, Math.max(STAT_MIN, value));
}

// The pet's mood, used to pick which face/animation to show.
export type Mood = 'happy' | 'sad';

export function getMood(stats: PetStats): Mood {
  const low = CONFIG.lowStatThreshold;
  return stats.hunger < low || stats.happiness < low ? 'sad' : 'happy';
}
