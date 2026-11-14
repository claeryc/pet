// simulate() is the heart of the game. It answers one question:
// "Given how things were at state.lastUpdated, what are they like now?"
//
// It never relies on the browser tab staying open. Whether you closed the game
// for ten seconds or ten days, it walks forward one minute at a time (a
// "tick") and applies everything that would have happened in between: stats
// dropping, sleeping and waking, warnings, sickness (and passing away if
// it's left sick too long), the Care Score and pets out on journeys. We
// call it when the game loads, when you come back to the tab, and every few
// seconds while open.

import { stepCrafting } from './crafting';
import { stepRiceJar } from './economy';
import { CONFIG } from './config';
import { clampStat, isNeglected, isNight, isWellFed } from './stats';
import { growUp, stageLengthMs } from './growth';
import { growGardenAround } from './garden';
import { stepDelivery } from './delivery';
import { stepCraving } from './craving';
import { stepVisits } from './friends';
import { logMessage } from './messages';
import { cantHoliday, goHoliday, stepJourneys, travelTick } from './journeys';
import type { GameState, Pet } from './state';
import { carePerks, gardenPerks, type CarePerks } from './skills';
import { hygieneTick } from './hygiene';
import { needsSpeed } from './rooms';

const MS_PER_MINUTE = 60_000;
const TICKS_PER_HOUR = 60 / CONFIG.tickMinutes;

// Turns a "per hour" rate from the config into a "per tick" amount.
const perTick = (perHour: number) => perHour / TICKS_PER_HOUR;

export function simulate(state: GameState, now: number): GameState {
  const tickMs = CONFIG.tickMinutes * MS_PER_MINUTE;
  const elapsed = now - state.lastUpdated;

  // If the clock went backwards (e.g. the device time was changed) or less
  // than one tick has passed, nothing happens yet (except an egg that's due).
  if (elapsed < tickMs) return hatchDueEggs(state, now);

  const ticks = Math.floor(elapsed / tickMs);

  // Work on copies so the original state is never changed by accident.
  // Every pet in the room lives on, not just the one you're looking after.
  // (A trip is never changed in place, only replaced, so it can be shared.)
  const copy = (p: Pet): Pet => ({ ...p, stats: { ...p.stats }, buffs: [...p.buffs], hygiene: { ...p.hygiene } });
  const pet = copy(state.pet);
  const housemates = state.housemates.map(copy);

  // The keeper's Care skills help every pet.
  const perks = carePerks(state);
  const startedAt = state.startedAt ?? 0;
  // With the switch on, a pet about to fall sick sends everyone on a
  // Holiday instead, if a ticket is there and nobody's out or unwell.
  const escape = state.settings?.autoHoliday && cantHoliday(state) === null
    ? () => ![pet, ...housemates].some((p) => p.condition === 'sick' || p.trip)
    : undefined;
  let holidayAt: number | null = null;
  let unwell = '';
  let t = state.lastUpdated;
  for (let i = 0; i < ticks && holidayAt === null; i++) {
    const wasNight = isNight(t);
    t += tickMs;
    for (const p of [pet, ...housemates]) {
      if (tick(p, t, wasNight, perks, startedAt, escape) === 'holiday') {
        holidayAt = t;
        unwell ||= p.name;
      }
    }
  }

  // The garden grows on its own clock, so it catches up in one go.
  // (It waits while everyone's on a Holiday.)
  const garden = growGardenAround(state.garden, state.lastUpdated, t, state.journeys.holiday, gardenPerks(state));
  // So do the journey board and Percy flying home from a trip, his orders
  // (a pickup that came due, or a new order), the pet's cravings, and
  // visitors dropping by.
  const next = stepJourneys(state, { ...state, pet, housemates, garden, lastUpdated: t }, t);
  const stepped = stepCrafting(stepRiceJar(stepVisits(stepCraving(stepDelivery(next, t), t), t), t), t);
  if (holidayAt !== null) {
    const days = CONFIG.journeys.holiday.autoDays;
    const went = goHoliday(stepped, t, days).state;
    const h = went.journeys.holiday;
    if (h) {
      const auto = { ...went, journeys: { ...went.journeys, holiday: { ...h, auto: true } } };
      return simulate(logMessage(auto, { kind: 'autoHoliday', at: t, name: unwell, days }), now);
    }
  }
  return hatchDueEggs(stepped, now);
}

// The egg timer is short (see CONFIG.growth.stageHours.egg), so an egg
// hatches right on time instead of waiting for the next whole-minute tick.
// Eggs need nothing, so there is no decay to catch up on in between.
function hatchDueEggs(state: GameState, now: number): GameState {
  const due = (p: Pet) =>
    p.stage === 'egg' && p.condition !== 'passed' && !p.trip && now - p.stageStartedAt >= stageLengthMs('egg');
  if (!due(state.pet) && !state.housemates.some(due)) return state;
  const hatch = (p: Pet): Pet => {
    if (!due(p)) return p;
    const copy = { ...p, stats: { ...p.stats } };
    growUp(copy, p.stageStartedAt + stageLengthMs('egg'));
    return copy;
  };
  return { ...state, pet: hatch(state.pet), housemates: state.housemates.map(hatch) };
}

