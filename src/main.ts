// The starting point of the app. It wires the pieces together:
//   game logic (src/game)  <-  this file  ->  drawing (src/render), screens (src/ui)
//                                  |
//                            saving (src/storage)

import { CONFIG, STAT_MAX } from './game/config';
import { createNewGame, type GameState, type Message } from './game/state';
import { simulate } from './game/simulate';
import {
  fastForward,
  feed,
  giveMedicine,
  growNow,
  play,
  revive,
  sayGoodbye,
  toggleLights,
  type ActionResult,
  type Food,
} from './game/actions';
import { characterSheet, getCharacter, getVariant, sheetFor } from './game/growth';
import {
  buyBait, buyDecor, buyFood, buyGardenItem, buyHat, buyPot, checkIn, earn, getHat, grantPack, revivalStars, wearHat,
  type ShopResult,
} from './game/economy';
import { purchase, type ProductId } from './payments';
import { useDecor } from './game/decor';
import { getLook, isNight } from './game/stats';
import { cast, land, toggleBait } from './game/fishing';
import { TOSS_MS } from './render/garden';
import { LEAP_MS } from './ui/fishing';
import { cook } from './game/cooking';
import {
  clearPlot,
  cure,
  fertilize,
  findSeed,
  harvest,
  plant,
  water,
  type CropId,
  type GardenResult,
} from './game/garden';
import { markSeen, updateProgress } from './game/unlocks';
import { learn, nextCost, rankOf, resetTree, skillBefore, type SkillId } from './game/skills';
import { SKILL_POINT_ICON } from './ui/icons';
import { fillAll, orderPay, orderTier, putInBox, takeFromBox, type BoxResult } from './game/delivery';
import { logMessage, markMessagesSeen } from './game/messages';
import type { FoodId } from './game/actions';
import { namePet, needsName, setOwner, suggestName } from './game/family';
import {
  allPets,
  befriend,
  invite,
  getFriend,
  giveGift,
  makeWanderer,
  meet,
  mingle,
  petStandsLeft,
  removeFriend,
  retire,
  switchPet,
  type FriendBlock,
  type MingleBlock,
} from './game/friends';
import { createChoiceBox } from './ui/choice';
import { createAwayCard } from './ui/away';
import { awayNotes } from './game/away';
import type { Pet } from './game/state';
import { clearSave, loadGame, saveGame } from './storage/storage';
import { setupCanvas, drawRoom } from './render/canvas';
import { loadSprites, type SpriteLibrary } from './render/sprites';
import { createHomeScreen } from './ui/home';
import { createNamingBox } from './ui/naming';
import { STRINGS } from './strings';
import { FRAGMENT_ICON, ITEM_ICONS } from './ui/icons';
import { DISH_MS, DONE_MS as COOKED_MS } from './ui/cooking';
import { music, sound, startAudio } from './audio/audio';
import { buyCharm, callHome, goTogether, openBackpack, restPercy } from './game/journeys';
import { isAway } from './game/presence';
import { STAT_ICONS } from './ui/icons';
import type { Find } from './game/state';

const root = document.getElementById('app')!;

// The game's clock: real time plus any debug fast-forward.
function gameNow(): number {
  return Date.now() + state.clockOffsetMs;
}

// Load the saved game (or start a new one) and catch it up to right now.
const saved = loadGame();
let state: GameState = saved ?? createNewGame(Date.now());
// What Messages had at the last visit, so Percy's news from while you were
// away can be shown once the screen is up.
const lastVisitMessages = state.messages;
const startup = updateProgress(simulate(state, gameNow()));
state = startup.state;
saveGame(state);

// Messages waiting until the new pet has a name (what opened up when the
// egg hatched, for example).
const afterNaming: string[] = [];

// Replaces the current state, saves it and refreshes the screen. If the pet
// just grew into a new stage, celebrate it, and say if anything new opened
// up. A freshly hatched pet is asked for its name first.
function setState(next: GameState): void {
  const before = new Map(allPets(state).map((p) => [p.id, p.stage]));
  const oldMessages = state.messages;
  const progress = updateProgress(next);
  state = progress.state;
  // Pets that grew into a new stage (any pet in the room, not just the one
  // you're looking after). Growing up goes in Messages too.
  const grew = allPets(state).filter((p) => before.has(p.id) && before.get(p.id) !== p.stage && p.stage !== 'egg');
  for (const pet of grew) {
    state = logMessage(state, {
      kind: 'growth', at: gameNow(), stage: pet.stage, name: pet.name, character: pet.character, variant: pet.variant,
    });
  }
  // An egg that hatched while you were looking after the other pet: switch
  // to it, so it can be named.
  const hatched = state.housemates.find((p) => p.stage !== 'egg' && !p.named);
  if (hatched && !needsName(state)) state = switchPet(state, hatched.id);
  saveGame(state);
  home.update(state, gameNow());
  for (const pet of grew) {
    if (pet.stage === 'baby') continue;
    sound('grewUp');
    if (pet.stage === 'adult') {
      const character = getCharacter(pet.character);
      const name = STRINGS.characterName(character?.name ?? '?', getVariant(character, pet.variant)?.name);
      home.toast(STRINGS.growth.adult(pet.name, name, STRINGS.stars(character?.stars ?? 1)));
    } else {
      home.toast(STRINGS.growth.teen(pet.name));
    }
    if (pet.id === state.pet.id) react('happy');
  }
  showLevels(progress.levels);
  showFragments(progress.fragments);
  if (progress.badges.length > 0) sound('badge');
  else if (progress.unlocked.length > 0) sound('unlock');
  const notices = [
    ...progress.badges.map((b) => STRINGS.achievements.earned(STRINGS.achievements.names[b.id], STRINGS.achievements.tiers[b.tier])),
    ...progress.unlocked.map((id) => STRINGS.unlocked[id]),
  ];
  if (needsName(state)) {
    afterNaming.push(...notices);
    askName();
  } else {
    for (const message of notices) home.notice(message);
  }
  announceMail(oldMessages);
  askWhoRetires();
  playMusic();
}

