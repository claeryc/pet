// The round bubbles over places on the plain maps (the island, the
// Backyard): smooth vector shapes on purpose, so they read as game UI
// floating over the pixel art and are never mistaken for part of it.
// Each holds a little vector icon for what's waiting there.

import type { Badge } from '../game/map';

export type BubbleIcon = Badge | 'star';

const ICONS: Record<BubbleIcon, string> = {
  project: `<path d="M17 13h6v25a3 3 0 0 1-6 0z" transform="rotate(35 20 25)" fill="#b9784f" stroke="#5c3a2e" stroke-width="2"/><path d="M7 9l13-6 9 3 4 7-6 2-3-3-12 7z" fill="#8f93a8" stroke="#3d3a52" stroke-width="2" stroke-linejoin="round"/><path d="M10 9l10-4.5 7 2" fill="none" stroke="#d9dbe6" stroke-width="2" stroke-linecap="round"/>`,
  honey: `<rect x="10" y="5" width="20" height="6" rx="2" fill="#c26d48" stroke="#5c3a2e" stroke-width="2"/><path d="M9 13h22c3 0 4 3 4 6v11c0 4-3 7-7 7H12c-4 0-7-3-7-7V19c0-3 1-6 4-6z" fill="#f6b23c" stroke="#8a4f1e" stroke-width="2"/><rect x="11" y="19" width="18" height="10" rx="3" fill="#fff4d6" stroke="#c98a3a" stroke-width="1.5"/><path d="M15 24h10" stroke="#e09a2a" stroke-width="2.5" stroke-linecap="round"/><ellipse cx="11" cy="17" rx="2" ry="3.5" fill="#fff" opacity=".6"/>`,
  crop: `<path d="M22 10c-2-4-1-7 1-8 1 3 2 5 1 8zM24 11c2-3 6-4 8-3-2 2-5 4-8 4zM21 11c-3-2-7-2-9 0 3 1 6 2 9 1z" fill="#5fbf6a" stroke="#2f7a46" stroke-width="1.5" stroke-linejoin="round"/><path d="M14 13c4-3 11-1 12 3 1 3-1 6-4 9L9 37c-2 1-3 0-2-2l5-17c0-2 1-4 2-5z" fill="#f58a3c" stroke="#a24a1c" stroke-width="2" stroke-linejoin="round"/><path d="M13 21l4 1M11 27l4 1M16 18h3" stroke="#c8611f" stroke-width="1.6" stroke-linecap="round"/>`,
  water: `<path d="M20 3C14 13 8 19 8 26a12 12 0 0 0 24 0c0-7-6-13-12-23z" fill="#4fa6ea" stroke="#245c9e" stroke-width="2.2" stroke-linejoin="round"/><path d="M14 25c0 4 2 6 5 7" stroke="#d7efff" stroke-width="3" stroke-linecap="round" fill="none"/>`,
  fish: `<path d="M27 20l10-8v16z" fill="#f2884a" stroke="#a24a1c" stroke-width="2" stroke-linejoin="round"/><ellipse cx="17" cy="20" rx="13" ry="9" fill="#f9a35c" stroke="#a24a1c" stroke-width="2"/><path d="M15 12c3 2 3 14 0 16" stroke="#e5763a" stroke-width="2" fill="none"/><circle cx="9.5" cy="18" r="2.2" fill="#2b2140"/><circle cx="9" cy="17.3" r=".7" fill="#fff"/>`,
  lock: `<path d="M13 18v-5a7 7 0 0 1 14 0v5" fill="none" stroke="#6f6a80" stroke-width="4"/><rect x="8" y="17" width="24" height="19" rx="4" fill="#a7a3b6" stroke="#4a4660" stroke-width="2"/><circle cx="20" cy="25" r="2.6" fill="#4a4660"/><rect x="19" y="26" width="2" height="5" rx="1" fill="#4a4660"/>`,
  star: `<path d="M20 3l5.2 10.6 11.7 1.7-8.5 8.2 2 11.6L20 29.6 9.6 35.1l2-11.6-8.5-8.2 11.7-1.7z" fill="#ffd34d" stroke="#b07a10" stroke-width="2.2" stroke-linejoin="round"/><path d="M14 17l4-1" stroke="#fff6c8" stroke-width="2.5" stroke-linecap="round"/>`,
  dig: `<path d="M27 4l5 5-9 9-5-5z" fill="#b9784f" stroke="#5c3a2e" stroke-width="2" stroke-linejoin="round"/><path d="M19 12l9 9-9 12c-3 3-9 3-12 0s-3-9 0-12z" fill="#a7adc4" stroke="#3d3a52" stroke-width="2" stroke-linejoin="round"/><path d="M11 23l5-5" stroke="#e6e8f2" stroke-width="2.5" stroke-linecap="round"/>`,
  visitor: `<path d="M20 35C9 27 4 21 4 14a8 8 0 0 1 16-2 8 8 0 0 1 16 2c0 7-5 13-16 21z" fill="#f2708f" stroke="#a2344f" stroke-width="2.2" stroke-linejoin="round"/><ellipse cx="12" cy="13" rx="3" ry="2" fill="#fff" opacity=".7" transform="rotate(-30 12 13)"/>`,
  mail: `<rect x="4" y="9" width="32" height="23" rx="3" fill="#fff7ec" stroke="#5b3f6e" stroke-width="2.2"/><path d="M5 11l15 12 15-12" fill="none" stroke="#5b3f6e" stroke-width="2.2" stroke-linejoin="round"/><circle cx="31" cy="12" r="5" fill="#e05a7a" stroke="#fff" stroke-width="1.5"/>`,
  backpack: `<path d="M13 9a7 7 0 0 1 14 0" fill="none" stroke="#5c3a2e" stroke-width="3"/><rect x="7" y="9" width="26" height="27" rx="7" fill="#e3874f" stroke="#8a3f1e" stroke-width="2.2"/><rect x="12" y="21" width="16" height="10" rx="3" fill="#f6a96f" stroke="#8a3f1e" stroke-width="2"/><path d="M12 16h16" stroke="#8a3f1e" stroke-width="2"/>`,
  epic: `<path d="M20 3l5.2 10.6 11.7 1.7-8.5 8.2 2 11.6L20 29.6 9.6 35.1l2-11.6-8.5-8.2 11.7-1.7z" fill="#ffd34d" stroke="#b07a10" stroke-width="2.2" stroke-linejoin="round"/>`,
  night: `<path d="M26 5a14 14 0 1 0 9 22A12 12 0 0 1 26 5z" fill="#c9b6f0" stroke="#5b3f6e" stroke-width="2.2" stroke-linejoin="round"/>`,
  trip: `<path d="M10 4v32" stroke="#5c3a2e" stroke-width="3" stroke-linecap="round"/><path d="M11 5h20l-5 7 5 7H11z" fill="#7fd6b0" stroke="#2f7a5a" stroke-width="2" stroke-linejoin="round"/>`,
};

