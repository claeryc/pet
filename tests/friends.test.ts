import { describe, expect, it } from 'vitest';
import { createNewGame, type Friend, type GameState } from '../src/game/state';
import { CONFIG } from '../src/game/config';
import { chooseCharacter, getCharacter } from '../src/game/growth';
import {
  befriend,
  giveGift,
  hearts,
  makeWanderer,
  meet,
  mingle,
  mingleBlock,
  retire,
  stepFriends,
  stepVisits,
  switchPet,
} from '../src/game/friends';
import { familyGenerations, pedigree } from '../src/game/family';
import { simulate } from '../src/game/simulate';
import { localDay } from '../src/game/economy';
import { migrate, SAVE_VERSION } from '../src/storage/storage';

// Noon, local time, so a few hours either way stays on the same day.
const NOON = new Date(2026, 9, 18, 12, 0, 0).getTime();
const HOUR = 3_600_000;
const DAY = 24 * HOUR;
const F = CONFIG.friends;

// A game with a grown-up, named, happy pet.
function withAdult(now = NOON): GameState {
  const s = createNewGame(now - 5 * DAY);
  s.lastUpdated = now;
  s.pet = { ...s.pet, stage: 'adult', character: 'pebblit', name: 'Mochi', named: true, stageStartedAt: now - DAY };
  s.pet.stats = { hunger: 90, happiness: 90, health: 100, energy: 90 };
  return s;
}

// The same game with a wanderer friend at `score`.
function withFriend(score: number, now = NOON): { state: GameState; friend: Friend } {
  const s = withAdult(now);
  const friend = { ...makeWanderer(now - DAY, []), score, character: 'sprig', variant: null };
  return { state: { ...s, friends: [friend] }, friend };
}

describe('wanderers', () => {
  it('the first one comes soon after a pet grows up, then one every 2 days', () => {
    let s = withAdult();
    s = stepVisits(s, NOON);
    expect(s.visit.guest).toBeNull();
    expect(s.visit.nextAt).toBe(NOON + F.firstVisitHours * HOUR);
    s = stepVisits(s, s.visit.nextAt);
    expect(s.visit.guest).not.toBeNull();
    expect(s.visit.until).toBe(NOON + F.firstVisitHours * HOUR + F.stayHours * HOUR);
    expect(s.visit.nextAt).toBe(NOON + F.firstVisitHours * HOUR + F.visitEveryHours * HOUR);
    expect(s.messages[0].kind).toBe('visitor');
    // It moves on after a day.
    s = stepVisits(s, s.visit.until);
    expect(s.visit.guest).toBeNull();
  });

  it("doesn't come before any pet has grown up", () => {
    const s = createNewGame(NOON);
    expect(stepVisits(s, NOON + 10 * DAY).visit.nextAt).toBe(0);
  });

  it('skips visits that came and went while the game was closed', () => {
    let s = stepVisits(withAdult(), NOON);
    const first = s.visit.nextAt;
    // 5 days later: visits at +0, +2d, +4d. The one at +4d is still here.
    s = stepVisits(s, first + 4 * DAY + HOUR);
    expect(s.visit.guest?.id).toBe(`wild-${first + 4 * DAY}`);
    expect(s.messages.filter((m) => m.kind === 'visitor')).toHaveLength(1);
  });

  it('are the same however the game catches up', () => {
    expect(makeWanderer(NOON, [])).toEqual(makeWanderer(NOON, []));
    expect(makeWanderer(NOON, ['Mochi']).name).not.toBe('Mochi');
  });

  it('can be added as friends, up to the limit', () => {
    let s = stepVisits(stepVisits(withAdult(), NOON), NOON + F.firstVisitHours * HOUR);
    const guest = s.visit.guest!;
    const added = befriend(s);
    expect(added.state.friends.map((f) => f.id)).toEqual([guest.id]);
    expect(added.state.visit.guest).toBeNull();
    s = { ...s, friends: Array.from({ length: F.maxWild }, (_, i) => makeWanderer(i, [])) };
    expect(befriend(s).blocked).toBe('full');
  });
});

