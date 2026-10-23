// The art preview page (art.html): every pet sheet, drawn exactly the way
// the game draws it, with its animations, faces and hats, guide lines, a
// lineup of every character, live hat and face point tweaks, art checks
// and the traits. It's a tool for drawing the art, not part of the game:
// `npm run build` leaves it out. See docs/ART_GUIDE.md.

import characters from '../data/characters.json';
import hatData from '../data/hats.json';
import { CONFIG } from '../game/config';
import { EXPRESSIONS, chooseExpression, faceForAnimation, idleEveryMs, reactionMs, type Expression, type Reaction } from '../game/expressions';
import { TRAITS, allowedTraits } from '../game/traits';
import { frameFor } from '../render/animations';
import { countFaceFrames, drawFace, type FaceSheet } from '../render/faces';
import { OUTLINE_OF, OUTLINES, PALETTE, type ColourName } from '../render/palette';
import { outlineSwaps, recolourPixels } from '../render/recolour';
import {
  loadSprites,
  measureHead,
  pickHatFrame,
  idleSetOf,
  resolveSheet,
  sheetAnimations,
  type ManifestFile,
  type HatFit,
  type Shape,
  type SpriteLibrary,
  type SpriteSheet,
} from '../render/sprites';
import { checkSheet, pixelsOf, type Check } from './checks';
import { markdownToHtml, section } from './guide';
import { setupHowTo, type ShowMe } from './howto';

const $ = <T extends HTMLElement = HTMLElement>(id: string) => document.getElementById(id) as T;

// ---------------------------------------------------------------- state

type Tab = 'animations' | 'moves' | 'faces' | 'hats' | 'tweak' | 'recolour' | 'checks' | 'traits';
type Face = 'auto' | 'mood' | Expression;

interface State {
  sheet: string;
  view: 'single' | 'lineup';
  tab: Tab;
  anim: string;
  face: Face;
  hat: string; // a hat sheet name, or '' for none
  playing: boolean;
  speed: number;
  idleMoves: boolean;
  scale: number;
  bg: string;
  overlays: Record<string, boolean>;
  closed: string[]; // picker groups folded up
  trait: string;
  mood: { happiness: number; hunger: number; energy: number; aloneMin: number; reaction: '' | Reaction };
  // The recolour being tried on the Recolour tab: the sheet it's made
  // from, its name, and the palette swaps.
  recolour: { base: string; name: string; swaps: Record<string, string> };
  tweakOwn: boolean; // the Tweak tab changes this sheet only, not its shape
  // What the Lineup shows: one group (a theme) or '' for all, one rarity
  // or 0 for all, and whether colour variants are in it.
  lineup: { group: string; stars: number; variants: boolean };
}

const SAVED = 'art-preview';
const state: State = {
  sheet: 'sprig',
  view: 'single',
  tab: 'animations',
  anim: 'idle',
  face: 'auto',
  hat: '',
  playing: true,
  speed: 1,
  idleMoves: true,
  scale: 10,
  bg: 'check',
  overlays: { grid: false, feet: true, centre: true, top: true, head: true, face: true },
  closed: [],
  trait: TRAITS[0].id,
  mood: { happiness: 80, hunger: 80, energy: 80, aloneMin: 0, reaction: '' },
  recolour: { base: '', name: '', swaps: {} },
  tweakOwn: false,
  lineup: { group: '', stars: 0, variants: true },
};
try {
  Object.assign(state, JSON.parse(localStorage.getItem(SAVED) ?? '{}'));
} catch {
  // A private window, or nothing saved yet.
}
function save() {
  try {
    localStorage.setItem(SAVED, JSON.stringify(state));
  } catch {
    // Not saved, which is fine.
  }
}

let manifest: ManifestFile;
let library: SpriteLibrary = new Map();
// The shapes as edited on the Tweak tab, and as they are in the manifest.
let shapes: Record<string, Shape> = {};
let original: Record<string, Shape> = {};
// A sheet's own points, which win over its shape's (see shapeOf), as
// edited on the Tweak tab and as they are in the manifest.
type Fit = Pick<Shape, 'head' | 'face' | 'hats'>;
let fits: Record<string, Partial<Fit>> = {};
let originalFits: Record<string, Partial<Fit>> = {};
// Sheets added by dropping a PNG: which manifest sheet they copy their
// settings from. And sheets whose picture was swapped for a dropped one.
const dropped = new Map<string, string>();
const swapped = new Set<string>();
let time = 0;

const HATS = hatData.hats;
const hatName = (sheet: string) => HATS.find((h) => h.sheet === sheet)?.name ?? sheet;

// ------------------------------------------------------------- the sheets

interface Entry {
  sheet: string;
  label: string;
  stars?: number;
  note?: string;
  variant?: boolean;
}

// Every pet sheet, grouped like the guide: stages, then each theme by
// rarity with its variants, then sheets no character uses yet.
function groups(): { title: string; entries: Entry[] }[] {
  const out: { title: string; entries: Entry[] }[] = [];
  const used = new Set<string>();
  const add = (title: string, entries: Entry[]) => {
    entries = entries.filter((e) => library.has(e.sheet));
    entries.forEach((e) => used.add(e.sheet));
    if (entries.length) out.push({ title, entries });
  };
  add('Stages', Object.entries(characters.stages).map(([id, sheet]) => ({ sheet, label: id[0].toUpperCase() + id.slice(1) })));
  for (const [theme, name] of Object.entries(characters.themes)) {
    const entries: Entry[] = [];
    for (const c of characters.characters.filter((c) => c.theme === theme).sort((a, b) => a.stars - b.stars)) {
      entries.push({ sheet: c.sheet, label: c.name, stars: c.stars });
      for (const v of (c as { variants?: { name: string; sheet: string; chance: number }[] }).variants ?? [])
        entries.push({ sheet: v.sheet, label: `${c.name} · ${v.name}`, stars: c.stars, note: `${v.chance}%`, variant: true });
    }
    add(characters.laterPacks.includes(theme) ? `${name} (later pack)` : name, entries);
  }
  add(
    'Not in characters.json',
    [...library.keys()]
      .filter((n) => !n.startsWith('hat-') && !used.has(n) && !dropped.has(n) && !n.startsWith('badge'))
      .map((sheet) => ({ sheet, label: sheet })),
  );
  add('Tried here', [...dropped.keys()].map((sheet) => ({ sheet, label: sheet, note: 'here only' })));
  return out;
}

function shapeNameOf(sheet: string): string | undefined {
  return resolveSheet(manifest, dropped.get(sheet) ?? sheet)?.shape;
}

// The manifest sheet whose own points a sheet uses: itself, or for a
// recolour without points of its own, the sheet it's painted from.
function fitNameOf(sheet: string): string {
  const name = dropped.get(sheet) ?? sheet;
  const from = manifest.sheets[name]?.from;
  return from && !fits[name] ? from : name;
}

// A sheet's shape with its own points in place of the shape's, as the game
// works it out (shapeOf), but with the edits from the Tweak tab.
function bodyOf(sheet: string): Shape | undefined {
  const shapeName = shapeNameOf(sheet);
  const shape = shapeName ? shapes[shapeName] : undefined;
  if (!shape) return undefined;
  const own = fits[fitNameOf(sheet)] ?? {};
  return {
    ...shape,
    head: own.head ?? shape.head,
    face: own.face ?? shape.face,
    hats: own.hats || shape.hats ? { ...shape.hats, ...own.hats } : undefined,
  };
}

const faceSets = () => {
  const sets = new Map<string, FaceSheet>();
  for (const s of library.values()) {
    if (s.faceSet) sets.set(s.faceSet.name, s.faceSet);
    if (s.faceFallback) sets.set(s.faceFallback.name, s.faceFallback);
  }
  return sets;
};

// Measures again how far the head moves in each frame, after its head
// point changed or its picture was swapped, the same way the game does
// when it loads, hand-written fixes included.
function remeasure(s: SpriteSheet) {
  const shape = bodyOf(s.name);
  if (!shape) return;
  const entry = resolveSheet(manifest, dropped.get(s.name) ?? s.name);
  const idleSet = idleSetOf(manifest, dropped.get(s.name) ?? s.name);
  const found = measureHead(pixelsOf(s.image), s, shape.head, s.idleMoves);
  s.headOffsets = { ...found.offsets, ...shape.headOffsets, ...idleSet?.headOffsets, ...entry.headOffsets };
  s.headShifts = { ...found.shifts, ...shape.headShifts, ...idleSet?.headShifts, ...entry.headShifts };
}

