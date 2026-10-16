import { describe, expect, it } from 'vitest';
import { createNewGame } from '../src/game/state';
import {
  ageInDays,
  cleanName,
  familyGenerations,
  namePet,
  needsName,
  pedigree,
  rememberPet,
  setOwner,
  suggestName,
} from '../src/game/family';
import { growUp } from '../src/game/growth';
import { migrate, SAVE_VERSION } from '../src/storage/storage';
import { newTeen } from './helpers';

const START = 1_700_000_000_000;

describe('naming the pet', () => {
  it('an egg has no name yet, and is asked for one once it hatches', () => {
    const s = createNewGame(START);
    expect(s.pet.name).toBe('');
    expect(needsName(s)).toBe(false);
    growUp(s.pet, START);
    expect(s.pet.stage).toBe('baby');
    expect(needsName(s)).toBe(true);
  });

  it('saves a tidied name and stops asking', () => {
    const s = newTeen(START);
    const { state, blocked } = namePet(s, '   Little   Pip  ');
    expect(blocked).toBeUndefined();
    expect(state.pet.name).toBe('Little Pip');
    expect(needsName(state)).toBe(false);
  });

  it('refuses a blank name', () => {
    const s = newTeen(START);
    const result = namePet(s, '   ');
    expect(result.blocked).toBe('empty');
    expect(result.state).toBe(s);
  });

  it('keeps names short, counting emoji as one letter', () => {
    expect(cleanName('Supercalifragilistic')).toBe('Supercalifra');
    expect(cleanName('🐣🐣🐣🐣🐣🐣🐣🐣🐣🐣🐣🐣🐣')).toBe('🐣'.repeat(12));
  });

  it('suggests a name that is different from the one typed', () => {
    const names = ['Pip', 'Bean'];
    expect(suggestName(names, 0.99, 'Pip')).toBe('Bean');
    expect(suggestName(names, 0, 'Bean')).toBe('Pip');
  });
});

describe('owner name', () => {
  it('is optional and tidied', () => {
    const s = createNewGame(START);
    expect(s.owner).toBe('');
    expect(setOwner(s, '  siye ').owner).toBe('siye');
    expect(setOwner(s, '   ').owner).toBe('');
  });
});

describe('the Family Tree', () => {
  it('a first pet is generation 1 on its own', () => {
    const s = namePet(setOwner(newTeen(START), 'siye'), 'Pip').state;
    const gens = familyGenerations(s);
    expect(gens).toHaveLength(1);
    expect(gens[0].number).toBe(1);
    expect(gens[0].members).toMatchObject([{ name: 'Pip', owner: 'siye', stage: 'teen', current: true, parents: [] }]);
  });

  it('puts earlier generations first, and parents can come from other players', () => {
    const s = newTeen(START);
    const grandma = { ...rememberPet(createNewGame(START).pet, 'siye'), name: 'Nori', character: 'pebblit' };
    const friend = { ...rememberPet(createNewGame(START).pet, 'alex'), name: 'Fig', fromFriend: true };
    const mum = { ...rememberPet(createNewGame(START + 1).pet, 'siye'), name: 'Bean', generation: 2, parents: [grandma.id, friend.id] };
    s.family = [mum, grandma, friend];
    s.pet.generation = 3;
    s.pet.parents = [mum.id];
    const gens = familyGenerations(s);
    expect(gens.map((g) => g.number)).toEqual([1, 2, 3]);
    expect(gens[0].members.map((m) => m.owner)).toEqual(['siye', 'alex']);
    expect(gens[1].members[0]).toMatchObject({ name: 'Bean', stage: 'adult', current: false });
    expect(gens[2].members[0].current).toBe(true);
  });

  it('counts age in whole days', () => {
    expect(ageInDays(START, START + 3_600_000)).toBe(0);
    expect(ageInDays(START, START + 2.5 * 86_400_000)).toBe(2);
  });
});

describe('the Tree view', () => {
  // Nori + Fig (alex's) -> Bean and Tofu; Bean + Kiwi -> the pet you have now.
  function family() {
    const s = namePet(newTeen(START), 'Pip').state;
    const pet = (name: string, generation: number, parents: string[] = [], fromFriend = false) => ({
      ...rememberPet(createNewGame(START + generation).pet, fromFriend ? 'alex' : ''),
      name, generation, parents, fromFriend,
    });
    const nori = pet('Nori', 1);
    const fig = pet('Fig', 1, [], true);
    const bean = pet('Bean', 2, [nori.id, fig.id]);
    const tofu = pet('Tofu', 2, [fig.id, nori.id]);
    const kiwi = pet('Kiwi', 2, [], true);
    s.family = [nori, fig, bean, tofu, kiwi];
    s.pet.generation = 3;
    s.pet.parents = [bean.id, kiwi.id];
    return { s, nori, fig, bean, tofu, kiwi };
  }

  it('starts at your pet, with its parents and grandparents', () => {
    const { s } = family();
    const p = pedigree(s, null);
    expect(p.focus.name).toBe('Pip');
    expect(p.parents.map((m) => m?.name)).toEqual(['Bean', 'Kiwi']);
    expect(p.grandparents.map((g) => g.map((m) => m?.name))).toEqual([['Nori', 'Fig'], []]);
    expect(p.siblings).toEqual([]);
  });

  it('can move to another pet, showing its brothers, sisters and little ones', () => {
    const { s, bean } = family();
    const p = pedigree(s, bean.id);
    expect(p.focus.name).toBe('Bean');
    expect(p.siblings.map((m) => m.name)).toEqual(['Tofu']); // same parents, in any order
    expect(p.children.map((m) => m.name)).toEqual(['Pip']);
  });

  it('shows a parent that was never saved as an empty spot', () => {
    const { s } = family();
    s.pet.parents = ['gone', s.family[0].id];
    expect(pedigree(s, null).parents.map((m) => m?.name ?? null)).toEqual([null, 'Nori']);
  });

  it('a first pet has no parents', () => {
    const p = pedigree(newTeen(START), null);
    expect(p.parents).toEqual([]);
    expect(p.focus.current).toBe(true);
  });
});

describe('save version 9', () => {
  it('asks a pet that already hatched for its name once, keeping the old one', () => {
    const out = migrate({ version: 8, state: { pet: { name: 'Mochi', stage: 'teen' } } });
    expect(out.version).toBe(SAVE_VERSION);
    expect(out.state.pet).toMatchObject({ name: 'Mochi', named: false, generation: 1, parents: [] });
    expect(out.state.owner).toBe('');
    expect(out.state.family).toEqual([]);
  });

  it("clears an egg's placeholder name", () => {
    const out = migrate({ version: 8, state: { pet: { name: 'Mochi', stage: 'egg' } } });
    expect(out.state.pet.name).toBe('');
  });
});
