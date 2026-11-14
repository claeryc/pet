// Saving and loading. Everything else in the game talks to this file instead
// of touching localStorage directly, so later we can swap localStorage for
// IndexedDB or a cloud save by changing only this file.

import { CONFIG } from '../game/config';
import type { GameState } from '../game/state';
import { characterKey, unlocksFor } from '../game/unlocks';
import { newGarden } from '../game/garden';
import { newCrafting, newDig, newJourneys, newKeeper } from '../game/state';
import { grownUpXp, levelInfo } from '../game/skills';
import { getCharacter, rollTheme } from '../game/growth';
import { guidesAlreadyKnown } from '../game/guides';
import { backfillRegulars } from '../game/regulars';
import { fitTrait, rollTrait } from '../game/traits';
import { carriedOf, genesAtGrowUp, inheritanceOf } from '../game/genes';
import { rollLikes } from '../game/likes';
import { newHygiene } from '../game/hygiene';
import { hangKeepsakePieces, petFromMember } from '../game/meadow';

const SAVE_KEY = 'cozy-pixel-pet-save';

// Bump this number whenever the shape of GameState changes, and teach
// migrate() how to upgrade older saves so players never lose their pet.
export const SAVE_VERSION = 48;

export interface SaveFile {
  version: number;
  // Older saves have a different shape, so we treat the contents loosely
  // here and only promise a proper GameState once migrate() is done.
  state: any;
}

