import { describe, expect, it } from 'vitest';
import { simulate } from '../src/game/simulate';
import { CONFIG } from '../src/game/config';
import { bathe, collectPoop, isStinky, poopNow, smellNow } from '../src/game/hygiene';
import { createNewGame, type GameState } from '../src/game/state';
import { migrate } from '../src/storage/storage';
import { newTeen } from './helpers';

const MINUTE = 60_000;
const HOUR = 60 * MINUTE;
// 10am, so a whole day of tests stays out of the night.
const START = new Date(2026, 0, 1, 10, 0).getTime();
const H = CONFIG.hygiene;

// A pet at `stage` whose tummy, joy and energy stay up, so nothing but
// poop and smell happens to it.
function petAt(stage: 'baby' | 'teen' | 'adult'): GameState {
  const s = newTeen(START);
  s.pet.stage = stage;
  if (stage === 'adult') s.pet.character = 'sprig';
  return s;
}

// Hours (from START) until the first poop.
function firstPoopHours(stage: 'baby' | 'teen' | 'adult'): number {
  let s = petAt(stage);
  for (let i = 1; i <= 20 * 60; i++) {
    s = simulate(s, START + i * MINUTE);
    if (s.pet.hygiene.poops.length > 0) return i / 60;
  }
  return Infinity;
}

describe('poop', () => {
  it('comes sooner for babies and teens than for grown-ups', () => {
    const baby = firstPoopHours('baby');
    const teen = firstPoopHours('teen');
    const adult = firstPoopHours('adult');
    expect(baby).toBeGreaterThanOrEqual(H.poopEveryHours.baby * 0.75);
    expect(baby).toBeLessThanOrEqual(H.poopEveryHours.baby * 1.25);
    expect(teen).toBeLessThanOrEqual(H.poopEveryHours.teen * 1.25);
    expect(adult).toBeGreaterThanOrEqual(H.poopEveryHours.adult * 0.75);
    expect(baby).toBeLessThan(adult);
  });

  it('never piles up past the most there can be', () => {
    const s = simulate(petAt('baby'), START + 30 * HOUR);
    expect(s.pet.hygiene.poops.length).toBeLessThanOrEqual(H.maxPoops);
    expect(new Set(s.pet.hygiene.poops.map((p) => p.slot)).size).toBe(s.pet.hygiene.poops.length);
  });

  it('waits while the pet is asleep or still an egg', () => {
    const asleep = petAt('baby');
    asleep.pet.asleep = true;
    asleep.pet.stats.energy = 0; // it won't wake up from a full nap
    const s = simulate(asleep, START + 8 * HOUR);
    expect(s.pet.hygiene.poops).toEqual([]);
    expect(s.pet.hygiene.smelly).toBe(false);
    const egg = simulate(createNewGame(START), START + 20 * MINUTE);
    expect(egg.pet.hygiene.poops).toEqual([]);
  });

  it('is picked up by tapping it', () => {
    let s = poopNow(poopNow(petAt('teen'), START), START);
    expect(s.pet.hygiene.poops.map((p) => p.slot)).toEqual([0, 1]);
    s = collectPoop(s, s.pet.id, 0);
    expect(s.pet.hygiene.poops.map((p) => p.slot)).toEqual([1]);
    // A spot with nothing in it changes nothing.
    expect(collectPoop(s, s.pet.id, 2)).toBe(s);
  });

  it('makes the pet smelly when left lying around', () => {
    const s = poopNow(petAt('adult'), START);
    s.pet.hygiene.nextSmellAt = START + 100 * HOUR; // no smell of its own
    s.pet.hygiene.nextPoopAt = START + 100 * HOUR;
    expect(simulate(s, START + (H.poopSmellsAfterHours * 60 - 1) * MINUTE).pet.hygiene.smelly).toBe(false);
    expect(simulate(s, START + (H.poopSmellsAfterHours * 60 + 1) * MINUTE).pet.hygiene.smelly).toBe(true);
  });
});

describe('smelly', () => {
  it('drains joy faster once it has been smelly too long', () => {
    const clean = petAt('teen');
    clean.pet.hygiene.nextSmellAt = START + 100 * HOUR;
    clean.pet.hygiene.nextPoopAt = START + 100 * HOUR;
    const smelly = smellNow(clean);
    const hours = H.stinkyAfterHours + 2;
    const a = simulate(clean, START + hours * HOUR);
    const b = simulate(smelly, START + hours * HOUR);
    expect(isStinky(b.pet)).toBe(true);
    expect(a.pet.stats.happiness - b.pet.stats.happiness).toBeCloseTo(2 * H.stinkyJoyPerHour, 1);
  });

  it('germs count like a low bar: a warning, then sick', () => {
    const s = petAt('teen');
    s.pet.hygiene = { ...s.pet.hygiene, smelly: true, germs: true, nextPoopAt: START + 100 * HOUR };
    expect(simulate(s, START + MINUTE).pet.condition).toBe('warning');
    const later = simulate(s, START + (CONFIG.sickness.warningHoursBeforeSick * 60 + 1) * MINUTE);
    expect(later.pet.condition).toBe('sick');
  });

  it('sometimes catches germs when left stinky for long', () => {
    // Over many pets, some catch germs within a day of being smelly, and
    // never before they're stinky.
    let caught = 0;
    for (let i = 0; i < 40; i++) {
      const s = smellNow(petAt('teen'));
      s.pet.id = `pet-${i}`;
      s.pet.hygiene.nextPoopAt = START + 100 * HOUR;
      expect(simulate(s, START + (H.stinkyAfterHours * 60 - 1) * MINUTE).pet.hygiene.germs).toBe(false);
      if (simulate(s, START + 10 * HOUR).pet.hygiene.germs) caught++;
    }
    expect(caught).toBeGreaterThan(0);
    expect(caught).toBeLessThan(40);
  });
});

describe('bath', () => {
  it('washes off the smell and germs, and gives a little joy', () => {
    const s = petAt('teen');
    s.pet.stats.happiness = 50;
    s.pet.hygiene = { ...s.pet.hygiene, smelly: true, smellyMinutes: 300, germs: true };
    const { state, blocked } = bathe(s, START);
    expect(blocked).toBeUndefined();
    expect(state.pet.hygiene.smelly).toBe(false);
    expect(state.pet.hygiene.germs).toBe(false);
    expect(state.pet.stats.happiness).toBe(50 + H.bathJoy);
    expect(state.pet.hygiene.nextSmellAt).toBeGreaterThan(START);
    // With the germs gone, the warning goes too.
    expect(simulate(state, START + MINUTE).pet.condition).toBe('healthy');
  });

  it('is refused when the pet is clean or asleep', () => {
    expect(bathe(petAt('teen'), START).blocked).toBe('notSmelly');
    const sleepy = smellNow(petAt('teen'));
    sleepy.pet.asleep = true;
    expect(bathe(sleepy, START).blocked).toBe('asleep');
  });
});

describe('saves', () => {
  it('gives pets from older saves a clean start', () => {
    const old: any = createNewGame(START);
    delete old.pet.hygiene;
    const out = migrate({ version: 25, state: old });
    expect(out.state.pet.hygiene).toEqual({ poops: [], smelly: false, smellyMinutes: 0, germs: false, nextPoopAt: 0, nextSmellAt: 0 });
  });
});