// Puts a shape's (edited) settings on every sheet drawn on it, with each
// sheet's own points on top.
function applyShape(name: string) {
  for (const s of library.values()) {
    if (shapeNameOf(s.name) !== name) continue;
    const shape = bodyOf(s.name)!;
    s.head = { ...shape.head };
    s.face = shape.face && { ...shape.face };
    s.hats = shape.hats && structuredClone(shape.hats);
    remeasure(s);
  }
}

async function load() {
  const base = `${import.meta.env.BASE_URL}sprites/`;
  manifest = await (await fetch(`${base}manifest.json`, { cache: 'no-store' })).json();
  original = structuredClone(manifest.shapes ?? {});
  shapes = structuredClone(original);
  originalFits = Object.fromEntries(
    Object.entries(manifest.sheets)
      .map(([name, s]) => [name, Object.fromEntries((['head', 'face', 'hats'] as const).filter((k) => s[k]).map((k) => [k, s[k]]))])
      .filter(([, fit]) => Object.keys(fit).length),
  );
  fits = structuredClone(originalFits);
  library = await loadSprites();
  dropped.clear();
  swapped.clear();
  // Bring back the recolour being tried, so a reload doesn't lose it.
  if (library.has(state.recolour.base)) tryRecolour();
  if (!library.has(state.sheet)) state.sheet = library.has('sprig') ? 'sprig' : [...library.keys()][0];
  if (state.hat && !library.has(state.hat)) state.hat = '';
  renderAll();
}

// ---------------------------------------------------------------- drawing

const PAD_X = 8;
const PAD_Y = 12;
const BOX = 48;

interface Drawn {
  anim: string; // what actually played (an idle move, or the animation asked for)
  frame: number;
  frames: number;
  headOffset: number;
  headShift: number;
  face: Expression;
  hatSize?: { col: number; width: number; room: number };
}

const currentTrait = () => TRAITS.find((t) => t.id === state.trait);

function moodFace(anim: string): Expression {
  const m = state.mood;
  return chooseExpression({
    animation: anim,
    reaction: m.reaction || null,
    stats: { happiness: m.happiness, hunger: m.hunger, energy: m.energy, health: 100 },
    trait: currentTrait(),
    aloneMs: m.aloneMin * 60_000,
  });
}

// Draws a pet the way the game's room does (src/render/canvas.ts), with
// the top left of its frame at (x, y).
function drawPet(
  ctx: CanvasRenderingContext2D,
  sheet: SpriteSheet,
  anim: string,
  t: number,
  face: Face,
  hat: SpriteSheet | undefined,
  x = PAD_X,
  y = PAD_Y,
): Drawn {
  const idleEvery = face === 'mood' ? idleEveryMs(currentTrait()) : undefined;
  const playing = state.idleMoves ? sheet : { ...sheet, idleMoves: undefined };
  const f = frameFor(playing, anim, t, 0, idleEvery);
  const row = f.sy / sheet.frameHeight;
  const [played, info] = Object.entries(sheet.animations).find(([, a]) => a.row === row) ?? ['idle', sheet.animations.idle];
  const { frameWidth: w, frameHeight: h } = sheet;
  ctx.drawImage(sheet.image, f.sx, f.sy, w, h, x, y, w, h);
  const expression = face === 'auto' ? faceForAnimation(anim) : face === 'mood' ? moodFace(anim) : face;
  drawFace(ctx, sheet, expression, x, y, t, f.headOffset, f.headShift);
  const drawn: Drawn = {
    anim: played,
    frame: f.sx / w,
    frames: info?.frames ?? 1,
    headOffset: f.headOffset,
    headShift: f.headShift,
    face: expression,
  };
  if (hat && sheet.head) {
    const { frameWidth: hw, frameHeight: hh } = hat;
    const fit = sheet.hats?.[hat.name];
    const room = fit?.width ?? sheet.head.width;
    const col = pickHatFrame(hat.hatWidths ?? [hw], room);
    const hx = x + sheet.head.x + (fit?.x ?? 0) + f.headShift - Math.floor(hw / 2);
    const hy = y + sheet.head.y + (fit?.y ?? 0) + f.headOffset - hh;
    ctx.drawImage(hat.image, col * hw, 0, hw, hh, hx, hy, hw, hh);
    drawn.hatSize = { col, width: hat.hatWidths?.[col] ?? hw, room };
  }
  return drawn;
}

const BACKGROUNDS: Record<string, string> = {
  check: 'Checkered',
  cream: 'Cream',
  pink: 'Room pink',
  night: 'Night',
};

function paintBackground(ctx: CanvasRenderingContext2D, w: number, h: number, cell: number) {
  if (state.bg === 'check') {
    for (let y = 0; y < h; y += cell)
      for (let x = 0; x < w; x += cell) {
        ctx.fillStyle = (x / cell + y / cell) % 2 ? '#e9e4ee' : '#f7f4fa';
        ctx.fillRect(x, y, cell, cell);
      }
  } else {
    ctx.fillStyle = state.bg === 'cream' ? PALETTE.cream : state.bg === 'pink' ? '#fde8ef' : PALETTE.ink;
    ctx.fillRect(0, 0, w, h);
  }
}

// A small canvas to draw a pet on before it's blown up.
const small = document.createElement('canvas');
small.width = BOX;
small.height = BOX;
const smallCtx = small.getContext('2d')!;

function drawTile(canvas: HTMLCanvasElement, sheet: SpriteSheet, anim: string, face: Face, hat: SpriteSheet | undefined, t: number) {
  const ctx = canvas.getContext('2d')!;
  ctx.imageSmoothingEnabled = false;
  paintBackground(ctx, canvas.width, canvas.height, 8);
  smallCtx.clearRect(0, 0, BOX, BOX);
  drawPet(smallCtx, sheet, anim, t, face, hat);
  ctx.drawImage(small, 0, 0, canvas.width, canvas.height);
}

const OVERLAYS: Record<string, { label: string; colour: string; tip: string }> = {
  grid: { label: 'Pixel grid', colour: '#a68bc9', tip: 'One square per pixel' },
  feet: { label: 'Feet & shadow', colour: '#f48fb1', tip: 'Feet on row 28 (pink), shadow on row 29 (purple)' },
  centre: { label: 'Centre', colour: '#5a8fd6', tip: 'The middle of the frame' },
  top: { label: 'Top row', colour: '#e05a7a', tip: 'Must stay empty in every frame' },
  head: { label: 'Hat point', colour: '#3f7d62', tip: "The shape's head point and width, moving with the head" },
  face: { label: 'Face point', colour: '#ff9d3c', tip: 'Where the face anchor (16, 18) lands' },
};

