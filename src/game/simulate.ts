// simulate() is the heart of the game. It answers one question:
// "Given how things were at state.lastUpdated, what are they like now?"
//
// It never relies on the browser tab staying open. Whether you closed the game
// for ten seconds or ten days, it walks forward one minute at a time (a
// "tick") and applies everything that would have happened in between: stats
// dropping, sleeping and waking, warnings, sickness and the Care Score. We
// call it when the game loads, when you come back to the tab, and every few
// seconds while open.

import { CONFIG } from './config';
import { clampStat, isNeglected, isNight, isWellFed } from './stats';
import { growUp, stageLengthMs } from './growth';
import { growGarden } from './garden';
import type { GameState, Pet } from './state';

const MS_PER_MINUTE = 60_000;
const TICKS_PER_HOUR = 60 / CONFIG.tickMinutes;

// Turns a "per hour" rate from the config into a "per tick" amount.
const perTick = (perHour: number) => perHour / TICKS_PER_HOUR;

export function simulate(state: GameState, now: number): GameState {
  const tickMs = CONFIG.tickMinutes * MS_PER_MINUTE;
  const elapsed = now - state.lastUpdated;

  // If the clock went backwards (e.g. the device time was changed) or less
  // than one tick has passed, nothing happens yet.
  if (elapsed < tickMs) return state;

  const ticks = Math.floor(elapsed / tickMs);

  // Work on a copy so the original state is never changed by accident.
  const pet: Pet = { ...state.pet, stats: { ...state.pet.stats }, buffs: [...state.pet.buffs] };

  let t = state.lastUpdated;
  for (let i = 0; i < ticks; i++) {
    const wasNight = isNight(t);
    t += tickMs;
    tick(pet, t, wasNight);
  }

  // The garden grows on its own clock, so it catches up in one go.
  const garden = growGarden(state.garden, state.lastUpdated, t);
  return { ...state, pet, garden, lastUpdated: t };
}

// Advances the pet by one tick ending at time `t`. Changes `pet` in place
// (it's our private copy from simulate()).
function tick(pet: Pet, t: number, wasNight: boolean): void {
  const cfg = CONFIG;

  // 0. Growing up. An egg just waits to hatch: nothing else happens to it.
  if (t - pet.stageStartedAt >= stageLengthMs(pet.stage)) growUp(pet, t);
  if (pet.stage === 'egg') return;

  const s = pet.stats;
  const night = isNight(t);

  // 1. Sleeping and waking.
  if (pet.asleep) {
    const morningJustCame = wasNight && !night;
    const napFinished = !night && s.energy >= 100;
    if (morningJustCame || napFinished) pet.asleep = false;
  } else if (s.energy <= 0) {
    pet.asleep = true; // too tired: the pet dozes off by itself
  }

  // 2. Hunger, joy and energy.
  const ageRate = cfg.growth.decayMultiplier[pet.stage];
  const slow = (pet.asleep ? cfg.sleep.decayMultiplierAsleep : 1) * ageRate;
  const sickJoy = pet.condition === 'sick' ? cfg.sickness.sickJoyMultiplier : 1;
  // Timed food effects: drop any that have worn off, then apply the rest.
  pet.buffs = pet.buffs.filter((b) => t <= b.until);
  const hungerBuff = pet.buffs.find((b) => b.stat === 'hunger');
  const slowHunger = hungerBuff ? 1 - hungerBuff.percent / 100 : 1;
  s.hunger = clampStat(s.hunger - perTick(cfg.decayPerHour.hunger) * slow * slowHunger);
  s.happiness = clampStat(s.happiness - perTick(cfg.decayPerHour.happiness) * slow * sickJoy);
  if (pet.asleep) {
    s.energy = clampStat(s.energy + perTick(cfg.sleep.energyPerHourAsleep));
  } else {
    const lateNight = night ? cfg.sleep.energyMultiplierNightAwake : 1;
    s.energy = clampStat(s.energy - perTick(cfg.decayPerHour.energy) * lateNight);
  }

  // 3. Health.
  let healthChange = -cfg.decayPerHour.health;
  if (pet.condition === 'sick') healthChange -= cfg.health.sickDecayPerHour;
  else if (isNeglected(s)) healthChange -= cfg.health.neglectDecayPerHour;
  else if (isWellFed(s)) healthChange = cfg.health.recoverPerHourWhenCared;
  s.health = clampStat(s.health + perTick(healthChange));

  // 4. Warning and sickness.
  if (pet.recoveryUntil !== null && t >= pet.recoveryUntil) pet.recoveryUntil = null;
  const recovering = pet.recoveryUntil !== null;
  const neglected = isNeglected(s);

  if (pet.condition === 'healthy' && neglected) {
    pet.condition = 'warning';
    pet.warningMinutes = 0;
  } else if (pet.condition === 'warning') {
    if (!neglected) {
      pet.condition = 'healthy';
      pet.warningMinutes = 0;
    } else {
      pet.warningMinutes += cfg.tickMinutes;
      const warnedLongEnough = pet.warningMinutes >= cfg.sickness.warningHoursBeforeSick * 60;
      // A pet resting after medicine can't fall sick again straight away.
      if (warnedLongEnough && !recovering) pet.condition = 'sick';
    }
  }
  // A sick pet stays sick until it gets medicine (see actions.ts).

  // 5. Care Score.
  let care = 0;
  if (pet.condition === 'sick') care = -cfg.careScore.lossPerHourWhenSick;
  else if (neglected) care = -cfg.careScore.lossPerHourWhenNeglected;
  else if (isWellFed(s) && s.health >= cfg.goodStatThreshold) care = cfg.careScore.gainPerHourWhenCared;
  pet.careScore = clampStat(pet.careScore + perTick(care));
}
