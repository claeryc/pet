// Who's at home. A pet on a journey is out of the room until it comes back
// (see src/game/journeys.ts), and with nobody home the garden, the kitchen,
// the pond and Percy's parcels all wait. Kept on its own, with no other
// game files imported, so Percy's orders and visits can ask without going
// in a circle.

import type { GameState, Pet } from './state';

const pets = (state: GameState): Pet[] => [state.pet, ...state.housemates];

// Out on a journey right now.
export function isAway(pet: Pet): boolean {
  return !!pet.trip && pet.trip.backAt === null;
}

// Home from a journey, with a backpack still to open.
export function hasBackpack(pet: Pet): boolean {
  return !!pet.trip && pet.trip.backAt !== null;
}

// Every pet in the room is out on a journey.
export function nobodyHome(state: GameState): boolean {
  return pets(state).every(isAway);
}

// Whether `pet` was (or will be) at home at time `t`, as far as its trip
// says.
function homeAt(pet: Pet, t: number): boolean {
  const trip = pet.trip;
  return !trip || t < trip.startedAt || t >= (trip.backAt ?? trip.endsAt);
}

// When the first pet is home again, if every pet is away at time `t`; null
// if someone is home then.
export function backHomeAt(state: GameState, t: number): number | null {
  if (pets(state).some((p) => homeAt(p, t))) return null;
  return Math.min(...pets(state).map((p) => p.trip!.backAt ?? p.trip!.endsAt));
}
