// The pet's three wishes for today, picked from what's open, the same for
// the whole day. Each counts up from a tally (see achievements.ts) as it
// was at the start of the day, and pays a little gold and Keeper XP once
// claimed. Never fragments.

import { CONFIG } from './config';
import { localDay } from './economy';
import { seededRoll } from './growth';
import { addXp } from './skills';
import { isUnlocked, type UnlockId } from './unlocks';
import type { GameState } from './state';

const W = CONFIG.wishes;

export interface Wish {
  id: string; // the tally it counts
  goal: number;
  from: number; // the tally when the day began
  claimed: boolean;
}

export interface Wishes {
  day: string;
  list: Wish[];
}

export const newWishes = (): Wishes => ({ day: '', list: [] });
export const wishesOf = (s: GameState): Wishes => s.wishes ?? newWishes();

const tally = (s: GameState, id: string) => s.tally[id] ?? 0;

// The wishes that can come true today: none for an egg.
function possible(state: GameState) {
  if (state.pet.stage === 'egg') return [];
  return W.pool.filter((w) => w.needs === null || isUnlocked(state, w.needs as UnlockId));
}

// Today's wishes, picked if the day is new (or none were picked while the
// pet was still an egg).
export function rollWishes(state: GameState, now: number): GameState {
  const day = localDay(now);
  const current = wishesOf(state);
  if (current.day === day && current.list.length > 0) return state;
  const pool = [...possible(state)];
  if (pool.length === 0) return current.day === day ? state : { ...state, wishes: { day, list: [] } };
  const list: Wish[] = [];
  for (let i = 0; i < W.perDay && pool.length > 0; i++) {
    const pick = pool.splice(Math.floor(seededRoll('wishes', `${day}:${i}`) * pool.length), 1)[0];
    list.push({ id: pick.id, goal: pick.goal, from: tally(state, pick.id), claimed: false });
  }
  return { ...state, wishes: { day, list } };
}

// How far along a wish is (0 to its goal).
export const wishProgress = (state: GameState, w: Wish): number => Math.min(w.goal, tally(state, w.id) - w.from);
export const wishDone = (state: GameState, w: Wish): boolean => wishProgress(state, w) >= w.goal;

// Wishes done but not yet claimed.
export const wishesToClaim = (state: GameState): number => wishesOf(state).list.filter((w) => !w.claimed && wishDone(state, w)).length;

// Claims wish `i` once it's done: gold and Keeper XP.
export function claimWish(state: GameState, i: number): GameState {
  const ws = wishesOf(state);
  const w = ws.list[i];
  if (!w || w.claimed || !wishDone(state, w)) return state;
  const list = ws.list.map((x, j) => (j === i ? { ...x, claimed: true } : x));
  return addXp({ ...state, gold: state.gold + W.gold, wishes: { ...ws, list } }, W.xp);
}
