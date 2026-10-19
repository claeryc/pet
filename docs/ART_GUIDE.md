# Art guide: making your own pet characters

This explains how the pet's art is organised, how to draw a character in Aseprite, and how to get it into the game. You never need to change any code to add or replace art.

## How characters work

- Every pet looks the same as an **egg**, a **baby** and a **teen**.
- When the teen grows up, it becomes an adult **character**. Each character has a **theme** (Basic, Nature, Cave, Sparkle) and a **rarity** of 1 to 3 stars.
- Good care during the baby and teen days raises the chance of a rarer character. The odds are in `src/game/config.ts` under `rarity`.
- A character can have **colour variants** (for example an Amber Pebblit). A variant is just another sheet with a chance of appearing.

Each theme has a common (★), an uncommon (★★) and a rare (★★★) character:

| Theme | ★ | ★★ | ★★★ |
| --- | --- | --- | --- |
| Basic | Dumpling | Bunbun | Cloudlet |
| Nature | Sprig | Mosscap | Fernwhisk |
| Cave | Pebblit (and Amber variant) | Crystalback | Geodon |
| Sparkle | Glimmer | Moonpip | Starwisp |

![Every character, by theme and rarity](character-lineup.png)

All of these are placeholders, made to be painted over.

## Where everything lives

```
art/                               your Aseprite files (the game never loads these)
  _template.aseprite               blank file for a new character
  stages/egg.aseprite, baby, teen
  characters/<theme>/<id>.aseprite
  hats/<hat>.aseprite
  badges/tiers.aseprite            achievement tiers: bronze, silver, gold

public/sprites/                    exported PNGs the game loads
  manifest.json                    list of every sheet
  stages/egg.png, baby.png, teen.png
  characters/<theme>/<id>.png
  hats/<hat>.png
  badges/tiers.png

src/data/characters.json           every character: theme, stars, name, sheet, variants
src/data/hats.json                 every hat: name, price, sheet
```

Keep `art/` and `public/sprites/` mirrored: `art/characters/cave/pebblit.aseprite` exports to `public/sprites/characters/cave/pebblit.png`.

## What a sprite sheet looks like

- Every frame is **32 x 32 pixels**.
- Each **row** is one animation, and its frames go **left to right**.
- The rows, top to bottom:

| Row | Animation | When it plays | Frames |
| --- | --- | --- | --- |
| 0 | `idle` | normal, happy | 4 |
| 1 | `sad` | a stat is low, or there's a warning | 4 |
| 2 | `sleep` | lights off | 4 |
| 3 | `sick` | sick | 4 |
| 4 | `eat` | right after you feed it | 4 |
| 5 | `happy` | right after you play, or when it grows up (a big jump) | 4 |
| 6 | `cheerful` | very happy and nothing wrong: calm, smiling, no jump | 4 |

So a full sheet is 128 x 224 pixels. The egg only has an `idle` row. If a sheet is missing an animation, the game uses `idle` instead, so you can start with just `idle` and add the rest later.

## The palette

All art uses one shared 16-colour palette (`src/render/palette.ts`). It's already loaded in every `.aseprite` file in `art/`, and `docs/palette.gpl` has it as a separate palette file.

## Editing an existing character

1. Open its file in `art/`, for example `art/characters/cave/geodon.aseprite`.
2. Paint on the **pet** layer. The **guides** layer shows the feet line (pink), the shadow row (purple) and the centre (blue). It's a reference layer, so it never shows up in the export.
3. Export (see below) over the matching PNG in `public/sprites/`, same name and folder.

That's it. No other file changes, and existing pets pick up the new look.

## Making a new character

1. **Copy the template:** duplicate `art/_template.aseprite` into the theme folder and rename it, for example `art/characters/cave/stalagbun.aseprite`. It already has the size, palette, guides, all 24 frames and the six animation tags (`idle`, `sad`, `sleep`, `sick`, `eat`, `happy`), each with the right speed.
2. **Draw** each frame on the **pet** layer with the **Pencil** (B) and **Pixel-perfect** ticked. Never use blur or soft brushes. Keep the feet on the pink line and the pet centred.
3. **Export** the sheet to `public/sprites/characters/cave/stalagbun.png` (see below).
4. **List the sheet** in `public/sprites/manifest.json` under `"sheets"`, with the body shape it's drawn on (see [Body shapes](#body-shapes)):
   ```json
   "stalagbun": { "file": "characters/cave/stalagbun.png", "shape": "wide-loaf" }
   ```
