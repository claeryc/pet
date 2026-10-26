import { describe, expect, it } from 'vitest';
import { createNewGame, type GameState, type Pet } from '../src/game/state';
import { CONFIG } from '../src/game/config';
import { retire, stepVisits } from '../src/game/friends';
import { stepFragments } from '../src/game/fragments';
import { simulate } from '../src/game/simulate';
import { grantFamilyHome, goToRoom } from '../src/game/rooms';
import {
  getMeadowPet,
  giftTier,
  greetVisitor,
  hangPortrait,
  keepsakeOf,
  meadowOut,
  meadowVisitor,
  memoriesOf,
  nextMeadowVisitor,
  roomKeepsakes,
  sayHi,
  toggleShelf,
  welcomeHome,
} from '../src/game/meadow';
import { likesOf } from '../src/game/likes';
import { migrate, SAVE_VERSION } from '../src/storage/storage';

const NOON = new Date(2026, 9, 18, 12, 0, 0).getTime();
const HOUR = 3_600_000;
const DAY = 24 * HOUR;
const M = CONFIG.meadow;

function adult(s: GameState, id: string, name: string, extra: Partial<Pet> = {}): Pet {
  return {
    ...s.pet, id, name, named: true, stage: 'adult', character: 'pebblit', bornAt: NOON - 20 * DAY,
    stats: { hunger: 90, happiness: 90, health: 100, energy: 90 }, ...extra,
  };
}

// Two grown-ups at home, with visits already going (a friend-less game:
// only wanderers and Meadow pets come).
function twoPets(extra: Partial<Pet> = {}): GameState {
  const s = createNewGame(NOON - 20 * DAY);
  s.lastUpdated = NOON;
  return {
    ...s,
    pet: adult(s, 'a', 'Mochi'),
    housemates: [adult(s, 'b', 'Bean', extra)],
    visit: { ...s.visit, nextAt: NOON + 30 * DAY, wildAt: NOON + 60 * DAY },
  };
}

describe('moving to the Meadow', () => {
  it('keeps the whole pet, and still shows it in the Family Tree', () => {
    const s = retire(twoPets(), 'b', NOON);
    expect(s.housemates).toHaveLength(0);
    expect(getMeadowPet(s, 'b')?.pet.name).toBe('Bean');
    expect(getMeadowPet(s, 'b')?.movedAt).toBe(NOON);
    expect(s.family.find((m) => m.id === 'b')?.meadow).toBe(true);
    expect(s.visit.meadowAt).toBe(NOON + M.firstVisitHours * HOUR);
  });

  it("isn't for a pet with a warning, a sick pet, or one out on a journey", () => {
    for (const condition of ['warning', 'sick'] as const) {
      const s = twoPets({ condition });
      expect(retire(s, 'b', NOON)).toBe(s);
    }
    const trip = { place: 'beach', backAt: null } as unknown as Pet['trip'];
    const away = twoPets({ trip });
    expect(retire(away, 'b', NOON)).toBe(away);
  });

  it('still lets a pet that passed away say goodbye (not to the Meadow)', () => {
    const s = retire(twoPets({ condition: 'passed' }), 'b', NOON);
    expect(s.housemates).toHaveLength(0);
    expect(s.meadow).toHaveLength(0);
    expect(s.keepsakes).toHaveLength(0);
  });

  it('leaves a keepsake by its good care days, once ever', () => {
    expect(giftTier(0)).toBe('portrait');
    expect(giftTier(M.gift.keepsakeDays - 1)).toBe('portrait');
    expect(giftTier(M.gift.keepsakeDays)).toBe('keepsake');
    expect(giftTier(M.gift.goldenDays)).toBe('golden');
    let s = retire(twoPets({ goodDays: 12 }), 'b', NOON);
    expect(keepsakeOf(s, 'b')?.tier).toBe('keepsake');
    // It comes back while visiting, gets more good days, and leaves again:
    // no second keepsake.
    s = { ...s, visit: { ...s.visit, meadowId: 'b', until: NOON + 3 * HOUR } };
    s = welcomeHome(s, NOON + HOUR).state;
    s = { ...s, housemates: s.housemates.map((p) => ({ ...p, goodDays: 40 })) };
    s = retire(s, 'b', NOON + 2 * HOUR);
    expect(s.keepsakes).toHaveLength(1);
    expect(keepsakeOf(s, 'b')?.tier).toBe('keepsake');
  });
});