// Upgrades an old save to the current version, one version at a time, so a
// player's pet survives every update to the game.
export function migrate(save: SaveFile): SaveFile {
  // Version 1 -> 2: added health, energy, sleep, sickness and the Care Score.
  if (save.version === 1) {
    const pet = save.state.pet;
    pet.stats.health = CONFIG.startingStats.health;
    pet.stats.energy = CONFIG.startingStats.energy;
    pet.asleep = false;
    pet.condition = 'healthy';
    pet.warningMinutes = 0;
    pet.recoveryUntil = null;
    pet.careScore = CONFIG.careScore.start;
    save.state.clockOffsetMs = 0;
    save.version = 2;
  }
  // Version 2 -> 3: added timed food effects.
  if (save.version === 2) {
    save.state.pet.buffs = [];
    save.version = 3;
  }
  // Version 3 -> 4: added life stages. Pets from before this update were
  // already up and about, so they continue as babies from now on.
  if (save.version === 3) {
    save.state.pet.stage = 'baby';
    save.state.pet.formId = 'baby';
    save.state.pet.stageStartedAt = save.state.lastUpdated;
    save.version = 4;
  }
  // Version 4 -> 5: adults became characters with themes and rarity. Old
  // adult forms move to the closest new character.
  if (save.version === 4) {
    const pet = save.state.pet;
    const oldAdults: Record<string, string> = { sunny: 'starwisp', puffy: 'cloudlet', mossy: 'sprig' };
    pet.character = pet.stage === 'adult' ? (oldAdults[pet.formId] ?? 'dumpling') : null;
    pet.variant = null;
    delete pet.formId;
    save.version = 5;
  }
  // Version 5 -> 6: added gold, the inventory, hats and check-in bonuses.
  if (save.version === 5) {
    save.state.pet.hat = null;
    save.state.gold = CONFIG.economy.startingGold;
    save.state.inventory = { food: { ...CONFIG.economy.startingFood }, hats: [] };
    save.state.checkIn = { day: '', count: 0, lastAt: 0 };
    save.version = 6;
  }
  // Version 6 -> 7: added cooking and the recipe book.
  if (save.version === 6) {
    save.state.recipesFound = [];
    save.version = 7;
  }
  // Version 7 -> 8: menus that open up as you play, and the Collection.
  // Fish in the pantry count as caught, and whatever is already open for
  // this pet counts as seen, so nothing shows up as "new" by surprise.
  if (save.version === 7) {
    const st = save.state;
    const pet = st.pet;
    st.recentFoods = [];
    st.caught = Object.keys(CONFIG.fishing.fish).filter((id) => (st.inventory?.food?.[id] ?? 0) > 0);
    st.charactersFound = pet.stage === 'adult' && pet.character ? [characterKey(pet.character, pet.variant)] : [];
    st.showAllMenus = false;
    st.unlocked = unlocksFor(st as GameState);
    st.seen = [...st.unlocked];
    save.version = 8;
  }
  // Version 8 -> 9: naming the pet, the owner's name and the Family Tree.
  // Pets that already hatched keep their name, but get asked once whether
  // they'd like a different one. An egg's name hasn't been picked yet.
  if (save.version === 8) {
    const pet = save.state.pet;
    if (pet.stage === 'egg') pet.name = '';
    pet.named = false;
    pet.generation = 1;
    pet.parents = [];
    save.state.owner = '';
    save.state.family = [];
    save.version = 9;
  }
  // Version 9 -> 10: the garden, with seeds and garden supplies.
  if (save.version === 9) {
    save.state.garden = newGarden();
    save.state.inventory = { food: {}, hats: [], ...save.state.inventory, seeds: {}, supplies: {} };
    save.version = 10;
  }
  // Version 10 -> 11: Percy's delivery orders and the Messages page. Crops
  // in the pantry count as grown, so Percy can ask for them.
  if (save.version === 10) {
    const st = save.state;
    st.grown = CONFIG.garden.crops.map((c) => c.id as string).filter((id) => (st.inventory?.food?.[id] ?? 0) > 0);
    st.delivery = { order: null, nextAt: 0 };
    st.messages = [];
    st.messagesSeenAt = 0;
    save.version = 11;
  }
  // Version 11 -> 12: cravings (the thought bubble).
  if (save.version === 11) {
    save.state.craving = { food: null, until: 0, nextAt: 0, last: null };
    save.version = 12;
  }
  // Version 12 -> 13: friends, mingling and more than one pet in the room.
  if (save.version === 12) {
    const st = save.state;
    st.pet.themes = [];
    st.pet.partner = null;
    st.housemates = [];
    st.family = (st.family ?? []).map((m: any) => ({ ...m, fromWild: false }));
    st.friends = [];
    st.visit = { guest: null, friendId: null, until: 0, met: false, nextAt: 0, wildAt: 0, invitedDay: '' };
    save.version = 13;
  }
  // Version 13 -> 14: room decorations, bait, the energy drink and a 3rd
  // garden pot. Every room starts plain.
  if (save.version === 13) {
    const st = save.state;
    st.inventory = { ...st.inventory, decor: [] };
    st.room = { wallpaper: 'plain', curtains: null };
    st.stock = { day: '', bought: 0 };
    st.baitOn = false;
    save.version = 14;
  }
  // Version 14 -> 15: achievements. Nothing was counted before, so counts
  // start at zero, except what Messages still remembers: Percy's pickups
  // and little ones. (Badges for those are handed out on the next update.)
  if (save.version === 14) {
    const st = save.state;
    const messages: any[] = st.messages ?? [];
    st.tally = {
      deliveries: messages.filter((m) => m.kind === 'pickup' && m.tier !== 'none').length,
      littleOnes: messages.filter((m) => m.kind === 'littleOne').length,
    };
    st.badges = {};
    save.version = 15;
  }
  // Version 15 -> 16: Keeper XP and skills. Long-time players get XP back
  // for what they've already done (achievement counts, badges and pets that
  // grew up), quietly, so they open Skills with a few points to spend.
  if (save.version === 15) {
    const st = save.state;
    const K = CONFIG.skills;
    let xp = 0;
    for (const [id, n] of Object.entries(st.tally ?? {})) xp += (K.xp[id as keyof typeof K.xp] ?? 0) * (n as number);
    for (const tier of Object.values(st.badges ?? {})) {
      const reached = ['bronze', 'silver', 'gold'].slice(0, ['bronze', 'silver', 'gold'].indexOf(tier as string) + 1);
      for (const t of reached) xp += K.badgeXp[t as keyof typeof K.badgeXp];
    }
    const grown = [
      ...[st.pet, ...(st.housemates ?? [])].filter((p: any) => p?.stage === 'adult' && p.character),
      ...(st.family ?? []).filter((m: any) => m.character && !m.fromFriend && !m.fromWild),
    ];
    for (const p of grown) xp += grownUpXp(getCharacter(p.character)?.stars ?? 1);
    st.keeper = { ...newKeeper(), xp, grownUp: grown.map((p: any) => p.id) };
    st.keeper.level = levelInfo(xp).level;
    save.version = 16;
  }
  // Version 16 -> 17: a pet left sick too long can pass away. Pets sick
  // right now start the countdown from today. Added star fragments.
  if (save.version === 16) {
    const st = save.state;
    for (const p of [st.pet, ...(st.housemates ?? [])]) {
      if (!p) continue;
      p.sickMinutes = 0;
      p.starGlow = false;
    }
    st.fragments = { pieces: 0 };
    save.version = 17;
  }
  // Version 17 -> 18: star fragments come from good care days instead of
  // a daily streak, pets growing up and gold badges. Fragments already
  // found are kept; the care days start from today.
  if (save.version === 17) {
    const st = save.state;
    st.fragments = { pieces: st.fragments?.pieces ?? 0, careDays: 0, day: '', dayGood: false };
    save.version = 18;
  }
  // Version 18 -> 19: journeys and the travel journal. Nobody is away yet.
  if (save.version === 18) {
    const st = save.state;
    for (const p of [st.pet, ...(st.housemates ?? [])]) {
      if (!p) continue;
      p.trip = null;
      p.tripReadyAt = 0;
    }
    st.journeys = newJourneys();
    save.version = 19;
  }
  // Version 19 -> 20: "How it works" guides. Players who already got this
  // far aren't shown guides for what they know; they're all in Menu > Guide.
  if (save.version === 19) {
    const st = save.state;
    st.guidesRead = guidesAlreadyKnown({ ...st, pet: st.pet ?? {}, unlocked: st.unlocked ?? [] } as GameState);
    save.version = 20;
  }
  // Version 20 -> 21: regulars (Percy's hearts) and journey bags. Players who already filled
  // orders start partway; the rewards for those hearts are handed over on
  // the next update.
  if (save.version === 20) {
    const st = save.state;
    st.regulars = backfillRegulars(st.tally?.deliveries ?? 0);
    if (st.inventory) st.inventory.bags = [];
    save.version = 21;
  }
  // Version 21 -> 22: pets remember what their parents grew into, for the
  // 3-star parents bonus. Filled in from the family where we can.
  if (save.version === 21) {
    const st = save.state;
    const pets: any[] = [st.pet, ...(st.housemates ?? [])].filter(Boolean);
    const known = new Map<string, any>();
    for (const m of [...(st.family ?? []), ...(st.friends ?? []), ...pets]) known.set(m.id, m);
    for (const p of pets) {
      p.parentLooks = (p.parents ?? []).map((id: string) => ({
        character: known.get(id)?.character ?? null,
        variant: known.get(id)?.variant ?? null,
      }));
    }
    save.version = 22;
  }
  // Version 22 -> 23: more journey badges, and Milestone badges. Fill in
  // what the save can tell: an Adventure for each place whose best stamp is
  // epic, and the gold-frame orders still in Messages. The Milestones
  // themselves are handed out on the next update.
  if (save.version === 22) {
    const st = save.state;
    st.milestones = [];
    const pages = Object.values(st.journeys?.journal ?? {}) as { best?: string }[];
    const adventures = pages.filter((page) => page.best === 'epic').length;
    const goldOrders = (st.messages ?? []).filter((m: { kind: string; tier?: string }) => m.kind === 'pickup' && m.tier === 'gold').length;
    st.tally = { ...st.tally };
    if (adventures > 0) st.tally.adventures = Math.max(st.tally.adventures ?? 0, adventures);
    if (goldOrders > 0) st.tally.goldOrders = Math.max(st.tally.goldOrders ?? 0, goldOrders);
    save.version = 23;
  }
  // Version 23 -> 24: the starter themes. Basic became Bakery and Sparkle
  // became Starry, and retired characters turn into the new one of the same
  // theme and stars. (Old "cloudlet" was the 3-star Basic pet; the new
  // Cloudlet is Starry's 1-star.) Cave pets stay as they are.
  if (save.version === 23) {
    const st = save.state;
    const characters: Record<string, string> = {
      bunbun: 'puddling', cloudlet: 'cuppie', glimmer: 'cloudlet', starwisp: 'starhoot', mosscap: 'acornet', fernwhisk: 'stumpy',
    };
    const themes: Record<string, string> = { basic: 'bakery', sparkle: 'starry' };
    const fix = (thing: any) => {
      if (thing && typeof thing.character === 'string') thing.character = characters[thing.character] ?? thing.character;
    };
    const pets: any[] = [st.pet, ...(st.housemates ?? [])].filter(Boolean);
    for (const p of pets) {
      fix(p);
      p.themes = [...new Set((p.themes ?? []).map((t: string) => themes[t] ?? t))];
      for (const look of p.parentLooks ?? []) fix(look);
    }
    for (const m of [...(st.family ?? []), ...(st.friends ?? []), st.visit?.guest, ...(st.messages ?? [])]) fix(m);
    st.charactersFound = [
      ...new Set(
        (st.charactersFound ?? []).map((key: string) => {
          const [id, variant] = key.split(':');
          return [characters[id] ?? id, variant].filter(Boolean).join(':');
        }),
      ),
    ];
    save.version = 24;
  }
  // Version 24 -> 25: traits. Every pet gets the one its id rolls, and so
  // do the pets in the Family Tree (one their character allows).
  if (save.version === 24) {
    const st = save.state;
    for (const p of [st.pet, ...(st.housemates ?? []), ...(st.family ?? [])]) if (p && !p.trait) p.trait = fitTrait(p.id, rollTrait(p.id), getCharacter(p.character ?? null));
    save.version = 25;
  }
  // Version 25 -> 26: poop and bath time. Every pet starts out clean.
  if (save.version === 25) {
    const st = save.state;
    for (const p of [st.pet, ...(st.housemates ?? [])]) if (p && !p.hygiene) p.hygiene = newHygiene();
    save.version = 26;
  }
  // Version 26 -> 27: genes. Each pet remembers what its parents carry (the
  // genes their ids roll), and a grown-up gets the ones it would have
  // carried had genes been there when it grew up.
  if (save.version === 26) {
    const st = save.state;
    const pets: any[] = [st.pet, ...(st.housemates ?? [])].filter(Boolean);
    const known = new Map<string, any>();
    for (const m of [...(st.family ?? []), ...(st.friends ?? []), ...pets]) known.set(m.id, m);
    for (const p of pets) {
      p.parentCarried = (p.parents ?? []).map((id: string) => carriedOf(known.get(id) ?? { id }));
      const character = getCharacter(p.character ?? null);
      p.carried = p.stage === 'adult' && character ? genesAtGrowUp(p, character, p.variant ?? null) : null;
    }
    save.version = 27;
  }
  // Version 27 -> 28: likes and dislikes. Every pet gets the ones its id
  // rolls, none found yet, and so do the pets in the Family Tree.
  if (save.version === 27) {
    const st = save.state;
    for (const p of [st.pet, ...(st.housemates ?? []), ...(st.family ?? [])]) if (p && !p.likes) p.likes = rollLikes(p.id);
    save.version = 28;
  }
  // Version 28 -> 29: the nest and met characters. Friends you already
  // have (and friends in the Family Tree) count as met. A room holding
  // more pets than fit puts its newest egg in the nest instead.
  if (save.version === 28) {
    const st = save.state;
    const met = [...(st.friends ?? []), ...(st.family ?? []).filter((m: any) => m.fromFriend || m.fromWild)]
      .filter((f: any) => f.character)
      .map((f: any) => characterKey(f.character, f.variant ?? null));
    st.charactersMet = [...new Set(met)];
    st.nest = null;
    const pets: any[] = [st.pet, ...(st.housemates ?? [])].filter(Boolean);
    const egg = pets.filter((p) => p.stage === 'egg').sort((a, b) => b.bornAt - a.bornAt)[0];
    if (egg && pets.length > CONFIG.friends.maxPets) {
      const rest = pets.filter((p) => p !== egg);
      st.nest = egg;
      st.pet = rest[0];
      st.housemates = rest.slice(1);
    }
    save.version = 29;
  }
  // Version 29 -> 30: Ribbit takes Stumpy's place as Nature's 3-star pet.
  // Stumpy turns into Ribbit everywhere a character is remembered, and a
  // pet that was Stumpy gets a trait Ribbit allows.
  if (save.version === 29) {
    const st = save.state;
    const fix = (thing: any) => {
      if (thing?.character !== 'stumpy') return false;
      thing.character = 'ribbit';
      return true;
    };
    const pets: any[] = [st.pet, ...(st.housemates ?? []), st.nest, ...(st.family ?? [])].filter(Boolean);
    for (const p of pets) {
      if (fix(p) && p.trait) p.trait = fitTrait(p.id, p.trait, getCharacter('ribbit'));
      for (const look of p.parentLooks ?? []) fix(look);
    }
    for (const m of [...(st.friends ?? []), st.visit?.guest, ...(st.messages ?? [])]) fix(m);
    const key = (k: string) => (k === 'stumpy' || k.startsWith('stumpy:') ? k.replace('stumpy', 'ribbit') : k);
    st.charactersFound = [...new Set((st.charactersFound ?? []).map(key))];
    st.charactersMet = [...new Set((st.charactersMet ?? []).map(key))];
    save.version = 30;
  }
  // Version 30 -> 31: the daily limit on XP and seeds from fishing. No
  // fish counted yet today.
  if (save.version === 30) {
    save.state.pond = { day: '', fish: 0 };
    save.version = 31;
  }
  // Version 31 -> 32: the Family Home. Nobody has it yet, and every pet
  // lives in the main room.
  if (save.version === 31) {
    save.state.familyHome = { owned: false, room: { wallpaper: 'plain', curtains: null } };
    save.version = 32;
  }
  if (save.version === 32) {
    // Pinchy (the lobster) took Tidecrest's place as Ocean's 3-star, and
    // Tidecrest's Lobster colour went with it.
    const st = save.state;
    const fix = (thing: any) => {
      if (thing?.character !== 'tidecrest') return;
      thing.character = 'pinchy';
      if ('variant' in thing) thing.variant = null;
    };
    const fixGenes = (genes: any) => {
      if (genes?.variant?.startsWith('tidecrest:')) genes.variant = null;
    };
    const pets: any[] = [st.pet, ...(st.housemates ?? []), st.nest, ...(st.family ?? [])].filter(Boolean);
    for (const p of pets) {
      fix(p);
      for (const look of p.parentLooks ?? []) fix(look);
      fixGenes(p.carried);
      for (const g of p.parentCarried ?? []) fixGenes(g);
    }
    for (const m of [...(st.friends ?? []), st.visit?.guest, ...(st.messages ?? [])]) {
      fix(m);
      fixGenes(m?.carried);
    }
    const key = (k: string) => (k === 'tidecrest' || k.startsWith('tidecrest:') ? 'pinchy' : k);
    st.charactersFound = [...new Set((st.charactersFound ?? []).map(key))];
    st.charactersMet = [...new Set((st.charactersMet ?? []).map(key))];
    save.version = 33;
  }
  // Version 33 -> 34: the rice jar. Rice balls aren't free and endless any
  // more: the pantry starts with a full jar of them.
  if (save.version === 33) {
    const st = save.state;
    const food = st.inventory?.food;
    if (food) food.riceBall = Math.max(food.riceBall ?? 0, CONFIG.riceJar.size);
    st.riceJarAt = null;
    save.version = 34;
  }
  // Version 34 -> 35: star fragments come 5 a day instead of 1 every 6
  // good care days, and prices went up to match. Each old fragment is
  // worth 30 now (6 days of 5), and the good days already counted towards
  // the next one are paid out at 5 each. `careDays` now counts every good
  // day so far. Revival Stars already made stay as they are.
  if (save.version === 34) {
    const fr = save.state.fragments;
    if (fr) fr.pieces = (fr.pieces ?? 0) * 30 + (fr.careDays ?? 0) * CONFIG.fragments.perGoodDay;
    save.version = 35;
  }
  // Version 35 -> 36: the Meadow keeps whole pets, which visit and can
  // come back, and leave keepsakes. Pets that moved there before are made
  // again from the Family Tree, and each leaves its framed portrait.
  if (save.version === 35) {
    const st = save.state;
    const now = st.lastUpdated ?? Date.now();
    const moved = (st.family ?? []).filter((m: any) => m.meadow);
    st.meadow = moved.map((m: any) => ({ pet: petFromMember(m, now), movedAt: now, hiDay: '', hiAt: 0, seenAt: now }));
    st.keepsakes = moved.map((m: any) => ({ id: m.id, name: m.name, character: m.character, variant: m.variant, tier: 'portrait', at: now }));
    if (st.visit) {
      st.visit.meadowId = null;
      st.visit.meadowAt = moved.length > 0 ? now + CONFIG.meadow.firstVisitHours * 3_600_000 : 0;
    }
    save.version = 36;
  }
  if (save.version === 36) {
    // The keepsake frame and shelf became pieces placed like furniture.
    const st = save.state;
    if (st.room) st.room = hangKeepsakePieces(st.room);
    if (st.familyHome?.room) st.familyHome.room = hangKeepsakePieces(st.familyHome.room);
    save.version = 37;
  }
  // Version 37 -> 38: Crystal Caves became Coral Cove, and its glow salt
  // became seaweed (with the two dishes made from it). The old ids are
  // swapped for the new ones everywhere in the save: food in the pantry,
  // recipes, the journal's pages, postcards, trips and lunchboxes.
  if (save.version === 37) {
    save.state = renameIds(save.state, COVE_RENAMES);
    save.version = 38;
  }
  // Version 38 -> 39: the tackle shelf. Bait switched on or off became a
  // pick of which bait to fish with.
  if (save.version === 38) {
    const st = save.state;
    st.tackle = st.baitOn ? 'bait' : null;
    delete st.baitOn;
    save.version = 39;
  }
  // Version 39 -> 40: kitchen items (none owned yet).
  if (save.version === 39) {
    save.state.kitchen = [];
    save.version = 40;
  }
  // Version 40 -> 41: Sniff and dig (nothing dug yet).
  if (save.version === 40) {
    save.state.dig = newDig();
    save.version = 41;
  }
  // Version 41 -> 42: crafting (an empty pouch, no projects yet).
  if (save.version === 41) {
    save.state.crafting = newCrafting();
    save.version = 42;
  }
  // Version 42 -> 43: a pet's theme is rolled when its egg is made, and
  // shows in its egg, baby and teen colours. Pets that haven't grown up
  // yet get theirs now (the same odds they'd have had at grow-up).
  if (save.version === 42) {
    const st = save.state;
    for (const p of [st.pet, ...(st.housemates ?? []), st.nest].filter(Boolean)) {
      p.destinedTheme = p.stage === 'adult' ? null : rollTheme(p.id, inheritanceOf(p));
    }
    save.version = 43;
  }
  // Version 43 -> 44: rewarded ads, counted per day.
  if (save.version === 43) {
    save.state.ads = { day: '', watched: 0 };
    save.version = 44;
  }
  // Version 44 -> 45: everyone starts with a Holiday ticket. A save that
  // has never had one gets it now.
  if (save.version === 44) {
    const inv = save.state.inventory;
    if (inv) {
      inv.supplies ??= {};
      if (inv.supplies['ticket:holiday'] === undefined) inv.supplies['ticket:holiday'] = 1;
    }
    save.version = 45;
  }
  // Version 45 -> 46: games now remember when they began. Older games are
  // past their first week, so they get 0 (no first-week cushion).
  if (save.version === 45) {
    save.state.startedAt ??= 0;
    save.version = 46;
  }
  // Version 46 -> 47: the auto-holiday switch, off.
  if (save.version === 46) {
    save.state.settings ??= { autoHoliday: false };
    save.version = 47;
  }
  // Version 47 -> 48: a resting place for pets that passed away, empty.
  // A pet already passed stays in the room and can be laid to rest there.
  if (save.version === 47) {
    save.state.resting ??= [];
    save.version = 48;
  }
  return save;
}

