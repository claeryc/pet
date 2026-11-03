# Map guide: drawing the map and adding areas

The map (**Menu → Map**) is one picture per map, drawn in Aseprite, with a tap
shape for every area on it. Two maps exist now:

- **island**: the home island. Home in the middle, with Backyard, Meadow,
  Friends, Windmill Fields (a placeholder for now) and the ship around it.
- **sea**: what you see after tapping the ship. The four journey places, each
  its own island, and the home island at the bottom to sail back.

Everything about an area is in two places:

| What | Where |
| --- | --- |
| How it looks, where you tap, where its sign goes | `art/map/<map>.aseprite` |
| Its name, what its button opens, when it unlocks | `src/data/map.json` |

The game code reads both, so **a new area needs no code** unless it opens a
kind of screen the map doesn't know yet (see [What an area can open](#what-an-area-can-open)).

## The Aseprite file

Each map is one canvas (the island and the sea are 180 × 270, a tall phone
shape). The game shows it as big as it fits on the
screen. Its layers:

| Layer | Shown? | What it is |
| --- | --- | --- |
| `ground`, `details`, any other name | visible | **The picture.** Every visible layer that isn't one of the special ones below is flattened into the map picture. Name and split them however you like. |
| `night` | hidden | **Night lights**: lit windows, lanterns, glowing things. At night the game dims the picture and draws this layer on top at full brightness. Leave it out if you don't want lights. |
| `locked:<id>` | hidden | **Clouds over a locked area.** Shown in the game only while that area is locked. Optional: a locked area without one gets a soft purple shade instead. |
| `area:<id>` | hidden | **The tap shape** for area `<id>`. Paint the part of the map that should react to a tap, in any colour. Only whether a pixel is painted counts. It's also the outline the game rings in butter yellow when the area is picked. |
| `guides` | any | Anything for you only (grids, notes). Never exported. |

`<id>` is the area's id from `map.json`: lowercase letters, numbers and `-`
(`backyard`, `coral-cove`).

Tips for tap shapes:

- Make shapes **touch but not overlap**, so a tap always means one area. If
  they overlap, the one further down in `map.json` wins.
- Include a bit of sea or shore around small things (the ship, a little
  island), so they're easy to hit with a thumb. 12 × 12 pixels is about the
  smallest that's comfortable.
- The shape doesn't have to be one piece. The sea islands' shapes include
  the water around them.

### Slices: where the sign and the pet go

Use the **Slice tool** (Shift+C) to mark two spots per area. Both are optional;
without them, both go in the middle of the area's tap shape.

- **`label:<id>`**: the area's name sign. The sign's **bottom middle** sits on
  the slice's bottom middle, so draw a small slice where the sign should
  stand.
- **`pin:<id>`**: where the pet stands when it's there (and, on the sea, where
  the boat sails to). The **middle** of the slice is used.

On the sea, a third one says where a journey island's **trip flags** stand:

- **`flag:<id>`**: one flag per trip on the board that goes there (a gold
  banner for an Adventure, a moon for the night trip). The flags stand on
  the slice's **bottom middle**. Without it, they stand on the pin.

To name a slice, double-click it with the Slice tool.

## map.json

`src/data/map.json` lists the maps and their areas, in the order the
‹ › buttons step through them. VS Code checks it against
`schemas/map.schema.json` and suggests the fields as you type.

```json
{
  "id": "backyard",
  "name": "Backyard",
  "opens": "garden",
  "unlock": "garden",
  "lockedText": "Opens when the garden does"
}
```

| Field | |
| --- | --- |
| `id` | Matches the `area:<id>` layer. Required. |
| `name` | The sign and card title. Journey places can leave it out: they use the place's name. |
| `opens` | What the area's button does. Required. See below. |
| `unlock` | An unlock id (see `src/game/unlocks.ts`). Until then the area is locked: no button, clouds or shade, and `lockedText` on the card. Journey places use their own unlock and don't need this. |
| `lockedText` | What the card says while it's locked. |
| `soonText` | For `"opens": "soon"`: what the card says. |

Each map also has a `title` (the sign at the top) and, for maps you get to
from another one, `back`: the map the **‹ Back** button goes to.

### What an area can open

| `opens` | The button | |
| --- | --- | --- |
| `home` | Go home | Closes the map. |
| `garden` | Go | The Backyard and its garden. |
| `meadow` | Visit | Menu → Meadow. |
| `friends` | Visit | Meet a visitor if one's over, else Messages → Friends. |
| `soon` | Soon | Not built yet: shown, never opens. |
| `map:<id>` | Set sail / Sail home | Another map, like `map:sea`. |
| `journey:<place>` | Plan a trip | The journey board. `<place>` is a place id from the journeys config. |

