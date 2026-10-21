import { describe, expect, it } from 'vitest';
import { newTeen } from './helpers';
import { CONFIG } from '../src/game/config';
import { revivalStars } from '../src/game/economy';
import { stepFragments } from '../src/game/fragments';
import { migrate } from '../src/storage/storage';
import type { GameState } from '../src/game/state';

const DAY = 24 * 3_600_000;
const START = new Date(2026, 0, 1, 10, 0).getTime();
const { perStar, careDaysPerFragment: PER } = CONFIG.revival.fragments;

// Visits once on each of the given days (counted from START).
function visit(s: GameState, days: number[]): { state: GameState; pieces: number } {
  let pieces = 0;
  for (const d of days) {
    const r = stepFragments({ ...s, lastUpdated: START + d * DAY });
    s = r.state;
    pieces += r.pieces;
  }
  return { state: s, pieces };
}
const range = (n: number) => [...Array(n).keys()];

describe('star fragments', () => {
  it(`every ${PER} good care days give a fragment (counted when the next day starts)`, () => {
    expect(visit(newTeen(START), range(PER)).pieces).toBe(0);
    expect(visit(newTeen(START), range(PER + 1)).pieces).toBe(1);
    expect(visit(newTeen(START), range(2 * PER + 1)).pieces).toBe(2);
  });

  it("missed days don't count, but don't throw away the days before", () => {
    // Visits every other day.
    const days = range(PER + 1).map((d) => d * 2);
    expect(visit(newTeen(START), days).pieces).toBe(1);
  });

  it('a day where any pet gets a warning or is sick does not count', () => {
    const s = newTeen(START);
    s.housemates = [{ ...newTeen(START).pet, id: 'other', condition: 'warning' }];
    expect(visit(s, range(PER + 1)).pieces).toBe(0);
  });

  it('a day counts once, however many pets there are', () => {
    const s = newTeen(START);
    s.housemates = [{ ...newTeen(START).pet, id: 'other' }];
    const r = visit(s, range(PER + 1));
    expect(r.pieces).toBe(1);
  });

  it('days with only an egg do not count', () => {
    const s = newTeen(START);
    s.pet.stage = 'egg';
    expect(visit(s, range(PER + 1)).pieces).toBe(0);
  });

  it(`${perStar} fragments make a Revival Star`, () => {
    const s = newTeen(START);
    s.fragments = { pieces: perStar - 1, careDays: PER - 1, day: '2026-01-01', dayGood: true };
    const r = stepFragments({ ...s, lastUpdated: START + DAY });
    expect(r.stars).toBe(1);
    expect(revivalStars(r.state)).toBe(1);
    expect(r.state.fragments.pieces).toBe(0);
  });

  it('older saves keep the fragments they found', () => {
    const state: any = newTeen(START);
    state.fragments = { pieces: 3, streak: 4, lastDay: '2026-01-01', from: [] };
    expect(migrate({ version: 17, state }).state.fragments).toEqual({ pieces: 3, careDays: 0, day: '', dayGood: false });
  });
});
