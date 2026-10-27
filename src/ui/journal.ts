// The travel journal (Collection > Travel journal, then a place): a little
// book with a page for each place, in tabs along the top.
//
//   [market] [woods ♥] [caves] [?]
//   ┌ Mossy Woods  Regular · 7 trips ────── (pet) ┐
//   8 more trips to become a Local [=====-----]
//   ♥ Pip's favourite place
//   Stamps        [Stroll] [Hike] [Adventure] [Night trip]
//   Found here    everything the place can give, found ones in colour
//   Snapshots     little moments snapped on trips here (see snapshots.ts)
//   Postcards     the pets' postcards, newest first, two to a row
//
// The same postcard, bigger, comes up after a backpack is opened (see
// postcardArt). The rules are in src/game/journeys.ts.

import { STRINGS } from '../strings';
import { CONFIG } from '../game/config';
import { getCharacter, sheetFor } from '../game/growth';
import { PLACES, placeFinds, placeLevel, type Place } from '../game/journeys';
import type { GameState, Pet, Postcard } from '../game/state';
import { HEART_ICONS, ITEM_ICONS } from './icons';
import { placeMoments } from '../game/snapshots';

export interface JournalCallbacks {
  characterImage: (sheet: string) => string | undefined;
  onPlace: (place: string) => void; // another tab
}

const J = CONFIG.journeys;
const STAMPS = ['common', 'rare', 'epic', 'night'] as const;

function el<K extends keyof HTMLElementTagNameMap>(tag: K, className: string, text?: string): HTMLElementTagNameMap[K] {
  const e = document.createElement(tag);
  e.className = className;
  if (text !== undefined) e.textContent = text;
  return e;
}

function icon(svg: string, className: string): HTMLElement {
  const e = el('span', className);
  e.innerHTML = svg;
  e.setAttribute('aria-hidden', 'true');
  return e;
}

const placeName = (id: string) => STRINGS.journeys.places[id] ?? id;
const placeIcon = (id: string) => ITEM_ICONS[`place_${id}`] ?? ITEM_ICONS.journey;
const foodName = (id: string) => STRINGS.foods[id as keyof typeof STRINGS.foods] ?? id;

// What a find in "Found here" is called and looks like ("seed:carrot" is a seed).
function findLook(entry: string): { svg: string; name: string } {
  if (entry.startsWith('seed:')) {
    const crop = entry.slice(5);
    return { svg: ITEM_ICONS[`seed_${crop}`] ?? ITEM_ICONS.unknown, name: STRINGS.journeys.seedName(foodName(crop)) };
  }
  return { svg: ITEM_ICONS[entry] ?? ITEM_ICONS.unknown, name: foodName(entry) };
}

// The line on a postcard. Older postcards, from before stories, say the
// pet had a lovely time.
export function storyLine(p: Postcard, place: string): string {
  const T = STRINGS.journeys;
  const say = p.story ? T.stories[p.story.id] : undefined;
  if (!p.story || !say) return T.storyFallback(p.name, placeName(place));
  const kind = getCharacter(p.story.character ?? null)?.name ?? '';
  return say(p.name, placeName(place), { food: foodName(p.story.food ?? ''), friend: p.story.friend ?? '', kind });
}

// The picture on a postcard: the place's sky and ground, its icon, the pet
// in the middle and what the story is about in the corner.
function postcardPic(p: Postcard, place: string, image: string | undefined, big: boolean): HTMLElement {
  const pic = el('div', 'jr-pic');
  pic.dataset.place = place;
  if (big) pic.append(icon(placeIcon(place), 'jr-pic-place'));
  if (image) {
    const pet = el('span', 'jr-pic-pet');
    pet.style.backgroundImage = `url('${image}')`;
    pic.append(pet);
  }
  const thing = p.story?.food ?? null;
  if (thing && ITEM_ICONS[thing]) pic.append(icon(ITEM_ICONS[thing], 'jr-pic-thing'));
  return pic;
}

const when = (at: number) => {
  const d = new Date(at);
  return d.toLocaleDateString(undefined, { day: 'numeric', month: 'short' });
};

