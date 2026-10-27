import { describe, expect, it } from 'vitest';
import { newTeen } from './helpers';
import { CONFIG } from '../src/game/config';
import { momentsNow, pickMoment, placeMoments, snappedAt, takeSnapshot } from '../src/game/snapshots';
import { tripPetAt } from '../src/ui/trip';

const S = CONFIG.journeys.snapshots;
const snap = (moment: string, at = 1) => ({ moment, at, name: 'Mochi', image: 'data:image/png;base64,' });

describe('little moments on a trip', () => {
  it('Mossy Woods has a set of six, other places the ones that happen anywhere', () => {
    expect(placeMoments('woods')).toHaveLength(6);
    expect(placeMoments('market')).toEqual(['butterfly', 'percy']);
  });

  it('butterflies come out by day and fireflies at night', () => {
    expect(momentsNow('woods', false)).toContain('butterfly');
    expect(momentsNow('woods', false)).not.toContain('fireflies');
    expect(momentsNow('woods', true)).toContain('fireflies');
    expect(momentsNow('woods', true)).not.toContain('butterfly');
  });

  it('only happens on some looks', () => {
    expect(pickMoment('woods', false, [], S.chance, 0)).toBeNull();
    expect(pickMoment('woods', false, [], 0, 0)).not.toBeNull();
  });

  it('is more often one not in the journal yet', () => {
    const snapped = momentsNow('woods', false).filter((id) => id !== 'squirrel');
    expect(pickMoment('woods', false, snapped, 0, 0)).toBe('squirrel');
    expect(pickMoment('woods', false, snapped, 0, S.freshShare - 0.01)).toBe('squirrel');
  });

  it('can be any of them once they are all snapped', () => {
    const all = momentsNow('woods', false);
    const seen = new Set(Array.from({ length: 20 }, (_, i) => pickMoment('woods', false, all, 0, i / 20)));
    expect(seen.size).toBe(all.length);
  });
});

describe('snapshots in the journal', () => {
  it('go on the place\'s page, a newer one of a moment replacing the old', () => {
    const s = newTeen(0);
    const first = takeSnapshot(s, 'woods', snap('leaf', 1));
    expect(first.isNew).toBe(true);
    expect(snappedAt(first.state, 'woods')).toEqual(['leaf']);
    const again = takeSnapshot(first.state, 'woods', snap('leaf', 2));
    expect(again.isNew).toBe(false);
    expect(again.state.journeys.journal.woods.snaps).toEqual([snap('leaf', 2)]);
    expect(again.state.journeys.journal.woods.trips).toBe(0);
  });
});

describe('tapping a pet on a trip', () => {
  it('finds the one in the middle, or the one on each side', () => {
    expect(tripPetAt(32, 30, 1)).toBe(0);
    expect(tripPetAt(5, 30, 1)).toBe(-1);
    expect(tripPetAt(16, 30, 2)).toBe(0);
    expect(tripPetAt(48, 30, 2)).toBe(1);
    expect(tripPetAt(32, 2, 2)).toBe(-1);
  });
});
