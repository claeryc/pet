// The home screen: the pet's room, its stat bars, status messages and the
// action buttons. This file only shows things and passes button presses on.
// The rules for what each button actually does live in src/game/actions.ts.

import { STRINGS } from '../strings';
import { CONFIG } from '../game/config';
import { canPlayMinigames, getLook, hasPassed, isCritical, isNeglected, isRecovering, timeLeftToTreat } from '../game/stats';
import { sheetFor, stageLengthMs } from '../game/growth';
import type { GameState, PetStats } from '../game/state';
import { meadowVisitor } from '../game/meadow';
import { createMenu, type MenuCallbacks } from './menu';
import { baitCount, foodCount, revivalStars } from '../game/economy';
import { createDrawer, type DrawerOption, type Effect } from './drawer';
import { ITEM_ICONS, STAT_ICONS } from './icons';
import type { ActivityId, Food, FoodId } from '../game/actions';
import type { CatchGrade } from '../game/fishing';
import { createFishing, DRAIN_MS, type FishingPhase } from './fishing';
import { createCooking, KITCHEN_OUT_MS } from './cooking';
import { createGarden, GARDEN_OUT_MS } from './garden';
import { createDelivery, DELIVERY_OUT_MS } from './delivery';
import { unreadMail } from '../game/messages';
import { needsTending, type CropId } from '../game/garden';
import { isNew, isUnlocked } from '../game/unlocks';
import { pointsToSpend, reelPerks } from '../game/skills';
import { petAt, ROOM_HEIGHT, ROOM_WIDTH } from '../render/canvas';
import { createMeet, MEET_OUT_MS } from './meet';
import { petStandsLeft } from '../game/friends';
import { needsYou, otherRoom, petsIn, roommates } from '../game/rooms';
import type { Friend } from '../game/state';
import { potAt, type GardenScene } from '../render/garden';
import type { DeliveryScene } from '../render/delivery';
import { formatDuration } from './time';
import { createReveal, type RevealItem } from './reveal';
import { createCraft, type Craft } from './craft';
import { createBackpack } from './backpack';
import type { ShopCategory } from './shop';
import { createFx, type Gains } from './fx';
import { hasBackpack, isAway, nobodyHome } from '../game/presence';
import { formatClock } from './time';
import { createJourneys, JOURNEYS_OUT_MS } from './journeys';
import { createTripView, tripNotes } from './trip';
import type { Pet } from '../game/state';
import { createBath, BATH_OUT_MS } from './bath';
import { bodyBox, poopAt, type BathScene } from '../render/hygiene';
import { SPOTS } from '../render/canvas';
import type { SpriteSheet } from '../render/sprites';

export interface HomeCallbacks extends MenuCallbacks {
  onFeed: (food: FoodId) => void;
  onPlay: (activity: ActivityId) => void;
  onLights: () => void;
  onMedicine: () => void;
  onRevive: () => void; // a pet that passed away: use (or buy) a Revival Star
  onGoodbye: () => void; // ...or let it go
  onCast: () => boolean; // throws the fishing line; false if refused
  onLand: (grade: CatchGrade) => string | null; // the fish landed (a food id), or null
  onToggleBait: () => void;
  onCook: (items: FoodId[]) => FoodId | null; // the dish made, or null if refused
  onPlant: (pot: number, crop: CropId) => void;
  onWater: (pot: number, perfect: boolean) => void;
  onFertilize: (pot: number) => void;
  onCure: (pot: number) => void;
  onHarvest: (pot: number) => void;
  onClear: (pot: number) => void;
  onPetTap: () => void; // a quick cuddle
  onPutInBox: (box: number) => void; // Percy's order
  onTakeFromBox: (box: number) => void;
  onFillAll: () => void;
  onMeet: (friend: string) => boolean; // true if they played
  onGift: (friend: string, food: FoodId) => void;
  onMingle: (friend: string) => void;
  onAddFriend: () => void;
  onSwitchPet: (id: string) => void; // tapped the other pet in the room
  onMakeRoom: () => void; // an egg is waiting in the nest
  onMeadowVisitor: () => void; // a pet from the Meadow dropped by
  onRoomDoor: () => void; // the door to the other room (with the Family Home)
  onCollectPoop: (petId: string, slot: number) => void;
  onBathe: () => boolean; // the bath is done and it's dry; false if refused
  petSheet: () => SpriteSheet | undefined; // the pet's sprite, for where its body is
}

export interface HomeScreen {
  canvas: HTMLCanvasElement;
  update: (state: GameState, now: number) => void;
  toast: (message: string, shop?: ShopCategory) => void; // `shop`: offer a button to that part of the Shop
  // Like toast, but waits for the message showing now to finish first.
  notice: (message: string) => void;
  // Shows off something you just got, over the stat bars.
  reveal: (item: RevealItem) => void;
  showJournal: (place: string) => void; // the travel journal, open at a place
  craft: Craft['play']; // fragments coming together into a Revival Star
  // A pet's backpack over the stat bars, waiting to be tapped open.
  backpack: (name: string, onOpen: () => void) => void;
  // Floats the stat changes from something you just did up from the pet.
  gains: (gains: Gains) => void;
  fishingPhase: () => FishingPhase; // so the room can draw the line and bobber
  gardenScene: () => GardenScene | null; // so the room can turn into the garden
  deliveryScene: () => DeliveryScene | null; // ...or Percy's meadow, for his order
  meetScene: () => { friend: Friend; hearts: boolean } | null; // a friend over to play
  tripScene: () => { place: string; pets: Pet[] } | null; // looking at the current trip
  bathScene: (timeMs: number) => BathScene | null; // the suds, drips and sponge or dryer
  hidesSmell: () => boolean; // soapy, wet or just washed: no smell lines
  // With every pet out on a journey, shows the trip instead of the empty room.
  showTripIfEmpty: () => void;
}

// Pixel icons drawn on a 12x12 grid, so they match the pixel-art style.
const GEAR_ICON = `
  <svg viewBox="0 0 12 12" width="24" height="24" shape-rendering="crispEdges" aria-hidden="true">
    <path fill="currentColor" d="M4 0h4v1H4zM1 1h2v1H1zM4 1h4v1H4zM9 1h2v1H9zM1 2h10v1H1zM2 3h8v1H2zM1 4h4v1H1zM7 4h4v1H7zM0 5h4v1H0zM8 5h4v1H8zM0 6h4v1H0zM8 6h4v1H8zM1 7h4v1H1zM7 7h4v1H7zM2 8h8v1H2zM1 9h10v1H1zM1 10h2v1H1zM4 10h4v1H4zM9 10h2v1H9zM4 11h4v1H4z"/>
  </svg>`;
const MOON_ICON = `
  <svg viewBox="0 0 12 12" width="24" height="24" shape-rendering="crispEdges" aria-hidden="true">
    <path fill="currentColor" d="M4 1h4v1H4zM2 2h3v1H2zM1 3h3v2H1zM0 5h4v2H0zM1 7h4v1H1zM1 8h10v1H1zM2 9h8v1H2zM4 10h4v1H4zM6 7h5v1H6zM8 6h3v1H8z"/>
  </svg>`;
