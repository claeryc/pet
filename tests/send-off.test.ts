import { describe, expect, it } from 'vitest';
import { MOMENT_MS, momentMotion } from '../src/render/moments';

const at = (fraction: number) => momentMotion({ kind: 'setOff', ms: MOMENT_MS.setOff * fraction });

describe('the send-off', () => {
  it('stays in its spot while it waves', () => {
    for (const f of [0.05, 0.25, 0.4]) expect(Math.abs(at(f).dx)).toBeLessThanOrEqual(1);
  });

  it('hops out of the room to the right, bag and all', () => {
    expect(at(0.75).dx).toBeGreaterThan(at(0.6).dx);
    // The room is 64 pixels wide, and the bag trails 10 behind.
    expect(at(1).dx).toBeGreaterThan(64);
  });
});
