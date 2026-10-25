import { describe, expect, it } from 'vitest';
import { CONFIG } from '../src/game/config';
import { createNewGame, newPet, type GameState } from '../src/game/state';
import { CHARACTERS, ELEMENTS, THEMES, characterOfStars, chooseCharacter, elementOf, getCharacter, growUp } from '../src/game/growth';
import { carriedOf, genesAtGrowUp, inheritanceOf, variantKey } from '../src/game/genes';
import { makeWanderer, mingle, rememberFriend } from '../src/game/friends';
import { familyGenerations, rememberPet } from '../src/game/family';
import { migrate, SAVE_VERSION } from '../src/storage/storage';

const DAY = 86_400_000;
const NOON = new Date(2026, 0, 10, 12, 0).getTime();
const ids = Array.from({ length: 2000 }, (_, i) => `pet-${i}`);
const share = (hits: number) => (hits / ids.length) * 100;

describe('elements', () => {
  it('every theme, later packs too, belongs to one of the elements', () => {
    for (const theme of Object.keys(THEMES)) expect(ELEMENTS[elementOf(theme)!]).toBeTypeOf('string');
    expect(elementOf('nature')).toBe(elementOf('cave'));
    expect(elementOf('nobody')).toBeNull();
  });
});

describe('carried genes', () => {
  it('a wanderer carries a theme it does not show, the same one every time', () => {
    for (let i = 0; i < 50; i++) {
      const w = makeWanderer(NOON + i * DAY, []);
      expect(w.carried).toEqual(carriedOf({ id: w.id, character: w.character, variant: w.variant }));
      expect(w.carried!.theme).not.toBe(getCharacter(w.character)!.theme);
      if (w.carried!.variant) expect(w.carried!.variant).not.toBe(variantKey(w.character, w.variant));
    }
  });

  it('a friend from before genes rolls its genes from its id', () => {
    const old = { id: 'old-friend', character: 'bubbit', variant: null };
    expect(carriedOf(old)).toEqual(carriedOf({ ...old }));
    expect(carriedOf(old).theme).not.toBe('ocean');
  });

  it('only some first pets and wanderers carry a colour variant', () => {
    const carrying = ids.filter((id) => carriedOf({ id, character: 'bubbit' }).variant).length;
    expect(share(carrying)).toBeGreaterThan(CONFIG.genes.wildVariantChance / 2);
    expect(share(carrying)).toBeLessThan(CONFIG.genes.wildVariantChance * 2);
  });

  it('a little one carries one of its family\'s themes and variants that it does not show', () => {
    const sprig = getCharacter('sprig')!;
    const family = {
      parents: ['a', 'b'],
      themes: ['nature', 'ocean'],
      parentLooks: [{ character: 'sprig', variant: 'autumn' }, { character: 'bubbit', variant: null }],
      parentCarried: [{ theme: 'starry', variant: null }, { theme: 'nature', variant: 'pebblit:amber' }],
    };
    for (const id of ids.slice(0, 200)) {
      const genes = genesAtGrowUp({ id, ...family }, sprig, null);
      expect(['ocean', 'starry']).toContain(genes.theme);
      expect(['sprig:autumn', 'pebblit:amber']).toContain(genes.variant);
      // It shows Autumn itself, so that's not carried.
      expect(genesAtGrowUp({ id, ...family }, sprig, 'autumn').variant).toBe('pebblit:amber');
    }
  });
});

describe('inheritance', () => {
  it('lists the themes parents show, the ones only carried, and every variant', () => {
    const family = inheritanceOf({
      themes: ['ocean'],
      parentLooks: [{ character: 'bubbit', variant: null }, { character: 'sprig', variant: 'autumn' }],
      parentCarried: [{ theme: 'ocean', variant: null }, { theme: 'bakery', variant: 'moonpip:dawn' }],
    });
    expect(family).toEqual({ themes: ['ocean'], carriedThemes: ['bakery'], variants: ['sprig:autumn', 'moonpip:dawn'] });
  });

  it('a carried theme comes back now and then, but parents\' shown themes win', () => {
    const picks = ids.map((id) => chooseCharacter(90, id, { themes: ['ocean'], carriedThemes: ['bakery'] }).character.theme);
    const ocean = share(picks.filter((t) => t === 'ocean').length);
    const bakery = share(picks.filter((t) => t === 'bakery').length);
    // Never a theme from nowhere.
    expect(ocean + bakery).toBe(100);
    const expected = CONFIG.inheritance.outsideThemeChance;
    expect(bakery).toBeGreaterThan(expected - 4);
    expect(bakery).toBeLessThan(expected + 4);
  });

  it('a colour variant a parent has comes back more often than its usual chance', () => {
    const nature = { themes: ['nature'] };
    const autumn = (family: object) =>
      share(ids.map((id) => characterOfStars(1, id, family)).filter((r) => r.character.id === 'sprig' && r.variant?.id === 'autumn').length);
    const sprigs = share(ids.map((id) => characterOfStars(1, id, nature)).filter((r) => r.character.id === 'sprig').length);
    const usual = autumn(nature) / sprigs;
    const withGene = autumn({ ...nature, variants: ['sprig:autumn'] }) / sprigs;
    expect(withGene).toBeGreaterThan(usual + CONFIG.genes.variantChance / 200);
    // A variant of another character doesn't help a Sprig.
    expect(autumn({ ...nature, variants: ['pebblit:amber'] }) / sprigs).toBeCloseTo(usual, 5);
  });

  it('with no family it picks just as before', () => {
    expect(chooseCharacter(60, 'abc', {})).toEqual(chooseCharacter(60, 'abc'));
  });
});

