// Decorating the room: a wallpaper, window curtains and furniture, bought
// once in the Shop and then picked to use in each room. Every room starts
// with the plain wallpaper, no curtains and no furniture. How the wall and
// curtains look lives in src/render/room.ts, furniture in
// src/render/furniture.ts.

import { CONFIG } from './config';
import type { FurnitureSlot, GameState, Room } from './state';
import { currentRoom, roomDecor } from './rooms';

export type DecorKind = 'wallpaper' | 'curtains' | 'furniture';

export interface Decor {
  kind: DecorKind;
  id: string;
  price: number;
  earned?: boolean; // not sold: a regular gives it (see regulars.ts)
  slot?: FurnitureSlot; // furniture only: where it goes
}

export const WALLPAPERS: Decor[] = CONFIG.room.wallpapers.map((w) => ({ kind: 'wallpaper', ...w }));
export const CURTAINS: Decor[] = CONFIG.room.curtains.map((c) => ({ kind: 'curtains', ...c }));
export const FURNITURE: Decor[] = CONFIG.room.furniture.map((f) => ({ kind: 'furniture', ...f, slot: f.slot as FurnitureSlot }));

const ALL: Record<DecorKind, Decor[]> = { wallpaper: WALLPAPERS, curtains: CURTAINS, furniture: FURNITURE };

export function getDecor(kind: DecorKind, id: string): Decor | undefined {
  return ALL[kind].find((d) => d.id === id);
}

// How a decoration is stored in the inventory, e.g. "curtains:rose".
export const decorKey = (kind: DecorKind, id: string) => `${kind}:${id}`;

// Free decorations (the plain wall) are always yours; earned ones once
// they're given.
export function ownsDecor(state: GameState, kind: DecorKind, id: string): boolean {
  const d = getDecor(kind, id);
  return !!d && ((d.price === 0 && !d.earned) || state.inventory.decor.includes(decorKey(kind, id)));
}

// In use in the room you're looking at (each room is decorated on its own).
export function inUse(state: GameState, kind: DecorKind, id: string): boolean {
  const room = roomDecor(state);
  if (kind === 'furniture') {
    const slot = getDecor(kind, id)?.slot;
    return !!slot && room.furniture?.[slot] === id;
  }
  return kind === 'wallpaper' ? room.wallpaper === id : room.curtains === id;
}

// Changes the decoration of the room you're looking at.
function decorate(state: GameState, change: Partial<Room>): GameState {
  if (currentRoom(state) === 'family') return { ...state, familyHome: { ...state.familyHome, room: { ...state.familyHome.room, ...change } } };
  return { ...state, room: { ...state.room, ...change } };
}

export type DecorBlock = 'notOwned';

// Puts a decoration up in the room you're looking at. Curtains can also
// be taken down (id null); the wallpaper is always something. A piece of
// furniture goes in its spot, in place of what was there.
export function useDecor(state: GameState, kind: DecorKind, id: string | null): { state: GameState; blocked?: DecorBlock } {
  if (id !== null && !ownsDecor(state, kind, id)) return { state, blocked: 'notOwned' };
  if (kind === 'wallpaper') return { state: decorate(state, { wallpaper: id ?? 'plain' }) };
  if (kind === 'furniture') {
    const slot = id === null ? undefined : getDecor(kind, id)?.slot;
    if (!slot) return { state };
    return { state: decorate(state, { furniture: { ...roomDecor(state).furniture, [slot]: id } }) };
  }
  return { state: decorate(state, { curtains: id }) };
}

// Takes a piece of furniture out of the room you're looking at (you still
// own it).
export function takeDownFurniture(state: GameState, id: string): GameState {
  const slot = getDecor('furniture', id)?.slot;
  const furniture = { ...roomDecor(state).furniture };
  if (!slot || furniture[slot] !== id) return state;
  delete furniture[slot];
  return decorate(state, { furniture });
}
