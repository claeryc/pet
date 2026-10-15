// Picks which frame of an animation to show, based on the current time.
// If the sheet doesn't have the animation asked for, it falls back to idle.

import type { SpriteSheet } from './sprites';

export function frameFor(sheet: SpriteSheet, animation: string, timeMs: number) {
  const name = sheet.animations[animation] ? animation : 'idle';
  const anim = sheet.animations[name];
  const frame = Math.floor(timeMs / anim.frameMs) % anim.frames;
  return {
    sx: frame * sheet.frameWidth,
    sy: anim.row * sheet.frameHeight,
    // How far the head has moved in this frame (for drawing a hat).
    headOffset: sheet.headOffsets?.[name]?.[frame] ?? 0,
  };
}
