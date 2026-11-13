// Every item in the game, gathered from the game's own data for the item
// catalog (items.html): its art, what it costs, every way to get it, what
// it's used for, its theme and whether it's out yet. Nothing here is typed
// in by hand, so the catalog can't drift from the game: add a food, a
// pattern or a piece of furniture to the game and it shows up here.
// A tool for the team, not part of the game.

import characters from '../data/characters.json';
import hatData from '../data/hats.json';
import manifest from '../../public/sprites/manifest.json';
import { CONFIG } from '../game/config';
import { STRINGS } from '../strings';
import { bagIcon, BAGS } from '../render/bags';
import { FURNITURE_ART } from '../render/furniture';
import { CRAFT_ART, FRAGMENT_ICON, ITEM_ICONS, MENU_ICONS, UNKNOWN_ICON } from '../ui/icons';

// ---------------------------------------------------------------- types

export type Category =
  | 'food' | 'seed' | 'fishing' | 'garden' | 'kitchen' | 'trips'
  | 'room' | 'hat' | 'material' | 'part' | 'project' | 'stars';

export const CATEGORIES: { id: Category; name: string }[] = [
  { id: 'food', name: 'Food' },
  { id: 'seed', name: 'Seeds' },
  { id: 'fishing', name: 'Fishing' },
  { id: 'garden', name: 'Garden' },
  { id: 'kitchen', name: 'Kitchen' },
  { id: 'trips', name: 'Journeys' },
  { id: 'room', name: 'Room' },
  { id: 'hat', name: 'Hats' },
  { id: 'material', name: 'Materials' },
  { id: 'part', name: 'Key parts' },
  { id: 'project', name: 'Projects' },
  { id: 'stars', name: 'Star shop' },
];

// The kinds of ways to get something, for the filter.
export type Way =
  | 'start' | 'shop' | 'starShop' | 'money' | 'jar' | 'fishing' | 'garden' | 'cooking'
  | 'journeys' | 'dig' | 'workbench' | 'percy' | 'backyard' | 'meadow' | 'home' | 'none';

export const WAYS: { id: Way; name: string }[] = [
  { id: 'start', name: 'Starting pantry' },
  { id: 'shop', name: 'Shop (gold)' },
  { id: 'starShop', name: 'Star fragments' },
  { id: 'money', name: 'Real money' },
  { id: 'jar', name: 'Rice jar' },
  { id: 'fishing', name: 'Fishing' },
  { id: 'garden', name: 'Garden' },
  { id: 'cooking', name: 'Cooking' },
  { id: 'journeys', name: 'Journeys' },
  { id: 'dig', name: 'Sniff and dig' },
  { id: 'workbench', name: 'Workbench' },
  { id: 'percy', name: 'Percy' },
  { id: 'backyard', name: 'Backyard' },
  { id: 'meadow', name: 'Meadow' },
  { id: 'home', name: 'At home' },
  { id: 'none', name: 'No way yet' },
];

export interface Cost {
  cur: 'gold' | 'frag' | 'cash' | 'mat';
  amount: number | string; // a string for real money ("€2.99")
  mat?: string; // the material, for cur 'mat'
}

export interface Obtain {
  way: Way;
  text: string;
  place?: string; // a journey or dig place
}

export interface CatalogItem {
  key: string; // `${category}:${id}`, unique
  id: string;
  category: Category;
  kind: string; // a finer kind: "Cooked dish", "Wallpaper"…
  name: string;
  art: string; // SVG, or '' when `sheet` is set
  sheet?: string; // a sprite sheet image URL (hats), its large right half shown
  missingArt: boolean;
  stars?: number;
  // What you pay in the Shop or the Star shop, or what a build takes.
  cost: Cost[];
  // What it's worth (food: what Percy pays from, and dishes are valued by).
  worth?: number;
  ways: Obtain[];
  uses: string[];
  about: string[]; // stats, effects, notes
  theme?: string; // a theme id from characters.json
  later: boolean; // waits for a future update
  laterNote?: string;
  tags: string[];
}

// ---------------------------------------------------------------- names

export const THEMES = characters.themes as Record<string, string>;
const PLACES = STRINGS.dig.places as Record<string, string>;
const placeName = (id: string) => PLACES[id] ?? id;
const themeOfPlace: Record<string, string> = Object.fromEntries(CONFIG.journeys.places.map((p) => [p.id, p.theme]));
export const PLACE_THEMES = themeOfPlace;

