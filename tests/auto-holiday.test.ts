import { describe, expect, it } from 'vitest';
import { simulate } from '../src/game/simulate';
import { CONFIG } from '../src/game/config';
import { awayNotes } from '../src/game/away';
import { callHome, holidayTickets } from '../src/game/journeys';
import { migrate } from '../src/storage/storage';
import { newTeen } from './helpers';

const HOUR = 3_600_000;
const START = new Date(2026, 0, 1, 10, 0).getTime();

// A teen in an old game (no first-week cushion), left hungry.
function leftAlone(auto: boolean, tickets = 1) {
  const s = newTeen(START);
  s.startedAt = 0;
  s.pet.stats.hunger = 25;
  s.settings = { autoHoliday: auto };
  s.inventory.supplies = { ...s.inventory.supplies, 'ticket:holiday': tickets };
  return s;
}

describe('auto-holiday', () => {
  it('is off by default in a new game and in old saves', () => {
    expect(newTeen(START).settings.autoHoliday).toBe(false);
    expect(migrate({ version: 46, state: {} } as never).state.settings).toEqual({ autoHoliday: false });
  });

  it('switch off: the pet gets sick as usual', () => {
    const out = simulate(leftAlone(false), START + 6 * HOUR);
    expect(out.pet.condition).toBe('sick');
    expect(holidayTickets(out)).toBe(1);
  });

  it('switch on with a ticket: the pet goes on holiday instead of getting sick', () => {
    const out = simulate(leftAlone(true), START + 2 * 24 * HOUR);
    expect(out.pet.condition).not.toBe('sick');
    expect(out.pet.trip?.holiday).toBe(true);
    expect(out.journeys.holiday?.auto).toBe(true);
    expect(holidayTickets(out)).toBe(0);
    const until = out.journeys.holiday!.until - out.journeys.holiday!.from;
    expect(until).toBe(CONFIG.journeys.holiday.autoDays * 24 * HOUR);
    const note = out.messages.find((m) => m.kind === 'autoHoliday');
    expect(note).toMatchObject({ name: out.pet.name, days: 3 });
    const notes = awayNotes(leftAlone(true), out, START, START + 2 * 24 * HOUR);
    expect(notes.some((n) => n.kind === 'autoHoliday')).toBe(true);
  });

  it('can be called home early', () => {
    const away = simulate(leftAlone(true), START + 10 * HOUR);
    expect(away.pet.trip?.holiday).toBe(true);
    const home = callHome(away, START + 10 * HOUR, away.pet.id);
    expect(home.blocked).toBeUndefined();
  });

  it('switch on with no ticket: the pet gets sick as usual', () => {
    const out = simulate(leftAlone(true, 0), START + 6 * HOUR);
    expect(out.pet.condition).toBe('sick');
  });

  it('waits while a pet is out on a journey', () => {
    const s = leftAlone(true);
    const other = { ...s.pet, id: 'other', name: 'Bun', stats: { ...s.pet.stats, hunger: 90 },
      trip: { place: 'market', rarity: 'common' as const, startedAt: START, endsAt: START + 48 * HOUR,
        from: { hunger: 90, energy: 90 }, to: { hunger: 80, energy: 80 }, joy: 0, finds: [], percy: 'none' as const,
        charm: null, with: null, backAt: null, early: false } };
    s.housemates = [other];
    const out = simulate(s, START + 6 * HOUR);
    expect(out.pet.condition).toBe('sick');
    expect(holidayTickets(out)).toBe(1);
  });
});
