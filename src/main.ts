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
  type Food,
} from './game/actions';
import { getCharacter, getVariant, sheetFor } from './game/growth';
import { buyFood, buyHat, checkIn, earn, getHat, wearHat, type ShopResult } from './game/economy';
import { getLook, isNight } from './game/stats';
import { cast, land } from './game/fishing';
import { cook } from './game/cooking';
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
    const { pet } = state;
    if (pet.stage === 'adult') {
      const character = getCharacter(pet.character);
      const name = STRINGS.characterName(character?.name ?? '?', getVariant(character, pet.variant)?.name);
      home.toast(STRINGS.growth.adult(pet.name, name, STRINGS.stars(character?.stars ?? 1)));
    } else {
      home.toast(STRINGS.growth[pet.stage](pet.name));
    }
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

// Shop and inventory actions: show a message for what happened.
function runShop(result: ShopResult, success?: string): void {
  setState(result.state);
  if (result.blocked === 'notEnoughGold') home.toast(STRINGS.shop.notEnoughGold);
  else if (result.blocked === 'alreadyOwned') home.toast(STRINGS.shop.alreadyOwned);
  else if (result.blocked === 'egg') home.toast(STRINGS.inventory.eggNoHat(state.pet.name));
  else if (!result.blocked && success) home.toast(success);
}

// Gives the check-in bonus if one is due (on opening the game or coming back).
function tryCheckIn(): void {
  const { state: next, reward } = checkIn(simulate(state, gameNow()), gameNow());
  setState(next);
  if (reward > 0) home.toast(STRINGS.gold.checkIn(reward));
}

// The sprite sheets, filled in once they've loaded.
let sprites: SpriteLibrary = new Map();

const home = createHomeScreen(root, {
  onFeed: (food) => runAction((s, now) => feed(s, now, food), 'eat'),
  onPlay: (activity) => runAction((s, now) => play(s, now, activity), 'happy'),
  onLights: () => runAction(toggleLights),
  onMedicine: () => runAction(giveMedicine),
  onCast: () => {
    const result = cast(state, gameNow());
    setState(result.state);
    if (result.blocked) home.toast(STRINGS.blocked[result.blocked](state.pet.name));
    return !result.blocked;
  },
  onLand: (grade) => {
    const { state: next, caught, count } = land(state, grade, Math.random(), Math.random());
    setState(next);
    const label = STRINGS.fishing.grades[grade];
    if (caught) {
      const stars = (CONFIG.foods as readonly Food[]).find((f) => f.id === caught)?.stars ?? 1;
      home.toast(STRINGS.fishing.landed(label, STRINGS.foods[caught], count, STRINGS.stars(stars)));
      react('happy');
    } else {
      home.toast(grade === 'miss' ? label : STRINGS.fishing.slipped(label));
    }
  },
  onCook: (items) => {
    const result = cook(simulate(state, gameNow()), items);
    setState(result.state);
    if (result.blocked) {
      home.toast(result.blocked === 'noFood' ? STRINGS.blocked.noFood(state.pet.name) : STRINGS.cooking.emptyPot);
      return null;
    }
    const name = STRINGS.foods[result.dish];
    const stars = STRINGS.stars((CONFIG.foods as readonly Food[]).find((f) => f.id === result.dish)?.stars ?? 0);
    if (!result.recipe) home.toast(STRINGS.cooking.mess);
    else home.toast((result.discovered ? STRINGS.cooking.discovered : STRINGS.cooking.made)(name, stars));
    if (result.discovered) react('happy');
    return result.dish;
  },
  onReset: () => {
    if (confirm(STRINGS.confirmReset)) {
      clearSave();
      setState(createNewGame(Date.now()));
    }
  },
  onFastForward: (hours) => setState(fastForward(state, Date.now(), hours)),
  onGrowNow: () => setState(growNow(state, gameNow())),
  onAddGold: () => setState(earn(state, CONFIG.debug.addGold)),
  onSetCare: (careScore) => setState({ ...state, pet: { ...state.pet, careScore } }),
  onBuyFood: (food) => runShop(buyFood(state, food), STRINGS.shop.bought(STRINGS.foods[food])),
  onBuyHat: (id) => runShop(buyHat(state, id), STRINGS.shop.bought(getHat(id)?.name ?? '')),
  onWearHat: (id) => runShop(wearHat(state, id)),
  hatImage: (id) => sprites.get(getHat(id)?.sheet ?? '')?.image.src,
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
tryCheckIn();

// Draw the pet every animation frame (about 60 times a second). The sprite
// sheet comes from the pet's stage or character (see src/data/characters.json).
const ctx = setupCanvas(home.canvas);
loadSprites().then((lib) => (sprites = lib));

function render(timeMs: number): void {
  const pet = state.pet;
  let animation: string = getLook(pet);
  if (reaction && timeMs < reaction.until && !pet.asleep) animation = reaction.animation;
  drawRoom(
    ctx,
    sprites.get(sheetFor(pet)),
    { animation, night: isNight(gameNow()), lightsOff: pet.asleep, fishing: home.fishingPhase() },
    timeMs,
    sprites.get(getHat(pet.hat)?.sheet ?? ''),
  );
  requestAnimationFrame(render);
}
requestAnimationFrame(render);

// Keep the world ticking while the game is open...
setInterval(() => setState(simulate(state, gameNow())), CONFIG.liveUpdateSeconds * 1000);

// ...and catch up straight away when you come back to the tab or app.
document.addEventListener('visibilitychange', () => {
  if (document.visibilityState === 'visible') tryCheckIn();
});
