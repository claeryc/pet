import { afterEach, describe, expect, it } from 'vitest';
import { newTeen } from './helpers';
import { CONFIG } from '../src/game/config';
import { adsAllowed, adsWatchedToday, claimAd, extrasLeft, nextAd } from '../src/game/ads';
import { adRequestFor, setAgeSource, standInAds, useAdProvider, watchRewardedAd, type AdProvider, type AdRequest } from '../src/ads';
import type { GameState } from '../src/game/state';

const DAY = 24 * 3_600_000;
const NOW = new Date(2026, 10, 3, 10, 0).getTime();
const { treat, extra } = CONFIG.ads;

// Watches `n` ads in a row at `now`, keeping what each one gave.
function watch(s: GameState, n: number, now = NOW) {
  const rewards = [];
  for (let i = 0; i < n; i++) {
    const r = claimAd(s, now);
    s = r.state;
    rewards.push(r);
  }
  return { state: s, rewards };
}

describe('rewarded ads: rewards and daily caps', () => {
  it('the first ad of the day is the treat: star fragments and gold', () => {
    const s = newTeen(NOW);
    expect(nextAd(s, NOW)).toBe('treat');
    const r = claimAd(s, NOW);
    expect(r.reward).toEqual({ kind: 'treat', fragments: treat.fragments, gold: treat.gold });
    expect(r.state.fragments.pieces).toBe(s.fragments.pieces + treat.fragments);
    expect(r.state.gold).toBe(s.gold + treat.gold);
  });

  it('then up to the extra cap give gold only, and after that nothing', () => {
    const s = newTeen(NOW);
    const { state, rewards } = watch(s, 1 + extra.perDay + 1);
    for (const r of rewards.slice(1, 1 + extra.perDay)) expect(r.reward).toEqual({ kind: 'extra', fragments: 0, gold: extra.gold });
    expect(rewards.at(-1)!.blocked).toBe('capped');
    expect(nextAd(state, NOW)).toBeNull();
    expect(extrasLeft(state, NOW)).toBe(0);
    expect(state.fragments.pieces).toBe(s.fragments.pieces + treat.fragments);
    expect(state.gold).toBe(s.gold + treat.gold + extra.perDay * extra.gold);
  });

  it('counts down the extras left', () => {
    const s = newTeen(NOW);
    expect(extrasLeft(s, NOW)).toBe(extra.perDay);
    expect(extrasLeft(watch(s, 1).state, NOW)).toBe(extra.perDay);
    expect(extrasLeft(watch(s, 2).state, NOW)).toBe(extra.perDay - 1);
  });

  it('a new day brings a new treat', () => {
    const { state } = watch(newTeen(NOW), 1 + extra.perDay);
    expect(nextAd(state, NOW)).toBeNull();
    expect(adsWatchedToday(state, NOW + DAY)).toBe(0);
    expect(nextAd(state, NOW + DAY)).toBe('treat');
    expect(claimAd(state, NOW + DAY).reward?.kind).toBe('treat');
  });

  it('a month of every ad gives at most 60 fragments', () => {
    let s = newTeen(NOW);
    const start = s.fragments.pieces;
    for (let d = 0; d < 30; d++) s = watch(s, 10, NOW + d * DAY).state;
    expect(s.fragments.pieces - start).toBe(30 * treat.fragments);
    expect(treat.fragments * 30).toBeLessThanOrEqual(60);
  });

  it('no ads while a pet is sick or has passed away', () => {
    for (const condition of ['sick', 'passed'] as const) {
      const s = newTeen(NOW);
      s.housemates = [{ ...newTeen(NOW).pet, id: 'other', condition }];
      expect(adsAllowed(s)).toBe(false);
      const r = claimAd(s, NOW);
      expect(r.blocked).toBe('notNow');
      expect(r.state).toBe(s);
    }
    const warned = newTeen(NOW);
    warned.pet.condition = 'warning';
    expect(adsAllowed(warned)).toBe(true);
  });
});

describe('rewarded ads: consent and age', () => {
  afterEach(() => {
    useAdProvider(null);
    setAgeSource(() => 'unknown');
  });

  it('only known adults who agreed get personalised ads', () => {
    const yes = { canRequestAds: true, personalised: true };
    const no = { canRequestAds: true, personalised: false };
    expect(adRequestFor(yes, 'adult')).toEqual({ personalised: true, underAgeOfConsent: false });
    expect(adRequestFor(no, 'adult')).toEqual({ personalised: false, underAgeOfConsent: false });
    expect(adRequestFor(yes, 'under16')).toEqual({ personalised: false, underAgeOfConsent: true });
    expect(adRequestFor(yes, 'unknown')).toEqual({ personalised: false, underAgeOfConsent: true });
  });

  it('asks for consent once, before the first ad', async () => {
    let asked = 0;
    const requests: AdRequest[] = [];
    const provider: AdProvider = {
      gatherConsent: async () => (asked++, { canRequestAds: true, personalised: true }),
      showRewarded: async (req) => (requests.push(req), 'rewarded'),
    };
    useAdProvider(provider);
    setAgeSource(() => 'adult');
    expect(await watchRewardedAd()).toBe('rewarded');
    expect(await watchRewardedAd()).toBe('rewarded');
    expect(asked).toBe(1);
    expect(requests[0]).toEqual({ personalised: true, underAgeOfConsent: false });
  });

  it('shows no ad without consent to ads at all', async () => {
    let shown = 0;
    useAdProvider({
      gatherConsent: async () => ({ canRequestAds: false, personalised: false }),
      showRewarded: async () => (shown++, 'rewarded'),
    });
    expect(await watchRewardedAd()).toBe('unavailable');
    expect(shown).toBe(0);
  });

  it('no provider, or one that fails, means no ad', async () => {
    expect(await watchRewardedAd()).toBe('unavailable');
    useAdProvider({
      gatherConsent: async () => ({ canRequestAds: true, personalised: false }),
      showRewarded: async () => { throw new Error('no fill'); },
    });
    expect(await watchRewardedAd()).toBe('unavailable');
  });

  it('the stand-in rewards only an ad watched to the end, never personalised', async () => {
    const seen: AdRequest[] = [];
    let finish = true;
    useAdProvider(standInAds(async (req) => (seen.push(req), finish)));
    expect(await watchRewardedAd()).toBe('rewarded');
    finish = false;
    expect(await watchRewardedAd()).toBe('closed');
    expect(seen[0]).toEqual({ personalised: false, underAgeOfConsent: true });
  });
});
