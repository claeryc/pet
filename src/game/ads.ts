// Rewarded ads: the rules (what each ad gives and how many a day). Showing
// the ad itself is src/ads.ts. Ads are only ever watched when the player
// taps to watch one: the first ad of a day is the daily treat (star
// fragments and gold), then up to `extra.perDay` more give gold only.
// Nothing carries over: a day you skip is just a day without a treat.
// There are no ads at all while a pet is sick or has passed away, so an ad
// is never offered as a way out of trouble.

import { CONFIG } from './config';
import { earn, localDay } from './economy';
import { addFragments } from './fragments';
import { allPets } from './friends';
import type { GameState } from './state';

const A = CONFIG.ads;

export type AdKind = 'treat' | 'extra';

export interface AdReward {
  kind: AdKind;
  fragments: number;
  gold: number;
}

// Ads that gave their reward today.
export function adsWatchedToday(state: GameState, now: number): number {
  return state.ads.day === localDay(now) ? state.ads.watched : 0;
}

// Ads can be offered at all: not while any pet is sick or passed away.
export function adsAllowed(state: GameState): boolean {
  return !allPets(state).some((p) => p.condition === 'sick' || p.condition === 'passed');
}

// The ad on offer now: the daily treat, an extra, or none (all used up).
export function nextAd(state: GameState, now: number): AdKind | null {
  const watched = adsWatchedToday(state, now);
  if (watched === 0) return 'treat';
  return watched <= A.extra.perDay ? 'extra' : null;
}

// Extra ads still to come today (not counting a treat not yet watched).
export function extrasLeft(state: GameState, now: number): number {
  const watched = adsWatchedToday(state, now);
  return watched === 0 ? A.extra.perDay : Math.max(0, A.extra.perDay - (watched - 1));
}

export function rewardOf(kind: AdKind): AdReward {
  return kind === 'treat'
    ? { kind, fragments: A.treat.fragments, gold: A.treat.gold }
    : { kind, fragments: 0, gold: A.extra.gold };
}

// Gives the reward for an ad that was watched to the end. Call it only
// once the ad network says the reward was earned.
export function claimAd(state: GameState, now: number): { state: GameState; reward?: AdReward; blocked?: 'capped' | 'notNow' } {
  if (!adsAllowed(state)) return { state, blocked: 'notNow' };
  const kind = nextAd(state, now);
  if (!kind) return { state, blocked: 'capped' };
  const reward = rewardOf(kind);
  const s = addFragments(earn(state, reward.gold), reward.fragments);
  return {
    state: { ...s, ads: { day: localDay(now), watched: adsWatchedToday(state, now) + 1 } },
    reward,
  };
}