// Daytime music, or the night song once it's dark or the pet is asleep.
function playMusic(): void {
  music(isNight(gameNow()) || state.pet.asleep ? 'night' : 'day');
}

// Star fragments just found, and a Revival Star they made.
function showFragments(got: { pieces: number; stars: number }): void {
  if (got.pieces === 0) return;
  const { perStar } = CONFIG.revival.fragments;
  sound('got');
  if (got.stars > 0) {
    home.reveal({ icon: ITEM_ICONS.revivalStar, name: STRINGS.shop.revivalStar, count: got.stars, stars: 0, caption: STRINGS.revival.fragmentsDone });
  } else {
    home.reveal({
      icon: FRAGMENT_ICON, name: STRINGS.shop.fragment, count: got.pieces, stars: 0,
      caption: STRINGS.shop.fragmentsCount(state.fragments.pieces, perStar),
    });
  }
}

// A new Keeper level: a skill point to spend.
function showLevels(levels: number[]): void {
  for (const level of levels) {
    sound('levelUp');
    home.reveal({ icon: SKILL_POINT_ICON, name: STRINGS.skills.point, count: 1, stars: 0, caption: STRINGS.skills.levelUp(level) });
  }
}

// Says what Percy did since `old` was the message list: picked up an
// order (maybe while the game was closed), or brought a new one.
function announceMail(old: Message[]): void {
  const news = state.messages.filter((m) => !old.includes(m));
  if (news.length > 0) sound('mail');
  for (const m of news.reverse()) {
    if (m.kind === 'order') {
      const items = m.boxes.map((b) => STRINGS.delivery.item(b.want, STRINGS.foods[b.food as FoodId]));
      home.notice(STRINGS.delivery.announced(items.join(', ')));
    } else if (m.kind === 'pickup') {
      home.notice(STRINGS.delivery.pickedUp(m.boxes.filter((b) => b.have >= b.want).length, m.gold));
      if (m.seed) showGot(m.seed, 1, STRINGS.reveal.fromPercy, true);
      if (m.food) showGot(m.food, 1, STRINGS.reveal.fromPercy);
    } else if (m.kind === 'tripHome') {
      home.notice(STRINGS.journeys.tripHome(m.name, placeName(m.place)));
    } else if (m.kind === 'courier') {
      home.notice(STRINGS.journeys.courier(m.name, placeName(m.place), findLabel(m.find)));
      showFind(m.find, STRINGS.journeys.fromPercy);
    } else if (m.kind === 'visitor' && m.friend) {
      home.notice(STRINGS.messages.friendVisit(m.name));
    } else if (m.kind === 'visitor') {
      const c = getCharacter(m.character);
      home.notice(STRINGS.messages.visitor(m.name, STRINGS.characterName(c?.name ?? '?', getVariant(c, m.variant)?.name)));
    }
  }
}

// Asks for the pet's name: once it hatches (it must have one), or to
// rename it from the Family Tree.
function askName(): void {
  if (naming.isOpen()) return;
  const { pet } = state;
  const first = !pet.named;
  const suggest = (current: string) => suggestName(STRINGS.petNames, Math.random(), current);
  naming.open({
    title: first ? (pet.stage === 'baby' ? STRINGS.naming.hatched : STRINGS.naming.title) : STRINGS.naming.rename(pet.name),
    ask: first ? STRINGS.naming.ask : '',
    value: pet.name || suggest(''),
    canCancel: !first,
    suggest,
    onSave: (name) => {
      const result = namePet(state, name);
      if (result.blocked) return STRINGS.naming.empty;
      setState(result.state);
      const named = state.pet.name;
      if (!first) home.toast(STRINGS.naming.renamed(named));
      else home.toast(pet.stage === 'baby' ? STRINGS.growth.baby(named) : STRINGS.naming.hello(named));
      for (const message of afterNaming.splice(0)) home.notice(message);
      sound('done');
      react('happy');
      return null;
    },
  });
}

// A short animation the pet plays in response to something (eating,
// playing). It's only for show, so it lives here and isn't saved.
let reaction: { animation: string; until: number } | null = null;
function react(animation: string, ms: number = CONFIG.reactionMs): void {
  reaction = { animation, until: performance.now() + ms };
}

