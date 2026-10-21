import { describe, expect, it } from 'vitest';
import { tripProgress } from '../src/ui/trip';
import { shortLeft } from '../src/ui/journeys';
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

describe('time left in the line-up', () => {
  const min = 60_000;
  it('rounds up to half hours', () => {
    expect(shortLeft(60 * min)).toBe('1h');
    expect(shortLeft(61 * min)).toBe('1.5h');
    expect(shortLeft(30 * min)).toBe('0.5h');
    expect(shortLeft(10 * 60 * min)).toBe('10h');
  });
  it('shows minutes under half an hour', () => {
    expect(shortLeft(29 * min)).toBe('29m');
    expect(shortLeft(10_000)).toBe('1m');
  });
});
