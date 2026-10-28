// Crafting: materials found on journeys and in Sniff and dig, made into
// things at the workbench, or built up into big projects in the meadow.
//
// Materials (twigs, pebbles, shells...) go in their own pouch. They can't
// be eaten, sold or given, so they never turn into gold or energy.
//
// The workbench has patterns in Shop-like categories: room pieces you
// can't buy (each made once), journey charms, bait and fertilizer. A
// pattern needs a few materials and three taps of the hammer.
//
// Projects are the long goals: the windmill (the mill for the kitchen),
// the beehive (honey and beeswax every day) and Percy's perch (a shorter
// rest after a courier trip). Each opens when its key part is found (dug
// up at its place, or now and then on a journey there), and is built in
// stages: hand over a stage's materials and gold, and it takes a few real
// hours to build. There's no way to hurry it, with gold or star fragments.
//
// The numbers live in CONFIG.crafting; the screen in src/ui/workbench.ts.

import { CONFIG } from './config';
import { getCharacter, seededRoll } from './growth';
import { localDay } from './economy';
import { logMessage } from './messages';
import { decorKey, ownsDecor } from './decor';
import type { Crafting, Find, GameState, Pet, Rarity } from './state';

const C = CONFIG.crafting;
const HOUR = 3_600_000;

export type MaterialId = keyof typeof C.materials;
export const MATERIALS = Object.keys(C.materials) as MaterialId[];
export const materialStars = (id: string): number => (C.materials as Record<string, number>)[id] ?? 1;
export const isMaterial = (id: string): id is MaterialId => MATERIALS.includes(id as MaterialId);

export type PartId = keyof typeof C.parts;
export const PARTS = Object.keys(C.parts) as PartId[];
export const partPlace = (id: string): string | undefined => (C.parts as Record<string, string>)[id];

export type Category = (typeof C.categories)[number];
export const CATEGORIES = C.categories as readonly Category[];

export interface Pattern {
  id: string;
  category: Category;
  makes: string; // "furniture:id", "charm:id" or "supply:id"
  count?: number; // how many one making makes (1 if not given)
  needs: Partial<Record<MaterialId, number>>;
}
export const PATTERNS = C.patterns as readonly Pattern[];
export const getPattern = (id: string): Pattern | undefined => PATTERNS.find((p) => p.id === id);

export interface Stage {
  id: string;
  needs: Partial<Record<MaterialId, number>>;
  gold: number;
  hours: number;
}
export interface Project {
  id: string;
  part: PartId;
  gives: 'mill' | 'hive' | 'perch';
  stages: readonly Stage[];
}
export const PROJECTS = C.projects as readonly Project[];
export const getProject = (id: string): Project | undefined => PROJECTS.find((p) => p.id === id);

// Saves from before crafting have none of it yet.
const crafting = (state: GameState): Crafting =>
  state.crafting ?? { materials: {}, parts: [], partTries: {}, made: [], projects: {}, hiveDay: '' };
const withCrafting = (state: GameState, change: Partial<Crafting>): GameState => ({ ...state, crafting: { ...crafting(state), ...change } });

// ---- The pouch ----

export const materialCount = (state: GameState, id: string): number => crafting(state).materials[id] ?? 0;
export const hasAnyMaterial = (state: GameState): boolean =>
  MATERIALS.some((id) => materialCount(state, id) > 0) || crafting(state).parts.length > 0;

export function addMaterial(state: GameState, id: string, n: number): GameState {
  const count = Math.max(0, Math.min(C.maxEach, materialCount(state, id) + n));
  return withCrafting(state, { materials: { ...crafting(state).materials, [id]: count } });
}

export const hasPart = (state: GameState, id: string): boolean => crafting(state).parts.includes(id);

export function addPart(state: GameState, id: string): GameState {
  return hasPart(state, id) ? state : withCrafting(state, { parts: [...crafting(state).parts, id] });
}

// The key part still waiting to be found at a place, if any.
export function partAt(state: GameState, place: string): PartId | null {
  return PARTS.find((p) => partPlace(p) === place && !hasPart(state, p)) ?? null;
}

// Does the needs list fit in the pouch (`times` over)?
export function haveMaterials(state: GameState, needs: Partial<Record<string, number>>, times = 1): boolean {
  return Object.entries(needs).every(([id, n]) => materialCount(state, id) >= (n ?? 0) * times);
}

function useMaterials(state: GameState, needs: Partial<Record<string, number>>): GameState {
  let s = state;
  for (const [id, n] of Object.entries(needs)) s = addMaterial(s, id, -(n ?? 0));
  return s;
}

// ---- Finding them ----

// The materials (and maybe a key part) a journey brings home, rolled from
// the pet's id and when it set off, like the rest of its finds. Parts you
// already have aren't found again.
export function tripCrafting(state: GameState, pet: Pet, place: { id: string; theme: string }, rarity: Rarity, startedAt: number): Find[] {
  const roll = (label: string) => seededRoll(pet.id, `trip:${startedAt}:craft:${label}`);
  const lists = (C.places as Record<string, Partial<Record<1 | 2 | 3, readonly string[]>>>)[place.id];
  if (!lists) return [];
  const twoStar = CONFIG.journeys.finds[rarity].twoStarChance;
  const count = C.trip[rarity] + (getCharacter(pet.character)?.theme === place.theme ? 1 : 0);
  const finds: Find[] = [];
  const add = (id: string) => {
    const same = finds.find((f) => f.id === id);
    if (same) same.count++;
    else finds.push({ kind: 'material', id, count: 1, stars: materialStars(id) });
  };
  for (let i = 0; i < count; i++) {
    const list = (roll(`stars:${i}`) < twoStar && lists[2]) || lists[1]!;
    add(list[Math.floor(roll(`pick:${i}`) * list.length)]);
  }
  if (rarity === 'epic' && lists[3] && roll('three') < C.threeStarChance) add(lists[3][0]);
  const part = partAt(state, place.id);
  if (part && rarity !== 'common' && roll('part') < C.partTripChance) finds.push({ kind: 'part', id: part, count: 1, stars: 3 });
  return finds;
}