const SUN_ICON = `
  <svg viewBox="0 0 12 12" width="24" height="24" shape-rendering="crispEdges" aria-hidden="true">
    <path fill="currentColor" d="M5 0h2v2H5zM1 1h2v2H1zM9 1h2v2H9zM4 3h4v1H4zM3 4h6v4H3zM4 8h4v1H4zM0 5h2v2H0zM10 5h2v2h-2zM1 9h2v2H1zM9 9h2v2H9zM5 10h2v2H5z"/>
  </svg>`;

// One stat: its icon, then a bar of 10 little blocks. Each block is 10
// points, and a block lights up as soon as the stat reaches into it.
const STAT_SEGMENTS = 10;

// An open Feed, Play or Menu list is at least this tall (px), and stops
// this far below the stat bars.
const DRAWER_MIN = 268;
const DRAWER_GAP = 12;

// After a mini-game closes, the bars start empty and fill back up one block
// at a time, this many ms per block: a full bar takes 1.5 seconds, a bar at
// 10% just a moment.
const REFILL_MS_PER_SEGMENT = 150;

interface StatBar {
  el: HTMLElement;
  set: (v: number) => void;
  // Empties the bar, waits `delayMs`, then fills it back up to its value.
  refill: (delayMs: number) => void;
  // Moves to a new value one block at a time (switching pets).
  slide: (v: number) => void;
}

function statBar(label: string, icon: string): StatBar {
  const el = document.createElement('div');
  el.className = 'stat';
  el.setAttribute('role', 'meter');
  el.setAttribute('aria-label', label);
  el.setAttribute('aria-valuemin', '0');
  el.setAttribute('aria-valuemax', '100');
  el.title = label;
  const iconEl = document.createElement('span');
  iconEl.className = 'stat-icon';
  iconEl.innerHTML = icon;
  const track = document.createElement('div');
  track.className = 'stat-segments';
  const segments = Array.from({ length: STAT_SEGMENTS }, () => {
    const seg = document.createElement('span');
    seg.className = 'stat-seg';
    return seg;
  });
  track.append(...segments);
  el.append(iconEl, track);
  let value = 0;
  let filling = false; // true while refilling: shown blocks count up on their own
  let timer = 0;
  let shown = 0; // blocks lit right now
  const litFor = (v: number) => Math.ceil(v / (100 / STAT_SEGMENTS));
  let ready = false; // false until the first value, so the bars don't glow on load
  // `glow`: blocks that just lit glow softly (when the stat went up, not
  // while the bar refills or slides on its own).
  function show(lit: number, glow = false): void {
    const before = shown;
    shown = lit;
    const low = value < CONFIG.lowStatThreshold;
    segments.forEach((seg, i) => {
      if (glow && i >= before && i < lit) {
        seg.classList.remove('pop');
        void seg.offsetWidth;
        seg.classList.add('pop');
      }
      seg.classList.toggle('on', i < lit);
      seg.classList.toggle('low', low);
    });
  }
  return {
    el,
    set(v: number) {
      value = v;
      if (!filling) show(litFor(v), ready);
      ready = true;
      el.setAttribute('aria-valuenow', String(Math.round(v)));
      el.title = `${label}: ${Math.round(v)}`;
    },
    refill(delayMs) {
      clearTimeout(timer);
      filling = true;
      show(0);
      let lit = 0;
      // One more block each step, until it reaches the bar's value (which
      // may change while it fills).
      const step = () => {
        if (lit >= litFor(value)) {
          filling = false;
          show(litFor(value));
          return;
        }
        show(++lit);
        timer = window.setTimeout(step, REFILL_MS_PER_SEGMENT);
      };
      timer = window.setTimeout(step, delayMs);
    },
    slide(v) {
      clearTimeout(timer);
      value = v;
      filling = true;
      el.setAttribute('aria-valuenow', String(Math.round(v)));
      el.title = `${label}: ${Math.round(v)}`;
      // One block up or down each step, until it reaches the new value.
      const step = () => {
        const target = litFor(value);
        if (shown === target) {
          filling = false;
          show(target);
          return;
        }
        show(shown + Math.sign(target - shown));
        timer = window.setTimeout(step, SLIDE_MS_PER_SEGMENT);
      };
      step();
    },
  };
}

// Switching pets: the bars move to the other pet's values this many ms per
// block.
const SLIDE_MS_PER_SEGMENT = 70;

// The other pet in the room you're looking at (not the other room's).
const roommate = (s: GameState): Pet | undefined => roommates(s)[0];

// Two pets in the room: the other one is there, not out on a journey.
const twoHome = (s: GameState) => { const mate = roommate(s); return !!mate && !isAway(mate); };

function button(label: string, className: string, onClick: () => void): HTMLButtonElement {
  const b = document.createElement('button');
  b.textContent = label;
  b.className = className;
  b.addEventListener('click', onClick);
  return b;
}