// Runs a player action. If the game refused it, shows a little message why;
// otherwise plays the matching reaction. True if it went ahead.
function runAction(
  action: (s: GameState, now: number) => ActionResult,
  animation?: string,
): boolean {
  const result = action(state, gameNow());
  setState(result.state);
  if (result.blocked) blocked(STRINGS.blocked[result.blocked](state.pet.name));
  else if (animation) react(animation);
  return !result.blocked;
}

// A "can't do that" message, with its sound.
function blocked(message: string): void {
  sound('blocked');
  home.toast(message);
}

// Shop and inventory actions: show a message for what happened.
function runShop(result: ShopResult, success?: string): void {
  setState(result.state);
  if (result.blocked === 'notEnoughGold') blocked(STRINGS.shop.notEnoughGold);
  else if (result.blocked === 'alreadyOwned') blocked(STRINGS.shop.alreadyOwned);
  else if (result.blocked === 'egg') blocked(STRINGS.wardrobe.eggNoHat);
  else if (result.blocked === 'soldOut') blocked(STRINGS.shop.soldOutToday);
  else if (!result.blocked && success) {
    sound('purchase');
    home.toast(success);
  }
}

// What the next rank of a skill costs (0 once it's maxed).
const nextCostOf = (skill: SkillId) => nextCost(state, skill) ?? 0;

// The stars a food has (0 if none).
const starCount = (id: string) => (CONFIG.foods as readonly Food[]).find((f) => f.id === id)?.stars ?? 0;

// Shows off something you just got (a food, or its seed) over the stat bars.
function showGot(id: string, count: number, caption?: string, seed = false): void {
  const name = STRINGS.foods[id as FoodId] ?? id;
  sound('got');
  home.reveal({
    icon: ITEM_ICONS[seed ? `seed_${id}` : id] ?? '',
    name: seed ? STRINGS.garden.seedName(name) : name,
    count,
    stars: starCount(id),
    caption,
  });
}

const placeName = (id: string) => STRINGS.journeys.places[id] ?? id;

// What a journey find is called: "Honey", "Pumpkin seed" or "Gold".
function findLabel(f: Find): string {
  if (f.kind === 'gold') return STRINGS.journeys.goldFind;
  const name = STRINGS.foods[f.id as FoodId] ?? f.id;
  return f.kind === 'seed' ? STRINGS.garden.seedName(name) : name;
}

// Shows off something a pet found on a journey.
function showFind(f: Find, caption: string): void {
  sound('got');
  home.reveal({
    icon: f.kind === 'gold' ? STAT_ICONS.gold : ITEM_ICONS[f.kind === 'seed' ? `seed_${f.id}` : f.id] ?? '',
    name: findLabel(f),
    count: f.count,
    stars: f.kind === 'gold' ? 0 : f.stars,
    caption,
  });
}

// A lucky seed found while fishing or playing.
function luckySeed(source: 'fishing' | 'play', perfect = false): void {
  const found = findSeed(state, source, Math.random(), Math.random(), perfect);
  if (!found.seed) return;
  setState(found.state);
  showGot(found.seed, 1, STRINGS.reveal.luckySeed, true);
}

// Floats how the pet's stats changed since `before` up from the pet. A stat
// in `raises` (what the action tops up) that was already full says so,
// rather than leaving only the costs showing.
type StatId = keyof Pet['stats'];
function showGains(before: Pet, raises: Partial<Record<StatId, number>>): void {
  if (state.pet.id !== before.id) return;
  const stats = Object.keys(before.stats) as StatId[];
  home.gains(Object.fromEntries(stats.map((k) => {
    const change = state.pet.stats[k] - before.stats[k];
    const full = (raises[k] ?? 0) > 0 && Math.round(change) === 0 && state.pet.stats[k] >= STAT_MAX - 0.5;
    return [k, full ? 'full' : change];
  })));
}

// Playing with the pet: a cuddle or tickle might turn up a seed.
function playWith(activity: 'cuddle' | 'tickle'): void {
  const before = simulate(state, gameNow()).pet;
  const result = play(state, gameNow(), activity);
  setState(result.state);
  if (result.blocked) return blocked(STRINGS.blocked[result.blocked](state.pet.name));
  showGains(before, CONFIG.activities.find((a) => a.id === activity)!);
  sound('cuddle');
  react('happy');
  luckySeed('play');
}

// Garden actions: catch the garden up first, then show what happened.
function runGarden(action: (s: GameState, now: number) => GardenResult, success?: string): boolean {
  const now = gameNow();
  const result = action(simulate(state, now), now);
  setState(result.state);
  if (result.blocked) {
    const message = STRINGS.garden.blocked[result.blocked];
    const fromShop = result.blocked === 'noFertilizer' || result.blocked === 'noCure';
    sound('blocked');
    if (message) home.toast(message, fromShop ? 'garden' : undefined);
    return false;
  }
  if (success) home.toast(success);
  return true;
}

