// The "How it works" card: a few pages about one part of the game, each with
// a picture of the real screen (cut down to the bits that matter, the rest
// dimmed, the thing to tap ringed in pink) and a line or two of text. It
// floats over the whole screen like the naming box. Shown the first time
// the player gets to that part of the game (see src/game/guides.ts), and
// again from Menu > Guide.

import { STRINGS, type GuideText } from '../strings';
import type { GuideId } from '../game/guides';
import { GUIDE_PICTURES, type GuidePicture, type Rect } from './guidePages';
import { ACHIEVEMENT_ICONS, ITEM_ICONS, MENU_ICONS, STAT_ICONS, TAP_ICON } from './icons';

// The strip of the screen the pictures show, in screen pixels (see
// guidePages.ts).
const X0 = 8;
const WIDTH = 374;

// The little picture next to each guide's name.
export const GUIDE_ICONS: Record<GuideId, string> = {
  basics: STAT_ICONS.happiness,
  shop: MENU_ICONS.shop,
  garden: ITEM_ICONS.garden,
  fishing: ITEM_ICONS.fishing,
  cooking: ITEM_ICONS.cooking,
  delivery: ITEM_ICONS.parcel,
  craving: ACHIEVEMENT_ICONS.cravings,
  journeys: ITEM_ICONS.journey,
  meet: ITEM_ICONS.meet,
  family: MENU_ICONS.familyTree,
  skills: MENU_ICONS.skills,
  sick: STAT_ICONS.health,
  collection: MENU_ICONS.collection,
};

export const say = (text: GuideText, pet: string) => (typeof text === 'function' ? text(pet) : text);

export function guideName(id: GuideId, pet: string): string {
  return say(STRINGS.guide.guides[id].name, pet);
}

export function guidePageCount(id: GuideId): number {
  return STRINGS.guide.guides[id].pages.length;
}

// A rounded box as an SVG path, `pad` px bigger all round.
function roundRect(r: Rect, pad = 0): string {
  const [x, y, w, h] = [r[0] - pad, r[1] - pad, r[2] + 2 * pad, r[3] + 2 * pad];
  const k = Math.min(12, h / 2);
  return `M${x + k},${y}h${w - 2 * k}a${k},${k} 0 0 1 ${k},${k}v${h - 2 * k}a${k},${k} 0 0 1 ${-k},${k}` +
    `h${-(w - 2 * k)}a${k},${k} 0 0 1 ${-k},${-k}v${-(h - 2 * k)}a${k},${k} 0 0 1 ${k},${-k}z`;
}

// The picture: the strips of the screen stacked in a frame that's the same
// height on every page, each strip dimmed but for its rings.
function picture(id: GuideId, page: number, pic: GuidePicture): HTMLElement {
  const frame = document.createElement('div');
  frame.className = 'guide-pic';
  frame.setAttribute('aria-hidden', 'true');
  const image = `url('${import.meta.env.BASE_URL}guides/${id}-${page + 1}.webp')`;
  const total = pic.segs.reduce((sum, [y0, y1]) => sum + y1 - y0, 0);
  let above = 0;
  for (const [y0, y1] of pic.segs) {
    const height = y1 - y0;
    const strip = document.createElement('div');
    strip.className = 'guide-strip';
    strip.style.aspectRatio = `${WIDTH} / ${height}`;
    strip.style.backgroundImage = image;
    // The strips are saved one under the other in the same image.
    strip.style.backgroundPositionY = total === height ? '0' : `${(above / (total - height)) * 100}%`;
    above += height;
    const holes = pic.holes.filter((r) => r[1] < y1 && r[1] + r[3] > y0);
    strip.innerHTML =
      `<svg viewBox="${X0} ${y0} ${WIDTH} ${height}" preserveAspectRatio="none">` +
      `<path class="guide-dim" fill-rule="evenodd" d="M${X0},${y0}h${WIDTH}v${height}h${-WIDTH}z ${holes.map((r) => roundRect(r)).join(' ')}"/>` +
      holes.map((r) => `<path class="guide-ring" d="${roundRect(r, 1.5)}"/>`).join('') +
      `</svg>`;
    const finger = pic.tap ?? pic.hold;
    if (finger && finger[1] >= y0 && finger[1] <= y1) {
      const hand = document.createElement('span');
      hand.className = 'guide-hand';
      hand.innerHTML = TAP_ICON;
      if (pic.hold) {
        const hold = document.createElement('b');
        hold.textContent = STRINGS.guide.hold;
        hand.append(hold);
      }
      hand.style.left = `${((finger[0] - X0) / WIDTH) * 100}%`;
      hand.style.top = `${((finger[1] - y0) / height) * 100}%`;
      strip.append(hand);
    }
    frame.append(strip);
  }
  return frame;
}