const COVE_RENAMES: Record<string, string> = {
  caves: 'cove',
  glowSalt: 'seaweed',
  glowSalmon: 'seaweedSalmon',
  saltBakedLobster: 'seaweedLobster',
  'place:caves:0': 'place:cove:0',
  'place:caves:1': 'place:cove:1',
  drip: 'splash',
};

// A copy of `value` with every string, and every key, that's exactly one
// of `renames` swapped for its new name. Names players typed (a pet called
// "Drip") are left alone.
function renameIds(value: any, renames: Record<string, string>): any {
  const swap = (s: string) => (Object.hasOwn(renames, s) ? renames[s] : s);
  if (typeof value === 'string') return swap(value);
  if (Array.isArray(value)) return value.map((v) => renameIds(v, renames));
  if (value && typeof value === 'object') {
    return Object.fromEntries(Object.entries(value).map(([k, v]) => [swap(k), k === 'name' ? v : renameIds(v, renames)]));
  }
  return value;
}

// localStorage, or undefined where the browser blocks it (some private
// modes throw just for asking).
function browserStorage(): Storage | undefined {
  try {
    return globalThis.localStorage;
  } catch {
    return undefined;
  }
}

// While this is set, saveGame does nothing: a save we couldn't read is
// waiting for the player to choose what to do, or another tab has the pet.
let savesBlocked = false;
export function blockSaves(blocked = true): void {
  savesBlocked = blocked;
}

