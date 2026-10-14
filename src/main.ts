// The starting point of the app. It wires the pieces together:
//   game logic (src/game)  <-  this file  ->  drawing (src/render), screens (src/ui)
//                                  |
//                            saving (src/storage)

import { CONFIG } from './game/config';
import { createNewGame, type GameState } from './game/state';
import { simulate } from './game/simulate';
import { feed, play } from './game/actions';
import { getMood } from './game/stats';
import { clearSave, loadGame, saveGame } from './storage/storage';
import { setupCanvas, drawRoom } from './render/canvas';
import { makePlaceholderSheet } from './render/sprites';
import { createHomeScreen } from './ui/home';
import { STRINGS } from './strings';

const root = document.getElementById('app')!;

// Load the saved game (or start a new one) and catch it up to right now.
let state: GameState = loadGame() ?? createNewGame(Date.now());
state = simulate(state, Date.now());
saveGame(state);

// Replaces the current state, saves it and refreshes the screen.
function setState(next: GameState): void {
  state = next;
  saveGame(state);
  home.update(state);
}

const home = createHomeScreen(root, {
  onFeed: () => setState(feed(state, Date.now())),
  onPlay: () => setState(play(state, Date.now())),
  onReset: () => {
    if (confirm(STRINGS.confirmReset)) {
      clearSave();
      setState(createNewGame(Date.now()));
    }
  },
});
home.update(state);

// Draw the pet every animation frame (about 60 times a second).
const ctx = setupCanvas(home.canvas);
const sheet = makePlaceholderSheet();
function render(timeMs: number): void {
  const animation = getMood(state.pet.stats) === 'sad' ? 'sad' : 'idle';
  drawRoom(ctx, sheet, animation, timeMs);
  requestAnimationFrame(render);
}
requestAnimationFrame(render);

// Keep the world ticking while the game is open...
setInterval(() => setState(simulate(state, Date.now())), CONFIG.liveUpdateSeconds * 1000);

// ...and catch up straight away when you come back to the tab or app.
document.addEventListener('visibilitychange', () => {
  if (document.visibilityState === 'visible') setState(simulate(state, Date.now()));
});
