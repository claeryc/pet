// The map (Menu > Map): the home island with the places you walk to, and
// the sea behind the ship with the journey places, each its own island.
//
//   ┌──────────── [ Map ] ────────────┐
//   │      (the island picture,       │
//   │   signs on each area, the pet   │
//   │   at home, red dots on areas    │
//   │       that need you)            │
//   ├─────────────────────────────────┤
//   │ ‹  Backyard               ›  Go │   <- everything you press is down
//   │    Honey is ready.              │      here, where a thumb reaches
//   ├─────────────────────────────────┤
//   │  [ Close ]                      │
//   └─────────────────────────────────┘
//
// The picture is one PNG per map, drawn in art/map/<map>.aseprite. Each
// area is a tap shape from that file (an SVG path over the picture), so
// the map looks like one place but every area can be tapped on its own.
// The areas and what they open are in src/data/map.json, the card's words
// in src/game/map.ts. See docs/MAP_GUIDE.md for adding an area.

import { STRINGS } from '../strings';
import { sheetFor } from '../game/growth';
import { MAPS, START_MAP, areaCard, firstPick, lockedAreas, parseOpens, petAt, type AreaCard, type Opens } from '../game/map';
import { isNight } from '../game/stats';
import type { GameState } from '../game/state';

interface MapFile {
  width: number;
  height: number;
  night: boolean;
  locked: string[];
  areas: Record<string, { shape: string; box: number[]; label: [number, number]; pin: [number, number] }>;
}

export interface MapCallbacks {
  characterImage: (sheet: string) => string | undefined;
  onClose: () => void;
  // An area's button: go home, to the garden, plan a trip to a place...
  onOpen: (opens: Opens) => void;
  onJournal: (place: string | null) => void; // the travel journal, at a place
}

export interface WorldMap {
  el: HTMLElement;
  open: (map?: string) => void;
  close: () => void;
  isOpen: () => boolean;
  update: (state: GameState, now: number) => void;
}

const SVG = 'http://www.w3.org/2000/svg';
const files = new Map<string, Promise<MapFile>>();
const base = () => `${import.meta.env.BASE_URL}sprites/map/`;
function loadMap(id: string): Promise<MapFile> {
  if (!files.has(id)) files.set(id, fetch(`${base()}${id}.json`).then((r) => r.json()));
  return files.get(id)!;
}

