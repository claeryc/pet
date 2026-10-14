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
  growNow,
  play,
  toggleLights,
  type ActionResult,
} from './game/actions';
import { getForm } from './game/growth';
import { getLook, isNight } from './game/stats';
import { clearSave, loadGame, saveGame } from './storage/storage';
import { setupCanvas, drawRoom } from './render/canvas';
import { loadSprites, type SpriteLibrary } from './render/sprites';
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

// Replaces the current state, saves it and refreshes the screen. If the pet
// just grew into a new stage, celebrate it.
function setState(next: GameState): void {
  const before = state.pet.stage;
  state = next;
  saveGame(state);
  home.update(state, gameNow());
  if (state.pet.stage !== before) {
    const form = getForm(state.pet.formId);
    home.toast(STRINGS.growth[state.pet.stage](state.pet.name, form.name));
    react('happy');
  }
}

// A short animation the pet plays in response to something (eating,
// playing). It's only for show, so it lives here and isn't saved.
let reaction: { animation: string; until: number } | null = null;
function react(animation: string): void {
  reaction = { animation, until: performance.now() + CONFIG.reactionMs };
}

// Runs a player action. If the game refused it, shows a little message why;
// otherwise plays the matching reaction.
function runAction(
  action: (s: GameState, now: number) => ActionResult,
  animation?: string,
): void {
  const result = action(state, gameNow());
  setState(result.state);
  if (result.blocked) home.toast(STRINGS.blocked[result.blocked](state.pet.name));
  else if (animation) react(animation);
}

const home = createHomeScreen(root, {
  onFeed: (food) => runAction((s, now) => feed(s, now, food), 'eat'),
  onPlay: (activity) => runAction((s, now) => play(s, now, activity), 'happy'),
  onLights: () => runAction(toggleLights),
  onMedicine: () => runAction(giveMedicine),
  onReset: () => {
    if (confirm(STRINGS.confirmReset)) {
      clearSave();
      setState(createNewGame(Date.now()));
    }
  },
  onFastForward: (hours) => setState(fastForward(state, Date.now(), hours)),
  onGrowNow: () => setState(growNow(state, gameNow())),
  // Going back to real time can't undo what happened, so we keep the pet as
  // it is and just restart the clock from now. Timers the pet is waiting on
  // are moved back by the same amount, so they still finish on time.
  onResetClock: () => {
    const off = state.clockOffsetMs;
    const pet = {
      ...state.pet,
      stageStartedAt: state.pet.stageStartedAt - off,
      recoveryUntil: state.pet.recoveryUntil === null ? null : state.pet.recoveryUntil - off,
      buffs: state.pet.buffs.map((b) => ({ ...b, until: b.until - off })),
    };
    setState({ ...state, pet, clockOffsetMs: 0, lastUpdated: Date.now() });
  },
});
home.update(state, gameNow());

// Draw the pet every animation frame (about 60 times a second). The sprite
// sheet comes from the pet's current form (see src/data/creatures.json).
const ctx = setupCanvas(home.canvas);
let sprites: SpriteLibrary = new Map();
loadSprites().then((lib) => (sprites = lib));

function render(timeMs: number): void {
  const pet = state.pet;
  let animation: string = getLook(pet);
  if (reaction && timeMs < reaction.until && !pet.asleep) animation = reaction.animation;
  drawRoom(
    ctx,
    sprites.get(getForm(pet.formId).sprite),
    { animation, night: isNight(gameNow()), lightsOff: pet.asleep },
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