Tapping a place opens a **bubble** over its sign with its news and its
button; on the sea, a journey island's bubble shows its trips as postcards.
When something is waiting at a place (water, a ripe crop, honey, a visitor,
a letter, a backpack, a trip), its sign gets a little picture in the corner.
When several things are waiting (a plant to water *and* a ripe crop), the
sign shows the first two, most important first, then "+1" for the rest, and
the bubble lists each on its own line. On the sea, an island with both an
Adventure and a plain trip shows the gold Adventure badge first.
A journey island that's open but has no trip right now is **misty**: its
`locked:` clouds, shown thin.

The bubble's line under the name (garden ready, a visitor over, the pet out at
Market Town...) is written in `areaCard()` in `src/game/map.ts`, and its words
are in `STRINGS.map` in `src/strings.ts`. A brand-new kind of `opens` (a shop
street, say) needs a line in `parseOpens()` and `areaCard()` there, and in the
`onOpen` switch in `src/ui/home.ts`.

## Adding an area, step by step

Say you want a **Beach** south-west of home that opens later.

1. **Draw it.** Open `art/map/island.aseprite`, paint the beach on the
   picture layers, and its lights on `night` if it has any.
2. **Tap shape.** Add a layer `area:beach`, hide it, and paint over the beach.
3. **Sign and pin.** With the Slice tool, add `label:beach` and `pin:beach`.
4. **Clouds (optional).** Add a hidden `locked:beach` layer with clouds over
   it.
5. **map.json.** Add it to the island's `areas`:
   `{ "id": "beach", "name": "Beach", "opens": "soon", "soonText": "The tide's still out" }`.
6. **Export.** `npm run export-art -- map`. This writes, for each map:
   - `public/sprites/map/<map>.png`: the picture
   - `<map>-night.png`: the lights
   - `<map>-locked-<id>.png`: each cloud cover
   - `<map>.json`: the tap shapes, signs and pins
7. **Check.** `npm run dev`, then Menu → Map. `npm test` checks that every
   area in `map.json` has an `area:` layer and the other way round.

A **new map** works the same way: a new `art/map/<id>.aseprite`, a new entry
under `maps` in `map.json` with a `title` and `back`, and an area somewhere
with `"opens": "map:<id>"` that leads to it.

## The map lab

Run `npm run dev` and open **`/map-lab.html`** (for example
`http://localhost:5173/map-lab.html`). It's a page for laying out the map,
not part of the game, and `npm run build` leaves it out.

**Preview** shows the real map screen in a phone frame (three sizes, day or
night). For each place you can pick how it looks without playing to it:

- **Open**, **Locked** (its clouds), or on the sea **Misty** (open, no trips).
- **What's waiting there**: tick any mix of water, a ripe crop, honey, a
  visitor, a letter, a backpack or a trip, in the order they should show.
- On the sea, its **trips**: any mix of Stroll, Hike, Adventure and Night,
  shown as flags on the island and postcards in its bubble.

Tap a place on the phone to see its bubble, as in the game.

**Edit** shows the picture with every tap shape coloured in, and each sign,
pin and (on the sea) flag spot on top:

| Tool | Key | |
| --- | --- | --- |
| Paint | B | Paints the picked area's tap shape. It takes the pixels from the other shapes, so they never overlap (untick that to allow it). |
| Erase | E | Rubs it out. |
| Move markers | V | Drag a sign (the box), the pet's pin (the dot) or the trip flags (the little flag). A faded one has no slice yet and sits where the game would put it. |

**Add area** makes a new one: give it an id and a name, paint its shape,
and Save. **Ctrl+Z** undoes, **Ctrl+S** saves. What you change shows in
Preview straight away, before you save.

**Save** writes the tap shapes and the `label:`, `pin:` and `flag:` slices
into `art/map/<map>.aseprite` (nothing else in the file changes; the old
file is kept in `art/map/.lab-backup/`), updates the game's
`public/sprites/map/<map>.json`, and adds new areas to `src/data/map.json`
with `"opens": "soon"`. Set what they open there. The picture itself is
still drawn in Aseprite: the lab can't paint the art.

**Live reload:** while the lab is open, saving a map in Aseprite exports it
by itself (if Aseprite is installed; see the art guide for where it looks),
and the lab loads the new picture. **Reload** does the same by hand. The lab
only saves RGB files (Sprite → Color Mode → RGB Color), which the map files
are.

## Making the canvas bigger

When the island grows, use Sprite → Canvas Size on the whole file (every
layer grows together, so the tap shapes stay lined up), then export. Nothing
in the code knows the size: it's read from the export. Keep it roughly phone
shaped (about 2 : 3), or the map gets small on screen with sea around it.

## The placeholders

`npm run map-art` draws the placeholder island and sea (in
`scripts/make-map-art.ts`) and writes both the `.aseprite` files and the
exported PNGs and JSON, so the game works without Aseprite. It never
overwrites files that are there. `npm run map-art -- --force` replaces them:
**that throws away your drawing**, so only use it to start over.
