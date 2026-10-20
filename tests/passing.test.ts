import { describe, expect, it } from 'vitest';
import { simulate } from '../src/game/simulate';
import { type GameState } from '../src/game/state';
import { newTeen } from './helpers';
import { feed, giveMedicine, play, revive, sayGoodbye } from '../src/game/actions';
import { CONFIG } from '../src/game/config';
import { buyRevivalStar, grantPack, revivalStars } from '../src/game/economy';
import { getLook, isCritical, timeLeftToTreat } from '../src/game/stats';
import { awayNotes } from '../src/game/away';
import { migrate } from '../src/storage/storage';

const HOUR = 3_600_000;
const START = new Date(2026, 0, 1, 10, 0).getTime();
const { warningHoursBeforeSick: WARN, hoursBeforePassing: PASS, criticalHours: CRIT } = CONFIG.sickness;

// A pet that is already sick, as of START.
function sickPet(): GameState {
  const s = newTeen(START);
  s.pet.condition = 'sick';
  s.pet.stats = { hunger: 10, happiness: 10, health: 40, energy: 50 };
  return s;
}

describe('passing away', () => {
  it('passes away after being sick too long without medicine', () => {
    const s = sickPet();
    expect(simulate(s, START + (PASS - 0.1) * HOUR).pet.condition).toBe('sick');
    const gone = simulate(s, START + (PASS + 0.1) * HOUR);
    expect(gone.pet.condition).toBe('passed');
    expect(gone.pet.stats.health).toBe(0);
    expect(getLook(gone.pet)).toBe('passed');
  });

  it('only counts time spent sick, so a neglected pet always warns and gets sick first', () => {
    const s = newTeen(START);
    s.pet.stats.hunger = 25;
    // Warning, then sick, then the full countdown.
    expect(simulate(s, START + (WARN + PASS - 0.1) * HOUR).pet.condition).toBe('sick');
    expect(simulate(s, START + (WARN + PASS + 0.1) * HOUR).pet.condition).toBe('passed');
  });

  it('turns critical in the last hours, with the time left', () => {
    const s = simulate(sickPet(), START + (PASS - CRIT - 0.5) * HOUR);
    expect(isCritical(s.pet)).toBe(false);
    const later = simulate(s, START + (PASS - CRIT + 0.5) * HOUR);
    expect(isCritical(later.pet)).toBe(true);
    expect(timeLeftToTreat(later.pet)).toBeCloseTo((CRIT - 0.5) * HOUR, -5);
  });

  it('medicine resets the countdown', () => {
    let s = simulate(sickPet(), START + (PASS - 1) * HOUR);
    s = giveMedicine(s, START + (PASS - 1) * HOUR).state;
    expect(s.pet.sickMinutes).toBe(0);
    expect(simulate(s, START + (PASS + 1) * HOUR).pet.condition).not.toBe('passed');
  });

  it('freezes in time once passed: no growing up and no needs', () => {
    const gone = simulate(sickPet(), START + (PASS + 1) * HOUR);
    const week = simulate(gone, START + (PASS + 1 + 24 * 7) * HOUR);
    expect(week.pet.stage).toBe('teen');
    expect(week.pet.stats).toEqual(gone.pet.stats);
  });

  it('blocks feeding, playing and medicine', () => {
    const now = START + (PASS + 1) * HOUR;
    const gone = simulate(sickPet(), now);
    expect(feed(gone, now).blocked).toBe('passed');
    expect(play(gone, now).blocked).toBe('passed');
    expect(giveMedicine(gone, now).blocked).toBe('passed');
  });

  it('shows up on the away card', () => {
    const now = START + (PASS + 1) * HOUR;
    const s = sickPet();
    const notes = awayNotes(s, simulate(s, now), START, now);
    expect(notes).toContainEqual({ kind: 'passed', name: 'Mochi' });
    const close = START + (PASS - 2) * HOUR;
    const soon = awayNotes(s, simulate(s, close), START, close);
    expect(soon.some((n) => n.kind === 'critical')).toBe(true);
  });
});

describe('Revival Stars', () => {
  const now = START + (PASS + 1) * HOUR;

  it('a Star Shop pack adds stars', () => {
    expect(revivalStars(grantPack(newTeen(START), 'revival1'))).toBe(1);
    expect(revivalStars(grantPack(grantPack(newTeen(START), 'revival1'), 'revival3'))).toBe(4);
  });

  it('can also be bought with gold earned by playing', () => {
    const poor = newTeen(START);
    poor.gold = CONFIG.revival.goldPrice - 1;
    expect(buyRevivalStar(poor).blocked).toBe('notEnoughGold');
    const rich = { ...poor, gold: CONFIG.revival.goldPrice };
    const bought = buyRevivalStar(rich).state;
    expect(revivalStars(bought)).toBe(1);
    expect(bought.gold).toBe(0);
  });

  it('cannot revive without a star', () => {
    expect(revive(simulate(sickPet(), now), now).blocked).toBe('noRevival');
  });

  it('brings the pet back weak and resting, and uses one star', () => {
    const gone = grantPack(simulate(sickPet(), now), 'revival1');
    const back = revive(gone, now).state;
    expect(back.pet.condition).toBe('healthy');
    for (const [stat, least] of Object.entries(CONFIG.revival.stats)) {
      expect(back.pet.stats[stat as keyof typeof back.pet.stats]).toBeGreaterThanOrEqual(least);
    }
    expect(back.pet.recoveryUntil).toBe(now + CONFIG.sickness.recoveryHours * HOUR);
    expect(revivalStars(back)).toBe(0);
  });

  it('does nothing to a pet that is still alive', () => {
    const s = grantPack(newTeen(START), 'revival1');
    expect(revive(s, START).blocked).toBe('notSick');
  });
});

describe('saying goodbye', () => {
  const now = START + (PASS + 1) * HOUR;

  it('moves the pet into the Family Tree and starts a new egg', () => {
    const gone = simulate(sickPet(), now);
    const next = sayGoodbye(gone, now);
    expect(next.family.map((m) => m.id)).toContain(gone.pet.id);
    expect(next.pet.stage).toBe('egg');
    expect(next.pet.condition).toBe('healthy');
  });

  it('with another pet in the room, that one takes its place', () => {
    const other = newTeen(START).pet;
    const gone = simulate({ ...sickPet(), housemates: [other] }, now);
    const next = sayGoodbye(gone, now);
    expect(next.pet.id).toBe(other.id);
    expect(next.housemates).toEqual([]);
  });
});

describe('save upgrade', () => {
  it('gives older saves a sickness countdown of zero', () => {
    const state: any = newTeen(START);
    delete state.pet.sickMinutes;
    expect(migrate({ version: 16, state }).state.pet.sickMinutes).toBe(0);
  });
});
