// The map lab (map-lab.html, only with `npm run dev`): a page for laying out
// the map and trying how it looks, without playing to each state.
//
//   Preview  the real map screen in a phone frame. Each place can be made
//            open, locked or misty, given trips (Stroll, Hike, Adventure,
//            night) and any mix of sign badges; day or night; three phone sizes.
//   Edit     the map picture with every tap shape, sign, pin and flag spot
//            on it. Paint and erase tap shapes, drag the markers, add a new
//            area. Save writes it all into art/map/<map>.aseprite and the
//            game's files (see scripts/map-lab-server.ts).
//
// The picture itself is drawn in Aseprite: save there, and the lab loads
// the new export by itself (when Aseprite is installed, the dev server
// exports it for you).

import '../style.css';
import './map-lab.css';
import { STRINGS } from '../strings';
import { createNewGame, type GameState, type Offer } from '../game/state';
import { MAPS, areaName, parseOpens, type AreaCard, type Badge, type MapAreaDef, type News } from '../game/map';
import { NIGHT } from '../game/journeys';
import { createMap, type MapFile } from '../ui/map';
import { mapData } from '../../scripts/map-data';

type Kind = 'label' | 'pin' | 'flag';
interface Slice { name: string; x: number; y: number; width: number; height: number }
interface Loaded { width: number; height: number; areas: Record<string, string>; slices: Slice[]; night: boolean; locked: string[] }
type Look = 'game' | 'open' | 'locked' | 'misty';
type Trip = 'common' | 'rare' | 'epic' | 'night';
interface Override { look: Look; badges: Badge[]; trips: Trip[] }

const S = STRINGS.map;
const SIZES: Record<string, [number, number]> = { 'Small phone (320 × 568)': [320, 568], 'Phone (390 × 844)': [390, 844], 'Big phone (430 × 932)': [430, 932] };
const BADGES: Badge[] = ['water', 'crop', 'honey', 'visitor', 'mail', 'backpack', 'trip', 'epic', 'night'];
const TRIPS: [Trip, string][] = [['common', 'Stroll'], ['rare', 'Hike'], ['epic', 'Adventure'], ['night', 'Night']];
const COLOURS = ['#ff5fa2', '#3fb6ff', '#ffb02e', '#4fd18b', '#a77bff', '#ff7a45', '#2ed3c6', '#e8d33f', '#ff4d6d', '#7c9cff'];
// Each marker's slice: its size, and which point of it is the spot.
const SLICE_SIZE: Record<Kind, [number, number]> = { label: [16, 4], pin: [6, 6], flag: [8, 4] };

function el<K extends keyof HTMLElementTagNameMap>(tag: K, className = '', text?: string): HTMLElementTagNameMap[K] {
  const e = document.createElement(tag);
  if (className) e.className = className;
  if (text !== undefined) e.textContent = text;
  return e;
}

// ---- What's on show ----

let mapId = 'island';
let mode: 'preview' | 'edit' = 'preview';
let size = 'Phone (390 × 844)';
let night = false;
const overrides: Record<string, Record<string, Override>> = {};

// The map being edited.
let W = 0, H = 0;
let masks: Record<string, Uint8Array> = {};
let slices: Slice[] = [];
let added: { id: string; name: string }[] = [];
let extras = { night: false, locked: [] as string[] };
let dirty = false;
let selected = '';
let tool: 'paint' | 'erase' | 'move' = 'paint';
let brush = 2;
let keepApart = true;
let zoom = 3;
const show = { shapes: true, markers: true };
const undo: string[] = [];
let version = Date.now();

const areaIds = () => [...Object.keys(masks)];
const areaDefs = (): MapAreaDef[] => MAPS[mapId]?.areas ?? [];
const nameOf = (id: string) => {
  const def = areaDefs().find((a) => a.id === id);
  return def ? areaName(def) : added.find((a) => a.id === id)?.name ?? id;
};
const colourOf = (id: string) => COLOURS[areaIds().indexOf(id) % COLOURS.length];

// ---- The page ----

