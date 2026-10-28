import { describe, expect, it } from 'vitest';
import { CONFIG } from '../src/game/config';
import {
  CELLS, canDigAt, dig, digsLeft, digToday, flooded, found, lineCells, placesFor, reachable, rollSpot, sniff, sniffsLeft, spotOf, tideIn,
  tideLines, treasureAt, warmth, SIZE,
} from '../src/game/dig';
import { localDay } from '../src/game/economy';
import { MEADOW } from '../src/game/journeys';
import { createNewGame, type DigSpot, type GameState } from '../src/game/state';
import { isUnlocked, unlocksFor } from '../src/game/unlocks';
import { newTeen } from './helpers';

const HOUR = 3_600_000;
const START = new Date(2026, 0, 1, 10, 0).getTime();
const D = CONFIG.dig;

// A teen with the woods and the cove open (a harvest and plenty of fish).
function opened(now = START): GameState {
  const s = newTeen(now);
  s.grown = ['carrot'];
  s.tally = { ...s.tally, fish: 20 };
  return s;
}

// A cell with no treasure, root or sea in it.
const emptyCell = (spot: DigSpot) => [...Array(CELLS).keys()].find((c) => canDigAt(spot, c) && !treasureAt(spot, c))!;

describe("today's spots", () => {
  it('always has the Meadow first and four places, open ones before locked ones', () => {
    const fresh = newTeen(START);
    const places = placesFor(fresh, '2026-01-01');
    expect(places).toHaveLength(D.spots);
    expect(places[0]).toBe(MEADOW);
    // Only the market is open: it comes right after the Meadow.
    expect(places[1]).toBe('market');
    const s = digToday(fresh, START);
    expect(s.dig.spots.map((x) => x.place)).toEqual([MEADOW, 'market']);
  });

  it('rolls the same spots for the same day, and new ones the next day', () => {
    const a = digToday(opened(), START);
    const b = digToday(opened(), START + HOUR);
    expect(b.dig).toEqual(a.dig);
    const c = digToday(a, START + 24 * HOUR);
    expect(c.dig.day).toBe(localDay(START + 24 * HOUR));
    expect(c.dig.used).toBe(0);
  });

  it('buries the right number of treasures, never under roots, each in its own cell', () => {
    for (const place of [MEADOW, 'market', 'woods', 'cove', 'hill']) {
      for (const rare of [false, true]) {
        const spot = rollSpot('2026-01-01', place, rare, []);
        const extra = (rare ? 1 : 0) + (place === 'market' ? D.marketGold : 0);
        expect(spot.treasures).toHaveLength(D.treasures + extra);
        expect(new Set(spot.treasures.map((t) => t.cell)).size).toBe(spot.treasures.length);
        for (const t of spot.treasures) expect(spot.roots).not.toContain(t.cell);
        expect(spot.roots).toHaveLength(place === 'woods' ? D.roots : 0);
        expect(spot.tide !== null).toBe(place === 'cove');
        expect(spot.stars).toBe(rare ? 3 : spot.stars);
      }
    }
  });

  it('a rare spot has a 3-star find and the place ingredient', () => {
    const spot = rollSpot('2026-01-01', 'cove', true, []);
    expect(spot.stars).toBe(3);
    expect(spot.treasures.some((t) => t.stars === 3)).toBe(true);
    expect(spot.treasures.some((t) => t.find === 'seaweed')).toBe(true);
  });

  it('never buries an energy drink', () => {
    for (let d = 1; d <= 28; d++) {
      for (const place of [MEADOW, 'market', 'woods', 'cove', 'hill']) {
        const spot = rollSpot(`2026-02-${d}`, place, d % 3 === 0, []);
        expect(spot.treasures.map((t) => t.find)).not.toContain('energyDrink');
      }
    }
  });

  it('gives one more sniff on the hill and where a pet loves the place', () => {
    expect(rollSpot('d', MEADOW, false, []).sniffs).toBe(D.sniffs);
    expect(rollSpot('d', 'hill', false, []).sniffs).toBe(D.sniffs + 1);
    expect(rollSpot('d', 'woods', false, [], true).sniffs).toBe(D.sniffs + 1);
  });
});

