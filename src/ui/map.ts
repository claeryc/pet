// The map (Menu > Map): the home island with the places you walk to, and
// the sea behind the ship with the journey places, each its own island.
//
//   ┌──────────── [ Map ] ────────────┐
//   │        ╭──────────────╮         │
//   │        │ Backyard   × │         │   <- tap a place: a bubble pops up
//   │        │ Honey ready! │         │      over its sign, with its news
//   │        │ [    Go    ] │         │      and its button
//   │        ╰──────v───────╯         │
//   │  (the island, signs on   [🍯]   │   <- a little picture on a sign
//   │   each area, the pet at home)   │      when something's waiting
//   ├─────────────────────────────────┤
//   │  [ Close ]                      │
//   └─────────────────────────────────┘
//
// On the sea, each journey island has a flag per trip on the board that
// goes there (gold for a 3-star Adventure, a moon for the night trip), and
// its bubble shows those trips as postcards. An island no trip goes to
// right now is misty; one not open yet is under clouds.
//
// The picture is one PNG per map, drawn in art/map/<map>.aseprite. Each
// area is a tap shape from that file (an SVG path over the picture), so
// the map looks like one place but every area can be tapped on its own.
// The areas and what they open are in src/data/map.json, the card's words
// in src/game/map.ts. See docs/MAP_GUIDE.md for adding an area.

import { STRINGS } from '../strings';
import { sheetFor } from '../game/growth';
import { MAPS, START_MAP, areaCard, extraShown, firstPick, parseOpens, petAt, type AreaCard, type Badge, type MapAreaDef, type Opens } from '../game/map';
import { bubbleHtml } from './mapBubbles';
import { isEpicOffer } from '../game/journeys';
import type { Offer } from '../game/state';
import { ITEM_ICONS, MENU_ICONS, STAT_ICONS } from './icons';
import { postcard } from './journeys';
import { isNight } from '../game/stats';
import type { GameState } from '../game/state';

export interface MapFile {
  width: number;
  height: number;
  night: boolean;
  locked: string[];
  areas: Record<string, { shape: string; box: number[]; label: [number, number]; pin: [number, number]; flag?: [number, number] }>;
  // Buildings laid over the picture once they're there (src/game/map.ts
  // extraShown): <map>-x-<id>.png.
  extras?: { id: string; when: string }[];
}

// A place shown off when it opens: what the card says.
export interface MapIntro {
  title: string;
  line: string;
  button: string;
  unlock: string; // its buildings pop up, its clouds part
}

export interface MapCallbacks {
  characterImage: (sheet: string) => string | undefined;
  onClose: () => void;
  // An area's button: go home, to the garden, plan a trip to a place...
  onOpen: (opens: Opens) => void;
  onJournal: (place: string | null) => void; // the travel journal, at a place
  onTrip: (slot: number) => void; // a postcard picked: the trip board, with it turned over
  // The map lab (map-lab.html) changes what each card says, to try out
  // locked, misty, ticket and badge looks without playing to them.
  preview?: (area: MapAreaDef, card: AreaCard) => AreaCard;
}

export interface WorldMap {
  el: HTMLElement;
  open: (map?: string) => void;
  close: () => void;
  isOpen: () => boolean;
  update: (state: GameState, now: number) => void;
  // For the map lab: open a place's bubble, show a map file that isn't
  // saved yet, or load everything again after an export.
  pick: (id: string) => void;
  useFile: (id: string, file: MapFile) => void;
  reload: () => void;
  // Opens map `mapId` and shows off its area `area`: the rest dims, the
  // place appears, and a card says what it is. `onGo`: its button.
  intro: (mapId: string, area: string, card: MapIntro, onGo: () => void) => void;
}

const SVG = 'http://www.w3.org/2000/svg';
const files = new Map<string, Promise<MapFile>>();
let version = ''; // "?v=..." after a reload, so the browser fetches the new export
const base = () => `${import.meta.env.BASE_URL}sprites/map/`;
function loadMap(id: string): Promise<MapFile> {
  if (!files.has(id)) files.set(id, fetch(`${base()}${id}.json${version}`).then((r) => r.json()));
  return files.get(id)!;
}

