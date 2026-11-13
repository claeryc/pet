// Only one tab (or the installed app) looks after the pet at a time.
// Otherwise every open copy ticks and saves, and the last one to save
// quietly undoes whatever you did in the others.
//
// The tab that has the pet holds a Web Lock for as long as it's open. A new
// tab that can't get it shows "open in another tab"; "Use it here" reloads
// and takes the lock over, and the old tab stops saving. Browsers without
// Web Locks fall back to a hello/here handshake over a BroadcastChannel.

import { blockSaves } from './storage/storage';

const LOCK_NAME = 'cozy-pixel-pet';
// Set just before "Use it here" reloads, so the reloaded tab takes over.
const TAKE_OVER_KEY = 'cozy-pixel-pet-take-over';
// How long to wait for another tab to answer the fallback hello (ms).
const HELLO_WAIT_MS = 300;

export interface TabClaim {
  held: boolean;
  // Called once if another tab takes the pet over later (straight away if
  // that already happened). Saves are blocked by then.
  onLost: (handler: () => void) => void;
}

// Reloads this tab and takes the pet over from whichever tab has it.
export function takeOverHere(): void {
  try {
    sessionStorage.setItem(TAKE_OVER_KEY, '1');
  } catch {
    // Without sessionStorage the reloaded tab just asks politely again.
  }
  location.reload();
}

function wantsTakeOver(): boolean {
  try {
    const yes = sessionStorage.getItem(TAKE_OVER_KEY) === '1';
    sessionStorage.removeItem(TAKE_OVER_KEY);
    return yes;
  } catch {
    return false;
  }
}

function makeClaim(held: boolean): { claim: TabClaim; lose: () => void } {
  let lost = false;
  let handler: (() => void) | null = null;
  return {
    claim: {
      held,
      onLost(h) {
        handler = h;
        if (lost) h();
      },
    },
    lose() {
      if (lost) return;
      lost = true;
      blockSaves();
      handler?.();
    },
  };
}

export function claimTab(): Promise<TabClaim> {
  const takeOver = wantsTakeOver();
  if (typeof navigator !== 'undefined' && 'locks' in navigator) return claimWithLock(takeOver);
  if (typeof BroadcastChannel !== 'undefined') return claimWithChannel(takeOver);
  return Promise.resolve(makeClaim(true).claim);
}

function claimWithLock(takeOver: boolean): Promise<TabClaim> {
  return new Promise((resolve) => {
    let mine: ReturnType<typeof makeClaim> | null = null;
    navigator.locks
      .request(LOCK_NAME, takeOver ? { steal: true } : { ifAvailable: true }, (lock) => {
        if (!lock) {
          resolve(makeClaim(false).claim);
          return undefined;
        }
        mine = makeClaim(true);
        resolve(mine.claim);
        return new Promise<void>(() => {}); // held for the life of the page
      })
      // Rejects (AbortError) when another tab steals the lock.
      .catch(() => mine?.lose());
  });
}

function claimWithChannel(takeOver: boolean): Promise<TabClaim> {
  const channel = new BroadcastChannel(LOCK_NAME);
  return new Promise((resolve) => {
    const settle = (held: boolean) => {
      const c = makeClaim(held);
      if (!held) {
        channel.close();
        resolve(c.claim);
        return;
      }
      // While this tab has the pet: answer newcomers, and let go when one
      // takes over.
      channel.onmessage = (e) => {
        if (e.data === 'hello') channel.postMessage('here');
        else if (e.data === 'take') {
          channel.close();
          c.lose();
        }
      };
      resolve(c.claim);
    };
    if (takeOver) {
      channel.postMessage('take');
      settle(true);
      return;
    }
    const timer = setTimeout(() => settle(true), HELLO_WAIT_MS);
    channel.onmessage = (e) => {
      if (e.data !== 'here') return;
      clearTimeout(timer);
      channel.onmessage = null;
      settle(false);
    };
    channel.postMessage('hello');
  });
}
