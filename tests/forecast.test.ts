import { describe, expect, it } from 'vitest';
import { CONFIG } from '../src/game/config';
import { createNewGame, type Friend, type Pet } from '../src/game/state';
import { chooseCharacter, getCharacter } from '../src/game/growth';
import { forecast } from '../src/game/forecast';
import { carriedOf, inheritanceOf } from '../src/game/genes';
import { makeWanderer } from '../src/game/friends';

const NOON = new Date(2026, 0, 10, 12, 0).getTime();

function parents(pet: Partial<Pet>, friend: Partial<Friend>): { pet: Pet; friend: Friend } {
  const s = createNewGame(NOON);
  return {
    pet: { ...s.pet, stage: 'adult', character: 'pebblit', variant: null, carried: { theme: 'starry', variant: null }, ...pet },
    friend: { ...makeWanderer(NOON, []), score: 100, character: 'sprig', variant: 'autumn', carried: { theme: 'bakery', variant: 'dumpling:matcha' }, ...friend },
  };
}

// What chooseCharacter really picks for many little ones of these parents,
// raised with great care.
function sampled(pet: Pet, friend: Friend, n = 6000) {
  const ps = [pet, friend];
  const looks = ps.map((p) => ({ character: p.character, variant: p.variant }));
  const themes = [...new Set(ps.map((p) => getCharacter(p.character)!.theme))];
  const family = inheritanceOf({ themes, parentLooks: looks, parentCarried: ps.map((p) => carriedOf(p)) });
  const picks = Array.from({ length: n }, (_, i) => chooseCharacter(CONFIG.rarity[0].minCare, `kid-${i}`, family, looks));
  const theme = (t: string) => (picks.filter((r) => r.character.theme === t).length / n) * 100;
  const variant = (c: string, v: string) => (picks.filter((r) => r.character.id === c && r.variant?.id === v).length / n) * 100;
  return { theme, variant };
}

describe('the forecast before mingling', () => {
  it('matches what the game really rolls, theme by theme', () => {
    const { pet, friend } = parents({}, {});
    const f = forecast(pet, friend);
    const real = sampled(pet, friend);
    expect(f.themes.reduce((sum, t) => sum + t.chance, 0)).toBeCloseTo(100, 0);
    for (const t of f.themes) expect(Math.abs(t.chance - real.theme(t.theme))).toBeLessThan(2.5);
    // Cave is a later pack, so the Pebblit parent's theme can't come up.
    expect(f.themes.map((t) => t.theme)).not.toContain('cave');
    expect(f.themes[0].theme).toBe('nature');
    expect(f.themes[0].element).toBe('land');
  });

  it('lists the family\'s colour variants with their real chances', () => {
    const { pet, friend } = parents({}, {});
    const f = forecast(pet, friend);
    const real = sampled(pet, friend);
    expect(f.variants.map((v) => `${v.character}:${v.variant}`).sort()).toEqual(['dumpling:matcha', 'sprig:autumn']);
    for (const v of f.variants) expect(Math.abs(v.chance - real.variant(v.character, v.variant))).toBeLessThan(1.5);
  });

  it('shows great-care rarity odds, better for two 3-star parents', () => {
    const plain = forecast(...Object.values(parents({}, {})) as [Pet, Friend]);
    expect(plain.stars).toEqual(CONFIG.rarity[0].odds);
    const stars = forecast(...Object.values(parents({ character: 'stumpy' }, { character: 'tidecrest', variant: null })) as [Pet, Friend]);
    expect(stars.stars).toEqual(CONFIG.rarityStarParents[0].odds);
  });

  it('gives the chance of a little one from the friend\'s hearts', () => {
    const { pet, friend } = parents({}, { score: 70 });
    expect(forecast(pet, friend).littleOne).toBe(50);
  });
});
