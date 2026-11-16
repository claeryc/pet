// The stamp calendar: 28 days, each with its reward shown from the start.
// The first visit of each day stamps the next day and hands over its
// reward. It counts visits, not dates, so a missed day is never lost: the
// next stamp is always the next day on the card. Once all 28 are stamped,
// the full card stays up for the rest of that day and a new one starts
// with the next stamp.

import { CONFIG } from './config';
import { localDay } from './economy';
import { addFragments } from './fragments';
import { giveFind, parseFind } from './journeys';
import { materialCount } from './crafting';
import type { GameState } from './state';

const S = CONFIG.stamps;
export const CALENDAR_DAYS = S.days.length;

export interface Stamps {
  stamped: number; // days stamped on the card so far (0 to 28)
  day: string; // the local day of the last stamp ('' = never)
}

export const newStamps = (): Stamps => ({ stamped: 0, day: '' });
export const stampsOf = (s: GameState): Stamps => s.stamps ?? newStamps();

// What one calendar day gives: its entries, as written in the config.
export const dayReward = (n: number): readonly string[] => S.days[(n - 1) % CALENDAR_DAYS];

// True on a gift day (7, 14, 21, 28).
export const isGiftDay = (n: number): boolean => n % 7 === 0;

// The day the next stamp goes on (1 to 28), counting a full card as a new one.
export function nextDay(state: GameState): number {
  const { stamped } = stampsOf(state);
  return stamped >= CALENDAR_DAYS ? 1 : stamped + 1;
}

// True when today's stamp is still waiting.
export function stampDue(state: GameState, now: number): boolean {
  return stampsOf(state).day !== localDay(now) && !state.journeys.holiday;
}

// Hands over one entry ("gold:20", "frag:3", "mat:twig", a food...).
export function giveEntry(state: GameState, entry: string): GameState {
  if (entry.startsWith('frag:')) return addFragments(state, Number(entry.slice(5)));
  const find = parseFind(entry, 1);
  if (find.kind === 'material' && materialCount(state, find.id) >= CONFIG.crafting.maxEach) {
    return { ...state, gold: state.gold + S.fullMaterialGold };
  }
  return giveFind(state, find);
}

// Stamps today, if it isn't yet: the next day's reward is handed over.
// Nothing while everyone is away on a Holiday (the game is paused then).
// Returns the day stamped (1 to 28) and what it gave, or null.
export function stamp(state: GameState, now: number): { state: GameState; stamped: { day: number; reward: readonly string[] } | null } {
  if (!stampDue(state, now)) return { state, stamped: null };
  const day = nextDay(state);
  const reward = dayReward(day);
  let s: GameState = { ...state, stamps: { stamped: day, day: localDay(now) } };
  for (const entry of reward) s = giveEntry(s, entry);
  return { state: s, stamped: { day, reward } };
}

// Star fragments on a whole calendar (kept near 56, see config.ts).
export const fragmentsPerCalendar = (): number =>
  S.days.flat().filter((e) => e.startsWith('frag:')).reduce((n, e) => n + Number(e.slice(5)), 0);
