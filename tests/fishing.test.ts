import { describe, expect, it } from 'vitest';
import { CONFIG } from '../src/game/config';
import { feed, type Food } from '../src/game/actions';
import { foodCount } from '../src/game/economy';
import {
  biteDelayMs,
  cast,
  gradeAt,
  land,
  nextCenter,
  pickCatch,
  placeZones,
  reelGrade,
  reelOutcome,
  reelZones,
  startReel,
  stepReel,
  type Reel,
} from '../src/game/fishing';
import { createNewGame } from '../src/game/state';
import { newTeen } from './helpers';

const HOUR = 3_600_000;
const START = new Date(2026, 0, 1, 10, 0).getTime();
const f = CONFIG.fishing;

describe('the catch bar', () => {
  it('always fits the zones fully on the bar, wherever they land', () => {
    for (const r of [0, 0.25, 0.5, 0.999]) {
      const z = placeZones(r);
      expect(z.weak.start).toBeGreaterThanOrEqual(0);
      expect(z.weak.end).toBeLessThanOrEqual(1);
      // red inside yellow inside green
      expect(z.good.start).toBeLessThan(z.perfect.start);
      expect(z.weak.start).toBeLessThan(z.good.start);
      expect(z.perfect.end).toBeLessThan(z.good.end);
      expect(z.good.end).toBeLessThan(z.weak.end);
    }
  });

  it('moves the zones to a different spot each time', () => {
    expect(placeZones(0.1).perfect.start).not.toBe(placeZones(0.9).perfect.start);
  });

  it('green is perfect, yellow is good, red is weak, blue is no catch', () => {
    const z = placeZones(0.5);
    const mid = (z.perfect.start + z.perfect.end) / 2;
    expect(gradeAt(z, mid)).toBe('perfect');
    expect(gradeAt(z, z.perfect.end + f.zoneWidths.good / 2)).toBe('good');
    expect(gradeAt(z, z.perfect.start - f.zoneWidths.good / 2)).toBe('good');
    expect(gradeAt(z, z.good.end + f.zoneWidths.weak / 2)).toBe('weak');
    expect(gradeAt(z, z.good.start - f.zoneWidths.weak / 2)).toBe('weak');
    expect(gradeAt(z, 0)).toBe('miss');
    expect(gradeAt(z, 1)).toBe('miss');
  });

  it('moves the zones a bit to the left or right, staying on the bar', () => {
    const { min, max } = f.reel.shiftBy;
    expect(nextCenter(0.5, 0)).toBeCloseTo(0.5 - min);
    expect(nextCenter(0.5, 0.999)).toBeCloseTo(0.5 + max, 2);
    // Near an end it slides back the other way.
    const z = placeZones(0);
    const lowest = (z.weak.start + z.weak.end) / 2;
    expect(nextCenter(lowest, 0.1)).toBeGreaterThan(lowest);
  });
});

// Runs a reel for `ms` in 16ms steps, holding Pull whenever `hold` says so.
function run(reel: Reel, ms: number, hold: (r: Reel) => boolean, random = 0.5): Reel {
  for (let t = 0; t < ms && !reelOutcome(reel); t += 16) reel = stepReel(reel, hold(reel), 16, random);
  return reel;
}

// Holds Pull while the dot is heading to stop short of the green stripe's
// middle (letting go a little early, as a player would).
const chase = (r: Reel) => {
  const z = reelZones(r);
  return r.marker + r.speed * 0.1 < (z.perfect.start + z.perfect.end) / 2;
};

