// Picks which frame of an animation to show, based on the current time.
// If the sheet doesn't have the animation asked for, it falls back to idle.

import type { SpriteSheet } from './sprites';

export function frameFor(sheet: SpriteSheet, animation: string, timeMs: number) {
  const anim = sheet.animations[animation] ?? sheet.animations.idle;
  const frame = Math.floor(timeMs / anim.frameMs) % anim.frames;
  return {
    sx: frame * sheet.frameWidth,
    sy: anim.row * sheet.frameHeight,
  };
}