const humanize = (id: string) => id.replace(/([A-Z])/g, ' $1').replace(/^./, (c) => c.toUpperCase()).trim();
const foodName = (id: string) => (STRINGS.foods as Record<string, string>)[id] ?? humanize(id);
const matName = (id: string) => STRINGS.crafting.materials[id] ?? humanize(id);
const SHOP = STRINGS.shop;
const furnitureName = (id: string) => SHOP.furniture[id] ?? humanize(id);
const charmName = (id: string) => STRINGS.journeys.charms[id]?.name ?? humanize(id);
const baitName = (id: string) => (SHOP.baits as Record<string, { name: string }>)[id]?.name ?? humanize(id);
const supplyName = (id: string) => (STRINGS.garden.supplies as Record<string, string>)[id] ?? baitName(id);
const seedName = (id: string) => STRINGS.garden.seedName(foodName(id));
const list = (xs: string[]) => (xs.length <= 1 ? xs.join('') : `${xs.slice(0, -1).join(', ')} and ${xs[xs.length - 1]}`);
const needsText = (needs: Partial<Record<string, number>>) =>
  Object.entries(needs).map(([m, n]) => `${n} ${matName(m).toLowerCase()}`).join(', ');
const matCosts = (needs: Partial<Record<string, number>>): Cost[] =>
  Object.entries(needs).map(([mat, n]) => ({ cur: 'mat', amount: n ?? 0, mat }));

// ---------------------------------------------------------------- finds

// "seed:carrot", "mat:twig", "gold:12" or a food id, as journeys and Sniff
// and dig write them.
function parseFind(f: string): { kind: 'seed' | 'mat' | 'gold' | 'food'; id: string } {
  const [a, b] = f.split(':');
  if (b === undefined) return { kind: 'food', id: a };
  return { kind: a as 'seed' | 'mat' | 'gold', id: b };
}

const starsText = (s: string | number) => `${s}★`;

// Where something turns up on journeys and in Sniff and dig, keyed by
// "food:id", "seed:id" or "mat:id".
function placeFinds(): Map<string, Obtain[]> {
  const out = new Map<string, Obtain[]>();
  const add = (key: string, o: Obtain) => {
    const l = out.get(key) ?? [];
    if (!l.some((x) => x.text === o.text)) l.push(o);
    out.set(key, l);
  };
  for (const p of CONFIG.journeys.places) {
    for (const [stars, finds] of Object.entries(p.finds)) {
      for (const f of finds as readonly string[]) {
        const { kind, id } = parseFind(f);
        if (kind === 'gold') continue;
        add(`${kind}:${id}`, { way: 'journeys', place: p.id, text: `Journeys to ${placeName(p.id)}, ${starsText(stars)} find` });
      }
    }
    add(`food:${p.ingredient}`, { way: 'journeys', place: p.id, text: `Journeys to ${placeName(p.id)}: the place's own ingredient (every rare and epic trip)` });
  }
  for (const [place, mats] of Object.entries(CONFIG.crafting.places)) {
    for (const [stars, ids] of Object.entries(mats)) {
      for (const id of ids as readonly string[]) {
        add(`mat:${id}`, { way: 'journeys', place, text: `Journeys to ${placeName(place)}, ${starsText(stars)} material` });
      }
    }
  }
  for (const [place, byStars] of Object.entries(CONFIG.dig.finds)) {
    for (const [stars, finds] of Object.entries(byStars)) {
      for (const f of finds as readonly string[]) {
        const { kind, id } = parseFind(f);
        if (kind === 'gold') continue;
        add(`${kind}:${id}`, { way: 'dig', place, text: `Sniff and dig at ${placeName(place)}, ${starsText(stars)} spot` });
      }
    }
  }
  // A place's ingredient also turns up in its dig.
  for (const p of CONFIG.journeys.places) {
    add(`food:${p.ingredient}`, { way: 'dig', place: p.id, text: `Sniff and dig at ${placeName(p.id)} (its ingredient, now and then)` });
  }
  return out;
}

// A theme, when every place something turns up is of the same theme and
// there's no other way to get it.
function themeOf(ways: Obtain[]): string | undefined {
  if (ways.length === 0 || ways.some((w) => !w.place)) return undefined;
  const themes = new Set(ways.map((w) => themeOfPlace[w.place!]));
  if (themes.size !== 1) return undefined;
  return [...themes][0];
}

