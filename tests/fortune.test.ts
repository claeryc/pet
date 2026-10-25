import { describe, expect, it } from 'vitest';
import { CONFIG } from '../src/game/config';
import { createNewGame } from '../src/game/state';
import { buyFortuneCookie, fortuneCookies } from '../src/game/economy';
import { fortuneOf, useFortuneCookie } from '../src/game/fortune';
import type { Forecast } from '../src/game/forecast';
import { STRINGS } from '../src/strings';

const NOON = new Date(2026, 0, 10, 12, 0).getTime();

function forecastOf(themes: [string, number][]): Forecast {
  return {
    littleOne: 80,
    stars: { 1: 0, 2: 40, 3: 60 },
    themes: themes.map(([theme, chance]) => ({ theme, element: null, chance })),
    variants: [],
  };
}

describe('the fortune cookie', () => {
  it('names the most likely theme, and a less likely one only if it has a real chance', () => {
    const from = CONFIG.fortune.surpriseFrom;
    expect(fortuneOf(forecastOf([['nature', 60], ['bakery', 30], ['ocean', 10]]), 'a')).toMatchObject({ likely: 'nature', surprise: 'bakery' });
    expect(fortuneOf(forecastOf([['nature', 95], ['bakery', from - 1]]), 'a')).toMatchObject({ likely: 'nature', surprise: null });
    expect(fortuneOf(forecastOf([]), 'a')).toMatchObject({ likely: null, surprise: null });
  });

  it('gives three different lucky numbers, the same each time for the same pair', () => {
    const f = forecastOf([['ocean', 100]]);
    const { lucky } = fortuneOf(f, 'mochi:pip');
    expect(lucky).toHaveLength(3);
    expect(new Set(lucky).size).toBe(3);
    expect([...lucky].sort((a, b) => a - b)).toEqual(lucky);
    for (const n of lucky) expect(n >= 1 && n <= 40).toBe(true);
    expect(fortuneOf(f, 'mochi:pip').lucky).toEqual(lucky);
  });

  it('has words for every theme', () => {
    for (const theme of ['nature', 'ocean', 'bakery', 'starry', 'cave']) {
      expect(STRINGS.friends.fortuneLikely[theme]).toBeTruthy();
      expect(STRINGS.friends.fortuneSurprise[theme]).toBeTruthy();
    }
  });

  it('is bought with gold and used up when opened', () => {
    const rich = { ...createNewGame(NOON), gold: 100 };
    const bought = buyFortuneCookie(rich).state;
    expect(fortuneCookies(bought)).toBe(1);
    expect(bought.gold).toBe(100 - CONFIG.fortune.price);
    expect(buyFortuneCookie({ ...rich, gold: 0 }).blocked).toBe('notEnoughGold');
    const opened = useFortuneCookie(bought)!;
    expect(fortuneCookies(opened)).toBe(0);
    expect(useFortuneCookie(opened)).toBeNull();
  });
});
