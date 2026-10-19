// Picks which frame of an animation to show, based on the current time.
// If the sheet doesn't have the animation asked for, it falls back to idle.
// A pet whose sheet has an idle set now and then breaks off its idle (or
// cheerful) loop to play one of the set's moves once, then carries on.

import { CONFIG } from '../game/config';
import type { SpriteSheet } from './sprites';

// The idle set move playing at `timeMs`, and how long it has been playing,
// or null. Time is cut into slots of CONFIG.idleMoveEveryMs; each slot plays
// one move, picked at random, starting at a random point in its first 3
// seconds. It works it out from the time alone, so nothing has to be
// remembered between frames. `seed` keeps two pets from moving in step.
export function idleMoveAt(moves: { name: string; ms: number }[], timeMs: number, seed = 0) {
  if (moves.length === 0) return null;
  const every = CONFIG.idleMoveEveryMs;
  const slot = Math.floor(timeMs / every);
  const roll = hash(slot * 7919 + seed);
  const move = moves[roll % moves.length];
  const start = slot * every + (Math.floor(roll / moves.length) % 3000);
  const into = timeMs - start;
  return into >= 0 && into < move.ms ? { name: move.name, into } : null;
}

export function frameFor(sheet: SpriteSheet, animation: string, timeMs: number, seed = 0) {
  let name = sheet.animations[animation] ? animation : 'idle';
  let t = timeMs;
  if ((name === 'idle' || name === 'cheerful') && sheet.idleMoves) {
    const moves = sheet.idleMoves.map((m) => {
      const anim = sheet.animations[m];
      return { name: m, ms: anim.frames * anim.frameMs };
    });
    const move = idleMoveAt(moves, timeMs, seed);
    // Start the move from its first frame, and play it once.
    if (move) [name, t] = [move.name, move.into];
  }
  const anim = sheet.animations[name];
  const frame = Math.floor(t / anim.frameMs) % anim.frames;
  return {
    sx: frame * sheet.frameWidth,
    sy: anim.row * sheet.frameHeight,
    // How far the head has moved in this frame (for drawing a hat): down,
    // and to the right.
    headOffset: sheet.headOffsets?.[name]?.[frame] ?? 0,
    headShift: sheet.headShifts?.[name]?.[frame] ?? 0,
  };
}

// Turns a number into a scrambled, but always the same, whole number.
function hash(n: number): number {
  let h = Math.imul(n ^ 0x9e3779b9, 0x85ebca6b);
  h ^= h >>> 13;
  h = Math.imul(h, 0xc2b2ae35);
  h ^= h >>> 16;
  return h >>> 0;
}