// Called once when a save fails (storage full, private browsing), so the
// game can tell the player. Set by main.ts.
let onSaveFailed: (() => void) | null = null;
export function whenSaveFails(handler: () => void): void {
  onSaveFailed = handler;
}

export function saveGame(state: GameState, store: Storage | undefined = browserStorage()): boolean {
  if (savesBlocked) return false;
  const file: SaveFile = { version: SAVE_VERSION, state };
  try {
    if (!store) throw new Error('No storage');
    store.setItem(SAVE_KEY, JSON.stringify(file));
    return true;
  } catch (err) {
    // Storage can be full or blocked (e.g. private browsing). The game keeps
    // working in memory; we just can't save right now.
    console.warn('Could not save the game:', err);
    onSaveFailed?.();
    return false;
  }
}

// What loading found. 'newer' and 'broken' saves are copied to a backup key
// before anything else happens, and must never be overwritten without the
// player saying so.
export type LoadResult =
  | { kind: 'none' }
  | { kind: 'ok'; state: GameState }
  | { kind: 'newer'; version: number }
  | { kind: 'broken'; error: unknown };

export const BACKUP_PREFIX = 'cozy-pixel-pet-save-backup-';
const BACKUPS_KEPT = 3;

// Keeps a copy of a save we couldn't read, under its own key, and drops all
// but the newest few copies. The same text twice in a row (a player who
// keeps pressing Try again) is only kept once.
export function backupRawSave(raw: string, store: Storage | undefined = browserStorage(), now = Date.now()): void {
  if (!store) return;
  try {
    const keys = backupKeys(store);
    if (keys.length && store.getItem(keys[keys.length - 1]) === raw) return;
    store.setItem(`${BACKUP_PREFIX}${now}`, raw);
    const all = backupKeys(store);
    for (const key of all.slice(0, Math.max(0, all.length - BACKUPS_KEPT))) store.removeItem(key);
  } catch (err) {
    console.warn('Could not back up the save:', err);
  }
}

