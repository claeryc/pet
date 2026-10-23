// The Family Tree page inside the gear menu: every generation of the pet's
// family, oldest at the top, each pet with its picture, name, what it grew
// into, who raised it and how old it is. The pet you have now also shows
// its stats and a Rename button. The pet's name and rarity live here, not
// on the home screen.

import { STRINGS } from '../strings';
import { characterSheet, getCharacter, getVariant, sheetFor } from '../game/growth';
import { ageInDays, familyGenerations, pedigree, type TreeMember } from '../game/family';
import { getTrait } from '../game/traits';
import type { GameState, PetStats } from '../game/state';
import { STAT_ICONS, UNKNOWN_ICON } from './icons';
import type { CollectionCallbacks } from './collection';

export interface FamilyCallbacks extends CollectionCallbacks {
  onRename: () => void;
}

// How the page is being looked at: as a list of generations, or as a tree
// around one pet (null: the pet you have now). The menu keeps this while
// the page redraws.
export interface TreeView {
  mode: 'list' | 'tree';
  focus: string | null;
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

// Adds its trait ("· Playful") once it has hatched, with what the trait
// does when you hover or long-press it.
function traitLine(m: TreeMember, line: HTMLElement): HTMLElement {
  const trait = getTrait(m.trait);
  if (trait && m.stage !== 'egg') {
    line.append(` · ${trait.name}`);
    line.title = trait.about;
  }
  return line;
}

function sheetOf(m: TreeMember, state: GameState): string {
  const atHome = [state.pet, ...state.housemates].find((p) => p.id === m.id);
  if (atHome) return sheetFor(atHome);
  return characterSheet(m.character, m.variant);
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
  const c = el('div', `tree-card${m.current ? ' is-current' : ''}${kindClass(m)}`);
  const pic = el('span', 'tree-portrait');
  const url = cb.characterImage(sheetOf(m, state));
  pic.innerHTML = url ? `<span class="portrait" style="background-image:url('${url}')"></span>` : UNKNOWN_ICON;

  const info = el('div', 'tree-info');
  const top = el('div', 'tree-name');
  top.append(el('b', '', m.name || '…'));
  if (m.current) top.append(el('span', 'tree-now', STRINGS.family.you));
  else if (m.home) top.append(el('span', 'tree-now tree-home', STRINGS.family.atHome));
  if (m.current && state.pet.named) {
    const rename = el('button', 'shop-btn shop-btn-soft tree-rename', STRINGS.family.rename);
    rename.addEventListener('click', cb.onRename);
    top.append(rename);
  }
  info.append(
    top,
    traitLine(m, el('small', 'tree-what', whatItIs(m))),
    el('small', '', m.fromWild ? STRINGS.family.raisedInWild : m.owner ? STRINGS.family.raisedBy(m.owner) : STRINGS.family.raisedByYou),
    el('small', '', m.home ? STRINGS.family.age(ageInDays(m.bornAt, state.lastUpdated)) : bornOn(m.bornAt)),
  );
  const atHome = [state.pet, ...state.housemates].find((p) => p.id === m.id);
  if (atHome && atHome.stage !== 'egg') info.append(statRow(atHome.stats));
  c.append(pic, info);
  return c;
}

// A blue border for another player's pet, green for a wanderer.
function kindClass(m: TreeMember): string {
  return m.fromWild ? ' is-wild' : m.fromFriend ? ' is-friend' : '';
}

function bornOn(t: number): string {
  return STRINGS.family.born(new Date(t).toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' }));
}

function portraitHtml(m: TreeMember, state: GameState, cb: FamilyCallbacks): string {
  const url = cb.characterImage(sheetOf(m, state));
  return url ? `<span class="portrait" style="background-image:url('${url}')"></span>` : UNKNOWN_ICON;
}

// A small pet in the Tree view: picture and name. Tap it to see the tree
// around that pet. `null` is a parent we don't know: an empty spot.
function node(m: TreeMember | null, state: GameState, cb: FamilyCallbacks, onFocus: (id: string) => void): HTMLElement {
  if (!m) {
    const empty = el('span', 'tree-node is-unknown');
    empty.innerHTML = `<span class="tree-node-pic">${UNKNOWN_ICON}</span>`;
    empty.append(el('span', 'tree-node-name', STRINGS.collection.unknown));
    return empty;
  }
  const b = el('button', `tree-node${m.current ? ' is-current' : ''}${kindClass(m)}`);
  b.innerHTML = `<span class="tree-node-pic">${portraitHtml(m, state, cb)}</span>`;
  b.append(el('span', 'tree-node-name', m.name || '…'));
  // Who raised it shows on its card once you tap it; here a blue border
  // is enough to tell another player's pet apart.
  b.title = STRINGS.family.showTreeOf(m.name);
  b.addEventListener('click', () => onFocus(m.id));
  return b;
}

// Two parents side by side with a heart between them, and a line down to
// their little one. `span` is how many of the 4 columns the pair covers.
function coupleLink(span: 2 | 4): HTMLElement {
  const link = el('div', `tree-couple span-${span}`);
  link.innerHTML = '<span class="tree-heart" aria-hidden="true">♥</span>';
  return link;
}

const blank = (span: number) => el('div', `tree-blank span-${span}`);

function treeView(state: GameState, cb: FamilyCallbacks, view: TreeView, onChange: () => void): HTMLElement[] {
  const p = pedigree(state, view.focus);
  const focus = (id: string) => {
    view.focus = id;
    onChange();
  };
  const out: HTMLElement[] = [];
  const grid = el('div', 'tree-grid');

  // Grandparents, then parents, each pair joined by a heart.
  if (p.parents.length > 0) {
    const parents = [p.parents[0] ?? null, p.parents[1] ?? null];
    const grand = [0, 1].map((i) => p.grandparents[i] ?? []);
    if (grand.some((g) => g.length > 0)) {
      for (const g of grand) {
        if (g.length === 0) grid.append(blank(2));
        else grid.append(...[g[0] ?? null, g[1] ?? null].map((m) => node(m, state, cb, focus)));
      }
      for (const g of grand) grid.append(g.length === 0 ? blank(2) : coupleLink(2));
    }
    for (const m of parents) {
      const cell = el('div', 'tree-cell span-2');
      cell.append(node(m, state, cb, focus));
      grid.append(cell);
    }
    grid.append(coupleLink(4));
  }
  const me = el('div', 'tree-cell span-4');
  me.append(card(p.focus, state, cb));
  grid.append(me);
  out.push(grid);

  if (p.parents.length === 0) out.push(el('p', 'tree-note', STRINGS.family.firstPet));
  const group = (title: string, list: TreeMember[]) => {
    if (list.length === 0) return;
    const row = el('div', 'tree-node-row');
    row.append(...list.map((m) => node(m, state, cb, focus)));
    out.push(el('h3', 'tree-gen-title', title), row);
  };
  group(STRINGS.family.siblings, p.siblings);
  group(STRINGS.family.children, p.children);

  if (!p.focus.current) {
    const back = el('button', 'shop-btn shop-btn-soft tree-back', STRINGS.family.backTo(state.pet.name));
    back.addEventListener('click', () => {
      view.focus = null;
      onChange();
    });
    out.push(back);
  }
  return out;
}

// [ List | Tree ] at the top of the page.
function viewSwitch(view: TreeView, onChange: () => void): HTMLElement {
  const sw = el('div', 'tree-switch');
  sw.setAttribute('role', 'group');
  sw.setAttribute('aria-label', STRINGS.family.view);
  for (const mode of ['list', 'tree'] as const) {
    const b = el('button', 'tree-switch-btn', STRINGS.family.views[mode]);
    b.setAttribute('aria-pressed', String(view.mode === mode));
    b.addEventListener('click', () => {
      if (view.mode === mode) return;
      view.mode = mode;
      view.focus = null;
      onChange();
    });
    sw.append(b);
  }
  return sw;
}

function listView(state: GameState, cb: FamilyCallbacks): HTMLElement[] {
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

// `onChange` redraws the page after the view changes.
export function familyTreePage(state: GameState, cb: FamilyCallbacks, view: TreeView, onChange: () => void): HTMLElement[] {
  return [
    viewSwitch(view, onChange),
    ...(view.mode === 'list' ? listView(state, cb) : treeView(state, cb, view, onChange)),
  ];
}
