import { describe, expect, it } from 'vitest';
import { newTeen } from './helpers';
import { CONFIG } from '../src/game/config';
import { revivalStars } from '../src/game/economy';
import { countedSoFar, stepFragments } from '../src/game/fragments';
import type { GameState } from '../src/game/state';

const DAY = 24 * 3_600_000;
const START = new Date(2026, 0, 1, 10, 0).getTime();
const { perStar, careDays } = CONFIG.revival.fragments;

// Visits once a day for `days` days, starting at START.
function visitDaily(s: GameState, days: number): { state: GameState; pieces: number } {
  let pieces = 0;
  for (let d = 0; d < days; d++) {
    const r = stepFragments({ ...s, lastUpdated: START + d * DAY });
    s = r.state;
    pieces += r.pieces;
  }
  return { state: s, pieces };
}

describe('star fragments', () => {
  it('a full week of daily care gives one fragment', () => {
    expect(visitDaily(newTeen(START), careDays - 1).pieces).toBe(0);
    expect(visitDaily(newTeen(START), careDays).pieces).toBe(1);
  });

  it('missing a day starts the week over', () => {
    let s = visitDaily(newTeen(START), careDays - 1).state;
    s = stepFragments({ ...s, lastUpdated: START + careDays * DAY }).state; // skipped a day
    expect(s.fragments.streak).toBe(1);
    expect(s.fragments.pieces).toBe(0);
  });

  it("a sick pet's day doesn't count", () => {
    const s = newTeen(START);
    s.pet.condition = 'sick';
    expect(stepFragments(s).state.fragments.streak).toBe(0);
  });

  it('a pet growing up and a finished achievement give one each, once', () => {
    const s = newTeen(START);
    s.fragments.lastDay = '2026-01-01'; // today already counted
    s.pet.stage = 'adult';
    s.badges = { fish: 'gold', deliveries: 'silver' };
    const r = stepFragments(s);
    expect(r.pieces).toBe(2);
    expect(stepFragments(r.state).pieces).toBe(0);
  });

  it(`${perStar} fragments make a Revival Star`, () => {
    const s = newTeen(START);
    s.fragments = { ...s.fragments, pieces: perStar - 1, lastDay: '2026-01-01' };
    s.pet.stage = 'adult';
    const r = stepFragments(s);
    expect(r.stars).toBe(1);
    expect(revivalStars(r.state)).toBe(1);
    expect(r.state.fragments.pieces).toBe(0);
  });

  it('older saves only count what happens from now on', () => {
    const s = newTeen(START);
    s.pet.stage = 'adult';
    s.badges = { fish: 'gold' };
    s.fragments = { pieces: 0, streak: 0, lastDay: '2026-01-01', from: countedSoFar(s) };
    expect(stepFragments(s).pieces).toBe(0);
  });
});
