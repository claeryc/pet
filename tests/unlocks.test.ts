import { describe, expect, it } from 'vitest';
import { createNewGame } from '../src/game/state';
import { feed } from '../src/game/actions';
import { land } from '../src/game/fishing';
import { isNew, isUnlocked, markSeen, updateProgress } from '../src/game/unlocks';
import { newTeen } from './helpers';

const START = 1_700_000_000_000;

describe('menus that open up as you play', () => {
  it('a brand new egg has nothing extra open', () => {
    const s = updateProgress(createNewGame(START)).state;
    expect(s.unlocked).toEqual([]);
    expect(isUnlocked(s, 'shop')).toBe(false);
  });

  it('the Shop and the Garden open once the egg hatches, with a "new" dot until seen', () => {
    const { state, unlocked } = updateProgress(newTeen(START));
    expect(unlocked).toEqual(['shop', 'garden', 'messages', 'journeys']);
    expect(isNew(state, 'garden')).toBe(true);
    expect(isNew(state, 'shop')).toBe(true);
    expect(isNew(markSeen(state, 'shop'), 'shop')).toBe(false);
    // Already open: not reported again.
    expect(updateProgress(state).unlocked).toEqual([]);
  });

  it('cooking opens after the first catch and stays open after eating it', () => {
    let s = updateProgress(newTeen(START)).state;
    s = land(s, 'perfect', 0, 0).state;
    const result = updateProgress(s);
    expect(result.unlocked).toEqual(['cooking', 'delivery']);
    const eaten = { ...result.state, inventory: { ...result.state.inventory, food: {} } };
    expect(isUnlocked(updateProgress(eaten).state, 'cooking')).toBe(true);
  });

  it('a grown-up pet goes in the Collection and opens it and the Family Tree', () => {
    const s = newTeen(START);
    s.pet.stage = 'adult';
    s.pet.character = 'pebblit';
    s.pet.variant = 'amber';
    const { state, unlocked } = updateProgress(s);
    expect(state.charactersFound).toEqual(['pebblit:amber']);
    expect(unlocked).toEqual(expect.arrayContaining(['collection', 'familyTree']));
  });

  it('the testing switch shows everything', () => {
    const s = { ...createNewGame(START), showAllMenus: true };
    expect(isUnlocked(s, 'familyTree')).toBe(true);
  });
});

describe('progress the menus use', () => {
  it('remembers foods fed, most recent first', () => {
    let s = newTeen(START);
    s = feed(s, START, 'riceBall').state;
    s = feed(s, START, 'strawberry').state;
    s = feed(s, START, 'riceBall').state;
    expect(s.recentFoods).toEqual(['riceBall', 'strawberry']);
  });

  it('remembers each kind of fish caught once', () => {
    let s = newTeen(START);
    s = land(s, 'perfect', 0, 0).state;
    s = land(s, 'perfect', 0, 0).state;
    expect(s.caught).toEqual(['shrimp']);
  });
});
