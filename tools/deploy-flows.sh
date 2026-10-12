#!/usr/bin/env bash
# Deploys the game as a Cognite Flows app: uploads the extracted sprites to CDF Files (only the
# changed ones), builds with `--mode flows` (no sprites in the bundle) and deploys with the Cognite
# CLI to the target in app.json (cog-demo / lervik-industries). Each step logs in in the browser.
# Every deploy is a new app version: versionTag in app.json is set from the clock for the deploy
# and put back afterwards, so the working tree stays clean. The version lands in draft; see
# docs/FLOWS.md for publishing and activating it.
# Usage: npm run deploy:flows
#        npm run deploy:flows -- --no-upload  (skip the sprite upload, e.g. when they are unchanged)
#        npm run deploy:flows -- --activate   (also publish the new version and make it ACTIVE)
set -euo pipefail
cd "$(dirname "$0")/.."
upload=1 activate=0
for arg in "$@"; do
  case "$arg" in
    --no-upload) upload=0 ;;
    --activate) activate=1 ;;
    *) echo "Unknown option $arg" >&2; exit 1 ;;
  esac
done
if [ "$upload" = 1 ]; then
  if [ ! -f public/assets/factorio/manifest.json ]; then
    echo "No sprites in public/assets/factorio. Run npm run extract-sprites first, or pass --no-upload." >&2
    exit 1
  fi
  npm run upload:cdf
fi
now=$(date -u +%s)
# 0.<days since 2026-01-01>.<minute of the day, UTC>: increases with every deploy and keeps the
# numbers small (App Hosting rejected 0.20261012.1314).
version="0.$(( (now - 1767225600) / 86400 )).$(( now % 86400 / 60 ))"
cp app.json "$(mktemp -d)/app.json.orig" && orig="$_"
trap 'cp "$orig" app.json' EXIT
node -e 'const f="app.json",fs=require("fs"),a=JSON.parse(fs.readFileSync(f));a.versionTag=process.argv[1];fs.writeFileSync(f,JSON.stringify(a,null,2)+"\n")' "$version"
echo "Deploying version $version"
npm run build:flows
npx --yes @cognite/cli@latest apps deploy --interactive --skip-build -d 0
# The CLI reads the version from app.json, so this has to happen before it is put back.
if [ "$activate" = 1 ]; then
  npx --yes @cognite/cli@latest apps activate . --interactive -d 0
fi
