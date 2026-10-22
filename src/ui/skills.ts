// The Skills page inside the gear menu: your Keeper level and XP at the
// top, then tabs for the four skill trees (Fishing, Garden, Kitchen, Care).
// A tree is drawn as a path of nodes from left to right, joined by lines
// (it fits a phone better than top to bottom, and leaves room for the
// card): each skill opens once the one before has rank 1, so the line into
// a node fills in when it opens. Tapping a node shows its card under the
// tree,
// with what it does now, what the next rank does and a Learn button. A
// tree with points in it has a row at the end to take them back (for
// gold). The rules live in src/game/skills.ts.

import { STRINGS } from '../strings';
import { CONFIG } from '../game/config';
import type { GameState } from '../game/state';
import {
  MAX_RANK, TREES, isOpen, levelInfo, nextCost, pointsInTree, pointsToSpend, rankOf, resetCost, skillBefore, skillsIn,
  type SkillId, type TreeId,
} from '../game/skills';
import { goldPill, label, row } from './shop';
import { LOCK_ICON, SKILL_ICONS, SKILL_POINT_ICON } from './icons';

export interface SkillsCallbacks {
  onLearn: (skill: SkillId) => void;
  onResetTree: (tree: TreeId) => void;
}

// Which tree's tab is showing and which skill's card is open. Kept by the
// menu, so it stays while the page redraws after learning something.
export interface SkillsView {
  tree: TreeId;
  skill: SkillId | null;
}

// What a skill does at `rank` (1 or more).
export function effectText(skill: SkillId, rank: number): string {
  const E = STRINGS.skills.effects;
  const v = rank * CONFIG.skills.perRank[skill];
  if (skill === 'headStart') return E.headStart(Math.min(0.9, CONFIG.fishing.reel.meterStart + v));
  if (skill === 'chefsNose') return E.chefsNose(rank);
  return E[skill](v);
}

function el<K extends keyof HTMLElementTagNameMap>(tag: K, className: string, text?: string): HTMLElementTagNameMap[K] {
  const e = document.createElement(tag);
  e.className = className;
  if (text !== undefined) e.textContent = text;
  return e;
}

// "[star] 2": a cost in skill points, like the Shop's gold prices.
function pointPill(points: number): HTMLElement {
  const pill = el('span', 'gold-pill');
  pill.innerHTML = SKILL_POINT_ICON;
  pill.append(String(points));
  return pill;
}

// Level, XP bar and points to spend.
function summary(state: GameState): HTMLElement {
  const S = STRINGS.skills;
  const info = levelInfo(state.keeper.xp);
  const points = pointsToSpend(state);
  const card = row(SKILL_POINT_ICON, S.level(info.level), points > 0 ? S.points(points) : S.noPoints,
    label(S.xp(info.into, info.need)));
  card.classList.add('achievement-row', 'skills-summary');
  card.dataset.tier = 'none';
  const bar = el('span', 'achievement-bar');
  const fill = el('span', '');
  fill.style.width = `${Math.min(100, (info.into / info.need) * 100)}%`;
  bar.append(fill);
  card.querySelector('.shop-row-text')?.append(bar);
  return card;
}

// True if something in this tree can be learned right now.
export function canLearnIn(state: GameState, tree: TreeId): boolean {
  return skillsIn(tree).some((id) => {
    const cost = nextCost(state, id);
    return isOpen(state, id) && cost !== null && pointsToSpend(state) >= cost;
  });
}

// [ Fishing | Garden | Kitchen | Care ]
function tabs(view: SkillsView, redraw: () => void): HTMLElement {
  const sw = el('div', 'tree-switch skill-tabs');
  sw.setAttribute('role', 'group');
  sw.setAttribute('aria-label', STRINGS.skills.title);
  for (const tree of TREES) {
    const b = el('button', 'tree-switch-btn', STRINGS.skills.trees[tree]);
    b.setAttribute('aria-pressed', String(view.tree === tree));
    b.addEventListener('click', () => {
      if (view.tree === tree) return;
      view.tree = tree;
      view.skill = null;
      redraw();
      showPickedSkill(false);
    });
    sw.append(b);
  }
  return sw;
}

// What a node looks like: locked, open (not learned), learned or maxed.
function nodeState(state: GameState, skill: SkillId): 'locked' | 'open' | 'learned' | 'maxed' {
  if (!isOpen(state, skill)) return 'locked';
  const rank = rankOf(state, skill);
  return rank >= MAX_RANK ? 'maxed' : rank > 0 ? 'learned' : 'open';
}

// The tree: each skill a node, with a line on to the next one.
function treePath(state: GameState, view: SkillsView, redraw: () => void): HTMLElement {
  const path = el('div', 'skill-tree');
  skillsIn(view.tree).forEach((skill, i) => {
    if (i > 0) {
      const line = el('span', 'skill-line');
      line.dataset.lit = String(isOpen(state, skill));
      path.append(line);
    }
    const look = nodeState(state, skill);
    const node = el('button', 'skill-node');
    node.dataset.state = look;
    node.setAttribute('aria-pressed', String(view.skill === skill));
    const rank = rankOf(state, skill);
    const icon = el('span', 'skill-node-icon');
    icon.innerHTML = SKILL_ICONS[skill] ?? '';
    if (look === 'locked') {
      const lock = el('span', 'skill-node-lock');
      lock.innerHTML = LOCK_ICON;
      icon.append(lock);
    } else {
      icon.append(el('span', 'skill-node-rank', `${rank}/${MAX_RANK}`));
    }
    const name = el('span', 'skill-node-name', STRINGS.skills.names[skill]);
    node.append(icon, name);
    node.setAttribute('aria-label', `${STRINGS.skills.names[skill]}, ${STRINGS.skills.rank(rank, MAX_RANK)}`);
    node.addEventListener('click', () => {
      if (view.skill !== skill) {
        view.skill = skill;
        redraw();
      }
      showPickedSkill(true);
    });
    path.append(node);
  });
  return path;
}

