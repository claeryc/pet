import { describe, expect, it } from 'vitest';
import { newTeen } from './helpers';
import { CONFIG } from '../src/game/config';
import { simulate } from '../src/game/simulate';
import { feed } from '../src/game/actions';
import {
  NIGHT, buyHolidayTicket, callHome, cantHoliday, goHoliday, holidayTickets, nightOf, openBackpack, placeFinds, placeLevel,
  planTrip, getPlace, rollFinds, setOff, storyOf,
} from '../src/game/journeys';
import { growGardenAround } from '../src/game/garden';
import { isAway, nobodyHome } from '../src/game/presence';
import { STRINGS } from '../src/strings';
import { newPet, type GameState, type Offer, type Plot, type Trip } from '../src/game/state';

const HOUR = 3_600_000;
const DAY = 24 * HOUR;
// 9am local time, so a 10-hour trip ends before bedtime.
const START = new Date(2026, 0, 1, 9, 0).getTime();
const J = CONFIG.journeys;

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

// Goes on the trip in `slot` with a big lunch and comes home.
function trip(s: GameState, slot: number, at = START): GameState {
  s.inventory.food.salmon = 5;
  s.inventory.food.energyDrink = 5;
  const went = setOff(s, at, slot, ['salmon', 'salmon', 'energyDrink'], false);
  expect(went.blocked).toBeUndefined();
  const t = went.state.pet.trip!;
  return simulate(went.state, t.endsAt + 60_000);
}

describe('story postcards', () => {
  it('every finished trip sends a postcard with a story line and the pet on it', () => {
    const s = trip(ready(), 0);
    const opened = openBackpack(s, s.pet.id);
    const card = opened.postcard!;
    expect(card.story?.id).toBeTruthy();
    expect(card.pet).toBe(s.pet.id);
    expect(card.look).toBeTruthy();
    expect(opened.state.journeys.journal.market.postcards[0]).toEqual(card);
    // Each story has words.
    expect(STRINGS.journeys.stories[card.story!.id]).toBeTypeOf('function');
  });

  it('a story about something the pet loves writes the like into the Family Tree', () => {
    const s = trip(ready(), 1);
    const pet = s.pet;
    const t = pet.trip!;
    // Make honey (always found on a rare trip to the market) its favourite.
    const loving = { ...pet, likes: { ...pet.likes, food: 'honey', found: [] } };
    // Find a start time whose story is the loved food.
    let story = storyOf(loving, t, t.finds);
    let shift = 0;
    while (story.id !== 'lovedFood' && shift < 200) {
      shift++;
      story = storyOf(loving, { ...t, startedAt: t.startedAt + shift }, t.finds);
    }
    expect(story).toEqual({ id: 'lovedFood', food: 'honey' });
    const home: GameState = { ...s, pet: { ...loving, trip: { ...t, startedAt: t.startedAt + shift } } };
    const opened = openBackpack(home, home.pet.id);
    expect(opened.postcard!.story).toEqual(story);
    expect(opened.state.pet.likes.found).toContain('food');
  });

  it('every trait and place has its own lines', () => {
    for (const t of ['playful', 'greedy', 'shy', 'sleepy', 'cheery']) expect(STRINGS.journeys.stories[`trait:${t}`]).toBeTypeOf('function');
    for (const p of ['market', 'woods', 'cove', 'hill']) {
      expect(STRINGS.journeys.stories[`place:${p}:0`]).toBeTypeOf('function');
      expect(STRINGS.journeys.stories[`place:${p}:1`]).toBeTypeOf('function');
    }
  });

  it('stamps and levels fill up with trips', () => {
    let s = ready();
    s = openBackpack(trip(s, 0), s.pet.id).state;
    expect(s.journeys.journal.market.stamps).toEqual(['common']);
    expect(placeLevel(s.journeys.journal.market.trips)).toBe(1);
    expect(placeLevel(5)).toBe(2);
    expect(placeLevel(40)).toBe(4);
  });

  it('"found here" lists the ingredient, foods and seeds, but no gold', () => {
    const finds = placeFinds(getPlace('market')!);
    expect(finds[0]).toBe('honey');
    expect(finds).toContain('seed:carrot');
    expect(finds.some((f) => f.startsWith('gold'))).toBe(false);
  });
});

