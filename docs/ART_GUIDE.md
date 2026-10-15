# Art guide: making your own pet characters

This explains how the pet's art is organised, how to draw a character in Aseprite, and how to get it into the game. You never need to change any code to add or replace art.

## How characters work

- Every pet looks the same as an **egg**, a **baby** and a **teen**.
- When the teen grows up, it becomes an adult **character**. Each character has a **theme** (Basic, Nature, Cave, Sparkle) and a **rarity** of 1 to 3 stars.
- Good care during the baby and teen days raises the chance of a rarer character. The odds are in `src/game/config.ts` under `rarity`.
- A character can have **colour variants** (for example an Amber Pebblit). A variant is just another sheet with a chance of appearing.

Today each theme has a common (★) and a rare (★★★) character:

| Theme | ★ | ★★★ |
| --- | --- | --- |
| Basic | Dumpling | Cloudlet |
| Nature | Sprig | Fernwhisk |
| Cave | Pebblit (and Amber variant) | Geodon |
| Sparkle | Glimmer | Starwisp |

All of these are placeholders, made to be painted over.

## Where everything lives

```
art/                               your Aseprite files (the game never loads these)
  _template.aseprite               blank file for a new character
  stages/egg.aseprite, baby, teen
  characters/<theme>/<id>.aseprite

public/sprites/                    exported PNGs the game loads
  manifest.json                    list of every sheet
  stages/egg.png, baby.png, teen.png
  characters/<theme>/<id>.png

src/data/characters.json           every character: theme, stars, name, sheet, variants
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
| 5 | `happy` | right after you play, or when it grows up | 4 |

So a full sheet is 128 x 192 pixels. The egg only has an `idle` row. If a sheet is missing an animation, the game uses `idle` instead, so you can start with just `idle` and add the rest later.

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
4. **List the sheet** in `public/sprites/manifest.json` under `"sheets"`:
   ```json
   "stalagbun": { "file": "characters/cave/stalagbun.png" }
   ```
5. **Add the character** to `src/data/characters.json`:
   ```json
   { "id": "stalagbun", "theme": "cave", "stars": 2, "name": "Stalagbun", "sheet": "stalagbun" }
   ```

A new **theme** is one more line under `"themes"` in `characters.json`, then characters can use it. Characters of the same rarity share that rarity's chance equally, whatever their theme.

## Adding a colour variant

1. Save a copy of the character's file, for example `art/characters/cave/geodon-frost.aseprite`, and recolour it (Edit → Replace Color helps).
2. Export it to `public/sprites/characters/cave/geodon-frost.png` and add it to `manifest.json`.
3. In `characters.json`, give the character a `variants` list. `chance` is the percent of these characters that get the variant:
   ```json
   { "id": "geodon", "theme": "cave", "stars": 3, "name": "Geodon", "sheet": "geodon",
     "variants": [{ "id": "frost", "name": "Frost", "sheet": "geodon-frost", "chance": 20 }] }
   ```

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
- **Original designs only.** Don't copy existing game characters.

## Getting your art into the game

- **On the GitHub website:** open the repository, go to the right folder, choose Add file → Upload files, and commit. Edit `manifest.json` and `characters.json` there with the pencil icon. Upload the `.aseprite` file to `art/` too, so it's kept safe.
- **Ask Claude:** attach your PNG (or `.aseprite`) in the project thread and say its theme and rarity. Claude adds it.

To try it on your computer, run `npm run dev` and use **Settings → Testing tools → Grow up now**. The testing tools show the Care Score and the character. Start over to roll a new pet.

## Regenerating the placeholders

`npm run sprites` makes any placeholder PNG or `.aseprite` file that is **missing**. It never overwrites a file that exists, so your own art is safe. `npm run sprites -- --force` replaces everything with placeholders again. It needs Node.js 22.18 or newer.
