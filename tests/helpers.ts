import { createNewGame, type GameState } from '../src/game/state';

// A new game where the pet has already hatched, been named and is a teen.
// Teens use the plain decay rates from the config (multiplier 1), which
// keeps the maths in the tests simple.
export function newTeen(now: number): GameState {
  const s = createNewGame(now);
  s.pet.stage = 'teen';
  s.pet.stageStartedAt = now;
  s.pet.name = 'Mochi';
  s.pet.named = true;
  return s;
}
