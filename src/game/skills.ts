// Skills: progress that stays with you, the keeper, from pet to pet. Doing
// things (fishing, harvesting, cooking, Percy's orders, pets growing up,
// badges) earns Keeper XP. Each new Keeper level gives one skill point,
// and points are spent on skills in four trees: Fishing, Garden, Kitchen
// and Care. Each skill has three ranks, costing 1, 2 and 3 points. A tree
// is climbed in order: a skill opens once the one before it has rank 1.
//
// Points can be taken back a tree at a time, for gold (the first time is
// free), so a different mix can be tried.
//
// The numbers live in CONFIG.skills. This file only works them out; the
// rules of each game (fishing.ts, garden.ts and so on) ask it how strong a
// skill is.

import { CONFIG } from './config';
import { logMessage } from './messages';
import type { GameState, Pet } from './state';

const K = CONFIG.skills;

export type TreeId = keyof typeof K.trees;
export type SkillId = keyof typeof K.perRank;

export const TREES = Object.keys(K.trees) as TreeId[];
export const MAX_RANK = K.rankCosts.length;

export function skillsIn(tree: TreeId): readonly SkillId[] {
  return K.trees[tree] as readonly SkillId[];
}

export function treeOf(skill: SkillId): TreeId {
  return TREES.find((t) => skillsIn(t).includes(skill))!;
}

// ---- XP and levels ----

// XP needed to go from `level` to the next one.
export function xpToNext(level: number): number {
  return K.level.base + K.level.perLevel * level;
}

// The level reached with this much XP (everyone starts at level 1), and
// how far along the next level is.
export function levelInfo(xp: number): { level: number; into: number; need: number } {
  let level = 1;
  let left = Math.max(0, xp);
  while (left >= xpToNext(level)) {
    left -= xpToNext(level);
    level++;
  }
  return { level, into: left, need: xpToNext(level) };
}

export function keeperLevel(state: GameState): number {
  return levelInfo(state.keeper.xp).level;
}

export function addXp(state: GameState, xp: number): GameState {
  if (xp <= 0) return state;
  return { ...state, keeper: { ...state.keeper, xp: state.keeper.xp + xp } };
}

// XP for a pet growing up, by its stars.
export function grownUpXp(stars: number): number {
  return K.grownUpXp[Math.min(3, Math.max(1, stars)) as 1 | 2 | 3];
}

// Says so in Messages when a new level is reached. Returns the levels
// reached since the last time, so the game can celebrate them.
export function updateLevel(state: GameState): { state: GameState; levels: number[] } {
  const level = keeperLevel(state);
  if (level <= state.keeper.level) return { state, levels: [] };
  const levels: number[] = [];
  let s: GameState = { ...state, keeper: { ...state.keeper, level } };
  for (let l = state.keeper.level + 1; l <= level; l++) {
    levels.push(l);
    s = logMessage(s, { kind: 'level', at: s.lastUpdated, level: l });
  }
  return { state: s, levels };
}

// ---- Points and ranks ----

export function rankOf(state: GameState, skill: SkillId): number {
  return state.keeper.skills[skill] ?? 0;
}

// What the next rank of a skill costs (null once it's maxed).
export function nextCost(state: GameState, skill: SkillId): number | null {
  const rank = rankOf(state, skill);
  return rank < MAX_RANK ? K.rankCosts[rank] : null;
}

// Points spent to reach `rank` in one skill.
function spentOn(rank: number): number {
  return K.rankCosts.slice(0, rank).reduce((sum, c) => sum + c, 0);
}

export function pointsInTree(state: GameState, tree: TreeId): number {
  return skillsIn(tree).reduce((sum, id) => sum + spentOn(rankOf(state, id)), 0);
}

// Points earned so far (one per level after the first) and not spent yet.
export function pointsToSpend(state: GameState): number {
  const spent = TREES.reduce((sum, t) => sum + pointsInTree(state, t), 0);
  return keeperLevel(state) - 1 - spent;
}

// The skill before this one in its tree (null for the first).
export function skillBefore(skill: SkillId): SkillId | null {
  const list = skillsIn(treeOf(skill));
  const i = list.indexOf(skill);
  return i > 0 ? list[i - 1] : null;
}

// True once a skill can be learned: the first in each tree always can, the
// others once the one before has rank 1.
export function isOpen(state: GameState, skill: SkillId): boolean {
  const before = skillBefore(skill);
  return before === null || rankOf(state, before) > 0;
}

