// The item catalog page (items.html): every item in the game in one list,
// with its art, what it costs, how you get it, its theme and whether it's
// out yet. Read-only: everything comes from src/art/catalog.ts, which
// reads the game's own data. Not part of the game: `npm run build` leaves
// it out.

import { buildCatalog, CATEGORIES, THEMES, WAYS, themesIn, type CatalogItem, type Cost, type Way } from './catalog';
import { FRAGMENT_ICON, ITEM_ICONS, STAT_ICONS } from '../ui/icons';
import { STRINGS } from '../strings';

const $ = <T extends HTMLElement = HTMLElement>(id: string) => document.getElementById(id) as T;

const ITEMS = buildCatalog();

interface Filters {
  cat: string; // a category, or '' for all
  q: string;
  way: string; // a Way, or ''
  theme: string; // a theme, 'none', or ''
  status: string; // 'live', 'later' or ''
  sort: string; // 'category', 'name', 'price'
  noArt: boolean;
}

const SAVED = 'item-catalog';
const filters: Filters = { cat: '', q: '', way: '', theme: '', status: '', sort: 'category', noArt: false };
try {
  Object.assign(filters, JSON.parse(localStorage.getItem(SAVED) ?? '{}'));
} catch {
  // A private window or blocked storage: start from the defaults.
}
const save = () => {
  try {
    localStorage.setItem(SAVED, JSON.stringify(filters));
  } catch {
    // Not saved, that's fine.
  }
};

// ---------------------------------------------------------------- helpers

function el<K extends keyof HTMLElementTagNameMap>(tag: K, className = '', html = ''): HTMLElementTagNameMap[K] {
  const e = document.createElement(tag);
  if (className) e.className = className;
  if (html) e.innerHTML = html;
  return e;
}
const text = <K extends keyof HTMLElementTagNameMap>(tag: K, className: string, t: string) => {
  const e = el(tag, className);
  e.textContent = t;
  return e;
};

const wayName = (w: Way) => WAYS.find((x) => x.id === w)?.name ?? w;
const catName = (c: string) => CATEGORIES.find((x) => x.id === c)?.name ?? c;
const matName = (id: string) => STRINGS.crafting.materials[id] ?? id;

function costChip(c: Cost): HTMLElement {
  const chip = el('span', `cost is-${c.cur}`);
  const icon = c.cur === 'gold' ? STAT_ICONS.gold : c.cur === 'frag' ? FRAGMENT_ICON : c.cur === 'mat' ? ITEM_ICONS[`mat_${c.mat}`] ?? '' : '';
  if (icon) chip.append(el('span', 'ic', icon));
  chip.append(String(c.amount));
  chip.title = c.cur === 'gold' ? `${c.amount} gold` : c.cur === 'frag' ? `${c.amount} star fragments` : c.cur === 'mat' ? `${c.amount} ${matName(c.mat ?? '')}` : `Real money: ${c.amount}`;
  return chip;
}

function artOf(it: CatalogItem): HTMLElement {
  const box = el('span', `art${it.missingArt ? ' is-missing' : ''}`);
  if (it.sheet) {
    const hat = el('span', 'hat');
    hat.style.backgroundImage = `url('${it.sheet}')`;
    box.append(hat);
  } else box.innerHTML = it.art;
  if (it.missingArt) box.title = 'No art yet: this is the placeholder';
  return box;
}

// The first gold price, for sorting (worth if there's no price).
const priceOf = (it: CatalogItem) => {
  const gold = it.cost.find((c) => c.cur === 'gold');
  if (gold) return Number(gold.amount);
  const frag = it.cost.find((c) => c.cur === 'frag');
  if (frag) return Number(frag.amount) * 10;
  return it.worth ?? -1;
};

function matches(it: CatalogItem, f: Filters, skipCat = false): boolean {
  if (!skipCat && f.cat && it.category !== f.cat) return false;
  if (f.way && !it.ways.some((w) => w.way === f.way)) return false;
  if (f.theme === 'none' ? !!it.theme : f.theme && it.theme !== f.theme) return false;
  if (f.status === 'live' && it.later) return false;
  if (f.status === 'later' && !it.later) return false;
  if (f.noArt && !it.missingArt) return false;
  if (f.q) {
    const hay = [it.name, it.id, it.kind, catName(it.category), ...it.ways.map((w) => w.text), ...it.uses, ...it.about, ...it.tags, it.theme ? THEMES[it.theme] : '']
      .join(' ').toLowerCase();
    if (!f.q.toLowerCase().split(/\s+/).every((word) => hay.includes(word))) return false;
  }
  return true;
}

// ---------------------------------------------------------------- render

function select(id: string, options: [string, string][], value: string, onChange: (v: string) => void) {
  const s = $<HTMLSelectElement>(id);
  s.innerHTML = '';
  for (const [v, label] of options) s.append(new Option(label, v));
  s.value = value;
  s.onchange = () => onChange(s.value);
}

