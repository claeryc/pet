import { describe, expect, it } from 'vitest';
import { newTeen } from './helpers';
import { CONFIG } from '../src/game/config';
import { openBackpack, PLACES } from '../src/game/journeys';
import { retire } from '../src/game/friends';
import { makeStar } from '../src/game/fragments';
import { RECIPES } from '../src/game/cooking';
import { MILESTONES, updateMilestones } from '../src/game/milestones';
import { updateProgress } from '../src/game/unlocks';
import { migrate, SAVE_VERSION } from '../src/storage/storage';
import { newPet, type Find, type GameState, type Rarity } from '../src/game/state';

const HOUR = 3_600_000;
const START = new Date(2026, 0, 1, 9, 0).getTime();

// A pet home from a trip with `finds` in its backpack.
function home(rarity: Rarity, finds: Find[], extra: { early?: boolean; with?: string } = {}): GameState {
  const s = newTeen(START);
  s.pet.trip = {
    place: 'market', rarity, startedAt: START, endsAt: START + HOUR, from: { hunger: 80, energy: 80 },
    to: { hunger: 70, energy: 70 }, joy: 0, finds, percy: 'none', charm: null, with: extra.with ?? null,
    backAt: START + HOUR, early: extra.early ?? false,
  };
  return s;
}
const gold = (stars: number): Find => ({ kind: 'gold', id: '', count: 5, stars });

describe('journey badges', () => {
  it('the first finished journey earns Traveller bronze ("First steps")', () => {
    const s = home('common', [gold(1)]);
    const progress = updateProgress(openBackpack(s, s.pet.id).state);
    expect(progress.badges).toContainEqual({ id: 'journeys', tier: 'bronze' });
  });

  it('counts 3-star finds, Adventures and trips together', () => {
    const s = home('epic', [gold(1), gold(3)], { with: 'other' });
    const out = openBackpack(s, s.pet.id).state;
    expect(out.tally).toMatchObject({ journeys: 1, epicFinds: 1, adventures: 1, together: 1 });
    const progress = updateProgress(out);
    expect(progress.badges.map((b) => b.id)).toEqual(expect.arrayContaining(['journeys', 'epicFinds', 'adventures']));
    expect(progress.milestones).toContain('travelBuddies');
  });

  it('a trip called home early still counts its 3-star find, but nothing else', () => {
    const s = home('epic', [gold(3)], { early: true, with: 'other' });
    const out = openBackpack(s, s.pet.id).state;
    expect(out.tally.epicFinds).toBe(1);
    expect(out.tally.journeys ?? 0).toBe(0);
    expect(out.tally.adventures ?? 0).toBe(0);
    expect(out.tally.together ?? 0).toBe(0);
  });
});

describe('milestones', () => {
  it('each has a name, a goal and a medal', async () => {
    const { STRINGS } = await import('../src/strings');
    for (const id of MILESTONES) {
      expect(STRINGS.milestones.names[id]).toBeTruthy();
      expect(STRINGS.milestones.goals[id]).toBeTruthy();
    }
  });

  it('are worked out from the game: places, characters, recipes and fish', () => {
    const s = newTeen(START);
    expect(updateMilestones(s).earned).toEqual([]);
    for (const p of PLACES) s.journeys.journal[p.id] = { trips: 1, postcards: [], found: [] };
    s.charactersFound = ['dumpling', 'starwisp'];
    s.recipesFound = RECIPES.map((r) => r.id);
    s.caught = Object.keys(CONFIG.fishing.catchOdds.other);
    const out = updateMilestones(s);
    expect(out.earned).toEqual(['explorer', 'threeStar', 'allRecipes', 'allFish']);
    expect(out.state.messages.filter((m) => m.kind === 'milestone')).toHaveLength(4);
    expect(out.state.keeper.xp).toBe(4 * CONFIG.skills.milestoneXp);
    // Handed out once.
    expect(updateMilestones(out.state).earned).toEqual([]);
  });

  it('retiring counts for Family Tree, but saying goodbye to a pet that passed away doesn\'t', () => {
    const s = newTeen(START);
    const other = newPet(START);
    s.housemates = [other];
    expect(retire(s, other.id).tally.retired).toBe(1);
    const passed = { ...s, pet: { ...s.pet, condition: 'passed' as const } };
    expect(retire(passed, s.pet.id).tally.retired ?? 0).toBe(0);
  });

  it('making a Revival Star from fragments counts for Star Maker', () => {
    const s = newTeen(START);
    s.fragments = { ...s.fragments, pieces: CONFIG.revival.fragments.perStar };
    const made = makeStar(s).state;
    expect(updateMilestones(made).earned).toEqual(['starMaker']);
  });
});

describe('save upgrade to v23', () => {
  it('starts with no milestones and fills in Adventures and gold orders it can tell', () => {
    const out = migrate({
      version: 22,
      state: {
        tally: { journeys: 3 },
        journeys: { journal: { market: { trips: 2, best: 'epic' }, woods: { trips: 1, best: 'rare' } } },
        messages: [{ kind: 'pickup', tier: 'gold' }, { kind: 'pickup', tier: 'silver' }],
      },
    } as never);
    expect(out.version).toBe(SAVE_VERSION);
    expect(out.state.milestones).toEqual([]);
    expect(out.state.tally).toEqual({ journeys: 3, adventures: 1, goldOrders: 1 });
  });
});
