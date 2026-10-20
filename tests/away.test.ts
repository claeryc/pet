import { describe, expect, it } from 'vitest';
import { awayNotes } from '../src/game/away';
import { emptyPlot, growMs } from '../src/game/garden';
import { newTeen } from './helpers';

const HOUR = 3_600_000;

describe('awayNotes', () => {
  const now = Date.UTC(2026, 9, 19, 12);

  it('says nothing after a short break', () => {
    const before = newTeen(now - 10 * HOUR);
    const after = structuredClone(before);
    after.pet.stats.hunger = 5;
    expect(awayNotes(before, after, now - 10 * 60_000, now)).toEqual([]);
  });

  it('says nothing when nothing happened', () => {
    const before = newTeen(now - 10 * HOUR);
    expect(awayNotes(before, structuredClone(before), now - 5 * HOUR, now)).toEqual([]);
  });

  it('tells you about plants that got ready or dried out', () => {
    const before = newTeen(now - 10 * HOUR);
    before.garden = [
      { ...emptyPlot(), crop: 'carrot', growth: growMs('carrot') - HOUR, moistUntil: now, rollsFrom: now - 5 * HOUR },
      { ...emptyPlot(), crop: 'carrot', growth: 0, moistUntil: now - HOUR, rollsFrom: now - 5 * HOUR },
    ];
    const after = structuredClone(before);
    after.garden[0].growth = growMs('carrot');
    expect(awayNotes(before, after, now - 5 * HOUR, now)).toEqual([
      { kind: 'ready', count: 1, crop: 'carrot' },
      { kind: 'dry', count: 1, crop: 'carrot' },
    ]);
  });

  it('tells you about a craving that came and went, and one going on now', () => {
    const before = newTeen(now - 10 * HOUR);
    before.craving = { food: 'strawberry', until: now - 4 * HOUR, nextAt: 0, last: 'strawberry' };
    const after = structuredClone(before);
    after.craving = { food: 'salmon', until: now + HOUR, nextAt: 0, last: 'salmon' };
    expect(awayNotes(before, after, now - 5 * HOUR, now)).toEqual([
      { kind: 'missedCraving', food: 'strawberry' },
      { kind: 'craving', food: 'salmon' },
    ]);
  });

  it('tells you when the pet got sick or a need ran low', () => {
    const before = newTeen(now - 10 * HOUR);
    const after = structuredClone(before);
    after.pet.condition = 'sick';
    after.pet.stats.hunger = 10;
    expect(awayNotes(before, after, now - 5 * HOUR, now)).toEqual([{ kind: 'sick' }, { kind: 'low', stat: 'hunger' }]);
  });
});
