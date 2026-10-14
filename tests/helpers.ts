import { createNewGame, type GameState } from '../src/game/state';

// A new game where the pet has already hatched and is a teen. Teens use the
// plain decay rates from the config (multiplier 1), which keeps the maths in
// the tests simple.
export function newTeen(now: number): GameState {
  const s = createNewGame(now);
  s.pet.stage = 'teen';
  s.pet.formId = 'teen';
  s.pet.stageStartedAt = now;
  return s;
}