function drawStage() {
  const sheet = library.get(state.sheet);
  const canvas = $<HTMLCanvasElement>('stage');
  const s = state.scale;
  if (canvas.width !== BOX * s) {
    canvas.width = BOX * s;
    canvas.height = BOX * s;
  }
  const ctx = canvas.getContext('2d')!;
  ctx.imageSmoothingEnabled = false;
  paintBackground(ctx, canvas.width, canvas.height, s * 2);
  if (!sheet) return;
  smallCtx.clearRect(0, 0, BOX, BOX);
  const d = drawPet(smallCtx, sheet, state.anim, time, state.face, library.get(state.hat));
  ctx.drawImage(small, 0, 0, canvas.width, canvas.height);

  const fw = sheet.frameWidth;
  const fh = sheet.frameHeight;
  const o = state.overlays;
  const px = (x: number) => (PAD_X + x) * s;
  const py = (y: number) => (PAD_Y + y) * s;
  ctx.lineWidth = 2;
  if (o.grid) {
    ctx.strokeStyle = 'rgba(91, 63, 110, 0.18)';
    ctx.lineWidth = 1;
    ctx.beginPath();
    for (let i = 0; i <= BOX; i++) {
      ctx.moveTo(i * s + 0.5, 0);
      ctx.lineTo(i * s + 0.5, canvas.height);
      ctx.moveTo(0, i * s + 0.5);
      ctx.lineTo(canvas.width, i * s + 0.5);
    }
    ctx.stroke();
    ctx.lineWidth = 2;
  }
  // The frame itself.
  ctx.strokeStyle = 'rgba(91, 63, 110, 0.35)';
  ctx.setLineDash([4, 4]);
  ctx.strokeRect(px(0), py(0), fw * s, fh * s);
  ctx.setLineDash([]);
  if (o.feet && fh >= 30) {
    ctx.strokeStyle = OVERLAYS.feet.colour;
    ctx.strokeRect(px(0), py(28), fw * s, s);
    ctx.strokeStyle = '#a68bc9';
    ctx.strokeRect(px(0), py(29), fw * s, s);
  }
  if (o.centre) {
    ctx.strokeStyle = OVERLAYS.centre.colour;
    ctx.beginPath();
    ctx.moveTo(px(fw / 2), py(0));
    ctx.lineTo(px(fw / 2), py(fh));
    ctx.stroke();
  }
  if (o.top) {
    const { data } = pixelsOf(sheet.image);
    const row = sheet.animations[d.anim]?.row ?? 0;
    let touched = false;
    for (let x = 0; x < fw && !touched; x++) touched = data[(row * fh * sheet.image.width + d.frame * fw + x) * 4 + 3] !== 0;
    ctx.fillStyle = touched ? 'rgba(224, 90, 122, 0.55)' : 'rgba(224, 90, 122, 0.12)';
    ctx.fillRect(px(0), py(0), fw * s, s);
  }
  if (o.head && sheet.head) {
    const fit = sheet.hats?.[state.hat];
    const hx = sheet.head.x + d.headShift + (state.hat ? fit?.x ?? 0 : 0);
    const hy = sheet.head.y + d.headOffset + (state.hat ? fit?.y ?? 0 : 0);
    const width = (state.hat && fit?.width) || sheet.head.width;
    ctx.strokeStyle = OVERLAYS.head.colour;
    ctx.beginPath();
    ctx.moveTo(px(hx - width / 2), py(hy));
    ctx.lineTo(px(hx + width / 2), py(hy));
    ctx.moveTo(px(hx - width / 2), py(hy) - s / 2);
    ctx.lineTo(px(hx - width / 2), py(hy) + s / 2);
    ctx.moveTo(px(hx + width / 2), py(hy) - s / 2);
    ctx.lineTo(px(hx + width / 2), py(hy) + s / 2);
    ctx.stroke();
    ctx.strokeRect(px(hx), py(hy), s, s);
  }
  if (o.face && sheet.face) {
    const fx = sheet.face.x + d.headShift;
    const fy = sheet.face.y + d.headOffset;
    ctx.strokeStyle = OVERLAYS.face.colour;
    ctx.strokeRect(px(fx), py(fy), s, s);
    ctx.beginPath();
    ctx.moveTo(px(fx) - s, py(fy) + s / 2);
    ctx.lineTo(px(fx) + 2 * s, py(fy) + s / 2);
    ctx.moveTo(px(fx) + s / 2, py(fy) - s);
    ctx.lineTo(px(fx) + s / 2, py(fy) + 2 * s);
    ctx.stroke();
  }
  updateInfo(sheet, d);
}

const moved = (right: number, down: number) =>
  [right && `${Math.abs(right)} px ${right > 0 ? 'right' : 'left'}`, down && `${Math.abs(down)} px ${down > 0 ? 'down' : 'up'}`]
    .filter(Boolean)
    .join(' and ');

let lastInfo = '';
function updateInfo(sheet: SpriteSheet, d: Drawn) {
  const anim = sheet.animations[d.anim];
  const parts = [
    `<b>${sheet.name}</b>`,
    shapeNameOf(sheet.name) ? `shape <b>${shapeNameOf(sheet.name)}</b>` : 'no shape',
    sheet.face ? `face set <b>${sheet.faceSet?.name ?? '?'}</b>` : 'face drawn on the body',
    `<b>${d.anim}</b> frame ${d.frame + 1} of ${d.frames}${anim ? ` (${anim.frameMs} ms)` : ''}`,
    sheet.face ? `face <b>${d.face}</b>` : '',
    d.hatSize ? `${hatName(state.hat)}: size ${d.hatSize.col + 1}, ${d.hatSize.width} px wide in ${d.hatSize.room} px of room` : '',
    d.headOffset || d.headShift ? `head moved ${moved(d.headShift, d.headOffset)}` : '',
  ].filter(Boolean);
  const html = parts.join(' · ');
  if (html !== lastInfo) $('info').innerHTML = lastInfo = html;
}

// Canvases drawn every frame besides the stage: the lineup and the tiles
// on the Faces and Hats tabs.
let tiles: { canvas: HTMLCanvasElement; draw: (c: HTMLCanvasElement) => void }[] = [];

let last = performance.now();
function tick(now: number) {
  if (state.playing) time += (now - last) * state.speed;
  last = now;
  if (state.view === 'single') drawStage();
  for (const t of tiles) if (t.canvas.isConnected) t.draw(t.canvas);
  tiles = tiles.filter((t) => t.canvas.isConnected);
  requestAnimationFrame(tick);
}

function tile(label: string, draw: (c: HTMLCanvasElement) => void, onClick?: () => void, selected = false, scale = 3) {
  const el = document.createElement('button');
  el.className = 'tile' + (selected ? ' selected' : '');
  const canvas = document.createElement('canvas');
  canvas.width = BOX * scale;
  canvas.height = BOX * scale;
  el.append(canvas);
  const span = document.createElement('span');
  span.innerHTML = label;
  el.append(span);
  if (onClick) el.onclick = onClick;
  else el.disabled = true;
  tiles.push({ canvas, draw });
  return el;
}

// ------------------------------------------------------------------- UI

const stars = (n?: number) => (n ? '<span class="stars">' + '★'.repeat(n) + '</span>' : '');

function renderControls() {
  const scale = $<HTMLSelectElement>('scale');
  scale.innerHTML = [4, 6, 8, 10, 12, 16].map((n) => `<option value="${n}">${n}×</option>`).join('');
  scale.value = String(state.scale);
  scale.onchange = () => {
    state.scale = Number(scale.value);
    save();
  };
  const bg = $<HTMLSelectElement>('bg');
  bg.innerHTML = Object.entries(BACKGROUNDS).map(([k, v]) => `<option value="${k}">${v}</option>`).join('');
  bg.value = state.bg;
  bg.onchange = () => {
    state.bg = bg.value;
    save();
  };
  const ov = $('overlays');
  ov.innerHTML = '';
  for (const [key, o] of Object.entries(OVERLAYS)) {
    const label = document.createElement('label');
    label.title = o.tip;
    label.innerHTML = `<input type="checkbox" ${state.overlays[key] ? 'checked' : ''}><i style="background:${o.colour}"></i>${o.label}`;
    label.querySelector('input')!.onchange = (e) => {
      state.overlays[key] = (e.target as HTMLInputElement).checked;
      save();
    };
    ov.append(label);
  }
  $('reload').onclick = () => load();
  const views = $('views');
  views.innerHTML = '';
  for (const [v, label] of [['single', 'One pet'], ['lineup', 'Lineup']] as const) {
    const b = document.createElement('button');
    b.textContent = label;
    b.className = state.view === v ? 'on' : '';
    b.onclick = () => {
      state.view = v;
      save();
      renderControls();
      renderView();
    };
    views.append(b);
  }
}

function renderPicker() {
  const el = $('picker');
  el.innerHTML = '';
  for (const g of groups()) {
    // Each group folds up; the one holding the selected pet stays open.
    const group = document.createElement('details');
    group.open = !state.closed.includes(g.title) || g.entries.some((e) => e.sheet === state.sheet);
    group.ontoggle = () => {
      state.closed = state.closed.filter((t) => t !== g.title);
      if (!group.open) state.closed.push(g.title);
      save();
    };
    const h = document.createElement('summary');
    h.innerHTML = `${g.title} <small>${g.entries.length}</small>`;
    group.append(h);
    el.append(group);
    for (const e of g.entries) {
      const b = document.createElement('button');
      b.className = 'pet' + (e.sheet === state.sheet ? ' on' : '');
      const note = swapped.has(e.sheet) ? 'dropped PNG' : e.note;
      b.innerHTML = `${e.label} ${stars(e.stars)}${note ? ` <small>${note}</small>` : ''}`;
      b.onclick = () => select(e.sheet);
      group.append(b);
    }
  }
}