// Percy's order: putting things in boxes and taking them out. Says when
// every box is full (the golden frame and its bonus).
function runBox(action: (s: GameState) => BoxResult, food?: string): void {
  const result = action(simulate(state, gameNow()));
  const wasGold = state.delivery.order ? orderTier(state.delivery.order.boxes) === 'gold' : false;
  setState(result.state);
  const name = food ? STRINGS.foods[food as FoodId] : '';
  if (result.blocked === 'noFood') blocked(food ? STRINGS.delivery.noneLeft(name) : STRINGS.delivery.nothingToFill);
  else if (result.blocked === 'full') blocked(STRINGS.delivery.full);
  else if (!result.blocked) sound('place');
  const order = state.delivery.order;
  if (!result.blocked && order && !wasGold && orderTier(order.boxes) === 'gold') {
    sound('done');
    home.toast(STRINGS.delivery.allFull(orderPay(order.boxes).bonus));
    react('happy');
  }
}
const boxFood = (i: number) => state.delivery.order?.boxes[i]?.food;

// The Star Shop: pays (a stand-in for now, see src/payments.ts) and hands
// out the pack. Resolves true if it was bought.
function buyPack(productId: ProductId): Promise<boolean> {
  const pack = CONFIG.store.find((p) => p.id === productId)!;
  const confirmPay = () => new Promise<boolean>((resolve) => {
    choice.open({
      title: STRINGS.revival.payTitle,
      text: STRINGS.revival.payAsk(STRINGS.shop.revivalPack(pack.count), pack.price),
      options: [
        { label: STRINGS.revival.pay(pack.price), onPick: () => resolve(true) },
        { label: STRINGS.revival.cancel, soft: true, onPick: () => resolve(false) },
      ],
    });
  });
  return purchase(productId, confirmPay).then((paid) => {
    if (!paid) return false;
    setState(grantPack(state, productId));
    sound('purchase');
    home.reveal({ icon: ITEM_ICONS[pack.item], name: STRINGS.shop.revivalStar, count: pack.count, stars: 0 });
    home.toast(STRINGS.revival.bought(pack.count));
    return true;
  });
}

// A pet that passed away: bring it back with a Revival Star, buying one
// first if there's none.
function askRevive(): void {
  const name = state.pet.name;
  const doRevive = () => {
    const result = revive(state, gameNow());
    setState(result.state);
    if (result.blocked) return blocked(STRINGS.blocked[result.blocked](name));
    home.toast(STRINGS.revival.back(name));
    sound('grewUp');
    react('happy');
  };
  const have = revivalStars(state);
  const single = CONFIG.store[0];
  const notNow = { label: STRINGS.revival.notNow, soft: true, onPick: () => {} };
  if (have > 0) {
    choice.open({
      title: STRINGS.revival.title(name),
      text: STRINGS.revival.useAsk(name, have),
      options: [{ label: STRINGS.revival.use, onPick: doRevive }, notNow],
    });
    return;
  }
  // None yet: say how far the free star (from fragments) has come, and
  // offer to buy one.
  choice.open({
    title: STRINGS.revival.title(name),
    text: STRINGS.revival.buyAsk(name, state.fragments.pieces, CONFIG.revival.fragments.perStar),
    options: [
      { label: STRINGS.revival.buy(single.price), onPick: () => buyPack(single.id).then((ok) => ok && doRevive()) },
      notNow,
    ],
  });
}

// ...or let it go into the Family Tree.
function askGoodbye(): void {
  const name = state.pet.name;
  choice.open({
    title: STRINGS.revival.goodbyeTitle(name),
    text: state.housemates.length > 0 ? STRINGS.revival.goodbyeAskHousemate(name) : STRINGS.revival.goodbyeAsk(name),
    options: [
      { label: STRINGS.revival.keep, onPick: () => {} },
      { label: STRINGS.revival.goodbyeYes, soft: true, onPick: () => setState(sayGoodbye(state, gameNow())) },
    ],
  });
}

// Friends: says why something was refused.
function friendBlocked(reason: FriendBlock | MingleBlock): void {
  blocked(STRINGS.friends.blocked[reason](state.pet.name));
}

// A pet's portrait, for the choice box.
const portraitOf = (pet: Pet) => characterImage(sheetFor(pet));

// The room fits CONFIG.friends.maxPets pets. When a little one makes it
// too full, the player picks who retires into the Family Tree (asked again
// on the next visit if the game closed first).
function askWhoRetires(): void {
  if (choice.isOpen() || naming.isOpen() || allPets(state).length <= CONFIG.friends.maxPets) return;
  // The newest pet (the egg) always stays.
  const newest = allPets(state).reduce((a, b) => (b.bornAt > a.bornAt ? b : a));
  choice.open({
    title: STRINGS.friends.fullTitle,
    text: STRINGS.friends.fullAsk,
    // (A pet out on a journey isn't in the room to ask.)
    options: allPets(state).filter((p) => p.id !== newest.id && !isAway(p)).map((p) => ({
      label: STRINGS.friends.retire(p.name),
      picture: portraitOf(p),
      soft: true,
      onPick: () => {
        setState(retire(state, p.id));
        home.toast(STRINGS.friends.retired(p.name));
      },
    })),
  });
}