// ---------------------------------------------------------------- build

type FoodRow = (typeof CONFIG.foods)[number] & {
  stars?: number; limited?: boolean; tags: readonly string[];
  effects?: readonly { kind: string; percent?: number; hours?: number; place?: string }[];
};
type RecipeRow = { id: string; ingredients: readonly string[]; station?: string; makes?: number; unlock?: { from: string; to: string } };
type KitchenRow = { price?: number; slots?: number };
type ProjectRow = (typeof CONFIG.crafting.projects)[number] & { later?: boolean };

const RECIPES = CONFIG.cooking.recipes as readonly RecipeRow[];
const KITCHEN = CONFIG.cooking.kitchen as Record<string, KitchenRow>;
const STATIONS = CONFIG.cooking.stations as Record<string, { starter?: boolean; prep?: boolean; timed?: boolean }>;
const PROJECTS = CONFIG.crafting.projects as readonly ProjectRow[];
const PATTERNS = CONFIG.crafting.patterns as readonly { id: string; category: string; makes: string; count?: number; needs: Partial<Record<string, number>> }[];
const PERCY_REWARDS = CONFIG.regulars.percy.rewards as readonly Record<string, unknown>[];

// What a kitchen item opens: the stations no live project gives and the
// Shop doesn't sell are for a future update.
const projectGiving = (gives: string) => PROJECTS.find((p) => p.gives === gives);
function kitchenLater(id: string): string | undefined {
  if (KITCHEN[id]?.price) return undefined;
  const p = projectGiving(id);
  if (p && !p.later) return undefined;
  return p ? `Comes with the ${STRINGS.crafting.projects[p.id] ?? p.id}, which isn't out yet` : 'Not sold or given yet';
}

function recipeLater(r: RecipeRow): string | undefined {
  const station = r.station ?? 'pot';
  if (STATIONS[station]?.starter) return undefined;
  const why = kitchenLater(station);
  return why ? `Made at the ${station}: ${why.charAt(0).toLowerCase()}${why.slice(1)}` : undefined;
}

function effectText(e: { kind: string; percent?: number; hours?: number; place?: string }): string {
  switch (e.kind) {
    case 'slowHunger': return `Tummy empties ${e.percent}% slower for ${e.hours}h`;
    case 'slowJoy': return `Joy drops ${e.percent}% slower for ${e.hours}h`;
    case 'steadyPaws': return `Fishing's green stripe ${e.percent}% wider for ${e.hours}h`;
    case 'placeFind': return `In the lunchbox: one more find at ${placeName(e.place ?? '')}`;
    default: return e.kind;
  }
}

const HAT_SHEETS = (manifest as unknown as { sheets: Record<string, { file?: string }> }).sheets;

