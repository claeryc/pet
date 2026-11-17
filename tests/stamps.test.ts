import { describe, expect, it } from 'vitest';
import { CONFIG } from '../src/game/config';
import { CALENDAR_DAYS, fragmentsPerCalendar, nextDay, stamp, stampDue } from '../src/game/stamps';
import { claimWish, rollWishes, wishDone, wishesOf } from '../src/game/wishes';
import { migrate } from '../src/storage/storage';
import { newTeen } from './helpers';
import { createNewGame } from '../src/game/state';

const DAY = 86_400_000;
const START = new Date(2026, 0, 1, 10, 0).getTime();

describe('stamp calendar', () => {
  it('has 28 days and about 56 fragments a calendar', () => {
    expect(CALENDAR_DAYS).toBe(28);
    expect(fragmentsPerCalendar()).toBe(56);
  });

  it('two visits on one day give one stamp', () => {
    const s = newTeen(START);
    const one = stamp(s, START);
    expect(one.stamped?.day).toBe(1);
    expect(one.state.gold).toBe(s.gold + 20);
    expect(stamp(one.state, START + 3_600_000).stamped).toBeNull();
    expect(stampDue(one.state, START + 3_600_000)).toBe(false);
  });

  it('a gap of days loses nothing: the next stamp is the next day on the card', () => {
    let s = stamp(newTeen(START), START).state;
    const later = stamp(s, START + 5 * DAY);
    expect(later.stamped?.day).toBe(2);
    expect(later.state.inventory.seeds.carrot).toBe((s.inventory.seeds.carrot ?? 0) + 1);
    s = later.state;
    const third = stamp(s, START + 6 * DAY);
    expect(third.stamped?.day).toBe(3);
    expect(third.state.fragments.pieces).toBe(s.fragments.pieces + 2);
  });

  it('gift days give fragments and an item, and a full card starts again', () => {
    let s = newTeen(START);
    const before = s.fragments.pieces;
    for (let d = 0; d < 28; d++) s = stamp(s, START + d * DAY).state;
    expect(s.stamps.stamped).toBe(28);
    expect(s.fragments.pieces).toBe(before + 56);
    expect(nextDay(s)).toBe(1);
    const again = stamp(s, START + 28 * DAY);
    expect(again.stamped?.day).toBe(1);
    expect(again.state.stamps.stamped).toBe(1);
  });

  it('a material you have too many of turns into gold', () => {
    let s = newTeen(START);
    s = { ...s, stamps: { stamped: 3, day: '' }, crafting: { ...s.crafting, materials: { twig: CONFIG.crafting.maxEach } } };
    const out = stamp(s, START).state;
    expect(out.gold).toBe(s.gold + CONFIG.stamps.fullMaterialGold);
  });

  it('no stamp while everyone is on a Holiday', () => {
    const s = { ...newTeen(START), journeys: { ...newTeen(START).journeys, holiday: { from: START, until: START + DAY } } };
    expect(stamp(s, START).stamped).toBeNull();
  });

  it('an egg-only first day still stamps', () => {
    expect(stamp(createNewGame(START), START).stamped?.day).toBe(1);
  });

  it('old saves start a fresh calendar', () => {
    const out = migrate({ version: 48, state: {} } as never).state;
    expect(out.stamps).toEqual({ stamped: 0, day: '' });
    expect(out.wishes).toEqual({ day: '', list: [] });
  });
});

describe('wishes', () => {
  it('three a day, the same all day, only from what is open, none for an egg', () => {
    expect(wishesOf(rollWishes(createNewGame(START), START)).list).toEqual([]);
    const s = rollWishes(newTeen(START), START);
    const list = wishesOf(s).list;
    expect(list.length).toBeGreaterThan(0);
    expect(list.length).toBeLessThanOrEqual(3);
    expect(new Set(list.map((w) => w.id)).size).toBe(list.length);
    const open = CONFIG.wishes.pool.filter((w) => w.needs === null).map((w) => w.id);
    expect(open.length).toBeGreaterThan(0);
    expect(rollWishes(s, START + 3_600_000)).toBe(s);
  });

  it('counts from the start of the day and pays once claimed', () => {
    let s = rollWishes(newTeen(START), START);
    const w = wishesOf(s).list[0];
    expect(wishDone(s, w)).toBe(false);
    expect(claimWish(s, 0)).toBe(s);
    s = { ...s, tally: { ...s.tally, [w.id]: (s.tally[w.id] ?? 0) + w.goal } };
    expect(wishDone(s, w)).toBe(true);
    const paid = claimWish(s, 0);
    expect(paid.gold).toBe(s.gold + CONFIG.wishes.gold);
    expect(wishesOf(paid).list[0].claimed).toBe(true);
    expect(claimWish(paid, 0)).toBe(paid);
  });
});
