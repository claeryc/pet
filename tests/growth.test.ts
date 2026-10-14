import { describe, expect, it } from 'vitest';
import { simulate } from '../src/game/simulate';
import { createNewGame } from '../src/game/state';
import { feed, growNow, toggleLights } from '../src/game/actions';
import { CONFIG } from '../src/game/config';
import { chooseForm, FORMS } from '../src/game/growth';

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
    expect(s.pet.formId).toBe('baby');
  });

  it('goes egg -> baby -> teen -> adult over time, even all at once', () => {
    const total = (egg + baby + teen) * HOUR + 60_000;
    const s = simulate(createNewGame(START), START + total);
    expect(s.pet.stage).toBe('adult');
    expect(FORMS.find((f) => f.id === s.pet.formId)?.stage).toBe('adult');
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

describe('choosing the adult form', () => {
  it('picks the form for the Care Score', () => {
    expect(chooseForm('adult', 90, 'a').id).toBe('sunny');
    expect(chooseForm('adult', 55, 'a').id).toBe('puffy');
    expect(chooseForm('adult', 10, 'a').id).toBe('mossy');
  });

  it('a well looked-after pet grows into the best form', () => {
    let s = createNewGame(START);
    s = growNow(growNow(s, START), START); // now a teen
    s.pet.careScore = 95;
    s = growNow(s, START);
    expect(s.pet.formId).toBe('sunny');
  });
});
