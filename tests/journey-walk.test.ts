import { describe, expect, it } from 'vitest';
import { legAt, legFor, stepWalk } from '../src/render/journey';

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