function renderControls() {
  const search = $<HTMLInputElement>('search');
  search.value = filters.q;
  search.oninput = () => {
    filters.q = search.value.trim();
    update();
  };
  select('way', [['', 'Any way'], ...WAYS.filter((w) => ITEMS.some((i) => i.ways.some((x) => x.way === w.id))).map((w) => [w.id, w.name] as [string, string])],
    filters.way, (v) => { filters.way = v; update(); });
  select('theme', [['', 'Any theme'], ...themesIn(ITEMS).map((t) => [t, THEMES[t]] as [string, string]), ['none', 'No theme']],
    filters.theme, (v) => { filters.theme = v; update(); });
  select('status', [['', 'Everything'], ['live', 'In the game now'], ['later', 'Future update']], filters.status, (v) => { filters.status = v; update(); });
  select('sort', [['category', 'By category'], ['name', 'By name'], ['price', 'By price']], filters.sort, (v) => { filters.sort = v; update(); });
  const noArt = $<HTMLInputElement>('noart');
  noArt.checked = filters.noArt;
  noArt.onchange = () => {
    filters.noArt = noArt.checked;
    update();
  };
}

function renderCats() {
  const nav = $('cats');
  nav.innerHTML = '';
  const all = ITEMS.filter((i) => matches(i, filters, true));
  const chip = (id: string, label: string, n: number) => {
    const b = el('button', id === filters.cat ? 'on' : '');
    b.append(label, text('small', 'n', String(n)));
    b.setAttribute('aria-pressed', String(id === filters.cat));
    b.disabled = n === 0 && id !== filters.cat;
    b.onclick = () => {
      filters.cat = id;
      update();
    };
    nav.append(b);
  };
  chip('', 'All', all.length);
  for (const c of CATEGORIES) chip(c.id, c.name, all.filter((i) => i.category === c.id).length);
}

function row(it: CatalogItem): HTMLElement {
  const d = el('details', `item${it.later ? ' is-later' : ''}`);
  d.dataset.key = it.key;
  const s = el('summary');

  const name = el('div', 'name');
  name.append(text('b', '', it.name));
  const sub = el('small');
  sub.textContent = `${it.kind}${it.stars ? ` · ${'★'.repeat(it.stars)}` : ''}`;
  name.append(sub);

  const cost = el('div', 'costs');
  if (it.cost.length) it.cost.forEach((c) => cost.append(costChip(c)));
  else cost.append(text('span', 'muted', it.ways.some((w) => w.way === 'start') ? 'Free' : 'Not sold'));
  if (it.worth !== undefined && !it.cost.length) cost.append(text('small', 'worth', `worth ${it.worth}`));

  const ways = el('div', 'ways');
  for (const w of [...new Set(it.ways.map((x) => x.way))]) ways.append(text('span', `way is-${w}`, wayName(w)));

  const tags = el('div', 'tags');
  if (it.theme) tags.append(text('span', `theme is-${it.theme}`, THEMES[it.theme] ?? it.theme));
  if (it.later) tags.append(text('span', 'later', 'Future update'));
  if (it.missingArt) tags.append(text('span', 'noart', 'No art'));

  s.append(artOf(it), name, cost, ways, tags);
  d.append(s);

  // The details: every way, what it's for, and the rest.
  const body = el('div', 'detail');
  const block = (title: string, lines: string[]) => {
    if (!lines.length) return;
    const b = el('div', 'block');
    b.append(text('h4', '', title));
    const ul = el('ul');
    lines.forEach((l) => ul.append(text('li', '', l)));
    b.append(ul);
    body.append(b);
  };
  block('How you get it', it.ways.map((w) => w.text));
  block('What it does', it.uses.filter(Boolean));
  block('Details', [
    ...it.about.filter(Boolean),
    ...(it.worth !== undefined ? [`Worth ${it.worth} gold (what Percy pays from and dishes are valued by)`] : []),
    ...(it.theme ? [`Theme: ${THEMES[it.theme]} (only found at that theme's places)`] : []),
    ...(it.laterNote ? [`Future update: ${it.laterNote}`] : []),
  ]);
  body.append(text('code', 'key', it.key));
  d.append(body);
  return d;
}

function renderItems() {
  const list = ITEMS.filter((i) => matches(i, filters));
  const order = CATEGORIES.map((c) => c.id as string);
  const sorted = [...list].sort((a, b) => {
    if (filters.sort === 'name') return a.name.localeCompare(b.name);
    if (filters.sort === 'price') return priceOf(b) - priceOf(a);
    return order.indexOf(a.category) - order.indexOf(b.category);
  });
  const main = $('items');
  main.innerHTML = '';
  const head = el('div', 'item-head');
  ['', 'Item', 'Cost', 'How you get it', 'Theme / update'].forEach((h) => head.append(text('span', '', h)));
  main.append(head);
  let lastCat = '';
  for (const it of sorted) {
    if (filters.sort === 'category' && !filters.cat && it.category !== lastCat) {
      main.append(text('h2', 'cat-title', catName(it.category)));
      lastCat = it.category;
    }
    main.append(row(it));
  }
  if (!sorted.length) main.append(text('p', 'empty', 'Nothing matches these filters.'));
  const later = list.filter((i) => i.later).length;
  const noArt = list.filter((i) => i.missingArt).length;
  $('summary').textContent = `${list.length} of ${ITEMS.length} items` +
    (later ? ` · ${later} waiting for a future update` : '') + (noArt ? ` · ${noArt} without art` : '');
}

function update() {
  save();
  renderCats();
  renderItems();
}

renderControls();
update();