describe('friend score', () => {
  it('meeting raises it, but only the first few meetings a day count', () => {
    let { state: s, friend } = withFriend(0);
    for (let i = 0; i < F.meet.perDay + 2; i++) s = meet(s, friend.id, NOON + i * 60_000).state;
    expect(s.friends[0].score).toBe(F.meet.score * F.meet.perDay);
    expect(s.friends[0].metToday).toBe(F.meet.perDay + 2);
    // A new day: meetings count again.
    s = meet(s, friend.id, NOON + DAY).state;
    expect(s.friends[0].score).toBe(F.meet.score * (F.meet.perDay + 1));
  });

  it('meeting cheers your pet up and tires it a little', () => {
    const { state, friend } = withFriend(0);
    state.pet.stats.happiness = 50;
    const after = meet(state, friend.id, NOON).state.pet.stats;
    expect(after.happiness).toBe(50 + F.meet.happiness);
    expect(after.energy).toBe(90 + F.meet.energy);
  });

  it("a pet can't meet anyone while asleep or still an egg", () => {
    const { state, friend } = withFriend(0);
    expect(meet({ ...state, pet: { ...state.pet, asleep: true } }, friend.id, NOON).blocked).toBe('asleep');
    expect(meet({ ...state, pet: { ...state.pet, stage: 'egg' } }, friend.id, NOON).blocked).toBe('egg');
  });

  it('gifts count by their price, up to a daily cap', () => {
    let { state: s, friend } = withFriend(0);
    s.inventory.food = { lobster: 3, strawberry: 1 };
    s = giveGift(s, friend.id, 'lobster', NOON).state; // 40 gold: +4
    expect(s.friends[0].score).toBe(4);
    s = giveGift(s, friend.id, 'lobster', NOON).state; // only 10 more counts today
    expect(s.friends[0].score).toBe(F.gift.goldPerDay / F.gift.goldPerPoint);
    expect(s.inventory.food.lobster).toBe(1);
    expect(giveGift(s, friend.id, 'riceBall', NOON).blocked).toBe('freeFood');
    expect(giveGift(s, friend.id, 'cookie', NOON).blocked).toBe('noFood');
  });

  it('fades a point a day without meeting, but never loses a heart', () => {
    const { state, friend } = withFriend(46);
    let s = { ...state, friends: [{ ...friend, settledDay: localDay(NOON) }] };
    s = stepFriends(s, NOON + 3 * DAY); // 2 whole days missed
    expect(s.friends[0].score).toBe(44);
    s = stepFriends(s, NOON + 3 * DAY); // nothing more the same day
    expect(s.friends[0].score).toBe(44);
    s = stepFriends(s, NOON + 20 * DAY);
    expect(s.friends[0].score).toBe(40); // stops at 2 hearts
  });

  it('shows as hearts, in halves', () => {
    expect(hearts(0)).toBe(0);
    expect(hearts(70)).toBe(3.5);
    expect(hearts(79)).toBe(3.5);
    expect(hearts(100)).toBe(5);
  });
});

describe('mingling', () => {
  it('needs hearts 70% full', () => {
    expect(mingleBlock(withFriend(69).state, withFriend(69).friend.id, NOON)).toBe('hearts');
    const { state, friend } = withFriend(70);
    expect(mingleBlock(state, friend.id, NOON)).toBeNull();
  });

  it('needs a grown-up that feels well, and a friend (not a guest)', () => {
    const { state, friend } = withFriend(80);
    expect(mingleBlock({ ...state, pet: { ...state.pet, stage: 'teen' } }, friend.id, NOON)).toBe('notAdult');
    expect(mingleBlock({ ...state, pet: { ...state.pet, condition: 'sick' } }, friend.id, NOON)).toBe('unwell');
    const guest = { ...state, friends: [], visit: { guest: friend, until: NOON + HOUR, nextAt: 0 } };
    expect(mingleBlock(guest, friend.id, NOON)).toBe('notFriend');
  });

  it('a little one is an egg with both parents, one generation on', () => {
    const { state, friend } = withFriend(100);
    const parent = state.pet;
    const result = mingle(state, friend.id, NOON, 0);
    const s = result.state;
    expect(result.egg).toBeDefined();
    expect(s.pet.stage).toBe('egg');
    expect(s.pet.parents).toEqual([parent.id, friend.id]);
    expect(s.pet.generation).toBe(2);
    expect(s.pet.themes.sort()).toEqual(['cave', 'nature']);
    // The parent stays at home, and the friend joins the Family Tree.
    expect(s.housemates.map((p) => p.id)).toEqual([parent.id]);
    expect(s.housemates[0].partner).toBe(friend.id);
    expect(s.family.find((m) => m.id === friend.id)?.fromWild).toBe(true);
    expect(result.crowded).toBe(false);
    expect(s.messages[0].kind).toBe('littleOne');
    const tree = pedigree(s, null);
    expect(tree.parents.map((p) => p?.name)).toEqual([parent.name, friend.name]);
  });

  it('the chance goes up with hearts, and a miss still counts as a meeting', () => {
    const { state, friend } = withFriend(70);
    const missed = mingle(state, friend.id, NOON, 0.5); // 50% at 70
    expect(missed.egg).toBeUndefined();
    expect(missed.state.friends[0].score).toBe(70 + F.meet.score);
    expect(mingle(state, friend.id, NOON, 0.49).egg).toBeDefined();
  });

  it('the pair waits a few days before mingling again', () => {
    const { state, friend } = withFriend(100);
    const s = mingle(state, friend.id, NOON, 0.99).state;
    expect(mingleBlock(s, friend.id, NOON + DAY)).toBe('wait');
    expect(mingleBlock(s, friend.id, NOON + F.mingle.waitDays * DAY)).toBeNull();
  });

  it('a pet only ever has one partner', () => {
    const { state, friend } = withFriend(100);
    let s = mingle(state, friend.id, NOON, 0).state;
    s = switchPet(s, s.housemates[0].id); // back to the parent
    const other = { ...makeWanderer(NOON - 2 * DAY, []), score: 100 };
    s = { ...s, friends: [...s.friends, other] };
    expect(mingleBlock(s, other.id, NOON + 5 * DAY)).toBe('taken');
    expect(mingleBlock(s, friend.id, NOON + 5 * DAY)).toBeNull();
  });

  it("never with a parent, little one, brother or sister", () => {
    const { state, friend } = withFriend(100);
    // A grown-up little one of this friend can't mingle with it.
    const child = { ...state, pet: { ...state.pet, parents: ['someone', friend.id] } };
    expect(mingleBlock(child, friend.id, NOON)).toBe('family');
    const sibling = { ...state, friends: [{ ...friend, parents: ['a', 'b'] }], pet: { ...state.pet, parents: ['b', 'c'] } };
    expect(mingleBlock(sibling, friend.id, NOON)).toBe('family');
  });

  it('a full room means one pet retires', () => {
    const { state, friend } = withFriend(100);
    let s = mingle(state, friend.id, NOON, 0).state; // parent + egg
    s = switchPet(s, s.housemates[0].id);
    const result = mingle(s, friend.id, NOON + 4 * DAY, 0);
    expect(result.crowded).toBe(true);
    s = retire(result.state, s.housemates[0].id); // the first egg moves out
    expect(s.housemates).toHaveLength(1);
    expect(s.family.some((m) => m.generation === 2)).toBe(true);
  });
});

