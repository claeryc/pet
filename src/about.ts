// What Settings shows about the game itself: its version, and where its
// help, privacy policy and terms live.
//
// Before releasing the game, fill in the three links below. The app
// stores ask for a privacy policy and a way to get help, and both need to
// be reachable from inside the game. While a link is empty, its row in
// Settings shows greyed out with "Coming soon" (see src/ui/menu.ts).

export const LINKS = {
  // Where "Help and feedback" goes: an email address as
  // 'mailto:you@example.com', or a web page.
  support: '',
  privacy: '', // the privacy policy's web page
  terms: '', // the terms of use's web page
};

export type LinkId = keyof typeof LINKS;

// The game's version, from package.json (vite.config.ts passes it in).
// Bump "version" there for each release so bug reports say which one.
export const VERSION: string = typeof __APP_VERSION__ === 'string' ? __APP_VERSION__ : 'dev';
