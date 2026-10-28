// Snapshots: little moments on a journey. While you look in on a trip (tap
// the note on the wall), the pets sometimes stop for a moment: a butterfly
// flutters round them, Percy hurries by and waves, they sniff a mushroom, a crab scuttles up...
// Snap it, and the picture goes on the place's page in the travel journal.
// Each place has its own set to collect. Every look has a chance of a
// moment, so none can be missed for good: the set fills up over many trips.
// Snapshots are only for keeps (no gold, no finds), so there's no reason
// to sit and watch.

import { CONFIG } from './config';
import type { GameState, JournalPage, Snapshot } from './state';

// Where each moment can happen ('any' place, or these), and when.
const MOMENTS: Record<string, { places: 'any' | readonly string[]; when?: 'day' | 'night' }> = {
  butterfly: { places: 'any', when: 'day' },
  percy: { places: 'any' },
  mushroom: { places: ['woods'] },
  leaf: { places: ['woods'], when: 'day' },
  fireflies: { places: ['woods'], when: 'night' },
  squirrel: { places: ['woods'] },
  crab: { places: ['cove'] },
  shell: { places: ['cove'], when: 'day' },
  jellies: { places: ['cove'], when: 'night' },
};

const at = (id: string, place: string) => {
  const m = MOMENTS[id];
  return m.places === 'any' || m.places.includes(place);
};

// A place's whole set, for its journal page.
export function placeMoments(place: string): string[] {
  return Object.keys(MOMENTS).filter((id) => at(id, place));
}

// The moments that can happen at `place` now.
export function momentsNow(place: string, night: boolean): string[] {
  return placeMoments(place).filter((id) => {
    const when = MOMENTS[id].when;
    return !when || when === (night ? 'night' : 'day');
  });
}

// Which moment happens on a look (`chance` and `pick` are rolls from 0 to
// 1), or none. One that isn't in the journal yet comes up more often.
export function pickMoment(place: string, night: boolean, snapped: readonly string[], chance: number, pick: number): string | null {
  const S = CONFIG.journeys.snapshots;
  const can = momentsNow(place, night);
  if (!can.length || chance >= S.chance) return null;
  const fresh = can.filter((id) => !snapped.includes(id));
  const from = fresh.length && pick < S.freshShare ? fresh : can;
  const i = Math.floor((fresh.length && pick < S.freshShare ? pick / S.freshShare : pick) * from.length);
  return from[Math.min(from.length - 1, i)];
}

// The ids of the snapshots on a place's journal page.
export function snappedAt(state: GameState, place: string): string[] {
  return (state.journeys.journal[place]?.snaps ?? []).map((s) => s.moment);
}

// Puts a snapshot on the place's journal page (a newer one of the same
// moment replaces the old one). `isNew` if that moment wasn't there yet.
export function takeSnapshot(state: GameState, place: string, snap: Snapshot): { state: GameState; isNew: boolean } {
  const page: JournalPage = state.journeys.journal[place] ?? { trips: 0, postcards: [], found: [] };
  const snaps = page.snaps ?? [];
  const isNew = !snaps.some((s) => s.moment === snap.moment);
  const next: JournalPage = { ...page, snaps: [...snaps.filter((s) => s.moment !== snap.moment), snap] };
  return { state: { ...state, journeys: { ...state.journeys, journal: { ...state.journeys.journal, [place]: next } } }, isNew };
}