const header = el('header', 'lab-head');
const title = el('h1', '', 'Map lab');
const mapSelect = el('select');
for (const id of Object.keys(MAPS)) mapSelect.append(new Option(MAPS[id].title === 'Map' ? `${id} (island)` : `${id} (${MAPS[id].title})`, id));
const tabs = el('div', 'lab-tabs');
const previewTab = el('button', 'is-on', 'Preview');
const editTab = el('button', '', 'Edit');
tabs.append(previewTab, editTab);
const reloadButton = el('button', 'lab-soft', 'Reload');
reloadButton.title = 'Load the map files again (after exporting from Aseprite)';
const saveButton = el('button', 'lab-save', 'Save');
saveButton.title = 'Write the tap shapes, signs, pins and flags into the .aseprite file and the game (Ctrl+S)';
const status = el('span', 'lab-status');
header.append(title, mapSelect, tabs, reloadButton, saveButton, status);

const layout = el('div', 'lab-layout');
const stageBox = el('main', 'lab-main');
const panel = el('aside', 'lab-panel');
layout.append(stageBox, panel);
document.body.append(header, layout);

function say(text: string, kind: 'ok' | 'error' | '' = ''): void {
  status.textContent = text;
  status.className = `lab-status${kind ? ` is-${kind}` : ''}`;
}

// ---- Preview: the real map screen ----

const phone = el('div', 'lab-phone');
const worldMap = createMap({
  characterImage: () => undefined,
  onClose: () => say('The map would close here.'),
  onOpen: (o) => say(`The button would open: ${o.kind}${'place' in o ? ` (${o.place})` : ''}.`),
  onJournal: (p) => say(`The journal would open${p ? ` at ${p}` : ''}.`),
  onTrip: (slot) => say(`The trip board would open with trip ${slot === NIGHT ? 'night' : slot + 1} turned over.`),
  preview: (a, c) => previewCard(a, c),
});
phone.append(worldMap.el);

// A made-up game: a teen pet at home, the clock at 2pm or 11:30pm today.
function previewNow(): number {
  const d = new Date();
  d.setHours(night ? 23 : 14, night ? 30 : 0, 0, 0);
  return d.getTime();
}
let game: GameState = createNewGame(Date.now());
function freshGame(): void {
  const now = previewNow();
  game = createNewGame(now);
  game.pet.stage = 'teen';
  game.pet.name = 'Mochi';
  game.pet.named = true;
  game.journeys.offers = [null, null, null];
  game.journeys.refillAt = [now + 2 * 3_600_000 + 600_000, now + 5 * 3_600_000, now + 6 * 3_600_000];
}
freshGame();

function override(id: string): Override {
  const all = (overrides[mapId] ??= {});
  return (all[id] ??= { look: 'open', badges: [], trips: [] });
}

// What each badge's line says in the preview.
const SAMPLE: Record<Badge, string> = {
  water: S.gardenNeeds, crop: S.gardenReady(2), honey: S.honeyReady, visitor: S.friendOver('Bun'), mail: S.friendMail(1),
  backpack: S.shipBackpack('Mochi'), epic: S.epicHere, night: S.nightHere, trip: S.tripHere,
};

function previewCard(a: MapAreaDef, c: AreaCard): AreaCard {
  const o = overrides[mapId]?.[a.id] ?? override(a.id);
  const opens = parseOpens(a.opens);
  let card: AreaCard = { ...c };
  if (o.look === 'locked') {
    card = { ...card, locked: true, enabled: false, good: false, dot: false, badge: undefined, tickets: undefined, mist: false, button: S.locked, text: a.lockedText ?? S.lockedText };
  } else if (o.look === 'misty' && opens?.kind === 'journey') {
    card = { ...card, locked: false, enabled: true, good: false, dot: false, badge: undefined, tickets: [], mist: true, button: S.otherTrips, text: S.noTicketsUntil('2h 10m') };
  } else if (o.look !== 'game') {
    card = { ...card, mist: false };
    if (opens?.kind !== 'soon') {
      // Open: the button a new game would show once it's unlocked.
      const button = { home: S.goHome, garden: S.go, meadow: S.visit, friends: S.visit, map: S.setSail, journey: S.planTrip }[opens?.kind ?? 'garden'];
      card = { ...card, locked: false, enabled: true, button: card.button === S.locked ? button : card.button };
    }
    if (card.text === (a.lockedText ?? S.lockedText) || card.text.startsWith('Opens')) card.text = '';
    if (opens?.kind === 'journey') {
      const tickets = o.trips.map((t, i) => ({ slot: t === 'night' ? NIGHT : i, offer: { place: opens.place, rarity: t === 'night' ? 'rare' : t, night: t === 'night' || undefined } as Offer }));
      card.tickets = tickets;
      card.button = S.planTrip;
      card.news = [];
      if (tickets.length) {
        card.text = S.tickets(tickets.length);
        card.good = true;
        if (o.trips.includes('epic')) card.news.push({ badge: 'epic', text: S.epicHere });
        if (o.trips.includes('night')) card.news.push({ badge: 'night', text: S.nightHere });
        if (o.trips.some((t) => t === 'common' || t === 'rare')) card.news.push({ badge: 'trip', text: S.tripHere });
      } else {
        card.text = card.text || S.placeTrips('', 0);
      }
      card.badge = card.news[0]?.badge;
    }
  }
  // The badges picked here, as news on top of any trips.
  if (o.look !== 'locked' && o.look !== 'game') {
    const picked: News[] = o.badges.map((b) => ({ badge: b, text: SAMPLE[b] }));
    if (picked.length || opens?.kind !== 'journey') {
      const news = [...picked, ...(opens?.kind === 'journey' ? card.news ?? [] : [])];
      card.news = news;
      card.badge = news[0]?.badge;
      if (picked.length && !card.tickets?.length) {
        card.text = news[0].text;
        card.good = true;
      }
    }
  }
  card.dot = !!card.badge;
  if (!card.text) card.text = ' ';
  return card;
}

