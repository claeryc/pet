import { describe, expect, it } from 'vitest';
import { glintAt, legAt, legFor, parcelAt, PERCY_DROP_MS, percyAt, stepWalk, WALK_SPEED } from '../src/render/journey';

describe('the walk to a place', () => {
  it('goes across the fields, past the forest edge and into the woods', () => {
    expect(legFor('woods', 0)).toBe('fields');
    expect(legFor('woods', 0.45)).toBe('edge');
    expect(legFor('woods', 0.75)).toBe('woods');
  });

  it('shows the place itself once they are there', () => {
    expect(legFor('woods', 0.9)).toBeNull();
    expect(legFor('woods', 1)).toBeNull();
  });

  it('has no walk for places without one yet', () => {
    expect(legFor('market', 0.1)).toBeNull();
  });

  it('starts on its leg with nothing to switch from', () => {
    const walk = stepWalk(null, 'woods', 'edge', 500);
    expect(legAt(walk, -1000, 1, 64)).toBe('edge');
    expect(legAt(walk, 1000, 1, 64)).toBe('edge');
  });

  it('brings new scenery in from past the right-hand edge', () => {
    const fields = stepWalk(null, 'woods', 'fields', 0);
    expect(stepWalk(fields, 'woods', 'fields', 300)).toBe(fields);
    const edge = stepWalk(fields, 'woods', 'edge', 1000);
    // On screen now (the ground's 1000 to 1064): still the fields.
    expect(legAt(edge, 1063, 1, 64)).toBe('fields');
    expect(legAt(edge, 1100, 1, 64)).toBe('edge');
    // The far layer goes by slower, so its change is further along it.
    expect(legAt(edge, 230, 0.2, 64)).toBe('fields');
    expect(legAt(edge, 300, 0.2, 64)).toBe('edge');
  });
});

describe('things spotted on the way', () => {
  it('a glint comes in from the right and goes by with the ground', () => {
    const at = glintAt(1000, 1000, true, 64)!;
    expect(at.x).toBeGreaterThan(64);
    expect(glintAt(1000, 3000, true, 64)!.x).toBeLessThan(at.x);
    expect(glintAt(1000, 1000 + 80 / WALK_SPEED, true, 64)).toBeNull();
  });

  it('stays put a while where there is no walk', () => {
    expect(glintAt(0, 5000, false, 64)).toEqual(glintAt(0, 20000, false, 64));
    expect(glintAt(0, 60000, false, 64)).toBeNull();
  });

  it('Percy crosses from the left and drops his parcel on the way', () => {
    expect(percyAt(0, 0, 64)!).toBeLessThan(0);
    expect(parcelAt(0, PERCY_DROP_MS - 1, true)).toBeNull();
    expect(parcelAt(0, PERCY_DROP_MS, true)).not.toBeNull();
    expect(percyAt(0, 60000, 64)).toBeNull();
  });
});
