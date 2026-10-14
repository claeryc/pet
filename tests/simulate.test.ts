import { describe, expect, it } from 'vitest';
import { simulate } from '../src/game/simulate';
import { createNewGame } from '../src/game/state';
import { feed, play } from '../src/game/actions';
import { CONFIG } from '../src/game/config';

const MINUTE = 60_000;
const HOUR = 60 * MINUTE;
const START = Date.UTC(2026, 0, 1);

describe('simulate', () => {
  it('changes nothing when no time has passed', () => {
    const s = createNewGame(START);
    expect(simulate(s, START)).toBe(s);
  });

  it('changes nothing when the clock goes backwards', () => {
    const s = createNewGame(START);
    expect(simulate(s, START - HOUR)).toBe(s);
  });

  it('decays hunger and happiness at the configured hourly rate', () => {
    const s = createNewGame(START);
    const after = simulate(s, START + HOUR);
    expect(after.pet.stats.hunger).toBeCloseTo(
      CONFIG.startingStats.hunger - CONFIG.decayPerHour.hunger,
    );
    expect(after.pet.stats.happiness).toBeCloseTo(
      CONFIG.startingStats.happiness - CONFIG.decayPerHour.happiness,
    );
    expect(after.lastUpdated).toBe(START + HOUR);
  });

  it('gives the same result whether run once or in many small steps', () => {
    const s = createNewGame(START);
    const once = simulate(s, START + 5 * HOUR);
    let stepped = s;
    for (let t = START; t <= START + 5 * HOUR; t += 7 * MINUTE) {
      stepped = simulate(stepped, t);
    }
    stepped = simulate(stepped, START + 5 * HOUR);
    expect(stepped.pet.stats.hunger).toBeCloseTo(once.pet.stats.hunger);
    expect(stepped.pet.stats.happiness).toBeCloseTo(once.pet.stats.happiness);
  });

  it('keeps leftover seconds for next time instead of losing them', () => {
    const s = createNewGame(START);
    const after = simulate(s, START + MINUTE + 30_000);
    expect(after.lastUpdated).toBe(START + MINUTE);
  });

  it('catches up half a day away and never goes below 0', () => {
    const s = createNewGame(START);
    const day = simulate(s, START + 12 * HOUR);
    expect(day.pet.stats.hunger).toBeCloseTo(80 - 12 * CONFIG.decayPerHour.hunger);
    const month = simulate(s, START + 30 * 24 * HOUR);
    expect(month.pet.stats.hunger).toBe(0);
    expect(month.pet.stats.happiness).toBe(0);
  });

  it('does not change the original state object', () => {
    const s = createNewGame(START);
    const before = JSON.stringify(s);
    simulate(s, START + 3 * HOUR);
    expect(JSON.stringify(s)).toBe(before);
  });
});

describe('actions', () => {
  it('feed raises hunger and never goes above 100', () => {
    let s = createNewGame(START);
    s = feed(s, START);
    expect(s.pet.stats.hunger).toBe(100);
    s = feed(s, START);
    expect(s.pet.stats.hunger).toBe(100);
  });

  it('play raises happiness and costs a little hunger', () => {
    const s = play(createNewGame(START), START);
    expect(s.pet.stats.happiness).toBe(80 + CONFIG.actions.playHappiness);
    expect(s.pet.stats.hunger).toBe(80 + CONFIG.actions.playHunger);
  });

  it('catches up time before applying the action', () => {
    const s = feed(createNewGame(START), START + 10 * HOUR);
    expect(s.pet.stats.hunger).toBeCloseTo(80 - 40 + CONFIG.actions.feedHunger);
  });
});