describe('pets in the room', () => {
  it('switching swaps which pet you look after', () => {
    const { state, friend } = withFriend(100);
    const s = mingle(state, friend.id, NOON, 0).state;
    const swapped = switchPet(s, s.housemates[0].id);
    expect(swapped.pet.id).toBe(s.housemates[0].id);
    expect(swapped.housemates[0].id).toBe(s.pet.id);
  });

  it('every pet in the room lives on, not just the one you look after', () => {
    const { state, friend } = withFriend(100);
    const s = mingle(state, friend.id, NOON, 0).state;
    const later = simulate(s, NOON + 2 * HOUR);
    expect(later.pet.stage).toBe('baby'); // the egg hatched
    expect(later.housemates[0].stats.hunger).toBeLessThan(s.housemates[0].stats.hunger);
  });

  it('retiring moves a pet into the Family Tree; the last pet never retires', () => {
    const { state, friend } = withFriend(100);
    const s = mingle(state, friend.id, NOON, 0).state;
    const parent = s.housemates[0];
    const after = retire(s, parent.id);
    expect(after.housemates).toHaveLength(0);
    expect(after.family.find((m) => m.id === parent.id)?.name).toBe('Mochi');
    expect(retire(after, after.pet.id)).toBe(after);
    // Both pets at home are in the tree as "home".
    const home = familyGenerations(s).flatMap((g) => g.members).filter((m) => m.home);
    expect(home).toHaveLength(2);
  });
});

describe('growing up as a little one', () => {
  it("leans towards the parents' themes", () => {
    let fromParents = 0;
    const runs = 400;
    for (let i = 0; i < runs; i++) {
      const { character } = chooseCharacter(90, `pet-${i}`, ['cave']);
      if (character.theme === 'cave') fromParents++;
    }
    // About 60% from the parent's theme plus a quarter of the rest.
    expect(fromParents / runs).toBeGreaterThan(0.55);
    expect(fromParents / runs).toBeLessThan(0.85);
  });

  it('a first pet rolls exactly as before', () => {
    expect(chooseCharacter(60, 'abc')).toEqual(chooseCharacter(60, 'abc', []));
    expect(getCharacter(chooseCharacter(60, 'abc').character.id)).toBeDefined();
  });
});

describe('saves', () => {
  it('upgrades a version 12 save', () => {
    const s: any = createNewGame(NOON);
    delete s.housemates;
    delete s.friends;
    delete s.visit;
    delete s.pet.themes;
    delete s.pet.partner;
    s.family = [{ id: 'x', name: 'Old', owner: '', fromFriend: false, bornAt: 0, character: null, variant: null, generation: 1, parents: [] }];
    const file = migrate({ version: 12, state: s });
    expect(file.version).toBe(SAVE_VERSION);
    expect(file.state.housemates).toEqual([]);
    expect(file.state.friends).toEqual([]);
    expect(file.state.visit).toEqual({ guest: null, until: 0, nextAt: 0 });
    expect(file.state.pet.themes).toEqual([]);
    expect(file.state.family[0].fromWild).toBe(false);
  });
});
