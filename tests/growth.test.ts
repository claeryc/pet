import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { simulate } from '../src/game/simulate';
import { createNewGame } from '../src/game/state';
import { feed, growNow, toggleLights } from '../src/game/actions';
import { CONFIG } from '../src/game/config';
import {
  CHARACTERS,
  IN_GAME,
  LATER_PACKS,
  chooseCharacter,
  getCharacter,
  growUp,
  littleOneChances,
  rollStars,
  rollTheme,
  sheetFor,
  stageSheet,
} from '../src/game/growth';
import { newPet } from '../src/game/state';
import manifest from '../public/sprites/manifest.json';
import data from '../src/data/characters.json';

const HOUR = 3_600_000;
const START = new Date(2026, 0, 1, 10, 0).getTime();
const { egg, baby, teen } = CONFIG.growth.stageHours;

describe('life stages', () => {
  // Some of these leave the pet alone for days to watch it grow, which
  // would see it pass away from being sick so long. Passing away has its
  // own tests (passing.test.ts), so here the pet just stays sick.
  const sickness = CONFIG.sickness as { hoursBeforePassing: number };
  const passing = sickness.hoursBeforePassing;
  beforeAll(() => void (sickness.hoursBeforePassing = Infinity));
  afterAll(() => void (sickness.hoursBeforePassing = passing));

  it('starts as an egg that needs nothing', () => {
    const s = createNewGame(START);
    expect(s.pet.stage).toBe('egg');
    const later = simulate(s, START + (egg * HOUR) / 2);
    expect(later.pet.stage).toBe('egg');
    expect(later.pet.stats).toEqual(s.pet.stats); // no decay inside the egg
    expect(later.pet.condition).toBe('healthy');
  });

  it('cannot be fed, played with or put to bed as an egg', () => {
    const s = createNewGame(START);
    expect(feed(s, START).blocked).toBe('egg');
    expect(toggleLights(s, START).blocked).toBe('egg');
  });

  it('hatches into a baby when the egg timer runs out', () => {
    const s = simulate(createNewGame(START), START + egg * HOUR + 60_000);
    expect(s.pet.stage).toBe('baby');
    expect(s.pet.character).toBeNull();
    expect(sheetFor(s.pet)).toBe(`baby-${s.pet.destinedTheme}`);
  });

  it('hatches after 90 seconds, right on time between ticks', () => {
    expect(egg * HOUR).toBe(90_000);
    const s = createNewGame(START);
    expect(simulate(s, START + 89_000).pet.stage).toBe('egg');
    const hatched = simulate(s, START + 90_000);
    expect(hatched.pet.stage).toBe('baby');
    expect(hatched.pet.stageStartedAt).toBe(START + 90_000);
    // It keeps counting from the hatch, not from the next whole minute.
    const later = simulate(simulate(hatched, START + 100_000), START + 150_000);
    expect(later.pet.stage).toBe('baby');
    expect(later.pet.stageStartedAt).toBe(START + 90_000);
  });

  it('goes egg -> baby -> teen -> adult over time, even all at once', () => {
    const total = (egg + baby + teen) * HOUR + 60_000;
    const s = simulate(createNewGame(START), START + total);
    expect(s.pet.stage).toBe('adult');
    expect(getCharacter(s.pet.character)).toBeDefined();
  });

  it('never skips a stage', () => {
    let s = createNewGame(START);
    const seen = [s.pet.stage];
    for (let t = START; t < START + (egg + baby + teen + 1) * HOUR; t += HOUR / 2) {
      s = simulate(s, t);
      if (seen[seen.length - 1] !== s.pet.stage) seen.push(s.pet.stage);
    }
    expect(seen).toEqual(['egg', 'baby', 'teen', 'adult']);
  });

  it('"Grow up now" moves straight to the next stage', () => {
    let s = createNewGame(START);
    s = growNow(s, START);
    expect(s.pet.stage).toBe('baby');
    s = growNow(s, START);
    expect(s.pet.stage).toBe('teen');
    s = growNow(s, START);
    expect(s.pet.stage).toBe('adult');
    expect(growNow(s, START).pet.stage).toBe('adult');
  });
});

