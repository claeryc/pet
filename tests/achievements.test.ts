import { describe, expect, it } from 'vitest';
import { CONFIG } from '../src/game/config';
import {
  ACHIEVEMENTS, addTally, badgeCount, badgeOf, nextGoal, tierAt, updateBadges,
} from '../src/game/achievements';
import { land } from '../src/game/fishing';
import { cook } from '../src/game/cooking';
import { stepDelivery } from '../src/game/delivery';
import { updateProgress } from '../src/game/unlocks';
import { migrate, SAVE_VERSION } from '../src/storage/storage';
import { newTeen } from './helpers';

const HOUR = 3_600_000;
const START = new Date(2026, 0, 1, 10, 0).getTime();
const goals = CONFIG.achievements.fish;

describe('achievement tiers', () => {
  it('goes from nothing to bronze, silver and gold at the configured counts', () => {
    expect(tierAt('fish', 0)).toBeNull();
    expect(tierAt('fish', goals[0] - 1)).toBeNull();
    expect(tierAt('fish', goals[0])).toBe('bronze');
    expect(tierAt('fish', goals[1])).toBe('silver');
    expect(tierAt('fish', goals[2] + 100)).toBe('gold');
  });

  it('every achievement has three goals that go up', () => {
    for (const id of ACHIEVEMENTS) {
      const g = CONFIG.achievements[id];
      expect(g).toHaveLength(3);
      expect(g[0]).toBeGreaterThan(0);
      expect(g[1]).toBeGreaterThan(g[0]);
      expect(g[2]).toBeGreaterThan(g[1]);
    }
  });

  it('hands out a badge once, logs it in Messages and points at the next goal', () => {
    let s = addTally(newTeen(START), 'fish', goals[0]);
    expect(nextGoal(s, 'fish')).toEqual({ tier: 'bronze', goal: goals[0] });
    const first = updateBadges(s);
    expect(first.earned).toEqual([{ id: 'fish', tier: 'bronze' }]);
    expect(first.state.messages[0]).toMatchObject({ kind: 'badge', id: 'fish', tier: 'bronze' });
    s = first.state;
    expect(badgeOf(s, 'fish')).toBe('bronze');
    expect(nextGoal(s, 'fish')).toEqual({ tier: 'silver', goal: goals[1] });
    expect(updateBadges(s).earned).toEqual([]);
  });

  it('jumps straight to the best tier reached, and stops at gold', () => {
    let s = addTally(newTeen(START), 'fish', goals[2]);
    s = updateBadges(s).state;
    expect(badgeOf(s, 'fish')).toBe('gold');
    expect(nextGoal(s, 'fish')).toBeNull();
    expect(badgeCount(s)).toEqual({ earned: 3, total: ACHIEVEMENTS.length * 3 });
  });

  it('opens the Collection with the first badge', () => {
    const s = updateProgress(addTally(newTeen(START), 'littleOnes')).state;
    expect(s.unlocked).toContain('collection');
  });
});

describe('what counts', () => {
  it('a landed fish counts, one that gets away does not', () => {
    const s = newTeen(START);
    expect(land(s, 'perfect', 0, 0.5).state.tally.fish).toBe(CONFIG.fishing.fishPerCatch);
    expect(land(s, 'weak', 0.999, 0.5).state.tally.fish ?? 0).toBe(0);
  });

  it('a recipe counts as a dish, a Mushy mess does not', () => {
    const s = newTeen(START);
    s.inventory.food = { shrimp: 1, strawberry: 1, salmon: 1 };
    expect(cook(s, ['shrimp']).state.tally.dishes).toBe(1);
    expect(cook(s, ['strawberry', 'salmon']).state.tally.dishes ?? 0).toBe(0);
  });

  it("Percy's pickup counts only with at least one full box", () => {
    const pickup = (have: number) => {
      const s = newTeen(START);
      s.delivery = {
        order: { announcedAt: START, pickupAt: START + HOUR, boxes: [{ food: 'shrimp', want: 2, have }] },
        nextAt: 0,
      };
      return stepDelivery(s, START + HOUR).tally.deliveries ?? 0;
    };
    expect(pickup(2)).toBe(1);
    expect(pickup(1)).toBe(0);
  });
});

describe('save migration to achievements', () => {
  it('starts the counts from what Messages still remembers', () => {
    const out = migrate({
      version: 14,
      state: {
        messages: [
          { kind: 'pickup', tier: 'gold' },
          { kind: 'pickup', tier: 'none' },
          { kind: 'pickup', tier: 'bronze' },
          { kind: 'littleOne' },
        ],
      },
    });
    expect(out.version).toBe(SAVE_VERSION);
    expect(out.state.tally).toEqual({ deliveries: 2, littleOnes: 1 });
    expect(out.state.badges).toEqual({});
  });
});