function onMingle(id: string): void {
  const friend = getFriend(state, id);
  const parent = state.pet;
  const result = mingle(simulate(state, gameNow()), id, gameNow(), Math.random());
  setState(result.state);
  if (result.blocked) return friendBlocked(result.blocked);
  react('happy');
  if (!result.egg) return home.toast(STRINGS.friends.noLittleOne(parent.name, friend?.name ?? ''));
  sound('grewUp');
  home.toast(STRINGS.friends.littleOne(parent.name, friend?.name ?? ''));
  // A crowded room asks who retires (from setState). Otherwise the parent
  // can stay or retire.
  if (result.crowded) return;
  choice.open({
    title: STRINGS.friends.keepTitle,
    text: STRINGS.friends.keepAsk(parent.name),
    options: [
      { label: STRINGS.friends.keep(parent.name), picture: portraitOf(parent), onPick: () => {} },
      {
        label: STRINGS.friends.retire(parent.name),
        soft: true,
        onPick: () => {
          setState(retire(state, parent.id));
          home.toast(STRINGS.friends.retired(parent.name));
        },
      },
    ],
  });
}

// Gives the check-in bonus if one is due (on opening the game or coming back).
// Shows the "While you were away" card, if you were gone a while and
// something happened. `before` is the game as you left it at `leftAt`.
// Skipped while the pet is being named or a choice is open.
function showAway(before: GameState, leftAt: number): void {
  if (naming.isOpen() || choice.isOpen() || away.isOpen()) return;
  const notes = awayNotes(before, simulate(state, gameNow()), leftAt, gameNow());
  if (notes.length > 0) away.open(notes, state.pet.name, gameNow() - leftAt);
}

function tryCheckIn(): void {
  const firstEver = state.checkIn.day === '';
  const { state: next, reward } = checkIn(simulate(state, gameNow()), gameNow());
  setState(next);
  if (reward > 0) home.toast(firstEver ? STRINGS.gold.firstCheckIn(reward) : STRINGS.gold.checkIn(reward));
}

// The sprite sheets, filled in once they've loaded.
let sprites: SpriteLibrary = new Map();

// A character's picture for the Collection: the first idle frame of its
// sheet, cut out once and kept.
const portraits = new Map<string, string>();
function characterImage(sheetName: string): string | undefined {
  const cached = portraits.get(sheetName);
  if (cached) return cached;
  const sheet = sprites.get(sheetName);
  if (!sheet) return undefined;
  const { frameWidth: w, frameHeight: h } = sheet;
  const cut = document.createElement('canvas');
  cut.width = w;
  cut.height = h;
  cut.getContext('2d')!.drawImage(sheet.image, 0, (sheet.animations.idle?.row ?? 0) * h, w, h, 0, 0, w, h);
  const url = cut.toDataURL();
  portraits.set(sheetName, url);
  return url;
}