describe('choosing the adult character', () => {
  const ids = Array.from({ length: 4000 }, (_, i) => `pet-${i}`);
  const share = (care: number, stars: number) =>
    ids.filter((id) => rollStars(care, id) === stars).length / ids.length;

  it('rolls rarity with the odds from the config', () => {
    for (const band of CONFIG.rarity) {
      for (const stars of [1, 2, 3] as const) {
        expect(share(band.minCare, stars)).toBeCloseTo(band.odds[stars] / 100, 1);
      }
    }
  });

  it('better care means more rare characters', () => {
    expect(share(90, 3)).toBeGreaterThan(share(60, 3));
    expect(share(60, 3)).toBeGreaterThan(share(30, 3));
    expect(share(10, 3)).toBe(0);
  });

  it('always gives the same pet the same character', () => {
    expect(chooseCharacter(75, 'abc')).toEqual(chooseCharacter(75, 'abc'));
  });

  it('only picks rarities that exist, and every theme can appear', () => {
    const picked = ids.map((id) => chooseCharacter(90, id).character);
    for (const c of picked) expect(CHARACTERS.filter((x) => x.stars === c.stars).length).toBeGreaterThan(0);
    expect(new Set(picked.map((c) => c.theme)).size).toBe(new Set(IN_GAME.map((c) => c.theme)).size);
    for (const c of picked) expect(LATER_PACKS).not.toContain(c.theme);
  });

  it('gives colour variants about as often as their chance', () => {
    const dumpling = CHARACTERS.find((c) => c.id === 'dumpling')!;
    dumpling.variants = [{ id: 'matcha', name: 'Matcha', sheet: 'dumpling', chance: 25 }];
    try {
      const dumplings = ids.map((id) => chooseCharacter(10, id)).filter((r) => r.character.id === 'dumpling');
      const matcha = dumplings.filter((r) => r.variant?.id === 'matcha').length / dumplings.length;
      expect(matcha).toBeCloseTo(0.25, 1);
    } finally {
      delete dumpling.variants;
    }
  });

  describe('little ones of two 3-star parents', () => {
    const threeStars = CHARACTERS.filter((c) => c.stars === 3).slice(0, 2);
    const parents = threeStars.map((c) => ({ character: c.id, variant: null }));
    const shareOf = (care: number, stars: number, looks = parents) =>
      ids.filter((id) => rollStars(care, id, looks) === stars).length / ids.length;

    it('roll with the 3-star parents odds from the config', () => {
      for (const band of CONFIG.rarityStarParents)
        for (const stars of [1, 2, 3] as const)
          expect(shareOf(band.minCare, stars)).toBeCloseTo(band.odds[stars] / 100, 1);
    });

    it('never grow into a 1-star character, even with poor care', () => {
      expect(shareOf(0, 1)).toBe(0);
      expect(shareOf(0, 3)).toBeGreaterThan(0);
    });

    it('only get the bonus when both parents are 3 stars', () => {
      const oneStar = CHARACTERS.find((c) => c.stars === 1)!;
      const mixed = [parents[0], { character: oneStar.id, variant: null }];
      expect(shareOf(0, 1, mixed)).toBeCloseTo(CONFIG.rarity[CONFIG.rarity.length - 1].odds[1] / 100, 1);
      expect(shareOf(0, 1, [parents[0]])).toBeGreaterThan(0);
    });
  });

  it('a grown-up pet keeps its character and uses its sheet', () => {
    let s = createNewGame(START);
    s = growNow(growNow(growNow(s, START), START), START);
    const character = getCharacter(s.pet.character)!;
    expect(sheetFor(s.pet)).toBe(
      character.variants?.find((v) => v.id === s.pet.variant)?.sheet ?? character.sheet,
    );
    expect(simulate(s, START + 48 * HOUR).pet.character).toBe(character.id);
  });
});

describe('the theme is rolled when the egg is made', () => {
  const themes = [...new Set(IN_GAME.map((c) => c.theme))];

  it('every in-game theme has its own egg, baby and teen colours', () => {
    expect([...data.stageThemes].sort()).toEqual([...themes].sort());
    for (const theme of themes)
      for (const stage of ['egg', 'baby', 'teen'] as const) expect(manifest.sheets).toHaveProperty(stageSheet(stage, theme));
  });

  it('shows its theme as an egg, baby and teen, then grows into that theme', () => {
    for (let i = 0; i < 40; i++) {
      const pet = newPet(START);
      const theme = pet.destinedTheme!;
      expect(themes).toContain(theme);
      expect(sheetFor(pet)).toBe(`egg-${theme}`);
      growUp(pet, START);
      expect(sheetFor(pet)).toBe(`baby-${theme}`);
      growUp(pet, START);
      expect(sheetFor(pet)).toBe(`teen-${theme}`);
      growUp(pet, START);
      expect(getCharacter(pet.character)!.theme).toBe(theme);
    }
  });

  it('gives a first pet every theme about evenly', () => {
    const counts = new Map<string, number>();
    for (let i = 0; i < 4000; i++) {
      const t = rollTheme(`pet-${i}`);
      counts.set(t, (counts.get(t) ?? 0) + 1);
    }
    for (const t of themes) expect(counts.get(t)! / 4000).toBeCloseTo(1 / themes.length, 1);
  });

  it('gives a little one the same odds as rolling everything at grow-up', () => {
    const family = { themes: ['ocean', 'starry'], carriedThemes: ['nature'], variants: [] };
    const looks = [
      { character: 'jellop', variant: null },
      { character: 'cloudlet', variant: null },
    ];
    const n = 6000;
    const counts = new Map<string, number>();
    for (let i = 0; i < n; i++) {
      const id = `little-${i}`;
      const { character } = chooseCharacter(60, id, family, looks, rollTheme(id, family));
      counts.set(character.id, (counts.get(character.id) ?? 0) + 1);
    }
    for (const [character, chance] of littleOneChances(60, family, looks))
      expect(Math.abs((counts.get(character.id) ?? 0) / n - chance)).toBeLessThan(0.02);
  });

  it('a little one only gets its parents\' themes (or one they carry)', () => {
    const pet = newPet(START, { generation: 2, parents: ['a', 'b'], themes: ['bakery'], parentLooks: [] });
    expect(pet.destinedTheme).toBe('bakery');
  });
});
