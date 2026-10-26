import { describe, expect, it } from 'vitest';
import { createNewGame } from '../src/game/state';
import { migrate, SAVE_VERSION } from '../src/storage/storage';
import { rollTrait } from '../src/game/traits';

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
    expect(out.state.pet.character).toBe('starhoot'); // sunny -> starwisp -> starhoot
    expect(out.state.pet.variant).toBeNull();
    expect(out.state.pet.formId).toBeUndefined();
  });

  it('moves retired characters and themes to the starter themes', () => {
    const s: any = createNewGame(1);
    s.pet = { ...s.pet, stage: 'adult', character: 'cloudlet', themes: ['basic', 'sparkle'], parentLooks: [{ character: 'glimmer', variant: null }] };
    s.housemates = [{ ...s.pet, id: 'h', character: 'bunbun', themes: [], parentLooks: [] }];
    s.family = [{ id: 'f', character: 'starwisp' }, { id: 'g', character: 'pebblit', variant: 'amber' }];
    s.friends = [{ id: 'w', character: 'mosscap' }];
    s.visit = { ...s.visit, guest: { id: 'v', character: 'fernwhisk' } };
    s.messages = [{ kind: 'visitor', character: 'glimmer' }];
    s.charactersFound = ['cloudlet', 'glimmer', 'pebblit:amber', 'dumpling', 'starwisp'];
    const out = migrate({ version: 23, state: s }).state;
    expect(out.pet.character).toBe('cuppie'); // the old 3-star Basic Cloudlet
    expect(out.pet.themes).toEqual(['bakery', 'starry']);
    expect(out.pet.parentLooks[0].character).toBe('cloudlet'); // the old Glimmer
    expect(out.housemates[0].character).toBe('puddling');
    expect(out.family.map((m: any) => m.character)).toEqual(['starhoot', 'pebblit']);
    expect(out.friends[0].character).toBe('acornet');
    expect(out.visit.guest.character).toBe('ribbit'); // fernwhisk -> stumpy -> ribbit
    expect(out.messages[0].character).toBe('cloudlet');
    expect(out.charactersFound).toEqual(['cuppie', 'cloudlet', 'pebblit:amber', 'dumpling', 'starhoot']);
  });

  it('turns Stumpy into Ribbit, with a trait Ribbit allows', () => {
    const s: any = createNewGame(1);
    s.pet = { ...s.pet, stage: 'adult', character: 'stumpy', trait: 'shy', parentLooks: [{ character: 'stumpy', variant: null }] };
    s.housemates = [{ ...s.pet, id: 'h', character: 'sprig', trait: 'shy', parentLooks: [] }];
    s.family = [{ id: 'f', character: 'stumpy', trait: 'greedy' }];
    s.friends = [{ id: 'w', character: 'stumpy' }];
    s.visit = { ...s.visit, guest: { id: 'v', character: 'stumpy' } };
    s.messages = [{ kind: 'visitor', character: 'stumpy' }];
    s.charactersFound = ['sprig', 'stumpy', 'ribbit'];
    s.charactersMet = ['stumpy'];
    const out = migrate({ version: 29, state: s }).state;
    expect(out.pet.character).toBe('ribbit');
    expect(['playful', 'greedy']).toContain(out.pet.trait);
    expect(out.pet.parentLooks[0].character).toBe('ribbit');
    expect(out.housemates[0]).toMatchObject({ character: 'sprig', trait: 'shy' });
    expect(out.family[0]).toMatchObject({ character: 'ribbit', trait: 'greedy' });
    expect(out.friends[0].character).toBe('ribbit');
    expect(out.visit.guest.character).toBe('ribbit');
    expect(out.messages[0].character).toBe('ribbit');
    expect(out.charactersFound).toEqual(['sprig', 'ribbit']);
    expect(out.charactersMet).toEqual(['ribbit']);
  });

  it('gives every pet, and the Family Tree, a trait', () => {
    const s: any = createNewGame(1);
    delete s.pet.trait;
    s.housemates = [{ ...s.pet, id: 'h' }];
    s.family = [{ id: 'f', character: 'sprig' }, { id: 'g', character: 'sprig', trait: 'shy' }];
    const out = migrate({ version: 24, state: s }).state;
    expect(out.pet.trait).toBe(rollTrait(s.pet.id));
    expect(out.housemates[0].trait).toBe(rollTrait('h'));
    expect(out.family.map((m: any) => m.trait)).toEqual([rollTrait('f'), 'shy']);
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

describe("save migration to Percy's orders", () => {
  it('starts with no order and no messages, and counts crops in the pantry as grown', () => {
    const out = migrate({
      version: 10,
      state: { pet: { stage: 'teen' }, inventory: { food: { carrot: 2, shrimp: 1 }, hats: [], seeds: {}, supplies: {} } },
    });
    expect(out.version).toBe(SAVE_VERSION);
    expect(out.state.grown).toEqual(['carrot']);
    expect(out.state.delivery).toEqual({ order: null, nextAt: 0 });
    expect(out.state.messages).toEqual([]);
    expect(out.state.messagesSeenAt).toBe(0);
  });
});

describe('save migration to cravings', () => {
  it('starts with no craving, so the first one comes right away', () => {
    const out = migrate({ version: 11, state: { pet: { stage: 'teen' } } });
    expect(out.version).toBe(SAVE_VERSION);
    expect(out.state.craving).toEqual({ food: null, until: 0, nextAt: 0, last: null });
  });
});

describe('save migration to the Shop extras', () => {
  it('gives older saves a plain room, no decor and a fresh stock', () => {
    const out = migrate({ version: 13, state: { pet: { stage: 'teen' }, inventory: { food: {}, hats: [], seeds: {}, supplies: {} } } });
    expect(out.version).toBe(SAVE_VERSION);
    expect(out.state.inventory.decor).toEqual([]);
    expect(out.state.room).toEqual({ wallpaper: 'plain', curtains: null });
    expect(out.state.stock).toEqual({ day: '', bought: 0 });
    expect(out.state.baitOn).toBe(false);
  });
});

describe('save migration to the daily fishing limit', () => {
  it('starts with no fish counted today', () => {
    const out = migrate({ version: 30, state: { pet: { stage: 'teen' } } });
    expect(out.version).toBe(SAVE_VERSION);
    expect(out.state.pond).toEqual({ day: '', fish: 0 });
  });
});