function select(sheet: string) {
  state.sheet = sheet;
  if (!library.get(sheet)?.animations[state.anim]) state.anim = 'idle';
  save();
  renderPicker();
  renderTab();
  if (state.view === 'lineup') {
    state.view = 'single';
    renderControls();
    renderView();
  }
}

function renderView() {
  $('single').hidden = state.view !== 'single';
  const lineup = $('lineup');
  lineup.hidden = state.view !== 'lineup';
  lineup.innerHTML = '';
  if (state.view !== 'lineup') return;
  // With many characters, show only some: a theme, a rarity, no variants.
  const all = groups();
  const f = state.lineup;
  const pick = (change: Partial<State['lineup']>) => () => {
    Object.assign(f, change);
    save();
    renderView();
  };
  const filters = el('div', '', 'buttons row filters');
  filters.append(button('All', pick({ group: '' }), !f.group));
  for (const g of all) filters.append(button(g.title, pick({ group: g.title }), f.group === g.title));
  const rarity = el('div', '', 'buttons row filters');
  rarity.append(button('Any rarity', pick({ stars: 0 }), !f.stars));
  for (const n of [1, 2, 3]) rarity.append(button(stars(n), pick({ stars: n }), f.stars === n));
  rarity.append(button('Variants', pick({ variants: !f.variants }), f.variants, 'Show colour variants too'));
  lineup.append(filters, rarity);
  for (const g of all) {
    if (f.group && g.title !== f.group) continue;
    const entries = g.entries.filter((e) => (!f.stars || e.stars === f.stars) && (f.variants || !e.variant));
    if (!entries.length) continue;
    const h = document.createElement('h3');
    h.textContent = g.title;
    lineup.append(h);
    const row = document.createElement('div');
    row.className = 'tiles';
    for (const e of entries) {
      const sheet = library.get(e.sheet)!;
      row.append(
        tile(`${e.label} ${stars(e.stars)}`, (c) => drawTile(c, sheet, state.anim, state.face, library.get(state.hat), time), () => select(e.sheet), e.sheet === state.sheet),
      );
    }
    lineup.append(row);
  }
}

const TABS: Record<Tab, { label: string; guide: string[] }> = {
  animations: { label: 'Animations', guide: ['What a sprite sheet looks like', 'Extra idle moves (idle sets)'] },
  moves: { label: 'Idle moves', guide: ['Extra idle moves (idle sets)'] },
  faces: { label: 'Faces', guide: ['Faces and expressions'] },
  hats: { label: 'Hats', guide: ['Hats'] },
  tweak: { label: 'Tweak', guide: ['Body shapes'] },
  recolour: { label: 'Recolour', guide: ['Adding a colour variant'] },
  checks: { label: 'Checks', guide: ['Consistency rules (especially for AI-generated art)', 'The palette'] },
  traits: { label: 'Traits', guide: ['How characters work'] },
};

function renderTabs() {
  const nav = $('tabs');
  nav.innerHTML = '';
  for (const [key, t] of Object.entries(TABS) as [Tab, (typeof TABS)[Tab]][]) {
    const b = document.createElement('button');
    b.textContent = t.label;
    b.className = state.tab === key ? 'on' : '';
    b.onclick = () => {
      state.tab = key;
      save();
      renderTabs();
      renderTab();
    };
    nav.append(b);
  }
  $('guide-text').innerHTML = TABS[state.tab].guide.map((t) => markdownToHtml(section(t))).join('');
}

function button(label: string, onClick: () => void, on = false, title = '') {
  const b = document.createElement('button');
  b.innerHTML = label;
  b.className = on ? 'on' : '';
  b.title = title;
  b.onclick = onClick;
  return b;
}

function el(tag: string, html = '', className = '') {
  const e = document.createElement(tag);
  e.innerHTML = html;
  if (className) e.className = className;
  return e;
}

function renderTab() {
  const box = $('tab');
  box.innerHTML = '';
  const sheet = library.get(state.sheet);
  if (!sheet) return;
  ({ animations, moves, faces, hats, tweak, recolour, checks, traits })[state.tab](box, sheet);
}

function animations(box: HTMLElement, sheet: SpriteSheet) {
  box.append(el('h4', 'Animation'));
  const list = el('div', '', 'buttons');
  for (const [name, a] of Object.entries(sheet.animations).sort((x, y) => x[1].row - y[1].row)) {
    list.append(
      button(`${name} <small>row ${a.row} · ${a.frames}×${a.frameMs}ms</small>`, () => {
        state.anim = name;
        time = 0;
        save();
        renderTab();
      }, state.anim === name),
    );
  }
  box.append(list);
  box.append(el('h4', 'Playback'));
  const play = el('div', '', 'buttons row');
  const step = (by: number) => {
    state.playing = false;
    const a = sheet.animations[state.anim] ?? sheet.animations.idle;
    const frame = Math.floor(time / a.frameMs) % a.frames;
    time = ((frame + by + a.frames) % a.frames) * a.frameMs + 1;
    renderTab();
  };
  play.append(
    button('◀', () => step(-1), false, 'Previous frame'),
    button(state.playing ? 'Pause' : 'Play', () => {
      state.playing = !state.playing;
      renderTab();
    }),
    button('▶', () => step(1), false, 'Next frame'),
  );
  for (const sp of [0.25, 0.5, 1, 2])
    play.append(
      button(`${sp}×`, () => {
        state.speed = sp;
        save();
        renderTab();
      }, state.speed === sp),
    );
  box.append(play);
  const moves = el('label', `<input type="checkbox" ${state.idleMoves ? 'checked' : ''}> Play idle moves now and then during idle and cheerful`, 'check');
  moves.querySelector('input')!.onchange = (e) => {
    state.idleMoves = (e.target as HTMLInputElement).checked;
    save();
  };
  box.append(moves);
  if (!sheet.idleMoves) box.append(el('p', 'This sheet has no idle set, so it has no extra idle moves.', 'muted'));
  const missing = Object.keys(manifest.animations).filter((a) => !sheet.animations[a]);
  if (missing.length) box.append(el('p', `Not on this sheet, so the game plays idle instead: ${missing.join(', ')}.`, 'muted'));
}

