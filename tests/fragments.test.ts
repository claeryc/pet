import { describe, expect, it } from 'vitest';
import { newTeen } from './helpers';
import { CONFIG } from '../src/game/config';
import { buyHat, getHat, grantPack, revivalStars } from '../src/game/economy';
import { makeStar, stepFragments, weeksToStar } from '../src/game/fragments';
import { updateMilestones } from '../src/game/milestones';
import { migrate } from '../src/storage/storage';
import type { GameState } from '../src/game/state';

const DAY = 24 * 3_600_000;
const START = new Date(2026, 0, 1, 10, 0).getTime();
const { perStar, perGoodDay, perMilestone } = CONFIG.fragments;

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
  it(`every good care day gives ${perGoodDay} (counted when the next day starts)`, () => {
    expect(visit(newTeen(START), range(1)).pieces).toBe(0);
    expect(visit(newTeen(START), range(2)).pieces).toBe(perGoodDay);
    const r = visit(newTeen(START), range(8));
    expect(r.pieces).toBe(7 * perGoodDay);
    expect(r.state.fragments.careDays).toBe(7);
  });

  it("missed days don't count, but don't throw away the days before", () => {
    // Visits every other day: each visited day counts once the next visit starts a new day.
    expect(visit(newTeen(START), [0, 2, 4, 6]).pieces).toBe(3 * perGoodDay);
  });

  it('a day where any pet gets a warning or is sick does not count', () => {
    const s = newTeen(START);
    s.housemates = [{ ...newTeen(START).pet, id: 'other', condition: 'warning' }];
    expect(visit(s, range(7)).pieces).toBe(0);
  });

  it('a day counts once, however many pets there are', () => {
    const s = newTeen(START);
    s.housemates = [{ ...newTeen(START).pet, id: 'other' }];
    expect(visit(s, range(7)).pieces).toBe(6 * perGoodDay);
  });

  it('days with only an egg do not count', () => {
    const s = newTeen(START);
    s.pet.stage = 'egg';
    expect(visit(s, range(7)).pieces).toBe(0);
  });

  it('a daily player earns about 150 a month', () => {
    expect(visit(newTeen(START), range(31)).pieces).toBe(150);
  });

  it('weeksToStar says how many weeks of good care are left', () => {
    expect(weeksToStar(0)).toBe(Math.ceil(perStar / perGoodDay / 7));
    expect(weeksToStar(perStar - perGoodDay)).toBe(1);
    expect(weeksToStar(perStar)).toBe(0);
  });

  it('a pack bought from the Star Shop gives its fragments', () => {
    const s = newTeen(START);
    s.fragments.pieces = 7;
    for (const pack of CONFIG.store) {
      expect(grantPack(s, pack.id).fragments.pieces).toBe(7 + pack.fragments);
      expect(revivalStars(grantPack(s, pack.id))).toBe(0);
    }
  });

  it(`a new Milestone gives ${perMilestone} fragments`, () => {
    const s = newTeen(START);
    s.tally = { ...s.tally, goldOrders: 1 };
    const r = updateMilestones(s);
    expect(r.earned).toContain('goldOrder');
    expect(r.state.fragments.pieces).toBe(r.earned.length * perMilestone);
  });

  it('fragments pile up instead of turning into a star on their own', () => {
    const s = newTeen(START);
    s.fragments = { pieces: perStar - perGoodDay, careDays: 0, day: '2026-01-01', dayGood: true };
    const r = stepFragments({ ...s, lastUpdated: START + DAY });
    expect(r.pieces).toBe(perGoodDay);
    expect(r.state.fragments.pieces).toBe(perStar);
    expect(revivalStars(r.state)).toBe(0);
  });

  it(`making a star uses ${perStar} fragments, and needs that many`, () => {
    const s = newTeen(START);
    s.fragments.pieces = perStar + 2;
    const made = makeStar(s);
    expect(made.blocked).toBeUndefined();
    expect(revivalStars(made.state)).toBe(1);
    expect(made.state.fragments.pieces).toBe(2);
    expect(makeStar(made.state).blocked).toBe('notEnoughFragments');
  });

  it('the star-only hat costs fragments, never gold', () => {
    const hat = getHat('starryCap')!;
    const s = newTeen(START);
    s.gold = 10_000;
    s.fragments.pieces = hat.fragments! - 1;
    expect(buyHat(s, 'starryCap').blocked).toBe('notEnoughFragments');
    s.fragments.pieces = hat.fragments!;
    const r = buyHat(s, 'starryCap');
    expect(r.blocked).toBeUndefined();
    expect(r.state.inventory.hats).toContain('starryCap');
    expect(r.state.fragments.pieces).toBe(0);
    expect(r.state.gold).toBe(10_000);
  });

  it('older saves keep the fragments they found, worth 30 each now', () => {
    const state: any = newTeen(START);
    state.fragments = { pieces: 3, streak: 4, lastDay: '2026-01-01', from: [] };
    expect(migrate({ version: 17, state }).state.fragments).toEqual({ pieces: 90, careDays: 0, day: '', dayGood: false });
  });

  it('saves from before the change pay out the good days already counted', () => {
    const state: any = newTeen(START);
    state.fragments = { pieces: 2, careDays: 4, day: '2026-01-01', dayGood: true };
    const fr = migrate({ version: 34, state }).state.fragments;
    expect(fr.pieces).toBe(2 * 30 + 4 * perGoodDay);
    expect(fr.careDays).toBe(4);
  });
});
