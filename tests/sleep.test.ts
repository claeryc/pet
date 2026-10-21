import { describe, expect, it } from 'vitest';
import { simulate } from '../src/game/simulate';
import { newTeen } from './helpers';
import { feed, toggleLights } from '../src/game/actions';
import { CONFIG } from '../src/game/config';
import { newPet } from '../src/game/state';

const HOUR = 3_600_000;
const at = (day: number, hour: number) => new Date(2026, 0, day, hour, 0).getTime();

describe('sleep and day/night', () => {
  it('regains energy while the lights are off', () => {
    let s = newTeen(at(1, 22));
    s.pet.stats.energy = 20;
    s = toggleLights(s, at(1, 22)).state;
    expect(s.pet.asleep).toBe(true);
    s = simulate(s, at(1, 23));
    expect(s.pet.stats.energy).toBeCloseTo(20 + CONFIG.sleep.energyPerHourAsleep);
  });

  it('wakes up by itself in the morning', () => {
    let s = newTeen(at(1, 22));
    s = toggleLights(s, at(1, 22)).state;
    s = simulate(s, at(2, 7));
    expect(s.pet.asleep).toBe(true);
    s = simulate(s, at(2, 9));
    expect(s.pet.asleep).toBe(false);
  });

  it('gets hungry more slowly while asleep', () => {
    let s = newTeen(at(1, 22));
    s = toggleLights(s, at(1, 22)).state;
    s = simulate(s, at(1, 22) + 2 * HOUR);
    const expected = 80 - 2 * CONFIG.decayPerHour.hunger * CONFIG.sleep.decayMultiplierAsleep;
    expect(s.pet.stats.hunger).toBeCloseTo(expected);
  });

  it('gets tired faster staying up at night with the lights on', () => {
    const s = simulate(newTeen(at(1, 22)), at(1, 23));
    const expected = 80 - CONFIG.decayPerHour.energy * CONFIG.sleep.energyMultiplierNightAwake;
    expect(s.pet.stats.energy).toBeCloseTo(expected);
  });

  it('dozes off by itself when energy runs out', () => {
    const s = newTeen(at(1, 12));
    s.pet.stats.energy = 1;
    expect(simulate(s, at(1, 13)).pet.asleep).toBe(true);
  });

  it('cannot be fed while asleep', () => {
    const s = toggleLights(newTeen(at(1, 22)), at(1, 22)).state;
    expect(feed(s, at(1, 22)).blocked).toBe('asleep');
  });
});

describe('lights with two pets', () => {
  const withHousemate = (now: number) => {
    const s = newTeen(now);
    const other = newPet(now);
    other.stage = 'teen';
    other.name = 'Bean';
    s.housemates = [other];
    return s;
  };

  it('puts both pets to sleep and wakes them together', () => {
    let s = toggleLights(withHousemate(at(1, 22)), at(1, 22)).state;
    expect(s.pet.asleep).toBe(true);
    expect(s.housemates[0].asleep).toBe(true);
    s = toggleLights(s, at(1, 23)).state;
    expect(s.pet.asleep).toBe(false);
    expect(s.housemates[0].asleep).toBe(false);
  });

  it('turns the lights off for both even if the other pet was already dozing', () => {
    const s = withHousemate(at(1, 22));
    s.housemates[0].asleep = true;
    const next = toggleLights(s, at(1, 22)).state;
    expect(next.pet.asleep).toBe(true);
    expect(next.housemates[0].asleep).toBe(true);
  });

  it('leaves an egg alone', () => {
    const s = withHousemate(at(1, 22));
    s.housemates[0].stage = 'egg';
    const next = toggleLights(s, at(1, 22)).state;
    expect(next.pet.asleep).toBe(true);
    expect(next.housemates[0].asleep).toBe(false);
  });
});
