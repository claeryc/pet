import { describe, expect, it } from 'vitest';
import { CONFIG } from '../src/game/config';
import { FURNITURE, inUse, ownsDecor, takeDownFurniture, useDecor } from '../src/game/decor';
import { buyBigJar, buyDecor, buyHat, dailySpecial, getHat, localDay, riceJarSize, stepRiceJar } from '../src/game/economy';
import { createNewGame, type GameState } from '../src/game/state';
import { FURNITURE_ART } from '../src/render/furniture';

const DAY = 24 * 3_600_000;
const HOUR = 3_600_000;
const START = new Date(2026, 0, 1, 10, 0).getTime();
const rich = (t = START): GameState => ({ ...createNewGame(t), gold: 10_000 });

// A day (from START) whose special is, or isn't, a piece of furniture.
function dayWithSpecial(furniture: boolean): number {
  let t = START;
  while ((dailySpecial(createNewGame(t))?.kind === 'furniture') !== furniture) t += DAY;
  return t;
}

describe('furniture', () => {
  it('every piece has a picture with even rows', () => {
    for (const f of FURNITURE) {
      const rows = FURNITURE_ART[f.id];
      expect(rows, f.id).toBeDefined();
      expect(new Set(rows.map((r) => r.length)).size, f.id).toBe(1);
    }
  });

  it('buying places it in its spot; another piece for that spot takes its place', () => {
    const t = dayWithSpecial(false);
    let s = buyDecor(rich(t), 'furniture', 'plant').state;
    expect(ownsDecor(s, 'furniture', 'plant')).toBe(true);
    expect(s.gold).toBe(10_000 - FURNITURE.find((f) => f.id === 'plant')!.price);
    expect(s.room.furniture).toEqual({ left: 'plant' });
    s = buyDecor(s, 'furniture', 'bookshelf').state;
    s = buyDecor(s, 'furniture', 'lamp').state;
    expect(s.room.furniture).toEqual({ left: 'lamp', right: 'bookshelf' });
    expect(inUse(s, 'furniture', 'plant')).toBe(false);
    s = useDecor(s, 'furniture', 'plant').state;
    expect(s.room.furniture).toEqual({ left: 'plant', right: 'bookshelf' });
  });

  it("can be taken down and put back, and can't be placed before it's bought", () => {
    let s = rich();
    expect(useDecor(s, 'furniture', 'shelf').blocked).toBe('notOwned');
    s = buyDecor(s, 'furniture', 'shelf').state;
    s = takeDownFurniture(s, 'shelf');
    expect(s.room.furniture?.wall).toBeUndefined();
    expect(ownsDecor(s, 'furniture', 'shelf')).toBe(true);
    s = useDecor(s, 'furniture', 'shelf').state;
    expect(s.room.furniture?.wall).toBe('shelf');
  });

});

describe('the daily special', () => {
  it('is the same all day, and changes over the days', () => {
    const a = dailySpecial(createNewGame(START));
    expect(dailySpecial(createNewGame(START + 8 * HOUR))).toEqual(a);
    const seen = new Set<string>();
    for (let d = 0; d < 30; d++) seen.add(JSON.stringify(dailySpecial(createNewGame(START + d * DAY))));
    expect(seen.size).toBeGreaterThan(3);
  });

  it(`costs ${CONFIG.dailySpecial.off * 100}% less, only on its day`, () => {
    const t = dayWithSpecial(true);
    const special = dailySpecial(createNewGame(t))!;
    expect(special.price).toBeLessThan(special.was);
    expect(special.price % 5).toBe(0);
    const today = buyDecor(rich(t), 'furniture', special.id).state;
    expect(today.gold).toBe(10_000 - special.price);
    let other = t + DAY;
    while (dailySpecial(createNewGame(other))?.id === special.id) other += DAY;
    expect(buyDecor(rich(other), 'furniture', special.id).state.gold).toBe(10_000 - special.was);
    expect(localDay(t)).not.toBe(localDay(other));
  });

  it('works for hats too', () => {
    let t = START;
    while (dailySpecial(createNewGame(t))?.kind !== 'hat') t += DAY;
    const special = dailySpecial(createNewGame(t))!;
    expect(getHat(special.id)?.fragments).toBeUndefined();
    expect(buyHat(rich(t), special.id).state.gold).toBe(10_000 - special.price);
  });
});

describe('the bigger rice jar', () => {
  const { size, refillHours, bigger } = CONFIG.riceJar;

  it(`costs ${bigger.fragments} star fragments, once`, () => {
    const s = createNewGame(START);
    expect(buyBigJar(s).blocked).toBe('notEnoughFragments');
    s.fragments.pieces = bigger.fragments + 3;
    const r = buyBigJar(s);
    expect(r.blocked).toBeUndefined();
    expect(r.state.fragments.pieces).toBe(3);
    expect(r.state.gold).toBe(s.gold);
    expect(buyBigJar({ ...r.state, fragments: { ...r.state.fragments, pieces: 999 } }).blocked).toBe('alreadyOwned');
  });

  it(`holds ${bigger.extra} more, and fills the new spot over time`, () => {
    const s = createNewGame(START);
    s.inventory.food.riceBall = size;
    s.fragments.pieces = bigger.fragments;
    expect(riceJarSize(s)).toBe(size);
    let b = buyBigJar(s).state;
    expect(riceJarSize(b)).toBe(size + bigger.extra);
    expect(b.inventory.food.riceBall).toBe(size);
    b = stepRiceJar(b, START + refillHours * HOUR);
    expect(b.inventory.food.riceBall).toBe(size + bigger.extra);
    b = stepRiceJar(b, START + 10 * refillHours * HOUR);
    expect(b.inventory.food.riceBall).toBe(size + bigger.extra);
  });
});