// Scrolls the menu so the picked skill's Learn button is fully in view,
// clear of the menu bar under the panel. With `toTabs` (after tapping a
// node) it first puts the tree tabs (Fishing, Garden, ...) at the top, just
// under the page's header, with the tree and the card right below them; on
// a short phone it goes a little further so the Learn button still shows.
export function showPickedSkill(toTabs: boolean, smooth = true): void {
  const tabs = document.querySelector<HTMLElement>('.menu-panel .skill-tabs');
  const head = document.querySelector<HTMLElement>('.menu-panel .skill-card .skill-card-head');
  const box = tabs?.closest('.menu-panel')?.parentElement;
  if (!tabs || !head || !box) return;
  const header = box.querySelector('.menu-header');
  const top = header ? header.getBoundingClientRect().bottom : box.getBoundingClientRect().top;
  const bottom = box.getBoundingClientRect().bottom;
  const by = Math.max(toTabs ? tabs.getBoundingClientRect().top - top - 4 : 0,
    head.getBoundingClientRect().bottom - bottom + 10);
  if (by <= 0 && !toTabs) return;
  const motion = smooth && !matchMedia('(prefers-reduced-motion: reduce)').matches;
  box.scrollBy({ top: by, behavior: motion ? 'smooth' : 'auto' });
}

// The open node's card: what it does now and next, and how to learn it.
function skillCard(state: GameState, skill: SkillId, cb: SkillsCallbacks): HTMLElement {
  const S = STRINGS.skills;
  const rank = rankOf(state, skill);
  const cost = nextCost(state, skill);
  const card = el('div', 'skill-card');
  card.dataset.state = nodeState(state, skill);
  const head = el('div', 'skill-card-head');
  const icon = el('span', 'drawer-option-icon');
  icon.innerHTML = SKILL_ICONS[skill] ?? '';
  const title = el('span', 'shop-row-text');
  title.append(el('b', '', S.names[skill]), el('small', '', S.rank(rank, MAX_RANK)));
  head.append(icon, title);
  // On the right of the name: the Learn button with its price, or Max.
  if (isOpen(state, skill) && cost === null) {
    head.append(label(S.maxed));
  } else if (isOpen(state, skill) && cost !== null) {
    const b = el('button', 'shop-btn skill-learn');
    b.append(S.learnButton, pointPill(cost));
    b.setAttribute('aria-label', S.learn(cost));
    b.classList.toggle('too-pricey', pointsToSpend(state) < cost); // still tappable, so it can say why
    b.addEventListener('click', () => cb.onLearn(skill));
    head.append(b);
  }
  card.append(head);

  const lines = el('div', 'skill-card-lines');
  if (rank > 0) lines.append(el('p', '', S.now(effectText(skill, rank))));
  if (cost !== null) lines.append(el('p', '', (rank > 0 ? S.nextRank : S.firstRank)(effectText(skill, rank + 1))));
  card.append(lines);
  if (!isOpen(state, skill)) card.append(el('p', 'skill-card-note', S.locked(S.names[skillBefore(skill)!])));
  return card;
}

// "Take points back" at the end of a tree, with its price (free the first
// time). Laid out like the skill card above it.
function resetCard(state: GameState, tree: TreeId, cb: SkillsCallbacks): HTMLElement {
  const S = STRINGS.skills;
  const cost = resetCost(state, tree);
  const card = el('div', 'skill-card skill-reset');
  const head = el('div', 'skill-card-head');
  const icon = el('span', 'drawer-option-icon');
  icon.innerHTML = SKILL_POINT_ICON;
  const title = el('span', 'shop-row-text');
  title.append(el('b', '', S.reset));
  const b = el('button', 'shop-btn shop-btn-soft');
  if (cost > 0) b.append(goldPill(cost));
  else b.textContent = S.resetFree;
  b.classList.toggle('too-pricey', state.gold < cost);
  b.addEventListener('click', () => cb.onResetTree(tree));
  head.append(icon, title, b);
  const lines = el('div', 'skill-card-lines');
  lines.append(el('p', '', S.resetNote(pointsInTree(state, tree))));
  card.append(head, lines);
  return card;
}

// The skill to show first in a tree: the next one to work on (the last
// open one that isn't maxed), or the top one.
export function pickFor(state: GameState, tree: TreeId): SkillId {
  const list = skillsIn(tree);
  return [...list].reverse().find((id) => isOpen(state, id) && nextCost(state, id) !== null) ?? list[0];
}

export function skillsPage(state: GameState, cb: SkillsCallbacks, view: SkillsView, redraw: () => void): HTMLElement[] {
  if (!view.skill || !skillsIn(view.tree).includes(view.skill)) view.skill = pickFor(state, view.tree);
  const page: HTMLElement[] = [
    summary(state), tabs(view, redraw), treePath(state, view, redraw), skillCard(state, view.skill, cb),
  ];
  if (pointsInTree(state, view.tree) > 0) page.push(resetCard(state, view.tree, cb));
  return page;
}
