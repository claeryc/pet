// Decorating the room: a wallpaper and window curtains, bought once in the
// Shop and then picked to use. Every room starts with the plain wallpaper
// and no curtains. How each one looks lives in src/render/canvas.ts.

import { CONFIG } from './config';
import type { GameState } from './state';

export type DecorKind = 'wallpaper' | 'curtains';

export interface Decor {
  kind: DecorKind;
  id: string;
  price: number;
}

export const WALLPAPERS: Decor[] = CONFIG.room.wallpapers.map((w) => ({ kind: 'wallpaper', ...w }));
export const CURTAINS: Decor[] = CONFIG.room.curtains.map((c) => ({ kind: 'curtains', ...c }));

export function getDecor(kind: DecorKind, id: string): Decor | undefined {
  return (kind === 'wallpaper' ? WALLPAPERS : CURTAINS).find((d) => d.id === id);
}

// How a decoration is stored in the inventory, e.g. "curtains:rose".
export const decorKey = (kind: DecorKind, id: string) => `${kind}:${id}`;

// Free decorations (the plain wall) are always yours.
export function ownsDecor(state: GameState, kind: DecorKind, id: string): boolean {
  const d = getDecor(kind, id);
  return !!d && (d.price === 0 || state.inventory.decor.includes(decorKey(kind, id)));
}

export function inUse(state: GameState, kind: DecorKind, id: string): boolean {
  return kind === 'wallpaper' ? state.room.wallpaper === id : state.room.curtains === id;
}

export type DecorBlock = 'notOwned';

// Puts a decoration up. Curtains can also be taken down (id null); the
// wallpaper is always something.
export function useDecor(state: GameState, kind: DecorKind, id: string | null): { state: GameState; blocked?: DecorBlock } {
  if (id !== null && !ownsDecor(state, kind, id)) return { state, blocked: 'notOwned' };
  if (kind === 'wallpaper') return { state: { ...state, room: { ...state.room, wallpaper: id ?? 'plain' } } };
  return { state: { ...state, room: { ...state.room, curtains: id } } };
}
