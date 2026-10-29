// The workbench. Like the kitchen, the button row becomes
// [Close] [Materials] [Patterns], and the workbench pops up over the pet's
// room (the bench, or the meadow with the projects) and the stat bars (the
// controls).
//
// Swipe the counter, or tap ‹ › on the switch under it, to go between the
// bench and the projects (see src/ui/stations.ts).
//
// The bench: a pegboard of tools on the wall, the bench under it, and the
// picked pattern pinned up on a card. Below, a spot for each material it
// takes (with how many, red when you're short) and a round Make! button.
// Making takes three taps of the hammer; then the piece pops up. A room
// piece can go straight up in the room.
//
// The projects: the meadow, with the project in it as far as it's built
// (the rest is a faint outline). Below, arrows to switch project, a pip
// per stage, what the next stage needs and a round Build button. A stage
// takes a few real hours; while it builds, it says when it's ready.
//
// Materials and Patterns open upward like Food and Recipes:
//  - Materials: the pouch, every material and how many, and the key parts.
//  - Patterns: Shop-like category tabs, then a row per pattern with what it
//    needs (greyed out when short). Tap one to pin it up on the bench.
//
// The rules are in src/game/crafting.ts.

import { STRINGS } from '../strings';
import {
  CATEGORIES, getProject, haveMaterials, madeAlready, MATERIALS, materialCount, PARTS, partPlace, PATTERNS,
  hasPart, progressOf, projectOpen, PROJECTS, type Category, type Pattern, type Project,
} from '../game/crafting';
import type { GameState } from '../game/state';
import { createDrawer } from './drawer';
import { CRAFT_ART, ITEM_ICONS, STAT_ICONS } from './icons';
import { placeName } from './dig';
import { formatDayClock } from './time';
import { KITCHEN_OUT_MS } from './cooking';
import { createStationSwitch } from './stations';

const T = STRINGS.crafting;

export interface WorkbenchCallbacks {
  // Makes a pattern. Returns it, or null if the game refused (the reason
  // is shown elsewhere).
  onCraft: (id: string) => Pattern | null;
  // Starts a project's next stage. False if refused.
  onBuild: (id: string) => boolean;
  onHang: () => void; // "Hang it in the room": off to decorating
  onExit: () => void;
  toast: (message: string) => void;
  roomBox: () => DOMRect;
}

export interface Workbench {
  row: HTMLElement;
  bench: HTMLElement;
  start: () => void;
  stop: () => void;
  active: () => boolean;
  update: (state: GameState, now: number) => void;
}

type Tab = 'bench' | 'projects';
const TABS: readonly Tab[] = ['bench', 'projects'];
const TAB_ICONS: Record<Tab, string> = { bench: ITEM_ICONS.workbench, projects: CRAFT_ART.windmill };
const TAPS = 3;
const PANEL_GAP = 12;

const el = (tag: string, className: string, text?: string): HTMLElement => {
  const e = document.createElement(tag);
  e.className = className;
  if (text !== undefined) e.textContent = text;
  return e;
};
const matIcon = (id: string) => ITEM_ICONS[`mat_${id}`] ?? '';
const matName = (id: string) => T.materials[id] ?? id;
// The picture of what a pattern makes.
export function patternIcon(p: Pattern): string {
  const [kind, id] = p.makes.split(':');
  const key = kind === 'furniture' ? `furniture_${id}` : kind === 'charm' ? `charm_${id}` : id;
  return ITEM_ICONS[key] ?? ITEM_ICONS.workbench;
}
const needList = (needs: Partial<Record<string, number>>) => Object.entries(needs).map(([id, n]) => ({ id, n: n ?? 0 }));

