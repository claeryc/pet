import { describe, expect, it } from 'vitest';
import { simulate } from '../src/game/simulate';
import { CONFIG } from '../src/game/config';
import { newPet, type GameState } from '../src/game/state';
import { goodbyeResting, layToRest, restingFull, reviveResting } from '../src/game/resting';
import { familyGenerations } from '../src/game/family';
import { revivalStars } from '../src/game/economy';
import { migrate } from '../src/storage/storage';
import { newTeen } from './helpers';

const HOUR = 3_600_000;
const START = new Date(2026, 0, 1, 10, 0).getTime();

function passed(): GameState {
  const s = newTeen(START);
  s.pet.condition = 'passed';
  s.pet.passedAt = START;
  s.pet.stats.health = 0;
  return s;
}
const withStar = (s: GameState, n = 1): GameState =>
  ({ ...s, inventory: { ...s.inventory, supplies: { ...s.inventory.supplies, revivalStar: n } } });

describe('resting under the stars', () => {
  it('Let rest gives a new egg and one resting pet', () => {
    const s = passed();
    const out = layToRest(s, START + HOUR);
    expect(out.blocked).toBeUndefined();
    expect(out.state.pet.stage).toBe('egg');
    expect(out.state.resting.map((p) => p.id)).toEqual([s.pet.id]);
  });

  it('the next pet in the room takes its place when there is one', () => {
    const s = passed();
    const other = newPet(START);
    s.housemates = [other];
    const out = layToRest(s, START).state;
    expect(out.pet.id).toBe(other.id);
    expect(out.housemates).toEqual([]);
  });

  it('only works on a pet that passed away, and only while a spot is free', () => {
    expect(layToRest(newTeen(START), START).blocked).toBe('notPassed');
    const s = passed();
    s.resting = Array.from({ length: CONFIG.revival.restingSpots }, () => ({ ...newPet(START), condition: 'passed' as const }));
    expect(restingFull(s)).toBe(true);
    expect(layToRest(s, START).blocked).toBe('full');
  });

  it('nothing happens to a resting pet', () => {
    const s = layToRest(passed(), START).state;
    const later = simulate(s, START + 24 * 7 * HOUR);
    expect(later.resting[0]).toEqual(s.resting[0]);
  });

  it('bringing one back needs a star and a free spot, and returns it weak and resting', () => {
    const s = layToRest(passed(), START).state; // a new egg is home, one spot free
    const id = s.resting[0].id;
    expect(reviveResting(s, START, id).blocked).toBe('noRevival');
    const full = withStar({ ...s, housemates: [newPet(START)] });
    expect(reviveResting(full, START, id).blocked).toBe('noRoom');
    const now = START + 48 * HOUR;
    const out = reviveResting(withStar(s), now, id);
    expect(out.blocked).toBeUndefined();
    expect(revivalStars(out.state)).toBe(0);
    expect(out.state.resting).toEqual([]);
    expect(out.state.pet.id).toBe(id);
    expect(out.state.pet.condition).toBe('healthy');
    expect(out.state.pet.recoveryUntil).toBe(now + CONFIG.sickness.recoveryHours * HOUR);
    expect(out.state.pet.stats.health).toBe(CONFIG.revival.stats.health);
    expect(out.state.pet.starGlow).toBe(true);
    // Its life picks up where it left off.
    expect(out.state.pet.stageStartedAt).toBe(s.resting[0].stageStartedAt + (now - START));
    expect(out.state.housemates).toHaveLength(1);
  });

  it('saying goodbye moves a resting pet into the Family Tree, and shows it as resting till then', () => {
    const s = layToRest(passed(), START).state;
    const id = s.resting[0].id;
    const tree = familyGenerations(s).flatMap((g) => g.members);
    expect(tree.find((m) => m.id === id)?.resting).toBe(true);
    const out = goodbyeResting(s, id);
    expect(out.resting).toEqual([]);
    expect(out.family.map((m) => m.id)).toContain(id);
  });

  it('old saves start with nobody resting', () => {
    expect(migrate({ version: 47, state: {} } as never).state.resting).toEqual([]);
  });
});