// The phone at its real size, shrunk to fit the window when it's taller.
const phoneBox = el('div', 'lab-phone-box');
phoneBox.append(phone);
function refreshPreview(): void {
  const [w, h] = SIZES[size];
  phone.style.width = `${w}px`;
  phone.style.height = `${h}px`;
  const room = stageBox.getBoundingClientRect();
  const k = Math.min(1, (room.height - 8) / (h + 20), (room.width - 8) / (w + 20));
  phone.style.transform = k < 1 ? `scale(${k})` : '';
  phoneBox.style.width = `${(w + 20) * k}px`;
  phoneBox.style.height = `${(h + 20) * k}px`;
  worldMap.update(game, previewNow());
}

// ---- Edit: the shapes and markers over the picture ----

const editor = el('div', 'lab-editor');
const canvas = el('canvas', 'lab-canvas');
editor.append(canvas);
const picture = new Image();
picture.onload = () => drawEditor();
let hover: [number, number] | null = null;

function spotOf(id: string, kind: Kind): [number, number] | null {
  const s = slices.find((x) => x.name.trim().toLowerCase() === `${kind}:${id}`);
  if (!s) return null;
  return kind === 'pin' ? [s.x + Math.round(s.width / 2), s.y + Math.round(s.height / 2)] : [s.x + Math.round(s.width / 2), s.y + s.height];
}

function setSpot(id: string, kind: Kind, [x, y]: [number, number]): void {
  const [w, h] = SLICE_SIZE[kind];
  const name = `${kind}:${id}`;
  const at = kind === 'pin' ? { x: x - w / 2, y: y - h / 2 } : { x: x - w / 2, y: y - h };
  const old = slices.find((s) => s.name.trim().toLowerCase() === name);
  if (old) Object.assign(old, { x: Math.round(at.x), y: Math.round(at.y), width: w, height: h });
  else slices.push({ name, x: Math.round(at.x), y: Math.round(at.y), width: w, height: h });
}

// Where a marker is shown: its slice, or where the game would put it.
function shownSpot(id: string, kind: Kind): [number, number] | null {
  const s = spotOf(id, kind);
  if (s) return s;
  if (kind === 'flag') return mapId === 'sea' && areaDefs().find((a) => a.id === id)?.opens.startsWith('journey:') ? shownSpot(id, 'pin') : null;
  const m = masks[id];
  if (!m?.some(Boolean)) return null;
  let sx = 0, sy = 0, n = 0;
  m.forEach((on, i) => { if (on) { sx += i % W; sy += Math.floor(i / W); n++; } });
  return [Math.round(sx / n), Math.round(sy / n)];
}

function fitZoom(): void {
  const box = stageBox.getBoundingClientRect();
  zoom = Math.max(2, Math.round(Math.min((box.width - 32) / W, (box.height - 32) / H)));
}