describe('a favourite place', () => {
  it('is picked after a few finished trips: where the pet has been most', () => {
    let s = ready();
    for (let i = 0; i < J.favourite.afterTrips; i++) {
      const at = START + i * 2 * DAY;
      s.journeys.offers = [{ place: 'market', rarity: 'common' }, null, null];
      s.pet.tripReadyAt = 0;
      s.pet.stats = { hunger: 100, happiness: 100, health: 100, energy: 100 };
      s.lastUpdated = at;
      const home = trip(s, 0, at);
      const opened = openBackpack(home, home.pet.id);
      s = opened.state;
      if (i < J.favourite.afterTrips - 1) expect(s.pet.favouritePlace ?? null).toBeNull();
      else expect(opened.postcard!.story!.id).toBe('favourite');
    }
    expect(s.pet.favouritePlace).toBe('market');
    expect(s.pet.travels?.market).toBe(J.favourite.afterTrips);
  });

  it('finds a little more there', () => {
    const pet = ready().pet;
    const market = getPlace('market')!;
    const plain = rollFinds(pet, market, 'rare', START);
    const loved = rollFinds({ ...pet, favouritePlace: 'market' }, market, 'rare', START);
    // One more find: one more of something, or more gold.
    const count = (f: typeof plain) => f.reduce((n, x) => n + x.count, 0);
    expect(count(loved)).toBeGreaterThan(count(plain));
  });
});

describe('friends from trips', () => {
  it('an Adventure sometimes makes a friend of the place\'s theme, who joins your friends', () => {
    // Look for a start time that makes a friend.
    let found: GameState | null = null;
    for (let i = 0; i < 100 && !found; i++) {
      const s = ready();
      s.inventory.food.salmon = 5;
      s.inventory.food.energyDrink = 5;
      const went = setOff(s, START + i * 60_000, 2, ['salmon', 'salmon', 'energyDrink'], false).state;
      if (went.pet.trip?.friend) found = went;
    }
    expect(found).not.toBeNull();
    const friend = found!.pet.trip!.friend!;
    expect(friend.score).toBe(J.friend.score);
    const home = simulate(found!, found!.pet.trip!.endsAt + 60_000);
    const opened = openBackpack(home, home.pet.id);
    expect(opened.friend).toBe(friend.name);
    expect(opened.state.friends.map((f) => f.id)).toContain(friend.id);
    expect(opened.postcard!.story!.id).toBe('friend');
  });

  it('only epic trips make friends', () => {
    for (let i = 0; i < 50; i++) {
      const s = ready();
      expect(setOff(s, START + i * 60_000, 1, [], false).state.pet.trip?.friend ?? null).toBeNull();
    }
  });
});

describe('the night ticket', () => {
  const EVENING = new Date(2026, 0, 1, 20, 30).getTime();
  const MORNING = new Date(2026, 0, 2, 8, 30).getTime();

  it('is up from the evening to the morning, once a night', () => {
    expect(nightOf(START)).toBeNull();
    expect(nightOf(EVENING)).toBe(nightOf(new Date(2026, 0, 2, 3, 0).getTime()));
    const s = newTeen(EVENING - 60_000);
    s.lastUpdated = EVENING - 60_000;
    const night = simulate(s, EVENING);
    expect(night.journeys.night?.night).toBe(true);
    expect(['rare', 'epic']).toContain(night.journeys.night!.rarity);
    expect(simulate(night, MORNING).journeys.night ?? null).toBeNull();
  });

  it('lasts the night, uses what an Adventure uses, and once taken is gone until the next night', () => {
    const s = newTeen(EVENING);
    s.lastUpdated = EVENING;
    s.pet.stats = { hunger: 100, happiness: 100, health: 100, energy: 100 };
    s.journeys.night = { place: 'market', rarity: 'rare', night: true };
    s.journeys.nightOf = nightOf(EVENING)!;
    expect(planTrip(s.pet, s.journeys.night, []).to).toEqual({ hunger: 100 - J.cost.epic.hunger, energy: 100 - J.cost.epic.energy });
    s.inventory.food.salmon = 5;
    s.inventory.food.energyDrink = 5;
    const went = setOff(s, EVENING, NIGHT, ['salmon', 'salmon', 'energyDrink'], false).state;
    expect(went.pet.trip!.night).toBe(true);
    expect(went.pet.trip!.endsAt - EVENING).toBe(J.night.hours * HOUR);
    expect(went.journeys.night).toBeNull();
    expect(simulate(went, EVENING + HOUR).journeys.night).toBeNull();
    const home = simulate(went, went.pet.trip!.endsAt + 60_000);
    expect(openBackpack(home, home.pet.id).state.journeys.journal.market.stamps).toContain('night');
  });
});

