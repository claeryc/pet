import { describe, expect, it } from 'vitest';
import { CONFIG } from '../src/game/config';
import { FURNITURE, inUse, ownsDecor, piecesFor, placeFurniture, spotOf, takeDownFurniture, useDecor } from '../src/game/decor';
import { hangKeepsakePieces } from '../src/game/meadow';
import { BIG_THINGS, THINGS } from '../src/render/keepsakes';
import { SPOT_BOX, pieceAt, spotAt } from '../src/render/furniture';
import { migrate } from '../src/storage/storage';
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

  it('fits in its own spots, moves between them, and one spot holds one piece', () => {
    let s = buyDecor(rich(dayWithSpecial(false)), 'furniture', 'lamp').state;
    s = buyDecor(s, 'furniture', 'cactus').state;
    expect(s.room.furniture).toEqual({ left: 'lamp', sill: 'cactus' });
    expect(placeFurniture(s, 'wall', 'lamp').blocked).toBe('doesntFit');
    expect(placeFurniture(s, 'right', 'garland').blocked).toBe('notOwned');
    s = placeFurniture(s, 'right', 'lamp').state;
    expect(s.room.furniture).toEqual({ right: 'lamp', sill: 'cactus' });
    expect(spotOf(s, 'lamp')).toBe('right');
    s = placeFurniture(s, 'right', null).state;
    expect(inUse(s, 'furniture', 'lamp')).toBe(false);
    expect(piecesFor(s, 'left')).toEqual(['lamp']);
    expect(piecesFor(s, 'sill')).toEqual(['cactus']);
    // Using a piece that's up already leaves it where it is.
    s = placeFurniture(s, 'right', 'lamp').state;
    expect(useDecor(s, 'furniture', 'lamp').state.room.furniture?.right).toBe('lamp');
  });

  it('every spot has room for each piece that fits it', () => {
    for (const f of FURNITURE) {
      const rows = FURNITURE_ART[f.id];
      for (const spot of f.spots!) {
        const box = SPOT_BOX[spot];
        const at = pieceAt(spot, rows[0].length, rows.length);
        expect(at.x, `${f.id} in ${spot}`).toBeGreaterThanOrEqual(box.x0 - 1);
        expect(at.x + rows[0].length - 1, `${f.id} in ${spot}`).toBeLessThanOrEqual(box.x1 + 1);
        expect(at.y, `${f.id} in ${spot}`).toBeGreaterThanOrEqual(box.y0 - 1);
        expect(at.y + rows.length - 1, `${f.id} in ${spot}`).toBeLessThanOrEqual(box.y1);
      }
    }
    expect(spotAt(5, 30)).toBe('left');
    expect(spotAt(32, 30)).toBeNull();
  });
});

describe('the keepsake frame and shelf', () => {
  const withKeepsakes = (tier: 'portrait' | 'keepsake') => {
    const s = rich();
    s.keepsakes = [{ id: 'k1', name: 'Bean', character: 'bubbit', variant: null, tier, at: START }];
    return s;
  };

  it('are yours once a pet leaves something for them, and never sold', () => {
    expect(piecesFor(rich(), 'wallMid')).toEqual([]);
    expect(piecesFor(withKeepsakes('portrait'), 'wallMid')).toEqual(['keepsakeFrame']);
    expect(piecesFor(withKeepsakes('portrait'), 'wall')).toEqual(['keepsakeFrame']);
    expect(piecesFor(withKeepsakes('keepsake'), 'wall')).toEqual(['keepsakeFrame', 'keepsakeShelf']);
    expect(FURNITURE.some((f) => f.id.startsWith('keepsake'))).toBe(false);
  });

  it('go up in a free spot when they first hold something', () => {
    const room = hangKeepsakePieces({ wallpaper: 'plain', curtains: null, frame: 'k1', shelf: ['k1', null, null] });
    expect(room.furniture).toEqual({ wallMid: 'keepsakeFrame', wall: 'keepsakeShelf' });
    // The wall is taken: the shelf waits for you to place it.
    const busy = hangKeepsakePieces({ wallpaper: 'plain', curtains: null, frame: 'k1', shelf: ['k1'], furniture: { wall: 'garland' } });
    expect(busy.furniture).toEqual({ wall: 'garland', wallMid: 'keepsakeFrame' });
    // Nothing to show: nothing changes.
    const empty = { wallpaper: 'plain', curtains: null };
    expect(hangKeepsakePieces(empty)).toBe(empty);
  });

  it('older saves get them put up where the keepsakes were', () => {
    const state = { ...rich(), room: { wallpaper: 'plain', curtains: null, frame: 'k1', shelf: ['k1', null, null], furniture: { left: 'plant' } } };
    const save = migrate({ version: 36, state } as never);
    expect(save.state.room.furniture).toEqual({ left: 'plant', wallMid: 'keepsakeFrame', wall: 'keepsakeShelf' });
  });

  it('have a big 16-pixel picture for every little one', () => {
    for (const kind of Object.keys(THINGS)) {
      const rows = BIG_THINGS[kind];
      expect(rows, kind).toBeDefined();
      expect(rows.length, kind).toBe(16);
      for (const r of rows) expect(r.length, kind).toBe(16);
    }
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
