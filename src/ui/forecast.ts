// The forecast card's details: what a little one could grow into, from
// src/game/forecast.ts. Shown in the choice box before mingling, under
// "80% chance of a little one. With great care, it could grow into:":
//
//   ★ 10%   ★★ 40%   ★★★ 50%
//   Nature  Land   ▓▓▓▓▓▓░░░░  46%
//   Ocean   Water  ▓▓▓▓░░░░░░  31%
//   Colours: Sprig (Autumn) 4%

import { STRINGS } from '../strings';
import { ELEMENTS, THEMES, getCharacter, getVariant, type Stars } from '../game/growth';
import type { Forecast } from '../game/forecast';

const escape = (text: string) => text.replace(/[&<>"]/g, (ch) => `&#${ch.charCodeAt(0)};`);

export function forecastHtml(f: Forecast): string {
  const stars = ([1, 2, 3] as Stars[])
    .filter((s) => f.stars[s] > 0)
    .map((s) => `<span><b>${STRINGS.stars(s)}</b> ${f.stars[s]}%</span>`)
    .join('');
  const themes = f.themes
    .map(
      (t) => `<li>
        <span class="forecast-name">${escape(THEMES[t.theme] ?? t.theme)}</span>
        <small class="forecast-element">${escape(t.element ? (ELEMENTS[t.element] ?? '') : '')}</small>
        <span class="forecast-bar"><i style="width:${t.chance}%"></i></span>
        <b class="forecast-pct">${Math.round(t.chance)}%</b>
      </li>`,
    )
    .join('');
  const colours = f.variants
    .map((v) => {
      const character = getCharacter(v.character);
      const name = STRINGS.characterName(character?.name ?? v.character, getVariant(character, v.variant)?.name ?? v.variant);
      return `${escape(name)} ${v.chance < 1 ? '<1' : Math.round(v.chance)}%`;
    })
    .join(', ');
  return `<div class="forecast">
    <div class="forecast-stars" aria-label="${escape(STRINGS.friends.forecastRarity)}">${stars}</div>
    <ul class="forecast-themes">${themes}</ul>
    ${colours ? `<p class="forecast-colours">${escape(STRINGS.friends.forecastColours)} ${colours}</p>` : ''}
  </div>`;
}