// One postcard in the journal: the picture, the story and who sent it.
// Night trips have a night sky, a 3-star find a gold frame, and a place
// you're a Regular at (or more) a ribbon.
export function postcardCard(p: Postcard, place: string, level: number, image: string | undefined): HTMLElement {
  const card = el('div', 'jr-card');
  card.classList.toggle('is-night', !!p.night);
  card.classList.toggle('is-gold', !!p.star3);
  card.dataset.level = String(level);
  card.append(postcardPic(p, place, image, false), el('p', '', storyLine(p, place)),
    el('small', '', p.star3 ? STRINGS.journeys.postcardStar(p.name, when(p.at)) : STRINGS.journeys.postcardBy(p.name, when(p.at))));
  return card;
}

// The big postcard for the card that comes up after a backpack is opened,
// with what's new under it: a like it showed, a friend, a level.
export function postcardArt(
  p: Postcard, place: string, image: string | undefined, news: { like?: string; friend?: string; level?: number },
): string {
  const T = STRINGS.journeys;
  const wrap = el('div', 'jr-reveal');
  const card = el('div', 'jr-card is-big');
  card.classList.toggle('is-night', !!p.night);
  card.classList.toggle('is-gold', !!p.star3);
  const trip = p.night ? T.night : T.trips[p.rarity ?? 'common'];
  card.append(postcardPic(p, place, image, true), el('p', '', storyLine(p, place)),
    el('small', '', [placeName(place), trip].join(' · ')));
  wrap.append(card);
  if (news.like) {
    const chip = el('span', 'jr-new');
    chip.append(icon(HEART_ICONS.full, 'jr-new-icon'), news.like);
    wrap.append(chip);
  }
  if (news.friend) wrap.append(el('span', 'jr-new is-friend', T.newFriend(news.friend)));
  if (news.level) {
    const box = el('div', 'jr-levelup');
    box.append(el('b', '', T.levelUp(placeName(place), T.levels[news.level])), el('span', '', T.levelPerk(news.level)));
    wrap.append(box);
  }
  return wrap.outerHTML;
}

// The tabs along the top: a place you've been to, with a heart if it's a
// pet's favourite; '?' for one you haven't.
function tabs(state: GameState, showing: string, cb: JournalCallbacks): HTMLElement {
  const row = el('div', 'jr-tabs');
  const pets: Pet[] = [state.pet, ...state.housemates];
  for (const p of PLACES) {
    const visited = (state.journeys.journal[p.id]?.trips ?? 0) > 0;
    const b = el('button', `jr-tab${p.id === showing ? ' is-on' : ''}${visited ? '' : ' is-new'}`);
    b.append(icon(visited ? placeIcon(p.id) : ITEM_ICONS.unknown, 'jr-tab-icon'));
    b.setAttribute('aria-label', visited ? placeName(p.id) : STRINGS.collection.unknown);
    b.setAttribute('aria-pressed', String(p.id === showing));
    if (pets.some((pet) => pet.favouritePlace === p.id)) b.append(icon(HEART_ICONS.full, 'jr-tab-heart'));
    if (visited) b.addEventListener('click', () => cb.onPlace(p.id));
    else b.disabled = true;
    row.append(b);
  }
  return row;
}

