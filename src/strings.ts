// Every piece of text the player sees lives here, so it is easy to reword
// things or translate the game later.

export const STRINGS = {
  title: 'Cozy Pixel Pet',
  stats: {
    hunger: 'Tummy',
    happiness: 'Joy',
  },
  buttons: {
    feed: 'Feed',
    play: 'Play',
    reset: 'Start over',
  },
  mood: {
    happy: (name: string) => `${name} is feeling cozy.`,
    sad: (name: string) => `${name} needs some love...`,
  },
  confirmReset: 'Start over with a new pet? Your current pet will be gone.',
} as const;
