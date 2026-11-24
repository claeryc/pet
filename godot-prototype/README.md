# Godot prototype: the pet's home screen

A test rebuild of just the home screen in [Godot 4.5](https://godotengine.org),
to compare with the web game before deciding whether to move. It doesn't
touch the web game: everything is in this folder.

What's in it, matching the redesigned web game:

- The tall room (ceiling beam, fairy lights, picture, clock, hanging lamp)
  with the pet, its face layer and idle moves, and the four need icons that
  empty in five steps.
- The dock: Feed, Map and "···". Feed and Play open a sheet and the room
  folds up to make room. "···" opens the pop-up menu (only Play works; the
  rest say they're not ported yet).
- The map: the island with its bubbles and the pet at home, tap a place to
  go there, hold it for its name, and the Backyard zooms into its close-up.
- Fishing: tap the pond on the map. The room folds up, water rises into a
  pond under it, and the dock becomes [Cancel] [Cast]. Cast, wait through
  the nibbles, Reel in on the bite ("!"), then hold Pull to keep the dot
  on the green until the meter fills. Shrimp, salmon (darts about) and
  lobster (tugs hard), the "Perfect!" streak, and the catch goes into the
  Feed sheet. Bait, fishing skills, XP and the daily limit aren't ported.
- Tapping the pet to cuddle it, the moon button for sleep, time passing
  (also while the game is closed), the rice jar, and saving.

The bottom of the "···" menu has prototype-only rows: swap between five
pets, run time 60× or 600× faster, and reset the pet.

## Opening it

1. Install Godot 4.5 (the standard version, not .NET).
2. In Godot's Project Manager, choose **Import** and pick
   `godot-prototype/project.godot`.
3. Press **F5** (or the ▶ button) to play.

Where to look in the editor:

- `scenes/main.tscn`: the whole screen. Click any node to move or restyle it.
- `scenes/pet.tscn`: the pet (body, face, food, hearts, Zzz).
- `data/tuning.tres`: every tuning number (decay rates, sleep hours,
  thresholds…). Change them in the Inspector.
- `data/care/*.tres`: one file per food or way to play. Duplicate one to
  add a new food.
- `data/fishing.tres` and `data/fish/*.tres`: every fishing number (bite
  timing, zone sizes, pull and drift, how each fish fights).
- `data/theme.tres`: colours, fonts and button styles.
- `pets/*_frames.tres`: open one to see every animation in the SpriteFrames
  panel at the bottom.

## Where things live

- `scripts/rules.gd`: the rules (time passing, feeding, playing, moods). No
  screen code, so it can be tested on its own.
- `scripts/game.gd`: the running game (state, the clock, saving), reachable
  everywhere as `Game`.
- `scripts/main.gd`: fills in the screen and passes button presses on.
- `scripts/pet.gd`: picks the pet's animation and face, and moves the face
  with the head.
- `scripts/room.gd`: draws the room (a port of `src/render/room.ts`).
- `scripts/fishing_rules.gd`: the fishing rules, also screen-free.
  `scripts/fishing_screen.gd` runs the mini-game, `scripts/pond.gd` draws
  the pond, `scripts/catch_bar.gd` the bar and `scripts/rod.gd` the rod.
- `scenes/map.tscn` and `scripts/map_screen.gd`: the map. The places come
  from `data/maps/*.json`.
- `tools/import_art.py`: copies the art from `public/sprites/` and writes the
  Godot resources for it. Run it again after changing the art:
  `python3 godot-prototype/tools/import_art.py` (from the repository root).
- `tools/export_icons.py`: turns the text-grid icons in `src/ui/icons.ts`
  and the need icons in `src/ui/needIcons.ts` into PNGs.
- `tools/import_map.py`: copies the map art from `public/sprites/map/` and
  writes each place's tap shape and bubble point to `data/maps/`.
- `tools/export_bubbles.mjs`: writes the map bubbles from
  `src/ui/mapBubbles.ts` as SVG files (`node godot-prototype/tools/export_bubbles.mjs`).

## Checks

```bash
godot --headless --path godot-prototype --import                          # first time only
godot --headless --path godot-prototype -s res://tests/test_rules.gd      # 38 rule checks
godot --headless --path godot-prototype res://tests/screen_test.tscn      # presses the real buttons
```

## Web version

```bash
godot --headless --path godot-prototype --export-release "Web"
```

This writes `godot-prototype/build/web/`. Serve that folder with any web
server (for example `python3 -m http.server` inside it) and open
`index.html`. It needs Godot's web export templates (Editor > Manage Export
Templates) and uses the single-threaded build, so it runs on any static host.