// A place's page.
export function journalPage(state: GameState, placeId: string, cb: JournalCallbacks): HTMLElement[] {
  const T = STRINGS.journeys;
  const place = PLACES.find((p) => p.id === placeId) as Place | undefined;
  if (!place) return [];
  const page = state.journeys.journal[place.id] ?? { trips: 0, postcards: [], found: [] };
  const level = placeLevel(page.trips);
  const pets: Pet[] = [state.pet, ...state.housemates];
  const book = el('div', 'jr-book');

  // The picture at the top, with a pet that loves it (or the one you're
  // looking after) standing there.
  const hero = el('div', 'jr-hero');
  hero.dataset.place = place.id;
  hero.append(icon(placeIcon(place.id), 'jr-hero-place'), el('b', 'jr-hero-name', placeName(place.id)));
  if (level > 0) hero.append(el('span', 'jr-hero-level', T.levelLine(T.levels[level], T.tripCount(page.trips))));
  const fans = pets.filter((p) => p.favouritePlace === place.id);
  const shown = fans[0] ?? state.pet;
  const url = cb.characterImage(sheetFor(shown));
  if (url) {
    const pet = el('span', 'jr-hero-pet');
    pet.style.backgroundImage = `url('${url}')`;
    hero.append(pet);
  }
  book.append(tabs(state, place.id, cb), hero);

  // How far to the next level.
  const next = J.levels[level];
  const prog = el('div', 'jr-prog');
  if (next !== undefined) {
    const from = J.levels[level - 1] ?? 0;
    prog.append(el('span', '', T.toNext(next - page.trips, T.levels[level + 1])));
    const bar = el('span', 'jr-bar');
    const fill = el('i', '');
    fill.style.width = `${Math.round(((page.trips - from) / (next - from)) * 100)}%`;
    bar.append(fill);
    prog.append(bar);
  } else prog.append(el('span', '', T.topLevel));
  book.append(prog);
  if (fans.length) {
    const loved = el('p', 'jr-loved');
    loved.append(icon(HEART_ICONS.full, 'jr-loved-icon'), T.loved(STRINGS.list(fans.map((p) => p.name))));
    book.append(loved);
  }

  // Stamps: one for each kind of trip finished here.
  const stamps = el('div', 'jr-stamps');
  const got = page.stamps ?? (page.best ? ['common', 'rare', 'epic'].slice(0, ['common', 'rare', 'epic'].indexOf(page.best) + 1) : []);
  for (const id of STAMPS) {
    const stamp = el('span', `jr-stamp${got.includes(id) ? '' : ' is-none'}`, T.stampNames[id]);
    stamp.dataset.kind = id;
    stamps.append(stamp);
  }
  book.append(head(T.stamps, got.filter((g) => (STAMPS as readonly string[]).includes(g)).length, STAMPS.length), stamps);

  // Found here: everything the place can give.
  const all = placeFinds(place);
  const finds = el('div', 'jr-finds');
  for (const entry of all) {
    const found = page.found.includes(entry);
    const look = findLook(entry);
    const tile = el('span', `jr-find${found ? '' : ' is-none'}${place.finds[3].includes(entry as never) ? ' is-star3' : ''}`);
    tile.append(icon(found ? look.svg : ITEM_ICONS.unknown, 'jr-find-icon'));
    tile.title = found ? look.name : STRINGS.collection.unknown;
    finds.append(tile);
  }
  book.append(head(T.foundHere, all.filter((e) => page.found.includes(e)).length, all.length), finds);

  // Snapshots: the place's set, the ones snapped with their picture.
  const moments = placeMoments(place.id);
  const snaps = page.snaps ?? [];
  const album = el('div', 'jr-snaps');
  for (const id of moments) {
    const snap = snaps.find((x) => x.moment === id);
    const frame = el('figure', `jr-snap${snap ? '' : ' is-none'}`);
    if (snap) {
      const img = el('img', '');
      img.src = snap.image;
      img.alt = T.moments[id] ?? id;
      frame.append(img, el('figcaption', '', T.moments[id] ?? id));
    } else frame.append(el('span', 'jr-snap-none', '?'), el('figcaption', '', STRINGS.collection.unknown));
    album.append(frame);
  }
  book.append(head(T.snapshots, moments.filter((id) => snaps.some((x) => x.moment === id)).length, moments.length));
  if (!snaps.length) book.append(el('p', 'jr-empty', T.noSnapshots));
  book.append(album);

  // Postcards, newest first.
  book.append(head(T.postcards, page.postcards.length));
  if (!page.postcards.length) book.append(el('p', 'jr-empty', T.noPostcards));
  else {
    const cards = el('div', 'jr-cards');
    for (const p of page.postcards) cards.append(postcardCard(p, place.id, level, p.look ? cb.characterImage(p.look) : undefined));
    book.append(cards);
  }
  return [book];
}

// "Stamps        2 of 4"
function head(title: string, n: number, of?: number): HTMLElement {
  const h = el('h4', 'jr-head', title);
  h.append(el('small', '', of === undefined ? String(n) : STRINGS.journeys.nOf(n, of)));
  return h;
}
