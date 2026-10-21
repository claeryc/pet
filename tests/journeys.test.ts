import { describe, expect, it } from 'vitest';
import { newTeen } from './helpers';
import { CONFIG } from '../src/game/config';
import { simulate } from '../src/game/simulate';
import { feed } from '../src/game/actions';
import {
  callHome, cantGo, getPlace, openBackpack, planTrip, potsDryingBy, restPercy, rollFinds, setOff, type Place,
} from '../src/game/journeys';
import { isAway, hasBackpack, nobodyHome } from '../src/game/presence';
import { stepFragments } from '../src/game/fragments';
import { migrate } from '../src/storage/storage';
import { newPet, type GameState, type Offer } from '../src/game/state';

const HOUR = 3_600_000;
// 9am local time, so a 10-hour trip ends before bedtime.
const START = new Date(2026, 0, 1, 9, 0).getTime();
const J = CONFIG.journeys;

// A teen with full stats and a known board: a common Stroll, a rare Hike
// and an epic Adventure, all at the Market.
function ready(offers: Offer[] = [
  { place: 'market', rarity: 'common' },
  { place: 'market', rarity: 'rare' },
  { place: 'market', rarity: 'epic' },
]): GameState {
  const s = newTeen(START);
  s.pet.stats = { hunger: 100, happiness: 100, health: 100, energy: 100 };
  s.journeys.offers = offers;
  s.journeys.refillAt = [START, START, START];
  return s;
}

describe('the journey board', () => {
  it('fills up with a common trip first, then rare or epic ones', () => {
    const s = simulate(newTeen(START), START + 60_000);
    const offers = s.journeys.offers;
    expect(offers.every((o) => o !== null)).toBe(true);
    expect(offers[0]!.rarity).toBe('common');
    for (const o of offers.slice(1)) expect(['rare', 'epic']).toContain(o!.rarity);
  });

  it('only offers places that have opened', () => {
    const s = simulate(newTeen(START), START + 60_000);
    expect(s.journeys.offers.every((o) => o!.place === 'market')).toBe(true);
  });

  it('replaces a taken offer a few hours later', () => {
    const s = setOff(ready(), START, 0, [], false).state;
    expect(s.journeys.offers[0]).toBeNull();
    expect(simulate(s, START + (J.refillHours - 1) * HOUR).journeys.offers[0]).toBeNull();
    expect(simulate(s, START + J.refillHours * HOUR).journeys.offers[0]?.rarity).toBe('common');
  });
});

describe('the trip check', () => {
  it('needs enough tummy and energy to be home at or above the low line', () => {
    const s = ready();
    s.pet.stats.hunger = 60;
    const epic = planTrip(s.pet, 'epic', []);
    expect(epic.enoughFood).toBe(false); // 60 - 55 is too low
    expect(planTrip(s.pet, 'epic', ['riceBall', 'riceBall']).enoughFood).toBe(true);
    expect(planTrip(s.pet, 'common', []).enoughFood).toBe(true);
  });

  it('an energy drink in the lunchbox makes up for a tired pet', () => {
    const s = ready();
    s.pet.stats.energy = 70;
    expect(planTrip(s.pet, 'epic', []).enoughEnergy).toBe(false);
    expect(planTrip(s.pet, 'epic', ['energyDrink']).enoughEnergy).toBe(true);
  });

  it("refuses a trip that isn't covered, and babies", () => {
    const s = ready();
    s.pet.stats.energy = 50;
    expect(setOff(s, START, 2, [], false).blocked).toBe('notEnoughEnergy');
    s.pet.stage = 'baby';
    expect(setOff(s, START, 0, [], false).blocked).toBe('tooYoung');
  });

  it('uses up the lunchbox when it sets off', () => {
    const s = ready();
    s.inventory.food = { energyDrink: 2 };
    const next = setOff(s, START, 2, ['energyDrink'], false).state;
    expect(next.inventory.food.energyDrink).toBe(1);
    expect(setOff(s, START, 2, ['strawberry'], false).blocked).toBe('noFood');
  });
});

