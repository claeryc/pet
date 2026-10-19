import { describe, expect, it } from 'vitest';
import { CONFIG } from '../src/game/config';
import { idleMoveAt } from '../src/render/animations';
import { measureHead } from '../src/render/sprites';

describe('idle set moves', () => {
  const moves = [
    { name: 'idle-look', ms: 1040 },
    { name: 'idle-stretch', ms: 1040 },
  ];
  const every = CONFIG.idleMoveEveryMs;

  // Which move plays during each slot, over a long stretch of time.
  function playsPerSlot(seed: number, slots: number) {
    const found: (string | null)[] = [];
    for (let slot = 0; slot < slots; slot++) {
      let name: string | null = null;
      for (let t = slot * every; t < (slot + 1) * every; t += 20) name ??= idleMoveAt(moves, t, seed)?.name ?? null;
      found.push(name);
    }
    return found;
  }

  it('plays one move in every slot, and the plain idle the rest of the time', () => {
    const found = playsPerSlot(0, 40);
    expect(found.every((n) => n !== null)).toBe(true);
    let moving = 0;
    for (let t = 0; t < every * 40; t += 20) if (idleMoveAt(moves, t)) moving++;
    // Each move lasts 1040ms out of every 9 seconds.
    expect(moving * 20).toBeGreaterThan(every * 40 * 0.08);
    expect(moving * 20).toBeLessThan(every * 40 * 0.15);
  });

  it('picks both moves, and starts each from its first frame', () => {
    expect(new Set(playsPerSlot(0, 40))).toEqual(new Set(['idle-look', 'idle-stretch']));
    for (let t = 0; t < every * 5; t += 20) {
      const move = idleMoveAt(moves, t);
      if (move) expect(move.into).toBeLessThan(1040);
    }
  });

  it('two pets in the room do not move in step', () => {
    expect(playsPerSlot(4, 20)).not.toEqual(playsPerSlot(36, 20));
  });

  it('a pet without an idle set never moves', () => {
    for (let t = 0; t < every * 3; t += 100) expect(idleMoveAt([], t)).toBeNull();
  });
});

describe('hat tracking', () => {
  // A 2-frame sheet, 16x16 per frame: a 10-wide head whose top is on row 4.
  // The second frame draws it somewhere else.
  const fw = 16;
  function sheetWith(second: { dx: number; dy: number; wider?: number; sparkle?: boolean }) {
    const width = fw * 2;
    const data = new Uint8Array(width * fw * 4);
    const fill = (frame: number, x0: number, y0: number, w: number, h: number) => {
      for (let y = y0; y < y0 + h; y++) for (let x = x0; x < x0 + w; x++) data[(y * width + frame * fw + x) * 4 + 3] = 255;
    };
    fill(0, 3, 4, 10, 12);
    const grow = second.wider ?? 0;
    fill(1, 3 + second.dx - grow, 4 + second.dy, 10 + grow * 2, 12 - second.dy);
    if (second.sparkle) fill(1, 13, 4, 3, 3); // a sparkle touching the right side
    const animations = { idle: { row: 0, frames: 2, frameMs: 100 } };
    return measureHead({ data, width }, { frameWidth: fw, frameHeight: fw, animations }, { x: 8, y: 5, width: 10 }, ['idle']);
  }

  it('follows the head up and down, and sideways', () => {
    expect(sheetWith({ dx: -2, dy: 1 })).toEqual({ offsets: { idle: [0, 1] }, shifts: { idle: [0, -2] } });
    expect(sheetWith({ dx: 1, dy: -1 })).toEqual({ offsets: { idle: [0, -1] }, shifts: { idle: [0, 1] } });
  });

  it('a squash or a stretch does not move the hat sideways', () => {
    expect(sheetWith({ dx: 0, dy: 0, wider: 2 }).shifts.idle).toEqual([0, 0]);
    expect(sheetWith({ dx: 0, dy: 0, wider: -1 }).shifts.idle).toEqual([0, 0]);
  });

  it('a sparkle touching one side does not move the hat sideways', () => {
    expect(sheetWith({ dx: 0, dy: 0, sparkle: true }).shifts.idle).toEqual([0, 0]);
  });
});
