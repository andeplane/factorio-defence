# Cognite Flows app

The game also ships as a [Flows custom app](https://docs.cognite.com/cdf/flows/guides/getting-started)
in CDF: org `cog-demo`, project `lervik-industries`, cluster `https://api.cognitedata.com` (see `app.json`).
The GitHub Pages build is unchanged and still serves the sprites from `public/assets/factorio/`.

## Where the sprites live

The Flows bundle carries no Factorio graphics. They are CDF files, one per file under
`public/assets/factorio/`, all in the data modeling space **`factorio-defence`** and the directory
**`/factorio-defence/sprites`**, so they are easy to find in CDF:

- each is a `CogniteFile` node (`cdf_cdm/CogniteFile/v1`) with externalId
  `factorio-defence/sprites/<path relative to public/assets/factorio>` (e.g.
  `factorio-defence/sprites/manifest.json`), `sourceId` = that relative path, and a
  `sha256:<hex>` tag of the content; the constants are in `src/flows/cdfAssets.ts`
- the upload creates the space if it is missing

In the app, `src/flows/index.ts` connects to the Fusion host with `connectToHostApp()` and swaps the
engine's asset source (`setAssetSource` in `src/engine/Assets.ts`) for one that asks
`files/downloadlink` (by instance id) for the sprites the level needs, with the logged-in user's
token. Players need read access to files and to instances in the space. Missing files fall back to
placeholders, like a missing local sprite. The Pages build never loads this code
(`VITE_ASSET_SOURCE` is only set in `.env.flows`).

If a project can't use data modeling files, `upload:cdf -- --classic [--data-set <extId>]` writes
classic files with the same externalIds and directory, and `VITE_CDF_SPRITE_SPACE=` (empty) in
`.env.flows` makes the app read those instead.

## Commands (on the machine with the extracted sprites)

| Command | What it does |
| --- | --- |
| `npm run deploy:flows` | Uploads changed sprites, builds, deploys a new draft app version (`versionTag` 0.&lt;day&gt;.&lt;minute&gt;, only for the deploy) |
| `npm run deploy:flows -- --no-upload` | Same without the upload |
| `npm run deploy:flows -- --activate` | Also publishes the new version and makes it the ACTIVE one |
| `npm run upload:cdf` | Only the upload. `-- --dry-run` lists what it would send |
| `npm run upload:cdf -- --delete-classic` | Lists classic sprite files left by an earlier classic upload; add `--yes` to delete them |
| `npm run dev:flows` | Dev server on https://localhost:3001 that opens the app inside Fusion, reading sprites from CDF |
| `npm run build:flows` | `dist/` for the Flows app, without `public/` |

The upload logs in through the browser at auth.cognite.com (org hint from `app.json`), or uses a
token in `CDF_TOKEN`; it needs `dataModels:write` (for the space), `dataModelInstances:write` and
`files:write`. Nothing is
written to disk. Unchanged files are skipped by sha256 (a changed file's node is replaced), and `manifest.json` goes up last. The deploy
step runs `npx @cognite/cli apps deploy --interactive`, which has its own browser login. The project
needs app hosting enabled; a project without Dev status also needs signed bundles (see the Flows
docs on code signing).

## After a deploy

A deploy creates a **draft** version, which opens from the link the CLI prints
(`.../flows-apps/app/factorio-defence?...&customAppVersion=<version>`). `deploy:flows -- --activate`
makes it the version everyone gets in one go. By hand, the CLI acts on the `versionTag` in
`app.json`, which `deploy:flows` puts back after deploying, so first set it to the deployed version,
then from the repo root (each step logs in in the browser):

1. `npx @cognite/cli@latest apps sign --interactive` signs the bundle in `.cognite-bundles/`
   (needed where the project requires a developer signature)
2. `npx @cognite/cli@latest apps publish .` moves the version from DRAFT to PUBLISHED
3. `npx @cognite/cli@latest apps activate .` makes it the ACTIVE version (publishes first if needed)

`npx @cognite/cli@latest apps status .` shows the current version and its signatures, and
`apps submit` packages the source for Cognite's app certification (needed for production projects).
