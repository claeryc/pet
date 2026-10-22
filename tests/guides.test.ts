import { describe, expect, it } from 'vitest';
import { createNewGame } from '../src/game/state';
import { GUIDES, guideDue, guideOpen, guidesAlreadyKnown, markGuideRead } from '../src/game/guides';
import { updateProgress } from '../src/game/unlocks';
import { migrate, SAVE_VERSION } from '../src/storage/storage';
import { STRINGS } from '../src/strings';
import { GUIDE_PICTURES } from '../src/ui/guidePages';
import { newTeen } from './helpers';

const START = 1_700_000_000_000;

describe('"How it works" guides', () => {
  it('an egg has no guides open yet', () => {
    const s = createNewGame(START);
    expect(GUIDES.filter((id) => guideOpen(s, id))).toEqual([]);
  });

  it('opening up a part of the game makes its guide due, once', () => {
    let s = updateProgress(newTeen(START)).state;
    expect(guideDue(s, 'shop')).toBe(true);
    expect(guideDue(s, 'basics')).toBe(true);
    expect(guideDue(s, 'skills')).toBe(false); // Skills hasn't opened up
    expect(guideOpen(s, 'skills')).toBe(false);
    s = markGuideRead(s, 'shop');
    expect(guideDue(s, 'shop')).toBe(false);
    expect(guideOpen(s, 'shop')).toBe(true);
    expect(markGuideRead(s, 'shop').guidesRead).toEqual(['shop']);
  });

  it('a guide once read stays open to read', () => {
    const s = { ...createNewGame(START), guidesRead: ['skills'] };
    expect(guideOpen(s, 'skills')).toBe(true);
  });

  it('older saves count what has already opened up as read', () => {
    const teen = updateProgress(newTeen(START)).state;
    const { guidesRead: _, ...old } = teen;
    const out = migrate({ version: 19, state: old });
    expect(out.version).toBe(SAVE_VERSION);
    expect(out.state.guidesRead).toEqual(guidesAlreadyKnown(teen));
    expect(out.state.guidesRead).toContain('basics');
    expect(out.state.guidesRead).not.toContain('skills');
  });

  it('every guide has words and a picture for each page', () => {
    for (const id of GUIDES) {
      const pages = STRINGS.guide.guides[id].pages;
      expect(pages.length).toBeGreaterThan(0);
      expect(GUIDE_PICTURES[id]).toHaveLength(pages.length);
      for (const pic of GUIDE_PICTURES[id]) {
        // Strips add up to the same frame height: 270 px, less 5 px per gap.
        const tall = pic.segs.reduce((sum, [y0, y1]) => sum + y1 - y0, 0);
        expect(tall).toBe(270 - 5 * (pic.segs.length - 1));
      }
    }
  });
});
