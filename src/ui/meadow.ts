// The Meadow page inside the gear menu (see src/game/meadow.ts):
//
//   [ the Meadow scene: up to four pets out, tap one to say hi ]
//   Everyone in the Meadow  5
//   (o) Bean   Pebblit (Amber)          [Say hi] [Goodbye card]
//   Keepsakes in the Main room
//   (o) Bean   Framed portrait · Seashell   [Hang] [On the shelf]
//
// Keepsakes go up in the room you're looking at; each room has its own
// frame and shelf.

import { STRINGS } from '../strings';
import { characterSheet, getCharacter, getVariant, sheetFor } from '../game/growth';
import { getMeadowPet, keepsakeKind, keepsakeOf, meadowOut, meadowVisitor, roomKeepsakes, saidHiToday } from '../game/meadow';
import { currentRoom, roomDecor } from '../game/rooms';
import type { GameState, Keepsake, MeadowPet } from '../game/state';
import { MEADOW_HEIGHT, MEADOW_SPOTS, MEADOW_WIDTH, SPOT_ORDER, drawMeadow, meadowPetAt, type MeadowPetView } from '../render/meadow';
import { THINGS, thingColour } from '../render/keepsakes';
import type { OtherPet } from '../render/canvas';
import { PALETTE } from '../render/palette';
import { UNKNOWN_ICON } from './icons';

export interface MeadowCallbacks {
  onSayHi: (id: string) => boolean; // true if it was the first hi today
  onGoodbyeCard: (id: string) => void;
  onHang: (id: string | null) => void; // null takes the portrait down
  onShelf: (id: string) => void; // puts it on the shelf, or takes it off
  characterImage: (sheet: string) => string | undefined;
  meadowLook: (m: MeadowPet) => OtherPet; // how a pet looks in the scene
  isNight: () => boolean;
}

// How long hearts float up after saying hi.
const HEARTS_MS = 2600;
const hearts = new Map<string, number>(); // pet id -> until (performance.now())

function el<K extends keyof HTMLElementTagNameMap>(tag: K, className: string, text?: string): HTMLElementTagNameMap[K] {
  const e = document.createElement(tag);
  e.className = className;
  if (text !== undefined) e.textContent = text;
  return e;
}

function portrait(url: string | undefined): HTMLElement {
  const pic = el('span', 'drawer-option-icon meadow-pic');
  pic.innerHTML = url ? `<span class="portrait" style="background-image:url('${url}')"></span>` : UNKNOWN_ICON;
  return pic;
}

const thingName = (k: Keepsake) => STRINGS.meadow.things[keepsakeKind(k)] ?? STRINGS.meadow.things.egg;

// A keepsake as a little picture, drawn from the same grid as on the shelf.
export function keepsakeIcon(k: Keepsake): string {
  const sprite = THINGS[keepsakeKind(k)] ?? THINGS.egg;
  const golden = k.tier === 'golden';
  let outline = '';
  let rects = '';
  sprite.forEach((row, y) => [...row].forEach((ch, x) => {
    const fill = thingColour(ch, golden);
    if (!fill) return;
    // With a dark outline, as on the shelf.
    for (const [ox, oy] of [[-1, 0], [1, 0], [0, -1], [0, 1]]) {
      outline += `<rect x="${x + 1 + ox}" y="${y + 1 + oy}" width="1" height="1" fill="${golden ? PALETTE.bark : PALETTE.ink}"/>`;
    }
    rects += `<rect x="${x + 1}" y="${y + 1}" width="1" height="1" fill="${fill}"/>`;
  }));
  rects = outline + rects;
  const w = sprite[0].length + 2;
  const h = sprite.length + 2;
  return `<svg viewBox="0 0 ${w} ${h}" shape-rendering="crispEdges" aria-hidden="true">${rects}</svg>`;
}

// The scene: a canvas that keeps drawing itself while it's on the page.
function scene(state: GameState, cb: MeadowCallbacks): HTMLElement {
  const wrap = el('div', 'meadow-scene');
  const canvas = el('canvas', 'meadow-canvas');
  canvas.width = MEADOW_WIDTH;
  canvas.height = MEADOW_HEIGHT;
  const out = meadowOut(state, state.lastUpdated);
  // Nobody out in the scene is the one visiting you right now.
  const visiting = meadowVisitor(state)?.pet.id;
  const shown = out.filter((m) => m.pet.id !== visiting);
  const views: MeadowPetView[] = shown.map((m, i) => {
    const spot = SPOT_ORDER[i];
    return { ...cb.meadowLook(m), animation: MEADOW_SPOTS[spot].animation, id: m.pet.id, spot, hearts: false };
  });
  canvas.setAttribute('role', 'img');
  canvas.setAttribute('aria-label', [STRINGS.meadow.title, ...shown.map((m) => m.pet.name)].join(', '));
  const ctx = canvas.getContext('2d')!;
  ctx.imageSmoothingEnabled = false;
  const draw = (timeMs: number) => {
    if (!canvas.isConnected && timeMs > 0) return;
    const now = performance.now();
    for (const v of views) v.hearts = (hearts.get(v.id) ?? 0) > now;
    drawMeadow(ctx, views, cb.isNight(), timeMs);
    requestAnimationFrame(draw);
  };
  draw(0);
  canvas.addEventListener('click', (e) => {
    const r = canvas.getBoundingClientRect();
    const id = meadowPetAt(views, ((e.clientX - r.left) / r.width) * MEADOW_WIDTH, ((e.clientY - r.top) / r.height) * MEADOW_HEIGHT);
    if (id) sayHi(id, cb);
  });
  wrap.append(canvas);
  if (views.length > 0) wrap.append(el('small', 'meadow-hint', STRINGS.meadow.tapHint));
  return wrap;
}

