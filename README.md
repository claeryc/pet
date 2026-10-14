# Cozy Pixel Pet

A cozy virtual pet that lives in your browser. All creatures and art are original.

## Running it

You need [Node.js](https://nodejs.org) (version 20 or newer) installed.

```bash
npm install      # first time only: downloads the tools
npm run dev      # starts the game; open the link it prints
npm test         # runs the automated checks
npm run build    # makes a finished version in the dist/ folder
npm run sprites  # redraws the placeholder pet sprites (needs Node 22.18+)
```

Want to draw your own pet? See [docs/ART_GUIDE.md](docs/ART_GUIDE.md).

## Where things live

- `src/game/` — the rules of the game (stats, time passing, growing up). `config.ts` holds every tuning number.
- `src/data/creatures.json` — every form the pet can grow into.
- `public/sprites/` — the sprite sheets and `manifest.json`, which lists them.
- `src/render/` — drawing the pet on the canvas, the colour palette and sprites.
- `src/ui/` — the screens and buttons.
- `src/storage/` — saving and loading.
- `src/strings.ts` — all the text the player sees.
- `tests/` — automated checks.