describe('good care days', () => {
  it('count for each pet at home on a good day', () => {
    let s = twoPets();
    s = { ...s, fragments: { ...s.fragments, day: '2026-10-17', dayGood: true, home: true } };
    s = stepFragments(s).state;
    expect(s.pet.goodDays).toBe(1);
    expect(s.housemates[0].goodDays).toBe(1);
    // A day spoiled by a warning doesn't count.
    s = { ...s, fragments: { ...s.fragments, day: '2026-10-17', dayGood: false } };
    s = stepFragments(s).state;
    expect(s.pet.goodDays).toBe(1);
  });
});

describe('Meadow pets visiting', () => {
  it('one drops by once one is due, and again about a week later', () => {
    let s = retire(twoPets(), 'b', NOON);
    s = { ...s, visit: { ...s.visit, nextAt: s.visit.meadowAt } };
    s = stepVisits(s, s.visit.meadowAt + HOUR);
    expect(meadowVisitor(s)?.pet.id).toBe('b');
    expect(s.messages[0]).toMatchObject({ kind: 'meadowVisit', name: 'Bean' });
    expect(s.visit.meadowAt).toBe(NOON + (M.firstVisitHours + M.visitEveryHours) * HOUR);
  });

  it('leaves a note when you missed it', () => {
    let s = retire(twoPets(), 'b', NOON);
    s = { ...s, visit: { ...s.visit, nextAt: s.visit.meadowAt } };
    s = stepVisits(s, s.visit.meadowAt + 10 * HOUR);
    expect(meadowVisitor(s)).toBeNull();
    expect(s.messages.some((m) => m.kind === 'meadowVisit' && m.missed)).toBe(true);
  });

  it('the one you said hi to comes next, or else the one not seen for longest', () => {
    let s = twoPets();
    s = retire(s, 'b', NOON);
    s = { ...s, housemates: [adult(s, 'c', 'Pip')] };
    s = retire(s, 'c', NOON + HOUR);
    expect(nextMeadowVisitor(s.meadow, NOON + DAY)?.pet.id).toBe('b');
    s = sayHi(s, 'c', NOON + 2 * HOUR).state;
    expect(nextMeadowVisitor(s.meadow, NOON + DAY)?.pet.id).toBe('c');
    // Only once a day.
    expect(sayHi(s, 'c', NOON + 3 * HOUR).blocked).toBe('already');
    // The hi wears off after a few days.
    expect(nextMeadowVisitor(s.meadow, NOON + (M.hiDays + 1) * DAY)?.pet.id).toBe('b');
  });

  it('brings its favourite food when you say hello, once', () => {
    let s = retire(twoPets(), 'b', NOON);
    s = { ...s, visit: { ...s.visit, meadowId: 'b', until: NOON + 3 * HOUR } };
    const food = likesOf(getMeadowPet(s, 'b')!.pet).food;
    const before = s.inventory.food[food] ?? 0;
    const greeted = greetVisitor(s);
    expect(greeted.food).toBe(food);
    expect(greeted.state.inventory.food[food]).toBe(before + 1);
    expect(greetVisitor(greeted.state).food).toBeUndefined();
  });
});

describe('moving back home', () => {
  it('only while it is visiting, and only into a free spot', () => {
    let s = retire(twoPets({ condition: 'healthy', stats: { hunger: 5, happiness: 5, health: 50, energy: 5 } }), 'b', NOON);
    expect(welcomeHome(s, NOON + HOUR).blocked).toBe('gone');
    s = { ...s, visit: { ...s.visit, meadowId: 'b', until: NOON + 3 * HOUR } };
    const full = { ...s, housemates: [adult(s, 'c', 'Pip')] };
    expect(welcomeHome(full, NOON + HOUR).blocked).toBe('full');
    const back = welcomeHome(s, NOON + HOUR).state;
    const bean = back.housemates.find((p) => p.id === 'b')!;
    expect(bean.stats).toEqual(M.backStats);
    expect(back.meadow).toHaveLength(0);
    expect(back.family.some((m) => m.id === 'b')).toBe(false);
    expect(meadowVisitor(back)).toBeNull();
    // The visit is over, and the next one gets planned.
    const later = simulate(back, NOON + 2 * HOUR);
    expect(later.visit.until).toBe(0);
  });

  it('moves into the Family Home when only that has room', () => {
    let s = grantFamilyHome(retire(twoPets(), 'b', NOON));
    s = { ...s, housemates: [adult(s, 'c', 'Pip')], visit: { ...s.visit, meadowId: 'b', until: NOON + 3 * HOUR } };
    const back = welcomeHome(s, NOON + HOUR).state;
    expect(back.housemates.find((p) => p.id === 'b')?.room).toBe('family');
  });
});