const home = createHomeScreen(root, {
  onFeed: (food) => {
    const before = simulate(state, gameNow()).pet;
    const result = feed(state, gameNow(), food);
    setState(result.state);
    if (result.blocked) return blocked(STRINGS.blocked[result.blocked](state.pet.name));
    sound('eat');
    showGains(before, (CONFIG.foods as readonly Food[]).find((f) => f.id === food)!);
    // Eating takes a while (the food goes in bites); a craving it loved
    // gets a happy wiggle after.
    react('eat', CONFIG.eating.ms);
    if (result.craved) {
      home.toast(STRINGS.craving.loved(state.pet.name, result.craved));
      const fed = reaction;
      window.setTimeout(() => reaction === fed && react('happy'), CONFIG.eating.ms);
    }
  },
  onPlay: (activity) => playWith(activity),
  onPetTap: () => playWith('cuddle'),
  onLights: () => {
    if (runAction(toggleLights)) sound(state.pet.asleep ? 'lightsOff' : 'lightsOn');
  },
  onMedicine: () => {
    const before = simulate(state, gameNow()).pet;
    runAction(giveMedicine);
    showGains(before, { health: 1 });
  },
  onRevive: askRevive,
  onGoodbye: askGoodbye,
  onCast: () => {
    const result = cast(state, gameNow());
    setState(result.state);
    if (result.blocked) blocked(STRINGS.blocked[result.blocked](state.pet.name));
    else sound('cast');
    return !result.blocked;
  },
  onLand: (grade) => {
    const { state: next, caught, count } = land(state, grade, Math.random(), Math.random());
    setState(next);
    const label = STRINGS.fishing.grades[grade];
    if (caught) {
      // Show it once it has flipped up out of the water.
      window.setTimeout(() => {
        showGot(caught, count, label);
        luckySeed('fishing', grade === 'perfect');
      }, LEAP_MS);
      react('happy');
    } else {
      sound('missed');
      home.toast(grade === 'miss' ? label : STRINGS.fishing.slipped(label));
    }
    return caught;
  },
  onToggleBait: () => setState(toggleBait(state)),
  onCook: (items) => {
    const result = cook(simulate(state, gameNow()), items, Math.random());
    setState(result.state);
    if (result.blocked) {
      blocked(
        result.blocked === 'noFood' ? STRINGS.blocked.noFood(state.pet.name)
        : result.blocked === 'needMore' ? STRINGS.cooking.needMore(STRINGS.foods[items[0]])
        : STRINGS.cooking.emptyPot,
      );
      return null;
    }
    // The pot bubbles and shows the dish first, then the reveal.
    const caption = result.discovered ? STRINGS.reveal.newRecipe
      : result.count > 1 ? STRINGS.skills.secondHelping : undefined;
    window.setTimeout(() => showGot(result.dish, result.count, caption), COOKED_MS);
    // What it made stays a secret until the lid comes off.
    window.setTimeout(() => {
      if (!result.recipe) home.toast(STRINGS.cooking.mess);
      if (result.saved) home.notice(STRINGS.skills.saved(STRINGS.foods[result.saved]));
      if (result.discovered) react('happy');
    }, DISH_MS);
    return result.dish;
  },
  onPlant: (pot, crop) => {
    const planted = runGarden((s, now) => plant(s, pot, crop, now, Math.random()), STRINGS.garden.planted(STRINGS.foods[crop]));
    if (planted) sound('place');
    return planted;
  },
  onWater: (pot, perfect) => {
    const watered = runGarden((s, now) => water(s, pot, now, perfect, Math.random()),
      perfect ? STRINGS.garden.perfectPour : STRINGS.garden.watered);
    if (watered) sound('water');
    return watered;
  },
  onFertilize: (pot) => runGarden((s, now) => fertilize(s, pot, now), STRINGS.garden.fertilizedNow),
  onCure: (pot) => runGarden((s, now) => cure(s, pot, now), STRINGS.garden.cured),
  onHarvest: (pot) => {
    const now = gameNow();
    const result = harvest(simulate(state, now), pot);
    setState(result.state);
    if (result.blocked || !result.crop) return;
    // Let the crop bounce out of its pot first.
    const crop = result.crop;
    window.setTimeout(() => showGot(crop, result.count ?? 0, STRINGS.reveal.harvested), TOSS_MS);
    react('happy');
  },
  onClear: (pot) => runGarden((s) => clearPlot(s, pot), STRINGS.garden.cleared),
  onPutInBox: (box) => runBox((s) => putInBox(s, box), boxFood(box)),
  onTakeFromBox: (box) => runBox((s) => takeFromBox(s, box)),
  onFillAll: () => runBox(fillAll),
  onMessagesSeen: () => setState(markMessagesSeen(state, gameNow())),
  onLearn: (skill) => {
    const result = learn(state, skill);
    setState(result.state);
    if (result.blocked === 'locked') blocked(STRINGS.skills.locked(STRINGS.skills.names[skillBefore(skill)!]));
    else if (result.blocked === 'noPoints') blocked(STRINGS.skills.needPoints(nextCostOf(skill)));
    else if (!result.blocked) {
      sound('unlock');
      home.toast(STRINGS.skills.learned(STRINGS.skills.names[skill], rankOf(state, skill)));
    }
  },
  onResetTree: (tree) => {
    const result = resetTree(state, tree);
    setState(result.state);
    if (result.blocked === 'notEnoughGold') blocked(STRINGS.shop.notEnoughGold);
    else if (result.refunded) home.toast(STRINGS.skills.resetDone(result.refunded));
  },
  onMeet: (id) => {
    const friend = getFriend(state, id);
    const result = meet(simulate(state, gameNow()), id, gameNow());
    setState(result.state);
    if (result.blocked) {
      friendBlocked(result.blocked);
      return false;
    }
    sound('cuddle');
    react('happy');
    const name = friend?.name ?? '';
    home.toast(result.gained ? STRINGS.friends.met(state.pet.name, name, result.gained) : STRINGS.friends.tiredOfMeeting(name));
    return true;
  },
  onGift: (id, food) => {
    const result = giveGift(simulate(state, gameNow()), id, food, gameNow());
    setState(result.state);
    if (result.blocked) return friendBlocked(result.blocked);
    sound('cast');
    home.toast(STRINGS.friends.gave(STRINGS.foods[food], getFriend(state, id)?.name ?? '', result.gained ?? 0));
  },
  onMingle,
  onAddFriend: () => {
    const guest = state.visit.guest;
    const result = befriend(state);
    setState(result.state);
    if (result.blocked) return friendBlocked(result.blocked);
    if (guest) home.toast(STRINGS.friends.added(guest.name));
  },
  onRemoveFriend: (id) => {
    const friend = getFriend(state, id);
    if (!friend || !confirm(STRINGS.friends.confirmRemove(friend.name))) return;
    setState(removeFriend(simulate(state, gameNow()), id, gameNow()));
    home.toast(STRINGS.friends.removed(friend.name));
  },
  onInvite: (id) => {
    const result = invite(simulate(state, gameNow()), id, gameNow());
    setState(result.state);
    if (result.blocked) {
      friendBlocked(result.blocked);
      return false;
    }
    home.toast(STRINGS.friends.invited(getFriend(state, id)?.name ?? ''));
    return true;
  },
  onSwitchPet: (id) => {
    setState(switchPet(simulate(state, gameNow()), id));
    home.toast(STRINGS.friends.looking(state.pet.name));
  },
  onVisitorNow: () => {
    const now = gameNow();
    const taken = [...allPets(state).map((p) => p.name), ...state.friends.map((f) => f.name)];
    const guest = makeWanderer(now, taken);
    const visit = { ...state.visit, guest, friendId: null, met: false, until: now + CONFIG.friends.stayHours * 3_600_000, wildAt: now + CONFIG.friends.wildEveryHours * 3_600_000 };
    const c = getCharacter(guest.character);
    setState(logMessage({ ...state, visit }, { kind: 'visitor', at: now, name: guest.name, character: guest.character, variant: guest.variant }));
    home.toast(STRINGS.messages.visitor(guest.name, STRINGS.characterName(c?.name ?? '?', getVariant(c, guest.variant)?.name)));
  },
  onFriendScore: () => {
    const up = <T extends { score: number }>(f: T): T => ({ ...f, score: Math.min(100, f.score + CONFIG.debug.friendScore) });
    const guest = state.visit.guest && up(state.visit.guest);
    setState({ ...state, friends: state.friends.map(up), visit: { ...state.visit, guest } });
  },
  onBuyGardenItem: (item) =>
    runShop(buyGardenItem(state, item), STRINGS.shop.bought(
      item.kind === 'seed' ? STRINGS.garden.seedName(STRINGS.foods[item.id]) : STRINGS.garden.supplies[item.id],
    )),
  onReset: () => {
    if (confirm(STRINGS.confirmReset)) {
      clearSave();
      setState(createNewGame(Date.now()));
    }
  },
  onFastForward: (hours) => {
    const before = simulate(state, gameNow());
    const at = gameNow();
    setState(fastForward(state, Date.now(), hours));
    showAway(before, at);
  },
  onGrowNow: () => setState(growNow(state, gameNow())),
  onAddGold: () => setState(earn(state, CONFIG.debug.addGold)),
  onSetCare: (careScore) => setState({ ...state, pet: { ...state.pet, careScore } }),
  onBuyFood: (food) => runShop(buyFood(state, food, gameNow()), STRINGS.shop.bought(STRINGS.foods[food])),
  onBuyBait: () => runShop(buyBait(state), STRINGS.shop.bought(STRINGS.shop.bait)),
  onBuyCharm: (id) => runShop(buyCharm(state, id), STRINGS.shop.bought(STRINGS.journeys.charms[id]?.name ?? id)),
  onBuyPot: () => runShop(buyPot(state), STRINGS.shop.potBought),
  onBuyDecor: (kind, id) => runShop(buyDecor(state, kind, id),
    STRINGS.shop.bought((kind === 'wallpaper' ? STRINGS.shop.wallpapers : STRINGS.shop.curtains)[id] ?? id)),
  onUseDecor: (kind, id) => runShop(useDecor(state, kind, id)),
  onBuyPack: (id) => void buyPack(id as ProductId),
  onWakePercy: () => {
    const result = restPercy(simulate(state, gameNow()), gameNow());
    setState(result.state);
    if (result.blocked === 'notEnoughGold') blocked(STRINGS.shop.notEnoughGold);
    else if (!result.blocked) {
      sound('purchase');
      home.toast(STRINGS.journeys.percyWoke);
    }
  },
  onSetOff: (slot, party, percy) => {
    const now = gameNow();
    const s = simulate(state, now);
    const offer = s.journeys.offers[slot];
    const result = goTogether(s, now, slot, party, percy);
    setState(result.state);
    const nameOf = (id: string | undefined) => allPets(s).find((p) => p.id === id)?.name ?? '';
    if (result.blocked) {
      blocked(STRINGS.journeys.blocked[result.blocked](nameOf(result.pet)));
      return false;
    }
    sound('done');
    const [a, b] = party.map((m) => nameOf(m.pet));
    const place = placeName(offer?.place ?? '');
    home.toast(b ? STRINGS.journeys.leftTogether(a, b, place) : STRINGS.journeys.leftFor(a, place));
    return true;
  },
  onCallHome: (id) => {
    const now = gameNow();
    const result = callHome(simulate(state, now), now, id);
    setState(result.state);
    if (result.blocked) blocked(STRINGS.journeys.blocked[result.blocked](allPets(state).find((p) => p.id === id)?.name ?? ''));
  },
  onOpenBackpack: (id) => {
    const pet = allPets(state).find((p) => p.id === id);
    if (!pet) return;
    // The bag first, over the stat bars; the finds come out once it's tapped.
    home.backpack(pet.name, () => {
      const result = openBackpack(simulate(state, gameNow()), id);
      setState(result.state);
      if (!result.place) return;
      for (const f of result.finds) showFind(f, STRINGS.journeys.found(placeName(result.place)));
      if (state.pet.id === id) react('happy');
    });
  },
  onBuyHat: (id) => runShop(buyHat(state, id), STRINGS.shop.boughtHat(getHat(id)?.name ?? '', state.pet.name)),
  onWearHat: (id) => runShop(wearHat(state, id)),
  hatImage: (id) => sprites.get(getHat(id)?.sheet ?? '')?.image.src,
  characterImage,
  onSeen: (id) => setState(markSeen(state, id)),
  onRename: askName,
  onOwner: (name) => setState(setOwner(state, name)),
  onShowAllMenus: (showAllMenus) => setState({ ...state, showAllMenus }),
  // Going back to real time can't undo what happened, so we keep the pet as
  // it is and just restart the clock from now. Timers the pet is waiting on
  // are moved back by the same amount, so they still finish on time.
  onResetClock: () => {
    const off = state.clockOffsetMs;
    const shift = (p: Pet): Pet => ({
      ...p,
      trip: p.trip && {
        ...p.trip,
        startedAt: p.trip.startedAt - off,
        endsAt: p.trip.endsAt - off,
        backAt: p.trip.backAt === null ? null : p.trip.backAt - off,
      },
      tripReadyAt: p.tripReadyAt && p.tripReadyAt - off,
      stageStartedAt: p.stageStartedAt - off,
      recoveryUntil: p.recoveryUntil === null ? null : p.recoveryUntil - off,
      buffs: p.buffs.map((b) => ({ ...b, until: b.until - off })),
    });
    const pet = shift(state.pet);
    const housemates = state.housemates.map(shift);
    const visit = {
      ...state.visit,
      until: state.visit.until && state.visit.until - off,
      nextAt: state.visit.nextAt && state.visit.nextAt - off,
      wildAt: state.visit.wildAt && state.visit.wildAt - off,
    };
    const friends = state.friends.map((f) => ({ ...f, mingledAt: f.mingledAt && f.mingledAt - off }));
    const garden = state.garden.map((p) => ({
      ...p,
      moistUntil: p.moistUntil - off,
      rollsFrom: p.rollsFrom - off,
      fertilizedUntil: p.fertilizedUntil - off,
      sickSince: p.sickSince === null ? null : p.sickSince - off,
    }));
    const order = state.delivery.order;
    const delivery = {
      order: order && { ...order, announcedAt: order.announcedAt - off, pickupAt: order.pickupAt - off },
      nextAt: state.delivery.nextAt - off,
    };
    const craving = { ...state.craving, until: state.craving.until - off, nextAt: state.craving.nextAt - off };
    const journeys = {
      ...state.journeys,
      refillAt: state.journeys.refillAt.map((at) => at && at - off),
      percyFreeAt: state.journeys.percyFreeAt && state.journeys.percyFreeAt - off,
    };
    setState({
      ...state, pet, housemates, visit, friends, garden, delivery, craving, journeys, clockOffsetMs: 0, lastUpdated: Date.now(),
    });
  },
});
// Made after the home screen, which clears the page when it starts.
const naming = createNamingBox(root);
const choice = createChoiceBox(root);
const away = createAwayCard(root);
home.update(state, gameNow());
startAudio();
playMusic();
askWhoRetires();
announceMail(lastVisitMessages);
showLevels(startup.levels); // levels reached while away (Percy's pickups)
showFragments(startup.fragments);
tryCheckIn();
if (saved) showAway(saved, saved.lastUpdated);

