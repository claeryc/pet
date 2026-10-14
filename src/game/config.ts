// All the game's tuning numbers live here, so you can tweak the feel of the
// game without hunting through the code. Stats always go from 0 (empty) to
// 100 (full). "per hour" rates are spread evenly across each minute.

export const CONFIG = {
  // How big one simulation step is. simulate() walks forward in steps of this
  // size, so 1 minute means "check the pet once per in-game minute".
  tickMinutes: 1,

  // How often the open game re-runs simulate(), in seconds.
  liveUpdateSeconds: 5,

  // Starting values for a brand new pet.
  startingStats: {
    hunger: 80, // 100 = completely full, 0 = starving
    happiness: 80, // 100 = overjoyed, 0 = miserable
    health: 100, // 100 = in perfect health
    energy: 80, // 100 = full of beans, 0 = exhausted
  },

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
  // (In Milestone 3 these will come from your inventory and the shop.)
  foods: [
    { id: 'riceBall', hunger: 20, happiness: 0, health: 0 },
    { id: 'strawberry', hunger: 10, happiness: 6, health: 0 },
    { id: 'warmMilk', hunger: 12, happiness: 2, health: 3 },
    { id: 'cookie', hunger: 6, happiness: 12, health: -2 },
  ],

  // What's inside the Play panel. Playing costs energy and makes the pet a
  // little peckish. Mini-games join this list in Milestone 4.
  activities: [
    { id: 'cuddle', happiness: 10, hunger: 0, energy: -2 },
    { id: 'ball', happiness: 18, hunger: -4, energy: -8 },
    { id: 'tickle', happiness: 14, hunger: -2, energy: -5 },
  ],

  // Testing helpers shown in Settings. Turn off before releasing the game.
  debug: {
    showTools: true,
    fastForwardHours: [1, 6, 24],
  },
} as const;

export const STAT_MIN = 0;
export const STAT_MAX = 100;