describe('digging', () => {
  it('shows how many treasures are next to an empty hole, and uses a dig', () => {
    let s = digToday(opened(), START);
    const spot = spotOf(s, MEADOW)!;
    const cell = emptyCell(spot);
    const r = dig(s, START, MEADOW, cell);
    expect(r.blocked).toBeUndefined();
    expect(r.warmth).toBe(warmth(spot, cell));
    s = r.state;
    expect(digsLeft(s)).toBe(D.digsPerDay - 1);
    expect(spotOf(s, MEADOW)!.dug).toEqual([cell]);
    // The same hole can't be dug twice.
    expect(dig(s, START, MEADOW, cell).blocked).toBe('cantDig');
  });

  it('counts the eight squares around a hole', () => {
    const spot: DigSpot = {
      place: MEADOW, stars: 1, dug: [], sniffed: [], sniffs: 1, roots: [], tide: null,
      treasures: [0, 2, 12, 14, 35].map((cell) => ({ cell, find: 'gold:8', stars: 1 })),
    };
    expect(warmth(spot, 7)).toBe(4); // row 1, column 1: all four corners around it
    expect(warmth(spot, 1)).toBe(2);
    expect(warmth(spot, 28)).toBe(1); // row 4, column 4: 35 is a corner away
    expect(warmth(spot, 30)).toBe(0);
  });

  it('gives what was buried', () => {
    const s = digToday(opened(), START);
    const spot = spotOf(s, 'cove')!;
    const t = spot.treasures.find((x) => x.find.startsWith('gold:')) ?? spot.treasures[0];
    const r = dig(s, START, 'cove', t.cell);
    expect(r.find).toBeDefined();
    if (t.find.startsWith('gold:')) expect(r.state.gold).toBe(s.gold + Number(t.find.split(':')[1]));
    expect(found(spotOf(r.state, 'cove')!)).toHaveLength(1);
  });

  it('shares the digs between spots, and stops at the daily limit', () => {
    let s = digToday(opened(), START);
    for (let i = 0; i < D.digsPerDay; i++) {
      const place = i % 2 ? MEADOW : 'market';
      const r = dig(s, START, place, emptyCell(spotOf(s, place)!));
      expect(r.blocked).toBeUndefined();
      s = r.state;
    }
    expect(digsLeft(s)).toBe(0);
    expect(dig(s, START, MEADOW, emptyCell(spotOf(s, MEADOW)!)).blocked).toBe('noDigs');
    // A new day, new digs.
    expect(dig(s, START + 24 * HOUR, MEADOW, 0).blocked).not.toBe('noDigs');
  });

  it("can't dig through roots", () => {
    const s = digToday(opened(), START);
    const woods = spotOf(s, 'woods');
    if (!woods) return; // the woods aren't on today's board
    expect(dig(s, START, 'woods', woods.roots[0]).blocked).toBe('cantDig');
  });

  it('costs no energy', () => {
    const s = digToday(opened(), START);
    const r = dig(s, START, MEADOW, emptyCell(spotOf(s, MEADOW)!));
    expect(r.state.pet.stats.energy).toBe(s.pet.stats.energy);
  });

  it("is refused while the pet is asleep or still an egg", () => {
    const asleep = digToday(opened(), START);
    asleep.pet.asleep = true;
    expect(dig(asleep, START, MEADOW, 0).blocked).toBe('asleep');
    const egg = digToday(createNewGame(START), START);
    expect(dig(egg, START, MEADOW, 0).blocked).toBe('egg');
  });
});