function drawEditor(): void {
  if (!W) return;
  canvas.width = W * zoom;
  canvas.height = H * zoom;
  const ctx = canvas.getContext('2d')!;
  ctx.imageSmoothingEnabled = false;
  ctx.clearRect(0, 0, canvas.width, canvas.height);
  if (picture.complete && picture.naturalWidth) ctx.drawImage(picture, 0, 0, W * zoom, H * zoom);
  if (show.shapes) {
    for (const id of areaIds()) {
      const m = masks[id];
      ctx.fillStyle = colourOf(id);
      ctx.globalAlpha = id === selected ? 0.5 : 0.22;
      for (let i = 0; i < m.length; i++) if (m[i]) ctx.fillRect((i % W) * zoom, Math.floor(i / W) * zoom, zoom, zoom);
      // The edge of the picked shape, so you can see where it ends.
      if (id !== selected) continue;
      ctx.globalAlpha = 1;
      ctx.fillStyle = '#fff';
      for (let i = 0; i < m.length; i++) {
        if (!m[i]) continue;
        const x = i % W, y = Math.floor(i / W);
        const edge = !m[i - 1] || !m[i + 1] || !m[i - W] || !m[i + W] || x === 0 || x === W - 1;
        if (edge) ctx.fillRect(x * zoom + zoom / 2 - 1, y * zoom + zoom / 2 - 1, 2, 2);
      }
    }
    ctx.globalAlpha = 1;
  }
  if (show.markers) {
    for (const id of areaIds()) {
      const c = colourOf(id);
      const label = shownSpot(id, 'label');
      if (label) {
        // About how big the sign is on a phone (2 screen pixels a pixel).
        const text = nameOf(id);
        const w = Math.round(text.length * 3.6 + 10), h = 11;
        const x = (label[0] - w / 2) * zoom, y = (label[1] - h) * zoom;
        ctx.fillStyle = '#fff7ec';
        ctx.strokeStyle = id === selected ? c : '#5b3f6e';
        ctx.lineWidth = id === selected ? 3 : 2;
        ctx.globalAlpha = spotOf(id, 'label') ? 0.95 : 0.6;
        ctx.beginPath();
        ctx.roundRect(x, y, w * zoom, h * zoom, 4 * zoom / 2);
        ctx.fill();
        ctx.stroke();
        ctx.fillStyle = '#5b3f6e';
        ctx.font = `800 ${Math.max(9, 6 * zoom)}px Nunito, system-ui`;
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText(text, label[0] * zoom, (label[1] - h / 2) * zoom);
        ctx.globalAlpha = 1;
      }
      const pin = shownSpot(id, 'pin');
      if (pin) {
        ctx.fillStyle = c;
        ctx.strokeStyle = '#2b2140';
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.arc((pin[0] + 0.5) * zoom, (pin[1] + 0.5) * zoom, 3 * zoom, 0, Math.PI * 2);
        ctx.fill();
        ctx.stroke();
      }
      const flag = mapId === 'sea' ? shownSpot(id, 'flag') : null;
      if (flag && areaDefs().find((a) => a.id === id)?.opens.startsWith('journey:')) {
        const x = (flag[0] + 0.5) * zoom, y = flag[1] * zoom;
        ctx.strokeStyle = '#2b2140';
        ctx.lineWidth = Math.max(2, zoom / 1.5);
        ctx.beginPath();
        ctx.moveTo(x, y);
        ctx.lineTo(x, y - 10 * zoom);
        ctx.stroke();
        ctx.fillStyle = '#ffd36e';
        ctx.beginPath();
        ctx.moveTo(x, y - 10 * zoom);
        ctx.lineTo(x + 7 * zoom, y - 7.5 * zoom);
        ctx.lineTo(x, y - 5 * zoom);
        ctx.closePath();
        ctx.fill();
        ctx.stroke();
      }
    }
  }
  // The brush, under the mouse.
  if (hover && tool !== 'move' && selected) {
    ctx.strokeStyle = tool === 'erase' ? '#ff3b3b' : '#fff';
    ctx.lineWidth = 1;
    const r = brush - 1;
    ctx.strokeRect((hover[0] - r) * zoom, (hover[1] - r) * zoom, (r * 2 + 1) * zoom, (r * 2 + 1) * zoom);
  }
}

const artAt = (e: PointerEvent): [number, number] => {
  const r = canvas.getBoundingClientRect();
  return [Math.floor(((e.clientX - r.left) / r.width) * W), Math.floor(((e.clientY - r.top) / r.height) * H)];
};

