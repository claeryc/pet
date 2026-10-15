import { describe, expect, it } from 'vitest';
import { simulate } from '../src/game/simulate';
import { createNewGame } from '../src/game/state';
import { feed, growNow, toggleLights } from '../src/game/actions';
import { CONFIG } from '../src/game/config';
import { CHARACTERS, chooseCharacter, getCharacter, rollStars, sheetFor } from '../src/game/growth';

const HOUR = 3_600_000;
const START = new Date(2026, 0, 1, 10, 0).getTime();
const { egg, baby, teen } = CONFIG.growth.stageHours;

describe('life stages', () => {
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
    expect(sheetFor(s.pet)).toBe('baby');
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
    expect(new Set(picked.map((c) => c.theme)).size).toBe(new Set(CHARACTERS.map((c) => c.theme)).size);
  });

  it('gives colour variants about as often as their chance', () => {
    const pebblits = ids.map((id) => chooseCharacter(10, id)).filter((r) => r.character.id === 'pebblit');
    const amber = pebblits.filter((r) => r.variant?.id === 'amber').length / pebblits.length;
    expect(amber).toBeCloseTo(0.25, 1);
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
