# Where the game's sounds come from

Every audio file the game uses, where it came from and its licence. Add a
line here for every new sound or song, and keep a screenshot or PDF of the
licence page from the day you downloaded it.

## Music (`music/`)

| File | Source | Licence |
| --- | --- | --- |
| `day.mp3`, `night.mp3` | Written for this game and made by `scripts/make-music.ts` (`npm run music`) | Original work, owned by the game |

## Sound effects (`sfx/`)

### Fishing

| File | Source | Licence |
| --- | --- | --- |
| `fish-cast.mp3`, `fish-nibble.mp3`, `fish-bite.mp3`, `fish-reel.mp3`, `fish-splash.mp3`, `fish-escape.mp3`, `fish-perfect.mp3`, `pond-fill.mp3`, `pond-drain.mp3` | Made for this game by `scripts/make-sfx.ts` (`npm run sfx`), synthesized from scratch with no samples | Original work, owned by the game |

### Everything else

All the other sound effects are from the **"soft" pack of UI SFX** version 0.4.0 by Yuki Capital
(https://uisfx.com, npm package `uisfx`, https://github.com/romainsimon/uisfx),
downloaded on 2026-10-20. The sounds are synthesized by the pack's own
recipes, not recorded from anyone else's work.

Licence: **CC0 1.0** (public domain). Commercial use, including with in-app
purchases and ads, is allowed without asking or crediting.
https://creativecommons.org/publicdomain/zero/1.0/legalcode

The package's licence note says: "The audio files under `sounds/` are
dedicated to the public domain under the Creative Commons CC0 1.0 Universal
Public Domain Dedication. You may copy, modify, distribute, and use these
files, including commercially, without asking permission. Attribution is
appreciated but not required."

Files used (same names as in the pack): achievement, badge, blocked, bonus,
cancel, close, drop, level-up, mention, notification, open, purchase,
reaction, receive, reward, send, sleep, success, swipe, unlock, wake.