// A little pixel boat for the sea map, under the pet on a trip.
const BOAT = `<svg viewBox="0 0 15 13" shape-rendering="crispEdges" aria-hidden="true">
  <path fill="#e05a7a" d="M7 0h1v1H7zM7 1h2v1H7z"/>
  <path fill="#5c3a2e" d="M7 2h1v7H7zM0 9h15v1H0zM0 10h1v1H0zM14 10h1v1h-1zM1 11h1v1H1zM13 11h1v1h-1zM2 12h11v1H2z"/>
  <path fill="#ffffff" d="M8 3h2v1H8zM8 4h3v1H8zM8 5h4v1H8zM8 6h5v1H8zM8 7h6v1H8zM4 11h1v1H4zM8 11h1v1H8z"/>
  <path fill="#8a5a44" d="M1 10h13v1H1zM2 11h2v1H2zM5 11h3v1H5zM9 11h4v1H9z"/>
</svg>`;

// The trip flags on the sea islands, as tiny pixel pictures: a pennant
// for a Stroll, a swallowtail for a Hike, a gold banner for an Adventure
// and a moon flag for the night trip. (Placeholders until the art is in:
// see the Map art brief.)
const FLAG_ROWS: Record<string, string[]> = {
  common: ['.kkkk.', '.kmmmk', '.kMmmk', '.kkkk.', '.k....', '.k....', '.k....', 'kpk...'],
  rare: ['.kkkkkk.', '.ksssssk', '.kSssssk', '.ksss.k.', '.kss.k..', '.kkk....', '.k......', '.k......', '.k......', 'kpk.....'],
  epic: ['..kkkkkkk.', '..kgggggk.', '..kggyggk.', '..kgyyygk.', '..kggyggk.', '..kGgggGk.', '..kGG.GGk.', '..kk...kk.', '..k.......', '..k.......', '..k.......', '.kpk......'],
  night: ['.kkkkkk.', '.kllllk.', '.klyyLk.', '.kly.Lk.', '.klyyLk.', '.kLlllk.', '.kk..kk.', '.k......', '.k......', '.k......', 'kpk.....'],
};
const FLAG_INK: Record<string, string> = {
  k: '#3b2a4a', p: '#8a5a3c', m: '#7fd6b0', M: '#4fb08a', s: '#9ad3f0', S: '#5a8fd6',
  g: '#ffd36e', G: '#e0a83a', y: '#fff3a0', l: '#c9b6f0', L: '#8e74c8',
};
function pixelSvg(rows: string[], ink: Record<string, string>): string {
  let rects = '';
  rows.forEach((row, y) => [...row].forEach((ch, x) => {
    if (ink[ch]) rects += `<rect x="${x}" y="${y}" width="1" height="1" fill="${ink[ch]}"/>`;
  }));
  return `<svg viewBox="0 0 ${rows[0].length} ${rows.length}" width="${rows[0].length}" height="${rows.length}" shape-rendering="crispEdges" aria-hidden="true">${rects}</svg>`;
}
const flagKind = (o: Offer) => (o.night ? 'night' : o.rarity);
const FLAGS = Object.fromEntries(Object.entries(FLAG_ROWS).map(([k, rows]) => [k, pixelSvg(rows, FLAG_INK)]));

// The little picture on a sign for what's waiting there.
const BADGES: Record<Badge, string> = {
  fish: ITEM_ICONS.fish ?? ITEM_ICONS.paw,
  dig: ITEM_ICONS.dig ?? ITEM_ICONS.paw,
  lock: '',
  project: ITEM_ICONS.workbench,
  water: STAT_ICONS.drop,
  honey: ITEM_ICONS.honey,
  crop: ITEM_ICONS.carrot,
  visitor: MENU_ICONS.meet ?? ITEM_ICONS.meet ?? ITEM_ICONS.paw,
  mail: ITEM_ICONS.letter,
  backpack: ITEM_ICONS.journey,
  epic: FLAGS.epic,
  night: FLAGS.night,
  trip: FLAGS.common,
};

function el<K extends keyof HTMLElementTagNameMap>(tag: K, className: string, text?: string): HTMLElementTagNameMap[K] {
  const e = document.createElement(tag);
  e.className = className;
  if (text !== undefined) e.textContent = text;
  return e;
}

