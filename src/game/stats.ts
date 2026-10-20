// Small helpers for reading the pet's situation.

import { CONFIG, STAT_MAX, STAT_MIN } from './config';
import type { Pet, PetStats } from './state';

// Keeps a number inside the 0-100 range.
export function clampStat(value: number): number {
  return Math.min(STAT_MAX, Math.max(STAT_MIN, value));
}

// True if any of the stats that matter for health is low. (Low energy just
// means the pet is tired, so it doesn't count.)
export function isNeglected(stats: PetStats): boolean {
  const low = CONFIG.lowStatThreshold;
  return stats.hunger < low || stats.happiness < low || stats.health < low;
}

// True if tummy and joy are both in good shape.
export function isWellFed(stats: PetStats): boolean {
  const good = CONFIG.goodStatThreshold;
  return stats.hunger >= good && stats.happiness >= good;
}

// Is it night-time at this moment (in the device's local time)?
export function isNight(time: number): boolean {
  const hour = new Date(time).getHours();
  const { bedtimeHour, wakeHour } = CONFIG.sleep;
  return hour >= bedtimeHour || hour < wakeHour;
}

export function isRecovering(pet: Pet, now: number): boolean {
  return pet.recoveryUntil !== null && now < pet.recoveryUntil;
}

// Mini-games (and later breeding) are blocked while sick, recovering or asleep.
export function canPlayMinigames(pet: Pet, now: number): boolean {
  return !pet.asleep && pet.condition !== 'sick' && pet.condition !== 'passed' && !isRecovering(pet, now);
}

export function hasPassed(pet: Pet): boolean {
  return pet.condition === 'passed';
}

// How long a sick pet has left before it passes away, in milliseconds.
export function timeLeftToTreat(pet: Pet): number {
  return Math.max(0, CONFIG.sickness.hoursBeforePassing * 60 - pet.sickMinutes) * 60_000;
}

// True in a sick pet's last hours, when the banner turns urgent.
export function isCritical(pet: Pet): boolean {
  return pet.condition === 'sick' && timeLeftToTreat(pet) <= CONFIG.sickness.criticalHours * 3_600_000;
}

// Which animation to show for the pet right now.
export type Look = 'idle' | 'cheerful' | 'sad' | 'sleep' | 'sick' | 'passed';

export function getLook(pet: Pet): Look {
  if (pet.condition === 'passed') return 'passed';
  if (pet.asleep) return 'sleep';
  if (pet.condition === 'sick') return 'sick';
  if (pet.condition === 'warning' || isNeglected(pet.stats)) return 'sad';
  if (pet.stats.happiness >= CONFIG.cheerfulHappiness) return 'cheerful';
  return 'idle';
}
