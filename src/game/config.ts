// All the game's tuning numbers live here, so you can tweak the feel of the
// game without hunting through the code. Times are in minutes or hours as
// noted; stats always go from 0 (empty) to 100 (full).

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
  },

  // How many points each stat loses per hour while nobody is looking after
  // the pet. 4/hour means a full tummy empties in about 25 hours.
  decayPerHour: {
    hunger: 4,
    happiness: 3,
  },

  // What the buttons do.
  actions: {
    feedHunger: 20, // Feed: +20 hunger
    playHappiness: 15, // Play: +15 happiness
    playHunger: -3, // Playing makes the pet a little peckish
  },

  // Below this value a stat counts as "low" and the pet looks sad.
  lowStatThreshold: 30,
} as const;

export const STAT_MIN = 0;
export const STAT_MAX = 100;
