// Every piece of text the player sees lives here, so it is easy to reword
// things or translate the game later.

export const STRINGS = {
  title: 'Cozy Pixel Pet',
  stats: {
    hunger: 'Tummy',
    happiness: 'Joy',
    health: 'Health',
    energy: 'Energy',
  },
  buttons: {
    feed: 'Feed',
    play: 'Play',
    lightsOff: 'Lights off',
    lightsOn: 'Lights on',
    medicine: 'Give medicine',
    reset: 'Start over',
    menu: 'Menu',
  },
  foods: {
    riceBall: 'Rice ball',
    heartyStew: 'Hearty stew',
    strawberry: 'Strawberry',
    warmMilk: 'Warm milk',
    cookie: 'Cookie',
  },
  activities: {
    cuddle: 'Cuddle',
    ball: 'Toss a ball',
    tickle: 'Tickle',
  },
  effects: {
    slowHunger: (percent: number, hours: number) =>
      `Tummy empties ${percent}% slower for ${hours} hours`,
  },
  minigames: {
    catchTreats: 'Catch treats',
    memoryMatch: 'Memory match',
  },
  menu: {
    title: 'Menu',
    settings: 'Settings',
    shop: 'Shop',
    minigames: 'Mini-games',
    familyTree: 'Family Tree',
    comingSoon: 'Coming soon',
    back: 'Back',
    close: 'Close',
  },
  debug: {
    title: 'Testing tools',
    fastForward: (hours: number) => (hours >= 24 ? `+${hours / 24} day` : `+${hours}h`),
    fastForwardLabel: 'Fast-forward time',
    careScore: 'Care Score',
    condition: 'Condition',
    resetClock: 'Back to real time',
    growNow: 'Grow up now',
    form: 'Form',
  },
  stages: {
    egg: 'Egg',
    baby: 'Baby',
    teen: 'Teen',
    adult: 'Adult',
  },
  growth: {
    egg: (name: string) => `${name} is an egg.`,
    baby: (name: string) => `${name} hatched! Say hello!`,
    teen: (name: string) => `${name} grew into a teen!`,
    adult: (name: string, form: string) => `${name} grew up into a ${form}!`,
  },
  age: (stage: string, age: string) => `${stage} · ${age} old`,
  status_egg: (timeLeft: string) =>
    `Your egg is staying warm and cozy. It will hatch in ${timeLeft}.`,
  clock: {
    day: 'Day',
    night: 'Night',
  },
  mood: {
    idle: (name: string) => `${name} is feeling cozy.`,
    egg: (name: string) => `${name} is wiggling inside the egg...`,
    sad: (name: string) => `${name} needs some love...`,
    sleep: (name: string) => `${name} is sleeping. Shh...`,
    sick: (name: string) => `${name} is sick.`,
  },
  status: {
    warning: (name: string) =>
      `${name} isn't feeling great. Fill up the low bars soon, or ${name} may get sick.`,
    sick: (name: string) => `${name} is sick and needs medicine.`,
    recovering: (name: string, timeLeft: string) =>
      `${name} is resting after medicine (${timeLeft} left). No mini-games for now, but cuddles and snacks are fine.`,
  },
  blocked: {
    egg: (name: string) => `${name} is still an egg. Keep it cozy and wait for it to hatch!`,
    asleep: (name: string) => `${name} is asleep. Turn the lights on first.`,
    tooTired: (name: string) => `${name} is too sleepy to play. Try a nap with the lights off.`,
    notSick: (name: string) => `${name} isn't sick, no medicine needed.`,
  },
  confirmReset: 'Start over with a new pet? Your current pet will be gone.',
} as const;