describe('on a journey', () => {
  it('tummy and energy go down on the way, joy and health wait, and it comes home at the end', () => {
    const s = setOff(ready(), START, 1, [], false).state; // a 4-hour Hike
    expect(isAway(s.pet)).toBe(true);
    const half = simulate(s, START + 2 * HOUR);
    expect(half.pet.stats.hunger).toBeCloseTo(100 - J.cost.rare.hunger / 2);
    expect(half.pet.stats.energy).toBeCloseTo(100 - J.cost.rare.energy / 2);
    expect(half.pet.stats.happiness).toBe(100);
    expect(half.pet.stats.health).toBe(100);
    const back = simulate(s, START + 4 * HOUR);
    expect(isAway(back.pet)).toBe(false);
    expect(hasBackpack(back.pet)).toBe(true);
    expect(back.pet.trip!.backAt).toBe(START + 4 * HOUR);
    expect(back.messages[0]).toMatchObject({ kind: 'tripHome', place: 'market' });
  });

  it("can't get sick on the way, and growing up waits", () => {
    const s = ready();
    s.pet.stats.happiness = 30;
    s.pet.stats.health = 30;
    s.pet.stageStartedAt = START - (CONFIG.growth.stageHours.teen - 1) * HOUR; // grows up in an hour
    const away = setOff(s, START, 2, [], false).state; // 10 hours
    const later = simulate(away, START + 9 * HOUR);
    expect(later.pet.condition).toBe('healthy');
    expect(later.pet.stage).toBe('teen');
    const home = simulate(away, START + 10 * HOUR + 30 * 60_000);
    expect(home.pet.stage).toBe('teen'); // still an hour to go after coming home
    expect(simulate(away, START + 11 * HOUR + 60_000).pet.stage).toBe('adult');
  });

  it('gives the same result whether caught up at once or in small steps', () => {
    const s = setOff(ready(), START, 2, [], true).state;
    const once = simulate(s, START + 14 * HOUR);
    let stepped = s;
    for (let t = START; t <= START + 14 * HOUR; t += 7 * 60_000) stepped = simulate(stepped, t);
    stepped = simulate(stepped, START + 14 * HOUR);
    expect(stepped.pet).toEqual(once.pet);
    expect(stepped.inventory).toEqual(once.inventory);
  });

  it('nobody home means no feeding, and a friend looks after the other pet meanwhile', () => {
    const s = ready();
    const other = newPet(START);
    other.stage = 'teen';
    other.name = 'Bean';
    s.housemates = [other];
    const left = setOff(s, START, 0, [], false).state;
    expect(left.pet.name).toBe('Bean'); // you look after the one at home
    expect(isAway(left.housemates[0])).toBe(true);
    expect(nobodyHome(left)).toBe(false);
    const alone = setOff(ready(), START, 0, [], false).state;
    expect(nobodyHome(alone)).toBe(true);
    expect(feed(alone, START + 60_000, 'riceBall').blocked).toBe('away');
  });

  it('waits a while before the same pet can go again', () => {
    const s = setOff(ready(), START, 1, [], false).state;
    const home = openBackpack(simulate(s, START + 4 * HOUR), s.pet.id).state;
    expect(cantGo(home.pet, START + 4 * HOUR)).toBe('wait');
    expect(cantGo(home.pet, START + 6 * HOUR)).toBeNull();
  });
});

describe('finds', () => {
  const market = getPlace('market') as Place;
  const pet = newTeen(START).pet;

  it('rare and epic trips always bring the place\'s own ingredient', () => {
    expect(rollFinds(pet, market, 'rare', START)[0]).toMatchObject({ kind: 'food', id: 'honey', count: 1 });
    expect(rollFinds(pet, market, 'epic', START)[0]).toMatchObject({ kind: 'food', id: 'honey', count: 2 });
  });

  it('are the same for the same pet and time', () => {
    expect(rollFinds(pet, market, 'epic', START)).toEqual(rollFinds(pet, market, 'epic', START));
  });

  it('a common trip only finds 1-star things, and an epic trip about 30% of the time a 3-star one', () => {
    let three = 0;
    const n = 400;
    for (let i = 0; i < n; i++) {
      const at = START + i * HOUR;
      for (const f of rollFinds(pet, market, 'common', at)) expect(f.stars).toBeLessThanOrEqual(1);
      if (rollFinds(pet, market, 'epic', at).some((f) => f.stars === 3)) three++;
    }
    expect(three / n).toBeGreaterThan(0.2);
    expect(three / n).toBeLessThan(0.4);
  });

  it('the backpack goes into the inventory and the travel journal', () => {
    const s = setOff(ready(), START, 1, [], false).state;
    const home = simulate(s, START + 4 * HOUR);
    const finds = home.pet.trip!.finds;
    const opened = openBackpack(home, home.pet.id);
    expect(opened.finds).toEqual(finds);
    expect(opened.state.pet.trip).toBeNull();
    expect(opened.state.inventory.food.honey).toBe(1);
    expect(opened.state.journeys.journal.market).toMatchObject({ trips: 1 });
    expect(opened.state.journeys.journal.market.found).toContain('honey');
    expect(opened.state.tally.journeys).toBe(1);
  });
});

