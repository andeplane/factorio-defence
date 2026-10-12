#!/usr/bin/env bash
# Builds the game with the locally extracted Factorio sprites and publishes dist/ to the gh-pages
# branch, as a single orphan commit that replaces the previous one. main never gets the sprites.
# Usage: npm run deploy:pages            (Pages must serve the gh-pages branch, root folder)
#        npm run deploy:pages -- --no-sprites   (placeholder graphics only)
set -euo pipefail
cd "$(dirname "$0")/.."
remote_url="${DEPLOY_REMOTE:-$(git remote get-url origin)}"
sprites=public/assets/factorio
if [ "${1:-}" = "--no-sprites" ]; then
  stash="$(mktemp -d)"
  [ -d "$sprites" ] && mv "$sprites" "$stash/factorio"
  trap '[ -d "$stash/factorio" ] && mv "$stash/factorio" "$sprites"' EXIT
elif [ ! -f "$sprites/manifest.json" ]; then
  echo "No sprites in $sprites. Run npm run extract-sprites first, or pass --no-sprites." >&2
  exit 1
fi
npm run build
touch dist/.nojekyll
cd dist
rm -rf .git
git init -q -b gh-pages
git add -A
git -c user.name="$(git -C .. config user.name)" -c user.email="$(git -C .. config user.email)" \
  commit -qm "Deploy $(git -C .. rev-parse --short HEAD)"
git push -f "$remote_url" gh-pages
rm -rf .git
echo "Pushed to gh-pages. The site is at https://andeplane.github.io/factorio-defence/"
