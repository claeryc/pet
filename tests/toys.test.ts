import { describe, expect, it } from 'vitest';
import { buyToy, favouriteToy, ownsToy, playToy, toysOf, TOYS } from '../src/game/toys';
import { likesOf } from '../src/game/likes';
import { createNewGame } from '../src/game/state';
import { migrate } from '../src/storage/storage';
import { newTeen } from './helpers';

const START = new Date(2026, 0, 1, 10, 0).getTime();

describe('toys', () => {
  it('everyone starts with the ball, and old saves get it too', () => {
    expect(toysOf(createNewGame(START))).toEqual(['ball']);
    const old = createNewGame(START);
    delete old.inventory.toys;
    const migrated = migrate({ version: 49, state: old });
    expect(migrated?.state.inventory.toys).toEqual(['ball']);
  });

  it('a toy you do not own is refused', () => {
    const s = newTeen(START);
    expect(playToy(s, START, 'wand').blocked).toBe('noToy');
    expect(playToy(s, START, 'ball').blocked).toBeUndefined();
  });

  it('buying a toy costs gold, or fragments for the star kite, once', () => {
    let s = { ...newTeen(START), gold: 500 };
    s = buyToy(s, 'wand').state;
    expect(ownsToy(s, 'wand')).toBe(true);
    expect(s.gold).toBe(500 - 140);
    expect(buyToy(s, 'wand').blocked).toBe('alreadyOwned');
    expect(buyToy({ ...s, fragments: { ...s.fragments, pieces: 10 } }, 'starKite').blocked).toBe('notEnoughFragments');
    const kite = buyToy({ ...s, fragments: { ...s.fragments, pieces: 130 } }, 'starKite').state;
    expect(kite.fragments.pieces).toBe(10);
    expect(ownsToy(kite, 'starKite')).toBe(true);
  });

  it('a game counts once on the needs', () => {
    const s = newTeen(START);
    s.pet.stats.happiness = 50;
    const after = playToy(s, START, 'ball').state;
    expect(after.pet.stats.happiness).toBe(50 + TOYS[0].happiness);
  });

  it("the favourite toy is loved, and written in the Family Tree once", () => {
    let s = { ...newTeen(START), gold: 1000 };
    for (const t of TOYS) if (t.price > 0) s = buyToy(s, t.id).state;
    s = { ...s, fragments: { ...s.fragments, pieces: 500 }, inventory: { ...s.inventory, toys: TOYS.map((t) => t.id) } };
    const fav = favouriteToy(s.pet);
    const loved = playToy(s, START, fav);
    expect(loved.felt).toBe('loved');
    expect(likesOf(loved.state.pet).found.filter((k) => k === 'toy')).toEqual(['toy']);
    const again = playToy(loved.state, START + 60_000, fav);
    expect(likesOf(again.state.pet).found.filter((k) => k === 'toy')).toEqual(['toy']);
    const other = TOYS.find((t) => t.id !== fav)!.id;
    expect(playToy(s, START, other).felt).toBeUndefined();
  });
});
