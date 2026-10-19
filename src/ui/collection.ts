// The Collection page inside the gear menu: every character, recipe and
// fish there is to find, and the achievements. Found ones show their
// picture, name and stars; the rest are a "???" to aim for. Achievements
// show their badge (bronze, silver or gold) and how far it is to the next.
// Each category folds up into a grid of pictures, like the Shop.

import { STRINGS } from '../strings';
import { CONFIG } from '../game/config';
import { CHARACTERS, THEMES } from '../game/growth';
import { RECIPES } from '../game/cooking';
import { characterKey } from '../game/unlocks';
import type { GameState } from '../game/state';
import type { Food, FoodId } from '../game/actions';
import { category, label, row, type Entry } from './shop';
import { ACHIEVEMENTS, badgeCount, badgeOf, nextGoal, tallyOf, type AchievementId } from '../game/achievements';
import { ACHIEVEMENT_ICONS, ITEM_ICONS, MEDAL_ICONS, UNKNOWN_ICON } from './icons';

export interface CollectionCallbacks {
  // A character's picture (its first idle frame) as a URL, if loaded.
  characterImage: (sheet: string) => string | undefined;
}

function portrait(url: string | undefined): string {
  return url ? `<span class="portrait" style="background-image:url('${url}')"></span>` : UNKNOWN_ICON;
}

function entry(found: boolean, icon: string, name: string, note: string, stars: number): Entry {
  const shownIcon = found ? icon : UNKNOWN_ICON;
  return {
    icon: shownIcon,
    faded: !found,
    row: row(shownIcon, found ? name : STRINGS.collection.unknown, found ? note : STRINGS.collection.notFound,
      label(found && stars ? STRINGS.stars(stars) : '')),
  };
}

// One achievement: its picture (dimmed until the first badge), what to do
// for the next badge with a bar showing how far along it is, and the badge
// earned so far on the right.
function achievement(state: GameState, id: AchievementId): Entry {
  const A = STRINGS.achievements;
  const have = tallyOf(state, id);
  const tier = badgeOf(state, id);
  const next = nextGoal(state, id);
  const note = next ? A.progress(A.goals[id](next.goal), Math.min(have, next.goal), next.goal) : A.allDone(have);

  const badge = document.createElement('span');
  badge.className = 'shop-label achievement-tier';
  badge.dataset.tier = tier ?? 'none';
  badge.innerHTML = MEDAL_ICONS[tier ?? 'none'];
  badge.append(tier ? A.tiers[tier] : '');
  if (tier) badge.title = A.tiers[tier];

  const el = row(ACHIEVEMENT_ICONS[id], A.names[id], note, badge);
  el.classList.add('achievement-row');
  el.dataset.tier = tier ?? 'none';
  const bar = document.createElement('span');
  bar.className = 'achievement-bar';
  const fill = document.createElement('span');
  fill.style.width = `${next ? Math.min(100, (have / next.goal) * 100) : 100}%`;
  bar.append(fill);
  el.querySelector('.shop-row-text')?.append(bar);

  return { icon: ACHIEVEMENT_ICONS[id], row: el, faded: !tier, medal: tier ? MEDAL_ICONS[tier] : undefined };
}

const foodStars = (id: string) => (CONFIG.foods as readonly Food[]).find((f) => f.id === id)?.stars ?? 0;

export function collectionPage(state: GameState, cb: CollectionCallbacks, open: Set<string>): HTMLElement[] {
  // Every character, then each of its colour variants.
  const characters: Entry[] = CHARACTERS.flatMap((c) => {
    const forms = [
      { key: characterKey(c.id, null), name: c.name, sheet: c.sheet },
      ...(c.variants ?? []).map((v) => ({
        key: characterKey(c.id, v.id),
        name: STRINGS.characterName(c.name, v.name),
        sheet: v.sheet,
      })),
    ];
    return forms.map((f) =>
      entry(state.charactersFound.includes(f.key), portrait(cb.characterImage(f.sheet)), f.name, THEMES[c.theme] ?? '', c.stars),
    );
  });
  const recipes: Entry[] = RECIPES.map((r) =>
    entry(state.recipesFound.includes(r.id), ITEM_ICONS[r.id], STRINGS.foods[r.id], '', foodStars(r.id)),
  );
  const fish = (Object.keys(CONFIG.fishing.catchOdds.other) as FoodId[]).map((id) =>
    entry(state.caught.includes(id), ITEM_ICONS[id], STRINGS.foods[id], '', foodStars(id)),
  );
  const title = (name: string, list: Entry[]) =>
    STRINGS.collection.count(name, list.filter((e) => !e.faded).length, list.length);
  const achievements = ACHIEVEMENTS.map((id) => achievement(state, id));
  const badges = badgeCount(state);
  return [
    category('achievements', STRINGS.collection.count(STRINGS.collection.achievements, badges.earned, badges.total),
      achievements, open),
    category('characters', title(STRINGS.collection.characters, characters), characters, open),
    category('recipes', title(STRINGS.collection.recipes, recipes), recipes, open),
    category('catches', title(STRINGS.collection.catches, fish), fish, open),
  ];
}