function sayHi(id: string, cb: MeadowCallbacks): void {
  if (cb.onSayHi(id)) hearts.set(id, performance.now() + HEARTS_MS);
}

// "Pebblit (Amber)", or its stage before it grew up.
function whatItIs(m: MeadowPet): string {
  const c = getCharacter(m.pet.character);
  if (!c) return STRINGS.family.stages[m.pet.stage];
  return STRINGS.characterName(c.name, getVariant(c, m.pet.variant)?.name);
}

const shortDate = (t: number) => new Date(t).toLocaleDateString(undefined, { month: 'short', day: 'numeric' });

function petRow(m: MeadowPet, state: GameState, cb: MeadowCallbacks): HTMLElement {
  const row = el('div', 'shop-row meadow-row');
  const body = el('span', 'shop-row-text');
  const visiting = meadowVisitor(state)?.pet.id === m.pet.id;
  const hi = saidHiToday(m, state.lastUpdated);
  const status = visiting ? STRINGS.meadow.visitingNow : hi ? STRINGS.meadow.hiToday : STRINGS.meadow.since(shortDate(m.movedAt));
  body.append(el('b', '', m.pet.name), el('small', '', `${whatItIs(m)}  ·  ${status}`));
  const buttons = el('span', 'meadow-buttons');
  const hiBtn = el('button', `shop-btn${hi ? ' shop-btn-soft' : ''}`, STRINGS.meadow.sayHi);
  hiBtn.addEventListener('click', () => sayHi(m.pet.id, cb));
  const card = el('button', 'shop-btn shop-btn-soft', STRINGS.meadow.card);
  card.addEventListener('click', () => cb.onGoodbyeCard(m.pet.id));
  buttons.append(hiBtn, card);
  row.append(portrait(cb.characterImage(sheetFor(m.pet))), body, buttons);
  return row;
}

function keepsakeRow(k: Keepsake, state: GameState, cb: MeadowCallbacks): HTMLElement {
  const row = el('div', 'shop-row meadow-row');
  const here = roomKeepsakes(roomDecor(state));
  const body = el('span', 'shop-row-text');
  const parts = [STRINGS.meadow.portrait, ...(k.tier === 'portrait' ? [] : [STRINGS.meadow.thing(k.tier, thingName(k))])];
  body.append(el('b', '', k.name), el('small', '', parts.join('  ·  ')));
  const buttons = el('span', 'meadow-buttons');
  const hung = here.frame === k.id;
  const hang = el('button', `shop-btn${hung ? ' shop-btn-soft' : ''}`, hung ? STRINGS.meadow.takeDown : STRINGS.meadow.hang);
  hang.addEventListener('click', () => cb.onHang(hung ? null : k.id));
  buttons.append(hang);
  if (k.tier !== 'portrait') {
    const on = here.shelf.includes(k.id);
    const shelf = el('button', `shop-btn${on ? ' shop-btn-soft' : ''}`, on ? STRINGS.meadow.takeOff : STRINGS.meadow.onShelf);
    shelf.addEventListener('click', () => cb.onShelf(k.id));
    buttons.append(shelf);
  }
  const pic = k.tier === 'portrait'
    ? portrait(cb.characterImage(characterSheet(k.character, k.variant)))
    : el('span', 'drawer-option-icon meadow-pic');
  if (k.tier !== 'portrait') pic.innerHTML = keepsakeIcon(k);
  row.append(pic, body, buttons);
  return row;
}

export function meadowPage(state: GameState, cb: MeadowCallbacks): HTMLElement[] {
  const out: HTMLElement[] = [];
  if (state.meadow.length > 0) out.push(scene(state, cb));
  out.push(el('p', 'meadow-intro', STRINGS.meadow.intro));
  if (state.meadow.length > 0) {
    out.push(el('h3', 'shop-section', STRINGS.meadow.everyone(state.meadow.length)));
    out.push(...state.meadow.map((m) => petRow(m, state, cb)));
  }
  const room = STRINGS.familyHome.rooms[currentRoom(state)];
  out.push(el('h3', 'shop-section', STRINGS.meadow.keepsakes(room)));
  if (state.keepsakes.length === 0) out.push(el('p', 'mail-empty', STRINGS.meadow.keepsakesEmpty));
  out.push(...state.keepsakes.map((k) => keepsakeRow(k, state, cb)));
  return out;
}

// The goodbye card's picture: the pet, with the keepsake it left beside it
// (`withKeepsake`), or on its own when it drops by.
export function goodbyeArt(state: GameState, id: string, characterImage: (sheet: string) => string | undefined, withKeepsake = true): string {
  const k = keepsakeOf(state, id);
  const m = getMeadowPet(state, id);
  const sheet = m ? sheetFor(m.pet) : k ? characterSheet(k.character, k.variant) : '';
  const url = characterImage(sheet);
  const pet = url ? `<span class="portrait goodbye-portrait" style="background-image:url('${url}')"></span>` : '';
  const thing = withKeepsake && k && k.tier !== 'portrait' ? `<span class="goodbye-thing">${keepsakeIcon(k)}</span>` : '';
  return pet || thing ? `<span class="goodbye-art">${pet}${thing}</span>` : '';
}