// Every idle move across every set: its row, which sets have it, which
// pets get it, and the next free row for a new one.
function moves(box: HTMLElement, sheet: SpriteSheet) {
  const sets = manifest.idleSets ?? {};
  const setsOf = (name: string) => [resolveSheet(manifest, name)?.idleSet ?? []].flat();
  const pets = Object.keys(manifest.sheets).filter((n) => !n.startsWith('hat-') && library.has(n));
  const usedRows = [
    ...Object.values(manifest.animations),
    ...Object.values(sets).flatMap((set) => Object.values(set.animations)),
    ...Object.values(manifest.sheets).flatMap((s) => Object.values(s.animations ?? {})),
  ].map((a) => a.row);
  const nextRow = Math.max(...usedRows) + 1;

  const mine = setsOf(sheet.name);
  box.append(el('h4', `${sheet.name}`));
  box.append(
    el(
      'p',
      mine.length
        ? `Uses ${mine.map((n) => `<code>${n}</code>`).join(' + ')}: ${(sheet.idleMoves ?? []).map((m) => `<code>${m}</code>`).join(', ') || 'no moves drawn yet'}.`
        : 'Uses no idle set, so it only plays its idle loop.',
      'muted',
    ),
  );

  box.append(el('h4', 'Every move'));
  const table = el('table', '<thead><tr><th>Move</th><th>Row</th><th>Set</th><th>Pets</th></tr></thead>', 'moves');
  const body = document.createElement('tbody');
  for (const [setName, set] of Object.entries(sets))
    for (const [move, a] of Object.entries(set.animations).sort((x, y) => x[1].row - y[1].row)) {
      const users = pets.filter((n) => setsOf(n).includes(setName));
      // Shown on the selected pet if it has the move, else the first pet that does.
      const shown = [sheet.name, ...users].map((n) => library.get(n)).find((s) => s?.animations[move]);
      const tr = document.createElement('tr');
      const preview = document.createElement('td');
      if (shown) preview.append(tile('', (c) => drawTile(c, shown, move, state.face, library.get(state.hat), time), undefined, false, 1.5));
      preview.append(el('div', `<code>${move}</code><br><small>${a.frames}×${a.frameMs}ms</small>`));
      tr.append(preview);
      tr.append(
        el('td', String(a.row)),
        el('td', `<code>${setName}</code>`),
      );
      // A count, and a list to pick a pet from, which stays short however
      // many pets share the move.
      const who = document.createElement('td');
      const undrawn = users.filter((n) => !library.get(n)?.animations[move]);
      who.append(el('small', users.length ? `${users.length} pet${users.length === 1 ? '' : 's'}${undrawn.length ? `, ${undrawn.length} not drawn` : ''}` : 'none yet'));
      if (users.length) {
        const pick = document.createElement('select');
        pick.innerHTML =
          '<option value="">Play on…</option>' +
          users.map((n) => `<option value="${n}">${n}${undrawn.includes(n) ? ' (not drawn)' : ''}</option>`).join('');
        pick.onchange = () => {
          if (!pick.value) return;
          state.anim = move;
          state.tab = 'animations';
          time = 0;
          select(pick.value);
          renderTabs();
          renderTab();
        };
        who.append(document.createElement('br'), pick);
      }
      tr.append(who);
      body.append(tr);
    }
  table.append(body);
  box.append(Object.keys(sets).length ? table : el('p', 'No idle sets yet.', 'muted'));

  box.append(el('h4', 'Add a move'));
  box.append(
    el(
      'p',
      `The next free row is <b>${nextRow}</b>. Every move has a row of its own, across all the sets, so sets can be mixed. For one move per set, add this under <code>"idleSets"</code> in <code>manifest.json</code>, draw a tag with the same name, and give a pet <code>"idleSet": ["${Object.keys(sets)[0] ?? 'curious'}", "hop"]</code>:`,
      'muted',
    ),
  );
  box.append(el('pre', `<code>"hop": { "animations": { "idle-hop": { "row": ${nextRow}, "frames": 4, "frameMs": 260 } } }</code>`));
}

function faces(box: HTMLElement, sheet: SpriteSheet) {
  if (!sheet.face) {
    box.append(
      el('p', "This sheet has no face point, so its face is drawn on the body and it always shows the face of its animation. Give its shape a <code>face</code> in the manifest to use a face set (see the guide below).", 'muted'),
    );
    return;
  }
  box.append(el('p', `Face set <b>${sheet.faceSet?.name}</b> at (${sheet.face.x}, ${sheet.face.y}). Click a face to keep it on the preview.`, 'muted'));
  const row = el('div', '', 'buttons row');
  row.append(
    button('Auto (from the animation)', () => setFace('auto'), state.face === 'auto'),
    button('From the Traits tab', () => setFace('mood'), state.face === 'mood'),
  );
  box.append(row);
  const grid = el('div', '', 'tiles');
  EXPRESSIONS.forEach((expr, i) => {
    const own = sheet.faceSet?.frames[i] ?? 0;
    const note = own ? `${own} frame${own > 1 ? 's' : ''}` : sheet.faceFallback?.frames[i] ? 'from blob' : 'missing';
    grid.append(tile(`${expr} <small>${note}</small>`, (c) => drawTile(c, sheet, state.anim, expr, library.get(state.hat), time), () => setFace(expr), state.face === expr, 2));
  });
  box.append(grid);
}

function setFace(face: Face) {
  state.face = face;
  save();
  renderTab();
  renderView();
}

function hats(box: HTMLElement, sheet: SpriteSheet) {
  if (!sheet.head) {
    box.append(el('p', "This sheet has no body shape, so it can't wear hats.", 'muted'));
    return;
  }
  const ownHead = fits[fitNameOf(sheet.name)]?.head ? ` (its own, not the shape's)` : '';
  box.append(el('p', `Shape <b>${shapeNameOf(sheet.name)}</b>: hat point (${sheet.head.x}, ${sheet.head.y})${ownHead}, ${sheet.head.width} px of room.`, 'muted'));
  const table = el('table', '<thead><tr><th>Hat</th><th>Sizes (px)</th><th>Picked</th><th>Nudge</th></tr></thead>');
  const body = document.createElement('tbody');
  const rows: [string, string][] = [['', 'No hat'], ...HATS.map((h) => [h.sheet, h.name] as [string, string])];
  for (const [id, name] of rows) {
    const tr = document.createElement('tr');
    tr.className = 'pick' + (state.hat === id ? ' on' : '');
    const hat = library.get(id);
    const fit = sheet.hats?.[id];
    const room = fit?.width ?? sheet.head.width;
    const widths = hat?.hatWidths ?? [];
    const col = widths.length ? pickHatFrame(widths, room) : -1;
    tr.innerHTML = id
      ? `<td>${name}</td><td>${widths.map((w, i) => (i === col ? `<b>${w}</b>` : w)).join(' · ')}</td><td>${col >= 0 ? `size ${col + 1}${widths[col] > room ? ' (too wide, smallest)' : ''}` : '?'}</td><td>${fit ? JSON.stringify(fit) : ''}</td>`
      : `<td colspan="4">${name}</td>`;
    tr.onclick = () => {
      state.hat = id;
      save();
      renderTab();
      renderView();
    };
    body.append(tr);
  }
  table.append(body);
  box.append(table);
  box.append(el('h4', 'Every hat on this pet'));
  const grid = el('div', '', 'tiles');
  for (const h of HATS) {
    const hat = library.get(h.sheet);
    grid.append(tile(h.name, (c) => drawTile(c, sheet, state.anim, state.face, hat, time), () => {
      state.hat = h.sheet;
      save();
      renderTab();
    }, state.hat === h.sheet, 2));
  }
  box.append(grid);
  // A new hat has to look right on every body, so here it is on one sheet
  // of each shape, and on every sheet with points of its own.
  const hat = library.get(state.hat);
  if (!hat) return;
  box.append(el('h4', `The ${hatName(state.hat)} on every shape`));
  const seen = new Set<string>();
  const others = el('div', '', 'tiles');
  for (const s of library.values()) {
    const shapeName = shapeNameOf(s.name);
    if (!shapeName || dropped.has(s.name) || manifest.sheets[s.name]?.from) continue;
    const own = !!fits[s.name];
    if (!own && seen.has(shapeName)) continue;
    if (!own) seen.add(shapeName);
    others.append(tile(own ? `${s.name} <small>own points</small>` : `${shapeName} <small>${s.name}</small>`, (c) => drawTile(c, s, state.anim, state.face, hat, time), () => select(s.name), s.name === sheet.name, 2));
  }
  box.append(others);
}

function numberField(label: string, value: number | undefined, onChange: (v: number | undefined) => void, optional = false) {
  const wrap = el('label', `${label} `, 'field');
  const input = document.createElement('input');
  input.type = 'number';
  input.value = value === undefined ? '' : String(value);
  input.placeholder = optional ? '0' : '';
  input.oninput = () => onChange(input.value === '' ? undefined : Number(input.value));
  wrap.append(input);
  return wrap;
}

