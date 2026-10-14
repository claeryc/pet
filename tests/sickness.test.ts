import { describe, expect, it } from 'vitest';
import { simulate } from '../src/game/simulate';
import { createNewGame, type GameState } from '../src/game/state';
import { fastForward, feed, giveMedicine, play } from '../src/game/actions';
import { CONFIG } from '../src/game/config';
import { canPlayMinigames } from '../src/game/stats';

const MINUTE = 60_000;
const HOUR = 60 * MINUTE;
const START = new Date(2026, 0, 1, 10, 0).getTime();
const WARN_HOURS = CONFIG.sickness.warningHoursBeforeSick;

// A pet whose tummy is already low, so neglect starts right away.
function hungryPet(): GameState {
  const s = createNewGame(START);
  s.pet.stats.hunger = 25;
  return s;
}

describe('warning, sickness and medicine', () => {
  it('shows a warning first when a stat gets low', () => {
    const s = simulate(hungryPet(), START + MINUTE);
    expect(s.pet.condition).toBe('warning');
  });

  it('becomes sick only after the full warning time', () => {
    const s = hungryPet();
    expect(simulate(s, START + (WARN_HOURS * 60 - 1) * MINUTE).pet.condition).toBe('warning');
    expect(simulate(s, START + (WARN_HOURS * 60 + 1) * MINUTE).pet.condition).toBe('sick');
  });

  it('never skips the warning, even after a long time away', () => {
    // Step through a week of neglect minute by minute and record every
    // condition change. It must always go healthy -> warning -> sick.
    let s = createNewGame(START);
    const seen: string[] = [s.pet.condition];
    for (let i = 0; i < 7 * 24 * 60; i++) {
      s = simulate(s, s.lastUpdated + MINUTE);
      if (seen[seen.length - 1] !== s.pet.condition) seen.push(s.pet.condition);
    }
    expect(seen).toEqual(['healthy', 'warning', 'sick']);
  });

  it('goes back to healthy if you fix things during the warning', () => {
    let s = simulate(hungryPet(), START + HOUR);
    expect(s.pet.condition).toBe('warning');
    s = feed(s, START + HOUR).state;
    s = simulate(s, START + HOUR + MINUTE);
    expect(s.pet.condition).toBe('healthy');
  });

  it('medicine cures sickness, restores health and starts recovery', () => {
    let s = simulate(hungryPet(), START + (WARN_HOURS + 1) * HOUR);
    expect(s.pet.condition).toBe('sick');
    const healthBefore = s.pet.stats.health;
    const now = START + (WARN_HOURS + 1) * HOUR;
    s = giveMedicine(s, now).state;
    expect(s.pet.condition).toBe('healthy');
    expect(s.pet.stats.health).toBeCloseTo(Math.min(100, healthBefore + CONFIG.sickness.medicineHealth));
    expect(s.pet.recoveryUntil).toBe(now + CONFIG.sickness.recoveryHours * HOUR);
  });

  it('medicine does nothing if the pet is not sick', () => {
    expect(giveMedicine(createNewGame(START), START).blocked).toBe('notSick');
  });

  it('blocks mini-games during recovery but still allows feeding and play', () => {
    const now = START + (WARN_HOURS + 1) * HOUR;
    let s = simulate(hungryPet(), now);
    s = giveMedicine(s, now).state;
    expect(canPlayMinigames(s.pet, now)).toBe(false);
    expect(feed(s, now).blocked).toBeUndefined();
    expect(play(s, now).blocked).toBeUndefined();
    // Look after it properly, so it's healthy when the rest is over.
    s.pet.stats = { ...s.pet.stats, hunger: 100, happiness: 100 };
    const later = now + CONFIG.sickness.recoveryHours * HOUR + MINUTE;
    expect(canPlayMinigames(simulate(s, later).pet, later)).toBe(true);
  });

  it('cannot get sick again while recovering', () => {
    const now = START + (WARN_HOURS + 1) * HOUR;
    let s = simulate(hungryPet(), now);
    s = giveMedicine(s, now).state; // still hungry, so the warning returns
    s = simulate(s, now + (CONFIG.sickness.recoveryHours - 0.5) * HOUR);
    expect(s.pet.condition).toBe('warning');
  });
});

describe('care score', () => {
  it('rises when the pet is well looked after', () => {
    const s = createNewGame(START);
    s.pet.stats.hunger = 100;
    s.pet.stats.happiness = 100;
    const after = simulate(s, START + 2 * HOUR);
    expect(after.pet.careScore).toBeCloseTo(CONFIG.careScore.start + 2 * CONFIG.careScore.gainPerHourWhenCared);
  });

  it('drops with neglect', () => {
    const after = simulate(hungryPet(), START + 2 * HOUR);
    expect(after.pet.careScore).toBeLessThan(CONFIG.careScore.start);
  });
});

describe('debug fast-forward', () => {
  it('moves the game clock forward and catches up', () => {
    const s = fastForward(createNewGame(START), START, 6);
    expect(s.clockOffsetMs).toBe(6 * HOUR);
    expect(s.lastUpdated).toBe(START + 6 * HOUR);
    expect(s.pet.stats.hunger).toBeLessThan(80);
  });
});
