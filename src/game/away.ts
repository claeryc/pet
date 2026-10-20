// The "While you were away" card: what changed between when you left and
// now that's worth knowing on coming back. Plants that got ready, dried out,
// got sick or wilted; a craving that came and went (or is going on now);
// and how the pet is doing. Percy's news isn't here: it already pops up on
// its own and goes in Messages.
//
// Only works out what to say; the card itself is src/ui/away.ts.

import { CONFIG } from './config';
import { moisture, plotStage } from './garden';
import { isCritical, timeLeftToTreat } from './stats';
import type { GameState } from './state';

export type AwayNote =
  | { kind: 'ready' | 'dry' | 'sickPlant' | 'deadPlant'; count: number; crop: string | null }
  | { kind: 'missedCraving' | 'craving'; food: string }
  | { kind: 'low'; stat: 'hunger' | 'energy' | 'happiness' }
  | { kind: 'sick' | 'warning' }
  // Any pet in the room, so these carry its name.
  | { kind: 'passed'; name: string }
  | { kind: 'critical'; name: string; timeLeft: number };

// What to tell you, comparing the game as you left it (`before`) with the
// game caught up to `now` (`after`). Empty when you weren't gone long or
// nothing worth saying happened.
export function awayNotes(before: GameState, after: GameState, leftAt: number, now: number): AwayNote[] {
  if (now - leftAt < CONFIG.awayCardMinutes * 60_000) return [];
  const notes: AwayNote[] = [];

  // The garden: pots that changed for the worse (or got ready) meanwhile.
  const pots = (test: (i: number) => boolean) => after.garden.filter((_, i) => test(i));
  const was = (i: number) => (before.garden[i] ? plotStage(before.garden[i]) : 'empty');
  const is = (i: number) => plotStage(after.garden[i]);
  const add = (kind: 'ready' | 'dry' | 'sickPlant' | 'deadPlant', list: GameState['garden']) => {
    if (list.length > 0) notes.push({ kind, count: list.length, crop: list[0].crop });
  };
  add('ready', pots((i) => is(i) === 'ready' && was(i) !== 'ready'));
  add('sickPlant', pots((i) => is(i) === 'sick' && was(i) !== 'sick'));
  add('deadPlant', pots((i) => is(i) === 'dead' && was(i) !== 'dead'));
  add('dry', pots((i) => {
    const p = before.garden[i];
    return is(i) === 'growing' && moisture(after.garden[i], now) <= 0 && !!p && moisture(p, leftAt) > 0;
  }));

  // Cravings: one that passed while you were gone, and one going on now.
  const missed = new Set<string>();
  if (before.craving.food && after.craving.food !== before.craving.food) missed.add(before.craving.food);
  const last = after.craving.last;
  if (last && last !== before.craving.last && after.craving.food !== last) missed.add(last);
  if (after.pet.condition === 'passed') missed.clear();
  for (const food of missed) notes.push({ kind: 'missedCraving', food });
  if (after.craving.food && after.craving.food !== before.craving.food) notes.push({ kind: 'craving', food: after.craving.food });

  // Any pet in the room that passed away, or is close to it.
  const beforePets = new Map([before.pet, ...before.housemates].map((p) => [p.id, p]));
  for (const p of [after.pet, ...after.housemates]) {
    const was = beforePets.get(p.id);
    if (!was || p.stage === 'egg') continue;
    if (p.condition === 'passed' && was.condition !== 'passed') notes.push({ kind: 'passed', name: p.name });
    else if (isCritical(p)) notes.push({ kind: 'critical', name: p.name, timeLeft: timeLeftToTreat(p) });
  }

  // The pet: if it got ill, or a need ran low.
  const pet = after.pet;
  if (pet.id === before.pet.id && pet.stage !== 'egg' && pet.condition !== 'passed') {
    if (pet.condition === 'sick' && before.pet.condition !== 'sick') notes.push({ kind: 'sick' });
    else if (pet.condition === 'warning' && before.pet.condition === 'healthy') notes.push({ kind: 'warning' });
    for (const stat of ['hunger', 'energy', 'happiness'] as const) {
      const low = CONFIG.lowStatThreshold;
      if (pet.stats[stat] < low && before.pet.stats[stat] >= low) notes.push({ kind: 'low', stat });
    }
  }
  return notes;
}
