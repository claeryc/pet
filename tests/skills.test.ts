import { describe, expect, it } from 'vitest';
import { CONFIG } from '../src/game/config';
import type { FoodId } from '../src/game/actions';
import { addTally, updateBadges } from '../src/game/achievements';
import {
  TREES, carePerks, gardenPerks, keeperLevel, learn, levelInfo, nextCost, pointsInTree, pointsToSpend, rankOf,
  recipeHints, reelPerks, resetCost, resetTree, skillsIn, startingCare, updateLevel, xpToNext, type SkillId,
} from '../src/game/skills';
import { land, pickCatch, reelZones, startReel } from '../src/game/fishing';
import { emptyPlot, growPlot, rollFor, timeLeft, water } from '../src/game/garden';
import { cook } from '../src/game/cooking';
import { simulate } from '../src/game/simulate';
import { updateProgress } from '../src/game/unlocks';
import { createNewGame, type GameState, type Plot } from '../src/game/state';
import { migrate, SAVE_VERSION } from '../src/storage/storage';
import { STRINGS } from '../src/strings';
import { SKILL_ICONS } from '../src/ui/icons';
import { effectText } from '../src/ui/skills';
import { newTeen } from './helpers';

const START = new Date(2026, 0, 1, 10, 0).getTime();
const HOUR = 3_600_000;
const K = CONFIG.skills;

// A game with enough XP for `level`.
function atLevel(level: number, s: GameState = newTeen(START)): GameState {
  let xp = 0;
  for (let l = 1; l < level; l++) xp += xpToNext(l);
  return { ...s, keeper: { ...s.keeper, xp, level } };
}

function withRanks(ranks: Partial<Record<SkillId, number>>, s: GameState = newTeen(START)): GameState {
  return { ...s, keeper: { ...s.keeper, skills: { ...ranks } } };
}

describe('Keeper XP and levels', () => {
  it('starts at level 1 with nothing to spend', () => {
    const s = createNewGame(START);
    expect(keeperLevel(s)).toBe(1);
    expect(pointsToSpend(s)).toBe(0);
  });

  it('each level takes a little more XP than the last', () => {
    expect(xpToNext(1)).toBe(K.level.base + K.level.perLevel);
    expect(xpToNext(5)).toBeGreaterThan(xpToNext(4));
    expect(levelInfo(xpToNext(1) - 1)).toEqual({ level: 1, into: xpToNext(1) - 1, need: xpToNext(1) });
    expect(levelInfo(xpToNext(1) + xpToNext(2) + 3)).toEqual({ level: 3, into: 3, need: xpToNext(3) });
  });

  it('things counted for achievements give XP', () => {
    let s = newTeen(START);
    s = addTally(s, 'fish', 2);
    s = addTally(s, 'harvests');
    expect(s.keeper.xp).toBe(2 * K.xp.fish + K.xp.harvests);
  });

  it('a perfect catch gives extra XP', () => {
    const s = newTeen(START);
    const good = land(s, 'good', 0, 0).state.keeper.xp;
    const perfect = land(s, 'perfect', 0, 0).state.keeper.xp;
    expect(perfect - good).toBe(K.perfectFishXp);
  });

  it('badges give XP, once each tier', () => {
    let s = newTeen(START);
    s = { ...s, tally: { fish: CONFIG.achievements.fish[1] } }; // silver straight away
    const once = updateBadges(s).state;
    expect(once.keeper.xp).toBe(K.badgeXp.bronze + K.badgeXp.silver);
    expect(updateBadges(once).state.keeper.xp).toBe(once.keeper.xp);
  });

  it('a pet growing up gives XP by its stars, only once', () => {
    let s = newTeen(START);
    s.pet = { ...s.pet, stage: 'adult', character: 'dumpling' };
    const first = updateProgress(s).state;
    expect(first.keeper.xp).toBe(K.grownUpXp[1]);
    expect(first.keeper.grownUp).toContain(s.pet.id);
    expect(updateProgress(first).state.keeper.xp).toBe(first.keeper.xp);
  });

  it('each new level goes in Messages once', () => {
    const s = { ...newTeen(START), keeper: { ...newTeen(START).keeper, xp: xpToNext(1) + xpToNext(2) } };
    const { state, levels } = updateLevel(s);
    expect(levels).toEqual([2, 3]);
    expect(state.messages.filter((m) => m.kind === 'level')).toHaveLength(2);
    expect(updateLevel(state).levels).toEqual([]);
  });

  it('Skills opens with the first point', () => {
    expect(updateProgress(newTeen(START)).unlocked).not.toContain('skills');
    expect(updateProgress(atLevel(2)).unlocked).toContain('skills');
  });
});

