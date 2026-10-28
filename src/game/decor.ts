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
  crafted?: boolean; // not sold: made at the workbench (see crafting.ts)
  slot?: FurnitureSlot; // furniture only: its usual spot
  spots?: FurnitureSlot[]; // furniture only: every spot it fits, usual first
}

export const WALLPAPERS: Decor[] = CONFIG.room.wallpapers.map((w) => ({ kind: 'wallpaper', ...w }));
export const CURTAINS: Decor[] = CONFIG.room.curtains.map((c) => ({ kind: 'curtains', ...c }));
export const FURNITURE: Decor[] = CONFIG.room.furniture.map((f) => ({
  kind: 'furniture', ...f, spots: [...f.spots] as FurnitureSlot[], slot: f.spots[0] as FurnitureSlot,
}));

// The spots in a room, wall first, then the sill and the floor.
export const SPOTS: FurnitureSlot[] = ['wallMid', 'wall', 'sill', 'left', 'right'];

// The Meadow's keepsakes come with their own frame and shelf, which are
// placed like furniture but never sold (see src/game/meadow.ts).
export const KEEPSAKE_PIECES: Record<string, FurnitureSlot[]> = {
  keepsakeFrame: ['wallMid', 'wall'],
  keepsakeShelf: ['wall'],
};

// Where a piece fits, usual spot first.
export function spotsFor(id: string): FurnitureSlot[] {
  return KEEPSAKE_PIECES[id] ?? getDecor('furniture', id)?.spots ?? [];
}

// Whether you have a piece: bought, or (for the keepsake frame and shelf)
// once a pet has left something for them.
export function ownsPiece(state: GameState, id: string): boolean {
  if (id === 'keepsakeFrame') return state.keepsakes.length > 0;
  if (id === 'keepsakeShelf') return state.keepsakes.some((k) => k.tier !== 'portrait');
  return ownsDecor(state, 'furniture', id);
}

// The pieces you have that fit a spot, in the Shop's order, keepsakes first.
export function piecesFor(state: GameState, spot: FurnitureSlot): string[] {
  return [...Object.keys(KEEPSAKE_PIECES), ...FURNITURE.map((f) => f.id)]
    .filter((id) => spotsFor(id).includes(spot) && ownsPiece(state, id));
}

// The spot a piece is in, in the room you're looking at.
export function spotOf(state: GameState, id: string): FurnitureSlot | undefined {
  const furniture = roomDecor(state).furniture ?? {};
  return SPOTS.find((spot) => furniture[spot] === id);
}

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
  return !!d && ((d.price === 0 && !d.earned && !d.crafted) || state.inventory.decor.includes(decorKey(kind, id)));
}

// In use in the room you're looking at (each room is decorated on its own).
export function inUse(state: GameState, kind: DecorKind, id: string): boolean {
  const room = roomDecor(state);
  if (kind === 'furniture') return !!spotOf(state, id);
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
// furniture goes in its usual spot, in place of what was there (unless
// it's up already).
export function useDecor(state: GameState, kind: DecorKind, id: string | null): { state: GameState; blocked?: DecorBlock } {
  if (id !== null && !ownsDecor(state, kind, id)) return { state, blocked: 'notOwned' };
  if (kind === 'wallpaper') return { state: decorate(state, { wallpaper: id ?? 'plain' }) };
  if (kind === 'furniture') {
    if (id === null || spotOf(state, id)) return { state };
    return { state: placeFurniture(state, spotsFor(id)[0], id).state };
  }
  return { state: decorate(state, { curtains: id }) };
}

// Decorating: puts a piece in a spot of the room you're looking at, in
// place of what was there (null empties it). A piece that's up somewhere
// else in the room moves over.
export function placeFurniture(state: GameState, spot: FurnitureSlot, id: string | null): { state: GameState; blocked?: DecorBlock | 'doesntFit' } {
  const furniture = { ...roomDecor(state).furniture };
  if (id !== null) {
    if (!ownsPiece(state, id)) return { state, blocked: 'notOwned' };
    if (!spotsFor(id).includes(spot)) return { state, blocked: 'doesntFit' };
    for (const s of SPOTS) if (furniture[s] === id) delete furniture[s];
    furniture[spot] = id;
  } else delete furniture[spot];
  return { state: decorate(state, { furniture }) };
}

// Takes a piece of furniture out of the room you're looking at (you still
// own it).
export function takeDownFurniture(state: GameState, id: string): GameState {
  const spot = spotOf(state, id);
  return spot ? placeFurniture(state, spot, null).state : state;
}
