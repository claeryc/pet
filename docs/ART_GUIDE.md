# Art guide: making your own pet sprites

This explains how the pet's art works, how to draw your own in Aseprite, and how to get it into the game. You never need to change any code to add or replace art.

## How the game finds art

Three files work together:

1. **`public/sprites/*.png`**: the sprite sheets (the pictures).
2. **`public/sprites/manifest.json`**: a list of every sheet, its frame size, and which row holds which animation.
3. **`src/data/creatures.json`**: every form (look) a pet can grow into, and which sheet each one uses.

The game loads art only through `manifest.json`. If a sheet is missing or misnamed, the pet shows a small purple "?" box instead, so it's easy to spot.

## What a sprite sheet looks like

- Every frame is **32 x 32 pixels**.
- Each **row** is one animation, and its frames go **left to right**.
- The standard rows, top to bottom:

| Row | Animation | When it plays | Frames |
| --- | --- | --- | --- |
| 0 | `idle` | normal, happy | 4 |
| 1 | `sad` | a stat is low, or there's a warning | 4 |
| 2 | `sleep` | lights off | 4 |
| 3 | `sick` | sick | 4 |
| 4 | `eat` | right after you feed it | 4 |
| 5 | `happy` | right after you play, or when it grows up | 4 |

So a full sheet is 128 x 192 pixels (4 frames x 6 rows). The egg is the exception: it only has an `idle` row (a wobble), and `manifest.json` says so for that sheet. If a sheet is missing an animation, the game uses `idle` instead, so you can start small.

Open any placeholder PNG in `public/sprites/` to see the layout.

## The palette

All art uses one shared 16-colour palette, so everything looks like it belongs together. The colours are defined in `src/render/palette.ts`, and **`docs/palette.gpl`** has the same colours as a palette file Aseprite can load.

## Drawing a sprite in Aseprite, step by step

1. **New file:** File → New. Set Width 32, Height 32, Color Mode **RGBA**, Background **Transparent**.
2. **Load the palette:** in the Palette panel, click the menu (☰) → Load Palette, and pick `docs/palette.gpl`. Use only these colours.
3. **Use crisp pixels:** draw with the **Pencil** tool (B) and tick **Pixel-perfect** in the top bar. Never use blur, soft brushes or smoothing.
4. **Add frames:** show the timeline (Tab), then Frame → New Frame (Alt+N) for each new frame. Make 4 frames per animation.
5. **Name each animation with a tag:** select the 4 frames of one animation in the timeline, then Frame → Tags → New Tag. Name it exactly `idle`, `sad`, `sleep`, `sick`, `eat` or `happy`. Keep the tags in that order from left to right.
6. **Save your work** as a `.aseprite` file somewhere safe (not in `public/`), so you can edit it later.
7. **Export the sheet:** File → Export Sprite Sheet (Ctrl+E):
   - **Layout** tab: Sheet type **By Rows**.
   - **Sprite** tab: tick **Split Tags**, so each tag gets its own row.
   - **Borders** tab: all padding and spacing at **0**.
   - **Output** tab: tick **Output File**, name it something like `adult-starry.png`, and untick JSON Data (the game uses `manifest.json` instead).
   - Click Export.

**Tip:** to start from a placeholder instead, use File → Import Sprite Sheet on one of the PNGs in `public/sprites/` with a 32 x 32 grid.

## Consistency rules (especially for AI-generated art)

If you generate sprites with an AI tool, clean them up in Aseprite (or Piskel) so they follow these rules:

- **Only palette colours.** Use Sprite → Color Mode → Indexed with the palette loaded to snap stray colours.
- **No anti-aliasing or blur.** Edges should be hard, pixel to pixel.
- **Same silhouette across frames.** Only small changes between frames (a hop, a blink), so the animation doesn't flicker.
- **Feet on the same line.** Keep the bottom of the pet around row 28 of the frame, with a 1-pixel shadow on row 29.
- **Centred.** Keep the pet horizontally centred in the 32 x 32 frame.
- **Original designs only.** Don't copy existing game characters.

## Getting your art into the game

1. **Add the PNG** to `public/sprites/`. Use a new name, because `npm run sprites` overwrites the placeholder files.
2. **List it in `public/sprites/manifest.json`** under `"sheets"`:
   ```json
   "adult-starry": { "file": "adult-starry.png" }
   ```
   If your sheet uses fewer frames or a different row order, give it its own `"animations"`, like the egg entry.
3. **Use it in `src/data/creatures.json`**. Either point an existing form's `"sprite"` at your sheet (to replace its look), or add a new form:
   ```json
   { "id": "starry", "stage": "adult", "name": "Starry", "sprite": "adult-starry", "minCare": 70 }
   ```

### How forms and variations are picked

When the pet grows into a stage, the game takes the forms for that stage whose `minCare` the pet's Care Score reaches, and keeps the ones with the highest `minCare`. If several forms share that `minCare`, each pet gets one of them, always the same one for the same pet. So adding a second form with `"minCare": 70` means about half of well-cared-for pets grow into it.

### Two ways to upload

- **On the GitHub website:** open the repository, go to `public/sprites`, choose Add file → Upload files, and commit. Then edit `manifest.json` and `creatures.json` there with the pencil icon.
- **Ask Claude:** attach your PNG in the project thread, say which stage and Care Score it's for, and Claude will add it.

To try it on your computer, run `npm run dev` and use **Settings → Testing tools → Grow up now** to jump through the stages. The testing tools also show the Care Score and the current form.

## Regenerating the placeholders

`npm run sprites` redraws the placeholder sheets from `scripts/make-placeholder-sprites.ts`. It needs Node.js 22.18 or newer. It only writes these files: `egg.png`, `baby.png`, `teen.png`, `adult-sunny.png`, `adult-puffy.png` and `adult-mossy.png`.
