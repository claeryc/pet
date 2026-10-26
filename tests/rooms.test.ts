import { describe, expect, it } from 'vitest';
import { createNewGame, type GameState, type Pet } from '../src/game/state';
import { CONFIG } from '../src/game/config';
import { makeWanderer, mingle, petStandsLeft, retire } from '../src/game/friends';
import { simulate } from '../src/game/simulate';
import { buyDecor } from '../src/game/economy';
import { useDecor } from '../src/game/decor';
import {
  buyFamilyHome,
  capacity,
  goToRoom,
  grantFamilyHome,
  movePet,
  needsYou,
  otherRoom,
  petsIn,
  roomDecor,
  roomOf,
  roommates,
} from '../src/game/rooms';
import { migrate, SAVE_VERSION } from '../src/storage/storage';

const NOON = new Date(2026, 9, 18, 12, 0, 0).getTime();
const HOUR = 3_600_000;
const DAY = 24 * HOUR;

function adult(s: GameState, id: string, name: string, room?: 'main' | 'family'): Pet {
  return { ...s.pet, id, name, named: true, stage: 'adult', character: 'pebblit', room, stats: { hunger: 90, happiness: 90, health: 100, energy: 90 } };
}

// A game with the Family Home and three grown-ups: two in the main room,
// one in the Family Home.
function withHome(): GameState {
  const s = grantFamilyHome(createNewGame(NOON - 5 * DAY));
  s.lastUpdated = NOON;
  return { ...s, pet: adult(s, 'a', 'Mochi'), housemates: [adult(s, 'b', 'Bean'), adult(s, 'c', 'Pip', 'family')] };
}