describe('learning skills', () => {
  it('ranks cost 1, 2 and 3 points', () => {
    let s = atLevel(7); // 6 points
    for (const cost of [1, 2, 3]) {
      expect(nextCost(s, 'steadyHands')).toBe(cost);
      s = learn(s, 'steadyHands').state;
    }
    expect(rankOf(s, 'steadyHands')).toBe(3);
    expect(pointsToSpend(s)).toBe(0);
    expect(learn(s, 'steadyHands').blocked).toBe('maxed');
  });

  it("can't learn without enough points", () => {
    const s = learn(atLevel(3), 'headStart').state; // 2 points, 1 left
    expect(learn(s, 'headStart').blocked).toBe('noPoints');
    expect(learn(s, 'luckyLine').blocked).toBeUndefined();
  });

  it('taking a tree back is free once, then costs gold per point', () => {
    let s = learn(learn(atLevel(4), 'steadyHands').state, 'steadyHands').state; // 3 points in Fishing
    expect(resetCost(s, 'fishing')).toBe(0);
    const free = resetTree(s, 'fishing');
    expect(free.refunded).toBe(3);
    expect(pointsToSpend(free.state)).toBe(3);
    expect(free.state.gold).toBe(s.gold);

    s = learn(free.state, 'headStart').state;
    expect(resetCost(s, 'fishing')).toBe(K.resetGoldPerPoint);
    expect(resetTree({ ...s, gold: 0 }, 'fishing').blocked).toBe('notEnoughGold');
    const paid = resetTree({ ...s, gold: 500 }, 'fishing');
    expect(paid.state.gold).toBe(500 - K.resetGoldPerPoint);
    expect(pointsInTree(paid.state, 'fishing')).toBe(0);
    expect(resetTree(paid.state, 'fishing').blocked).toBe('nothingToReset');
  });

  it('only takes back the one tree', () => {
    const s = learn(learn(atLevel(3), 'steadyHands').state, 'cozyHome').state;
    const out = resetTree(s, 'fishing').state;
    expect(rankOf(out, 'cozyHome')).toBe(1);
  });
});

