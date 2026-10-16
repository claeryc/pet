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

  it('gives old saves an empty recipe book', () => {
    const out = migrate({ version: 6, state: { pet: {}, inventory: { food: {}, hats: [] } } });
    expect(out.version).toBe(SAVE_VERSION);
    expect(out.state.recipesFound).toEqual([]);
  });
});

describe('save migration to unlockable menus', () => {
  it('keeps what an existing player already had open, without "new" dots', () => {
    const out = migrate({
      version: 7,
      state: {
        pet: { stage: 'adult', character: 'sprig', variant: null },
        inventory: { food: { salmon: 2 }, hats: [] },
        recipesFound: [],
      },
    });
    expect(out.version).toBe(SAVE_VERSION);
    expect(out.state.caught).toEqual(['salmon']);
    expect(out.state.charactersFound).toEqual(['sprig']);
    expect(out.state.unlocked).toEqual(expect.arrayContaining(['shop', 'cooking', 'collection', 'familyTree']));
    expect(out.state.seen).toEqual(out.state.unlocked);
    expect(out.state.recentFoods).toEqual([]);
    expect(out.state.showAllMenus).toBe(false);
  });
});