describe('the Family Home', () => {
  it('adds a room with two more spots', () => {
    const s = createNewGame(NOON);
    expect(capacity(s)).toBe(CONFIG.friends.maxPets);
    expect(otherRoom(s)).toBeNull();
    expect(capacity(grantFamilyHome(s))).toBe(2 * CONFIG.friends.maxPets);
  });

  it('costs star fragments, and only once', () => {
    const s = createNewGame(NOON);
    expect(buyFamilyHome(s).blocked).toBe('notEnoughFragments');
    const rich = { ...s, fragments: { ...s.fragments, pieces: CONFIG.familyHome.fragments + 2 } };
    const bought = buyFamilyHome(rich).state;
    expect(bought.familyHome.owned).toBe(true);
    expect(bought.fragments.pieces).toBe(2);
    expect(buyFamilyHome(bought).blocked).toBe('owned');
  });

  it('shows only the pets in the room you are looking at', () => {
    const s = withHome();
    expect(roommates(s).map((p) => p.id)).toEqual(['b']);
    expect(petsIn(s, 'family').map((p) => p.id)).toEqual(['c']);
    const there = goToRoom(s, 'family').state;
    expect(there.pet.id).toBe('c');
    expect(roommates(there)).toEqual([]);
    expect(petStandsLeft(there)).toBe(true); // alone in its room
    expect(goToRoom(grantFamilyHome(createNewGame(NOON)), 'family').blocked).toBe('empty');
  });

  it('moves a pet that is well, and swaps when the room is full', () => {
    let s = withHome();
    s = movePet(s, 'b').state;
    expect(petsIn(s, 'family').map((p) => p.id).sort()).toEqual(['b', 'c']);
    // Full now: Mochi can only swap with one of them.
    expect(movePet(s, 'a').blocked).toBe('full');
    s = movePet(s, 'a', 'c').state;
    expect(roomOf(s.pet)).toBe('family');
    expect(roomOf(s.housemates.find((p) => p.id === 'c')!)).toBe('main');
  });

  it("won't take a pet that isn't well, so a countdown can't be slowed there", () => {
    const s = withHome();
    const warned = { ...s, pet: { ...s.pet, condition: 'warning' as const } };
    expect(movePet(warned, 'a').blocked).toBe('unwell');
    expect(needsYou(warned.pet)).toBe(true);
    // A pet that isn't well can still move out to the main room.
    const sickThere = { ...s, housemates: [{ ...s.housemates[1], condition: 'sick' as const }] };
    expect(movePet(sickThere, 'c').state.housemates.find((p) => p.id === 'c')?.room).toBe('main');
  });

  it('halves tummy, joy and energy loss, but not sickness', () => {
    const s = withHome();
    const later = simulate(s, NOON + 4 * HOUR);
    const main = later.pet.stats;
    const family = later.housemates.find((p) => p.id === 'c')!.stats;
    expect(90 - family.hunger).toBeCloseTo((90 - main.hunger) / 2, 5);
    expect(90 - family.happiness).toBeCloseTo((90 - main.happiness) / 2, 5);
    expect(90 - family.energy).toBeCloseTo((90 - main.energy) / 2, 5);
    // A sick pet counts down just as fast in the Family Home.
    const sick = (room?: 'family') => ({ ...s, pet: { ...s.pet, room, condition: 'sick' as const, sickMinutes: 0 }, housemates: [] });
    const t = NOON + 30 * HOUR;
    expect(simulate(sick('family'), t).pet.condition).toBe(simulate(sick(), t).pet.condition);
    expect(simulate(sick('family'), t).pet.condition).toBe('passed');
  });

  it('decorates each room on its own', () => {
    let s = { ...withHome(), gold: 1000 };
    s = buyDecor(s, 'wallpaper', 'stripes').state;
    expect(s.room.wallpaper).toBe('stripes');
    s = goToRoom(s, 'family').state;
    expect(roomDecor(s).wallpaper).toBe('plain');
    s = useDecor(s, 'wallpaper', 'stripes').state;
    expect(s.familyHome.room.wallpaper).toBe('stripes');
  });

  it('furnishes each room on its own', () => {
    let s = { ...withHome(), gold: 1000 };
    s = buyDecor(s, 'furniture', 'toyBox').state;
    expect(s.room.furniture).toEqual({ right: 'toyBox' });
    s = goToRoom(s, 'family').state;
    expect(roomDecor(s).furniture).toBeUndefined();
    s = useDecor(s, 'furniture', 'toyBox').state;
    expect(s.familyHome.room.furniture).toEqual({ right: 'toyBox' });
    expect(s.room.furniture).toEqual({ right: 'toyBox' });
  });

  it('a little one moves into the Family Home when the main room is full', () => {
    let s = withHome();
    s = { ...s, housemates: s.housemates.filter((p) => p.id !== 'c') };
    const friend = { ...makeWanderer(NOON - DAY, []), score: 100, character: 'sprig', variant: null };
    s = { ...s, friends: [friend], visit: { ...s.visit, friendId: friend.id, until: NOON + 30 * DAY } };
    const result = mingle(s, friend.id, NOON, 0);
    expect(result.nested).toBe(false);
    expect(result.state.housemates.find((p) => p.id === result.egg!.id)?.room).toBe('family');
  });
});

describe('the Meadow', () => {
  it('remembers a pet that moved to the Meadow, and the nest egg takes its spot', () => {
    let s = withHome();
    const egg = { ...adult(s, 'egg', ''), stage: 'egg' as const };
    s = { ...s, nest: egg };
    s = retire(s, 'c', NOON);
    expect(s.family.find((m) => m.id === 'c')?.meadow).toBe(true);
    expect(s.housemates.find((p) => p.id === 'egg')?.room).toBe('family');
    // Saying goodbye to a pet that passed away isn't the Meadow.
    const passed = retire({ ...s, pet: { ...s.pet, condition: 'passed' } }, 'a', NOON);
    expect(passed.family.find((m) => m.id === 'a')?.meadow).toBeUndefined();
  });
});

describe('save migration to the Family Home', () => {
  it('starts without one', () => {
    const out = migrate({ version: 31, state: { pet: { stage: 'teen' } } });
    expect(out.version).toBe(SAVE_VERSION);
    expect(out.state.familyHome).toEqual({ owned: false, room: { wallpaper: 'plain', curtains: null } });
  });
});
