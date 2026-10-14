// The starting point of the app. It wires the pieces together:
//   game logic (src/game)  <-  this file  ->  drawing (src/render), screens (src/ui)
//                                  |
//                            saving (src/storage)

import { CONFIG } from './game/config';
import { createNewGame, type GameState } from './game/state';
import { simulate } from './game/simulate';
import {
  fastForward,
  feed,
  giveMedicine,
  play,
  toggleLights,
  type ActionResult,
} from './game/actions';
import { getLook, isNight } from './game/stats';
import { clearSave, loadGame, saveGame } from './storage/storage';
import { setupCanvas, drawRoom } from './render/canvas';
import { makePlaceholderSheet } from './render/sprites';
import { createHomeScreen } from './ui/home';
import { STRINGS } from './strings';

const root = document.getElementById('app')!;

// The game's clock: real time plus any debug fast-forward.
function gameNow(): number {
  return Date.now() + state.clockOffsetMs;
}

// Load the saved game (or start a new one) and catch it up to right now.
let state: GameState = loadGame() ?? createNewGame(Date.now());
state = simulate(state, gameNow());
saveGame(state);

// Replaces the current state, saves it and refreshes the screen.
function setState(next: GameState): void {
  state = next;
  saveGame(state);
  home.update(state, gameNow());
}

// Runs a player action. If the game refused it, shows a little message why.
function runAction(action: (s: GameState, now: number) => ActionResult): void {
  const result = action(state, gameNow());
  setState(result.state);
  if (result.blocked) home.toast(STRINGS.blocked[result.blocked](state.pet.name));
}

const home = createHomeScreen(root, {
  onFeed: () => runAction(feed),
  onPlay: () => runAction(play),
  onLights: () => runAction(toggleLights),
  onMedicine: () => runAction(giveMedicine),
  onReset: () => {
    if (confirm(STRINGS.confirmReset)) {
      clearSave();
      setState(createNewGame(Date.now()));
    }
  },
  onFastForward: (hours) => setState(fastForward(state, Date.now(), hours)),
  // Going back to real time can't undo what happened, so we keep the pet as
  // it is and just restart the clock from now.
  onResetClock: () => setState({ ...state, clockOffsetMs: 0, lastUpdated: Date.now() }),
});
home.update(state, gameNow());

// Draw the pet every animation frame (about 60 times a second).
const ctx = setupCanvas(home.canvas);
const sheet = makePlaceholderSheet();
function render(timeMs: number): void {
  drawRoom(
    ctx,
    sheet,
    { animation: getLook(state.pet), night: isNight(gameNow()), lightsOff: state.pet.asleep },
    timeMs,
  );
  requestAnimationFrame(render);
}
requestAnimationFrame(render);

// Keep the world ticking while the game is open...
setInterval(() => setState(simulate(state, gameNow())), CONFIG.liveUpdateSeconds * 1000);

// ...and catch up straight away when you come back to the tab or app.
document.addEventListener('visibilitychange', () => {
  if (document.visibilityState === 'visible') setState(simulate(state, gameNow()));
});