describe('the Meadow scene', () => {
  it('shows everyone while there are few, else four, with the ones you said hi to', () => {
    let s = twoPets();
    for (const id of ['b', 'c', 'd', 'e', 'f', 'g']) {
      s = { ...s, housemates: [adult(s, id, id.toUpperCase())] };
      s = retire(s, id, NOON);
    }
    expect(s.meadow).toHaveLength(6);
    expect(meadowOut(s, NOON)).toHaveLength(M.out);
    s = sayHi(s, 'g', NOON + HOUR).state;
    s = sayHi(s, 'b', NOON + HOUR).state;
    const out = meadowOut(s, NOON + 2 * HOUR).map((m) => m.pet.id);
    expect(out).toContain('g');
    expect(out).toContain('b');
    // The same all day.
    expect(meadowOut(s, NOON + 3 * HOUR).map((m) => m.pet.id)).toEqual(out);
  });
});

describe('the goodbye card', () => {
  it('remembers your days together and its little ones', () => {
    let s = twoPets({ goodDays: 9 });
    s = { ...s, family: [{ id: 'kid', name: 'Kid', owner: '', fromFriend: false, fromWild: false, bornAt: NOON, character: null, variant: null, generation: 2, parents: ['b', 'x'] }] };
    s = retire(s, 'b', NOON);
    const mem = memoriesOf(s, getMeadowPet(s, 'b')!);
    expect(mem).toMatchObject({ days: 20, goodDays: 9, character: 'pebblit', littleOnes: 1 });
  });
});

describe('keepsakes in the room', () => {
  it('hang in the frame and stand on the shelf of the room you look at', () => {
    let s = twoPets({ goodDays: 40 });
    s = retire(s, 'b', NOON);
    // They go up by themselves where there's space.
    expect(roomKeepsakes(s.room)).toEqual({ frame: 'b', shelf: ['b', null, null] });
    s = toggleShelf(s, 'b').state;
    expect(roomKeepsakes(s.room).shelf).toEqual([null, null, null]);
    s = toggleShelf(s, 'b').state;
    expect(roomKeepsakes(s.room).shelf).toEqual(['b', null, null]);
    s = toggleShelf(s, 'b').state;
    expect(roomKeepsakes(s.room).shelf).toEqual([null, null, null]);
    s = hangPortrait(s, null);
    expect(roomKeepsakes(s.room).frame).toBeNull();
  });

  it('a portrait alone can stand on no shelf, and a full shelf says so', () => {
    let s = twoPets({ goodDays: 0 });
    s = retire(s, 'b', NOON);
    expect(toggleShelf(s, 'b').state).toBe(s);
    s = { ...s, keepsakes: ['x', 'y', 'z', 'w'].map((id) => ({ id, name: id, character: 'pebblit', variant: null, tier: 'keepsake' as const, at: NOON })) };
    for (const id of ['x', 'y', 'z']) s = toggleShelf(s, id).state;
    expect(toggleShelf(s, 'w').blocked).toBe('full');
  });

  it('a portrait hangs in one room at a time', () => {
    let s = grantFamilyHome(twoPets({ goodDays: 0 }));
    s = { ...s, housemates: [...s.housemates, adult(s, 'c', 'Pip', { room: 'family' })] };
    s = retire(s, 'b', NOON);
    expect(s.room.frame).toBe('b');
    s = goToRoom(s, 'family').state;
    s = hangPortrait(s, 'b');
    expect(s.room.frame).toBeNull();
    expect(s.familyHome.room.frame).toBe('b');
  });
});

describe('save migration to the Meadow', () => {
  it('brings pets that moved there before into the Meadow, each with its portrait', () => {
    const old = {
      lastUpdated: NOON,
      family: [
        { id: 'm1', name: 'Bean', owner: '', fromFriend: false, fromWild: false, bornAt: NOON - 9 * DAY, character: 'pebblit', variant: null, generation: 1, parents: [], meadow: true },
        { id: 'p1', name: 'Gone', owner: '', fromFriend: false, fromWild: false, bornAt: NOON - 9 * DAY, character: 'pebblit', variant: null, generation: 1, parents: [] },
      ],
      visit: { guest: null, friendId: null, until: 0, met: false, nextAt: 0, wildAt: 0, invitedDay: '' },
      inventory: { food: {} },
    };
    const out = migrate({ version: 34, state: old });
    expect(out.version).toBe(SAVE_VERSION);
    expect(out.state.meadow.map((m: { pet: Pet }) => m.pet.id)).toEqual(['m1']);
    expect(out.state.meadow[0].pet).toMatchObject({ name: 'Bean', stage: 'adult', character: 'pebblit', condition: 'healthy' });
    expect(out.state.keepsakes).toEqual([{ id: 'm1', name: 'Bean', character: 'pebblit', variant: null, tier: 'portrait', at: NOON }]);
    expect(out.state.visit.meadowAt).toBe(NOON + M.firstVisitHours * HOUR);
  });
});
