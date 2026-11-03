// Showing rewarded ads. This is only a stand-in, like src/payments.ts:
// there's no ad network yet, so `standInAds` plays a pretend ad (see
// src/ui/adPlayer.ts) and the player always earns the reward for sitting
// through it. The rules (what an ad gives, how many a day) are in
// src/game/ads.ts and don't change when a real network is plugged in.
//
// To use AdMob once the game is wrapped with Capacitor, write an
// AdProvider with the AdMob plugin (e.g. @capacitor-community/admob) and
// pass it to `useAdProvider` at start-up:
// - gatherConsent: ask Google's UMP for the consent status and show its
//   form when it's required (EU/UK players), before the first ad. Resolve
//   `canRequestAds` and whether personalised ads were agreed to.
// - showRewarded: load and show a rewarded ad with the request's settings
//   (non-personalised ads when `personalised` is false, and the
//   under-age-of-consent tag when `underAgeOfConsent` is true). Resolve
//   'rewarded' only once AdMob's reward event fires, never just because
//   the ad closed.
// Everything else (the Shop's ad card, giving the reward) stays the same.

// How old the player said they are. There's no age question yet, so it's
// 'unknown', which is treated like under 16.
export type AgeBand = 'unknown' | 'under16' | 'adult';

// What the consent form (Google's UMP in the EU) said.
export interface Consent {
  canRequestAds: boolean; // false: no ads may be shown at all
  personalised: boolean; // agreed to personalised ads
}

// How an ad is asked for.
export interface AdRequest {
  personalised: boolean;
  underAgeOfConsent: boolean; // tells the network to treat the player as a minor
}

export type AdOutcome = 'rewarded' | 'closed' | 'unavailable';

export interface AdProvider {
  gatherConsent: () => Promise<Consent>;
  showRewarded: (request: AdRequest) => Promise<AdOutcome>;
}

// Hook: where the player's age comes from. Swap it for the answer to an
// age question once there is one (see `setAgeSource`).
let ageSource: () => AgeBand = () => 'unknown';
export function setAgeSource(source: () => AgeBand): void {
  ageSource = source;
}

// Hook: the EU age rule. Personalised ads only for players we know are 16
// or over who agreed to them on the consent form; everyone else (under 16,
// or age not asked) gets non-personalised ads, tagged as under age.
export function adRequestFor(consent: Consent, age: AgeBand): AdRequest {
  const adult = age === 'adult';
  return { personalised: adult && consent.personalised, underAgeOfConsent: !adult };
}

let provider: AdProvider | null = null;
let consent: Consent | null = null;

export function useAdProvider(next: AdProvider | null): void {
  provider = next;
  consent = null;
}

export const adsReady = () => provider !== null;

// Shows one rewarded ad, asking for consent first if it hasn't been asked
// yet this session (UMP remembers the answer between sessions itself).
export async function watchRewardedAd(): Promise<AdOutcome> {
  if (!provider) return 'unavailable';
  try {
    consent ??= await provider.gatherConsent();
    if (!consent.canRequestAds) {
      consent = null; // ask again next time, in case they change their mind
      return 'unavailable';
    }
    return await provider.showRewarded(adRequestFor(consent, ageSource()));
  } catch (err) {
    console.warn('Could not show an ad:', err);
    return 'unavailable';
  }
}

// The stand-in: no consent form (it would come from UMP), always
// non-personalised, and `play` shows the pretend ad, resolving true if the
// player watched it to the end.
export function standInAds(play: (request: AdRequest) => Promise<boolean>): AdProvider {
  return {
    gatherConsent: async () => ({ canRequestAds: true, personalised: false }),
    showRewarded: async (request) => ((await play(request)) ? 'rewarded' : 'closed'),
  };
}
