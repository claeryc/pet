// All the game's tuning numbers live here, so you can tweak the feel of the
// game without hunting through the code. Stats always go from 0 (empty) to
// 100 (full). "per hour" rates are spread evenly across each minute.

export const CONFIG = {
  // How big one simulation step is. simulate() walks forward in steps of this
  // size, so 1 minute means "check the pet once per in-game minute".
  tickMinutes: 1,

  // How often the open game re-runs simulate(), in seconds.
  liveUpdateSeconds: 5,

  // How long the pet's eating / happy animation plays after you feed or
  // play with it, in milliseconds.
  reactionMs: 1400,

  // Starting values for a brand new pet.
  startingStats: {
    hunger: 80, // 100 = completely full, 0 = starving
    happiness: 80, // 100 = overjoyed, 0 = miserable
    health: 100, // 100 = in perfect health
    energy: 80, // 100 = full of beans, 0 = exhausted
  },

  // Growing up. How many hours the pet spends in each stage before moving
  // on (adults stay adults). Use the fast-forward and "Grow up now" testing
  // tools in Settings to try this without waiting days.
  growth: {
    stageHours: {
      egg: 0.5, // the egg hatches after 30 minutes
      baby: 24, // a baby for 1 day
      teen: 72, // a teen for 3 days, then an adult
    },
    // Babies get hungry and bored faster; adults a bit slower. Eggs don't
    // need anything at all.
    decayMultiplier: {
      egg: 0,
      baby: 1.25,
      teen: 1,
      adult: 0.9,
    },
  },

  // Which character a teen grows into. First the game rolls a star rarity
  // using the Care Score at that moment, then picks a theme at random among
  // the characters of that rarity (see src/data/characters.json).
  // Each row: the lowest Care Score for that row, then the chance (percent)
  // of 1, 2 and 3 stars. If no character has the rolled rarity yet, the
  // next lower rarity is used, so today (only 1 and 3 star characters)
  // a 2-star roll becomes 1 star.
  rarity: [
    { minCare: 80, odds: { 1: 10, 2: 40, 3: 50 } },
    { minCare: 50, odds: { 1: 30, 2: 50, 3: 20 } },
    { minCare: 20, odds: { 1: 60, 2: 35, 3: 5 } },
    { minCare: 0, odds: { 1: 90, 2: 10, 3: 0 } },
  ],

  // How many points each stat loses per hour while awake, when nothing else
  // is going on. 4/hour means a full tummy empties in about 25 hours.
  decayPerHour: {
    hunger: 4,
    happiness: 3,
    health: 0.5,
    energy: 3,
  },

  // A stat below this counts as "low": the pet looks sad, and if it stays low
  // the pet gets a warning and later becomes sick.
  lowStatThreshold: 30,

  // A stat at or above this counts as "well looked after".
  goodStatThreshold: 50,

  // When happiness is at least this (and nothing is wrong), the pet shows
  // its calm "cheerful" animation instead of the normal idle one.
  cheerfulHappiness: 70,

  sleep: {
    bedtimeHour: 21, // night starts at 9pm (your device's local time)
    wakeHour: 8, // and ends at 8am; a sleeping pet wakes up by itself then
    energyPerHourAsleep: 12, // energy regained per hour of sleep
    decayMultiplierAsleep: 0.5, // hunger and joy drop at half speed while asleep
    energyMultiplierNightAwake: 2, // staying up late with the lights on is tiring
  },

  health: {
    neglectDecayPerHour: 2, // extra health lost per hour while a stat is low
    sickDecayPerHour: 2, // extra health lost per hour while sick
    recoverPerHourWhenCared: 1.5, // health gained per hour when tummy and joy are good
  },

  sickness: {
    // How long the pet shows the warning (with low stats) before it gets sick.
    // The warning always comes first: a pet can never go straight to sick.
    warningHoursBeforeSick: 3,
    sickJoyMultiplier: 1.5, // joy drops 50% faster while sick
    medicineHealth: 40, // health restored by one dose of medicine
    // After medicine the pet rests. It can't play mini-games or breed, and it
    // can't get sick again, but feeding and cuddling still work.
    recoveryHours: 6,
  },

  // The hidden Care Score (0-100) tracks long-term care. Later it decides
  // which adult form the pet grows into.
  careScore: {
    start: 50,
    gainPerHourWhenCared: 0.5, // all stats good and not sick
    lossPerHourWhenNeglected: 1, // any stat low
    lossPerHourWhenSick: 1.5,
  },

  // What's inside the Feed panel. Each food changes stats by these amounts.
  // A food can also have a timed effect: `slowHunger` makes the tummy empty
  // more slowly (by `percent`) for a number of `hours`.
  // `price` is the cost in gold in the Shop. Food with price 0 is free and
  // never runs out; other food comes from your inventory, one per meal.
  // `caughtOnly` food isn't sold in the Shop: you get it by fishing.
  foods: [
    { id: 'riceBall', price: 0, hunger: 20, happiness: 0, health: 0 },
    { id: 'heartyStew', price: 25, hunger: 20, happiness: 0, health: 0, slowHunger: { percent: 20, hours: 6 } },
    { id: 'strawberry', price: 10, hunger: 10, happiness: 6, health: 0 },
    { id: 'warmMilk', price: 12, hunger: 12, happiness: 0, health: 3 },
    { id: 'cookie', price: 8, hunger: 6, happiness: 12, health: -2 },
    { id: 'fish', price: 15, hunger: 18, happiness: 4, health: 2, caughtOnly: true },
  ],

  // What's inside the Play panel. Playing costs energy and makes the pet a
  // little peckish. Mini-games join this list in Milestone 4.
  activities: [
    { id: 'cuddle', happiness: 10, hunger: 0, energy: -2 },
    { id: 'ball', happiness: 18, hunger: -4, energy: -8 },
    { id: 'tickle', happiness: 14, hunger: -2, energy: -5 },
  ],

  // The fishing mini-game (in the Play panel). Cast, wait for a bite, tap
  // Reel in, then tap Catch while the marker sweeping across the bar is on
  // a good spot.
  fishing: {
    energyPerCast: 3, // each cast tires the pet a little
    biteAfterSeconds: { min: 2, max: 6 }, // how long until a fish bites
    biteWindowSeconds: 1.6, // how long you have to tap Reel in after a bite
    sweepSeconds: 1.2, // how long the marker takes to cross the bar once
    maxSweeps: 4, // after this many crossings the fish swims off
    // How wide each coloured zone is, as a share of the bar. The red stripe
    // sits in the middle, with yellow on both sides, then green; the rest of
    // the bar is blue (no catch).
    zoneWidths: { perfect: 0.05, good: 0.07, weak: 0.1 },
    // The chance (0-1) that a fish is landed for each kind of catch.
    catchChance: { perfect: 1, good: 0.75, weak: 0.3, miss: 0 },
    // How many fish one successful catch gives. A food buff could raise this
    // later on (e.g. a chance of an extra fish).
    fishPerCatch: 1,
  },

  // Gold. It's earned (mini-games arrive in Milestone 4, plus check-in
  // bonuses) and spent in the Shop. It can never be bought with real money.
  economy: {
    startingGold: 50,
    // Food in a brand new pet's pantry.
    startingFood: { strawberry: 2, cookie: 1 },
    // Coming back to check on your pet earns a little gold: more for the
    // first visit of the day, a bit for later visits at least
    // `minHoursBetween` apart, up to `maxPerDay` rewards a day.
    checkIn: { firstOfDay: 20, later: 5, minHoursBetween: 3, maxPerDay: 4 },
  },

  // Testing helpers shown in Settings. Turn off before releasing the game.
  debug: {
    showTools: true,
    fastForwardHours: [1, 6, 24],
    addGold: 100,
    // Buttons that set the Care Score, to test which characters appear.
    careScores: [10, 60, 90],
  },
} as const;

export const STAT_MIN = 0;
export const STAT_MAX = 100;
