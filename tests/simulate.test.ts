import { describe, expect, it } from 'vitest';
import { simulate } from '../src/game/simulate';
import { createNewGame, type GameState } from '../src/game/state';
import { feed, play } from '../src/game/actions';
import { CONFIG } from '../src/game/config';

const MINUTE = 60_000;
const HOUR = 60 * MINUTE;
// Noon local time, so the first hours of every test are daytime.
const START = new Date(2026, 0, 1, 12, 0).getTime();

// A new game with tummy and joy kept full and energy topped up, so tests
// can focus on one thing at a time.
function freshGame(): GameState {
  return createNewGame(START);
}

describe('simulate', () => {
  it('changes nothing when no time has passed', () => {
    const s = freshGame();
    expect(simulate(s, START)).toBe(s);
  });

  it('changes nothing when the clock goes backwards', () => {
    const s = freshGame();
    expect(simulate(s, START - HOUR)).toBe(s);
  });

  it('decays every stat at the configured hourly rate while awake in the day', () => {
    const after = simulate(freshGame(), START + HOUR);
    const st = after.pet.stats;
    expect(st.hunger).toBeCloseTo(CONFIG.startingStats.hunger - CONFIG.decayPerHour.hunger);
    expect(st.happiness).toBeCloseTo(CONFIG.startingStats.happiness - CONFIG.decayPerHour.happiness);
    expect(st.energy).toBeCloseTo(CONFIG.startingStats.energy - CONFIG.decayPerHour.energy);
    expect(after.lastUpdated).toBe(START + HOUR);
  });

  it('gives the same result whether run once or in many small steps', () => {
    const s = freshGame();
    const once = simulate(s, START + 30 * HOUR);
    let stepped = s;
    for (let t = START; t <= START + 30 * HOUR; t += 7 * MINUTE) {
      stepped = simulate(stepped, t);
    }
    stepped = simulate(stepped, START + 30 * HOUR);
    expect(stepped.pet).toEqual(once.pet);
  });

  it('keeps leftover seconds for next time instead of losing them', () => {
    const after = simulate(freshGame(), START + MINUTE + 30_000);
    expect(after.lastUpdated).toBe(START + MINUTE);
  });

  it('never lets stats go below 0 after a very long time away', () => {
    const month = simulate(freshGame(), START + 30 * 24 * HOUR);
    for (const v of Object.values(month.pet.stats)) {
      expect(v).toBeGreaterThanOrEqual(0);
      expect(v).toBeLessThanOrEqual(100);
    }
  });

  it('does not change the original state object', () => {
    const s = freshGame();
    const before = JSON.stringify(s);
    simulate(s, START + 3 * HOUR);
    expect(JSON.stringify(s)).toBe(before);
  });
});

describe('actions', () => {
  it('feed raises hunger and never goes above 100', () => {
    let s = feed(freshGame(), START).state;
    expect(s.pet.stats.hunger).toBe(100);
    s = feed(s, START).state;
    expect(s.pet.stats.hunger).toBe(100);
  });

  it('play raises joy and costs a little hunger and energy', () => {
    const s = play(freshGame(), START, 'ball').state;
    const a = CONFIG.activities.find((x) => x.id === 'ball')!;
    expect(s.pet.stats.happiness).toBe(80 + a.happiness);
    expect(s.pet.stats.hunger).toBe(80 + a.hunger);
    expect(s.pet.stats.energy).toBe(80 + a.energy);
  });

  it('each food changes stats by its own amounts', () => {
    const s = feed(freshGame(), START, 'cookie').state;
    const f = CONFIG.foods.find((x) => x.id === 'cookie')!;
    expect(s.pet.stats.hunger).toBe(80 + f.hunger);
    expect(s.pet.stats.happiness).toBe(80 + f.happiness);
    expect(s.pet.stats.health).toBe(100 + f.health);
  });

  it('catches up time before applying the action', () => {
    const s = feed(freshGame(), START + 5 * HOUR, 'riceBall').state;
    expect(s.pet.stats.hunger).toBeCloseTo(80 - 20 + CONFIG.foods[0].hunger);
  });

  it('refuses to play when the pet is too tired', () => {
    const s = freshGame();
    s.pet.stats.energy = 2;
    expect(play(s, START).blocked).toBe('tooTired');
  });
});
