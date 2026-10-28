import { describe, expect, it } from 'vitest';
import { newTeen } from './helpers';
import { CONFIG } from '../src/game/config';
import { feed, type Food } from '../src/game/actions';
import { cook, RECIPES } from '../src/game/cooking';
import { getPlace, lunchFinds, rollFinds, tripPreview, type Place } from '../src/game/journeys';
import { reelPerks } from '../src/game/skills';

const START = new Date(2026, 0, 1, 10, 0).getTime();
const HOUR = 3_600_000;
const foods = CONFIG.foods as readonly Food[];
const food = (id: string) => foods.find((f) => f.id === id)!;
const dishes = foods.filter((f) => f.source === 'cooked' && f.id !== CONFIG.cooking.mess);

describe('what dishes do besides their stats', () => {
  it('only a few dishes have an effect', () => {
    const special = dishes.filter((f) => (f.effects ?? []).length > 0);
    expect(special.length).toBeLessThanOrEqual(Math.ceil(dishes.length / 3));
  });

  it('nothing cooked gives energy (that is the energy drink\'s job)', () => {
    for (const f of dishes) expect(f.energy ?? 0, f.id).toBe(0);
  });

  it('a timed effect replaces the one before', () => {
    const s = newTeen(START);
    s.pet.stats.hunger = 20;
    s.inventory.food = { heartyStew: 1, berryShortcake: 1 };
    const stew = feed(s, START, 'heartyStew').state;
    expect(stew.pet.buffs).toEqual([{ stat: 'hunger', percent: 20, until: START + 6 * HOUR }]);
    stew.pet.stats.hunger = 20;
    const cake = feed(stew, START + 60_000, 'berryShortcake').state;
    expect(cake.pet.buffs).toEqual([{ stat: 'happiness', percent: 20, until: START + 60_000 + 4 * HOUR }]);
  });

  it('salt-baked lobster widens the green stripe for a while', () => {
    const s = newTeen(START);
    s.inventory.food = { saltBakedLobster: 1 };
    const before = reelPerks(s).widen;
    const fed = feed(s, START, 'saltBakedLobster').state;
    expect(reelPerks(fed).widen).toBeCloseTo(before + 0.2);
  });

  it('a dish made with a place\'s ingredient finds one more there, once', () => {
    const market = getPlace('market') as Place;
    expect(lunchFinds(['honeyCake'], 'market')).toBe(1);
    expect(lunchFinds(['honeyCake', 'honeyCake'], 'market')).toBe(1);
    expect(lunchFinds(['honeyCake'], 'woods')).toBe(0);
    expect(lunchFinds(['honeyMilk'], 'market')).toBe(0); // the second honey recipe stays plain
    expect(tripPreview(market, 'rare', null, ['honeyCake']).finds.min).toBe(tripPreview(market, 'rare').finds.min + 1);
    const pet = newTeen(START).pet;
    const count = (lunch: string[]) => rollFinds(pet, market, 'rare', START, null, lunch).reduce((n, f) => n + (f.kind === 'gold' ? 1 : f.count), 0);
    expect(count(['honeyCake'])).toBe(count([]) + 1);
  });
});

describe('dishes made from dishes', () => {
  it('a bento is made from shrimp onigiri, grilled salmon and a carrot', () => {
    expect(RECIPES.find((r) => r.id === 'bento')!.ingredients).toContain('shrimpOnigiri');
    const s = newTeen(START);
    s.inventory.food = { shrimpOnigiri: 1, grilledSalmon: 1, carrot: 1 };
    const r = cook(s, ['carrot', 'grilledSalmon', 'shrimpOnigiri']);
    if (r.blocked) throw new Error(r.blocked);
    expect(r.dish).toBe('bento');
    expect(r.state.inventory.food).toMatchObject({ shrimpOnigiri: 0, grilledSalmon: 0, carrot: 0, bento: 1 });
    expect(food('bento').stars).toBe(3);
  });
});
