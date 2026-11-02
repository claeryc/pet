// The banner at the top of a journal page: a little pixel scene of the
// place, its name, and a path along the bottom with a stop for each level
// (Visitor, Regular, Local, Legend), the pet standing where you've got to.
// Under it, how many trips to the next level.

import { STRINGS } from '../strings';
import { CONFIG } from '../game/config';

const J = CONFIG.journeys;

function el<K extends keyof HTMLElementTagNameMap>(tag: K, className: string, text?: string): HTMLElementTagNameMap[K] {
  const e = document.createElement(tag);
  e.className = className;
  if (text !== undefined) e.textContent = text;
  return e;
}

// --- Scenery: a little pixel landscape for each place ----------------------

const W = 120;
const H = 44;

class Px {
  out = '';
  rect(x: number, y: number, w: number, h: number, c: string): void {
    this.out += `<rect x="${x}" y="${y}" width="${w}" height="${h}" fill="${c}"/>`;
  }
  dot(x: number, y: number, c: string): void {
    this.rect(x, y, 1, 1, c);
  }
  // A pine tree, its tip at (x, top), standing on `base`.
  pine(x: number, top: number, base: number, c: string, trunk: string): void {
    const h = base - top - 2;
    for (let i = 0; i < h; i++) {
      const half = Math.floor(((i % Math.ceil(h / 3)) + Math.floor(i / Math.ceil(h / 3)) * 1.5) / 1.3);
      this.rect(x - half, top + i, half * 2 + 1, 1, c);
    }
    this.rect(x, base - 2, 1, 2, trunk);
  }
  // A rounded hill: a half ellipse of rows.
  hill(cx: number, base: number, rx: number, ry: number, c: string): void {
    for (let y = 0; y < ry; y++) {
      const half = Math.round(rx * Math.sqrt(1 - ((ry - y) / ry) ** 2));
      this.rect(cx - half, base - ry + y, half * 2, 1, c);
    }
    this.rect(cx - rx, base, rx * 2, H - base, c);
  }
  svg(): string {
    return `<svg viewBox="0 0 ${W} ${H}" preserveAspectRatio="xMidYMax slice" shape-rendering="crispEdges" aria-hidden="true">${this.out}</svg>`;
  }
}

const SCENES: Record<string, (p: Px) => void> = {
  market: (p) => {
    p.rect(0, 0, W, H, '#ecdcfb');
    p.rect(0, 0, W, 6, '#e2cff8');
    // Bunting across the top.
    const flags = ['#f48fb1', '#ffe596', '#8fd0a6', '#9ad3f0'];
    for (let x = 0; x < W; x += 6) {
      p.rect(x, 3, 6, 1, '#5b3f6e');
      const c = flags[(x / 6) % flags.length]!;
      p.rect(x + 1, 4, 4, 1, c);
      p.rect(x + 2, 5, 2, 1, c);
    }
    // Three stalls with striped awnings.
    for (const [x, c] of [[6, '#f48fb1'], [44, '#9ad3f0'], [86, '#8fd0a6']] as [number, string][]) {
      p.rect(x, 18, 26, 14, '#fff7ec');
      for (let i = 0; i < 26; i += 4) p.rect(x + i, 14, 2, 5, c);
      for (let i = 2; i < 26; i += 4) p.rect(x + i, 14, 2, 5, '#ffffff');
      p.rect(x - 1, 19, 28, 1, '#5b3f6e');
      p.rect(x + 1, 20, 1, 12, '#8a5a44');
      p.rect(x + 24, 20, 1, 12, '#8a5a44');
      p.rect(x + 3, 26, 20, 3, '#f6c9a8');
      for (let i = 4; i < 22; i += 3) p.rect(x + i, 25, 2, 1, i % 2 ? '#e05a7a' : '#ffe596');
    }
    p.rect(0, 32, W, H - 32, '#f6c9a8');
    for (let x = 1; x < W; x += 5) p.rect(x, 35 + (x % 3), 2, 1, '#e8b48e');
    for (let x = 3; x < W; x += 7) p.rect(x, 40 - (x % 2), 2, 1, '#e8b48e');
  },
  woods: (p) => {
    p.rect(0, 0, W, H, '#cdeedb');
    p.rect(104, 5, 6, 6, '#fff3b8');
    // Back trees, then front trees.
    for (let x = 2; x < W; x += 9) p.pine(x, 10 + (x % 4), 34, '#9fd8b4', '#9fd8b4');
    p.rect(0, 32, W, H - 32, '#8fd0a6');
    for (let x = 6; x < W; x += 15) p.pine(x, 14 + (x % 5), 38, '#4a9a76', '#5c3a2e');
    p.rect(0, 38, W, H - 38, '#7cc496');
    for (let x = 2; x < W; x += 6) p.rect(x, 37, 1, 1, '#5fae80');
    // A couple of mushrooms.
    for (const x of [44, 92]) {
      p.rect(x, 38, 4, 2, '#e05a7a');
      p.dot(x + 1, 38, '#ffffff');
      p.rect(x + 1, 40, 2, 2, '#fff7ec');
    }
  },
  cove: (p) => {
    p.rect(0, 0, W, H, '#d6f2fb');
    // The sun on the water.
    p.hill(92, 22, 8, 7, '#ffe596');
    p.rect(0, 22, W, 10, '#7cc6e8');
    for (let x = 0; x < W; x += 8) p.rect(x + (x % 3), 24 + (x % 4) * 2, 4, 1, '#c9ecf7');
    p.rect(84, 23, 16, 1, '#fff3b8');
    p.rect(87, 25, 10, 1, '#fff3b8');
    // A little boat.
    p.rect(20, 19, 1, 6, '#5c3a2e');
    p.rect(21, 19, 5, 1, '#ffffff');
    p.rect(21, 20, 4, 1, '#ffffff');
    p.rect(21, 21, 3, 1, '#ffffff');
    p.rect(16, 25, 12, 2, '#8a5a44');
    // Surf, then sand with shells.
    p.rect(0, 32, W, 2, '#ffffff');
    p.rect(0, 34, W, H - 34, '#ffe9b3');
    for (let x = 4; x < W; x += 11) p.rect(x, 38 + (x % 3), 2, 1, '#f2c98a');
    for (const x of [40, 66, 108]) {
      p.rect(x, 39, 3, 2, '#f48fb1');
      p.dot(x + 1, 38, '#f48fb1');
    }
  },
  hill: (p) => {
    p.rect(0, 0, W, H, '#4b4380');
    p.rect(0, 14, W, 14, '#5c5296');
    for (let i = 0; i < 26; i++) p.dot((i * 37) % W, (i * 13) % 22, i % 3 ? '#ffffff' : '#ffe596');
    // The moon.
    for (const [y, x, w] of [[4, 87, 4], [5, 85, 7], [6, 84, 5], [7, 84, 4], [8, 84, 4], [9, 84, 5], [10, 85, 7], [11, 87, 4]] as [number, number, number][]) p.rect(x, y, w, 1, '#fff3b8');
    p.hill(28, 30, 34, 12, '#8f80c9');
    p.hill(86, 32, 40, 10, '#b5a4e4');
    p.rect(0, 34, W, H - 34, '#b5a4e4');
    for (let x = 3; x < W; x += 8) p.rect(x, 37 + (x % 3), 1, 1, '#d6c8f2');
  },
};