function tweak(box: HTMLElement, sheet: SpriteSheet) {
  const name = shapeNameOf(sheet.name);
  const shape = name && shapes[name];
  if (!name || !shape) {
    box.append(el('p', 'This sheet has no body shape to tweak.', 'muted'));
    return;
  }
  const own = state.tweakOwn;
  const fitName = fitNameOf(sheet.name);
  const users = [...library.keys()].filter((n) => shapeNameOf(n) === name);
  const modes = el('div', '', 'buttons row');
  const mode = (on: boolean) => () => {
    state.tweakOwn = on;
    save();
    renderTab();
  };
  modes.append(
    button(`Shape ${name}`, mode(false), !own, `Every sheet of this shape: ${users.join(', ')}`),
    button(`Only ${fitName}`, mode(true), own, 'Just this sheet (and its recolours): its own points win over its shape\'s'),
  );
  box.append(modes);
  box.append(
    el(
      'p',
      own
        ? `Changes here move the hat and face on <b>${fitName}</b> only (and recolours made from it), on this page only. Copy the result over its entry under <code>"sheets"</code> in <code>public/sprites/manifest.json</code> to keep it. Use this when one character sits a little differently from the rest of its shape.`
        : `Changes here move the hat and face on every sheet of shape <b>${name}</b> (${users.join(', ')}), on this page only. Copy the result into <code>public/sprites/manifest.json</code> under <code>"shapes"</code> to keep it.`,
      'muted',
    ),
  );
  const body = bodyOf(sheet.name)!;
  const fit = () => (fits[fitName] ??= {});
  const changed = () => {
    if (fits[fitName] && !Object.keys(fits[fitName]).length) delete fits[fitName];
    applyShape(name);
    showJson();
  };
  const setHead = (key: 'x' | 'y' | 'width', v: number | undefined) => {
    if (own) fit().head = { ...body.head, ...fits[fitName]?.head, [key]: v ?? 0 };
    else shape.head[key] = v ?? 0;
    changed();
  };
  box.append(el('h4', 'Hat point'));
  const head = el('div', '', 'fields');
  head.append(
    numberField('x', body.head.x, (v) => setHead('x', v)),
    numberField('y', body.head.y, (v) => setHead('y', v)),
    numberField('width', body.head.width, (v) => setHead('width', v)),
  );
  box.append(head);
  box.append(el('h4', 'Face point'));
  const face = el('div', '', 'fields');
  const setFacePoint = (key: 'x' | 'y', v: number | undefined) => {
    if (own) fit().face = { ...body.face!, ...fits[fitName]?.face, [key]: v ?? 0 };
    else shape.face![key] = v ?? 0;
    changed();
  };
  if (body.face) {
    face.append(numberField('x', body.face.x, (v) => setFacePoint('x', v)), numberField('y', body.face.y, (v) => setFacePoint('y', v)));
    if (!own) face.append(button('Remove', () => ((shape.face = undefined), changed(), renderTab()), false, 'Draw the face on the body instead'));
  } else if (own) {
    face.append(el('span', 'None: the face is drawn on the body. Add a face point to the shape first.', 'muted'));
  } else {
    face.append(el('span', 'None: the face is drawn on the body. ', 'muted'));
    face.append(button('Add a face point', () => ((shape.face = { x: 16, y: 18 }), changed(), renderTab())));
  }
  box.append(face);
  if (state.hat) {
    box.append(el('h4', `Nudge only the ${hatName(state.hat)} on ${own ? fitName : 'this shape'}`));
    const target = own ? fits[fitName]?.hats : shape.hats;
    const now = target?.[state.hat] ?? {};
    const set = (key: 'x' | 'y' | 'width', v: number | undefined) => {
      const holder: { hats?: Record<string, HatFit> } = own ? fit() : shape;
      holder.hats ??= {};
      const next = { ...holder.hats[state.hat], [key]: v };
      for (const k of ['x', 'y', 'width'] as const) if (!next[k]) delete next[k];
      if (Object.keys(next).length) holder.hats[state.hat] = next;
      else delete holder.hats[state.hat];
      if (!Object.keys(holder.hats).length) delete holder.hats;
      changed();
    };
    const nudge = el('div', '', 'fields');
    nudge.append(
      numberField('x', now.x, (v) => set('x', v), true),
      numberField('y', now.y, (v) => set('y', v), true),
      numberField('width', now.width, (v) => set('width', v), true),
    );
    box.append(nudge);
  } else box.append(el('p', `Pick a hat on the Hats tab to nudge just that hat on ${own ? fitName : 'this shape'}.`, 'muted'));

  const pre = el('pre', '', 'json');
  const status = el('p', '', 'muted');
  const showJson = () => {
    let now: string;
    let same: boolean;
    if (own) {
      const entry: Record<string, unknown> = { ...manifest.sheets[fitName] };
      for (const k of ['head', 'face', 'hats'] as const) delete entry[k];
      Object.assign(entry, fits[fitName]);
      now = `"${fitName}": ${JSON.stringify(entry, null, 2)}`;
      same = JSON.stringify(fits[fitName] ?? {}) === JSON.stringify(originalFits[fitName] ?? {});
    } else {
      now = `"${name}": ${JSON.stringify(shape, null, 2)}`;
      same = JSON.stringify(shape) === JSON.stringify(original[name]);
    }
    pre.textContent = now;
    status.textContent = same ? 'Same as the manifest.' : 'Changed from the manifest.';
    status.className = same ? 'muted' : 'changed';
  };
  showJson();
  box.append(el('h4', 'For manifest.json'), status, pre);
  const row = el('div', '', 'buttons row');
  row.append(
    button('Copy', () => navigator.clipboard?.writeText(pre.textContent ?? '')),
    button('Reset', () => {
      if (own) {
        if (originalFits[fitName]) fits[fitName] = structuredClone(originalFits[fitName]);
        else delete fits[fitName];
      } else shapes[name] = structuredClone(original[name]);
      applyShape(name);
      renderTab();
    }),
  );
  if (own && fits[fitName])
    row.append(
      button("Use the shape's points", () => {
        delete fits[fitName];
        applyShape(name);
        renderTab();
      }, false, 'Take away this sheet\'s own points'),
    );
  box.append(row);
}

function checkList(results: Check[]) {
  const ul = el('ul', '', 'checks');
  for (const c of results)
    ul.append(el('li', `<span>${c.ok ? '✓' : c.warn ? '?' : '⚠'}</span> <b>${c.label}</b>${c.detail ? `<br><small>${c.detail}</small>` : ''}`, c.ok ? 'ok' : c.warn ? 'hint' : 'bad'));
  return ul;
}

// A pet body is checked against every shared row, so a missing tag shows
// up as the wrong sheet size. The game itself only keeps the rows a
// picture has (see sheetAnimations), and the egg only has idle.
function withAllRows(sheet: SpriteSheet): SpriteSheet {
  if (!manifest.sheets[sheet.name] || !resolveSheet(manifest, sheet.name).shape) return sheet;
  return { ...sheet, animations: sheetAnimations(manifest, sheet.name) };
}

function checks(box: HTMLElement, sheet: SpriteSheet) {
  box.append(el('h4', `${sheet.name}`));
  box.append(checkList(checkSheet(withAllRows(sheet), 'pet')));
  box.append(el('p', "The outline check is only a hint (marked ?), since a part can bend the rule on purpose. Not checked here: ink for lines inside the pet, and the same silhouette across frames. Look at those with the pixel grid on.", 'muted'));
  box.append(el('h4', 'Every sheet'));
  const table = el('table', '<thead><tr><th>Sheet</th><th>Problems</th></tr></thead>');
  const body = document.createElement('tbody');
  const all: [string, SpriteSheet | FaceSheet, 'pet' | 'hat' | 'face'][] = [
    ...[...library.values()].map((s) => [s.name, s, s.name.startsWith('hat-') ? 'hat' : 'pet'] as [string, SpriteSheet, 'pet' | 'hat']),
    ...[...faceSets().values()].map((f) => [`face set ${f.name}`, f, 'face'] as [string, FaceSheet, 'face']),
  ];
  for (const [name, s, kind] of all.sort((a, b) => a[0].localeCompare(b[0]))) {
    const bad = checkSheet(kind === 'pet' ? withAllRows(s as SpriteSheet) : ({ animations: {}, ...s } as SpriteSheet), kind).filter((c) => !c.ok);
    const real = bad.filter((c) => !c.warn);
    const tr = el('tr', `<td>${name}</td><td>${bad.length ? bad.map((c) => `${c.warn ? '?' : '⚠'} ${c.label}`).join('<br>') : '✓'}</td>`, real.length ? 'bad' : 'ok');
    if (kind === 'pet') {
      tr.className += ' pick';
      tr.onclick = () => select(name);
    }
    body.append(tr);
  }
  table.append(body);
  box.append(table);
}