// A game with a grown-up pet and a friend over, ready to mingle.
function readyToMingle(): { state: GameState; friendId: string } {
  const s = createNewGame(NOON - 5 * DAY);
  s.lastUpdated = NOON;
  s.pet = { ...s.pet, stage: 'adult', character: 'pebblit', name: 'Mochi', named: true, carried: { theme: 'starry', variant: null } };
  s.pet.stats = { hunger: 90, happiness: 90, health: 100, energy: 90 };
  const friend = { ...makeWanderer(NOON - DAY, []), score: 100, character: 'sprig', variant: 'autumn', carried: { theme: 'bakery', variant: 'dumpling:matcha' } };
  return { state: { ...s, friends: [friend], visit: { ...s.visit, friendId: friend.id, until: NOON + 30 * DAY } }, friendId: friend.id };
}

describe('mingling passes genes on', () => {
  it('the egg remembers what both parents carry, and gets its own genes when it grows up', () => {
    const { state, friendId } = readyToMingle();
    const { egg, state: after } = mingle(state, friendId, NOON, 0);
    expect(egg!.parentCarried).toEqual([{ theme: 'starry', variant: null }, { theme: 'bakery', variant: 'dumpling:matcha' }]);
    expect(egg!.carried).toBeNull();
    expect(after.family.find((m) => m.id === friendId)!.carried).toEqual({ theme: 'bakery', variant: 'dumpling:matcha' });

    const pet = { ...egg!, stage: 'teen' as const };
    growUp(pet, NOON + DAY);
    const theme = getCharacter(pet.character)!.theme;
    expect(pet.carried).not.toBeNull();
    expect(pet.carried!.theme).not.toBe(theme);
    expect(['cave', 'nature', 'starry', 'bakery']).toContain(pet.carried!.theme);
    expect(['sprig:autumn', 'dumpling:matcha']).toContain(pet.carried!.variant);
  });

  it('a first pet carries rolled genes once it grows up', () => {
    const pet = { ...newPet(NOON), stage: 'teen' as const };
    growUp(pet, NOON);
    expect(pet.carried).toEqual(genesAtGrowUp(pet, getCharacter(pet.character)!, pet.variant));
    expect(pet.carried!.theme).not.toBe(getCharacter(pet.character)!.theme);
  });

  it('the Family Tree knows what grown-ups carry', () => {
    const { state } = readyToMingle();
    expect(rememberPet(state.pet, '').carried).toEqual({ theme: 'starry', variant: null });
    expect(rememberPet({ ...state.pet, stage: 'teen' }, '').carried).toBeUndefined();
    expect(rememberFriend(state.friends[0]).carried).toEqual(state.friends[0].carried);
    const me = familyGenerations(state).flatMap((g) => g.members).find((m) => m.current)!;
    expect(me.carried).toEqual({ theme: 'starry', variant: null });
  });
});

describe('save migration to genes', () => {
  it('fills in what parents carry, and what a grown-up carries', () => {
    const s: any = createNewGame(1);
    const friend = { id: 'w', character: 'bubbit', variant: null };
    s.friends = [friend];
    s.family = [{ id: 'mum', character: 'sprig', variant: 'autumn' }];
    s.pet = { ...s.pet, stage: 'adult', character: 'sprig', variant: null, parents: ['mum', 'w'], themes: ['nature', 'ocean'],
      parentLooks: [{ character: 'sprig', variant: 'autumn' }, { character: 'bubbit', variant: null }] };
    s.housemates = [{ ...s.pet, id: 'kid', stage: 'egg', character: null, parents: ['mum', 'gone'] }];
    delete s.pet.carried;
    delete s.pet.parentCarried;
    const out = migrate({ version: 26, state: s });
    expect(out.version).toBe(SAVE_VERSION);
    expect(out.state.pet.parentCarried).toEqual([carriedOf(s.family[0]), carriedOf(friend)]);
    expect(out.state.pet.carried.theme).not.toBe('nature');
    expect(out.state.pet.carried.variant).not.toBeUndefined();
    expect(out.state.housemates[0].carried).toBeNull();
    expect(out.state.housemates[0].parentCarried).toEqual([carriedOf(s.family[0]), carriedOf({ id: 'gone' })]);
  });
});

it('every character with variants keeps its variant keys unique', () => {
  const keys = CHARACTERS.flatMap((c) => (c.variants ?? []).map((v) => variantKey(c.id, v.id)));
  expect(new Set(keys).size).toBe(keys.length);
});