describe('what the skills do', () => {
  it('Steady hands widens the green stripe', () => {
    const plain = reelZones(startReel(0.5));
    const wide = reelZones(startReel(0.5, reelPerks(withRanks({ steadyHands: 2 }))));
    const width = (z: { start: number; end: number }) => z.end - z.start;
    expect(width(wide.perfect)).toBeCloseTo(width(plain.perfect) * 1.2);
  });

  it('Head start fills the meter more at the start', () => {
    expect(startReel(0.5, reelPerks(withRanks({ headStart: 3 }))).meter)
      .toBeCloseTo(CONFIG.fishing.reel.meterStart + 0.3);
  });

  it('Lucky line moves odds from shrimp to lobster', () => {
    // A roll just past the plain lobster cut-off lands lobster with the skill.
    const odds = CONFIG.fishing.catchOdds.other;
    const total = odds.shrimp + odds.salmon + odds.lobster;
    expect(pickCatch('good', 0.01, false, 0)).toBe('shrimp');
    expect(pickCatch('good', (total - odds.lobster - 1) / total, false, 0)).toBe('salmon');
    expect(pickCatch('good', (total - odds.lobster - 1) / total, false, 5)).toBe('lobster');
  });

  it('Quick sprouts makes crops grow faster', () => {
    const plot: Plot = { ...emptyPlot(), crop: 'carrot', moistUntil: START + 100 * HOUR, rollsFrom: START };
    const perks = gardenPerks(withRanks({ quickSprouts: 1 }));
    const fast = growPlot(plot, START, START + 10 * HOUR, perks);
    expect(fast.growth).toBeCloseTo(10 * HOUR * 1.08);
    expect(timeLeft(plot, START, perks)).toBeCloseTo(timeLeft(plot, START) / 1.08);
  });

  it('Hardy plants lowers the chance of getting sick', () => {
    // A luck whose first roll falls between the plain and the hardy chance.
    let luck = 0;
    for (let i = 1; i < 1000 && !luck; i++) {
      const r = rollFor(i / 1000, 0);
      if (r < CONFIG.garden.sickChance && r >= CONFIG.garden.sickChance * 0.25) luck = i / 1000;
    }
    const plot: Plot = { ...emptyPlot(), crop: 'pumpkin', moistUntil: START, rollsFrom: START, luck };
    const later = START + CONFIG.garden.dryHoursPerRoll * HOUR + 1;
    expect(growPlot(plot, START, later).sickSince).not.toBeNull();
    expect(growPlot(plot, START, later, gardenPerks(withRanks({ hardyPlants: 3 }))).sickSince).toBeNull();
  });

  it('Deep roots keeps the soil wet longer', () => {
    let s = newTeen(START);
    s.garden = [{ ...emptyPlot(), crop: 'carrot', moistUntil: START, rollsFrom: START }];
    const plain = water(s, 0, START, false, 0.5).state.garden[0].moistUntil;
    s = withRanks({ deepRoots: 2 }, s);
    expect(water(s, 0, START, false, 0.5).state.garden[0].moistUntil - plain).toBe(4 * HOUR);
  });

  it('Second helping can make 2 of a recipe', () => {
    const s = withRanks({ secondHelping: 1 }, { ...newTeen(START), inventory: { ...newTeen(START).inventory, food: { shrimp: 1 } } });
    const lucky = cook(s, ['shrimp' as FoodId], 0.05);
    const plain = cook(s, ['shrimp' as FoodId], 0.5);
    expect(!lucky.blocked && lucky.count).toBe(2);
    expect(lucky.state.inventory.food.grilledShrimp).toBe(2);
    expect(!plain.blocked && plain.count).toBe(1);
  });

  it('Waste not can give an ingredient back from a Mushy mess', () => {
    const base = newTeen(START);
    const s = withRanks({ wasteNot: 2 }, { ...base, inventory: { ...base.inventory, food: { cookie: 1, shrimp: 1 } } });
    const saved = cook(s, ['cookie', 'shrimp'] as FoodId[], 0.2);
    expect(!saved.blocked && saved.saved).toBe('cookie');
    expect(saved.state.inventory.food.cookie).toBe(1);
    const unlucky = cook(s, ['cookie', 'shrimp'] as FoodId[], 0.9);
    expect(!unlucky.blocked && unlucky.saved).toBeNull();
  });

  it("Chef's nose shows more of unknown recipes", () => {
    expect(recipeHints(newTeen(START))).toEqual({ ingredients: 1, name: false });
    expect(recipeHints(withRanks({ chefsNose: 2 }))).toEqual({ ingredients: 3, name: false });
    expect(recipeHints(withRanks({ chefsNose: 3 }))).toEqual({ ingredients: 4, name: true });
  });

  it('Gentle start raises a new egg\'s Care Score', () => {
    expect(startingCare(withRanks({ gentleStart: 3 }))).toBe(CONFIG.careScore.start + 15);
  });

  it('Cozy home slows hunger and joy, Good habits speeds up care', () => {
    const s = newTeen(START);
    s.pet.stats = { hunger: 90, happiness: 90, health: 90, energy: 90 };
    const plain = simulate(s, START + HOUR).pet;
    const skilled = simulate(withRanks({ cozyHome: 2, goodHabits: 1 }, s), START + HOUR).pet;
    expect(90 - skilled.stats.hunger).toBeCloseTo((90 - plain.stats.hunger) * 0.9);
    expect(90 - skilled.stats.happiness).toBeCloseTo((90 - plain.stats.happiness) * 0.9);
    expect(skilled.stats.energy).toBeCloseTo(plain.stats.energy);
    expect(skilled.careScore - CONFIG.careScore.start).toBeCloseTo((plain.careScore - CONFIG.careScore.start) * 1.15);
    expect(carePerks(newTeen(START))).toEqual({ decay: 1, careGain: 1 });
  });
});

describe('skills on screen', () => {
  it('every skill has a name, a picture and an effect for each rank', () => {
    for (const tree of TREES) {
      expect(STRINGS.skills.trees[tree]).toBeTruthy();
      for (const id of skillsIn(tree)) {
        expect(STRINGS.skills.names[id]).toBeTruthy();
        expect(SKILL_ICONS[id]).toContain('<svg');
        for (const rank of [1, 2, 3]) expect(effectText(id, rank)).toMatch(/\w/);
      }
    }
  });

  it('effects read the numbers from the config', () => {
    expect(effectText('steadyHands', 2)).toBe('Green stripe 20% wider');
    expect(effectText('deepRoots', 3)).toBe('Soil stays wet 6 hours longer');
  });
});

describe('save migration to skills', () => {
  it('gives back XP for what was already done', () => {
    const out = migrate({
      version: 15,
      state: {
        pet: { id: 'a', stage: 'adult', character: 'dumpling' },
        housemates: [],
        family: [{ id: 'b', character: 'dumpling', fromFriend: false, fromWild: false }, { id: 'c', character: 'dumpling', fromWild: true }],
        tally: { fish: 10 },
        badges: { fish: 'bronze' },
      },
    });
    expect(out.version).toBe(SAVE_VERSION);
    const xp = 10 * K.xp.fish + K.badgeXp.bronze + 2 * K.grownUpXp[1];
    expect(out.state.keeper.xp).toBe(xp);
    expect(out.state.keeper.grownUp).toEqual(['a', 'b']);
    expect(out.state.keeper.level).toBe(levelInfo(xp).level); // no level-up flood
    expect(out.state.keeper.skills).toEqual({});
  });
});