describe('Percy and calling home', () => {
  it('Percy flies home halfway with the best find, then rests', () => {
    const s = setOff(ready(), START, 2, [], true).state;
    const before = s.pet.trip!.finds.length;
    const half = simulate(s, START + 5 * HOUR);
    expect(half.pet.trip!.percy).toBe('flown');
    expect(half.pet.trip!.finds.length).toBe(before - 1);
    expect(half.messages[0]).toMatchObject({ kind: 'courier', place: 'market' });
    expect(half.journeys.journal.market.postcards).toHaveLength(1);
    expect(setOff(ready(), START, 0, [], false).state.journeys.percyFreeAt).toBe(0);
    expect(half.journeys.percyFreeAt).toBe(START + 5 * HOUR + J.percy.restHours * HOUR);
  });

  it('waking Percy early costs gold', () => {
    const s = simulate(setOff(ready(), START, 0, [], true).state, START + HOUR);
    s.gold = J.percy.resetPrice;
    const woke = restPercy(s, START + HOUR);
    expect(woke.state.gold).toBe(0);
    expect(woke.state.journeys.percyFreeAt).toBe(START + HOUR);
  });

  it('called home early, it brings a share of its finds and Percy brings the best one', () => {
    const s = setOff(ready(), START, 2, [], true).state;
    const all = s.pet.trip!.finds.length;
    const now = START + 2 * HOUR;
    const back = callHome(simulate(s, now), now, s.pet.id).state;
    expect(hasBackpack(back.pet)).toBe(true);
    expect(back.pet.trip!.early).toBe(true);
    expect(back.pet.trip!.finds.length).toBe(Math.floor((all - 1) * 0.2));
    expect(back.messages.some((m) => m.kind === 'courier')).toBe(true);
    // A trip cut short doesn't count in the journal.
    expect(openBackpack(back, back.pet.id).state.journeys.journal.market.trips).toBe(0);
  });
});

describe('nobody home', () => {
  it("Percy's pickup waits until a pet is back", () => {
    const s = ready();
    s.caught = ['shrimp'];
    s.delivery = { order: { announcedAt: START - 20 * HOUR, pickupAt: START + 2 * HOUR, boxes: [{ food: 'shrimp', want: 1, have: 0 }] }, nextAt: 0 };
    const away = setOff(s, START, 1, [], false).state; // home at 13:00
    const later = simulate(away, START + 3 * HOUR);
    expect(later.delivery.order?.pickupAt).toBe(START + 5 * HOUR); // 14:00, an hour after it's home
  });

  it("a day away doesn't break the care streak, or count towards it", () => {
    let s = ready();
    s = stepFragments({ ...s, lastUpdated: START }).state;
    expect(s.fragments.streak).toBe(1);
    s = setOff(s, START + 24 * HOUR, 2, [], false).state;
    s = stepFragments({ ...s, lastUpdated: START + 25 * HOUR }).state;
    expect(s.fragments.streak).toBe(1);
    s = openBackpack(simulate(s, START + 36 * HOUR), s.pet.id).state; // home the next evening
    s = stepFragments({ ...s, lastUpdated: START + 48 * HOUR }).state;
    expect(s.fragments.streak).toBe(2);
  });

  it('warns about pots that will dry out on the way', () => {
    const s = ready();
    s.garden[0] = { ...s.garden[0], crop: 'carrot', growth: 0, moistUntil: START + 2 * HOUR };
    expect(potsDryingBy(s, START + HOUR)).toBe(0);
    expect(potsDryingBy(s, START + 4 * HOUR)).toBe(1);
  });
});

describe('saves', () => {
  it('older saves get journeys, with nobody away', () => {
    const out = migrate({ version: 17, state: { pet: { stage: 'teen' }, housemates: [] } });
    expect(out.state.pet.trip).toBeNull();
    expect(out.state.journeys.offers).toEqual([null, null, null]);
  });
});
