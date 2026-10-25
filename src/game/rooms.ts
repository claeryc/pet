// The Family Home: a second room, bought in the Shop with star fragments
// or real money (see CONFIG.familyHome). Each room fits
// CONFIG.friends.maxPets pets. Pets in the Family Home live there with
// the same rules as anywhere else, but their tummy, joy and energy go down
// more slowly (`needsSpeed`). Poop and baths keep their usual timing, so
// they still need a visit. A pet that isn't well can't move in, so the
// Family Home can't slow down a warning or a sick countdown.
//
// Which room a pet is in is kept on the pet (`room`, 'main' if unset). The
// home screen shows the room of the pet you're looking after, with the
// other pet in that room beside it; the door in the corner goes to the
// other room.

import { CONFIG } from './config';
import type { GameState, Pet, Room } from './state';
import { isAway } from './presence';

export type RoomId = 'main' | 'family';

const allPets = (s: GameState): Pet[] => [s.pet, ...s.housemates];

export const roomOf = (p: Pet): RoomId => p.room ?? 'main';

export const ownsFamilyHome = (s: GameState): boolean => s.familyHome.owned;

// The rooms you have.
export const rooms = (s: GameState): RoomId[] => (ownsFamilyHome(s) ? ['main', 'family'] : ['main']);

// How many pets fit at home.
export const capacity = (s: GameState): number => CONFIG.friends.maxPets * rooms(s).length;

export const petsIn = (s: GameState, room: RoomId): Pet[] => allPets(s).filter((p) => roomOf(p) === room);

// A room with a free spot, the main room first, or null when every room is full.
export function roomWithSpace(s: GameState): RoomId | null {
  return rooms(s).find((r) => petsIn(s, r).length < CONFIG.friends.maxPets) ?? null;
}

// The room you're looking at: the one the pet you're looking after is in.
export const currentRoom = (s: GameState): RoomId => roomOf(s.pet);

// The other pets in the room you're looking at.
export const roommates = (s: GameState): Pet[] => s.housemates.filter((p) => roomOf(p) === currentRoom(s));

// The other room, if you have one.
export const otherRoom = (s: GameState): RoomId | null =>
  ownsFamilyHome(s) ? (currentRoom(s) === 'main' ? 'family' : 'main') : null;

// The wallpaper and curtains of the room you're looking at.
export const roomDecor = (s: GameState): Room => (currentRoom(s) === 'family' ? s.familyHome.room : s.room);

// How fast a pet's tummy, joy and energy go down where it lives (1 = as usual).
export const needsSpeed = (p: Pet): number => (roomOf(p) === 'family' ? CONFIG.familyHome.needsSpeed : 1);

// Something in a pet that needs you: it isn't well, or there's poop or a smell.
export const needsYou = (p: Pet): boolean =>
  !isAway(p) && p.stage !== 'egg' && (p.condition !== 'healthy' || p.hygiene.poops.length > 0 || p.hygiene.smelly);

export type RoomBlock = 'noHome' | 'empty' | 'full' | 'unwell' | 'away';

// Goes to another room: you look after the first pet there that's home.
export function goToRoom(s: GameState, room: RoomId): { state: GameState; blocked?: RoomBlock } {
  if (!rooms(s).includes(room)) return { state: s, blocked: 'noHome' };
  if (currentRoom(s) === room) return { state: s };
  const there = s.housemates.find((p) => roomOf(p) === room && !isAway(p));
  if (!there) return { state: s, blocked: 'empty' };
  return { state: { ...s, pet: there, housemates: s.housemates.map((p) => (p.id === there.id ? s.pet : p)) } };
}

// Moves a pet to the other room. With `swapWith`, that pet from the other
// room moves the other way, so a full room still works. Only a pet that's
// well (and not an egg on its way, or out on a journey) moves into the
// Family Home.
export function movePet(s: GameState, id: string, swapWith?: string): { state: GameState; blocked?: RoomBlock } {
  if (!ownsFamilyHome(s)) return { state: s, blocked: 'noHome' };
  const pet = allPets(s).find((p) => p.id === id);
  if (!pet) return { state: s };
  const to: RoomId = roomOf(pet) === 'main' ? 'family' : 'main';
  const other = swapWith ? allPets(s).find((p) => p.id === swapWith && roomOf(p) === to) : undefined;
  if (swapWith && !other) return { state: s };
  const movers = other ? [pet, other] : [pet];
  if (movers.some(isAway)) return { state: s, blocked: 'away' };
  const intoFamily = movers.find((p) => roomOf(p) === 'main');
  if (intoFamily && intoFamily.condition !== 'healthy') return { state: s, blocked: 'unwell' };
  if (!other && petsIn(s, to).length >= CONFIG.friends.maxPets) return { state: s, blocked: 'full' };
  const flip = (p: Pet): Pet => (movers.includes(p) ? { ...p, room: roomOf(p) === 'main' ? 'family' : 'main' } : p);
  return { state: { ...s, pet: flip(s.pet), housemates: s.housemates.map(flip) } };
}

// Hands over the Family Home (bought with money, see src/payments.ts).
export function grantFamilyHome(s: GameState): GameState {
  return { ...s, familyHome: { ...s.familyHome, owned: true } };
}

// Buys the Family Home with star fragments.
export function buyFamilyHome(s: GameState): { state: GameState; blocked?: 'owned' | 'notEnoughFragments' } {
  if (ownsFamilyHome(s)) return { state: s, blocked: 'owned' };
  const cost = CONFIG.familyHome.fragments;
  if (s.fragments.pieces < cost) return { state: s, blocked: 'notEnoughFragments' };
  return { state: grantFamilyHome({ ...s, fragments: { ...s.fragments, pieces: s.fragments.pieces - cost } }) };
}