describe('sniffing', () => {
  it('points at a treasure you can still get to, without using a dig', () => {
    const s = digToday(opened(), START);
    const r = sniff(s, START, MEADOW);
    expect(r.cell).toBeDefined();
    const spot = spotOf(r.state, MEADOW)!;
    expect(treasureAt(spot, r.cell!)).toBeDefined();
    expect(sniffsLeft(spot)).toBe(spot.sniffs - 1);
    expect(r.state.dig.used).toBe(0);
    if (sniffsLeft(spot) === 0) expect(sniff(r.state, START, MEADOW).blocked).toBe('noSniffs');
  });
});

describe('the tide at the cove', () => {
  const cove = (): DigSpot => ({ ...rollSpot('2026-01-01', 'cove', false, []), tide: 'left' });

  it('covers another line every few digs there, up to the most it comes in', () => {
    let spot = cove();
    expect(tideLines(spot)).toBe(0);
    expect(tideIn(spot)).toBe(D.tideEvery);
    const far = lineCells('right', 0); // dig on the far side
    for (let i = 0; i < D.tideEvery; i++) spot = { ...spot, dug: [...spot.dug, far[i]] };
    expect(tideLines(spot)).toBe(1);
    for (const c of lineCells('left', 0)) expect(canDigAt(spot, c)).toBe(false);
    for (let i = 0; i < 10; i++) spot = { ...spot, dug: [...spot.dug, lineCells('right', 1)[i % SIZE]] };
    expect(tideLines(spot)).toBe(D.tideLines);
    expect(tideIn(spot)).toBeNull();
  });

  it('leaves holes already dug alone', () => {
    let spot = cove();
    const first = lineCells('left', 0)[0];
    spot = { ...spot, dug: [first, ...lineCells('right', 0).slice(0, D.tideEvery - 1)] };
    expect(flooded(spot).has(first)).toBe(false);
  });

  it('says when the tide just came in', () => {
    let s = digToday(opened(), START);
    if (!spotOf(s, 'cove')) return;
    let rose = false;
    for (let i = 0; i < D.tideEvery; i++) {
      const spot = spotOf(s, 'cove')!;
      const r = dig(s, START, 'cove', emptyCell(spot));
      rose = !!r.flooded;
      s = r.state;
    }
    expect(rose).toBe(true);
  });
});

describe('leftovers', () => {
  it('keeps what was left in the ground for the next day the place comes up', () => {
    const s = digToday(opened(), START);
    const meadow = spotOf(s, MEADOW)!;
    const next = digToday(s, START + 24 * HOUR);
    const kept = meadow.treasures.slice(0, D.keepLeftovers).map(({ find, stars }) => ({ find, stars }));
    const again = spotOf(next, MEADOW)!.treasures.slice(0, D.keepLeftovers).map(({ find, stars }) => ({ find, stars }));
    expect(again).toEqual(kept);
    expect(next.dig.leftovers[MEADOW]).toBeUndefined();
  });

  it('remembers a place that is not on the next board', () => {
    const s = digToday(opened(), START);
    const spot = s.dig.spots[1];
    const later = { ...s, dig: { ...s.dig, day: 'old', places: [spot.place], spots: [spot] } };
    const t = digToday({ ...later, dig: { ...later.dig } }, START + 24 * HOUR);
    if (t.dig.places.includes(spot.place)) return;
    expect(t.dig.leftovers[spot.place]).toHaveLength(D.keepLeftovers);
  });
});

describe('opening up and saving', () => {
  it('opens after the first harvest or fish', () => {
    const s = newTeen(START);
    expect(unlocksFor(s)).not.toContain('dig');
    s.caught = ['shrimp'];
    expect(unlocksFor(s)).toContain('dig');
    expect(isUnlocked({ ...s, unlocked: [...s.unlocked, 'dig'] }, 'dig')).toBe(true);
  });

  it('reaches every reachable treasure', () => {
    const s = digToday(opened(), START);
    expect(reachable(spotOf(s, MEADOW)!)).toHaveLength(spotOf(s, MEADOW)!.treasures.length);
  });
});