5. **Add the character** to `src/data/characters.json`:
   ```json
   { "id": "stalagbun", "theme": "cave", "stars": 2, "name": "Stalagbun", "sheet": "stalagbun" }
   ```

A new **theme** is one more line under `"themes"` in `characters.json`, then characters can use it. Characters of the same rarity share that rarity's chance equally, whatever their theme.

## Adding a colour variant

1. Save a copy of the character's file, for example `art/characters/cave/geodon-frost.aseprite`, and recolour it (Edit → Replace Color helps).
2. Export it to `public/sprites/characters/cave/geodon-frost.png` and add it to `manifest.json` with the same `shape` as the character.
3. In `characters.json`, give the character a `variants` list. `chance` is the percent of these characters that get the variant:
   ```json
   { "id": "geodon", "theme": "cave", "stars": 3, "name": "Geodon", "sheet": "geodon",
     "variants": [{ "id": "frost", "name": "Frost", "sheet": "geodon-frost", "chance": 20 }] }
   ```

## Hats

Any hat fits any character, so you draw each hat only once (in a few sizes), and never per character.

**How it works:** every pet sheet in `manifest.json` names a body `shape`, and the shape says where hats sit. In every other frame the game finds how far the top of the head has moved (by looking at the picture) and moves the hat with it, so the hat hops, squashes and sleeps along with the pet.

**If a hat doesn't follow an animation properly**, you can tell the game exactly how far the head moves in each frame of that animation, in pixels compared to the first idle frame (negative is up). Add it to the sheet in `manifest.json`, for example `"headOffsets": { "happy": [1, -4, -5, -3] }`. If every character of a shape needs the same fix, put it on the shape instead. A sheet's own fix wins over its shape's.

### Body shapes

Characters drawn on the same body (same size, same top where a hat rests) share a **shape**. Hats are set up once per shape, so a new character on an existing body needs no hat setup at all. The shapes are listed under `"shapes"` in `manifest.json`:

```json
"shapes": {
  "loaf":      { "head": { "x": 16, "y": 15, "width": 14 } },
  "wide-loaf": { "head": { "x": 16, "y": 15, "width": 14 } },
  "small":     { "head": { "x": 16, "y": 17, "width": 10 } }
}
```

| Shape | Characters |
| --- | --- |
| `baby` | baby |
| `tall` | teen, Sprig |
| `loaf` | Dumpling, Pebblit (and Amber) |
| `wide-loaf` | Bunbun, Crystalback |
| `capped` | Mosscap (hat sits on the mushroom cap) |
| `flat` | Moonpip |
| `small` | Glimmer |
| `big` | Geodon, Starwisp |
| `cloud` | Cloudlet |
| `big-tall` | Fernwhisk |

A shape's `head` is the pixel in the first `idle` frame where the bottom middle of a hat should sit, and how wide a hat may be there. To find it, open a sheet of that shape and look at the first idle frame:

- `x`: the column in the middle of the head.
- `y`: the row just below the top of the head, where the hat rests. If hats sit a little too high or low, change `y` by 1.
- `width`: how many pixels wide a hat can be without looking wrong. On a flat or round head that's about the width of the head's top. **If the head has ears, horns or spikes at the sides with a dip in the middle**, put `y` in the dip and use the gap between the ears as `width`, so hats sit between them instead of covering them. On a **dome**, put `y` on the top and use roughly the width of the upper curve.

The game then uses, for every hat, the widest size that fits `width` (or the smallest size, if none fit). A new hat fits every shape without any extra setup.

**Uneven tops.** Hats are always level, so on a lopsided head pick the spot where a level hat looks best (often a little towards the higher side) and nudge from there. A truly tilted hat would need its own drawing.

**A new body** is a new shape: add it under `"shapes"` and point the sheet at it. A one-off character is simply a shape of one.

**If one hat looks wrong on one shape** (a crown slipping between bunny ears, a party hat poking through spikes), nudge just that hat on that shape with `"hats"`, keyed by the hat's sheet name. `x` moves it right, `y` moves it down (negative is up), and `width` picks that hat's size with a different width:

```json
"wide-loaf": {
  "head": { "x": 16, "y": 15, "width": 14 },
  "hats": { "hat-tiny-crown": { "y": -1 }, "hat-party": { "width": 10 } }
}
```

Every other hat and shape stays as it was.

### Drawing a hat

1. Copy any file in `art/hats/`, for example `beanie.aseprite`. It's 16 x 16 with two frames: tag `small` (about 8 pixels wide) and tag `large` (about 12 pixels wide).
2. Draw the hat with its bottom edge on the last row and centred around column 8. Give it the dark outline.
3. Export with **Sheet type: Horizontal Strip** (small on the left, large on the right), to `public/sprites/hats/<name>.png`, so the PNG is 32 x 16.

**More sizes:** a hat can have as many sizes as you like, as frames going from smallest on the left to largest on the right. For example, add a third frame with an extra-wide version for big pets (the PNG is then 48 x 16). The game measures how wide each drawing is, so there's nothing else to set. If a size needs more than 16 pixels, make every frame of that hat wider (for example 24 x 16) and set `frameWidth` to match in step 4.
4. Add it to `manifest.json`:
   ```json
   "hat-scarf": { "file": "hats/scarf.png", "frameWidth": 16, "frameHeight": 16, "animations": {} }
   ```
5. Add it to `src/data/hats.json` with a name and a price:
   ```json
   { "id": "scarf", "name": "Snug Scarf", "price": 90, "sheet": "hat-scarf" }
   ```

It then shows up in the Shop. Glasses could work the same way later with an `eyes` point.

## Achievement badges

The Collection shows each achievement's tier as a small picture. They all live in `art/badges/tiers.aseprite`: 16 x 16, three frames tagged `bronze`, `silver` and `gold`. Its palette has the shared colours plus the four shades of each metal (highlight, light, mid, dark). The game shows each frame at twice its size.

To change them, draw over the frames, then export with **Sheet type: Horizontal Strip** (bronze, silver, gold from left to right) to `public/sprites/badges/tiers.png`, so the PNG is 48 x 16. No other file changes.

## Exporting a sheet from Aseprite

File → Export Sprite Sheet (Ctrl+E):

- **Layout** tab: Sheet type **By Rows**.
- **Sprite** tab: Layers **Visible layers**, and tick **Split Tags**, so each tag gets its own row.
- **Borders** tab: all padding and spacing at **0**.
- **Output** tab: tick **Output File** and pick the PNG in `public/sprites/`. Untick JSON Data (the game uses `manifest.json`).
- Click Export.

## Consistency rules (especially for AI-generated art)

- **Only palette colours.** Use Sprite → Color Mode → Indexed with the palette loaded to snap stray colours.
- **No anti-aliasing or blur.** Hard edges, pixel to pixel.
- **A dark outline** (the `ink` colour) around the pet, so it stands out on any background.
- **Same silhouette across frames.** Only small changes between frames (a hop, a blink).
- **Feet on row 28**, with a 1-pixel shadow on row 29. **Centred** horizontally.
- **Keep the top row empty** in every frame, even at the top of a jump. If the head (or its spikes, antenna...) runs off the top, hats can't follow it.
- **Original designs only.** Don't copy existing game characters.

## Getting your art into the game

- **On the GitHub website:** open the repository, go to the right folder, choose Add file → Upload files, and commit. Edit `manifest.json` and `characters.json` there with the pencil icon. Upload the `.aseprite` file to `art/` too, so it's kept safe.
- **Ask Claude:** attach your PNG (or `.aseprite`) in the project thread and say its theme and rarity. Claude adds it.

To try it on your computer, run `npm run dev` and use **Settings → Testing tools**: set the Care Score (10, 60 or 90), then **Grow up now** until it's an adult. Start over to roll a new pet. **+100 gold** helps for trying hats from the Shop.

## Regenerating the placeholders

`npm run sprites` makes any placeholder PNG or `.aseprite` file that is **missing**. It never overwrites a file that exists, so your own art is safe. `npm run sprites -- --force` replaces everything with placeholders again. It needs Node.js 22.18 or newer.