// The sheet a recolour is painted from: the selected sheet, or the sheet a
// recolour (in the manifest or tried here) is made from.
function recolourBase(name: string): string {
  const tried = dropped.get(name);
  if (tried && name.endsWith(' (try)')) return tried;
  return manifest.sheets[name]?.from ?? name;
}

// How many pixels of each palette colour a sheet uses, most first.
function coloursOf(sheet: SpriteSheet): [string, number][] {
  const { data } = pixelsOf(sheet.image);
  const byRgb = new Map(Object.entries(PALETTE).map(([n, hex]) => [parseInt(hex.slice(1), 16), n] as const));
  const counts = new Map<string, number>();
  for (let i = 0; i < data.length; i += 4) {
    if (!data[i + 3]) continue;
    const n = byRgb.get((data[i] << 16) | (data[i + 1] << 8) | data[i + 2]) ?? 'other';
    counts.set(n, (counts.get(n) ?? 0) + 1);
  }
  return [...counts].sort((a, b) => b[1] - a[1]);
}

// Puts the recolour being tried into the library as "<base> (try)", so it
// shows on the stage, in the lineup and on every other tab.
function tryRecolour(): string {
  const { base, swaps } = state.recolour;
  const from = library.get(base)!;
  const pixels = pixelsOf(from.image);
  const data = new Uint8ClampedArray(pixels.data);
  recolourPixels(data, swaps, PALETTE);
  const canvas = document.createElement('canvas');
  canvas.width = from.image.width;
  canvas.height = from.image.height;
  canvas.getContext('2d')!.putImageData(new ImageData(data, canvas.width, canvas.height), 0, 0);
  const name = `${base} (try)`;
  library.set(name, { ...from, name, image: canvas as unknown as HTMLImageElement });
  dropped.set(name, base);
  return name;
}

function recolour(box: HTMLElement, sheet: SpriteSheet) {
  const base = recolourBase(sheet.name);
  if (!library.has(base) || base.startsWith('hat-')) {
    box.append(el('p', 'Pick a pet to recolour.', 'muted'));
    return;
  }
  // Starting on a new base: take its manifest swaps if it's a recolour.
  if (state.recolour.base !== base) {
    const known = manifest.sheets[sheet.name]?.from ? manifest.sheets[sheet.name] : undefined;
    state.recolour = { base, name: known ? sheet.name : `${base}-new`, swaps: { ...known?.recolour } };
  }
  const rc = state.recolour;
  const tried = tryRecolour();
  if (state.sheet !== tried) {
    state.sheet = tried;
    renderPicker();
    if (state.view === 'lineup') renderView();
  }
  save();
  box.append(el('p', `Swap any colour of <b>${base}</b> for another palette colour. The preview and every other tab show the result, on this page only. Each swap changes that colour <b>everywhere</b> on the sheet.`, 'muted'));

  const grid = el('div', '', 'recolours');
  const used = coloursOf(library.get(base)!);
  const changed = () => {
    tryRecolour();
    showJson();
    renderTab();
  };
  for (const [name, count] of used) {
    const row = el('div', '', 'swap');
    const to = rc.swaps[name] ?? '';
    row.append(el('span', `<i style="background:${PALETTE[name as keyof typeof PALETTE] ?? '#000'}"></i>${name} <small>${count} px</small>`));
    row.append(el('span', '→'));
    const sel = document.createElement('select');
    sel.disabled = name === 'other';
    sel.innerHTML =
      `<option value="">keep</option>` +
      Object.keys(PALETTE)
        .filter((n) => n !== name)
        .map((n) => `<option value="${n}">${n}</option>`)
        .join('');
    sel.value = to;
    sel.onchange = () => {
      if (sel.value) rc.swaps[name] = sel.value;
      else delete rc.swaps[name];
      // A new body colour brings its own outline along (the outline rule),
      // when every part with the old outline now takes the same new one.
      if (!OUTLINES.includes(name as ColourName))
        Object.assign(rc.swaps, outlineSwaps(rc.swaps, used.map(([c]) => c), OUTLINE_OF));
      changed();
    };
    const swatch = el('i', '', 'chip');
    swatch.style.background = PALETTE[(to || name) as keyof typeof PALETTE] ?? '#000';
    row.append(swatch, sel);
    // The outline rule: the outline takes the dark colour of the body it
    // touches, so a new body colour usually needs a new outline too.
    if (OUTLINES.includes(name as ColourName)) {
      const bodies = Object.entries(rc.swaps)
        .filter(([f]) => OUTLINE_OF[f as ColourName] === name)
        .map(([, t]) => OUTLINE_OF[t as ColourName])
        .filter(Boolean);
      const hint = bodies.find((o) => o !== (to || name));
      if (hint)
        row.append(
          button(`use ${hint}`, () => {
            rc.swaps[name] = hint;
            changed();
          }, false, `The outline rule gives ${hint} for the new body colour`),
        );
    }
    grid.append(row);
  }
  box.append(grid);
  if (sheet.face || library.get(base)?.face)
    box.append(el('p', "The face is drawn by the game from its face set, so a recolour never changes it. Only the body's colours swap.", 'muted'));

  box.append(el('h4', 'Compare'));
  const tiles = el('div', '', 'tiles');
  tiles.append(
    tile(base, (c) => drawTile(c, library.get(base)!, state.anim, state.face, library.get(state.hat), time), undefined, false, 2),
    tile('recolour', (c) => drawTile(c, library.get(tried)!, state.anim, state.face, library.get(state.hat), time), undefined, true, 2),
  );
  box.append(tiles);

  box.append(el('h4', 'Keep it'));
  const nameField = el('label', 'Sheet name ', 'field wide');
  const input = document.createElement('input');
  input.value = rc.name;
  input.oninput = () => {
    rc.name = input.value.trim() || `${base}-new`;
    save();
    showJson();
  };
  nameField.append(input);
  box.append(nameField);
  const pre = el('pre', '', 'json');
  const pre2 = el('pre', '', 'json');
  const showJson = () => {
    const variant = rc.name.startsWith(`${base}-`) ? rc.name.slice(base.length + 1) : rc.name;
    const label = variant.replace(/(^|-)(\w)/g, (_, d, c: string) => (d ? ' ' : '') + c.toUpperCase());
    pre.textContent = `"${rc.name}": ${JSON.stringify({ from: base, recolour: rc.swaps })}`;
    pre2.textContent = JSON.stringify({ id: variant, name: label, sheet: rc.name, chance: 10 });
  };
  showJson();
  box.append(el('p', 'In <code>public/sprites/manifest.json</code>, under <code>"sheets"</code>:', 'muted'), pre);
  box.append(el('p', `In <code>src/data/characters.json</code>, in ${base}'s <code>"variants"</code> list:`, 'muted'), pre2);
  const row = el('div', '', 'buttons row');
  row.append(
    button('Copy manifest line', () => navigator.clipboard?.writeText(pre.textContent ?? '')),
    button('Copy variant line', () => navigator.clipboard?.writeText(pre2.textContent ?? '')),
    button('Clear swaps', () => {
      rc.swaps = {};
      changed();
    }),
  );
  box.append(row);
}

