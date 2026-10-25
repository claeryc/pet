// Likes and dislikes. Every pet has a favourite food, a favourite way to
// play, and one thing it doesn't like. Like a trait, they never change its
// stats: the pet only shows them with its face (in love for a favourite,
// grumpy for its dislike). Nothing tells the player what they are; the
// first time the pet shows one, it's written into the Family Tree.
//
// They're rolled from the pet's id when it's made, so they never change. A
// little one gets one of its parents' favourite foods `inheritChance`
// percent of the time (the same chance as for traits).

import { CONFIG } from './config';
import type { Food } from './actions';
import { seededRoll } from './growth';
import type { GameState, Pet } from './state';
import traitData from '../data/traits.json';

export type LikeKind = 'food' | 'play' | 'dislike';

export interface Likes {
  food: string; // a food id
  play: string; // an activity id (cuddle, tickle)
  // A food id, or 'bath' (grumpy after a bath) or 'woken' (grumpy when the
  // lights come on).
  dislike: string;
  found: LikeKind[]; // which ones the player has seen so far
}

const FOODS = CONFIG.foods as readonly Food[];

// Foods a pet can love: anything but the free rice ball, a Mushy mess, or
// a treat that only comes some days.
export const FAVOURITE_FOODS: readonly string[] = FOODS
  .filter((f) => f.price > 0 && f.id !== CONFIG.cooking.mess && !f.limited)
  .map((f) => f.id);

// Foods a pet can dislike: plain ones (Shop treats, fish and crops), never
// a dish you cooked for it.
const DISLIKED_FOODS: readonly string[] = FOODS
  .filter((f) => FAVOURITE_FOODS.includes(f.id) && !f.cookedOnly && !f.foundOnly)
  .map((f) => f.id);

const pick = <T>(list: readonly T[], roll: number): T => list[Math.floor(roll * list.length)];

// The likes of a pet with this id. `parentFoods` are its parents'
// favourite foods (none for a first pet).
export function rollLikes(petId: string, parentFoods: readonly (string | undefined)[] = []): Likes {
  const known = parentFoods.filter((f): f is string => !!f && FAVOURITE_FOODS.includes(f));
  const food = known.length > 0 && seededRoll(petId, 'inheritFood') * 100 < traitData.inheritChance
    ? pick(known, seededRoll(petId, 'whichFood'))
    : pick(FAVOURITE_FOODS, seededRoll(petId, 'favouriteFood'));
  const play = pick(CONFIG.activities.map((a) => a.id as string), seededRoll(petId, 'favouritePlay'));
  // A third of pets don't like baths, a third don't like being woken, and
  // a third don't like one food (never their favourite).
  const kind = Math.floor(seededRoll(petId, 'dislikeKind') * 3);
  const dislike = kind === 0 ? 'bath' : kind === 1 ? 'woken'
    : pick(DISLIKED_FOODS.filter((f) => f !== food), seededRoll(petId, 'dislikedFood'));
  return { food, play, dislike, found: [] };
}

// The likes of something that has an id and maybe likes (a friend or a
// pet from before likes came along has none, so it gets the ones its id rolls).
export function likesOf(thing: { id: string; likes?: Likes | null }): Likes {
  return thing.likes ?? rollLikes(thing.id);
}

// How the current pet feels about what just happened: 'loved' for its
// favourite, 'disliked' for its dislike, or null. `what` is a food id, an
// activity id, 'bath' or 'woken'.
export function feeling(pet: Pet, kind: 'food' | 'play' | 'bath' | 'woken', what = kind as string): 'loved' | 'disliked' | null {
  const likes = likesOf(pet);
  if ((kind === 'food' && likes.food === what) || (kind === 'play' && likes.play === what)) return 'loved';
  if ((kind === 'food' || kind === 'bath' || kind === 'woken') && likes.dislike === what) return 'disliked';
  return null;
}

// Writes down what the pet just showed (if it's the first time): its
// favourite food or way to play for 'loved', its dislike for 'disliked'.
export function noticeFeeling(state: GameState, kind: 'food' | 'play' | 'bath' | 'woken', felt: 'loved' | 'disliked' | null): GameState {
  if (!felt) return state;
  const found: LikeKind = felt === 'disliked' ? 'dislike' : kind === 'food' ? 'food' : 'play';
  const likes = likesOf(state.pet);
  if (likes.found.includes(found)) return state;
  return { ...state, pet: { ...state.pet, likes: { ...likes, found: [...likes.found, found] } } };
}