export function createHomeScreen(root: HTMLElement, cb: HomeCallbacks): HomeScreen {
  root.innerHTML = '';

  // The home screen is kept quiet: just the pet, its bars and the buttons.
  // The pet's name and character are saved for the Family Tree, and gold
  // shows in the Shop. How the pet feels is read out to
  // screen readers through the room's label.
  const canvas = document.createElement('canvas');
  canvas.className = 'room';
  canvas.setAttribute('role', 'img');
  // Percy's parcel sits in the top corner of the room while there's an
  // order to fill. Tapping it goes out to Percy.
  const roomWrap = document.createElement('div');
  roomWrap.className = 'room-wrap';
  const parcel = document.createElement('button');
  parcel.className = 'parcel-btn';
  parcel.innerHTML = ITEM_ICONS.parcel;
  parcel.setAttribute('aria-label', STRINGS.delivery.open);
  parcel.title = STRINGS.delivery.open;
  parcel.hidden = true;
  parcel.addEventListener('click', () => startDelivery());
  // A tile in the corner, next to the parcel, with the pet's picture while
  // it's out on a journey: tapping it shows the current trip. Two pets on
  // different trips get a tile each.
  const noteBtns = [0, 1].map((i) => {
    const b = document.createElement('button');
    b.className = 'note-btn';
    b.hidden = true;
    b.addEventListener('click', () => {
      const pet = latest && tripNotes(latest.state)[i];
      if (!latest || !pet) return;
      toggleTrip(pet.id);
    });
    return b;
  });
  const noteShows = ['', ''];
  let noteRetry = 0;
  // The trip tiles in the corner: the pet on each.
  function refreshNotes(state: GameState): void {
    const notes = tripNotes(state);
    noteBtns.forEach((b, i) => {
      const p = notes[i];
      b.hidden = !p;
      if (!p) return;
      b.setAttribute('aria-label', STRINGS.journeys.tripOpen(p.name));
      b.title = STRINGS.journeys.tripOpen(p.name);
      // The note until the pet's picture is ready.
      const url = cb.characterImage(sheetFor(p));
      if (!url) {
        if (noteShows[i] !== 'note') b.innerHTML = ITEM_ICONS.tripNote;
        noteShows[i] = 'note';
        // Look again shortly: the sprites may still be loading.
        if (!noteRetry) {
          noteRetry = window.setTimeout(() => {
            noteRetry = 0;
            if (latest) refreshNotes(latest.state);
          }, 400);
        }
        return;
      }
      const shows = `${p.id}:${sheetFor(p)}`;
      if (shows === noteShows[i]) return;
      noteShows[i] = shows;
      const face = document.createElement('span');
      face.className = 'portrait note-face';
      face.style.backgroundImage = `url('${url}')`;
      b.replaceChildren(face);
    });
  }
  // Percy's parcel and the notes, side by side in the top corner, the
  // parcel first (from the right).
  const corner = document.createElement('div');
  corner.className = 'room-corner';
  corner.append(parcel, ...noteBtns);
  // The pet's craving: a thought bubble over its head with the food in it.
  // Tapping it opens Feed when you have that food. Where to get it is for
  // the player to work out (the recipe book helps), so otherwise it just
  // gives a little shake.
  const bubble = document.createElement('button');
  bubble.className = 'craving-bubble';
  bubble.innerHTML = '<span class="craving-cloud"></span><span class="craving-dot craving-dot-1"></span><span class="craving-dot craving-dot-2"></span>';
  const bubbleFood = bubble.querySelector<HTMLElement>('.craving-cloud')!;
  bubble.hidden = true;
  bubble.addEventListener('click', () => tapBubble());
  // Feedback over the room: stat changes, hearts, food and coins. They
  // start from the pet: its middle across (see SPOTS in render/canvas.ts),
  // and about where a grown-up's head and mouth are.
  const PET_X = { middle: 0.5, left: 0.28, right: 0.72 } as const;
  const fx = createFx(() => ({
    x: PET_X[(roomWrap.dataset.spot ?? 'middle') as keyof typeof PET_X] ?? 0.5,
    head: 0.32,
    mouth: 0.64,
    food: 0.72,
  }));
  // The door in the other top corner, once there's a Family Home: it goes
  // to the other room, or moves a pet there. A dot on it says a pet in
  // the other room needs you.
  const door = document.createElement('button');
  door.className = 'note-btn room-door';
  door.innerHTML = ITEM_ICONS.roomDoor;
  door.setAttribute('aria-label', STRINGS.familyHome.door);
  door.hidden = true;
  door.addEventListener('click', () => cb.onRoomDoor());
  roomWrap.append(canvas, fx.el, bubble, corner, door);

  // Warning / sick / recovering / passed away banner, hidden when all is well.
  const banner = document.createElement('div');
  banner.className = 'banner';
  const bannerText = document.createElement('p');
  const medicine = button(STRINGS.buttons.medicine, 'btn btn-medicine', cb.onMedicine);
  const revive = button(STRINGS.buttons.revive, 'btn', cb.onRevive);
  const goodbye = button(STRINGS.buttons.goodbye, 'btn btn-soft', cb.onGoodbye);
  const passedButtons = document.createElement('div');
  passedButtons.className = 'banner-buttons';
  passedButtons.append(revive, goodbye);
  // A pet out on a journey can be called home, and one that's back has a
  // backpack to open.
  const openBackpack = button(STRINGS.journeys.openBackpack, 'btn', () => latest && cb.onOpenBackpack(latest.state.pet.id));
  const makeRoom = button(STRINGS.friends.makeRoom, 'btn', () => cb.onMakeRoom());
  const sayHello = button(STRINGS.meadow.sayHello, 'btn', () => cb.onMeadowVisitor());
  banner.append(bannerText, medicine, passedButtons, openBackpack, makeRoom, sayHello);

  const bars: Record<keyof PetStats, StatBar> = {
    hunger: statBar(STRINGS.stats.hunger, STAT_ICONS.hunger),
    happiness: statBar(STRINGS.stats.happiness, STAT_ICONS.happiness),
    health: statBar(STRINGS.stats.health, STAT_ICONS.health),
    energy: statBar(STRINGS.stats.energy, STAT_ICONS.energy),
  };
  const stats = document.createElement('div');
  stats.className = 'stats';
  stats.append(...Object.values(bars).map((b) => b.el));

  const actions = document.createElement('div');
  actions.className = 'actions';

  // Turns stat changes like { hunger: 20, energy: -8 } into effect chips.
  const statEffects = (changes: Partial<Record<keyof PetStats, number>>): Effect[] =>
    (Object.entries(changes) as [keyof PetStats, number][])
      .filter(([, v]) => v !== undefined && v !== 0)
      .map(([stat, v]) => {
        const text = `${v > 0 ? '+' : ''}${v}`;
        return {
          icon: STAT_ICONS[stat],
          text,
          title: `${text} ${STRINGS.stats[stat]}`,
          kind: v > 0 ? 'up' : 'down',
        };
      });

  // The pet's name, for messages. Updated in update().
  let petName = '';
  let petAsleep = false;
  let petIsEgg = false;
  let petAway = false; // out on a journey: nobody's home
  const drawerSetup = {
    row: actions,
    comingSoon: STRINGS.menu.comingSoon,
    beforeOpen: () =>
      petAway ? STRINGS.blocked.away(petName)
      : petIsEgg ? STRINGS.blocked.egg(petName) : petAsleep ? STRINGS.blocked.asleep(petName) : null,
    onBlocked: (msg: string) => showToast(msg),
    onOpen: () => fitDrawers(),
  };

  // The Feed panel: the cooking pot first (once cooking has opened up),
  // then the food you have, most recently fed first.
  const feedOptions: DrawerOption[] = [
    {
      icon: ITEM_ICONS.cooking,
      label: STRINGS.cooking.open,
      effects: [],
      onPick: () => startCooking(),
    },
  ];
  const COOK_ROW = 0;
  const foodRow = (i: number) => i + 1; // the foods come after the pot
  for (const f of CONFIG.foods as readonly Food[]) {
    const effects = statEffects({ hunger: f.hunger, happiness: f.happiness, health: f.health, energy: f.energy });
    if (f.slowHunger) {
      const { hours, percent } = f.slowHunger;
      effects.push({
        icon: STAT_ICONS.timer,
        text: `${hours}h -${percent}%`,
        title: STRINGS.effects.slowHunger(percent, hours),
        kind: 'timer',
      });
    }
    feedOptions.push({
      icon: ITEM_ICONS[f.id],
      label: STRINGS.foods[f.id],
      effects,
      onPick: (row) => fx.feed(row.querySelector('.drawer-option-icon') ?? row, ITEM_ICONS[f.id], () => cb.onFeed(f.id)),
    });
  }
  // The order the Feed rows were last put in, so we only move them when
  // it changes.
  let feedOrderKey = '';
  // The food rows wearing the craving heart right now.
  const cravedRows = new Set<number>();
  const playOptions: DrawerOption[] = [
    ...CONFIG.activities.map((a) => ({
      icon: ITEM_ICONS[a.id],
      label: STRINGS.activities[a.id],
      effects: statEffects({ happiness: a.happiness, energy: a.energy }),
      onPick: () => cb.onPlay(a.id),
    })),
    // Meeting friends, right after the quick ones.
    {
      icon: ITEM_ICONS.meet,
      label: STRINGS.minigames.meet,
      effects: statEffects({ happiness: CONFIG.friends.meet.happiness, energy: CONFIG.friends.meet.energy }),
      onPick: () => startMeet(),
    },
    {
      icon: ITEM_ICONS.fishing,
      label: STRINGS.minigames.fishing,
      effects: statEffects({ energy: -CONFIG.fishing.energyPerCast }), // per cast
      onPick: () => startFishing(),
    },
    {
      icon: ITEM_ICONS.garden,
      label: STRINGS.minigames.garden,
      effects: [],
      onPick: () => startGarden(),
    },
    // Journeys take over the stat bars, like the garden.
    {
      icon: ITEM_ICONS.journey,
      label: STRINGS.minigames.journeys,
      effects: [],
      onPick: () => openJourneys(),
    },
  ];

  const MEET_ROW = CONFIG.activities.length; // after Cuddle and Tickle
  const GARDEN_ROW = MEET_ROW + 2; // after Meet and Fishing
  const JOURNEYS_ROW = GARDEN_ROW + 1;
  const feedDrawer = createDrawer({ id: 'feed', label: STRINGS.buttons.feed, options: feedOptions, ...drawerSetup });
  const playDrawer = createDrawer({ id: 'play', label: STRINGS.buttons.play, options: playOptions, ...drawerSetup });

  // The gear button opens the menu (shop, inventory, settings and more) the
  // same way Feed and Play open. It always opens, even for an egg.
  let menuDrawer: ReturnType<typeof createDrawer> | null = null;
  // The Shop reaches up over the stat bars as well (nobody needs them while
  // shopping), so its rows get the room under its tabs.
  let menuOverStats = false;
  const menu = createMenu(
    { ...cb, onOpenDelivery: () => startDelivery(), onOpenMeet: () => startMeet(), onOpenJourneys: () => openJourneys() },
    () => menuDrawer?.isOpen() ?? false,
    () => menuDrawer?.close(),
    (page) => {
      if (menuOverStats === (page === 'shop')) return;
      menuOverStats = page === 'shop';
      if (menuDrawer) fitDrawers();
    },
  );
  menuDrawer = createDrawer({
    ...drawerSetup,
    id: 'menu',
    label: STRINGS.buttons.menu,
    icon: GEAR_ICON,
    content: menu.el,
    onOpen: () => {
      fitDrawers();
      menu.reset();
    },
    beforeOpen: () => null,
  });
  const lights = button('', 'btn btn-icon', cb.onLights);

  // An open Feed, Play or Menu panel reaches up to just under the stat bars,
  // so taller screens show more rows. Small screens keep the old height
  // (the panel covers the bars there). The panel's button, frame and
  // padding take about 74px. The Shop goes over the bars, its top edge
  // lined up with theirs (the frame itself is 58px).
  function fitDrawers(): void {
    const bottom = actions.getBoundingClientRect().bottom;
    const slot = statSlot.getBoundingClientRect();
    const fit = (room: number) => `${Math.max(DRAWER_MIN, Math.floor(room))}px`;
    const underBars = fit(bottom - slot.bottom - DRAWER_GAP - 74);
    actions.style.setProperty('--drawer-fit', underBars);
    menuDrawer?.el.style.setProperty('--drawer-fit', menuOverStats ? fit(bottom - slot.top - 58) : underBars);
    // The travel journal is a book, so it takes the whole screen above the
    // button, over the room too.
    actions.style.setProperty('--drawer-full', fit(bottom - roomWrap.getBoundingClientRect().top - 74));
  }
  window.addEventListener('resize', fitDrawers);

  actions.append(feedDrawer.el, playDrawer.el, menuDrawer.el, lights);

  // Journeys: the board of trips, then the lunchbox, over the stat bars.
  function openJourneys(): void {
    if (petAway) return showToast(STRINGS.blocked.away(petName));
    if (actions.hidden) return; // already busy with something else
    cb.onSeen('journeys');
    feedDrawer.close();
    playDrawer.close();
    menuDrawer!.close();
    hideActions();
    stats.hidden = true; // the board takes the bars' place, and can be taller
    if (latest) journeys.update(latest.state, latest.now);
    journeys.start();
    cb.onGuide('journeys');
  }

  // Holding the pet opens the Wardrobe, in the gear panel.
  function openWardrobe(): void {
    if (petIsEgg) return showToast(STRINGS.wardrobe.eggNoHat);
    feedDrawer.close();
    playDrawer.close();
    if (!menuDrawer!.isOpen()) menuDrawer!.open();
    menu.showWardrobe();
  }

  // Tap the pet to cuddle it; hold it to open the Wardrobe. Only while the
  // normal buttons are showing (not while fishing or cooking).
  canvas.tabIndex = 0;
  let holdTimer = 0;
  let press: { x: number; y: number; held: boolean } | null = null;
  let lastCuddle = -Infinity;
  const roomPoint = (e: PointerEvent) => {
    const rect = canvas.getBoundingClientRect();
    return {
      x: ((e.clientX - rect.left) / rect.width) * ROOM_WIDTH,
      y: ((e.clientY - rect.top) / rect.height) * ROOM_HEIGHT,
    };
  };
  // Which pet a tap is on: the one you're looking after, the other one in
  // the room, or neither.
  const tappedPet = (e: PointerEvent) => {
    const { x, y } = roomPoint(e);
    const s = latest?.state;
    if (petAway) return null; // nobody's home
    return petAt(x, y, !!s && twoHome(s), !s || petStandsLeft(s));
  };
  function cuddle(): void {
    const now = performance.now();
    if (now - lastCuddle < CONFIG.petting.tapCooldownMs) return; // one cuddle per burst of taps
    lastCuddle = now;
    cb.onPetTap();
  }
  canvas.addEventListener('pointerdown', (e) => {
    // In the garden, tapping a pot picks it.
    if (garden.active()) {
      const { x, y } = roomPoint(e);
      const pot = potAt(x, y, latest?.state.garden.length ?? CONFIG.garden.plots);
      if (pot >= 0) garden.select(pot);
      return;
    }
    // In the bath, holding and rubbing works the sponge or the dryer.
    if (bath.active()) {
      const { x, y } = roomPoint(e);
      canvas.setPointerCapture?.(e.pointerId);
      bath.down(x, y, petBody());
      return;
    }
    if (actions.hidden) return;
    // A poop on the floor: pick it up.
    if (tapPoop(e)) return;
    const which = tappedPet(e);
    if (!which) return;
    // Tapping the other pet looks after it instead.
    const other = latest && roommate(latest.state);
    if (which === 'housemate' && other) return cb.onSwitchPet(other.id);
    press = { x: e.clientX, y: e.clientY, held: false };
    clearTimeout(holdTimer);
    holdTimer = window.setTimeout(() => {
      if (!press) return;
      press.held = true;
      navigator.vibrate?.(10);
      openWardrobe();
    }, CONFIG.petting.holdMs);
  });
  canvas.addEventListener('pointermove', (e) => {
    if (bath.active()) {
      const { x, y } = roomPoint(e);
      bath.move(x, y, petBody());
      return;
    }
    // Moving a finger away (to scroll, say) cancels the tap or hold.
    if (press && Math.hypot(e.clientX - press.x, e.clientY - press.y) > 10) {
      clearTimeout(holdTimer);
      press = null;
    }
  });
  canvas.addEventListener('pointerup', () => {
    bath.up();
    clearTimeout(holdTimer);
    if (press && !press.held) {
      // A smelly pet gets a bath instead of a cuddle.
      if (smelly()) startBath();
      else {
        if (!petIsEgg && !petAsleep) fx.hearts(press.x, press.y); // every tap, even the ones that don't count as a cuddle
        cuddle();
      }
    }
    press = null;
  });
  canvas.addEventListener('pointercancel', () => {
    bath.up();
    clearTimeout(holdTimer);
    press = null;
  });
  canvas.addEventListener('pointerleave', () => bath.up());
  // A right-click, or the keyboard's menu key, opens the Wardrobe too, and
  // Enter or Space cuddles.
  canvas.addEventListener('contextmenu', (e) => {
    e.preventDefault();
    // Some phones send this for a long press too: count it as the hold.
    if (actions.hidden || press?.held) return;
    clearTimeout(holdTimer);
    if (press) press.held = true;
    openWardrobe();
  });
  canvas.addEventListener('keydown', (e) => {
    if (actions.hidden || (e.key !== 'Enter' && e.key !== ' ')) return;
    e.preventDefault();
    // Poop first, then a bath, then a cuddle.
    const s = latest?.state;
    const poop = s && !petAway ? s.pet.hygiene.poops[0] : undefined;
    if (s && poop) return cb.onCollectPoop(s.pet.id, poop.slot);
    if (smelly()) return startBath();
    cuddle();
  });

  // Where each pet at home stands (the left edge of its frame), for
  // finding poops and the pet's body.
  function petLefts(s: GameState): { pet: number; other: number | null } {
    if (!twoHome(s)) return { pet: SPOTS.middle, other: null };
    const left = petStandsLeft(s);
    return { pet: left ? SPOTS.left : SPOTS.right, other: left ? SPOTS.right : SPOTS.left };
  }
  function petBody() {
    const s = latest?.state;
    return bodyBox(cb.petSheet(), s ? petLefts(s).pet : SPOTS.middle);
  }
  // Picks up a poop under the tap, yours or the other pet's. True if it did.
  function tapPoop(e: PointerEvent): boolean {
    const s = latest?.state;
    if (!s || petAway) return false;
    const { x, y } = roomPoint(e);
    const lefts = petLefts(s);
    const other = roommate(s);
    const candidates: [Pet, number][] = [[s.pet, lefts.pet]];
    if (other && lefts.other !== null) candidates.push([other, lefts.other]);
    for (const [p, left] of candidates) {
      const slot = poopAt(x, y, left, p.hygiene.poops.map((q) => q.slot));
      if (slot >= 0) {
        cb.onCollectPoop(p.id, slot);
        return true;
      }
    }
    return false;
  }
  // Smelly, and up for a bath right now.
  const smelly = () => {
    const p = latest?.state.pet;
    return !!p && p.hygiene.smelly && !petAway && !petIsEgg && !petAsleep && p.condition !== 'passed';
  };

  // Bath time: the sponge and dryer panel over the stat bars, and [Close].
  const bath = createBath({
    onClean: cb.onBathe,
    onExit: () => {
      roomWrap.classList.remove('is-bathing');
      showActions(BATH_OUT_MS);
    },
    toast: (msg) => showToast(msg),
  });
  function startBath(): void {
    if (actions.hidden) return; // already busy with something else
    feedDrawer.close();
    playDrawer.close();
    menuDrawer!.close();
    hideActions();
    stats.setAttribute('aria-hidden', 'true'); // covered by the panel for now
    roomWrap.classList.add('is-bathing');
    bath.start(petName);
  }
  function stopBath(): void {
    if (!bath.active()) return;
    bath.stop();
    roomWrap.classList.remove('is-bathing');
    showActions(BATH_OUT_MS);
  }

  // Fishing swaps the button row for its own [Cancel] [Cast] row, and the
  // stat bars for a pond of the same size.
  const fishing = createFishing({
    onCast: cb.onCast,
    onLand: cb.onLand,
    onToggleBait: cb.onToggleBait,
    onExit: () => showActions(DRAIN_MS),
    toast: (msg) => showToast(msg),
  });
  // The latest state, so Fishing can check the pet is up for it.
  let latest: { state: GameState; now: number } | null = null;
  function startFishing(): void {
    if (latest && !canPlayMinigames(latest.state.pet, latest.now)) {
      return showToast(STRINGS.blocked.resting(petName));
    }
    hideActions();
    stats.setAttribute('aria-hidden', 'true'); // under water for now
    fishing.start();
    cb.onGuide('fishing');
  }
  // Cooking works the same way: its own [Close] [Recipes] [Cook] row, and a
  // kitchen counter that slides up over the stat bars.
  const cooking = createCooking({
    onCook: cb.onCook,
    onExit: () => showActions(KITCHEN_OUT_MS),
    toast: showToast,
  });
  function startCooking(): void {
    cb.onSeen('cooking');
    hideActions();
    stats.setAttribute('aria-hidden', 'true'); // covered by the counter for now
    if (latest) cooking.update(latest.state);
    cooking.start();
    cb.onGuide('cooking');
  }
  // The garden too: its own buttons, and a bed of pots that slides up over
  // the stat bars.
  const garden = createGarden({
    onPlant: cb.onPlant,
    onWater: cb.onWater,
    onFertilize: cb.onFertilize,
    onCure: cb.onCure,
    onHarvest: cb.onHarvest,
    onClear: cb.onClear,
    onExit: () => showActions(GARDEN_OUT_MS),
    toast: showToast,
  });
  function startGarden(): void {
    if (petAway) return showToast(STRINGS.blocked.away(petName));
    if (actions.hidden) return; // already busy with something else
    feedDrawer.close();
    playDrawer.close();
    menuDrawer!.close();
    cb.onSeen('garden');
    hideActions();
    stats.setAttribute('aria-hidden', 'true'); // covered by the garden for now
    if (latest) garden.update(latest.state, latest.now);
    garden.start();
    cb.onGuide('garden');
  }
  // Percy's order: his meadow, its own [Close] [Fill all] row, and a
  // panel of boxes that slides up over the stat bars.
  const delivery = createDelivery({
    onPut: cb.onPutInBox,
    onTake: cb.onTakeFromBox,
    onFillAll: cb.onFillAll,
    onExit: () => {
      showActions(DELIVERY_OUT_MS);
      refreshParcel();
    },
    toast: (msg) => showToast(msg),
  });
  function startDelivery(): void {
    if (actions.hidden) return; // already busy with something else
    if (petAway) return showToast(STRINGS.blocked.away(petName));
    feedDrawer.close();
    playDrawer.close();
    menuDrawer!.close();
    hideActions();
    stats.setAttribute('aria-hidden', 'true'); // covered by the boxes for now
    if (latest) delivery.update(latest.state, latest.now);
    delivery.start();
    cb.onGuide('delivery');
  }
  // Meeting a friend: they come over to the room, and a panel with their
  // hearts slides up over the stat bars.
  const meet = createMeet({
    onMeet: cb.onMeet,
    onGift: cb.onGift,
    onMingle: cb.onMingle,
    onAdd: cb.onAddFriend,
    onExit: () => showActions(MEET_OUT_MS),
    toast: (msg) => showToast(msg),
    characterImage: cb.characterImage,
  });
  function startMeet(): void {
    if (actions.hidden) return; // already busy with something else
    if (petAway) return showToast(STRINGS.blocked.away(petName));
    cb.onSeen('meet');
    feedDrawer.close();
    playDrawer.close();
    menuDrawer!.close();
    hideActions();
    stats.setAttribute('aria-hidden', 'true'); // covered by the panel for now
    if (latest) meet.update(latest.state, latest.now);
    meet.start();
    cb.onGuide('meet');
  }
  const journeys = createJourneys({
    onSetOff: cb.onSetOff,
    onCallHome: cb.onCallHome,
    onOpenBackpack: cb.onOpenBackpack,
    onHoliday: cb.onHoliday,
    onExit: () => {
      stats.hidden = latest?.state.pet.stage === 'egg';
      showActions(JOURNEYS_OUT_MS);
      // The last pet just set off: follow it rather than look at an empty room.
      showTripIfEmpty();
    },
    onWater: () => {
      stats.hidden = false;
      showActions(0);
      startGarden();
    },
    toast: (msg) => showToast(msg),
    characterImage: cb.characterImage,
  });
  // The current trip: the place in the room, and a map over the stat bars.
  const trip = createTripView({
    characterImage: cb.characterImage,
    onClose: () => {
      for (const b of noteBtns) b.classList.remove('is-open');
      stats.hidden = latest?.state.pet.stage === 'egg';
      showActions(0);
    },
    onCallHome: cb.onCallHome,
  });
  // Tapping a note opens that trip, in place of the bars and the buttons;
  // tapping it again (or Close) goes back.
  let tripFor = '';
  function toggleTrip(petId: string): void {
    if (trip.active()) {
      const same = petId === tripFor;
      trip.close();
      if (same) return;
    }
    if (actions.hidden) return; // busy with something else
    feedDrawer.close();
    playDrawer.close();
    menuDrawer!.close();
    hideActions();
    stats.hidden = true;
    tripFor = petId;
    trip.open(petId);
    if (!trip.active()) {
      showActions(0);
      return;
    }
    if (latest) tripNotes(latest.state).forEach((p, i) => noteBtns[i].classList.toggle('is-open', p.id === petId));
  }
  // With nobody home the room is empty, so the trip shows instead (the
  // first one, when two pets went to different places). Close still goes
  // back to the room.
  function showTripIfEmpty(): void {
    if (!latest || !nobodyHome(latest.state) || trip.active()) return;
    const pet = tripNotes(latest.state)[0];
    if (pet) toggleTrip(pet.id);
  }
  // Off to another scene: the normal buttons go, and the parcel and the
  // craving bubble with them, straight away rather than on the next tick.
  function hideActions(): void {
    actions.hidden = true;
    refreshParcel();
  }
  function refreshParcel(): void {
    parcel.hidden = !latest?.state.delivery.order || actions.hidden || latest.state.pet.stage === 'egg' || petAway;
    refreshBubble();
  }
  // The bubble shows while the pet is craving something, it's awake and
  // the normal buttons are up (not while fishing, gardening and so on).
  let bubbleFor: string | null = null;
  function refreshBubble(): void {
    const s = latest?.state;
    const food = s?.craving.food ?? null;
    bubble.hidden = !s || !food || actions.hidden || s.pet.asleep || s.pet.stage === 'egg' || petAway;
    if (!food) {
      bubbleFor = null;
      return;
    }
    const label = STRINGS.craving.bubble(petName, STRINGS.foods[food as FoodId]);
    bubble.setAttribute('aria-label', label);
    bubble.title = label;
    if (food === bubbleFor) return;
    bubbleFor = food;
    bubbleFood.innerHTML = ITEM_ICONS[food] ?? '';
    // Pop in again for each new craving.
    bubble.classList.remove('pop');
    void bubble.offsetHeight;
    bubble.classList.add('pop');
  }
  function tapBubble(): void {
    const s = latest?.state;
    const food = s?.craving.food;
    if (!s || !food) return;
    if (foodCount(s, food as FoodId) > 0) {
      playDrawer.close();
      menuDrawer!.close();
      if (!feedDrawer.isOpen()) feedDrawer.open();
      return;
    }
    bubble.classList.remove('nudge');
    void bubble.offsetHeight;
    bubble.classList.add('nudge');
  }
  function stopFishing(): void {
    if (fishing.phase() === 'off') return;
    fishing.stop();
    showActions();
  }
  // Back to the normal buttons, which pop back up. The stat bars appear
  // empty as the water drains and then fill back up to their values.
  function showActions(delayMs = DRAIN_MS): void {
    stats.removeAttribute('aria-hidden');
    if (!matchMedia('(prefers-reduced-motion: reduce)').matches) {
      for (const bar of Object.values(bars)) bar.refill(delayMs);
    }
    actions.hidden = false;
    refreshParcel();
    // Gold that came in while busy elsewhere flies in now.
    if (goldFrom !== null && latest) fx.gold(goldFrom, latest.state.gold);
    goldFrom = null;
    actions.classList.remove('rise-in');
    void actions.offsetHeight;
    actions.classList.add('rise-in');
  }

  // The stat bars, the pond, the kitchen counter and the garden share one
  // spot: each of them rises over the bars.
  const statSlot = document.createElement('div');
  statSlot.className = 'stat-slot';
  // The item reveal plays over all of them.
  const reveal = createReveal();
  const craft = createCraft();
  const backpack = createBackpack();
  statSlot.append(stats, bath.panel, journeys.panel, trip.panel, fishing.pond, cooking.kitchen, garden.beds, delivery.panel, meet.panel, backpack.el, reveal.el, craft.el);

  // A short message that pops up and fades, e.g. "Mochi is asleep". When
  // you've run out of something the Shop sells, it has a Shop button too.
  const toastEl = document.createElement('div');
  toastEl.className = 'toast';
  const toastText = document.createElement('span');
  const toastShop = button(STRINGS.menu.shop, 'toast-action', () => {
    toastEl.classList.remove('show');
    if (toastShopAt) goShop(toastShopAt);
  });
  toastEl.append(toastText, toastShop);
  let toastShopAt: ShopCategory | null = null;
  let toastTimer = 0;
  const waiting: string[] = []; // notices waiting their turn
  function showToast(message: string, shop?: ShopCategory): void {
    toastShopAt = shop && latest && isUnlocked(latest.state, 'shop') ? shop : null;
    toastText.textContent = message;
    toastShop.hidden = !toastShopAt;
    toastEl.classList.toggle('has-action', !!toastShopAt);
    placeToast();
    toastEl.classList.add('show');
    clearTimeout(toastTimer);
    toastTimer = window.setTimeout(() => {
      toastEl.classList.remove('show');
      const next = waiting.shift();
      if (next) toastTimer = window.setTimeout(() => showToast(next), 300);
    }, toastShopAt ? 4000 : 2500); // a little longer to reach the button
  }
  // The toast sits just above the buttons. While a panel is open (which
  // would cover it), it moves into the space between the panel and the
  // stat bars (or the pond, counter or garden in their spot) if it fits
  // there; if not, over the middle of the stat bars, or on small screens,
  // where the panel covers those, just above the panel.
  function placeToast(): void {
    const open = root.querySelector('.drawer.is-open');
    if (!open) {
      toastEl.style.bottom = '';
      return;
    }
    const h = toastEl.offsetHeight;
    const slot = statSlot.getBoundingClientRect();
    const panelTop = open.getBoundingClientRect().top;
    const fromBottom = (y: number) => Math.round(window.innerHeight - y - h / 2); // centre the toast on y
    let bottom: number;
    if (panelTop - slot.bottom >= h + 2 * DRAWER_GAP) bottom = fromBottom((slot.bottom + panelTop) / 2);
    else bottom = Math.max(fromBottom((slot.top + slot.bottom) / 2), Math.round(window.innerHeight - panelTop + DRAWER_GAP));
    toastEl.style.bottom = `${bottom}px`;
  }
  // Leaves the garden or the kitchen and opens the Shop at `category`.
  function goShop(category: ShopCategory): void {
    if (garden.active()) {
      garden.stop();
      showActions(GARDEN_OUT_MS);
    }
    if (cooking.active()) {
      cooking.stop();
      showActions(KITCHEN_OUT_MS);
    }
    if (actions.hidden) return; // busy with something else
    feedDrawer.close();
    playDrawer.close();
    if (!menuDrawer!.isOpen()) menuDrawer!.open();
    menu.showShop(category);
  }
  // Opens the travel journal at `place` (after a postcard).
  function goJournal(place: string): void {
    if (actions.hidden) return; // busy with something else
    feedDrawer.close();
    playDrawer.close();
    if (!menuDrawer!.isOpen()) menuDrawer!.open();
    menu.showJournal(place);
  }
  function showNotice(message: string): void {
    if (toastEl.classList.contains('show')) waiting.push(message);
    else showToast(message);
  }

  root.append(roomWrap, banner, statSlot, garden.pour, actions, bath.row, trip.row, fishing.row, cooking.row, garden.row, delivery.row, meet.row, journeys.sheet, journeys.row, toastEl);

  // Which pet the bars were showing, so switching pets can slide them.
  let barsFor: string | null = null;
  // Gold at the last update, so coins can fly in when it goes up, and where
  // it was when gold came in while the buttons were away (fishing, the
  // garden and so on).
  let lastGold: number | null = null;
  let goldFrom: number | null = null;

  return {
    canvas,
    update(state, now) {
      const switched = barsFor !== null && barsFor !== state.pet.id && !stats.hidden;
      barsFor = state.pet.id;
      latest = { state, now };
      if (lastGold !== null && state.gold > lastGold) {
        if (actions.hidden) goldFrom ??= lastGold;
        else fx.gold(lastGold, state.gold);
      }
      lastGold = state.gold;
      const pet = state.pet;
      petName = pet.name;
      petAsleep = pet.asleep;
      const isEgg = pet.stage === 'egg';
      petIsEgg = isEgg;
      petAway = isAway(pet);
      for (const key of Object.keys(bars) as (keyof PetStats)[]) {
        if (switched) bars[key].slide(pet.stats[key]);
        else bars[key].set(pet.stats[key]);
      }
      // With two pets, the craving bubble floats over the one you're
      // looking after.
      roomWrap.dataset.spot = !twoHome(state) ? 'middle' : petStandsLeft(state) ? 'left' : 'right';
      const elsewhere = otherRoom(state);
      door.hidden = !elsewhere;
      const waiting = !!elsewhere && petsIn(state, elsewhere).some(needsYou);
      door.classList.toggle('needs-you', waiting);
      door.setAttribute('aria-label', waiting ? `${STRINGS.familyHome.door}. ${STRINGS.familyHome.needsYou}` : STRINGS.familyHome.door);
      // How many of each food you have ("Free" for food that never runs out).
      // Caught fish and cooked dishes also show their stars. Dishes only
      // show up once you have some, to keep the list short.
      // Only food you have is listed.
      CONFIG.foods.forEach((f: Food, i) => {
        const count = foodCount(state, f.id);
        const stars = f.stars ? `${STRINGS.stars(f.stars)}  ` : '';
        // The rice ball also says when the jar adds its next free one.
        const refill = f.id === 'riceBall' && state.riceJarAt ? `  ${STRINGS.shop.riceJar(formatDuration(state.riceJarAt - now))}` : '';
        feedDrawer.setNote(foodRow(i), count === Infinity ? STRINGS.shop.free : `${stars}× ${count}${refill}`);
        feedDrawer.setHidden(foodRow(i), count === 0);
        // A heart on what the pet is craving.
        const craved = state.craving.food === f.id;
        if (craved !== cravedRows.has(i)) {
          feedDrawer.setOptionBadge(foodRow(i), craved ? STAT_ICONS.happiness : null);
          if (craved) cravedRows.add(i);
          else cravedRows.delete(i);
        }
      });
      feedDrawer.setHidden(COOK_ROW, !isUnlocked(state, 'cooking'));
      const cookIsNew = isNew(state, 'cooking');
      feedDrawer.setOptionNew(COOK_ROW, cookIsNew);
      feedDrawer.setNew(cookIsNew);
      menuDrawer!.setNew(
        isNew(state, 'shop') || isNew(state, 'collection') || isNew(state, 'familyTree') || isNew(state, 'journeys') ||
          [pet, ...state.housemates].some(hasBackpack) ||
          isNew(state, 'messages') || unreadMail(state) > 0 || isNew(state, 'skills') ||
          (isUnlocked(state, 'skills') && pointsToSpend(state) > 0),
      );
      // The pot, then what the pet is craving, then what you fed most
      // recently, then the rest as listed in the config. Rows only move
      // while the panel is closed.
      const ids = CONFIG.foods.map((f) => f.id as string);
      const recent = [...(state.craving.food ? [state.craving.food] : []), ...state.recentFoods]
        .map((id) => ids.indexOf(id)).filter((i) => i >= 0);
      const order = [COOK_ROW, ...[...recent, ...ids.keys()].filter((i, n, all) => all.indexOf(i) === n).map(foodRow)];
      const orderKey = order.join();
      if (orderKey !== feedOrderKey && !feedDrawer.isOpen()) {
        feedOrderKey = orderKey;
        feedDrawer.setOrder(order);
      }
      cooking.update(state);
      fishing.setBait(baitCount(state), state.baitOn);
      fishing.setPerks(reelPerks(state));
      garden.update(state, now);
      delivery.update(state, now);
      meet.update(state, now);
      journeys.update(state, now);
      trip.update(state, now);
      refreshNotes(state);
      refreshParcel();
      parcel.classList.toggle('all-full', !!state.delivery.order?.boxes.every((b) => b.have >= b.want));
      playDrawer.setHidden(GARDEN_ROW, !isUnlocked(state, 'garden'));
      const gardenIsNew = isNew(state, 'garden');
      playDrawer.setOptionNew(GARDEN_ROW, gardenIsNew);
      playDrawer.setHidden(MEET_ROW, !isUnlocked(state, 'meet'));
      const meetIsNew = isNew(state, 'meet');
      playDrawer.setOptionNew(MEET_ROW, meetIsNew);
      playDrawer.setHidden(JOURNEYS_ROW, !isUnlocked(state, 'journeys'));
      const journeysIsNew = isNew(state, 'journeys');
      playDrawer.setOptionNew(JOURNEYS_ROW, journeysIsNew);
      playDrawer.setNew(gardenIsNew || meetIsNew || journeysIsNew);
      // A drop on Play when a pot is dry, sick or ready to harvest.
      const tend = isUnlocked(state, 'garden') && needsTending(state.garden, now);
      playDrawer.setBadge(tend ? STAT_ICONS.drop : null, STRINGS.garden.needsYou);
      stats.hidden = isEgg || journeys.active() || trip.active(); // an egg has no needs yet
      const mood = petAway ? STRINGS.blocked.away(pet.name) : isEgg ? STRINGS.mood.egg : STRINGS.mood[getLook(pet)](pet.name);
      const mess = [
        ...(!petAway && pet.hygiene.smelly ? [STRINGS.bath.smelly(pet.name)] : []),
        ...(!petAway ? pet.hygiene.poops.map(() => STRINGS.bath.poop(pet.name)) : []),
      ];
      canvas.setAttribute('aria-label', [mood, ...mess].join('. '));

      // Banner: hatching countdown, or passed away beats sick beats
      // recovering beats warning. In a sick pet's last hours it counts down.
      const passed = hasPassed(pet);
      let text = '';
      const place = pet.trip ? STRINGS.journeys.places[pet.trip.place] ?? pet.trip.place : '';
      // Out on a journey: nothing here, the note on the wall has it all.
      if (petAway) text = '';
      else if (hasBackpack(pet)) text = STRINGS.journeys.bannerHome(pet.name, place);
      else if (isEgg)
        text = STRINGS.status_egg(formatDuration(pet.stageStartedAt + stageLengthMs('egg') - now));
      else if (passed) text = STRINGS.status.passed(pet.name);
      else if (isCritical(pet)) {
        // Only what you already have, never a price: this is about care.
        const stars = revivalStars(state);
        const { perStar } = CONFIG.fragments;
        const have = stars > 0 ? STRINGS.revival.haveStars(stars) : STRINGS.revival.haveFragments(state.fragments.pieces, perStar);
        text = `${STRINGS.status.critical(pet.name, formatDuration(timeLeftToTreat(pet)))} ${have}`;
      }
      else if (pet.condition === 'sick') text = STRINGS.status.sick(pet.name);
      else if (isRecovering(pet, now))
        text = STRINGS.status.recovering(pet.name, formatDuration(pet.recoveryUntil! - now));
      else if (pet.condition === 'warning')
        text = pet.hygiene.germs && !isNeglected(pet.stats) ? STRINGS.status.germs(pet.name) : STRINGS.status.warning(pet.name);
      // Nothing else to say: a pet from the Meadow dropping by, or an egg
      // waiting in the nest for room.
      const fromMeadow = text === '' && !petAway ? meadowVisitor(state) : null;
      if (fromMeadow) text = STRINGS.meadow.visitBanner(fromMeadow.pet.name);
      const nestWaits = text === '' && !petAway && !!state.nest;
      if (nestWaits) text = STRINGS.friends.nestBanner;
      banner.hidden = text === '';
      banner.dataset.kind = pet.trip ? 'info' : passed ? 'passed' : isCritical(pet) ? 'critical' : pet.condition === 'sick' ? 'sick' : 'info';
      bannerText.textContent = text;
      medicine.hidden = pet.condition !== 'sick' || !!pet.trip;
      passedButtons.hidden = !passed || !!pet.trip;
      openBackpack.hidden = !hasBackpack(pet);
      makeRoom.hidden = !nestWaits;
      sayHello.hidden = !fromMeadow;

      // Lights button shows what pressing it will do.
      const label = pet.asleep ? STRINGS.buttons.lightsOn : STRINGS.buttons.lightsOff;
      lights.innerHTML = pet.asleep ? SUN_ICON : MOON_ICON;
      lights.setAttribute('aria-label', label);
      lights.title = label;
      // Dim Feed and Play while asleep. They still work when tapped, so the
      // game can explain why nothing happened.
      feedDrawer.setDim(pet.asleep || isEgg || passed || petAway);
      playDrawer.setDim(pet.asleep || isEgg || passed || petAway);
      lights.classList.toggle('dim', isEgg || passed || petAway);
      // If the pet falls asleep (or sets off) while a panel is open, close it.
      if (pet.asleep || petAway) {
        feedDrawer.close();
        playDrawer.close();
      }
      // The bath stops if the pet falls asleep, sets off, or you switch pets.
      if (bath.active() && (pet.asleep || petAway || isEgg || passed || switched || !pet.hygiene.smelly)) stopBath();
      // Fishing stops if the pet falls asleep or gets sick.
      if (!canPlayMinigames(pet, now) || isEgg) stopFishing();
      // Looking after an egg now (it can't meet anyone): the friend goes
      // home.
      if (isEgg && meet.active()) {
        meet.stop();
        showActions(MEET_OUT_MS);
      }

      menu.update(state);
    },
    toast: showToast,
    notice: showNotice,
    reveal: reveal.show,
    showJournal: goJournal,
    craft: craft.play,
    backpack: backpack.show,
    gains: fx.gains,
    fishingPhase: fishing.phase,
    gardenScene: () => garden.scene(),
    deliveryScene: () => delivery.scene(),
    meetScene: () => meet.scene(),
    tripScene: () => trip.scene(),
    bathScene: (timeMs) => bath.scene(timeMs),
    hidesSmell: () => bath.hidesSmell(),
    showTripIfEmpty,
  };
}