function snapshot(): void {
  undo.push(JSON.stringify({ masks: Object.fromEntries(Object.entries(masks).map(([k, m]) => [k, Array.from(m)])), slices, added }));
  if (undo.length > 40) undo.shift();
}

function undoOnce(): void {
  const last = undo.pop();
  if (!last) return say('Nothing to undo.');
  const s = JSON.parse(last);
  masks = Object.fromEntries(Object.entries(s.masks as Record<string, number[]>).map(([k, m]) => [k, Uint8Array.from(m)]));
  slices = s.slices;
  added = s.added;
  if (!masks[selected]) selected = areaIds()[0] ?? '';
  changed();
  renderPanel();
}

function paintAt([x, y]: [number, number]): void {
  const m = masks[selected];
  if (!m) return;
  const r = brush - 1;
  for (let j = -r; j <= r; j++) for (let i = -r; i <= r; i++) {
    const X = x + i, Y = y + j;
    if (X < 0 || Y < 0 || X >= W || Y >= H) continue;
    const k = Y * W + X;
    if (tool === 'erase') m[k] = 0;
    else {
      m[k] = 1;
      if (keepApart) for (const other of areaIds()) if (other !== selected) masks[other][k] = 0;
    }
  }
}

let dragging: { id: string; kind: Kind } | null = null;
let painting = false;
canvas.addEventListener('pointerdown', (e) => {
  if (!W) return;
  const at = artAt(e);
  canvas.setPointerCapture(e.pointerId);
  if (tool === 'move') {
    // The nearest marker within a few pixels: pins first, then flags, then signs.
    let best: { id: string; kind: Kind; d: number } | null = null;
    for (const id of areaIds()) for (const kind of ['pin', 'flag', 'label'] as Kind[]) {
      const s = kind === 'flag' && mapId !== 'sea' ? null : shownSpot(id, kind);
      if (!s) continue;
      const cy = kind === 'label' ? s[1] - 5 : kind === 'flag' ? s[1] - 5 : s[1];
      const d = Math.hypot(at[0] - s[0], at[1] - cy) + (kind === 'pin' ? 0 : kind === 'flag' ? 0.5 : 1);
      if (d < 9 && (!best || d < best.d)) best = { id, kind, d };
    }
    if (best) {
      snapshot();
      dragging = { id: best.id, kind: best.kind };
      selected = best.id;
      renderPanel();
    }
    return;
  }
  if (!selected) return say('Pick an area on the right first.', 'error');
  snapshot();
  painting = true;
  paintAt(at);
  drawEditor();
});
canvas.addEventListener('pointermove', (e) => {
  if (!W) return;
  const at = artAt(e);
  hover = at;
  if (dragging) {
    const y = dragging.kind === 'pin' ? at[1] : at[1] + (dragging.kind === 'label' ? 5 : 5);
    setSpot(dragging.id, dragging.kind, [at[0], Math.min(H, y)]);
    dirty = true;
  } else if (painting) {
    paintAt(at);
    dirty = true;
  }
  drawEditor();
});
const finish = () => {
  if (dragging || painting) changed();
  dragging = null;
  painting = false;
};
canvas.addEventListener('pointerup', finish);
canvas.addEventListener('pointercancel', finish);
canvas.addEventListener('pointerleave', () => {
  hover = null;
  drawEditor();
});

// After an edit: the preview shows it straight away, unsaved.
function changed(): void {
  dirty = true;
  updateSave();
  drawEditor();
  const file = toMapFile();
  if (file) worldMap.useFile(mapId, file);
}

function toMapFile(): MapFile | null {
  const areas = areaIds().filter((id) => masks[id].some(Boolean) && areaDefs().some((a) => a.id === id)).map((id) => {
    const data = new Uint8Array(W * H * 4);
    masks[id].forEach((on, i) => { if (on) data[i * 4 + 3] = 255; });
    return { id, pixels: { width: W, height: H, data } };
  });
  try {
    return mapData(W, H, areas, slices, extras) as MapFile;
  } catch {
    return null;
  }
}

function updateSave(): void {
  saveButton.disabled = !dirty;
  saveButton.textContent = dirty ? 'Save ●' : 'Saved';
}

// ---- Loading and saving ----