describe('a Holiday', () => {
  function withTicket(): GameState {
    const s = ready();
    s.fragments.pieces = J.holiday.fragments;
    const bought = buyHolidayTicket(s);
    expect(bought.blocked).toBeUndefined();
    return bought.state;
  }

  it('costs star fragments in the Star Shop', () => {
    const s = withTicket();
    expect(holidayTickets(s)).toBe(1);
    expect(s.fragments.pieces).toBe(0);
    expect(buyHolidayTicket(s).blocked).toBe('notEnoughFragments');
  });

  it('needs a ticket, and nobody sick', () => {
    expect(cantHoliday(ready())?.blocked).toBe('noTicket');
    const s = withTicket();
    s.pet.condition = 'sick';
    expect(cantHoliday(s)?.blocked).toBe('sick');
  });

  it('takes every pet, and everything waits: no hunger, no sickness, no growing up', () => {
    const s = withTicket();
    const other = newPet(START);
    other.stage = 'baby';
    other.name = 'Bean';
    other.stats = { hunger: 40, happiness: 40, health: 80, energy: 40 };
    s.housemates = [other];
    const went = goHoliday(s, START, 3);
    expect(went.blocked).toBeUndefined();
    expect(holidayTickets(went.state)).toBe(0);
    expect(nobodyHome(went.state)).toBe(true);
    const mid = simulate(went.state, START + 2 * DAY);
    expect(mid.pet.stats.hunger).toBe(100);
    expect(mid.housemates[0].stats.hunger).toBe(40);
    expect(mid.housemates[0].condition).not.toBe('sick');
    const back = simulate(went.state, START + 3 * DAY + 60_000);
    expect(back.pet.trip).toBeNull();
    expect(back.housemates[0].trip).toBeNull();
    expect(back.housemates[0].stage).toBe('baby');
    expect(back.pet.stats.hunger).toBeGreaterThan(90);
    expect(back.messages.some((m) => m.kind === 'holidayHome')).toBe(true);
    // Home, and ready to go out again straight away.
    expect(back.pet.tripReadyAt).toBeLessThanOrEqual(START + 3 * DAY + 60_000);
    // Feeding works again.
    back.inventory.food.strawberry = 1;
    back.pet.stats.hunger = 50;
    expect(feed(back, START + 3 * DAY + 60_000, 'strawberry').blocked).toBeUndefined();
  });

  it('calling home brings everyone back', () => {
    const s = withTicket();
    const went = simulate(goHoliday(s, START, 2).state, START + HOUR);
    const back = callHome(went, START + HOUR, went.pet.id).state;
    expect(isAway(back.pet)).toBe(false);
    expect(back.pet.trip).toBeNull();
    expect(back.journeys.holiday!.until).toBe(START + HOUR);
  });

  it('the garden waits too', () => {
    const pot: Plot = {
      crop: 'carrot', growth: 0, moistUntil: START + HOUR, rollsFrom: START, rolls: 0, luck: 0,
      fertilizedUntil: 0, sickSince: null, dead: false,
    };
    const paused = { from: START + 2 * HOUR, until: START + 2 * HOUR + 3 * DAY };
    const after = growGardenAround([pot], START, paused.until + HOUR, paused)[0];
    const plain = growGardenAround([pot], START, START + 3 * HOUR, null)[0];
    expect(after.growth).toBe(plain.growth);
    expect(after.rolls).toBe(plain.rolls);
  });

  it('a Holiday trip has no backpack or finds', () => {
    const s = withTicket();
    const t = goHoliday(s, START, 1).state.pet.trip as Trip;
    expect(t.holiday).toBe(true);
    expect(t.finds).toEqual([]);
  });
});
