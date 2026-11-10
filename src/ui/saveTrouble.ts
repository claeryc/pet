// The cards shown before the game starts when something stands in the way:
// a save we couldn't open, or the pet already open in another tab. They sit
// on the in-game choice box, so they look like the rest of the game.

import { STRINGS } from '../strings';
import { createChoiceBox } from './choice';

// A save from a newer build, or one we couldn't read. A copy of it is kept
// safe already. The promise only settles if the player picks "Start a new
// pet"; every other button reloads the page.
export function askAboutUnreadableSave(root: HTMLElement, kind: 'newer' | 'broken'): Promise<void> {
  const S = STRINGS.saveTrouble;
  const choice = createChoiceBox(root);
  return new Promise((resolve) => {
    const reload = () => location.reload();
    if (kind === 'newer') {
      choice.open({ title: S.newerTitle, text: S.newerText, options: [{ label: S.reload, onPick: reload }] });
      return;
    }
    const brokenCard = () => choice.open({
      title: S.brokenTitle,
      text: S.brokenText,
      options: [
        { label: S.tryAgain, onPick: reload },
        { label: S.startNew, soft: true, onPick: sure },
      ],
    });
    // Starting a new pet is the one thing here that loses the old one (the
    // backup stays), so ask once more.
    const sure = () => choice.open({
      title: S.startNewTitle,
      text: S.startNewText,
      options: [
        { label: S.startNewYes, onPick: resolve },
        { label: S.goBack, soft: true, onPick: brokenCard },
      ],
    });
    brokenCard();
  });
}