async function load(): Promise<void> {
  say('Loading…');
  const r = await fetch(`/__map-lab/map?id=${mapId}`);
  const data: Loaded & { error?: string } = await r.json();
  if (!r.ok) return say(data.error ?? 'Could not load the map', 'error');
  W = data.width;
  H = data.height;
  masks = Object.fromEntries(Object.entries(data.areas).map(([id, text]) => [id, unpack(text, W * H)]));
  slices = data.slices;
  extras = { night: data.night, locked: data.locked };
  added = [];
  dirty = false;
  undo.length = 0;
  if (!masks[selected]) selected = areaIds()[0] ?? '';
  version = Date.now();
  picture.src = `/sprites/map/${mapId}.png?v=${version}`;
  updateSave();
  renderPanel();
  if (mode === 'edit') {
    fitZoom();
    drawEditor();
  }
  let notes: string | null = null;
  try {
    notes = sessionStorage.getItem('map-lab:notes');
    sessionStorage.removeItem('map-lab:notes');
  } catch { /* private window */ }
  if (notes) say(notes, 'ok');
  else say(`Loaded art/map/${mapId}.aseprite`);
}

function unpack(text: string, length: number): Uint8Array {
  const bin = atob(text);
  const m = new Uint8Array(length);
  for (let i = 0; i < length; i++) m[i] = (bin.charCodeAt(i >> 3) >> (i & 7)) & 1;
  return m;
}

function pack(m: Uint8Array): string {
  const bytes = new Uint8Array(Math.ceil(m.length / 8));
  for (let i = 0; i < m.length; i++) if (m[i]) bytes[i >> 3] |= 1 << (i & 7);
  let bin = '';
  for (const b of bytes) bin += String.fromCharCode(b);
  return btoa(bin);
}

async function save(): Promise<void> {
  if (!dirty) return;
  const empty = areaIds().filter((id) => !masks[id].some(Boolean));
  if (empty.length) return say(`Paint a tap shape for ${empty.join(', ')} first.`, 'error');
  say('Saving…');
  const r = await fetch('/__map-lab/save', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ id: mapId, areas: Object.fromEntries(areaIds().map((id) => [id, pack(masks[id])])), slices, added }),
  });
  const data = await r.json();
  if (!r.ok) return say(data.error ?? 'Could not save', 'error');
  dirty = false;
  updateSave();
  // A new area changes map.json, which reloads the page: keep the notes.
  const notes = (data.notes as string[]).join(' ');
  try { sessionStorage.setItem('map-lab:notes', notes); } catch { /* private window */ }
  worldMap.reload();
  await load();
  say(notes, 'ok');
}

// ---- The side panel ----

function row(label: string, control: HTMLElement): HTMLElement {
  const l = el('label', 'lab-row');
  l.append(el('span', '', label), control);
  return l;
}

function select<T extends string>(options: [T, string][], value: T, onChange: (v: T) => void): HTMLSelectElement {
  const s = el('select');
  for (const [v, text] of options) s.append(new Option(text, v));
  s.value = value;
  s.addEventListener('change', () => onChange(s.value as T));
  return s;
}

function renderPanel(): void {
  panel.replaceChildren(...(mode === 'preview' ? previewPanel() : editPanel()));
}

