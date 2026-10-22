// Regulars: characters who aren't pets but keep coming back. Percy is the
// first. Filling his orders raises his hearts (a score from 0 to 100, shown
// as 5 hearts like a friend's), and each new heart brings a reward: a seed,
// a journey bag or a wallpaper to keep, or better numbers for his orders and
// journeys from then on. The rewards are in CONFIG.regulars.
//
// Hearts are a reputation, not a currency: nothing is spent. A pickup with
// no full box costs a point, but never a heart you've already reached.

import { CONFIG } from './config';
import { addSeed, type CropId } from './garden';
import { logMessage } from './messages';
import type { GameState, OrderTier, Regular } from './state';

const R = CONFIG.regulars;
const HEART = CONFIG.friends.heartPoints;
const MAX = HEART * 5;

export type RegularId = keyof typeof R;
export const REGULARS = Object.keys(R) as RegularId[];

// One heart's reward. Seeds, bags and wallpapers are given once; the
// numbers (`payShare` and so on) apply from that heart onwards.
export interface Reward {
  seed?: CropId;
  bag?: string; // a journey bag (only for show, see src/render/bags.ts)
  wallpaper?: string;
  payShare?: number;
  seedChance?: number;
  seedOdds?: Partial<Record<CropId, number>>;
  restHours?: number;
}

export const rewards = (id: RegularId) => R[id].rewards as readonly Reward[];

export function getRegular(state: GameState, id: RegularId): Regular {
  return state.regulars?.[id] ?? { score: 0, hearts: 0 };
}

// Whole hearts the score has reached (0 to 5).
export const wholeHearts = (score: number) => Math.floor(score / HEART);

// Points for a pickup, by its frame.
export const pickupPoints = (tier: OrderTier) => R.percy.gain[tier];

// Changes a regular's score by `points` (never below the last whole heart
// reached, never above 100), then hands over any new heart's reward.
export function addRegular(state: GameState, id: RegularId, points: number, at: number): GameState {
  const r = getRegular(state, id);
  const floor = wholeHearts(r.score) * HEART;
  const score = Math.min(MAX, Math.max(floor, r.score + points));
  const s = { ...state, regulars: { ...state.regulars, [id]: { ...r, score } } };
  return rewardHearts(s, id, at);
}

// Gives the reward of every heart reached but not rewarded yet, each with
// a message. Also used once for saves that start partway (see storage.ts).
function rewardHearts(state: GameState, id: RegularId, at: number): GameState {
  let s = state;
  const r = getRegular(s, id);
  for (let h = r.hearts + 1; h <= wholeHearts(r.score); h++) {
    s = give(s, rewards(id)[h - 1] ?? {});
    s = { ...s, regulars: { ...s.regulars, [id]: { ...getRegular(s, id), hearts: h } } };
    s = logMessage(s, { kind: 'regular', at, id, hearts: h });
  }
  return s;
}

export function catchUpRegulars(state: GameState, at: number): GameState {
  let s = state;
  for (const id of REGULARS) if (s.regulars?.[id]) s = rewardHearts(s, id, at);
  return s;
}

function give(state: GameState, reward: Reward): GameState {
  let s = state;
  if (reward.seed) s = addSeed(s, reward.seed);
  if (reward.bag && !(s.inventory.bags ?? []).includes(reward.bag)) {
    s = { ...s, inventory: { ...s.inventory, bags: [...(s.inventory.bags ?? []), reward.bag] } };
  }
  // Stored like a bought one (see decorKey in decor.ts).
  const key = reward.wallpaper && `wallpaper:${reward.wallpaper}`;
  if (key && !s.inventory.decor.includes(key)) {
    s = { ...s, inventory: { ...s.inventory, decor: [...s.inventory.decor, key] } };
  }
  return s;
}

// Percy's numbers right now: the config's, changed by every heart reached.
export interface PercyPerks {
  payShare: number;
  seedChance: number;
  seedOdds: Partial<Record<CropId, number>>;
  restHours: number;
}

export function percyPerks(state: GameState): PercyPerks {
  const perks: PercyPerks = {
    payShare: CONFIG.delivery.payShare,
    seedChance: CONFIG.delivery.seedChance,
    seedOdds: CONFIG.delivery.seedOdds,
    restHours: CONFIG.journeys.percy.restHours,
  };
  for (const reward of rewards('percy').slice(0, getRegular(state, 'percy').hearts)) {
    perks.payShare = reward.payShare ?? perks.payShare;
    perks.seedChance = reward.seedChance ?? perks.seedChance;
    perks.seedOdds = reward.seedOdds ?? perks.seedOdds;
    perks.restHours = reward.restHours ?? perks.restHours;
  }
  return perks;
}

// Who gives a wallpaper that isn't sold, and at which heart.
export function earnedFrom(kind: 'wallpaper', item: string): { id: RegularId; hearts: number } | null {
  for (const id of REGULARS) {
    const i = rewards(id).findIndex((r) => r[kind] === item);
    if (i >= 0) return { id, hearts: i + 1 };
  }
  return null;
}

// Saves from before regulars: points for the orders already filled.
export function backfillRegulars(deliveries: number): Record<string, Regular> {
  const { perOrder, max } = R.percy.backfill;
  return { percy: { score: Math.min(max, deliveries * perOrder), hearts: 0 } };
}
