// Decorating the room: a wallpaper and window curtains, bought once in the
// Shop and then picked to use. Every room starts with the plain wallpaper
// and no curtains. How each one looks lives in src/render/canvas.ts.

import { CONFIG } from './config';
import type { GameState, Room } from './state';
import { currentRoom, roomDecor } from './rooms';

export type DecorKind = 'wallpaper' | 'curtains';

export interface Decor {
  kind: DecorKind;
  id: string;
  price: number;
  earned?: boolean; // not sold: a regular gives it (see regulars.ts)
}

export const WALLPAPERS: Decor[] = CONFIG.room.wallpapers.map((w) => ({ kind: 'wallpaper', ...w }));
export const CURTAINS: Decor[] = CONFIG.room.curtains.map((c) => ({ kind: 'curtains', ...c }));

export function getDecor(kind: DecorKind, id: string): Decor | undefined {
  return (kind === 'wallpaper' ? WALLPAPERS : CURTAINS).find((d) => d.id === id);
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
  return kind === 'wallpaper' ? room.wallpaper === id : room.curtains === id;
}

// Changes the decoration of the room you're looking at.
function decorate(state: GameState, change: Partial<Room>): GameState {
  if (currentRoom(state) === 'family') return { ...state, familyHome: { ...state.familyHome, room: { ...state.familyHome.room, ...change } } };
  return { ...state, room: { ...state.room, ...change } };
}

export type DecorBlock = 'notOwned';

// Puts a decoration up in the room you're looking at. Curtains can also
// be taken down (id null); the wallpaper is always something.
export function useDecor(state: GameState, kind: DecorKind, id: string | null): { state: GameState; blocked?: DecorBlock } {
  if (id !== null && !ownsDecor(state, kind, id)) return { state, blocked: 'notOwned' };
  if (kind === 'wallpaper') return { state: decorate(state, { wallpaper: id ?? 'plain' }) };
  return { state: decorate(state, { curtains: id }) };
}