export function scenery(place: string): string {
  const p = new Px();
  (SCENES[place] ?? SCENES.woods!)(p);
  return p.svg();
}

// --- The banner ------------------------------------------------------------

export interface BannerInfo {
  place: string;
  name: string;
  trips: number;
  level: number;
  pet?: string; // image url
}

const T = () => STRINGS.journeys;

function art(svg: string, className: string): HTMLElement {
  const e = el('span', className);
  e.innerHTML = svg;
  e.setAttribute('aria-hidden', 'true');
  return e;
}

function petAt(url: string | undefined, className: string): HTMLElement[] {
  if (!url) return [];
  const pet = el('span', className);
  pet.style.backgroundImage = `url('${url}')`;
  return [pet];
}

function nextLine(b: BannerInfo): string {
  const next = J.levels[b.level];
  return next === undefined ? T().topLevel : T().toNext(next - b.trips, T().levels[b.level + 1]!);
}

// The scene with a path along the bottom: a stop for each level, and the
// pet walking it.
function path(b: BannerInfo): HTMLElement {
  const box = el('div', 'jb jb-path');
  box.dataset.place = b.place;
  box.append(art(scenery(b.place), 'jb-land'));
  const name = el('b', 'jb-title', b.name);
  box.append(name);
  const track = el('div', 'jb-track');
  const levels = J.levels;
  // Where along the path: evenly between the flags.
  const i = b.level; // flags passed
  const from = levels[i - 1] ?? 0;
  const to = levels[i];
  const part = to === undefined ? 0 : (b.trips - from) / (to - from);
  const at = to === undefined ? 1 : (Math.max(0, i - 1) + (i === 0 ? 0 : part)) / (levels.length - 1);
  const line = el('span', 'jb-track-line');
  const done = el('i', '');
  done.style.width = `${at * 100}%`;
  line.append(done);
  track.append(line);
  levels.forEach((n, k) => {
    const flag = el('span', `jb-flag${b.trips >= n ? ' is-on' : ''}`);
    flag.style.left = `${(k / (levels.length - 1)) * 100}%`;
    flag.append(el('i', ''), el('small', '', T().levels[k + 1]));
    track.append(flag);
  });
  const walker = petAt(b.pet, 'jb-walker')[0];
  if (walker) {
    walker.style.left = `${at * 100}%`;
    track.append(walker);
  }
  box.append(track);
  return box;
}

export function banner(b: BannerInfo): HTMLElement[] {
  return [path(b), el('p', 'jb-under', nextLine(b))];
}