export function buildCatalog(): CatalogItem[] {
  const items: CatalogItem[] = [];
  const finds = placeFinds();
  const push = (it: Omit<CatalogItem, 'key' | 'missingArt' | 'tags' | 'theme' | 'later'> & Partial<Pick<CatalogItem, 'theme' | 'later' | 'laterNote' | 'tags'>>) => {
    const art = it.art || (it.sheet ? '' : UNKNOWN_ICON);
    items.push({
      ...it,
      key: `${it.category}:${it.id}`,
      art,
      missingArt: !it.sheet && (art === UNKNOWN_ICON || !art),
      theme: it.theme ?? themeOf(it.ways),
      later: it.later ?? false,
      tags: it.tags ?? [],
      ways: it.ways.length ? it.ways : [{ way: 'none', text: 'No way to get it in the game yet' }],
    });
  };

  // --- Food
  const percySeedOdds = CONFIG.delivery.seedOdds as Record<string, number>;
  const shopCatch = CONFIG.fishing.baits as Record<string, { odds?: Record<string, number> }>;
  for (const f of CONFIG.foods as readonly FoodRow[]) {
    const ways: Obtain[] = [];
    const cost: Cost[] = [];
    const startN = (CONFIG.economy.startingFood as Record<string, number>)[f.id];
    if (startN) ways.push({ way: 'start', text: `${startN} in a brand new pet's pantry` });
    if (f.source === 'shop' || f.source === 'staple') {
      cost.push({ cur: 'gold', amount: f.price });
      ways.push({ way: 'shop', text: f.limited ? `Shop, Food tab, only on some days (${CONFIG.economy.limited.perDay} a day)` : 'Shop, Food tab' });
    }
    if (f.source === 'staple') ways.push({ way: 'jar', text: `Free from the rice jar: one every ${CONFIG.riceJar.refillHours}h, up to ${CONFIG.riceJar.size}` });
    if (f.source === 'caught') {
      const fish = (CONFIG.fishing.fish as Record<string, { odds: number }>)[f.id];
      const baitOdds = Object.entries(shopCatch).filter(([, b]) => b.odds?.[f.id]).map(([b, x]) => `${x.odds![f.id]}% with ${baitName(b).toLowerCase()}`);
      ways.push({ way: 'fishing', text: `Fishing: ${fish?.odds ?? '?'}% of bites${baitOdds.length ? `, ${baitOdds.join(', ')}` : ''}` });
    }
    if (f.source === 'grown') {
      const crop = CONFIG.garden.crops.find((c) => c.id === f.id);
      if (crop) ways.push({ way: 'garden', text: `Garden: ${crop.harvest} from a ${seedName(f.id).toLowerCase()}, ready in ${crop.hours}h` });
    }
    const recipe = RECIPES.find((r) => r.id === f.id);
    let later: string | undefined;
    if (recipe) {
      const station = recipe.station ?? 'pot';
      const at = station === 'board' ? 'Cutting board' : station === 'pot' ? (recipe.ingredients.length > CONFIG.cooking.slots ? 'Cooking pot (needs the bigger pot)' : 'Cooking pot') : humanize(station);
      const season = recipe.unlock ? ` (only ${recipe.unlock.from} to ${recipe.unlock.to})` : '';
      ways.push({ way: 'cooking', text: `${at}: ${list(recipe.ingredients.map(foodName))}${recipe.makes ? `, makes ${recipe.makes}` : ''}${season}` });
      later = recipeLater(recipe);
    }
    if (f.id === CONFIG.cooking.mess) ways.push({ way: 'cooking', text: 'Cooking pot: any mix that isn\'t a recipe' });
    for (const o of finds.get(`food:${f.id}`) ?? []) ways.push(o);
    if (f.id === 'energyDrink') ways.push({ way: 'percy', text: `Percy, after a gold-frame order with no seed (${CONFIG.delivery.drinkChance * 100}% of those)` });
    if (f.id === 'honey' && projectGiving('hive')) ways.push({ way: 'backyard', text: `Beehive in the Backyard: ${CONFIG.crafting.hive.honey} a day` });

    const uses = RECIPES.filter((r) => r.ingredients.includes(f.id)).map((r) => `${foodName(r.id)}${r.station === 'board' ? ' (cut)' : ''}`);
    const stats = [`Tummy ${f.hunger}`, `Joy ${f.happiness}`, `Health ${f.health}`, ...('energy' in f ? [`Energy ${(f as { energy: number }).energy}`] : [])];
    push({
      id: f.id, category: 'food', name: foodName(f.id),
      kind: { shop: 'Shop food', staple: 'Staple', caught: 'Catch', grown: 'Crop', found: 'Journey ingredient', cooked: 'Cooked dish', prepped: 'Prepped' }[f.source] ?? f.source,
      art: ITEM_ICONS[f.id] ?? '', stars: f.stars, cost, worth: f.price, ways,
      uses: uses.length ? [`Goes into ${list(uses)}`] : [],
      about: [stats.join(' · '), ...(f.effects ?? []).map(effectText), ...(f.tags.length ? [`Tags: ${f.tags.join(', ')}`] : [])],
      later: !!later, laterNote: later, tags: [...f.tags],
    });
  }
  // The fortune cookie isn't a food you eat: it's opened before mingling.
  push({
    id: 'fortuneCookie', category: 'food', kind: 'Hint for mingling', name: SHOP.fortuneCookie, art: ITEM_ICONS.fortuneCookie ?? '',
    cost: [{ cur: 'gold', amount: CONFIG.fortune.price }], ways: [{ way: 'shop', text: 'Shop, Food tab (once friends drop by)' }],
    uses: ['Opened before mingling for a hint about the little one'], about: [],
  });

  // --- Seeds
  for (const c of CONFIG.garden.crops) {
    const ways: Obtain[] = [];
    const cost: Cost[] = [];
    if (c.seedPrice > 0) {
      cost.push({ cur: 'gold', amount: c.seedPrice });
      ways.push({ way: 'shop', text: 'Shop, Garden tab' });
    }
    const fishOdds = CONFIG.garden.seedOdds.other[c.id as keyof typeof CONFIG.garden.seedOdds.other];
    ways.push({ way: 'fishing', text: `Fishing: ${CONFIG.garden.seedChance.fishing * 100}% of catches give a seed, ${fishOdds}% of those this one` });
    ways.push({ way: 'home', text: `Cuddles and tickles: ${CONFIG.garden.seedChance.play * 100}% chance of a seed` });
    const pOdds = percySeedOdds[c.id];
    if (pOdds) ways.push({ way: 'percy', text: `Percy, after a gold-frame order: ${CONFIG.delivery.seedChance * 100}% leave a seed, ${pOdds}% of those this one` });
    const heart = PERCY_REWARDS.findIndex((r) => r.seed === c.id);
    if (heart >= 0) ways.push({ way: 'percy', text: `Percy's reward at ${heart + 1} heart${heart ? 's' : ''}` });
    for (const o of finds.get(`seed:${c.id}`) ?? []) ways.push(o);
    push({
      id: c.id, category: 'seed', kind: 'Seed', name: seedName(c.id), art: ITEM_ICONS[`seed_${c.id}`] ?? '',
      cost, ways, uses: [`Grows ${c.harvest} ${foodName(c.id).toLowerCase()} in ${c.hours}h`], about: [], theme: undefined,
    });
  }

  // --- Fishing gear: baits
  const madeBy = (target: string) => PATTERNS.filter((p) => p.makes === target);
  const workbenchWays = (target: string): Obtain[] =>
    madeBy(target).map((p) => ({ way: 'workbench', text: `Workbench: ${needsText(p.needs)}${p.count && p.count > 1 ? `, makes ${p.count}` : ''}` }));
  for (const [id, b] of Object.entries(CONFIG.fishing.baits) as [string, { price: number; bitesSooner?: number; odds?: Record<string, number> }][]) {
    const odds = b.odds ? Object.entries(b.odds).map(([f, x]) => `${foodName(f)} ${x}%`).join(', ') : '';
    push({
      id, category: 'fishing', kind: 'Bait', name: baitName(id), art: ITEM_ICONS[id] ?? '',
      cost: [{ cur: 'gold', amount: b.price }],
      ways: [{ way: 'shop', text: 'Shop, Fishing tab' }, ...workbenchWays(`supply:${id}`)],
      uses: ['Used up by each fish landed with it'],
      about: [b.bitesSooner ? `Fish bite in ${b.bitesSooner * 100}% of the time` : '', odds ? `Odds: ${odds}` : ''].filter(Boolean),
    });
  }

  // --- Garden supplies and the extra pot
  for (const [id, price] of Object.entries(CONFIG.garden.supplies)) {
    const ways: Obtain[] = [{ way: 'shop', text: 'Shop, Garden tab' }, ...workbenchWays(`supply:${id}`)];
    if (id === 'fertilizer') ways.push({ way: 'home', text: `Homemade: ${CONFIG.garden.poopPerFertilizer} picked-up poop make one` });
    push({
      id, category: 'garden', kind: 'Garden supply', name: supplyName(id), art: ITEM_ICONS[id] ?? '',
      cost: [{ cur: 'gold', amount: price }], ways, uses: [(STRINGS.garden.supplyNotes as Record<string, string>)[id] ?? ''], about: [],
    });
  }
  push({
    id: 'gardenPot', category: 'garden', kind: 'Upgrade', name: SHOP.extraPot, art: ITEM_ICONS.gardenPot ?? '',
    cost: [{ cur: 'gold', amount: CONFIG.garden.extraPotPrice }], ways: [{ way: 'shop', text: `Shop, Garden tab (up to ${CONFIG.garden.maxPlots} pots)` }],
    uses: [SHOP.extraPotNote], about: [],
  });

  // --- Kitchen
  const kitchenText = SHOP.kitchenItems as Record<string, { name: string; note: string }>;
  for (const [id, k] of Object.entries(KITCHEN)) {
    const why = kitchenLater(id);
    const p = projectGiving(id);
    const ways: Obtain[] = [];
    if (k.price) ways.push({ way: 'shop', text: 'Shop, Food tab (once cooking opens)' });
    if (p) ways.push({ way: 'workbench', text: `Finishing the ${STRINGS.crafting.projects[p.id] ?? p.id} project` });
    const recipes = RECIPES.filter((r) => r.station === id).map((r) => foodName(r.id));
    push({
      id, category: 'kitchen', kind: STATIONS[id] ? 'Station' : 'Upgrade', name: kitchenText[id]?.name ?? humanize(id),
      art: ITEM_ICONS[id] ?? '', cost: k.price ? [{ cur: 'gold', amount: k.price }] : [], ways,
      uses: [kitchenText[id]?.note ?? (recipes.length ? `Makes ${list(recipes)}` : 'No recipes use it yet')],
      about: [], later: !!why, laterNote: why,
    });
  }
  push({
    id: 'bigRiceJar', category: 'kitchen', kind: 'Upgrade', name: SHOP.bigJar, art: ITEM_ICONS.riceBall ?? '',
    cost: [{ cur: 'frag', amount: CONFIG.riceJar.bigger.fragments }], ways: [{ way: 'starShop', text: 'Shop, Food tab, for star fragments' }],
    uses: [`Holds ${CONFIG.riceJar.bigger.extra} more free rice ball`], about: [],
  });

  // --- Journeys: charms, bags, tickets
  for (const c of CONFIG.journeys.charms as readonly { id: string; price: number }[]) {
    push({
      id: c.id, category: 'trips', kind: 'Lunchbox charm', name: charmName(c.id), art: ITEM_ICONS[`charm_${c.id}`] ?? '',
      cost: [{ cur: 'gold', amount: c.price }],
      ways: [{ way: 'shop', text: 'Shop, Journeys tab' }, ...workbenchWays(`charm:${c.id}`)],
      uses: [STRINGS.journeys.charms[c.id]?.note ?? ''], about: ['Used up on one trip'],
    });
  }
  for (const id of Object.keys(BAGS)) {
    const heart = PERCY_REWARDS.findIndex((r) => r.bag === id);
    push({
      id, category: 'trips', kind: 'Journey bag', name: STRINGS.regulars.bags[id] ?? (id === 'sack' ? 'Plain bundle' : humanize(id)), art: bagIcon(id),
      cost: [], ways: heart >= 0 ? [{ way: 'percy', text: `Percy's reward at ${heart + 1} hearts` }] : [{ way: 'start', text: 'Every pet has it' }],
      uses: ['Only for show, carried on journeys'], about: [],
    });
  }
  push({
    id: 'holidayTicket', category: 'trips', kind: 'Ticket', name: STRINGS.journeys.holidayTicket, art: MENU_ICONS.meadow ?? '',
    cost: [{ cur: 'frag', amount: CONFIG.journeys.holiday.fragments }], ways: [{ way: 'starShop', text: 'Shop, Journeys tab, for star fragments' }],
    uses: [`Every pet goes on a Meadow holiday for ${list(CONFIG.journeys.holiday.days.map(String))} days, coming home ${CONFIG.journeys.holiday.joy} happier`], about: [],
  });
  push({
    id: 'percyReset', category: 'trips', kind: 'Service', name: 'Wake Percy early', art: ITEM_ICONS.percy ?? '',
    cost: [{ cur: 'gold', amount: CONFIG.journeys.percy.resetPrice }], ways: [{ way: 'shop', text: 'Shop, Journeys tab, while Percy rests' }],
    uses: [`Skips his ${CONFIG.journeys.percy.restHours}h rest after coming along on a journey`], about: [],
  });

  // --- Room: wallpaper, curtains, furniture
  const special = `Can be the Shop's daily special (${CONFIG.dailySpecial.off * 100}% off)`;
  for (const w of CONFIG.room.wallpapers as readonly { id: string; price: number; earned?: boolean }[]) {
    const heart = PERCY_REWARDS.findIndex((r) => r.wallpaper === w.id);
    const ways: Obtain[] = w.price > 0 ? [{ way: 'shop', text: 'Shop, Room tab' }] : heart >= 0 ? [{ way: 'percy', text: `Percy's reward at ${heart + 1} hearts` }] : [{ way: 'start', text: 'Every room starts with it' }];
    push({
      id: w.id, category: 'room', kind: 'Wallpaper', name: SHOP.wallpapers[w.id] ?? humanize(w.id), art: ITEM_ICONS[`wallpaper_${w.id}`] ?? '',
      cost: w.price > 0 ? [{ cur: 'gold', amount: w.price }] : [], ways, uses: [], about: w.price > 0 ? [special] : [],
    });
  }
  for (const c of CONFIG.room.curtains) {
    push({
      id: c.id, category: 'room', kind: 'Curtains', name: SHOP.curtains[c.id] ?? humanize(c.id), art: ITEM_ICONS[`curtains_${c.id}`] ?? '',
      cost: [{ cur: 'gold', amount: c.price }], ways: [{ way: 'shop', text: 'Shop, Room tab' }], uses: [], about: [special],
    });
  }
  const spotName = (s: string) => SHOP.furnitureSlot[s] ?? s;
  const furniture = CONFIG.room.furniture as readonly { id: string; spots: readonly string[]; price: number; crafted?: boolean }[];
  for (const f of furniture) {
    const ways: Obtain[] = f.price > 0 ? [{ way: 'shop', text: 'Shop, Room tab' }] : [];
    ways.push(...workbenchWays(`furniture:${f.id}`));
    push({
      id: f.id, category: 'room', kind: 'Furniture', name: furnitureName(f.id), art: ITEM_ICONS[`furniture_${f.id}`] ?? '',
      cost: f.price > 0 ? [{ cur: 'gold', amount: f.price }] : [], ways, uses: [`Goes ${[...new Set(f.spots.map(spotName))].join(' or ').toLowerCase()}`],
      about: f.price > 0 ? [special] : [],
    });
  }
  // Pieces the room shows that aren't in the furniture list: the keepsake
  // frame and shelf come with what pets leave in the Meadow.
  for (const id of Object.keys(FURNITURE_ART).filter((id) => !furniture.some((f) => f.id === id))) {
    push({
      id, category: 'room', kind: 'Furniture', name: furnitureName(id), art: ITEM_ICONS[`furniture_${id}`] ?? '',
      cost: [], ways: [{ way: 'meadow', text: id === 'keepsakeShelf' ? 'Appears once a pet leaves a keepsake from its world in the Meadow' : 'Appears once a pet moves to the Meadow and leaves its portrait' }],
      uses: ['Shows keepsakes from pets in the Meadow'], about: [],
    });
  }
  push({
    id: 'familyHome', category: 'stars', kind: 'Room', name: STRINGS.familyHome.name, art: ITEM_ICONS.familyHome ?? '',
    cost: [{ cur: 'frag', amount: CONFIG.familyHome.fragments }, { cur: 'cash', amount: CONFIG.familyHome.price }],
    ways: [{ way: 'starShop', text: 'Shop, Room tab, for star fragments' }, { way: 'money', text: `Or real money (${CONFIG.familyHome.price}, a stand-in for now)` }],
    uses: [STRINGS.familyHome.shopNote], about: [],
  });

  // --- Hats
  for (const h of hatData.hats as { id: string; name: string; price: number; fragments?: number; sheet: string }[]) {
    const file = HAT_SHEETS[h.sheet]?.file;
    push({
      id: h.id, category: 'hat', kind: h.fragments ? 'Star hat' : 'Hat', name: h.name, art: '', sheet: file ? `/sprites/${file}` : undefined,
      cost: h.fragments ? [{ cur: 'frag', amount: h.fragments }] : [{ cur: 'gold', amount: h.price }],
      ways: [h.fragments ? { way: 'starShop', text: 'Shop, Hats tab, for star fragments' } : { way: 'shop', text: 'Shop, Hats tab' }],
      uses: [SHOP.hatAbout[h.id] ?? ''], about: h.fragments ? [] : [special],
    });
  }

  // --- Materials
  for (const [id, stars] of Object.entries(CONFIG.crafting.materials)) {
    const ways = [...(finds.get(`mat:${id}`) ?? [])];
    if (id === 'beeswax' && projectGiving('hive')) ways.push({ way: 'backyard', text: `Beehive in the Backyard: ${CONFIG.crafting.hive.beeswax} a day` });
    const patterns = PATTERNS.filter((p) => p.needs[id]).map((p) => STRINGS.crafting.patterns[p.id] ?? p.id);
    const projects = PROJECTS.filter((p) => p.stages.some((s) => (s.needs as Record<string, number>)[id])).map((p) => STRINGS.crafting.projects[p.id] ?? p.id);
    push({
      id, category: 'material', kind: 'Material', name: STRINGS.crafting.material[id] ?? humanize(id), art: ITEM_ICONS[`mat_${id}`] ?? '',
      stars, cost: [], ways, uses: [...(patterns.length ? [`Workbench: ${list(patterns)}`] : []), ...(projects.length ? [`Projects: ${list(projects)}`] : [])],
      about: [`Holds up to ${CONFIG.crafting.maxEach}. Can't be eaten, sold or given.`],
    });
  }

  // --- Key parts and projects
  for (const [id, place] of Object.entries(CONFIG.crafting.parts)) {
    const project = PROJECTS.find((p) => p.part === id);
    const later = !!project?.later;
    const ways: Obtain[] = [{ way: 'dig', place, text: `Sniff and dig at ${placeName(place)}: empty holes turn it up, likelier each time` }];
    if (place !== 'meadow') ways.push({ way: 'journeys', place, text: `Rare and epic journeys to ${placeName(place)}: ${CONFIG.crafting.partTripChance * 100}%` });
    push({
      id, category: 'part', kind: 'Key part', name: STRINGS.crafting.parts[id] ?? humanize(id), art: ITEM_ICONS[`part_${id}`] ?? '',
      cost: [], ways, uses: project ? [`Opens the ${STRINGS.crafting.projects[project.id] ?? project.id} project`] : [], about: ['Found once'],
      later, laterNote: later ? "Its project isn't out yet, so it can't be found" : undefined,
    });
  }
  for (const p of PROJECTS) {
    const gold = p.stages.reduce((n, s) => n + s.gold, 0);
    const mats: Record<string, number> = {};
    for (const s of p.stages) for (const [m, n] of Object.entries(s.needs)) mats[m] = (mats[m] ?? 0) + (n as number);
    const hours = p.stages.reduce((n, s) => n + s.hours, 0);
    const stageNames = STRINGS.crafting.stages[p.id] ?? [];
    push({
      id: p.id, category: 'project', kind: 'Backyard project', name: STRINGS.crafting.projects[p.id] ?? humanize(p.id),
      art: CRAFT_ART[p.id] ?? '', cost: [{ cur: 'gold', amount: gold }, ...matCosts(mats)],
      ways: [{ way: 'workbench', text: `Workbench, Projects tab, once the ${(STRINGS.crafting.parts[p.part] ?? p.part).toLowerCase()} is found: ${p.stages.length} stages, ${hours}h of building` }],
      uses: [STRINGS.crafting.gives[p.id] ?? ''],
      about: p.stages.map((s, i) => `${stageNames[i] ?? s.id}: ${needsText(s.needs)}, ${s.gold} gold, ${s.hours}h`),
      later: !!p.later, laterNote: p.later ? 'Marked `later` in the config: waits for a future update' : undefined,
    });
  }

  // --- Star shop
  push({
    id: 'revivalStar', category: 'stars', kind: 'Revival', name: SHOP.revivalStar, art: ITEM_ICONS.revivalStar ?? '',
    cost: [{ cur: 'frag', amount: CONFIG.fragments.perStar }], ways: [{ way: 'starShop', text: `Crafted from ${CONFIG.fragments.perStar} star fragments in the Star shop` }],
    uses: ['Brings back a pet that passed away'], about: ["Money can't buy it directly"],
  });
  push({
    id: 'fragments', category: 'stars', kind: 'Currency', name: SHOP.fragments, art: FRAGMENT_ICON,
    cost: CONFIG.store.map((s) => ({ cur: 'cash' as const, amount: `${s.price} for ${s.fragments}` })),
    ways: [
      { way: 'home', text: `${CONFIG.fragments.perGoodDay} every good care day` },
      { way: 'home', text: `${CONFIG.fragments.perMilestone} for every Milestone badge` },
      { way: 'money', text: `Packs: ${CONFIG.store.map((s) => `${s.fragments} for ${s.price}`).join(', ')}` },
    ],
    uses: ['Revival Star, Family Home, star hats, bigger rice jar, Holiday tickets'], about: [],
  });

  return items;
}

// Every theme used by an item, then the rest of the themes.
export function themesIn(items: CatalogItem[]): string[] {
  const used = new Set(items.map((i) => i.theme).filter(Boolean) as string[]);
  return Object.keys(THEMES).filter((t) => used.has(t));
}