export type SkillBlock = 'locked' | 'maxed' | 'noPoints';

export function learn(state: GameState, skill: SkillId): { state: GameState; blocked?: SkillBlock } {
  if (!isOpen(state, skill)) return { state, blocked: 'locked' };
  const cost = nextCost(state, skill);
  if (cost === null) return { state, blocked: 'maxed' };
  if (pointsToSpend(state) < cost) return { state, blocked: 'noPoints' };
  const skills = { ...state.keeper.skills, [skill]: rankOf(state, skill) + 1 };
  return { state: { ...state, keeper: { ...state.keeper, skills } } };
}

// What taking a tree's points back costs right now (the first time is free).
export function resetCost(state: GameState, tree: TreeId): number {
  return state.keeper.resets > 0 ? pointsInTree(state, tree) * K.resetGoldPerPoint : 0;
}

export type ResetBlock = 'nothingToReset' | 'notEnoughGold';

// Takes back every point in one tree.
export function resetTree(state: GameState, tree: TreeId): { state: GameState; blocked?: ResetBlock; refunded?: number } {
  const refunded = pointsInTree(state, tree);
  if (refunded === 0) return { state, blocked: 'nothingToReset' };
  const cost = resetCost(state, tree);
  if (state.gold < cost) return { state, blocked: 'notEnoughGold' };
  const skills = { ...state.keeper.skills };
  for (const id of skillsIn(tree)) delete skills[id];
  return {
    state: { ...state, gold: state.gold - cost, keeper: { ...state.keeper, skills, resets: state.keeper.resets + 1 } },
    refunded,
  };
}

// ---- What the skills do ----

// How strong a skill is: its rank times what one rank does.
export function perk(state: GameState, skill: SkillId): number {
  return rankOf(state, skill) * K.perRank[skill];
}

// The fishing skills, handed to the reel when it starts.
export interface ReelPerks {
  widen: number; // the green stripe's width is multiplied by this
  meterStart: number; // the catch meter starts this full
}

// A food's steadyPaws effect (see CONFIG.foods) widens it a little more.
export function reelPerks(state: GameState): ReelPerks {
  const food = state.pet.buffs.find((b) => b.stat === 'fishing')?.percent ?? 0;
  return {
    widen: 1 + perk(state, 'steadyHands') + food / 100,
    meterStart: Math.min(0.9, CONFIG.fishing.reel.meterStart + perk(state, 'headStart')),
  };
}

// The garden skills, used while plants grow.
export interface GardenPerks {
  speed: number; // growing speed is multiplied by this
  sick: number; // the chance of getting sick is multiplied by this
}

export function gardenPerks(state: GameState): GardenPerks {
  return {
    speed: 1 + perk(state, 'quickSprouts'),
    sick: Math.max(0, 1 - perk(state, 'hardyPlants')),
  };
}

// The care skills, used by the simulation on every pet.
export interface CarePerks {
  decay: number; // hunger and joy drop this much as fast
  careGain: number; // the Care Score rises this much as fast
}

export function carePerks(state: GameState): CarePerks {
  return {
    decay: Math.max(0, 1 - perk(state, 'cozyHome')),
    careGain: 1 + perk(state, 'goodHabits'),
  };
}

export const NO_CARE_PERKS: CarePerks = { decay: 1, careGain: 1 };

// A new egg's Care Score, raised by Gentle start.
export function startingCare(state: GameState): number {
  return Math.min(100, CONFIG.careScore.start + perk(state, 'gentleStart'));
}

// How many ingredients of a recipe you haven't found yet are shown in the
// recipe book (the first always is), and whether its name shows too.
export function recipeHints(state: GameState): { ingredients: number; name: boolean } {
  const rank = rankOf(state, 'chefsNose');
  return { ingredients: 1 + rank, name: rank >= MAX_RANK };
}

// Gives XP once for each pet that has grown up (and remembers it, so it
// isn't counted twice).
export function creditGrownUps(state: GameState, pets: Pet[], starsOf: (pet: Pet) => number): GameState {
  let s = state;
  for (const pet of pets) {
    if (pet.stage !== 'adult' || s.keeper.grownUp.includes(pet.id)) continue;
    s = addXp(s, grownUpXp(starsOf(pet)));
    s = { ...s, keeper: { ...s.keeper, grownUp: [...s.keeper.grownUp, pet.id] } };
  }
  return s;
}
