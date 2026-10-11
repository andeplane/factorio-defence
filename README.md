# Factorio Defence

A tower defence game about getting things through: oil, parts, products. Built
on a small Factorio-style 2D engine.

## Run

```sh
npm install
npm run dev      # http://localhost:5173
npm test
npm run build
```

Controls: WASD or drag to pan, mouse wheel to zoom, 1-9 to pick an entity,
R to rotate, left click to place, right click to remove, Q to clear the cursor.

## Engine

TypeScript + [PixiJS 8](https://pixijs.com) (WebGL) + Vite.

- `src/engine/Camera.ts` pan and zoom-to-cursor camera; 1 tile = 32 world px.
- `src/engine/TileMap.ts` infinite ground generated and rendered in 32x32 chunks.
- `src/engine/Entities.ts` grid entities with footprints, directions, layered
  sprites, a shadow layer, y-sorting and synchronized animation.
- `src/engine/Assets.ts` + `manifest.ts` load Factorio-style spritesheets
  from a manifest, falling back to `placeholders.ts`.
- `src/engine/FactoryView.ts` draws a running factory from a plain
  `FactoryViewState` snapshot (items on belt lanes, inserter swing and held
  item, machines' working flags), so a headless simulation can drive it.
- `src/engine/Engine.ts` fixed 60 ticks/s game loop, like Factorio.
- `src/game/` the current demo scene and entity prototypes.

## Graphics

With no extra setup the game draws generated placeholder graphics. To use
Factorio's own graphics, extract them from your local install:

```sh
FACTORIO_PATH="/path/to/Factorio" npm run extract-sprites
```

This writes `public/assets/factorio/` with a `manifest.json`; see
[docs/ASSETS.md](docs/ASSETS.md). That folder is gitignored: Factorio's
graphics are © Wube Software and must not be committed.
