// The Messages page: Percy's orders and what came of them, plus the big
// moments (hatching, growing up, new things to try), newest first.

import { CONFIG } from './config';
import type { GameState, Message } from './state';

// Adds a message to the list, newest first, keeping only the latest ones.
// It goes below any message from the same moment, so things that happen
// together read in the order they happened (a pickup that came due while
// you were away goes below newer news).
export function logMessage(state: GameState, message: Message): GameState {
  const at = state.messages.findIndex((m) => m.at < message.at);
  const messages = [...state.messages];
  messages.splice(at < 0 ? messages.length : at, 0, message);
  return { ...state, messages: messages.slice(0, CONFIG.messagesKept) };
}

// Messages from Percy that came in since the page was last opened. They
// put a "new" dot on the menu; the other messages were already shown as
// they happened.
export function unreadMail(state: GameState): number {
  return state.messages.filter((m) => (m.kind === 'order' || m.kind === 'pickup') && m.at > state.messagesSeenAt).length;
}

export function markMessagesSeen(state: GameState, now: number): GameState {
  return { ...state, messagesSeenAt: now };
}