function previewPanel(): HTMLElement[] {
  const out: HTMLElement[] = [];
  const top = el('section', 'lab-card');
  top.append(
    el('h2', '', 'Screen'),
    row('Phone', select(Object.keys(SIZES).map((k) => [k, k]), size, (v) => { size = v; refreshPreview(); })),
    row('Time', select([['day', 'Day (2pm)'], ['night', 'Night (11:30pm)']], night ? 'night' : 'day', (v) => { night = v === 'night'; freshGame(); refreshPreview(); })),
  );
  const open = el('button', 'lab-soft', 'Close the bubble');
  open.addEventListener('click', () => worldMap.pick(''));
  top.append(el('p', 'lab-hint', 'Tap a place on the phone to open its bubble. Every change below shows straight away.'), open);
  out.push(top);

  const places = el('section', 'lab-card');
  places.append(el('h2', '', 'Places'));
  for (const a of areaDefs()) {
    const o = override(a.id);
    const opens = parseOpens(a.opens);
    const box = el('div', 'lab-place');
    const name = el('b', '', nameOf(a.id));
    name.style.borderLeftColor = colourOf(a.id);
    box.append(name);
    const looks: [Look, string][] = [['open', 'Open'], ['locked', 'Locked (clouds)']];
    if (opens?.kind === 'journey') looks.push(['misty', 'Misty (no trips)']);
    looks.push(['game', 'As in a new game']);
    box.append(row('Looks', select(looks, o.look, (v) => { o.look = v; refreshPreview(); renderPanel(); })));
    // Badges in the order ticked: the first two show on the sign, then "+1".
    const badges = el('div', 'lab-trips');
    for (const b of BADGES) {
      const l = el('label', 'lab-check');
      const c = el('input');
      c.type = 'checkbox';
      c.checked = o.badges.includes(b);
      c.addEventListener('change', () => {
        o.badges = c.checked ? [...o.badges, b] : o.badges.filter((x) => x !== b);
        refreshPreview();
      });
      l.append(c, b);
      badges.append(l);
    }
    box.append(row('Waiting there', badges));
    if (opens?.kind === 'journey' && o.look === 'open') {
      const trips = el('div', 'lab-trips');
      for (const [t, label] of TRIPS) {
        const l = el('label', 'lab-check');
        const c = el('input');
        c.type = 'checkbox';
        c.checked = o.trips.includes(t);
        c.addEventListener('change', () => {
          o.trips = c.checked ? [...o.trips, t] : o.trips.filter((x) => x !== t);
          refreshPreview();
        });
        l.append(c, label);
        trips.append(l);
      }
      box.append(row('Trips', trips));
    }
    places.append(box);
  }
  out.push(places);
  return out;
}

function editPanel(): HTMLElement[] {
  const out: HTMLElement[] = [];
  const tools = el('section', 'lab-card');
  tools.append(el('h2', '', 'Tools'));
  const bar = el('div', 'lab-toolbar');
  for (const [t, label, key] of [['paint', 'Paint', 'B'], ['erase', 'Erase', 'E'], ['move', 'Move markers', 'V']] as const) {
    const b = el('button', tool === t ? 'is-on' : '', `${label} (${key})`);
    b.addEventListener('click', () => { tool = t; renderPanel(); drawEditor(); });
    bar.append(b);
  }
  tools.append(bar);
  tools.append(row('Brush', select([['1', '1 px'], ['2', '3 px'], ['3', '5 px'], ['5', '9 px']], String(brush) as '1', (v) => { brush = Number(v); })));
  const apart = el('input');
  apart.type = 'checkbox';
  apart.checked = keepApart;
  apart.addEventListener('change', () => { keepApart = apart.checked; });
  tools.append(row('Painting takes pixels from other shapes', apart));
  const shapes = el('input');
  shapes.type = 'checkbox';
  shapes.checked = show.shapes;
  shapes.addEventListener('change', () => { show.shapes = shapes.checked; drawEditor(); });
  const markers = el('input');
  markers.type = 'checkbox';
  markers.checked = show.markers;
  markers.addEventListener('change', () => { show.markers = markers.checked; drawEditor(); });
  tools.append(row('Show tap shapes', shapes), row('Show signs, pins, flags', markers));
  const zoomRow = el('div', 'lab-toolbar');
  const less = el('button', '', '−');
  const more = el('button', '', '+');
  const undoButton = el('button', '', 'Undo (Ctrl+Z)');
  less.addEventListener('click', () => { zoom = Math.max(1, zoom - 1); drawEditor(); });
  more.addEventListener('click', () => { zoom = Math.min(8, zoom + 1); drawEditor(); });
  undoButton.addEventListener('click', undoOnce);
  zoomRow.append(el('span', '', 'Zoom'), less, more, undoButton);
  tools.append(zoomRow);
  tools.append(el('p', 'lab-hint', 'Paint: the picked area\'s tap shape. Move: drag a sign (box), the pet\'s pin (dot) or, on the sea, the trip flags. A faded marker isn\'t placed yet and sits where the game would put it.'));
  out.push(tools);

  const list = el('section', 'lab-card');
  list.append(el('h2', '', 'Areas'));
  for (const id of areaIds()) {
    const b = el('button', `lab-area${id === selected ? ' is-on' : ''}`);
    const dot = el('i');
    dot.style.background = colourOf(id);
    const isNew = added.some((a) => a.id === id);
    const placed = (['label', 'pin', 'flag'] as Kind[]).filter((k) => spotOf(id, k)).join(', ');
    b.append(dot, el('b', '', nameOf(id)), el('small', '', `${id}${isNew ? ' · new' : ''}${placed ? ` · ${placed}` : ''}`));
    b.addEventListener('click', () => { selected = id; renderPanel(); drawEditor(); });
    list.append(b);
  }
  const form = el('form', 'lab-new');
  const idInput = el('input');
  idInput.placeholder = 'id, like beach';
  idInput.pattern = '[a-z0-9\\-]+';
  idInput.required = true;
  const nameInput = el('input');
  nameInput.placeholder = 'Name, like Beach';
  const add = el('button', '', 'Add area');
  form.append(idInput, nameInput, add);
  form.addEventListener('submit', (e) => {
    e.preventDefault();
    const id = idInput.value.trim();
    if (masks[id]) return say(`There's already an area called ${id}.`, 'error');
    snapshot();
    masks[id] = new Uint8Array(W * H);
    added.push({ id, name: nameInput.value.trim() || id });
    selected = id;
    tool = 'paint';
    dirty = true;
    updateSave();
    renderPanel();
    drawEditor();
    say(`Paint the tap shape for ${id}, then Save. It's added to map.json, opening nothing yet.`);
  });
  list.append(el('h3', '', 'New area'), form);
  out.push(list);
  return out;
}