// An empty hole dug at `place` may turn up the key part buried there:
// likelier with every empty hole, so it always turns up in the end.
export function digForPart(state: GameState, place: string, random: number): { state: GameState; find?: Find } {
  const part = partAt(state, place);
  if (!part) return { state };
  const tries = crafting(state).partTries[place] ?? 0;
  if (random < C.partDig.first + C.partDig.step * tries) {
    const { [place]: _, ...rest } = crafting(state).partTries;
    return { state: withCrafting(addPart(state, part), { partTries: rest }), find: { kind: 'part', id: part, count: 1, stars: 3 } };
  }
  return { state: withCrafting(state, { partTries: { ...crafting(state).partTries, [place]: tries + 1 } }) };
}

// ---- The workbench ----

// A room piece is made once; the rest as often as you like.
export function madeAlready(state: GameState, p: Pattern): boolean {
  const [kind, id] = p.makes.split(':');
  return kind === 'furniture' && ownsDecor(state, 'furniture', id);
}

export type CraftBlock = 'noPattern' | 'made' | 'short';

export function craft(state: GameState, patternId: string): { state: GameState; blocked?: CraftBlock; pattern?: Pattern } {
  const p = getPattern(patternId);
  if (!p) return { state, blocked: 'noPattern' };
  if (madeAlready(state, p)) return { state, blocked: 'made' };
  if (!haveMaterials(state, p.needs)) return { state, blocked: 'short' };
  let s = useMaterials(state, p.needs);
  const [kind, id] = p.makes.split(':');
  const n = p.count ?? 1;
  if (kind === 'furniture') {
    s = { ...s, inventory: { ...s.inventory, decor: [...s.inventory.decor, decorKey('furniture', id)] } };
  } else {
    const key = kind === 'charm' ? `charm:${id}` : id;
    s = { ...s, inventory: { ...s.inventory, supplies: { ...s.inventory.supplies, [key]: (s.inventory.supplies[key] ?? 0) + n } } };
  }
  const made = crafting(s).made.includes(p.id) ? crafting(s).made : [...crafting(s).made, p.id];
  return { state: withCrafting(s, { made }), pattern: p };
}

// ---- Projects ----

export const progressOf = (state: GameState, id: string): { built: number; until: number } =>
  crafting(state).projects[id] ?? { built: 0, until: 0 };
export const projectOpen = (state: GameState, p: Project): boolean => hasPart(state, p.part);
export const projectDone = (state: GameState, id: string): boolean => {
  const p = getProject(id);
  return !!p && progressOf(state, id).built >= p.stages.length;
};
export const building = (state: GameState, id: string): boolean => progressOf(state, id).until > 0;

export type BuildBlock = 'locked' | 'done' | 'building' | 'short' | 'notEnoughGold';

// Starts building a project's next stage: its materials and gold are used
// up now, and it's done `hours` later.
export function buildStage(state: GameState, now: number, id: string): { state: GameState; blocked?: BuildBlock } {
  const p = getProject(id);
  if (!p || !projectOpen(state, p)) return { state, blocked: 'locked' };
  const prog = progressOf(state, id);
  if (prog.built >= p.stages.length) return { state, blocked: 'done' };
  if (prog.until > 0) return { state, blocked: 'building' };
  const stage = p.stages[prog.built];
  if (!haveMaterials(state, stage.needs)) return { state, blocked: 'short' };
  if (state.gold < stage.gold) return { state, blocked: 'notEnoughGold' };
  const s = useMaterials({ ...state, gold: state.gold - stage.gold }, stage.needs);
  return { state: withCrafting(s, { projects: { ...crafting(s).projects, [id]: { built: prog.built, until: now + stage.hours * HOUR } } }) };
}

// Catches projects up to time `t` (from simulate): stages that are done
// get built (the windmill's last one adds the mill to the kitchen), and
// a finished beehive gives its honey and beeswax once each new day.
export function stepCrafting(state: GameState, t: number): GameState {
  if (!state.crafting) return state;
  let s = state;
  for (const p of PROJECTS) {
    const prog = progressOf(s, p.id);
    if (!prog.until || t < prog.until) continue;
    const built = prog.built + 1;
    const done = built >= p.stages.length;
    s = withCrafting(s, { projects: { ...crafting(s).projects, [p.id]: { built, until: 0 } } });
    if (done && p.gives === 'mill' && !s.kitchen.includes('mill')) s = { ...s, kitchen: [...s.kitchen, 'mill'] };
    s = logMessage(s, { kind: 'built', at: prog.until, project: p.id, stage: built - 1, done });
  }
  const hive = PROJECTS.find((p) => p.gives === 'hive');
  const day = localDay(t);
  if (hive && projectDone(s, hive.id) && crafting(s).hiveDay !== day) {
    const food = { ...s.inventory.food, honey: (s.inventory.food.honey ?? 0) + C.hive.honey };
    s = addMaterial({ ...s, inventory: { ...s.inventory, food } }, 'beeswax', C.hive.beeswax);
    s = withCrafting(s, { hiveDay: day });
  }
  return s;
}

// Hours less Percy rests after a courier trip, once his perch is built.
export const perchRestOff = (state: GameState): number => (PROJECTS.some((p) => p.gives === 'perch' && projectDone(state, p.id)) ? C.perchRestOff : 0);
