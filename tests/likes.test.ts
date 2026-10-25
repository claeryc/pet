import { describe, expect, it } from 'vitest';
import { CONFIG } from '../src/game/config';
import { feed, play, toggleLights } from '../src/game/actions';
import { bathe, smellNow } from '../src/game/hygiene';
import { FAVOURITE_FOODS, feeling, likesOf, rollLikes } from '../src/game/likes';
import { rememberPet } from '../src/game/family';
import { migrate } from '../src/storage/storage';
import type { FoodId } from '../src/game/actions';
import type { GameState } from '../src/game/state';
import { newTeen } from './helpers';

const START = new Date(2026, 0, 1, 10, 0).getTime();
const ids = Array.from({ length: 300 }, (_, i) => `pet-${i}`);

function withLikes(likes: Partial<ReturnType<typeof rollLikes>>): GameState {
  const s = newTeen(START);
  s.pet.likes = { ...s.pet.likes, ...likes, found: [] };
  return s;
}

describe('rolling likes', () => {
  it('never changes for the same pet', () => {
    expect(rollLikes('abc')).toEqual(rollLikes('abc'));
  });

  it('picks a paid food, an activity and a dislike that is never the favourite', () => {
    const activities = CONFIG.activities.map((a) => a.id as string);
    for (const id of ids) {
      const likes = rollLikes(id);
      expect(FAVOURITE_FOODS).toContain(likes.food);
      expect(likes.food).not.toBe('riceBall');
      expect(activities).toContain(likes.play);
      expect(likes.dislike).not.toBe(likes.food);
      expect(likes.found).toEqual([]);
    }
  });

  it('spreads dislikes over baths, being woken and foods', () => {
    const dislikes = ids.map((id) => rollLikes(id).dislike);
    const baths = dislikes.filter((d) => d === 'bath').length;
    const woken = dislikes.filter((d) => d === 'woken').length;
    for (const n of [baths, woken, dislikes.length - baths - woken]) expect(n).toBeGreaterThan(ids.length / 5);
  });

  it('often gives a little one a parent’s favourite food', () => {
    const inherited = ids.filter((id) => rollLikes(id, ['strawberry', 'strawberry']).food === 'strawberry').length;
    expect(inherited).toBeGreaterThan(ids.length * 0.4);
  });

  it('gives a new pet its likes', () => {
    expect(newTeen(START).pet.likes.food).toBeTruthy();
  });
});

describe('showing likes', () => {
  it('loves its favourite food and writes it down once', () => {
    const s = withLikes({ food: 'strawberry', dislike: 'bath' });
    s.inventory.food.strawberry = 2;
    const first = feed(s, START + 1000, 'strawberry' as FoodId);
    expect(first.felt).toBe('loved');
    expect(first.state.pet.likes.found).toEqual(['food']);
    const again = feed(first.state, START + 2000, 'strawberry' as FoodId);
    expect(again.state.pet.likes.found).toEqual(['food']);
  });

  it('dislikes its disliked food', () => {
    const s = withLikes({ food: 'strawberry', dislike: 'cookie' });
    s.inventory.food.cookie = 1;
    const result = feed(s, START + 1000, 'cookie' as FoodId);
    expect(result.felt).toBe('disliked');
    expect(result.state.pet.likes.found).toEqual(['dislike']);
  });

  it('feels nothing about other food, and finds nothing', () => {
    const s = withLikes({ food: 'strawberry', dislike: 'bath' });
    const result = feed(s, START + 1000, 'riceBall');
    expect(result.felt).toBeUndefined();
    expect(result.state.pet.likes.found).toEqual([]);
  });

  it('loves its favourite way to play', () => {
    const s = withLikes({ play: 'tickle' });
    expect(play(s, START + 1000, 'tickle').felt).toBe('loved');
    expect(play(s, START + 1000, 'cuddle').felt).toBeUndefined();
  });

  it('is grumpy after a bath if it dislikes baths', () => {
    const s = smellNow(withLikes({ dislike: 'bath' }));
    const result = bathe(s, START);
    expect(result.felt).toBe('disliked');
    expect(result.state.pet.likes.found).toEqual(['dislike']);
  });

  it('is grumpy when woken if it dislikes that, but not when put to bed', () => {
    const s = withLikes({ dislike: 'woken' });
    const asleep = toggleLights(s, START + 1000);
    expect(asleep.felt).toBeUndefined();
    const woken = toggleLights(asleep.state, START + 2000);
    expect(woken.felt).toBe('disliked');
    expect(woken.state.pet.likes.found).toEqual(['dislike']);
  });

  it('never changes stats', () => {
    const plain = withLikes({ food: 'cookie', dislike: 'bath' });
    const loving = withLikes({ food: 'strawberry', dislike: 'bath' });
    plain.inventory.food.strawberry = 1;
    loving.inventory.food.strawberry = 1;
    expect(feed(loving, START + 1000, 'strawberry' as FoodId).state.pet.stats)
      .toEqual(feed(plain, START + 1000, 'strawberry' as FoodId).state.pet.stats);
  });
});

describe('remembering likes', () => {
  it('keeps them in the Family Tree', () => {
    const s = withLikes({ food: 'strawberry' });
    expect(rememberPet(s.pet, '').likes?.food).toBe('strawberry');
  });

  it('rolls the same ones for a pet without any', () => {
    expect(likesOf({ id: 'old' })).toEqual(rollLikes('old'));
    expect(feeling({ ...newTeen(START).pet, id: 'old', likes: undefined as never }, 'food', rollLikes('old').food)).toBe('loved');
  });

  it('gives older saves their likes', () => {
    const s = newTeen(START) as any;
    delete s.pet.likes;
    s.family = [{ id: 'gran' }];
    const out = migrate({ version: 27, state: s });
    expect(out.version).toBe(28);
    expect(out.state.pet.likes).toEqual(rollLikes(s.pet.id));
    expect(out.state.family[0].likes).toEqual(rollLikes('gran'));
  });
});
