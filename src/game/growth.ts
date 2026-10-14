// Growing up: egg -> baby -> teen -> adult.
//
// Each stage lasts a set time (CONFIG.growth.stageHours). When the time is
// up the pet moves to the next stage, and the game picks which *form* (look)
// it grows into from src/data/creatures.json, based on the hidden Care Score.
// A well looked-after pet grows into a rarer adult form.

import { CONFIG } from './config';
import creatures from '../data/creatures.json';
import type { Pet } from './state';

export type Stage = 'egg' | 'baby' | 'teen' | 'adult';
export const STAGES: Stage[] = ['egg', 'baby', 'teen', 'adult'];

export interface Form {
  id: string;
  stage: Stage;
  name: string;
  sprite: string; // sheet name in public/sprites/manifest.json
  minCare: number; // lowest Care Score that can grow into this form
}

export const FORMS = creatures.forms as Form[];

export function getForm(id: string): Form {
  return FORMS.find((f) => f.id === id) ?? FORMS[0];
}

export function nextStage(stage: Stage): Stage | null {
  const i = STAGES.indexOf(stage);
  return i < STAGES.length - 1 ? STAGES[i + 1] : null;
}

// How long the pet stays in a stage, in milliseconds (Infinity for adult).
export function stageLengthMs(stage: Stage): number {
  if (stage === 'adult') return Infinity;
  return CONFIG.growth.stageHours[stage] * 3_600_000;
}

// A small number made from the pet's id, so the same pet always picks the
// same variation (instead of a different one every time you reload).
function idHash(id: string): number {
  let h = 0;
  for (const ch of id) h = (h * 31 + ch.charCodeAt(0)) >>> 0;
  return h;
}

// Picks which form a pet grows into when it enters `stage`.
export function chooseForm(stage: Stage, careScore: number, petId: string): Form {
  const options = FORMS.filter((f) => f.stage === stage && careScore >= f.minCare);
  if (options.length === 0) return FORMS.find((f) => f.stage === stage) ?? FORMS[0];
  const best = Math.max(...options.map((f) => f.minCare));
  const top = options.filter((f) => f.minCare === best);
  return top[idHash(petId) % top.length];
}

// Moves the pet into its next stage at time `t` (changes `pet` in place).
export function growUp(pet: Pet, t: number): void {
  const next = nextStage(pet.stage);
  if (!next) return;
  pet.stage = next;
  pet.formId = chooseForm(next, pet.careScore, pet.id).id;
  pet.stageStartedAt = t;
  if (next === 'baby') {
    // Freshly hatched: start with comfy stats.
    pet.stats = { ...CONFIG.startingStats };
  }
}