describe('reeling in', () => {
  it('starts with the dot at the left end', () => {
    const r = startReel(0.5);
    expect(r.marker).toBe(0);
    expect(r.meter).toBe(f.reel.meterStart);
  });

  it('holding Pull moves the dot right, letting go drifts it back left', () => {
    const held = run(startReel(0.5), 400, () => true);
    expect(held.marker).toBeGreaterThan(0.1);
    const released = run(held, 1200, () => false);
    expect(released.marker).toBeLessThan(held.marker);
    expect(run(released, 3000, () => false).marker).toBe(0);
  });

  it('the dot stays on the bar', () => {
    const r = run(startReel(0.5), 3000, () => true);
    expect(r.marker).toBeLessThanOrEqual(1);
  });

  it('the zones slide to a new spot every few seconds', () => {
    const start = startReel(0.5);
    let r = start;
    // The meter is kept topped up so the fish doesn't get away meanwhile.
    for (let t = 0; t < (f.reel.shiftEverySeconds.max + f.reel.glideSeconds) * 1000 + 100; t += 16) {
      r = { ...stepReel(r, false, 16, 0.5), meter: 0.5 };
    }
    expect(r.center).not.toBeCloseTo(start.center);
  });

  it('keeping the dot on green lands a perfect catch', () => {
    const r = run(startReel(0.5), 20_000, chase);
    expect(reelOutcome(r)).toBe('landed');
    expect(reelGrade(r)).toBe('perfect');
  });

  it('never pulling loses the fish', () => {
    const r = run(startReel(0.5), 20_000, () => false);
    expect(reelOutcome(r)).toBe('lost');
  });

  it('grades a catch by where the dot spent its time', () => {
    const r = startReel(0.5);
    const at = (perfect: number, good: number, weak: number, miss = 0) => reelGrade({ ...r, timeIn: { perfect, good, weak, miss } });
    expect(at(7, 2, 1)).toBe('perfect');
    expect(at(3, 4, 3)).toBe('good');
    expect(at(1, 2, 7)).toBe('weak');
    expect(at(0, 0, 0, 5)).toBe('miss');
  });

  it('a fish bites within the set time', () => {
    expect(biteDelayMs(0)).toBe(f.biteAfterSeconds.min * 1000);
    expect(biteDelayMs(1)).toBe(f.biteAfterSeconds.max * 1000);
  });
});

describe('landing a fish', () => {
  it('uses the chance for each kind of catch', () => {
    const s = newTeen(START);
    expect(land(s, 'perfect', 0.999, 0).count).toBe(1);
    expect(land(s, 'good', 0.74, 0).count).toBe(1);
    expect(land(s, 'good', 0.75, 0).caught).toBeNull();
    expect(land(s, 'weak', 0.29, 0).count).toBe(1);
    expect(land(s, 'weak', 0.3, 0).caught).toBeNull();
    expect(land(s, 'miss', 0, 0).caught).toBeNull();
  });

  it('catches shrimp, salmon or lobster by the odds', () => {
    const other = f.catchOdds.other;
    expect(pickCatch('good', 0)).toBe('shrimp');
    expect(pickCatch('good', (other.shrimp - 1) / 100)).toBe('shrimp');
    expect(pickCatch('good', (other.shrimp + 1) / 100)).toBe('salmon');
    expect(pickCatch('weak', 0.999)).toBe('lobster');
    // A perfect catch makes lobster more likely.
    const perfect = f.catchOdds.perfect;
    expect(pickCatch('perfect', 1 - (perfect.lobster - 1) / 100)).toBe('lobster');
    expect(pickCatch('good', 1 - (perfect.lobster - 1) / 100)).toBe('salmon');
  });

  it('the three catches are 1, 2 and 3 stars and are not sold in the Shop', () => {
    const caught = (CONFIG.foods as readonly Food[]).filter((x) => x.caughtOnly);
    expect(caught.map((x) => [x.id, x.stars])).toEqual([['shrimp', 1], ['salmon', 2], ['lobster', 3]]);
  });

  it('puts the catch in the inventory, where the pet can eat it', () => {
    let s = newTeen(START);
    s = land(s, 'perfect', 0, 0.999).state; // a lobster
    s = land(s, 'perfect', 0, 0.999).state;
    expect(foodCount(s, 'lobster')).toBe(2);
    const fed = feed(s, START, 'lobster');
    expect(fed.blocked).toBeUndefined();
    expect(foodCount(fed.state, 'lobster')).toBe(1);
  });

  it('a slipped fish changes nothing', () => {
    const s = newTeen(START);
    expect(land(s, 'weak', 0.9, 0).state).toBe(s);
  });
});

describe('casting', () => {
  it('costs a little energy', () => {
    const s = newTeen(START);
    const r = cast(s, START);
    expect(r.blocked).toBeUndefined();
    expect(r.state.pet.stats.energy).toBe(s.pet.stats.energy - f.energyPerCast);
  });

  it("can't fish as an egg, asleep, too tired, sick or resting", () => {
    expect(cast(createNewGame(START), START).blocked).toBe('egg');
    const asleep = newTeen(START);
    asleep.pet.asleep = true;
    expect(cast(asleep, START).blocked).toBe('asleep');
    const tired = newTeen(START);
    tired.pet.stats.energy = f.energyPerCast - 1;
    expect(cast(tired, START).blocked).toBe('tooTired');
    const sick = newTeen(START);
    sick.pet.condition = 'sick';
    expect(cast(sick, START).blocked).toBe('resting');
    const resting = newTeen(START);
    resting.pet.recoveryUntil = START + HOUR;
    expect(cast(resting, START).blocked).toBe('resting');
  });
});
