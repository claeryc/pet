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
    expect(out.state.pet.buffs).toEqual([]);
    expect(out.state.pet.stage).toBe('baby');
  });

  it('moves an old adult form to a new character', () => {
    const v4 = {
      version: 4,
      state: { pet: { id: 'x', stage: 'adult', formId: 'sunny' }, lastUpdated: 1 },
    };
    const out = migrate(v4);
    expect(out.version).toBe(SAVE_VERSION);
    expect(out.state.pet.character).toBe('starwisp');
    expect(out.state.pet.variant).toBeNull();
    expect(out.state.pet.formId).toBeUndefined();
  });

  it('keeps young pets without a character', () => {
    const out = migrate({ version: 4, state: { pet: { stage: 'teen', formId: 'teen' } } });
    expect(out.state.pet.character).toBeNull();
  });

  it('gives old saves gold, an inventory and no hat', () => {
    const out = migrate({ version: 5, state: { pet: { stage: 'teen', character: null } } });
    expect(out.version).toBe(SAVE_VERSION);
    expect(out.state.gold).toBeGreaterThan(0);
    expect(out.state.inventory.hats).toEqual([]);
    expect(out.state.pet.hat).toBeNull();
  });
});
