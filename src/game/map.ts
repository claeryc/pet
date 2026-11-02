// The map (Menu > Map): which areas there are, what each one's card says,
// whether it's locked, and where the pet is. The areas and what they open
// are in src/data/map.json; the pictures and tap shapes come from
// art/map/ (see docs/MAP_GUIDE.md). The screen is src/ui/map.ts.

import data from '../data/map.json';
import { STRINGS } from '../strings';
import { CONFIG } from './config';
import { plotStage, needsTending } from './garden';
import { PLACES, placeLevel, placeOpen } from './journeys';
import { meadowVisitor } from './meadow';
import { unreadMail } from './messages';
import { visitor } from './friends';
import { hasBackpack, isAway } from './presence';
import { isUnlocked, type UnlockId } from './unlocks';
import type { GameState, Pet } from './state';

export interface MapAreaDef {
  id: string;
  name?: string;
  opens: string;
  unlock?: UnlockId;
  lockedText?: string;
  soonText?: string;
}
export interface MapDef {
  title: string;
  back?: string;
  areas: MapAreaDef[];
}
export const MAPS = data.maps as Record<string, MapDef>;
export const START_MAP = data.start;

// What an area's button does.
export type Opens =
  | { kind: 'home' | 'garden' | 'meadow' | 'friends' | 'soon' }
  | { kind: 'map'; map: string }
  | { kind: 'journey'; place: string };

export function parseOpens(opens: string): Opens | null {
  if (['home', 'garden', 'meadow', 'friends', 'soon'].includes(opens)) return { kind: opens as 'home' };
  const [kind, id] = opens.split(':');
  if (kind === 'map' && MAPS[id]) return { kind: 'map', map: id };
  if (kind === 'journey' && PLACES.some((p) => p.id === id)) return { kind: 'journey', place: id };
  return null;
}

export const placeName = (id: string) => STRINGS.journeys.places[id] ?? id;

export function areaName(area: MapAreaDef): string {
  if (area.name) return area.name;
  const o = parseOpens(area.opens);
  return o?.kind === 'journey' ? placeName(o.place) : area.id;
}

// What the card under the map says about an area.
export interface AreaCard {
  id: string;
  name: string;
  text: string;
  good: boolean; // something nice to do there: green text
  dot: boolean; // a red dot on its sign
  locked: boolean; // under clouds, or not open yet
  button: string;
  enabled: boolean;
}

function homeLeft(ms: number): string {
  const h = Math.floor(ms / 3_600_000);
  const m = Math.max(1, Math.ceil((ms % 3_600_000) / 60_000));
  return h > 0 ? `${h}h ${m}m` : `${m}m`;
}

// The pet the map is about: the one you're looking after.
const petOf = (state: GameState): Pet => state.pet;

export function areaCard(state: GameState, now: number, area: MapAreaDef): AreaCard {
  const S = STRINGS.map;
  const name = areaName(area);
  const opens = parseOpens(area.opens);
  const pet = petOf(state);
  const card = (text: string, button: string, extra: Partial<AreaCard> = {}): AreaCard =>
    ({ id: area.id, name, text, good: false, dot: false, locked: false, button, enabled: true, ...extra });
  const locked = (text: string) => card(text, S.locked, { locked: true, enabled: false });

  if (!opens || opens.kind === 'soon') return card(area.soonText ?? S.soonText, S.soon, { locked: true, enabled: false });
  if (area.unlock && !isUnlocked(state, area.unlock)) return locked(area.lockedText ?? S.lockedText);

  switch (opens.kind) {
    case 'home':
      return card(isAway(pet) && pet.trip ? S.homeAway(pet.name || S.yourPet, placeName(pet.trip.place)) : S.homeAt(pet.name || (pet.stage === 'egg' ? S.yourEgg : S.yourPet)), S.goHome);
    case 'garden': {
      const stages = state.garden.map(plotStage);
      const ready = stages.filter((s) => s === 'ready').length;
      if (needsTending(state.garden, now)) return card(S.gardenNeeds, S.go, { good: true, dot: true });
      if (ready > 0) return card(S.gardenReady(ready), S.go, { good: true, dot: true });
      return card(stages.every((s) => s === 'empty') ? S.gardenEmpty : S.gardenGrowing, S.go);
    }
    case 'meadow': {
      const v = meadowVisitor(state);
      if (v) return card(S.meadowVisitor(v.pet.name), S.visit, { good: true, dot: true });
      const n = state.meadow.length;
      return card(n ? S.meadowPets(n) : S.meadowEmpty, S.visit);
    }
    case 'friends': {
      const over = visitor(state);
      if (over) return card(S.friendOver(over.name), S.visit, { good: true, dot: true });
      const mail = unreadMail(state);
      if (mail > 0) return card(S.friendMail(mail), S.visit, { good: true, dot: true });
      return card(S.friendsQuiet, S.visit);
    }
    case 'map': {
      if (opens.map === START_MAP) return card(S.homeIsland, S.sailHome);
      if (hasBackpack(pet)) return card(S.shipBackpack(pet.name), S.setSail, { good: true, dot: true });
      if (pet.trip) return card(S.shipSailing(pet.name, placeName(pet.trip.place)), S.setSail);
      return card(S.shipReady, S.setSail);
    }
    case 'journey': {
      const place = PLACES.find((p) => p.id === opens.place)!;
      if (!placeOpen(state, place)) return locked(STRINGS.dig.locked[place.opens] ?? S.lockedText);
      if (pet.trip?.place === place.id && isAway(pet)) return card(S.placeHere(pet.name, homeLeft(pet.trip.endsAt - now)), S.planTrip, { good: true });
      const trips = state.journeys.journal[place.id]?.trips ?? 0;
      const level = STRINGS.journeys.levels[placeLevel(trips)] || STRINGS.journeys.levels[1];
      return card(S.placeTrips(level, trips), S.planTrip);
    }
  }
  return card('', S.go);
}

// Which area is picked when a map opens: the first that needs you, then
// where the pet is, then the first one.
export function firstPick(state: GameState, now: number, mapId: string): string {
  const areas = MAPS[mapId].areas;
  const needy = areas.find((a) => areaCard(state, now, a).dot);
  if (needy) return needy.id;
  const here = petAt(state, now, mapId);
  if (here) return here.area;
  return areas[0].id;
}

// Where the pet is on a map: an area, and on the sea how far along the way
// to it (0 at the dock, 1 there). Null if it isn't on this map.
export function petAt(state: GameState, now: number, mapId: string): { area: string; share: number } | null {
  const pet = petOf(state);
  const areas = MAPS[mapId].areas;
  if (pet.trip && isAway(pet)) {
    const there = areas.find((a) => a.opens === `journey:${pet.trip!.place}`);
    if (!there) return null;
    const t = pet.trip;
    // It sails out in the first part of the trip and back in the last.
    const share = Math.min(1, Math.max(0, (now - t.startedAt) / Math.max(1, t.endsAt - t.startedAt)));
    const out = CONFIG.map.sailShare;
    const along = share < out ? share / out : share > 1 - out ? (1 - share) / out : 1;
    return { area: there.id, share: along };
  }
  const home = areas.find((a) => a.opens === 'home');
  return home ? { area: home.id, share: 1 } : null;
}

// Whether the ship is out (so it isn't drawn at the dock).
export const shipOut = (state: GameState) => !!petOf(state).trip && isAway(petOf(state));

// Areas locked right now that have a cloud cover in the art.
export function lockedAreas(state: GameState, now: number, mapId: string): string[] {
  return MAPS[mapId].areas.filter((a) => areaCard(state, now, a).locked).map((a) => a.id);
}
