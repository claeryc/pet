// The Skills page inside the gear menu: your Keeper level and XP at the
// top, then the four skill trees (Fishing, Garden, Kitchen, Care). Each tree
// folds up into a grid of its skills' pictures, like the Shop; unfolded,
// each skill shows its rank, what it does and a Learn button. A tree with
// points in it has a row at the end to take them back (for gold). The
// rules live in src/game/skills.ts.

import { STRINGS } from '../strings';
import { CONFIG } from '../game/config';
import type { GameState } from '../game/state';
import {
  MAX_RANK, TREES, levelInfo, nextCost, pointsInTree, pointsToSpend, rankOf, resetCost, skillsIn,
  type SkillId, type TreeId,
} from '../game/skills';
import { category, goldPill, label, row, type Entry } from './shop';
import { SKILL_ICONS, SKILL_POINT_ICON } from './icons';

export interface SkillsCallbacks {
  onLearn: (skill: SkillId) => void;
  onResetTree: (tree: TreeId) => void;
}

// What a skill does at `rank` (1 or more).
export function effectText(skill: SkillId, rank: number): string {
  const E = STRINGS.skills.effects;
  const v = rank * CONFIG.skills.perRank[skill];
  if (skill === 'headStart') return E.headStart(Math.min(0.9, CONFIG.fishing.reel.meterStart + v));
  if (skill === 'chefsNose') return E.chefsNose(rank);
  return E[skill](v);
}

// "[star] 2": a cost in skill points, like the Shop's gold prices.
function pointPill(points: number): HTMLElement {
  const el = document.createElement('span');
  el.className = 'gold-pill';
  el.innerHTML = SKILL_POINT_ICON;
  el.append(String(points));
  return el;
}

// Level, XP bar and points to spend.
function summary(state: GameState): HTMLElement {
  const S = STRINGS.skills;
  const info = levelInfo(state.keeper.xp);
  const points = pointsToSpend(state);
  const el = row(SKILL_POINT_ICON, S.level(info.level), points > 0 ? S.points(points) : S.noPoints,
    label(S.xp(info.into, info.need)));
  el.classList.add('achievement-row', 'skills-summary');
  el.dataset.tier = 'none';
  const bar = document.createElement('span');
  bar.className = 'achievement-bar';
  const fill = document.createElement('span');
  fill.style.width = `${Math.min(100, (info.into / info.need) * 100)}%`;
  bar.append(fill);
  el.querySelector('.shop-row-text')?.append(bar);
  return el;
}

function skillEntry(state: GameState, skill: SkillId, cb: SkillsCallbacks): Entry {
  const S = STRINGS.skills;
  const rank = rankOf(state, skill);
  const cost = nextCost(state, skill);
  // Not learned yet: what rank 1 does. Learned: its rank and what it does now.
  const note = rank > 0 ? `${S.rank(rank, MAX_RANK)} · ${effectText(skill, rank)}` : effectText(skill, 1);
  let action: HTMLElement;
  if (cost === null) {
    action = label(S.maxed);
  } else {
    const b = document.createElement('button');
    b.className = 'shop-btn';
    b.append(pointPill(cost));
    b.setAttribute('aria-label', S.learn(cost));
    b.classList.toggle('too-pricey', pointsToSpend(state) < cost); // still tappable, so it can say why
    b.addEventListener('click', () => cb.onLearn(skill));
    action = b;
  }
  const el = row(SKILL_ICONS[skill] ?? '', S.names[skill], note, action);
  el.classList.add('skill-row');
  return { icon: SKILL_ICONS[skill] ?? '', row: el, faded: rank === 0, count: rank > 0 ? String(rank) : undefined };
}

// "Take points back" at the end of a tree, with its price (free the first time).
function resetRow(state: GameState, tree: TreeId, cb: SkillsCallbacks): HTMLElement {
  const S = STRINGS.skills;
  const cost = resetCost(state, tree);
  const b = document.createElement('button');
  b.className = 'shop-btn shop-btn-soft';
  if (cost > 0) b.append(goldPill(cost));
  else b.textContent = S.resetFree;
  b.classList.toggle('too-pricey', state.gold < cost);
  b.addEventListener('click', () => cb.onResetTree(tree));
  const el = row(SKILL_POINT_ICON, S.reset, S.resetNote(pointsInTree(state, tree)), b);
  el.classList.add('skill-reset');
  return el;
}

export function skillsPage(state: GameState, cb: SkillsCallbacks, open: Set<string>): HTMLElement[] {
  const trees = TREES.map((tree) => {
    const entries = skillsIn(tree).map((id) => skillEntry(state, id, cb));
    const spent = pointsInTree(state, tree);
    const el = category(`skills-${tree}`, STRINGS.collection.count(STRINGS.skills.trees[tree], spent, maxPoints(tree)), entries, open);
    if (spent > 0) el.querySelector('.shop-cat-rows')?.append(resetRow(state, tree, cb));
    return el;
  });
  return [summary(state), ...trees];
}

// Points needed to max every skill in a tree.
function maxPoints(tree: TreeId): number {
  const all = CONFIG.skills.rankCosts.reduce((sum, c) => sum + c, 0);
  return skillsIn(tree).length * all;
}