export function createWorkbench(cb: WorkbenchCallbacks): Workbench {
  let state: GameState | null = null;
  let now = 0;
  let active = false;
  let tab: Tab = 'bench';
  let picked: Pattern | null = null;
  let taps = 0;
  let justMade: Pattern | null = null;
  let category: Category = CATEGORIES[0];
  let project = 0;
  let outTimer = 0;
  let hitTimer = 0;

  // ---- The workbench ----
  const bench = el('div', 'kitchen workbench');
  bench.hidden = true;
  const room = el('div', 'kitchen-room bench-room');
  const counter = el('div', 'kitchen-counter');

  // The bench scene: pegboard, bench, the hammer, and the card.
  const benchScene = el('div', 'kitchen-scene bench-scene');
  const peg = el('span', 'bench-peg');
  peg.innerHTML = CRAFT_ART.pegboard;
  const table = el('button', 'bench-table');
  table.innerHTML = CRAFT_ART.bench;
  table.addEventListener('click', hammer);
  const onTable = el('span', 'bench-piece');
  onTable.setAttribute('aria-hidden', 'true');
  const hammerArt = el('span', 'bench-hammer');
  hammerArt.innerHTML = CRAFT_ART.hammer;
  hammerArt.setAttribute('aria-hidden', 'true');
  const bang = el('span', 'bench-bang');
  bang.setAttribute('aria-hidden', 'true');
  table.append(onTable, hammerArt, bang);
  const card = el('div', 'recipe-card bench-card');
  card.setAttribute('aria-hidden', 'true');
  const cardArt = el('span', 'recipe-card-art');
  const cardName = el('b', 'recipe-card-name');
  const cardNote = el('small', 'recipe-card-note');
  card.append(el('i', 'recipe-card-pin'), cardArt, cardName, cardNote);
  const burst = el('div', 'kitchen-burst');
  burst.setAttribute('aria-live', 'polite');
  benchScene.append(peg, table, card, burst);

  // The bench controls: the material spots and Make!, or what you made.
  const benchControls = el('div', 'kitchen-controls bench-controls');
  const spots = el('div', 'pot-row bench-spots');
  const prompt = el('span', 'kitchen-prompt bench-prompt');
  const makeBtn = el('button', 'kitchen-cook');
  makeBtn.addEventListener('click', hammer);
  const madeBox = el('div', 'bench-made');
  const madeIcon = el('span', 'bench-made-icon');
  const madeText = el('div', 'bench-made-text');
  const madeName = el('b', '');
  const hangBtn = el('button', 'bench-hang', T.hangIt);
  hangBtn.addEventListener('click', () => {
    stop();
    cb.onHang();
  });
  madeText.append(madeName, hangBtn);
  madeBox.append(madeIcon, madeText);
  benchControls.append(spots, prompt, madeBox, makeBtn);

  // The projects scene: sky, grass, the project and its sign.
  const meadow = el('div', 'kitchen-scene meadow-scene');
  const build = el('div', 'project-art');
  const ghost = el('span', 'project-ghost');
  const done = el('span', 'project-built');
  const unknown = el('span', 'project-unknown', '?');
  build.append(ghost, done, unknown);
  const signBoard = el('div', 'project-sign');
  const signName = el('b', '');
  const signNote = el('small', '');
  signBoard.append(signName, signNote);
  meadow.append(build, signBoard);

  const projectControls = el('div', 'kitchen-controls project-controls');
  const pj = el('div', 'pj');
  const pjHead = el('div', 'pj-head');
  const prev = el('button', 'pj-arrow', '‹');
  prev.setAttribute('aria-label', 'Previous project');
  prev.addEventListener('click', () => turn(-1));
  const pjName = el('b', 'pj-name');
  const next = el('button', 'pj-arrow', '›');
  next.setAttribute('aria-label', 'Next project');
  next.addEventListener('click', () => turn(1));
  pjHead.append(prev, pjName, next);
  const pips = el('div', 'pj-stages');
  pips.setAttribute('aria-hidden', 'true');
  const pjStage = el('div', 'pj-stage');
  const pjNeeds = el('div', 'pj-needs');
  pj.append(pjHead, pips, pjStage, pjNeeds);
  const buildBtn = el('button', 'kitchen-cook', T.build);
  buildBtn.addEventListener('click', buildIt);
  projectControls.append(pj, buildBtn);

  room.append(benchScene, meadow);
  counter.append(benchControls, projectControls);
  const stations = createStationSwitch({
    items: TABS.map((t) => ({ id: t, icon: TAB_ICONS[t], label: T.tabs[t] })),
    pick: (t) => switchTo(t),
    current: () => tab,
    moving: () => (tab === 'bench' ? [benchScene, benchControls] : [meadow, projectControls]),
    swipeOn: [room, counter],
    frame: bench,
  });
  bench.append(room, counter, stations.el);

  // ---- The buttons: [Close] [Materials] [Patterns] ----
  const row = el('div', 'actions cooking-row');
  row.hidden = true;
  const close = el('button', 'btn btn-soft', T.close);

  // Materials: the pouch, then the key parts.
  const pouch = el('div', 'pouch');
  const pouchGrid = el('div', 'pantry pouch-grid');
  const pouchItems = MATERIALS.map((id) => {
    const tile = el('div', 'pantry-item pouch-item');
    tile.innerHTML = matIcon(id);
    const count = el('small', 'pantry-count');
    tile.append(count);
    tile.title = matName(id);
    pouchGrid.append(tile);
    return { id, tile, count };
  });
  const pouchNote = el('p', 'pouch-note', T.pouchNote);
  const partsHead = el('div', 'recipe-book-head', T.keyParts);
  const partsList = el('div', 'pouch-parts');
  const partRows = PARTS.map((id) => {
    const r = el('div', 'pouch-part');
    const icon = el('span', 'recipe-icon');
    icon.innerHTML = ITEM_ICONS[`part_${id}`] ?? '';
    const text = el('span', 'recipe-name');
    r.append(icon, text);
    partsList.append(r);
    return { id, r, text };
  });
  pouch.append(pouchGrid, pouchNote, partsHead, partsList);

  // Patterns: category tabs, then the rows.
  const book = el('div', 'pattern-book');
  const cats = el('div', 'shop-tabs pattern-tabs');
  const catButtons = CATEGORIES.map((c) => {
    const b = el('button', 'shop-tab');
    const first = PATTERNS.find((p) => p.category === c);
    b.innerHTML = `<span class="shop-tab-icon">${first ? patternIcon(first) : ''}</span>`;
    b.setAttribute('aria-label', T.categories[c]);
    b.title = T.categories[c];
    b.addEventListener('click', () => {
      category = c;
      render();
    });
    cats.append(b);
    return { c, b };
  });
  const catName = el('div', 'recipe-book-head pattern-cat');
  const list = el('div', 'recipe-book pattern-list');
  const patternRows = PATTERNS.map((p) => {
    const b = el('button', 'recipe pattern');
    const icon = el('span', 'recipe-icon');
    icon.innerHTML = patternIcon(p);
    const label = el('span', 'recipe-name');
    const needs = el('span', 'recipe-needs');
    b.append(icon, label, needs);
    b.addEventListener('click', () => pick(p));
    list.append(b);
    return { p, b, label, needs };
  });
  book.append(cats, catName, list);

  const drawerSetup = { row, comingSoon: STRINGS.menu.comingSoon, beforeOpen: () => null, onBlocked: cb.toast };
  const pouchDrawer = createDrawer({ ...drawerSetup, id: 'bench-materials', label: T.materialsButton, content: pouch, onOpen: () => fitPanel(pouchDrawer.el) });
  const patternDrawer = createDrawer({ ...drawerSetup, id: 'bench-patterns', label: T.patternsButton, content: book, onOpen: () => fitPanel(patternDrawer.el) });
  row.append(close, pouchDrawer.el, patternDrawer.el);

  function fitPanel(drawer: HTMLElement): void {
    const box = drawer.querySelector<HTMLElement>('.drawer-options')!;
    const space = row.getBoundingClientRect().bottom - bench.getBoundingClientRect().bottom - PANEL_GAP;
    box.style.setProperty('--fit', `${Math.max(120, Math.floor(space - 74))}px`);
  }

  function switchTo(t: Tab): void {
    if (t === tab || hammering()) return;
    tab = t;
    justMade = null;
    pouchDrawer.close();
    patternDrawer.close();
    render();
  }

  const hammering = () => taps > 0;

  function pick(p: Pattern): void {
    if (!state || hammering()) return;
    if (madeAlready(state, p)) return cb.toast(T.madeAlready);
    picked = p;
    justMade = null;
    tab = 'bench';
    patternDrawer.close();
    render();
  }

  // A tap of the hammer (the round button or the bench). The last one
  // makes the piece.
  function hammer(): void {
    if (!state || tab !== 'bench' || justMade) return;
    if (!picked) return cb.toast(T.start);
    if (madeAlready(state, picked)) return cb.toast(T.madeAlready);
    if (!haveMaterials(state, picked.needs)) {
      const short = needList(picked.needs).filter((x) => materialCount(state!, x.id) < x.n).map((x) => matName(x.id).toLowerCase());
      return cb.toast(T.short(short.join(', ')));
    }
    taps++;
    bench.classList.remove('hit');
    void bench.offsetWidth;
    bench.classList.add('hit');
    clearTimeout(hitTimer);
    hitTimer = window.setTimeout(() => bench.classList.remove('hit'), 350);
    if (taps < TAPS) {
      cb.toast(T.oneMore(TAPS - taps));
      return render();
    }
    taps = 0;
    const made = cb.onCraft(picked.id);
    if (made) {
      justMade = made;
      bench.classList.add('made');
      pouchDrawer.close();
      patternDrawer.close();
    }
    render();
  }

  function turn(by: number): void {
    project = (project + by + PROJECTS.length) % PROJECTS.length;
    render();
  }

  function buildIt(): void {
    const p = PROJECTS[project];
    if (cb.onBuild(p.id)) render();
  }

  function render(): void {
    if (!state) return;
    const s = state;
    stations.render(tab);
    bench.dataset.tab = tab;
    benchScene.hidden = benchControls.hidden = tab !== 'bench';
    meadow.hidden = projectControls.hidden = tab !== 'projects';
    if (tab === 'bench') renderBench(s);
    else renderProject(s, PROJECTS[project]);
    renderLists(s);
  }

  function renderBench(s: GameState): void {
    const p = justMade ?? picked;
    bench.classList.toggle('made', justMade !== null);
    cardArt.innerHTML = p ? patternIcon(p) : ITEM_ICONS.workbench;
    cardName.textContent = p ? T.patterns[p.id] : T.pick;
    cardNote.textContent = p ? T.patternNote[p.id] : T.pickHint;
    onTable.innerHTML = justMade ? patternIcon(justMade) : '';
    hammerArt.style.setProperty('--taps', String(taps));
    bang.textContent = taps > 0 ? '!'.repeat(taps) : '';
    burst.innerHTML = justMade ? `<b>${T.madeIt(T.patterns[justMade.id])}</b>` : '';

    madeBox.hidden = !justMade;
    spots.hidden = prompt.hidden = !!justMade;
    makeBtn.hidden = !!justMade;
    if (justMade) {
      madeIcon.innerHTML = patternIcon(justMade);
      madeName.textContent = T.madeIt(T.patterns[justMade.id]);
      hangBtn.hidden = !justMade.makes.startsWith('furniture:');
      return;
    }
    // A spot per material: its icon and "have/need".
    const needs = p ? needList(p.needs) : [];
    spots.replaceChildren(
      ...needs.flatMap((x, i) => {
        const spot = el('span', 'pot-slot filled bench-spot');
        const have = materialCount(s, x.id);
        spot.classList.toggle('short', have < x.n);
        spot.innerHTML = matIcon(x.id);
        spot.append(el('b', 'bench-spot-n', `${have}/${x.n}`));
        spot.title = matName(x.id);
        return i > 0 ? [sign('+'), spot] : [spot];
      }),
    );
    prompt.hidden = !!p;
    prompt.textContent = T.start;
    const ready = !!p && haveMaterials(s, p.needs);
    makeBtn.textContent = taps > 0 ? T.tap : T.make;
    makeBtn.classList.toggle('faded', !ready);
    makeBtn.setAttribute('aria-label', taps > 0 ? T.oneMore(TAPS - taps) : p ? `${T.make} ${T.patterns[p.id]}` : T.pick);
  }

  function sign(text: string): HTMLElement {
    const x = el('span', 'pot-sign', text);
    x.setAttribute('aria-hidden', 'true');
    return x;
  }

  function renderProject(s: GameState, p: Project): void {
    const open = projectOpen(s, p);
    const prog = progressOf(s, p.id);
    const total = p.stages.length;
    const finished = prog.built >= total;
    const name = T.projects[p.id];
    bench.dataset.project = p.id;
    ghost.innerHTML = done.innerHTML = open ? CRAFT_ART[p.id] : '';
    unknown.hidden = open;
    // Built bottom up: the built share shows in full, the rest faintly.
    done.style.clipPath = `inset(${(1 - prog.built / total) * 100}% 0 0 0)`;
    build.classList.toggle('is-building', prog.until > 0);
    signName.textContent = name;
    signNote.textContent = !open ? T.notFound : finished ? T.built : T.stageOf(prog.built + 1, total);

    pjName.textContent = name;
    pips.replaceChildren(
      ...p.stages.map((_, i) => {
        const pip = el('i', '');
        pip.classList.toggle('on', i < prog.built);
        pip.classList.toggle('now', i === prog.built && prog.until > 0);
        return pip;
      }),
    );
    buildBtn.hidden = !open || finished || prog.until > 0;
    if (!open) {
      const part = T.parts[p.part];
      pjStage.textContent = T.locked(part, placeName(partPlace(p.part) ?? ''));
      pjNeeds.replaceChildren();
      return;
    }
    if (finished) {
      pjStage.textContent = T.built;
      pjNeeds.replaceChildren(el('span', 'pj-gives', T.gives[p.id]));
      return;
    }
    const stage = p.stages[prog.built];
    const stageName = T.stages[p.id][prog.built];
    if (prog.until > 0) {
      pjStage.textContent = stageName;
      pjNeeds.replaceChildren(el('span', 'pj-gives', T.buildingUntil(formatDayClock(prog.until, now))));
      return;
    }
    pjStage.textContent = stageName;
    const chips = needList(stage.needs).map((x) => {
      const chip = el('span', 'recipe-need pj-need');
      const have = materialCount(s, x.id);
      chip.classList.toggle('missing', have < x.n);
      chip.innerHTML = matIcon(x.id);
      chip.append(`${have}/${x.n}`);
      chip.title = matName(x.id);
      return chip;
    });
    const gold = el('span', 'recipe-need pj-need pj-gold');
    gold.classList.toggle('missing', s.gold < stage.gold);
    gold.innerHTML = STAT_ICONS.gold;
    gold.append(String(stage.gold));
    gold.title = T.gold(stage.gold);
    pjNeeds.replaceChildren(...chips, gold);
    const ready = haveMaterials(s, stage.needs) && s.gold >= stage.gold;
    buildBtn.classList.toggle('faded', !ready);
    buildBtn.setAttribute('aria-label', `${T.build}: ${stageName}`);
  }

  function renderLists(s: GameState): void {
    for (const m of pouchItems) {
      const n = materialCount(s, m.id);
      m.count.textContent = String(n);
      m.tile.classList.toggle('faded', n <= 0);
      m.tile.setAttribute('aria-label', `${matName(m.id)}: ${n}`);
    }
    let anyPart = false;
    for (const r of partRows) {
      const has = hasPart(s, r.id);
      anyPart ||= has;
      r.r.hidden = !has;
      r.text.textContent = T.parts[r.id];
    }
    partsHead.hidden = false;
    partsList.dataset.empty = String(!anyPart);
    partsList.title = anyPart ? '' : T.noParts;
    if (!anyPart && !partsList.querySelector('.pouch-none')) partsList.append(el('p', 'pouch-note pouch-none', T.noParts));
    if (anyPart) partsList.querySelector('.pouch-none')?.remove();

    for (const c of catButtons) c.b.setAttribute('aria-pressed', String(c.c === category));
    catName.textContent = T.categories[category];
    for (const r of patternRows) {
      r.b.style.display = r.p.category === category ? '' : 'none';
      const made = madeAlready(s, r.p);
      const ready = !made && haveMaterials(s, r.p.needs);
      r.b.classList.toggle('ready', ready);
      r.b.classList.toggle('unknown', !ready);
      r.b.classList.toggle('picked', picked?.id === r.p.id);
      r.label.textContent = T.patterns[r.p.id];
      const note = el('small', 'pattern-note', made ? T.made : T.patternNote[r.p.id]);
      r.label.append(note);
      r.needs.replaceChildren(
        ...needList(r.p.needs).map((x) => {
          const chip = el('span', 'recipe-need');
          const have = materialCount(s, x.id);
          chip.classList.toggle('missing', !made && have < x.n);
          chip.innerHTML = matIcon(x.id);
          chip.append(`×${x.n}`);
          chip.title = `${matName(x.id)}: ${have}/${x.n}`;
          return chip;
        }),
      );
      r.b.setAttribute('aria-label', `${T.patterns[r.p.id]}. ${made ? T.made : needList(r.p.needs).map((x) => `${matName(x.id)} ${materialCount(s, x.id)}/${x.n}`).join(', ')}`);
    }
  }

  function reach(): void {
    const slot = bench.parentElement;
    if (!slot) return;
    const y = slot.getBoundingClientRect().top;
    const box = cb.roomBox();
    bench.style.setProperty('--kitchen-up', `${Math.max(0, y - box.top)}px`);
    bench.style.setProperty('--kitchen-gap', `${Math.max(0, y - box.bottom)}px`);
  }

  close.addEventListener('click', () => {
    stop();
    cb.onExit();
  });

  function stop(): void {
    if (!active) return;
    active = false;
    pouchDrawer.close();
    patternDrawer.close();
    row.hidden = true;
    taps = 0;
    justMade = null;
    bench.classList.remove('is-in', 'made', 'hit');
    removeEventListener('resize', reach);
    clearTimeout(outTimer);
    outTimer = window.setTimeout(() => (bench.hidden = true), KITCHEN_OUT_MS);
  }

  return {
    row,
    bench,
    start() {
      active = true;
      tab = 'bench';
      taps = 0;
      justMade = null;
      if (picked && state && madeAlready(state, picked)) picked = null;
      // Open on the first project you can work on.
      if (state) {
        const s = state;
        const i = PROJECTS.findIndex((p) => projectOpen(s, p) && progressOf(s, p.id).built < p.stages.length);
        if (i >= 0) project = i;
      }
      row.hidden = false;
      clearTimeout(outTimer);
      bench.hidden = false;
      reach();
      addEventListener('resize', reach);
      render();
      void bench.offsetHeight;
      bench.classList.add('is-in');
      if (state) {
        const s = state;
        cb.toast(MATERIALS.some((id) => materialCount(s, id) > 0) ? T.start : T.startEmpty);
      }
    },
    stop,
    active: () => active,
    update(next, at) {
      state = next;
      now = at;
      if (active) render();
    },
  };
}

// For tests and the Shop-like count: which project ids exist.
export const projectIds = (): string[] => PROJECTS.map((p) => p.id);
export { getProject };