function traits(box: HTMLElement, sheet: SpriteSheet) {
  const row = el('div', '', 'buttons');
  for (const t of TRAITS)
    row.append(
      button(`${t.name}${t.special ? ' <small>special</small>' : ''}`, () => {
        state.trait = t.id;
        save();
        renderTab();
      }, state.trait === t.id),
    );
  box.append(row);
  const trait = currentTrait();
  if (!trait) return;
  box.append(el('p', trait.about));
  const numbers: string[] = [];
  const times = (n: number | undefined) => (n === undefined ? '' : `${n}×`);
  numbers.push(`Idle moves about every <b>${Math.round(idleEveryMs(trait) / 100) / 10}s</b> (usually ${CONFIG.idleMoveEveryMs / 1000}s)`);
  for (const r of Object.keys(CONFIG.expressions.ms) as Reaction[])
    numbers.push(`${r} face lasts <b>${reactionMs(r, trait) / 1000}s</b>`);
  if (trait.poutAfter) numbers.push(`Pouts after <b>${(CONFIG.expressions.poutAfterMs * trait.poutAfter) / 60000} min</b> alone (${times(trait.poutAfter)})`);
  if (trait.hungryBelow) numbers.push(`Looks hungry below <b>${CONFIG.expressions.hungryBelow + trait.hungryBelow}</b> tummy`);
  if (trait.sleepyBelow) numbers.push(`Looks sleepy below <b>${CONFIG.expressions.sleepyBelow + trait.sleepyBelow}</b> energy`);
  if (trait.sadBelow) numbers.push(`Sad below <b>${CONFIG.expressions.sadBelow + trait.sadBelow}</b> joy, crying below <b>${CONFIG.expressions.cryingBelow + trait.sadBelow}</b>`);
  if (trait.lovesEverySnack) numbers.push('Falls in love with every snack');
  if (trait.grumpyWhenWoken) numbers.push('Grumpy when woken');
  box.append(el('ul', numbers.map((n) => `<li>${n}</li>`).join('')));
  const can = characters.characters.filter((c) => allowedTraits(c as { traits?: string[] }).includes(trait.id)).map((c) => c.name);
  box.append(el('p', `Characters that can have it: ${can.length === characters.characters.length ? 'all' : can.join(', ') || 'none yet'}.`, 'muted'));

  box.append(el('h4', 'Try a mood'));
  const use = el('label', `<input type="checkbox" ${state.face === 'mood' ? 'checked' : ''}> Show this mood and trait on the preview`, 'check');
  use.querySelector('input')!.onchange = (e) => setFace((e.target as HTMLInputElement).checked ? 'mood' : 'auto');
  box.append(use);
  const result = el('p', '', 'result');
  const show = () => (result.innerHTML = `Face: <b>${moodFace(state.anim)}</b> (while playing <b>${state.anim}</b>)`);
  const slider = (label: string, key: 'happiness' | 'hunger' | 'energy' | 'aloneMin', max: number) => {
    const wrap = el('label', `<span>${label}</span>`, 'slider');
    const input = document.createElement('input');
    input.type = 'range';
    input.min = '0';
    input.max = String(max);
    input.value = String(state.mood[key]);
    const out = el('output', String(state.mood[key]));
    input.oninput = () => {
      state.mood[key] = Number(input.value);
      out.textContent = input.value;
      save();
      show();
    };
    wrap.append(input, out);
    return wrap;
  };
  box.append(slider('Joy', 'happiness', 100), slider('Tummy', 'hunger', 100), slider('Energy', 'energy', 100), slider('Alone (min)', 'aloneMin', 10));
  const reaction = el('label', 'Reaction ', 'field');
  const sel = document.createElement('select');
  sel.innerHTML = ['', ...Object.keys(CONFIG.expressions.ms)].map((r) => `<option value="${r}">${r || 'none'}</option>`).join('');
  sel.value = state.mood.reaction;
  sel.onchange = () => {
    state.mood.reaction = sel.value as State['mood']['reaction'];
    save();
    show();
  };
  reaction.append(sel);
  box.append(reaction, result);
  show();
  if (!sheet.face) box.append(el('p', "This pet's face is drawn on its body, so pick one with a face point to see the faces.", 'muted'));
}

function renderAll() {
  renderControls();
  renderPicker();
  renderTabs();
  renderTab();
  renderView();
}

// ------------------------------------------------------- dropping a PNG

function loadImage(file: File): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error(`${file.name} isn't a picture`));
    img.src = URL.createObjectURL(file);
  });
}

async function addFile(file: File) {
  const image = await loadImage(file);
  const base = file.name.replace(/\.png$/i, '');
  const byFile = (path: string | undefined) => path?.split('/').pop()?.replace(/\.png$/, '') === base;
  // A face set: swap it on every sheet using it.
  const set = Object.entries(manifest.faceSets ?? {}).find(([, s]) => byFile(s.file));
  if (set) {
    const { frameWidth: fw, frameHeight: fh } = manifest;
    const sheet: FaceSheet = { name: set[0], image, frameWidth: fw, frameHeight: fh, frames: countFaceFrames(pixelsOf(image), fw, fh) };
    for (const s of library.values()) {
      if (s.faceSet?.name === set[0]) s.faceSet = sheet;
      if (s.faceFallback?.name === set[0]) s.faceFallback = sheet;
    }
    renderTab();
    return;
  }
  // An existing sheet (a pet or a hat): same settings, new picture.
  const existing = Object.entries(manifest.sheets).find(([, s]) => byFile(s.file));
  if (existing && library.has(existing[0])) {
    const s = library.get(existing[0])!;
    s.image = image;
    swapped.add(s.name);
    if (s.hatWidths) {
      const { data, width } = pixelsOf(image);
      s.hatWidths = Array.from({ length: Math.max(1, Math.floor(image.width / s.frameWidth)) }, (_, f) => {
        let l = Infinity;
        let r = -Infinity;
        for (let x = 0; x < s.frameWidth; x++)
          for (let y = 0; y < s.frameHeight; y++)
            if (data[(y * width + f * s.frameWidth + x) * 4 + 3]) [l, r] = [Math.min(l, x), Math.max(r, x)];
        return r >= l ? r - l + 1 : 0;
      });
    } else remeasure(s);
    if (!s.hatWidths) select(s.name);
    else {
      renderPicker();
      renderTab();
    }
    return;
  }
  // Something new: shown on the selected pet's body shape.
  const like = library.get(state.sheet);
  const name = `${base}.png`;
  const likeName = dropped.get(state.sheet) ?? state.sheet;
  const s: SpriteSheet = { ...(like ?? { frameWidth: 32, frameHeight: 32, animations: manifest.animations }), name, image } as SpriteSheet;
  // Only the rows the new picture has.
  s.animations = Object.fromEntries(Object.entries(s.animations).filter(([, a]) => (a.row + 1) * s.frameHeight <= image.height));
  if (!s.animations.idle) s.animations.idle = { row: 0, frames: Math.max(1, Math.floor(image.width / s.frameWidth)), frameMs: 300 };
  dropped.set(name, likeName);
  library.set(name, s);
  remeasure(s);
  select(name);
}

function dropFailed(err: Error) {
  $('drop').querySelector('p')!.prepend(el('b', `${err.message}. `, 'changed'));
}

function setupDrop() {
  const drop = $('drop');
  window.addEventListener('dragover', (e) => {
    e.preventDefault();
    drop.classList.add('over');
  });
  window.addEventListener('dragleave', (e) => {
    if (!e.relatedTarget) drop.classList.remove('over');
  });
  window.addEventListener('drop', (e) => {
    e.preventDefault();
    drop.classList.remove('over');
    for (const f of e.dataTransfer?.files ?? []) addFile(f).catch(dropFailed);
  });
  $<HTMLInputElement>('file').onchange = (e) => {
    for (const f of (e.target as HTMLInputElement).files ?? []) addFile(f).catch(dropFailed);
  };
}

// ------------------------------------------------------------ the how-to

function showMe(to: ShowMe) {
  if (to.sheet && library.has(to.sheet)) state.sheet = to.sheet;
  if (to.tab) state.tab = to.tab;
  const sheet = library.get(state.sheet);
  state.anim = to.anim && sheet?.animations[to.anim] ? to.anim : sheet?.animations[state.anim] ? state.anim : 'idle';
  state.view = to.view ?? 'single';
  save();
  renderAll();
}

setupDrop();
load().then(() => {
  requestAnimationFrame(tick);
  setupHowTo(
    {
      library: () => library,
      manifest: () => manifest,
      tile: (label, draw, scale = 2) =>
        tile(label, (c) => {
          const ctx = c.getContext('2d')!;
          ctx.imageSmoothingEnabled = false;
          paintBackground(ctx, c.width, c.height, 8);
          smallCtx.clearRect(0, 0, BOX, BOX);
          draw(smallCtx, time);
          ctx.drawImage(small, 0, 0, c.width, c.height);
        }, undefined, false, scale),
      drawPet: (ctx, sheet, anim, t, face, hat) => void drawPet(ctx, sheet, anim, t, face, hat),
      checks: (sheet) => checkSheet(withAllRows(sheet), 'pet'),
      overlays: OVERLAYS,
      showMe,
    },
    $('help'),
  );
});
