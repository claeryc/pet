import { describe, expect, it } from 'vitest';
import { CONFIG } from '../src/game/config';
import { getLook } from '../src/game/stats';
import { newTeen } from './helpers';

describe('which animation the pet shows', () => {
  it('looks cheerful when very happy, and plain idle otherwise', () => {
    const { pet } = newTeen(0);
    pet.stats.happiness = CONFIG.cheerfulHappiness;
    expect(getLook(pet)).toBe('cheerful');
    pet.stats.happiness = CONFIG.cheerfulHappiness - 1;
    expect(getLook(pet)).toBe('idle');
  });

  it('sad, sick and asleep win over cheerful', () => {
    const { pet } = newTeen(0);
    pet.stats.happiness = 100;
    pet.stats.hunger = 0;
    expect(getLook(pet)).toBe('sad');
    pet.condition = 'sick';
    expect(getLook(pet)).toBe('sick');
    pet.asleep = true;
    expect(getLook(pet)).toBe('sleep');
  });
});
