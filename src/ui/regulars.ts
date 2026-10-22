// Regulars in Messages > Friends (Percy for now): a row with their hearts,
// and a card listing what each heart brings. The rules are in
// src/game/regulars.ts.
//
//   [Percy]  Percy                          (tap for the card)
//            ♥♥♡♡♡
//            Postal pigeon · Next: Courier Cap at ♥♥♥

import { STRINGS } from '../strings';
import { getHat } from '../game/economy';
import { getRegular, rewards, type RegularId, type Reward } from '../game/regulars';
import type { GameState } from '../game/state';
import type { FoodId } from '../game/actions';
import { heartRow } from './meet';
import { ITEM_ICONS, STAT_ICONS, UNKNOWN_ICON } from './icons';

const T = STRINGS.regulars;

// What a reward is called: "Pumpkin seed", "Courier Cap" or, for the
// last heart, "Postmark wallpaper + Shorter rest".
export function rewardName(r: Reward): string {
  const parts: string[] = [];
  if (r.seed) parts.push(T.reward.seed(STRINGS.foods[r.seed as FoodId] ?? r.seed));
  if (r.hat) parts.push(T.reward.hat(getHat(r.hat)?.name ?? r.hat));
  if (r.wallpaper) parts.push(T.reward.wallpaper(STRINGS.shop.wallpapers[r.wallpaper] ?? r.wallpaper));
  if (r.payShare !== undefined) parts.push(T.reward.payShare);
  if (r.seedChance !== undefined) parts.push(T.reward.seedChance);
  if (r.restHours !== undefined) parts.push(T.reward.restHours);
  return parts.join(' + ');
}

// What it does, in a short line.
export function rewardNote(r: Reward): string {
  const parts: string[] = [];
  if (r.seed) parts.push(T.rewardNote.seed);
  if (r.hat) parts.push(T.rewardNote.hat);
  if (r.wallpaper) parts.push(T.rewardNote.wallpaper);
  if (r.payShare !== undefined) parts.push(T.rewardNote.payShare(r.payShare));
  if (r.seedChance !== undefined) parts.push(T.rewardNote.seedChance(r.seedChance));
  if (r.restHours !== undefined) parts.push(T.rewardNote.restHours(r.restHours));
  return parts.join('. ');
}

// Its picture: the seed, hat or wallpaper, or a gold coin, a seed or an
// hourglass for the better numbers.
export function rewardIcon(r: Reward, hatImage: (hat: string) => string | undefined): string {
  if (r.seed) return ITEM_ICONS[`seed_${r.seed}`] ?? '';
  if (r.hat) {
    const url = hatImage(r.hat);
    return url ? `<span class="hat-icon" style="background-image:url('${url}')"></span>` : '';
  }
  if (r.wallpaper) return ITEM_ICONS[`wallpaper_${r.wallpaper}`] ?? '';
  if (r.payShare !== undefined) return STAT_ICONS.gold;
  if (r.seedChance !== undefined) return ITEM_ICONS.seed_dragonFruit ?? '';
  return STAT_ICONS.hourglass;
}

function el<K extends keyof HTMLElementTagNameMap>(tag: K, className: string, text?: string): HTMLElementTagNameMap[K] {
  const e = document.createElement(tag);
  e.className = className;
  if (text !== undefined) e.textContent = text;
  return e;
}

const PORTRAITS: Record<RegularId, string> = { percy: ITEM_ICONS.percy };

// One regular in the Friends tab. The whole row opens the rewards card.
export function regularRow(state: GameState, id: RegularId, onOpen: () => void): HTMLElement {
  const r = getRegular(state, id);
  const row = el('button', 'shop-row friend-row regular-row');
  const pic = el('span', 'drawer-option-icon friend-pic');
  pic.innerHTML = PORTRAITS[id] ?? UNKNOWN_ICON;
  const body = el('span', 'shop-row-text');
  const next = rewards(id)[r.hearts];
  body.append(
    el('b', 'friend-name', T.names[id] ?? id),
    heartRow(r.score),
    el('small', '', `${T.what[id] ?? ''}  ·  ${next ? T.next(rewardName(next), r.hearts + 1) : T.allDone}`),
  );
  row.append(pic, body);
  row.addEventListener('click', onOpen);
  return row;
}

// The rewards card: each heart's reward, ticked once given. The next one
// is shown in full; the ones after it stay a mystery.
export function regularCard(
  state: GameState, id: RegularId, hatImage: (hat: string) => string | undefined,
): { art: string; title: string; text: string } {
  const r = getRegular(state, id);
  const rows = rewards(id).map((reward, i) => {
    const got = i < r.hearts;
    const known = i <= r.hearts;
    const hearts = `<span class="regular-reward-hearts">${'♥'.repeat(i + 1)}</span>`;
    const icon = `<span class="regular-reward-icon">${known ? rewardIcon(reward, hatImage) : UNKNOWN_ICON}</span>`;
    const name = known ? rewardName(reward) : T.secret;
    const note = known ? `<small>${rewardNote(reward)}</small>` : '';
    return `<li class="regular-reward${got ? ' got' : ''}${known ? '' : ' secret'}">${icon}` +
      `<span class="regular-reward-text">${hearts}<b>${name}</b>${note}</span>${got ? '<span class="regular-reward-tick">✓</span>' : ''}</li>`;
  });
  return {
    art: `<ul class="regular-rewards">${rows.join('')}</ul>`,
    title: T.cardTitle(T.names[id] ?? id, r.hearts),
    text: T.how[id] ?? '',
  };
}