// Rim colours: white for news, blue for water, grey for a locked place,
// gold for a new place.
const RIMS = { white: ['#ffffff', '#efe8f6'], blue: ['#f2f9ff', '#d6eafb'], grey: ['#f3f1f5', '#d9d4df'], gold: ['#fffbe8', '#ffe9a6'] };
const rimFor = (icon: BubbleIcon): keyof typeof RIMS => (icon === 'water' || icon === 'fish' ? 'blue' : icon === 'lock' ? 'grey' : icon === 'star' ? 'gold' : 'white');

let ids = 0;
// The bubble's inside: the round shape with its tail, the icon, and a
// count when there's more than one.
export function bubbleHtml(icon: BubbleIcon, count = 0): string {
  const [a, b] = RIMS[rimFor(icon)];
  const id = `mb${++ids}`;
  return `<svg class="map-bubble-shape" viewBox="0 0 54 66" aria-hidden="true"><defs><radialGradient id="${id}" cx="40%" cy="32%" r="70%"><stop offset="0" stop-color="${a}"/><stop offset="1" stop-color="${b}"/></radialGradient></defs>`
    + `<path d="M27 3a24 24 0 0 1 9.5 46.1L27 62l-9.5-12.9A24 24 0 0 1 27 3z" fill="url(#${id})" stroke="#4a3566" stroke-width="3" stroke-linejoin="round"/>`
    + `<ellipse cx="19" cy="14" rx="7" ry="4" fill="#fff" opacity=".7" transform="rotate(-25 19 14)"/></svg>`
    + `<svg class="map-bubble-icon" viewBox="0 0 40 40" aria-hidden="true">${ICONS[icon]}</svg>`
    + (count > 1 ? `<span class="map-bubble-count">${count}</span>` : '');
}