// Draw the pet every animation frame (about 60 times a second). The sprite
// sheet comes from the pet's stage or character (see src/data/characters.json).
const ctx = setupCanvas(home.canvas);
loadSprites().then((lib) => (sprites = lib));

function render(timeMs: number): void {
  const pet = state.pet;
  // A pet out on a journey isn't in the room.
  const away = isAway(pet);
  let animation: string = getLook(pet);
  if (reaction && timeMs < reaction.until && !pet.asleep) animation = reaction.animation;
  // The other pet in the room, and a friend over to play.
  const other = state.housemates.find((p) => !isAway(p));
  const meeting = home.meetScene();
  const trip = home.tripScene();
  drawRoom(
    ctx,
    away ? undefined : sprites.get(sheetFor(pet)),
    {
      animation,
      glow: !away && pet.starGlow && pet.condition !== 'passed',
      note: away,
      night: isNight(gameNow()),
      lightsOff: pet.asleep,
      fishing: home.fishingPhase(),
      garden: home.gardenScene(),
      delivery: home.deliveryScene(),
      housemate: other && {
        sheet: sprites.get(sheetFor(other)),
        hat: sprites.get(getHat(other.hat)?.sheet ?? ''),
        animation: getLook(other),
        glow: other.starGlow && other.condition !== 'passed',
      },
      petOnLeft: petStandsLeft(state),
      room: state.room,
      trip: trip && {
        place: trip.place,
        pets: trip.pets.map((p) => ({
          sheet: sprites.get(sheetFor(p)),
          hat: sprites.get(getHat(p.hat)?.sheet ?? ''),
          animation: 'cheerful',
          glow: p.starGlow,
        })),
      },
      meeting: meeting && {
        sheet: sprites.get(characterSheet(meeting.friend.character, meeting.friend.variant)),
        animation: meeting.hearts ? 'happy' : 'cheerful',
        hearts: meeting.hearts,
      },
    },
    timeMs,
    away ? undefined : sprites.get(getHat(pet.hat)?.sheet ?? ''),
  );
  requestAnimationFrame(render);
}
requestAnimationFrame(render);

// Keep the world ticking while the game is open...
setInterval(() => setState(simulate(state, gameNow())), CONFIG.liveUpdateSeconds * 1000);

// ...and catch up straight away when you come back to the tab or app.
// Leaving keeps a copy of the game as it was, so coming back can say what
// happened meanwhile.
let leftAs: { state: GameState; at: number } | null = null;
document.addEventListener('visibilitychange', () => {
  if (document.visibilityState === 'hidden') {
    leftAs = { state, at: gameNow() };
  } else {
    tryCheckIn();
    if (leftAs) showAway(leftAs.state, leftAs.at);
    leftAs = null;
  }
});
