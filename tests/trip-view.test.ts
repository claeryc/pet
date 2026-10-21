import { describe, expect, it } from 'vitest';
import { tripProgress } from '../src/ui/trip';
import { newTeen } from './helpers';

describe('the current trip map', () => {
  const now = 1_000_000_000;
  const withTrip = (startedAt: number, endsAt: number) => {
    const pet = newTeen(now).pet;
    pet.trip = {
      place: 'woods', rarity: 'rare', startedAt, endsAt,
      from: { hunger: 80, energy: 80 }, to: { hunger: 50, energy: 50 }, joy: 8, finds: [],
      percy: 'none', backAt: null, early: false,
    };
    return pet;
  };

  it('shows how far along the trip is', () => {
    expect(tripProgress(withTrip(now - 1000, now + 3000), now)).toBe(0.25);
  });

  it('stays between home and the place', () => {
    expect(tripProgress(withTrip(now + 500, now + 1500), now)).toBe(0);
    expect(tripProgress(withTrip(now - 2000, now - 1000), now)).toBe(1);
  });

  it('is at home with no trip', () => {
    expect(tripProgress(newTeen(now).pet, now)).toBe(0);
  });
});
