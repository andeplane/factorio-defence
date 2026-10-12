# Cognite Flows app

The game also ships as a [Flows custom app](https://docs.cognite.com/cdf/flows/guides/getting-started)
in CDF: org `cog-demo`, project `lervik-industries`, cluster `https://api.cognitedata.com` (see `app.json`).
The GitHub Pages build is unchanged and still serves the sprites from `public/assets/factorio/`.

## Where the sprites live

The Flows bundle carries no Factorio graphics. They are CDF Files, one per file under
`public/assets/factorio/`:

- externalId `factorio-defence/sprites/<path relative to public/assets/factorio>`
  (e.g. `factorio-defence/sprites/manifest.json`); the prefix is `CDF_ASSET_PREFIX` in `src/flows/cdfAssets.ts`
- directory `/factorio-defence/sprites`, source `factorio-defence`, `metadata.sha256` of the content
- optionally in a data set (`--data-set <externalId>`)

In the app, `src/flows/index.ts` connects to the Fusion host with `connectToHostApp()` and swaps the
engine's asset source (`setAssetSource` in `src/engine/Assets.ts`) for one that asks
`files/downloadlink` for the sprites the level needs, with the logged-in user's token. Players need
`files:read` in the project. Missing files fall back to placeholders, like a missing local sprite.
The Pages build never loads this code (`VITE_ASSET_SOURCE` is only set in `.env.flows`).

## Commands (on the machine with the extracted sprites)

| Command | What it does |
| --- | --- |
| `npm run deploy:flows` | Uploads changed sprites, builds, deploys a new app version (`versionTag` is set from the time) |
| `npm run deploy:flows -- --no-upload` | Same without the upload |
| `npm run upload:cdf` | Only the upload. `-- --dry-run` lists what it would send; `-- --data-set <extId>` |
| `npm run dev:flows` | Dev server on https://localhost:3001 that opens the app inside Fusion, reading sprites from CDF |
| `npm run build:flows` | `dist/` for the Flows app, without `public/` |

The upload logs in through the browser at auth.cognite.com (org hint from `app.json`), or uses a
token in `CDF_TOKEN`; it needs `files:write` (and `datasets:read` with `--data-set`). Nothing is
written to disk. Unchanged files are skipped by sha256, and `manifest.json` goes up last. The deploy
step runs `npx @cognite/cli apps deploy --interactive`, which has its own browser login. The project
needs app hosting enabled; a project without Dev status also needs signed bundles (see the Flows
docs on code signing).
