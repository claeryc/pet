// The Family Tree page inside the gear menu: every generation of the pet's
// family, oldest at the top, each pet with its picture, name, what it grew
// into, who raised it and how old it is. The pet you have now also shows
// its stats and a Rename button. The pet's name and rarity live here, not
// on the home screen.

import { STRINGS } from '../strings';
import { getCharacter, getVariant, sheetFor } from '../game/growth';
import { ageInDays, familyGenerations, type TreeMember } from '../game/family';
import type { GameState, PetStats } from '../game/state';
import { STAT_ICONS, UNKNOWN_ICON } from './icons';
import type { CollectionCallbacks } from './collection';

export interface FamilyCallbacks extends CollectionCallbacks {
  onRename: () => void;
}

function el<K extends keyof HTMLElementTagNameMap>(tag: K, className: string, text?: string): HTMLElementTagNameMap[K] {
  const e = document.createElement(tag);
  e.className = className;
  if (text !== undefined) e.textContent = text;
  return e;
}

// "Pebblit (Amber) ★★" for a grown-up, or its stage ("Baby") before that.
function whatItIs(m: TreeMember): string {
  if (m.stage !== 'adult') return STRINGS.family.stages[m.stage];
  const character = getCharacter(m.character);
  if (!character) return STRINGS.family.stages.adult;
  const name = STRINGS.characterName(character.name, getVariant(character, m.variant)?.name);
  return `${name}  ${STRINGS.stars(character.stars)}`;
}

function sheetOf(m: TreeMember, state: GameState): string {
  if (m.current) return sheetFor(state.pet);
  const character = getCharacter(m.character);
  return getVariant(character, m.variant)?.sheet ?? character?.sheet ?? '';
}

// The pet's four stats as tiny bars.
function statRow(stats: PetStats): HTMLElement {
  const row = el('div', 'tree-stats');
  for (const key of Object.keys(stats) as (keyof PetStats)[]) {
    const value = Math.round(stats[key]);
    const stat = el('span', 'tree-stat');
    stat.title = `${STRINGS.stats[key]}: ${value}`;
    stat.setAttribute('role', 'meter');
    stat.setAttribute('aria-label', STRINGS.stats[key]);
    stat.setAttribute('aria-valuenow', String(value));
    stat.setAttribute('aria-valuemin', '0');
    stat.setAttribute('aria-valuemax', '100');
    stat.innerHTML = STAT_ICONS[key];
    const bar = el('span', 'tree-stat-bar');
    const fill = el('span', 'tree-stat-fill');
    fill.style.width = `${value}%`;
    bar.append(fill);
    stat.append(bar);
    row.append(stat);
  }
  return row;
}

function card(m: TreeMember, state: GameState, cb: FamilyCallbacks): HTMLElement {
  const c = el('div', m.current ? 'tree-card is-current' : 'tree-card');
  const pic = el('span', 'tree-portrait');
  const url = cb.characterImage(sheetOf(m, state));
  pic.innerHTML = url ? `<span class="portrait" style="background-image:url('${url}')"></span>` : UNKNOWN_ICON;

  const info = el('div', 'tree-info');
  const top = el('div', 'tree-name');
  top.append(el('b', '', m.name || '…'));
  if (m.current) top.append(el('span', 'tree-now', STRINGS.family.you));
  if (m.current && state.pet.named) {
    const rename = el('button', 'shop-btn shop-btn-soft tree-rename', STRINGS.family.rename);
    rename.addEventListener('click', cb.onRename);
    top.append(rename);
  }
  info.append(
    top,
    el('small', 'tree-what', whatItIs(m)),
    el('small', '', m.owner ? STRINGS.family.raisedBy(m.owner) : STRINGS.family.raisedByYou),
    el('small', '', m.current ? STRINGS.family.age(ageInDays(m.bornAt, state.lastUpdated)) : bornOn(m.bornAt)),
  );
  if (m.current && m.stage !== 'egg') info.append(statRow(state.pet.stats));
  c.append(pic, info);
  return c;
}

function bornOn(t: number): string {
  return STRINGS.family.born(new Date(t).toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' }));
}

export function familyTreePage(state: GameState, cb: FamilyCallbacks): HTMLElement[] {
  const out: HTMLElement[] = [];
  for (const gen of familyGenerations(state)) {
    if (out.length > 0) out.push(el('div', 'tree-link')); // a line down to the next generation
    const section = el('section', 'tree-gen');
    const head = el('h3', 'tree-gen-title', STRINGS.family.generation(gen.number));
    const row = el('div', 'tree-gen-row');
    row.append(...gen.members.map((m) => card(m, state, cb)));
    section.append(head, row);
    out.push(section);
  }
  // Room for the next generation, once pets can meet.
  out.push(el('div', 'tree-link tree-link-faded'), el('p', 'tree-future', STRINGS.family.future));
  return out;
}
