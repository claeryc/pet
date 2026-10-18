// Names and the Family Tree.
//
// The pet is named when its egg hatches (and can be renamed later from the
// Family Tree). The player can add their own name in Settings, so the tree
// can say who raised each pet.
//
// The tree is saved as a flat list of earlier pets (GameState.family), each
// with a generation number and the ids of its parents, plus the pet you have
// now (and any other pet sharing its room). That's enough for many
// generations and for parents from other players. A pet joins the list
// when it retires, and a friend when it has a little one with your pet
// (see src/game/friends.ts).

import type { FamilyMember, GameState, Pet } from './state';
import type { Stage } from './growth';

export const NAME_MAX = 12; // letters in a pet's name
export const OWNER_MAX = 16; // letters in the player's name

// Tidies a typed name: no spaces at the ends or doubled up inside, and no
// longer than `max` letters (emoji count as one). '' if nothing is left.
export function cleanName(raw: string, max = NAME_MAX): string {
  const squeezed = raw.replace(/\s+/g, ' ').trim();
  return Array.from(squeezed).slice(0, max).join('').trim();
}

// A name from the list that isn't `current`. `roll` is a number from 0 to 1
// (Math.random() in the game, fixed in tests).
export function suggestName(names: readonly string[], roll: number, current = ''): string {
  const options = names.filter((n) => n !== current);
  return options[Math.floor(roll * options.length) % options.length] ?? names[0];
}

export type NameResult = { state: GameState; blocked?: 'empty' };

// Names (or renames) the pet. An empty name is refused.
export function namePet(state: GameState, raw: string): NameResult {
  const name = cleanName(raw);
  if (!name) return { state, blocked: 'empty' };
  return { state: { ...state, pet: { ...state.pet, name, named: true } } };
}

// The pet has hatched but the player hasn't picked its name yet.
export function needsName(state: GameState): boolean {
  return state.pet.stage !== 'egg' && !state.pet.named;
}

// The player's own name. Empty is fine: it's optional.
export function setOwner(state: GameState, raw: string): GameState {
  return { ...state, owner: cleanName(raw, OWNER_MAX) };
}

// One pet as the tree shows it.
export interface TreeMember extends FamilyMember {
  stage: Stage; // earlier generations are shown as they were when grown up
  current: boolean; // the pet you're looking after now
  home: boolean; // in your room (the pet you're looking after, or another)
}

export interface Generation {
  number: number;
  members: TreeMember[];
}

// How a pet is remembered in the tree once it retires.
export function rememberPet(pet: Pet, owner: string): FamilyMember {
  return {
    id: pet.id,
    name: pet.name,
    owner,
    fromFriend: false,
    fromWild: false,
    bornAt: pet.bornAt,
    character: pet.character,
    variant: pet.variant,
    generation: pet.generation,
    parents: [...pet.parents],
  };
}

// Every generation, oldest first, with the pets you have now in theirs.
export function familyGenerations(state: GameState): Generation[] {
  const atHome = (pet: Pet, current: boolean): TreeMember =>
    ({ ...rememberPet(pet, state.owner), stage: pet.stage, current, home: true });
  const members: TreeMember[] = [
    ...state.family.map((m) => ({ ...m, stage: 'adult' as Stage, current: false, home: false })),
    atHome(state.pet, true),
    ...state.housemates.map((p) => atHome(p, false)),
  ];
  const numbers = [...new Set(members.map((m) => m.generation))].sort((a, b) => a - b);
  return numbers.map((number) => ({
    number,
    // Oldest first within a generation, so the order never shuffles.
    members: members.filter((m) => m.generation === number).sort((a, b) => a.bornAt - b.bornAt),
  }));
}

// Whole days between two moments (0 on the first day).
export function ageInDays(bornAt: number, now: number): number {
  return Math.max(0, Math.floor((now - bornAt) / 86_400_000));
}

// Everyone in the tree, the pet you have now included.
function allMembers(state: GameState): TreeMember[] {
  return familyGenerations(state).flatMap((g) => g.members);
}

// What the Tree view shows around one pet: its parents and grandparents
// above it, and its brothers and sisters and its little ones below. A
// parent who isn't in the saved family shows as null (an empty spot).
export interface Pedigree {
  focus: TreeMember;
  parents: (TreeMember | null)[]; // [] for the first of the family
  grandparents: (TreeMember | null)[][]; // each parent's parents, same order
  siblings: TreeMember[]; // same parents, oldest first
  children: TreeMember[];
}

const sameParents = (a: string[], b: string[]) =>
  a.length > 0 && a.length === b.length && [...a].sort().join() === [...b].sort().join();

// The tree around the pet with id `focusId` (the pet you have now if that
// id isn't in the family).
export function pedigree(state: GameState, focusId: string | null): Pedigree {
  const everyone = allMembers(state);
  const byId = new Map(everyone.map((m) => [m.id, m]));
  const focus = (focusId && byId.get(focusId)) || everyone.find((m) => m.current)!;
  const parentsOf = (m: TreeMember | null) => (m ? m.parents.map((id) => byId.get(id) ?? null) : []);
  const parents = parentsOf(focus);
  return {
    focus,
    parents,
    grandparents: parents.map(parentsOf),
    siblings: everyone.filter((m) => m.id !== focus.id && sameParents(m.parents, focus.parents)),
    children: everyone.filter((m) => m.parents.includes(focus.id)),
  };
}