// The backup keys, oldest first.
export function backupKeys(store: Storage): string[] {
  const keys: string[] = [];
  for (let i = 0; i < store.length; i++) {
    const key = store.key(i);
    if (key?.startsWith(BACKUP_PREFIX)) keys.push(key);
  }
  return keys.sort((a, b) => Number(a.slice(BACKUP_PREFIX.length)) - Number(b.slice(BACKUP_PREFIX.length)));
}

// A quick check that a migrated save really holds a game.
export function looksLikeSave(file: unknown): file is SaveFile {
  const f = file as SaveFile | null;
  return !!f && typeof f === 'object' && typeof f.version === 'number'
    && !!f.state && typeof f.state === 'object'
    && !!f.state.pet && typeof f.state.pet === 'object'
    && !!f.state.pet.stats && typeof f.state.pet.stats === 'object';
}

// Reads the saved game. Anything that goes wrong is reported, not hidden as
// "no save", so the caller never starts a new game over a real one.
export function loadGame(store: Storage | undefined = browserStorage()): LoadResult {
  let raw: string | null = null;
  try {
    raw = store?.getItem(SAVE_KEY) ?? null;
  } catch {
    return { kind: 'none' }; // storage is blocked: there's nothing we could read
  }
  if (!raw) return { kind: 'none' };
  try {
    const parsed = JSON.parse(raw);
    if (typeof parsed?.version === 'number' && parsed.version > SAVE_VERSION) {
      backupRawSave(raw, store);
      return { kind: 'newer', version: parsed.version };
    }
    const file = migrate(parsed as SaveFile);
    if (file.version !== SAVE_VERSION) throw new Error(`Save stopped at version ${file.version}`);
    if (!looksLikeSave(file)) throw new Error('Save has no pet in it');
    return { kind: 'ok', state: file.state as GameState };
  } catch (error) {
    console.warn('Could not load the save:', error);
    backupRawSave(raw, store);
    return { kind: 'broken', error };
  }
}

