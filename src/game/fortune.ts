// The fortune cookie: a gentle hint before mingling. Instead of the
// forecast's numbers (forecast.ts), it names the theme the little one most
// likely grows into, and maybe one more as a surprise. The words live in
// strings.ts; this only picks the themes and the lucky numbers.

import { CONFIG } from './config';
import { seededRoll } from './growth';
import { fortuneCookies } from './economy';
import type { Forecast } from './forecast';
import type { GameState } from './state';

export interface Fortune {
  likely: string | null; // the most likely theme
  surprise: string | null; // a less likely one worth a mention
  lucky: number[]; // three numbers, just for fun
}

// The fortune for forecast `f`. `seed` keeps the lucky numbers the same
// for the same pair of pets.
export function fortuneOf(f: Forecast, seed: string): Fortune {
  const [first, ...rest] = f.themes;
  const surprise = rest.find((t) => t.chance >= CONFIG.fortune.surpriseFrom);
  const lucky: number[] = [];
  for (let i = 0; lucky.length < 3; i++) {
    const n = 1 + Math.floor(seededRoll(seed, `lucky:${i}`) * 40);
    if (!lucky.includes(n)) lucky.push(n);
  }
  return { likely: first?.theme ?? null, surprise: surprise?.theme ?? null, lucky: lucky.sort((a, b) => a - b) };
}

// Takes one fortune cookie out of the supplies. Returns null if there's
// none left.
export function useFortuneCookie(state: GameState): GameState | null {
  const have = fortuneCookies(state);
  if (have <= 0) return null;
  const supplies = { ...state.inventory.supplies, fortuneCookie: have - 1 };
  return { ...state, inventory: { ...state.inventory, supplies } };
}
