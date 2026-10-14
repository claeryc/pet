# Cozy Pixel Pet

A cozy virtual pet that lives in your browser. All creatures and art are original.

## Running it

You need [Node.js](https://nodejs.org) (version 20 or newer) installed.

```bash
npm install      # first time only: downloads the tools
npm run dev      # starts the game; open the link it prints
npm test         # runs the automated checks
npm run build    # makes a finished version in the dist/ folder
```

## Where things live

- `src/game/` — the rules of the game (stats, time passing). `config.ts` holds every tuning number.
- `src/render/` — drawing the pet on the canvas, the colour palette and sprites.
- `src/ui/` — the screens and buttons.
- `src/storage/` — saving and loading.
- `src/strings.ts` — all the text the player sees.
- `tests/` — automated checks.