// ---- Backup codes ----
// A backup code is "PET1:" and the save file, gzipped and in base64url, so
// it can be pasted anywhere. Where the browser can't gzip, it's "PET0:" and
// plain base64url. Codes with snapshots in them can be 100 kB or more, so
// they're copied or downloaded as a file, never put in a URL.

const CODE_GZIP = 'PET1:';
const CODE_PLAIN = 'PET0:';

// Why a backup code didn't work, in words for the player.
export class BackupError extends Error {
  constructor(public reason: 'empty' | 'unreadable' | 'newer' | 'noGzip') {
    super(reason);
    this.name = 'BackupError';
  }
}

function toBase64Url(bytes: Uint8Array): string {
  let binary = '';
  for (let i = 0; i < bytes.length; i += 0x8000) binary += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

function fromBase64Url(text: string): Uint8Array {
  const b64 = text.replace(/-/g, '+').replace(/_/g, '/');
  const binary = atob(b64 + '='.repeat((4 - (b64.length % 4)) % 4));
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  return bytes;
}

async function throughStream(bytes: Uint8Array, stream: GenericTransformStream): Promise<Uint8Array> {
  const out = new Blob([bytes as BlobPart]).stream().pipeThrough(stream);
  return new Uint8Array(await new Response(out).arrayBuffer());
}

export async function exportSave(state: GameState): Promise<string> {
  const file: SaveFile = { version: SAVE_VERSION, state };
  const json = new TextEncoder().encode(JSON.stringify(file));
  if (typeof CompressionStream === 'undefined') return CODE_PLAIN + toBase64Url(json);
  return CODE_GZIP + toBase64Url(await throughStream(json, new CompressionStream('gzip')));
}

// Reads a backup code (from any version of the game) back into a game.
// Throws a BackupError if it can't.
export async function importSave(code: string): Promise<GameState> {
  const text = code.replace(/\s+/g, '');
  if (!text) throw new BackupError('empty');
  let json: string;
  try {
    if (text.startsWith(CODE_GZIP)) {
      if (typeof DecompressionStream === 'undefined') throw new BackupError('noGzip');
      json = new TextDecoder().decode(await throughStream(fromBase64Url(text.slice(CODE_GZIP.length)), new DecompressionStream('gzip')));
    } else if (text.startsWith(CODE_PLAIN)) {
      json = new TextDecoder().decode(fromBase64Url(text.slice(CODE_PLAIN.length)));
    } else {
      throw new BackupError('unreadable');
    }
  } catch (err) {
    throw err instanceof BackupError ? err : new BackupError('unreadable');
  }
  let file: SaveFile;
  try {
    const parsed = JSON.parse(json);
    if (typeof parsed?.version === 'number' && parsed.version > SAVE_VERSION) throw new BackupError('newer');
    file = migrate(parsed as SaveFile);
  } catch (err) {
    throw err instanceof BackupError ? err : new BackupError('unreadable');
  }
  if (file.version !== SAVE_VERSION || !looksLikeSave(file)) throw new BackupError('unreadable');
  return file.state as GameState;
}

// Asks the browser to keep the save even when space runs low. Free, and
// quietly does nothing where it isn't supported.
export function askToKeepStorage(): void {
  try {
    void navigator.storage?.persist?.().catch(() => {});
  } catch {
    // Not supported here.
  }
}

export function clearSave(): void {
  try {
    browserStorage()?.removeItem(SAVE_KEY);
  } catch {
    // Nothing to do if storage is unavailable.
  }
}

// Music and sound on or off. Kept apart from the game save, so starting a
// new game keeps them as they were.
const AUDIO_KEY = 'cozy-pixel-pet-audio';

export interface AudioSettings {
  music: boolean;
  sounds: boolean;
}

export function loadAudioSettings(): AudioSettings {
  try {
    const saved = JSON.parse(localStorage.getItem(AUDIO_KEY) ?? '{}');
    return { music: saved.music !== false, sounds: saved.sounds !== false };
  } catch {
    return { music: true, sounds: true };
  }
}

export function saveAudioSettings(settings: AudioSettings): void {
  try {
    localStorage.setItem(AUDIO_KEY, JSON.stringify(settings));
  } catch {
    // Not saved this time; they stay as set until the game closes.
  }
}
