// Picks which frame of an animation to show, based on the current time.

import type { SpriteSheet } from './sprites';

export function frameFor(sheet: SpriteSheet, animation: string, timeMs: number) {
  const anim = sheet.manifest.animations[animation] ?? sheet.manifest.animations.idle;
  const frame = Math.floor(timeMs / anim.frameMs) % anim.frames;
  return {
    sx: frame * sheet.manifest.frameWidth,
    sy: anim.row * sheet.manifest.frameHeight,
  };
}