// A little pixel boat for the sea map, under the pet on a trip.
const BOAT = `<svg viewBox="0 0 15 13" shape-rendering="crispEdges" aria-hidden="true">
  <path fill="#e05a7a" d="M7 0h1v1H7zM7 1h2v1H7z"/>
  <path fill="#5c3a2e" d="M7 2h1v7H7zM0 9h15v1H0zM0 10h1v1H0zM14 10h1v1h-1zM1 11h1v1H1zM13 11h1v1h-1zM2 12h11v1H2z"/>
  <path fill="#ffffff" d="M8 3h2v1H8zM8 4h3v1H8zM8 5h4v1H8zM8 6h5v1H8zM8 7h6v1H8zM4 11h1v1H4zM8 11h1v1H8z"/>
  <path fill="#8a5a44" d="M1 10h13v1H1zM2 11h2v1H2zM5 11h3v1H5zM9 11h4v1H9z"/>
</svg>`;

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
  const covers = el('div', 'map-covers');
  const lights = el('img', 'map-lights');
  lights.alt = '';
  lights.draggable = false;
  const shapes = document.createElementNS(SVG, 'svg');
  shapes.classList.add('map-shapes');
  const marks = el('div', 'map-marks');
  stage.append(picture, lights, covers, shapes, marks); // lights under the clouds
  view.append(stage);

  // The card: ‹ name and news ›, and the area's button.
  const card = el('div', 'map-card');
  const prev = el('button', 'map-step', '‹');
  prev.setAttribute('aria-label', S.prev);
  const info = el('div', 'map-info');
  info.setAttribute('aria-live', 'polite');
  const title = el('div', 'map-name');
  const text = el('div', 'map-text');
  info.append(title, text);
  const next = el('button', 'map-step', '›');
  next.setAttribute('aria-label', S.next);
  const go = el('button', 'map-go');
  card.append(prev, info, next, go);

  const row = el('div', 'map-row');
  const back = el('button', 'btn map-back');
  const journal = el('button', 'btn map-journal', S.journal);
  row.append(back, journal);

  root.append(top, view, card, row);

  let mapId = START_MAP;
  let file: MapFile | null = null;
  let picked = '';
  let latest: { state: GameState; now: number } | null = null;
  let token = 0; // so a slow load for an old map is dropped
  let drawn = ''; // what was drawn last (see update)

  const areas = () => MAPS[mapId].areas;
  const cardFor = (id: string): AreaCard | null => {
    const a = areas().find((x) => x.id === id);
    return a && latest ? areaCard(latest.state, latest.now, a) : null;
  };

  // Fits the picture inside the view, as big as it goes, sea around it.
  function fit(): void {
    if (!file) return;
    const w = view.clientWidth, h = view.clientHeight;
    if (!w || !h) return;
    const scale = Math.min(w / file.width, h / file.height);
    stage.style.width = `${Math.floor(file.width * scale)}px`;
    stage.style.height = `${Math.floor(file.height * scale)}px`;
  }
  new ResizeObserver(fit).observe(view);

  function pick(id: string): void {
    picked = id;
    drawn = '';
    draw();
  }

  function step(by: number): void {
    const list = areas();
    const i = list.findIndex((a) => a.id === picked);
    pick(list[(i + by + list.length) % list.length].id);
  }
  prev.addEventListener('click', () => step(-1));
  next.addEventListener('click', () => step(1));

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
      p.addEventListener('click', () => pick(a.id));
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
    back.textContent = backTo ? S.back(MAPS[backTo].title) : S.close;
    journal.hidden = !backTo;

    // Clouds over what's still locked.
    const locked = new Set(lockedAreas(state, now, mapId));
    covers.replaceChildren(...file.locked.filter((id) => locked.has(id)).map((id) => {
      const img = el('img', 'map-cover');
      img.src = `${base()}${mapId}-locked-${id}.png`;
      img.alt = '';
      img.draggable = false;
      return img;
    }));

    // The picked area: a soft glow and a butter ring around it.
    const shape = file.areas[picked]?.shape ?? '';
    shapes.querySelector('.map-ring')?.setAttribute('d', shape);
    shapes.querySelector('.map-glow')?.setAttribute('d', shape);

    // Signs, dots, and the pet.
    const pct = (x: number, y: number) => `left:${(x / file!.width) * 100}%;top:${(y / file!.height) * 100}%`;
    const signs = areas().map((a) => {
      const c = cardFor(a.id)!;
      const at = file!.areas[a.id];
      const b = el('button', `map-label${a.id === picked ? ' is-picked' : ''}${c.locked ? ' is-locked' : ''}`, c.name);
      if (!at) b.hidden = true;
      else b.setAttribute('style', pct(...at.label));
      if (c.dot) b.append(el('span', 'map-dot'));
      b.addEventListener('click', () => pick(a.id));
      return b;
    });
    // Locked areas without clouds of their own are shaded instead.
    for (const p of shapes.querySelectorAll<SVGPathElement>('.map-hit')) {
      const c = cardFor(p.dataset.area!);
      p.setAttribute('aria-label', c ? `${c.name}. ${c.text}` : '');
      p.classList.toggle('is-locked', !!c?.locked && !file.locked.includes(p.dataset.area!));
    }
    const marksNow: HTMLElement[] = [...signs];
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

    // The card.
    const c = cardFor(picked);
    if (c) {
      title.textContent = c.name;
      text.textContent = c.text;
      text.classList.toggle('is-good', c.good);
      go.textContent = c.button;
      go.disabled = !c.enabled;
      go.classList.toggle('is-trip', c.button === S.planTrip || c.button === S.setSail || c.button === S.sailHome);
    }
  }

  function show(id: string): void {
    mapId = MAPS[id] ? id : START_MAP;
    const mine = ++token;
    picture.src = `${base()}${mapId}.png`;
    lights.src = `${base()}${mapId}-night.png`;
    if (latest) picked = firstPick(latest.state, latest.now, mapId);
    loadMap(mapId).then((f) => {
      if (mine !== token) return;
      file = f;
      drawn = '';
      build();
      fit();
      draw();
    });
  }

  return {
    el: root,
    open: (id = START_MAP) => {
      root.hidden = false;
      show(id);
      requestAnimationFrame(fit);
    },
    close: () => {
      root.hidden = true;
    },
    isOpen: () => !root.hidden,
    update: (state, now) => {
      latest = { state, now };
      if (!picked) picked = firstPick(state, now, mapId);
      if (root.hidden) return;
      // Only redraw when something on the map changed, so a sign isn't
      // swapped out from under a finger.
      const where = petAt(state, now, mapId);
      const key = JSON.stringify([
        mapId, isNight(now), areas().map((a) => areaCard(state, now, a)),
        where && [where.area, Math.round(where.share * 200)], cb.characterImage(sheetFor(state.pet)),
      ]);
      if (key === drawn) return;
      drawn = key;
      draw();
    },
  };
}
