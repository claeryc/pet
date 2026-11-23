# Godot prototype: the pet's home screen

A test rebuild of just the home screen in [Godot 4.5](https://godotengine.org),
to compare with the web game before deciding whether to move. It doesn't
touch the web game: everything is in this folder.

What's in it: the room (window, wallpaper, floor), the pet with its face
layer and idle moves, the four stat bars, the Feed and Play drawers (rice
ball, strawberry, cookie, cuddle, tickle), tapping the pet to cuddle it,
Lights off / sleep, time passing (also while the game is closed), and saving.
Prototype-only buttons swap between five pets, run time 60× or 600× faster,
and reset the pet.

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
- `tools/import_art.py`: copies the art from `public/sprites/` and writes the
  Godot resources for it. Run it again after changing the art:
  `python3 godot-prototype/tools/import_art.py` (from the repository root).
- `tools/export_icons.py`: turns the text-grid icons in `src/ui/icons.ts`
  into PNGs.

## Checks

```bash
godot --headless --path godot-prototype --import                          # first time only
godot --headless --path godot-prototype -s res://tests/test_rules.gd      # 26 rule checks
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
