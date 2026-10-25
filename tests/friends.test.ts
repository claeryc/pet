import { describe, expect, it } from 'vitest';
import { getTrait, traitOf } from '../src/game/traits';
import { createNewGame, type Friend, type GameState } from '../src/game/state';
import { CONFIG } from '../src/game/config';
import { chooseCharacter, getCharacter } from '../src/game/growth';
import {
  befriend,
  giveGift,
  hearts,
  invite,
  makeWanderer,
  meet,
  seenCharacters,
  mingle,
  mingleBlock,
  removeFriend,
  retire,
  stepVisits,
  switchPet,
  visitor,
} from '../src/game/friends';
import { familyGenerations, pedigree } from '../src/game/family';
import { simulate } from '../src/game/simulate';
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

// The same game with a wanderer friend at `score`, over for a long visit.
function withFriend(score: number, now = NOON): { state: GameState; friend: Friend } {
  const s = withAdult(now);
  const friend = { ...makeWanderer(now - DAY, []), score, character: 'sprig', variant: null };
  return { state: { ...s, friends: [friend], visit: { ...s.visit, friendId: friend.id, until: now + 30 * DAY } }, friend };
}

// Steps visits along an hour at a time, noting each arrival.
function arrivals(s: GameState, from: number, to: number): { s: GameState; seen: { at: number; id: string; until: number }[] } {
  const seen: { at: number; id: string; until: number }[] = [];
  for (let t = from; t <= to; t += 10 * 60_000) {
    s = stepVisits(s, t);
    const who = visitor(s);
    if (who && seen[seen.length - 1]?.until !== s.visit.until) seen.push({ at: s.visit.until - F.stayHours * HOUR, id: who.id, until: s.visit.until });
  }
  return { s, seen };
}

