import { describe, expect, it } from 'vitest';
import { formatDuration, formatIn } from '../src/ui/time';

describe('formatIn', () => {
  it('says "in" with the time left', () => {
    expect(formatIn(4 * 3_600_000 + 12 * 60_000)).toBe('in 4h 12m');
    expect(formatIn(90_000)).toBe('in 2m');
  });

  it('says "any moment now" for the last minute and for times already past', () => {
    expect(formatIn(60_000)).toBe('any moment now');
    expect(formatIn(1)).toBe('any moment now');
    expect(formatIn(0)).toBe('any moment now');
    expect(formatIn(-5 * 60_000)).toBe('any moment now');
  });

  it('leaves formatDuration as it was', () => {
    expect(formatDuration(0)).toBe('0m');
    expect(formatDuration(25 * 3_600_000)).toBe('1d 1h');
  });
});
