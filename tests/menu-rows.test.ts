import { describe, expect, it } from 'vitest';
import { rowSizes } from '../src/ui/menu';

describe('menu rows', () => {
  it('never leaves a tile alone at the end of a row', () => {
    expect(rowSizes(0)).toEqual([]);
    expect(rowSizes(3)).toEqual([3]);
    expect(rowSizes(4)).toEqual([2, 2]);
    expect(rowSizes(5)).toEqual([3, 2]);
    expect(rowSizes(6)).toEqual([3, 3]);
    expect(rowSizes(7)).toEqual([3, 2, 2]);
    for (let n = 2; n <= 12; n++) {
      const sizes = rowSizes(n);
      expect(sizes.reduce((a, b) => a + b, 0)).toBe(n);
      expect(Math.max(...sizes)).toBeLessThanOrEqual(3);
      expect(Math.min(...sizes)).toBeGreaterThanOrEqual(2);
    }
  });
});
