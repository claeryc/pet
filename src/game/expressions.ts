// Which face a pet with a face layer pulls (the faces are drawn in
// src/render/faces.ts). The first rule that matches wins:
//   1. its body animation needs a face: asleep is sleepy, eating is
//      chewing, sick is sick
//   2. a short reaction is playing (happy after play, in love after a
//      favourite food, surprised by a visitor, grumpy when woken)
//   3. a mood from its stats: crying or sad (low joy), hungry (low tummy),
//      sleepy (low energy), pouting (left alone for a while)
//   4. the face its body animation pulls on its own (sad, happy), or else
//      content
// A pet's trait moves the numbers (see src/game/traits.ts).

import { CONFIG } from './config';
import { EXPRESSIONS, type Expression } from './expression-order';
import type { PetStats } from './state';
import type { Trait } from './traits';

// The faces, in the order of the rows of every face set.
export { EXPRESSIONS, type Expression };

const E = CONFIG.expressions;

// The face a body animation pulls on its own, when nothing else picks one
// (src/game/expressions.ts picks one from the pet's mood and reactions).
export function faceForAnimation(animation: string): Expression {
  switch (animation) {
    case 'sleep':
    case 'passed':
      return 'sleepy';
    case 'eat':
      return 'chewing';
    case 'sick':
      return 'sick';
    case 'sad':
      return 'sad';
    case 'happy':
      return 'happy';
    default:
      return 'content';
  }
}


export type Reaction = keyof typeof E.ms;

export interface FaceInput {
  animation: string; // the body animation playing
  reaction?: Expression | null; // a reaction face that's still showing
  stats: PetStats;
  trait?: Trait;
  aloneMs?: number; // how long since the player last did something with it
}

export function chooseExpression({ animation, reaction, stats, trait, aloneMs = 0 }: FaceInput): Expression {
  if (animation === 'sleep' || animation === 'passed') return 'sleepy';
  if (animation === 'eat') return 'chewing';
  if (animation === 'sick') return 'sick';
  if (reaction) return reaction;
  const sadShift = trait?.sadBelow ?? 0;
  if (stats.happiness < E.cryingBelow + sadShift) return 'crying';
  if (stats.happiness < E.sadBelow + sadShift) return 'sad';
  if (stats.hunger < E.hungryBelow + (trait?.hungryBelow ?? 0)) return 'hungry';
  if (stats.energy < E.sleepyBelow + (trait?.sleepyBelow ?? 0)) return 'sleepy';
  if (aloneMs >= E.poutAfterMs * (trait?.poutAfter ?? 1)) return 'pouting';
  return faceForAnimation(animation);
}

// How long a reaction face shows for a pet with this trait, in milliseconds.
export function reactionMs(reaction: Reaction, trait?: Trait): number {
  const times = reaction === 'happy' ? trait?.happyMs : reaction === 'surprised' ? trait?.surprisedMs : undefined;
  return E.ms[reaction] * (times ?? 1);
}

// The face it pulls after eating: in love with a food it was craving (or
// any food, for a greedy pet), otherwise happy.
export function afterEating(craved: boolean, trait?: Trait): Reaction {
  return craved || trait?.lovesEverySnack ? 'inLove' : 'happy';
}

// How often a pet with this trait plays its idle moves, in milliseconds.
export function idleEveryMs(trait?: Trait): number {
  return CONFIG.idleMoveEveryMs * (trait?.idleEvery ?? 1);
}