describe('visits', () => {
  it('the first wanderer comes soon after a pet grows up, and stays a few hours', () => {
    let s = withAdult();
    s = stepVisits(s, NOON);
    expect(s.visit.guest).toBeNull();
    expect(s.visit.nextAt).toBe(NOON + F.firstVisitHours * HOUR);
    s = stepVisits(s, s.visit.nextAt);
    expect(s.visit.guest).not.toBeNull();
    expect(s.visit.until).toBe(NOON + (F.firstVisitHours + F.stayHours) * HOUR);
    expect(s.messages[0].kind).toBe('visitor');
    // It moves on, and the next one comes after a break.
    const left = s.visit.until;
    s = stepVisits(s, left);
    expect(visitor(s)).toBeNull();
    expect(s.visit.nextAt - left).toBeGreaterThanOrEqual(F.gapHours.min * HOUR);
    expect(s.visit.nextAt - left).toBeLessThanOrEqual(F.gapHours.max * HOUR);
  });

  it("doesn't come before any pet has grown up", () => {
    const s = createNewGame(NOON);
    expect(stepVisits(s, NOON + 10 * DAY).visit.nextAt).toBe(0);
  });

  it('friends drop by one at a time, with a new wanderer every 2 days', () => {
    const { state } = withFriend(10);
    const start = { ...state, visit: { ...state.visit, friendId: null, until: 0 } };
    const { seen } = arrivals(start, NOON, NOON + 4 * DAY);
    const wild = seen.filter((v) => v.id.startsWith('wild-') && v.id !== state.friends[0].id);
    // The second is due 2 days on; if a friend is over then, it comes next.
    expect(wild).toHaveLength(2);
    expect(wild[0].at).toBe(NOON + HOUR);
    expect(wild[1].at).toBeGreaterThanOrEqual(NOON + HOUR + 2 * DAY);
    expect(wild[1].at).toBeLessThanOrEqual(NOON + HOUR + 2 * DAY + (F.stayHours + F.gapHours.max) * HOUR);
    const friendVisits = seen.filter((v) => v.id === state.friends[0].id);
    expect(friendVisits.length).toBeGreaterThan(10);
    // Never two at once, and always a break of at least an hour.
    for (let i = 1; i < seen.length; i++) {
      expect(seen[i].at - seen[i - 1].until).toBeGreaterThanOrEqual(F.gapHours.min * HOUR);
    }
  });

  it('nobody comes between wanderers until you have a friend', () => {
    const { seen } = arrivals(withAdult(), NOON, NOON + 3 * DAY);
    expect(seen.map((v) => v.at)).toEqual([NOON + HOUR, NOON + HOUR + 2 * DAY]);
  });

  it('are the same however the game catches up', () => {
    expect(makeWanderer(NOON, [])).toEqual(makeWanderer(NOON, []));
    expect(makeWanderer(NOON, ['Mochi']).name).not.toBe('Mochi');
    const { state } = withFriend(10);
    const start = stepVisits({ ...state, visit: { ...state.visit, friendId: null, until: 0 } }, NOON);
    const later = NOON + 3 * DAY + 5 * HOUR;
    expect(stepVisits(start, later).visit).toEqual(arrivals(start, NOON, later).s.visit);
  });

  it('a friend who visits and leaves without meeting loses a point, never a heart', () => {
    const { state, friend } = withFriend(41);
    let s = { ...state, visit: { ...state.visit, until: NOON + HOUR } };
    s = stepVisits(s, NOON + HOUR);
    expect(s.friends[0].score).toBe(40);
    s = { ...s, visit: { ...s.visit, friendId: friend.id, until: NOON + 2 * HOUR, met: false } };
    expect(stepVisits(s, NOON + 2 * HOUR).friends[0].score).toBe(40);
    // Met during the visit: nothing lost.
    const { state: s2 } = withFriend(41);
    const met = meet({ ...s2, visit: { ...s2.visit, until: NOON + HOUR } }, friend.id, NOON).state;
    expect(stepVisits(met, NOON + HOUR).friends[0].score).toBe(41 + F.meet.score);
  });

  it('only the visitor still here gets a message after a long time away', () => {
    const { state } = withFriend(60);
    const start = stepVisits({ ...state, visit: { ...state.visit, friendId: null, until: 0 } }, NOON);
    const s = stepVisits(start, NOON + 5 * DAY);
    expect(s.messages.filter((m) => m.kind === 'visitor').length).toBeLessThanOrEqual(1);
    expect(s.friends[0].score).toBe(60); // missed visits, but never below 3 hearts
  });

  it('a wanderer can be added as a friend, up to the limit, and stays for its visit', () => {
    let s = stepVisits(stepVisits(withAdult(), NOON), NOON + F.firstVisitHours * HOUR);
    const guest = s.visit.guest!;
    const added = befriend(s);
    expect(added.state.friends.map((f) => f.id)).toEqual([guest.id]);
    expect(added.state.visit.guest).toBeNull();
    expect(visitor(added.state)?.id).toBe(guest.id);
    s = { ...s, friends: Array.from({ length: F.maxWild }, (_, i) => makeWanderer(i, [])) };
    expect(befriend(s).blocked).toBe('full');
  });

  it('you can invite a friend over once a day, when nobody is over', () => {
    const { state, friend } = withFriend(10);
    expect(invite(state, friend.id, NOON).blocked).toBeUndefined(); // already here
    const other = { ...makeWanderer(NOON - 2 * DAY, []), name: 'Pip' };
    let s = { ...state, friends: [...state.friends, other] };
    expect(invite(s, other.id, NOON).blocked).toBe('busy');
    s = { ...s, visit: { ...s.visit, friendId: null, until: 0, nextAt: NOON + 2 * HOUR } };
    s = invite(s, other.id, NOON).state;
    expect(visitor(s)?.id).toBe(other.id);
    expect(s.visit.until).toBe(NOON + F.stayHours * HOUR);
    s = stepVisits(s, s.visit.until);
    expect(invite(s, friend.id, s.visit.nextAt - 1).blocked).toBe('invited');
    expect(invite(s, friend.id, NOON + DAY).blocked).toBeUndefined();
  });

  it('your pet can only meet whoever is over', () => {
    const { state, friend } = withFriend(10);
    const away = { ...state, visit: { ...state.visit, friendId: null, until: 0 } };
    expect(meet(away, friend.id, NOON).blocked).toBe('away');
    expect(mingleBlock({ ...away, friends: [{ ...friend, score: 90 }] }, friend.id, NOON)).toBe('away');
  });

  it('saying goodbye to a friend who is over sends them home', () => {
    const { state, friend } = withFriend(10);
    const s = removeFriend(state, friend.id, NOON);
    expect(s.friends).toEqual([]);
    expect(visitor(s)).toBeNull();
    expect(s.visit.nextAt).toBeGreaterThan(NOON);
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

  it('gifts count by their price, at least 1, up to a daily cap', () => {
    let { state: s, friend } = withFriend(0);
    s.inventory.food = { lobster: 3, cookie: 1 };
    s = giveGift(s, friend.id, 'lobster', NOON).state; // 40 gold: 2 tenths of a heart
    expect(hearts(s.friends[0].score)).toBe(0.2);
    s = giveGift(s, friend.id, 'cookie', NOON).state; // 8 gold, still a tenth
    expect(hearts(s.friends[0].score)).toBe(0.3);
    s = giveGift(s, friend.id, 'lobster', NOON).state; // nothing more today
    expect(hearts(s.friends[0].score)).toBe(0.3);
    const cap = s.friends[0].score;
    expect(s.inventory.food.lobster).toBe(1);
    expect(giveGift(s, friend.id, 'riceBall', NOON).blocked).toBe('freeFood');
    expect(giveGift(s, friend.id, 'cookie', NOON).blocked).toBe('noFood');
    // Tomorrow, gifts count again.
    expect(giveGift(s, friend.id, 'lobster', NOON + DAY).state.friends[0].score).toBe(cap + 2 * (F.heartPoints / 10));
  });

  it('shows as hearts, in tenths', () => {
    expect(hearts(0)).toBe(0);
    expect(hearts(70)).toBe(3.5);
    expect(hearts(79)).toBe(3.9);
    expect(hearts(4)).toBe(0.2);
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
    const guest = { ...state, friends: [], visit: { ...state.visit, guest: friend, friendId: null } };
    expect(mingleBlock(guest, friend.id, NOON)).toBe('notFriend');
  });

  it('a little one is an egg with both parents, one generation on', () => {
    const { state, friend } = withFriend(100);
    const parent = state.pet;
    const result = mingle(state, friend.id, NOON, 0);
    const s = result.state;
    const egg = s.housemates[0];
    expect(result.egg).toBeDefined();
    expect(egg.stage).toBe('egg');
    expect(egg.parents).toEqual([parent.id, friend.id]);
    expect(egg.generation).toBe(2);
    expect(egg.themes.sort()).toEqual(['cave', 'nature']);
    expect(egg.parentLooks).toEqual([
      { character: parent.character, variant: parent.variant },
      { character: friend.character, variant: friend.variant },
    ]);
    // The parent stays the pet you look after, and the friend joins the
    // Family Tree.
    expect(s.pet.id).toBe(parent.id);
    expect(s.pet.partner).toBe(friend.id);
    expect(s.housemates).toHaveLength(1);
    expect(s.family.find((m) => m.id === friend.id)?.fromWild).toBe(true);
    expect(result.nested).toBe(false);
    expect(s.nest).toBeNull();
    expect(s.messages[0].kind).toBe('littleOne');
    const tree = pedigree(s, egg.id);
    expect(tree.parents.map((p) => p?.name)).toEqual([parent.name, friend.name]);
  });

  it("a little one has a trait, often one of its parents'", () => {
    let fromParent = 0;
    for (let i = 0; i < 60; i++) {
      const { state, friend } = withFriend(100);
      const s = mingle({ ...state, pet: { ...state.pet, trait: 'sleepy' } }, friend.id, NOON, 0).state;
      const egg = s.housemates[0];
      expect(getTrait(egg.trait)).toBeDefined();
      if ([traitOf(friend), 'sleepy'].includes(egg.trait)) fromParent++;
      expect(s.family.find((m) => m.id === friend.id)?.trait).toBe(traitOf(friend));
    }
    expect(fromParent).toBeGreaterThan(20);
  });

  it('the chance goes up with hearts, and a miss still counts as a meeting', () => {
    const { state, friend } = withFriend(70);
    const missed = mingle(state, friend.id, NOON, 0.5); // 50% at 70
    expect(missed.egg).toBeUndefined();
    expect(missed.state.friends[0].score).toBe(70 + F.meet.score);
    expect(mingle(state, friend.id, NOON, 0.49).egg).toBeDefined();
  });

  it('the pair waits a week before mingling again', () => {
    const { state, friend } = withFriend(100);
    const s = mingle(state, friend.id, NOON, 0.99).state;
    expect(mingleBlock(s, friend.id, NOON + DAY)).toBe('wait');
    expect(mingleBlock(s, friend.id, NOON + F.mingle.waitDays * DAY)).toBeNull();
  });

  it('a pet only ever has one partner', () => {
    const { state, friend } = withFriend(100);
    let s = mingle(state, friend.id, NOON, 0).state;
    const later = NOON + F.mingle.waitDays * DAY;
    const other = { ...makeWanderer(NOON - 2 * DAY, []), score: 100 };
    s = { ...s, friends: [...s.friends, other], visit: { ...s.visit, friendId: other.id } };
    expect(mingleBlock(s, other.id, later)).toBe('taken');
    s = { ...s, visit: { ...s.visit, friendId: friend.id } };
    expect(mingleBlock(s, friend.id, later)).toBeNull();
  });

  it("never with a parent, little one, brother or sister", () => {
    const { state, friend } = withFriend(100);
    // A grown-up little one of this friend can't mingle with it.
    const child = { ...state, pet: { ...state.pet, parents: ['someone', friend.id] } };
    expect(mingleBlock(child, friend.id, NOON)).toBe('family');
    const sibling = { ...state, friends: [{ ...friend, parents: ['a', 'b'] }], pet: { ...state.pet, parents: ['b', 'c'] } };
    expect(mingleBlock(sibling, friend.id, NOON)).toBe('family');
  });

  it('in a full room the egg waits in the nest until a pet moves out', () => {
    const { state, friend } = withFriend(100);
    let s = mingle(state, friend.id, NOON, 0).state; // parent + egg
    const later = NOON + F.mingle.waitDays * DAY;
    const result = mingle(s, friend.id, later, 0);
    expect(result.nested).toBe(true);
    s = result.state;
    expect(s.housemates).toHaveLength(1);
    expect(s.nest?.stage).toBe('egg');
    // Nobody has to leave, and no more eggs until this one has room.
    expect(mingleBlock(s, friend.id, later + F.mingle.waitDays * DAY)).toBe('nest');
    // The nest egg doesn't hatch while it waits.
    expect(simulate(s, later + 2 * DAY).nest?.stage).toBe('egg');
    const nestId = s.nest!.id;
    s = retire(s, s.housemates[0].id, later + DAY); // the first egg moves out
    expect(s.nest).toBeNull();
    expect(s.housemates.map((p) => p.id)).toEqual([nestId]);
    expect(s.housemates[0].stageStartedAt).toBe(later + DAY);
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
    expect(later.housemates[0].stage).toBe('baby'); // the egg hatched
    expect(later.pet.stats.hunger).toBeLessThan(s.pet.stats.hunger);
  });

  it('retiring moves a pet into the Family Tree; the last pet never retires', () => {
    const { state, friend } = withFriend(100);
    const s = mingle(state, friend.id, NOON, 0).state;
    const parent = s.pet;
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
  it("takes after its parents' themes", () => {
    for (let i = 0; i < 400; i++) expect(chooseCharacter(90, `pet-${i}`, { themes: ['ocean'] }).character.theme).toBe('ocean');
  });

  it('climbs the family: 3 stars only with a 2-star or better parent of that theme', () => {
    const kids = (looks: { character: string; variant: null }[], themes: string[]) =>
      Array.from({ length: 400 }, (_, i) => chooseCharacter(100, `kid-${i}`, { themes }, looks).character);
    // Two 1-star parents: no 3-star little ones.
    const plain = kids([{ character: 'sprig', variant: null }, { character: 'bubbit', variant: null }], ['nature', 'ocean']);
    expect(plain.some((c) => c.stars === 3)).toBe(false);
    // A Jellop parent lets an Ocean little one reach Tidecrest, but a
    // Nature one still stops at Acornet.
    const climbed = kids([{ character: 'sprig', variant: null }, { character: 'jellop', variant: null }], ['nature', 'ocean']);
    expect(climbed.some((c) => c.id === 'tidecrest')).toBe(true);
    expect(climbed.some((c) => c.id === 'stumpy')).toBe(false);
  });

  it('a 1-star parent keeps 1-star little ones coming, whatever the care', () => {
    const looks = [{ character: 'sprig', variant: null }, { character: 'jellop', variant: null }];
    const ones = Array.from({ length: 2000 }, (_, i) => chooseCharacter(100, `kid-${i}`, { themes: ['nature', 'ocean'] }, looks))
      .filter((r) => r.character.stars === 1).length / 2000;
    expect(ones).toBeGreaterThan(CONFIG.inheritance.oneStarFloor / 100 - 0.04);
    expect(ones).toBeLessThan(CONFIG.inheritance.oneStarFloor / 100 + 0.04);
  });

  it('never grows into a pack that isn\'t out yet, even with Cave parents', () => {
    for (let i = 0; i < 400; i++) expect(chooseCharacter(90, `pet-${i}`, { themes: ['cave'] }).character.theme).not.toBe('cave');
  });

  it('a first pet rolls exactly as before', () => {
    expect(chooseCharacter(60, 'abc')).toEqual(chooseCharacter(60, 'abc', {}));
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
    expect(file.state.visit).toEqual(createNewGame(NOON).visit);
    expect(file.state.pet.themes).toEqual([]);
    expect(file.state.family[0].fromWild).toBe(false);
  });

  it('upgrades a version 21 save: pets remember what their parents grew into', () => {
    const s: any = createNewGame(NOON);
    delete s.pet.parentLooks;
    s.pet.parents = ['mum', 'gone'];
    s.family = [{ id: 'mum', name: 'Mum', owner: '', fromFriend: false, fromWild: false, bornAt: 0, character: 'geodon', variant: null, generation: 1, parents: [] }];
    const file = migrate({ version: 21, state: s });
    expect(file.state.pet.parentLooks).toEqual([
      { character: 'geodon', variant: null },
      { character: null, variant: null },
    ]);
  });

  it('upgrades a version 27 save: friends count as met, and a crowded room fills the nest', () => {
    const { state, friend } = withFriend(100);
    // The old rules put the egg in your hands, and squeezed in a third pet
    // until you picked who retires.
    const egg = { ...createNewGame(NOON).pet, id: 'egg', bornAt: NOON };
    const s: any = { ...state, pet: egg, housemates: [{ ...state.pet }, { ...state.pet, id: 'other' }] };
    delete s.nest;
    delete s.charactersMet;
    const file = migrate({ version: 27, state: s });
    expect(file.state.charactersMet).toEqual([friend.character]);
    expect(file.state.nest?.id).toBe('egg');
    expect([file.state.pet, ...file.state.housemates].map((p: any) => p.id)).toEqual([state.pet.id, 'other']);
  });
});

describe('the Collection and wanderers', () => {
  it('meeting a pet puts its character in the Collection as met', () => {
    const { state, friend } = withFriend(0);
    expect(state.charactersMet).toEqual([]);
    const s = meet(state, friend.id, NOON).state;
    expect(s.charactersMet).toEqual(['sprig']);
    expect(seenCharacters({ ...s, charactersFound: ['pebblit:amber'] }).sort()).toEqual(['pebblit', 'sprig']);
  });

  it("wanderers lean towards characters you haven't met yet", () => {
    const ones = ['sprig', 'bubbit', 'dumpling', 'cloudlet'];
    const seen = ['sprig', 'bubbit', 'dumpling'];
    const wanderers = Array.from({ length: 600 }, (_, i) => makeWanderer(NOON + i * DAY, [], seen));
    const oneStar = wanderers.filter((w) => ones.includes(w.character!));
    const cloudlets = oneStar.filter((w) => w.character === 'cloudlet').length / oneStar.length;
    // A quarter by luck, plus the lean towards the one you haven't met.
    const lean = CONFIG.friends.unmetWandererChance / 100;
    expect(cloudlets).toBeGreaterThan(0.25 + 0.75 * lean - 0.08);
    // Nothing new to meet: just as before.
    const all = makeWanderer(NOON, [], ['sprig', 'bubbit', 'dumpling', 'cloudlet', 'acornet', 'jellop', 'puddling', 'moonpip', 'stumpy', 'tidecrest', 'cuppie', 'starhoot']);
    expect(all.character).toBe(makeWanderer(NOON, []).character);
  });
});
