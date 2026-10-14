import { describe, expect, it } from 'vitest';
import { migrate, SAVE_VERSION } from '../src/storage/storage';

describe('save migration', () => {
  it('upgrades a version 1 save without losing the pet', () => {
    const v1 = {
      version: 1,
      state: {
        pet: { id: 'abc', name: 'Mochi', bornAt: 1, stats: { hunger: 40, happiness: 60 } },
        lastUpdated: 1000,
      },
    };
    const out = migrate(v1);
    expect(out.version).toBe(SAVE_VERSION);
    expect(out.state.pet.id).toBe('abc');
    expect(out.state.pet.stats.hunger).toBe(40);
    expect(out.state.pet.stats.energy).toBeTypeOf('number');
    expect(out.state.pet.condition).toBe('healthy');
    expect(out.state.clockOffsetMs).toBe(0);
  });
});