// ---- Switching ----

// The map and tab live in the address (#sea/edit), so a reload keeps them.
const remember = () => history.replaceState(null, '', `#${mapId}/${mode}`);

function setMode(next: typeof mode): void {
  mode = next;
  remember();
  previewTab.classList.toggle('is-on', mode === 'preview');
  editTab.classList.toggle('is-on', mode === 'edit');
  stageBox.replaceChildren(mode === 'preview' ? phoneBox : editor);
  stageBox.classList.toggle('is-edit', mode === 'edit');
  renderPanel();
  if (mode === 'edit') {
    fitZoom();
    drawEditor();
  } else refreshPreview();
}

previewTab.addEventListener('click', () => setMode('preview'));
editTab.addEventListener('click', () => setMode('edit'));
mapSelect.addEventListener('change', async () => {
  if (dirty && !confirm('Leave this map without saving?')) {
    mapSelect.value = mapId;
    return;
  }
  mapId = mapSelect.value;
  remember();
  worldMap.open(mapId);
  refreshPreview();
  await load();
});
reloadButton.addEventListener('click', async () => {
  if (dirty && !confirm('Load the files again and lose what isn\'t saved?')) return;
  worldMap.reload();
  refreshPreview();
  await load();
});
saveButton.addEventListener('click', save);
window.addEventListener('keydown', (e) => {
  if (e.target instanceof HTMLInputElement || e.target instanceof HTMLSelectElement) return;
  if ((e.ctrlKey || e.metaKey) && e.key === 's') {
    e.preventDefault();
    void save();
  } else if ((e.ctrlKey || e.metaKey) && e.key === 'z') {
    e.preventDefault();
    undoOnce();
  } else if (mode === 'edit' && !e.ctrlKey && !e.metaKey) {
    const t = ({ b: 'paint', e: 'erase', v: 'move' } as const)[e.key.toLowerCase() as 'b'];
    if (t) {
      tool = t;
      renderPanel();
      drawEditor();
    }
  }
});
window.addEventListener('beforeunload', (e) => {
  if (dirty) e.preventDefault();
});
window.addEventListener('resize', () => {
  if (mode === 'preview') refreshPreview();
  if (mode === 'edit') {
    fitZoom();
    drawEditor();
  }
});

// A new export (from Aseprite, or a save here): load it again.
if (import.meta.hot) {
  import.meta.hot.on('map-lab:changed', async () => {
    if (dirty) return say('A new export is ready: Reload to see it (you have unsaved changes).');
    worldMap.reload();
    refreshPreview();
    await load();
    say('Loaded the new export.', 'ok');
  });
  import.meta.hot.on('map-lab:export', (d: { ok: boolean; map: string; text: string }) => {
    say(d.ok ? `Exported ${d.map} from Aseprite.` : `Couldn't export ${d.map}: ${d.text.split('\n').pop()}`, d.ok ? 'ok' : 'error');
  });
}

const [hashMap, hashMode] = location.hash.slice(1).split('/');
if (MAPS[hashMap]) mapId = mapSelect.value = hashMap;
worldMap.open(mapId);
setMode(hashMode === 'edit' ? 'edit' : 'preview');
void load();