export function createMap(cb: MapCallbacks): WorldMap {
  const S = STRINGS.map;
  const root = el('div', 'map-screen');
  root.hidden = true;
  root.setAttribute('role', 'dialog');
  root.setAttribute('aria-modal', 'true');

  const top = el('div', 'map-top');
  const sign = el('div', 'map-sign');
  top.append(sign);

  const view = el('div', 'map-view');
  const stage = el('div', 'map-stage');
  const picture = el('img', 'map-picture');
  picture.alt = '';
  picture.draggable = false;
  const extras = el('div', 'map-extras');
  const covers = el('div', 'map-covers');
  const lights = el('img', 'map-lights');
  lights.alt = '';
  lights.draggable = false;
  const shapes = document.createElementNS(SVG, 'svg');
  shapes.classList.add('map-shapes');
  const marks = el('div', 'map-marks');
  stage.append(picture, extras, lights, covers, shapes, marks); // lights under the clouds
  // A little dark tooltip over a place: its name when held, why it's
  // locked, or when Percy's back.
  const tip = el('div', 'map-tip');
  tip.hidden = true;
  tip.setAttribute('role', 'status');
  stage.append(tip);
  view.append(stage);

  // The bubble over a picked place's sign: its name and news, its trips
  // as postcards on the sea, and its button.
  const pop = el('div', 'map-pop');
  stage.append(pop);
  const bubble = el('div', 'map-bubble');
  bubble.setAttribute('role', 'dialog');
  const shut = el('button', 'map-bubble-x', '×');
  shut.setAttribute('aria-label', S.closeBubble);
  const head = el('div', 'map-bubble-head');
  const badge = el('span', 'map-bubble-badge');
  const title = el('b', 'map-name');
  head.append(badge, title);
  const text = el('div', 'map-text');
  text.setAttribute('aria-live', 'polite');
  const cards = el('div', 'map-bubble-cards');
  const go = el('button', 'map-go');
  bubble.append(shut, head, text, cards, go);
  shut.addEventListener('click', () => pick(''));

  // On a close-up map (the Backyard): back to the island, top left.
  const upBack = el('button', 'map-up');
  top.prepend(upBack);
  upBack.addEventListener('click', () => zoomOut());

  // Showing off a new place: the map dims round it, then a card.
  const introDim = el('div', 'map-intro-dim');
  const introRing = el('div', 'map-intro-ring');
  introDim.append(introRing);
  const introCard = el('div', 'map-intro-card');
  introCard.setAttribute('role', 'dialog');
  const introNew = el('span', 'map-intro-new', S.newPlace);
  const introTitle = el('b', 'map-intro-title');
  const introLine = el('p', 'map-intro-line');
  const introGo = el('button', 'map-intro-go');
  introCard.append(introNew, introTitle, introLine, introGo);
  introDim.hidden = true;
  introCard.hidden = true;
  stage.append(introDim);

  const row = el('div', 'map-row');
  const back = el('button', 'btn map-back');
  const journal = el('button', 'btn map-journal', S.journal);
  row.append(back, journal);

  root.append(top, view, row, introCard);

  let mapId = START_MAP;
  let file: MapFile | null = null;
  let picked = '';
  let latest: { state: GameState; now: number } | null = null;
  let token = 0; // so a slow load for an old map is dropped
  let drawn = ''; // what was drawn last (see update)
  let intro: { area: string; unlock: string; onGo: () => void } | null = null;
  const plain = () => !!MAPS[mapId].plain;
  const still = () => matchMedia('(prefers-reduced-motion: reduce)').matches;

  const areas = () => MAPS[mapId].areas;
  const cardFor = (id: string): AreaCard | null => {
    const a = areas().find((x) => x.id === id);
    if (!a || !latest) return null;
    const c = areaCard(latest.state, latest.now, a);
    return cb.preview ? cb.preview(a, c) : c;
  };

  // Fits the picture inside the view, as big as it goes, sea around it.
  function fit(): void {
    if (!file) return;
    const w = view.clientWidth, h = view.clientHeight;
    if (!w || !h) return;
    // A plain map fills the screen (the sea runs off the edges); the sea
    // map fits inside it.
    const scale = plain() ? Math.max(w / file.width, h / file.height) : Math.min(w / file.width, h / file.height);
    stage.style.width = `${Math.floor(file.width * scale)}px`;
    stage.style.height = `${Math.floor(file.height * scale)}px`;
    stage.style.setProperty('--flag-px', `${scale}px`);
    if (picked && file.areas[picked] && bubble.isConnected) place(file.areas[picked].label);
  }
  new ResizeObserver(fit).observe(view);

  function pick(id: string): void {
    picked = id;
    drawn = '';
    draw();
  }

  // A tap on the sea or the sky (not on a place) closes the bubble; on a
  // close-up map it zooms back out.
  view.addEventListener('click', (e) => {
    if (!(e.target === view || e.target === stage || e.target === shapes || e.target === picture)) return;
    if (intro) return endIntro();
    if (plain()) {
      if (performance.now() < holdUntil) return;
      if (!tip.hidden) return hideTip();
      if (MAPS[mapId].back) zoomOut();
      return;
    }
    pick('');
  });

  go.addEventListener('click', () => {
    const area = areas().find((a) => a.id === picked);
    const c = cardFor(picked);
    if (!area || !c?.enabled) return;
    const opens = parseOpens(area.opens);
    if (!opens) return;
    if (opens.kind === 'map') return show(opens.map);
    cb.onOpen(opens);
  });
  back.addEventListener('click', () => {
    const to = MAPS[mapId].back;
    if (to) show(to);
    else cb.onClose();
  });
  journal.addEventListener('click', () => {
    const o = parseOpens(areas().find((a) => a.id === picked)?.opens ?? '');
    cb.onJournal(o?.kind === 'journey' ? o.place : null);
  });

  // Builds the tap shapes and signs for the map just loaded.
  function build(): void {
    if (!file) return;
    shapes.setAttribute('viewBox', `0 0 ${file.width} ${file.height}`);
    shapes.innerHTML = `<defs><filter id="map-ring" x="-10%" y="-10%" width="120%" height="120%">
      <feMorphology in="SourceAlpha" operator="dilate" radius="1.5" result="grown"/>
      <feComposite in="grown" in2="SourceAlpha" operator="out" result="ring"/>
      <feFlood flood-color="#ffe596"/><feComposite in2="ring" operator="in"/></filter></defs>`;
    const ring = document.createElementNS(SVG, 'path');
    ring.classList.add('map-ring');
    ring.setAttribute('filter', 'url(#map-ring)');
    const glow = document.createElementNS(SVG, 'path');
    glow.classList.add('map-glow');
    shapes.append(glow, ring);
    for (const a of areas()) {
      const shape = file.areas[a.id];
      if (!shape) continue;
      const p = document.createElementNS(SVG, 'path');
      p.setAttribute('d', shape.shape);
      p.classList.add('map-hit');
      p.dataset.area = a.id;
      p.addEventListener('click', (e) => {
        e.stopPropagation();
        if (plain()) activate(a.id);
        else pick(a.id);
      });
      holdable(p, a.id);
      shapes.append(p);
    }
  }

  function draw(): void {
    if (!file || !latest) return;
    const { state, now } = latest;
    const night = isNight(now);
    root.classList.toggle('is-night', night);
    lights.hidden = !night || !file.night;
    sign.textContent = MAPS[mapId].title;
    const backTo = MAPS[mapId].back;
    // On the island the way out is home; out at sea, back to the island.
    if (backTo) back.textContent = S.back(MAPS[backTo].title);
    else back.innerHTML = `<span class="map-back-icon" aria-hidden="true">${ITEM_ICONS.roomDoor}</span>${S.home}`;
    journal.hidden = !backTo;
    root.classList.toggle('is-plain', plain());
    upBack.hidden = !plain() || !backTo;
    if (backTo) upBack.textContent = `‹ ${MAPS[backTo].title}`;
    if (plain()) {
      // On a plain map the way out at the bottom is always home.
      back.innerHTML = `<span class="map-back-icon" aria-hidden="true">${ITEM_ICONS.roomDoor}</span>${S.home}`;
      journal.hidden = true;
    }
    // Buildings that are there now (the Workshop once it's open, the
    // beehive once it's built, Percy's perch with or without Percy).
    extras.replaceChildren(...(file.extras ?? []).filter((x) => extraShown(state, now, x.when)).map((x) => {
      const img = el('img', `map-extra${intro && intro.unlock === x.when ? ' is-appearing' : ''}`);
      img.src = `${base()}${mapId}-x-${x.id}.png${version}`;
      img.alt = '';
      img.draggable = false;
      return img;
    }));

    // Clouds over what's still locked.
    const locked = new Set(areas().filter((a) => cardFor(a.id)?.locked).map((a) => a.id));
    // Mist (the same cover, thin) over a journey island no trip goes to.
    const misty = new Set(areas().filter((a) => cardFor(a.id)?.mist).map((a) => a.id));
    const parting = intro && file.locked.includes(intro.area) ? intro.area : '';
    covers.replaceChildren(...file.locked.filter((id) => locked.has(id) || misty.has(id) || id === parting).map((id) => {
      const img = el('img', `map-cover${misty.has(id) && !locked.has(id) ? ' is-mist' : ''}${id === parting ? ' is-parting' : ''}`);
      img.src = `${base()}${mapId}-locked-${id}.png${version}`;
      img.alt = '';
      img.draggable = false;
      return img;
    }));

    // The picked area: a soft glow and a butter ring around it.
    // (none on the plain maps: a tap goes straight there)
    const shape = plain() ? '' : file.areas[picked]?.shape ?? '';
    shapes.querySelector('.map-ring')?.setAttribute('d', shape);
    shapes.querySelector('.map-glow')?.setAttribute('d', shape);

    // Signs, dots, and the pet.
    const pct = (x: number, y: number) => `left:${(x / file!.width) * 100}%;top:${(y / file!.height) * 100}%`;
    const signs = plain() ? bubbles() : areas().map((a) => {
      const c = cardFor(a.id)!;
      const at = file!.areas[a.id];
      const b = el('button', `map-label${a.id === picked ? ' is-picked' : ''}${c.locked ? ' is-locked' : ''}`, c.name);
      if (!at) b.hidden = true;
      else b.setAttribute('style', pct(...at.label));
      // A badge for each thing waiting there: the first two, then "+1".
      const news = c.news?.length ? c.news.map((n) => n.badge) : c.badge ? [c.badge] : [];
      if (news.length) {
        const stack = el('span', `map-badges${news.length > 1 ? ' is-many' : ''}`);
        for (const one of news.slice(0, 2)) {
          const pic = el('span', `map-badge is-${one}`);
          pic.innerHTML = BADGES[one];
          stack.append(pic);
        }
        if (news.length > 2) stack.append(el('span', 'map-badge is-more', S.moreNews(news.length - 2)));
        b.append(stack);
      } else if (c.dot) b.append(el('span', 'map-dot'));
      // What's going on there, in a word or two, under its name.
      if ((c.dot || c.good) && !c.locked && !c.tickets) {
        b.classList.add('has-status');
        b.append(el('span', 'map-status', (c.news?.[0]?.text ?? c.text).replace(/[.!]$/, '')));
      }
      b.addEventListener('click', (e) => {
        e.stopPropagation();
        pick(a.id === picked ? '' : a.id);
      });
      return b;
    });
    // A flag on each journey island for every trip that goes there.
    const flags = areas().flatMap((a) => {
      const c = cardFor(a.id);
      const at = file!.areas[a.id];
      if (!c?.tickets?.length || !at) return [];
      const f = el('div', 'map-flags');
      f.setAttribute('style', pct(...(at.flag ?? at.pin)));
      for (const t of c.tickets) {
        const kind = flagKind(t.offer);
        const one = el('span', `map-flag is-${kind}`);
        one.innerHTML = FLAGS[kind];
        one.style.setProperty('--w', String(FLAG_ROWS[kind][0].length));
        f.append(one);
      }
      return [f];
    });
    // Locked areas without clouds of their own are shaded instead.
    for (const p of shapes.querySelectorAll<SVGPathElement>('.map-hit')) {
      const c = cardFor(p.dataset.area!);
      p.setAttribute('aria-label', c ? `${c.name}. ${c.text}` : '');
      p.classList.toggle('is-locked', !!c?.locked && !file.locked.includes(p.dataset.area!));
      p.classList.toggle('is-gone', !!c?.hidden);
      if (plain() && c) p.setAttribute('aria-label', c.locked ? `${c.name}. ${c.text}` : c.tellOnly ? `${c.name}. ${c.text}` : c.name + (c.news?.length ? `. ${c.news.map((n) => n.text).join('. ')}` : ''));
    }
    const marksNow: HTMLElement[] = [...flags, ...signs];
    const where = petAt(state, now, mapId);
    if (where && file.areas[where.area]) {
      const face = cb.characterImage(sheetFor(state.pet));
      const pin = el('div', 'map-pet');
      if (face) {
        const img = el('img', '');
        img.src = face;
        img.alt = '';
        pin.append(img);
      }
      const homeArea = areas().find((a) => a.opens === `map:${START_MAP}`);
      if (where.share < 1 || (homeArea && where.area !== homeArea.id && areas().some((a) => a.opens.startsWith('journey:')))) {
        // At sea: on the boat, between the dock and the place.
        const from = homeArea ? file.areas[homeArea.id]?.pin : null;
        const to = file.areas[where.area].pin;
        const x = from ? from[0] + (to[0] - from[0]) * where.share : to[0];
        const y = from ? from[1] + (to[1] - from[1]) * where.share : to[1];
        pin.classList.add('is-sailing');
        pin.insertAdjacentHTML('beforeend', BOAT);
        pin.setAttribute('style', pct(x, y));
      } else {
        pin.setAttribute('style', pct(...file.areas[where.area].pin));
      }
      pin.title = S.youAreHere;
      marksNow.push(pin);
    }
    marks.replaceChildren(...marksNow);

    // The bubble (not on a plain map: a tap goes straight there).
    if (plain()) {
      pop.replaceChildren();
      return;
    }
    const c = cardFor(picked);
    const at = file.areas[picked];
    if (!c || !at) {
      pop.replaceChildren();
      return;
    }
    title.textContent = c.name;
    const trips = c.tickets ?? [];
    // Several things waiting (and no postcards to show them): a line for
    // each, with its picture. One thing: its picture by the name.
    const lines = !trips.length && (c.news?.length ?? 0) > 1 ? c.news! : [];
    if (lines.length) {
      text.replaceChildren(...lines.map((n) => {
        const line = el('span', 'map-news');
        const pic = el('span', `map-news-badge is-${n.badge}`);
        pic.innerHTML = BADGES[n.badge];
        line.append(pic, el('span', '', n.text));
        return line;
      }));
    } else text.textContent = c.text;
    text.classList.toggle('is-good', c.good);
    text.classList.toggle('is-list', lines.length > 0);
    const one = lines.length ? undefined : c.badge;
    badge.innerHTML = one ? BADGES[one] : '';
    badge.hidden = !one;
    badge.className = `map-bubble-badge${one ? ` is-${one}` : ''}`;
    cards.replaceChildren(...trips.map((t) => {
      const card = postcard(t.offer, () => cb.onTrip(t.slot), null);
      if (isEpicOffer(t.offer)) card.append(el('span', 'map-epic-ribbon', S.epic));
      return card;
    }));
    cards.hidden = !trips.length;
    cards.classList.toggle('is-one', trips.length === 1);
    bubble.classList.toggle('has-cards', trips.length > 0);
    bubble.classList.toggle('is-epic', trips.some((t) => isEpicOffer(t.offer)));
    go.textContent = c.button;
    go.disabled = !c.enabled;
    go.hidden = trips.length > 0 || c.locked;
    go.classList.toggle('is-soft', !!c.mist);
    go.classList.toggle('is-trip', c.button === S.planTrip || c.button === S.setSail || c.button === S.sailHome);
    if (bubble.parentElement !== pop) pop.replaceChildren(bubble);
    place(at.label);
  }

  // Puts the bubble over the sign at `label` (its bottom middle), kept
  // inside the view; under the sign when there's no room above. The tail
  // still points at the sign.
  function place(label: [number, number]): void {
    if (!file) return;
    const sw = stage.clientWidth, sh = stage.clientHeight;
    const x = (label[0] / file.width) * sw;
    const y = (label[1] / file.height) * sh;
    const sr = stage.getBoundingClientRect(), vr = view.getBoundingClientRect();
    const k = sr.width / sw || 1; // on screen vs. layout size (the map lab scales the phone)
    const w = bubble.offsetWidth, h = bubble.offsetHeight;
    const SIGN = 26, GAP = 12, EDGE = 8;
    const minX = (vr.left - sr.left) / k + EDGE, maxX = (vr.right - sr.left) / k - EDGE - w;
    const left = Math.max(minX, Math.min(maxX, x - w / 2));
    let top = y - SIGN - GAP - h;
    const below = top < (vr.top - sr.top) / k + EDGE;
    if (below) top = Math.min(y + GAP, (vr.bottom - sr.top) / k - EDGE - h);
    bubble.classList.toggle('is-below', below);
    bubble.style.left = `${left}px`;
    bubble.style.top = `${top}px`;
    bubble.style.setProperty('--tail', `${Math.max(18, Math.min(w - 18, x - left))}px`);
  }

  function show(id: string, after?: () => void): void {
    mapId = MAPS[id] ? id : START_MAP;
    hideTip();
    const mine = ++token;
    picture.src = `${base()}${mapId}.png${version}`;
    lights.src = `${base()}${mapId}-night.png${version}`;
    if (latest) picked = firstPick(latest.state, latest.now, mapId);
    loadMap(mapId).then((f) => {
      if (mine !== token) return;
      file = f;
      drawn = '';
      build();
      fit();
      draw();
      after?.();
    });
  }

  // ---- Plain maps: bubbles, taps, holds, zooming ----

  // The round bubbles: one over each place with something waiting (its
  // first piece of news), a padlock over a locked place.
  function bubbles(): HTMLElement[] {
    if (!file) return [];
    return areas().flatMap((a) => {
      const c = cardFor(a.id);
      const at = file!.areas[a.id];
      if (!c || !at || c.hidden) return [];
      const icon = c.locked ? 'lock' : intro?.area === a.id ? 'star' : c.news?.[0]?.badge ?? c.bubble;
      if (!icon) return [];
      const b = el('button', `map-bubble-pin is-${icon}`);
      b.innerHTML = bubbleHtml(icon, c.news?.[0]?.count ?? 0);
      b.setAttribute('style', `left:${(at.label[0] / file!.width) * 100}%;top:${(at.label[1] / file!.height) * 100}%`);
      b.setAttribute('aria-label', c.locked ? `${c.name}. ${c.text}` : `${c.name}. ${c.news?.[0]?.text ?? c.text}`);
      b.addEventListener('click', (e) => {
        e.stopPropagation();
        activate(a.id);
      });
      holdable(b, a.id);
      return [b];
    });
  }

  // A tap on a place: straight there. A locked place, or Percy's empty
  // perch, says why in a tooltip instead.
  function activate(id: string): void {
    if (performance.now() < holdUntil || intro) return;
    const a = areas().find((x) => x.id === id);
    const c = cardFor(id);
    if (!a || !c || c.hidden) return;
    if (c.locked || c.tellOnly) return showTip(id, c.text);
    const opens = parseOpens(a.opens);
    if (!opens || !c.enabled) return;
    hideTip();
    if (opens.kind === 'map') return MAPS[opens.map]?.plain ? zoomTo(id, opens.map) : show(opens.map);
    cb.onOpen(opens);
  }

  // Holding a place shows its name (the art says what it is; this is for
  // when you forget).
  let holdTimer = 0;
  let holdUntil = 0; // the click that ends a hold doesn't count as a tap
  function holdable(target: Element, id: string): void {
    let x = 0, y = 0;
    target.addEventListener('pointerdown', (e) => {
      const p = e as PointerEvent;
      x = p.clientX;
      y = p.clientY;
      clearTimeout(holdTimer);
      holdTimer = window.setTimeout(() => {
        const c = cardFor(id);
        if (!c || c.hidden) return;
        holdUntil = performance.now() + 600;
        showTip(id, c.name, true);
      }, 450);
    });
    target.addEventListener('pointermove', (e) => {
      const p = e as PointerEvent;
      if (Math.hypot(p.clientX - x, p.clientY - y) > 8) clearTimeout(holdTimer);
    });
    for (const ev of ['pointerup', 'pointercancel', 'pointerleave']) target.addEventListener(ev, () => clearTimeout(holdTimer));
    target.addEventListener('contextmenu', (e) => e.preventDefault());
  }

  let tipTimer = 0;
  function showTip(id: string, words: string, name = false): void {
    const at = file?.areas[id];
    if (!at || !file) return;
    tip.textContent = words;
    tip.classList.toggle('is-name', name);
    tip.hidden = false;
    // Over its bubble spot; kept inside the screen.
    const x = (at.label[0] / file.width) * 100;
    tip.style.left = `${x}%`;
    tip.style.top = `${(at.label[1] / file.height) * 100}%`;
    const sr = stage.getBoundingClientRect(), vr = view.getBoundingClientRect();
    const k = sr.width / (stage.clientWidth || 1) || 1;
    const tr = tip.getBoundingClientRect();
    const shift = Math.max(vr.left + 8 - tr.left, Math.min(0, vr.right - 8 - tr.right));
    tip.style.setProperty('--shift', `${shift / k}px`);
    clearTimeout(tipTimer);
    tipTimer = window.setTimeout(hideTip, 2600);
  }
  function hideTip(): void {
    clearTimeout(tipTimer);
    tip.hidden = true;
  }

  // Zooming into a close-up (the Backyard) from the place on this map,
  // and back out to it.
  function centre(id: string): string {
    const at = file?.areas[id];
    if (!at || !file) return '50% 50%';
    const [x, y, w, h] = at.box;
    return `${((x + w / 2) / file.width) * 100}% ${((y + h / 2) / file.height) * 100}%`;
  }
  function zoomTo(id: string, to: string): void {
    if (still()) return show(to);
    stage.style.transformOrigin = centre(id);
    const out = stage.animate([{ transform: 'scale(1)', opacity: 1 }, { transform: 'scale(2.6)', opacity: 0 }], { duration: 340, easing: 'ease-in' });
    out.onfinish = () => show(to, () => {
      stage.style.transformOrigin = '50% 50%';
      stage.animate([{ transform: 'scale(0.9)', opacity: 0 }, { transform: 'scale(1)', opacity: 1 }], { duration: 260, easing: 'ease-out' });
    });
  }
  function zoomOut(): void {
    const to = MAPS[mapId].back;
    if (!to) return;
    const from = mapId;
    if (still()) return show(to);
    const out = stage.animate([{ opacity: 1, transform: 'scale(1)' }, { opacity: 0, transform: 'scale(0.9)' }], { duration: 200, easing: 'ease-in' });
    out.onfinish = () => show(to, () => {
      const there = MAPS[to].areas.find((a) => a.opens === `map:${from}`);
      stage.style.transformOrigin = there ? centre(there.id) : '50% 50%';
      stage.animate([{ transform: 'scale(2.6)', opacity: 0 }, { transform: 'scale(1)', opacity: 1 }], { duration: 340, easing: 'ease-out' });
    });
  }

  // ---- Showing off a new place ----
  let introTimer = 0;
  function startIntro(area: string, card: MapIntro, onGo: () => void): void {
    if (!file) return;
    const at = file.areas[area];
    if (!at) return;
    intro = { area, unlock: card.unlock, onGo };
    const [x, y, w, h] = at.box;
    const cx = ((x + w / 2) / file.width) * 100, cy = ((y + h / 2) / file.height) * 100;
    // The dim reaches past the stage on every side (inset: -50%).
    introDim.style.setProperty('--x', `${25 + cx / 2}%`);
    introDim.style.setProperty('--y', `${25 + cy / 2}%`);
    introDim.style.setProperty('--r', `${Math.max(40, (Math.max(w, h) / file.width) * stage.clientWidth * 0.55)}px`);
    introDim.hidden = false;
    introTitle.textContent = card.title;
    introLine.textContent = card.line;
    introGo.textContent = card.button;
    drawn = '';
    draw();
    clearTimeout(introTimer);
    introTimer = window.setTimeout(() => (introCard.hidden = false), still() ? 0 : 1300);
  }
  function endIntro(): void {
    clearTimeout(introTimer);
    intro = null;
    introDim.hidden = true;
    introCard.hidden = true;
    drawn = '';
    draw();
  }
  introGo.addEventListener('click', () => {
    const was = intro;
    endIntro();
    if (!was) return;
    activate(was.area);
    was.onGo();
  });

  return {
    el: root,
    open: (id = START_MAP) => {
      root.hidden = false;
      show(id);
      requestAnimationFrame(fit);
    },
    close: () => {
      if (intro) endIntro();
      hideTip();
      root.hidden = true;
    },
    isOpen: () => !root.hidden,
    update: (state, now) => {
      latest = { state, now };
      if (root.hidden) return;
      // Only redraw when something on the map changed, so a sign isn't
      // swapped out from under a finger.
      const where = petAt(state, now, mapId);
      const key = JSON.stringify([
        mapId, isNight(now), areas().map((a) => cardFor(a.id)),
        where && [where.area, Math.round(where.share * 200)], cb.characterImage(sheetFor(state.pet)),
      ]);
      if (key === drawn) return;
      drawn = key;
      draw();
    },
    pick: (id) => pick(id),
    intro: (id, area, card, onGo) => {
      root.hidden = false;
      show(id, () => startIntro(area, card, onGo));
      requestAnimationFrame(fit);
    },
    useFile: (id, f) => {
      files.set(id, Promise.resolve(f));
      if (id === mapId && !root.hidden) {
        const keep = picked;
        show(id);
        picked = keep;
      }
    },
    reload: () => {
      files.clear();
      version = `?v=${Date.now()}`;
      if (!root.hidden) {
        const keep = picked;
        show(mapId);
        picked = keep;
      }
    },
  };
}
