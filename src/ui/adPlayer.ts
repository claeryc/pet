// The stand-in ad (see src/ads.ts): a dark box over the whole screen
// where a real network's video would play, counting down for a few
// seconds. Closing it before the end gives nothing; waiting it out
// shows a button to collect the reward. A real ad network shows its own
// player instead, so this file goes away once one is plugged in.

import { STRINGS } from '../strings';
import type { AdRequest } from '../ads';

// How long the pretend ad runs, in seconds.
const AD_SECONDS = 5;

export function createAdPlayer(root: HTMLElement): (request: AdRequest) => Promise<boolean> {
  const S = STRINGS.ads;
  return (request) => new Promise<boolean>((resolve) => {
    const backdrop = document.createElement('div');
    backdrop.className = 'ad-backdrop';
    const box = document.createElement('div');
    box.className = 'ad-box';
    box.setAttribute('role', 'dialog');
    box.setAttribute('aria-modal', 'true');
    box.setAttribute('aria-label', S.playerLabel);
    const tag = document.createElement('span');
    tag.className = 'ad-tag';
    tag.textContent = request.personalised ? S.tag : S.tagPlain;
    const close = document.createElement('button');
    close.className = 'ad-close';
    close.setAttribute('aria-label', S.close);
    close.textContent = '✕';
    const screen = document.createElement('div');
    screen.className = 'ad-screen';
    screen.textContent = S.standIn;
    const bar = document.createElement('div');
    bar.className = 'ad-bar';
    const fill = document.createElement('i');
    bar.append(fill);
    const note = document.createElement('p');
    note.className = 'ad-note';
    note.setAttribute('aria-live', 'polite');
    const collect = document.createElement('button');
    collect.className = 'ad-collect';
    collect.textContent = S.collect;
    collect.hidden = true;
    box.append(tag, close, screen, bar, note, collect);
    backdrop.append(box);
    root.append(backdrop);

    let left = AD_SECONDS;
    const tick = () => {
      note.textContent = left > 0 ? S.secondsLeft(left) : S.done;
      fill.style.width = `${((AD_SECONDS - left) / AD_SECONDS) * 100}%`;
    };
    tick();
    const timer = window.setInterval(() => {
      left -= 1;
      tick();
      if (left <= 0) {
        window.clearInterval(timer);
        collect.hidden = false;
        collect.focus();
      }
    }, 1000);
    const finish = (rewarded: boolean) => {
      window.clearInterval(timer);
      backdrop.remove();
      resolve(rewarded);
    };
    close.addEventListener('click', () => finish(left <= 0));
    collect.addEventListener('click', () => finish(true));
    close.focus();
  });
}