export interface GuideCard {
  // The first time: "How it works", with Skip and a reminder of Menu > Guide.
  // Waits for a card that's showing to be closed first.
  show: (id: GuideId, pet: string) => void;
  // From Menu > Guide.
  replay: (id: GuideId, pet: string) => void;
  isOpen: () => boolean;
}

export function createGuideCard(root: HTMLElement): GuideCard {
  const backdrop = document.createElement('div');
  backdrop.className = 'name-backdrop guide-backdrop';
  backdrop.hidden = true;
  const box = document.createElement('div');
  box.className = 'name-box guide-box';
  box.setAttribute('role', 'dialog');
  box.setAttribute('aria-modal', 'true');
  box.setAttribute('aria-labelledby', 'guide-title');
  box.tabIndex = -1; // focused when it opens, so the keyboard starts on the card
  backdrop.append(box);
  root.append(backdrop);

  let current: { id: GuideId; pet: string; replay: boolean; page: number } | null = null;
  const waiting: { id: GuideId; pet: string }[] = [];

  function close(): void {
    current = null;
    backdrop.hidden = true;
    const next = waiting.shift();
    if (next) open(next.id, next.pet, false);
  }

  function draw(): void {
    if (!current) return;
    const { id, pet, replay, page } = current;
    const G = STRINGS.guide;
    const pages = G.guides[id].pages;
    const last = page === pages.length - 1;
    const head = document.createElement('div');
    head.className = 'guide-head';
    const icon = document.createElement('span');
    icon.className = 'guide-head-icon';
    icon.innerHTML = GUIDE_ICONS[id];
    const label = document.createElement('span');
    label.textContent = `${replay ? G.title : G.howItWorks} · ${guideName(id, pet)}`;
    head.append(icon, label);
    const title = document.createElement('h2');
    title.id = 'guide-title';
    title.textContent = say(pages[page].title, pet);
    const text = document.createElement('p');
    text.className = 'guide-text';
    text.textContent = say(pages[page].text, pet);
    const dots = document.createElement('div');
    dots.className = 'guide-dots';
    dots.setAttribute('aria-hidden', 'true');
    if (pages.length === 1) dots.style.visibility = 'hidden';
    pages.forEach((_, n) => {
      const dot = document.createElement('i');
      if (n === page) dot.className = 'on';
      dots.append(dot);
    });
    const buttons = document.createElement('div');
    buttons.className = 'guide-buttons';
    const go = (to: number) => () => {
      current!.page = to;
      draw();
    };
    const left = document.createElement('button');
    left.className = 'guide-btn soft';
    left.textContent = page > 0 ? G.back : replay ? G.close : G.skip;
    left.addEventListener('click', page > 0 ? go(page - 1) : close);
    const right = document.createElement('button');
    right.className = 'guide-btn';
    right.textContent = !last ? G.next : replay ? G.done : G.gotIt;
    right.addEventListener('click', last ? close : go(page + 1));
    if (pages.length === 1) buttons.append(right);
    else buttons.append(left, right);
    box.replaceChildren(head, picture(id, page, GUIDE_PICTURES[id][page]), title, text, dots, buttons);
    if (!replay) {
      // On every page (hidden until the last), so the card keeps its height.
      const foot = document.createElement('p');
      foot.className = 'guide-foot';
      foot.innerHTML = MENU_ICONS.guide;
      foot.append(G.readAgain);
      foot.style.visibility = last ? '' : 'hidden';
      box.append(foot);
    }
  }

  function open(id: GuideId, pet: string, replay: boolean): void {
    current = { id, pet, replay, page: 0 };
    backdrop.hidden = false;
    draw();
    box.focus();
  }

  backdrop.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && current) close();
  });

  return {
    show(id, pet) {
      if (current?.id === id || waiting.some((w) => w.id === id)) return;
      if (current) waiting.push({ id, pet });
      else open(id, pet, false);
    },
    replay: (id, pet) => open(id, pet, true),
    isOpen: () => current !== null,
  };
}