// How long a pet that falls sick at `t` has before it passes away: longer
// for a baby, and for any pet in the keeper's first week.
export function passingHours(pet: Pet, t: number, startedAt: number): number {
  const cfg = CONFIG.sickness;
  const firstWeek = startedAt > 0 && t - startedAt < cfg.gentleFirstDays * 86_400_000;
  return pet.stage === 'baby' || firstWeek ? cfg.hoursBeforePassingGentle : cfg.hoursBeforePassing;
}

// Advances the pet by one tick ending at time `t`. Changes `pet` in place
// (it's our private copy from simulate()). Returns 'holiday' when the pet
// was about to fall sick and `escape` sent everyone on a Holiday instead.
function tick(pet: Pet, t: number, wasNight: boolean, perks: CarePerks, startedAt: number, escape?: () => boolean): 'holiday' | void {
  const cfg = CONFIG;

  // A pet that passed away stays just as it was until it's revived.
  if (pet.condition === 'passed') return;
  // A pet out on a journey only gets hungrier and more tired (see
  // journeys.ts); everything else waits until it's home.
  if (travelTick(pet, t)) return;

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
  const slow = (pet.asleep ? cfg.sleep.decayMultiplierAsleep : 1) * ageRate * perks.decay;
  const sickJoy = pet.condition === 'sick' ? cfg.sickness.sickJoyMultiplier : 1;
  // The Family Home is easier on tummy, joy and energy (not on poop and baths).
  const home = needsSpeed(pet);
  // Timed food effects: drop any that have worn off, then apply the rest.
  pet.buffs = pet.buffs.filter((b) => t <= b.until);
  const eased = (stat: 'hunger' | 'happiness') => 1 - (pet.buffs.find((b) => b.stat === stat)?.percent ?? 0) / 100;
  s.hunger = clampStat(s.hunger - perTick(cfg.decayPerHour.hunger) * slow * eased('hunger') * home);
  s.happiness = clampStat(s.happiness - perTick(cfg.decayPerHour.happiness) * slow * sickJoy * eased('happiness') * home);
  if (pet.asleep) {
    s.energy = clampStat(s.energy + perTick(cfg.sleep.energyPerHourAsleep));
  } else {
    const lateNight = night ? cfg.sleep.energyMultiplierNightAwake : 1;
    s.energy = clampStat(s.energy - perTick(cfg.decayPerHour.energy) * lateNight * home);
  }
  // Poop, and getting smelly (see hygiene.ts).
  hygieneTick(pet, t, cfg.tickMinutes, slow);

  // 3. Health.
  let healthChange = -cfg.decayPerHour.health;
  if (pet.condition === 'sick') healthChange -= cfg.health.sickDecayPerHour;
  else if (isNeglected(s)) healthChange -= cfg.health.neglectDecayPerHour;
  else if (isWellFed(s)) healthChange = cfg.health.recoverPerHourWhenCared;
  s.health = clampStat(s.health + perTick(healthChange));

  // 4. Warning and sickness.
  if (pet.recoveryUntil !== null && t >= pet.recoveryUntil) pet.recoveryUntil = null;
  const recovering = pet.recoveryUntil !== null;
  // Germs from staying smelly count like a low bar.
  const neglected = isNeglected(s) || pet.hygiene.germs;

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
      if (warnedLongEnough && !recovering) {
        if (escape?.()) return 'holiday';
        pet.condition = 'sick';
        pet.sickMinutes = 0;
        pet.sickWindowHours = passingHours(pet, t, startedAt);
      }
    }
  }
  // A sick pet stays sick until it gets medicine (see actions.ts). Left
  // sick for too long, it passes away.
  if (pet.condition === 'sick') {
    pet.sickMinutes += cfg.tickMinutes;
    if (pet.sickMinutes >= (pet.sickWindowHours ?? cfg.sickness.hoursBeforePassing) * 60) {
      pet.condition = 'passed';
      pet.passedAt = t;
      pet.asleep = false;
      pet.buffs = [];
      s.health = 0;
      return;
    }
  }

  // 5. Care Score.
  let care = 0;
  if (pet.condition === 'sick') care = -cfg.careScore.lossPerHourWhenSick;
  else if (neglected) care = -cfg.careScore.lossPerHourWhenNeglected;
  else if (isWellFed(s) && s.health >= cfg.goodStatThreshold) care = cfg.careScore.gainPerHourWhenCared * perks.careGain;
  pet.careScore = clampStat(pet.careScore + perTick(care));
}
