import { describe, expect, it } from 'vitest';
import { swipeTo } from '../src/ui/journal';

describe('swiping the journal', () => {
  const order = ['market', 'woods', 'cove'];
  it('turns to the next place on a swipe left, the one before on a swipe right', () => {
    expect(swipeTo(order, 'woods', -80, 5)).toBe('cove');
    expect(swipeTo(order, 'woods', 80, -5)).toBe('market');
  });
  it('stops at the ends', () => {
    expect(swipeTo(order, 'cove', -80, 0)).toBeUndefined();
    expect(swipeTo(order, 'market', 80, 0)).toBeUndefined();
  });
  it('ignores short swipes and scrolling', () => {
    expect(swipeTo(order, 'woods', -30, 0)).toBeUndefined();
    expect(swipeTo(order, 'woods', -80, 90)).toBeUndefined();
  });
  it('ignores a page not been to yet', () => {
    expect(swipeTo(order, 'hill', -80, 0)).toBeUndefined();
  });
});
