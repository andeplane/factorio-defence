#!/usr/bin/env bash
# Extracts the graphics this game uses from a local Factorio install into
# public/assets/factorio/ and writes manifest.json (see docs/ASSETS.md).
#
#   FACTORIO_PATH=/path/to/Factorio npm run extract-sprites
#
# FACTORIO_PATH may point at the install folder, factorio.app, or its data
# directory. Without it, the usual macOS, Linux and Windows (Git Bash/WSL)
# Steam and standalone locations are tried. Tested with Factorio 1.1.
#
# Needs: lua (5.2+), python3 with Pillow, rsync.
#
# The output is Wube Software's copyright. It is gitignored and must never be
# committed or redistributed.
set -euo pipefail

HERE="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ROOT="$(cd "$HERE/../.." && pwd)"
OUT="${FACTORIO_ASSETS_OUT:-$ROOT/public/assets/factorio}"

find_data_dir() {
  local p="$1"
  for d in "$p" "$p/data" "$p/Contents/data" "$p/factorio.app/Contents/data"; do
    if [[ -f "$d/base/info.json" && -f "$d/core/lualib/dataloader.lua" ]]; then
      echo "$d"; return 0
    fi
  done
  return 1
}

candidates=()
if [[ -n "${FACTORIO_PATH:-}" ]]; then
  candidates=("$FACTORIO_PATH")
else
  candidates=(
    "$HOME/Library/Application Support/Steam/steamapps/common/Factorio"
    "/Applications/factorio.app"
    "/Applications/Factorio.app"
    "$HOME/.steam/steam/steamapps/common/Factorio"
    "$HOME/.local/share/Steam/steamapps/common/Factorio"
    "$HOME/factorio"
    "/c/Program Files (x86)/Steam/steamapps/common/Factorio"
    "/mnt/c/Program Files (x86)/Steam/steamapps/common/Factorio"
    "/c/Program Files/Factorio"
  )
fi

DATA=""
for c in "${candidates[@]}"; do
  if DATA="$(find_data_dir "$c")"; then break; fi
  DATA=""
done
if [[ -z "$DATA" ]]; then
  echo "Could not find Factorio's data directory." >&2
  [[ -n "${FACTORIO_PATH:-}" ]] && echo "FACTORIO_PATH=$FACTORIO_PATH has no base/info.json." >&2
  echo "Set FACTORIO_PATH to your Factorio install, e.g." >&2
  echo "  FACTORIO_PATH=\"\$HOME/Library/Application Support/Steam/steamapps/common/Factorio\" npm run extract-sprites" >&2
  exit 1
fi

for tool in lua python3 rsync; do
  command -v "$tool" >/dev/null || { echo "Missing '$tool' on PATH." >&2; exit 1; }
done
python3 -c "import PIL" 2>/dev/null || { echo "Python needs Pillow: python3 -m pip install Pillow" >&2; exit 1; }

version="$(sed -n 's/.*"version"[[:space:]]*:[[:space:]]*"\([^"]*\)".*/\1/p' "$DATA/base/info.json" | head -1)"
echo "Factorio $version at $DATA"
case "$version" in
  1.1.*) ;;
  *) echo "Warning: only Factorio 1.1 has been tested; $version may not extract cleanly." >&2 ;;
esac

TMP="$(mktemp -d)"
trap 'rm -rf "$TMP"' EXIT
mkdir -p "$OUT"

echo "Loading prototypes..."
lua "$HERE/dump.lua" "$DATA" "$HERE/load.lua" "$OUT/prototypes.json" "$TMP/files.txt"

echo "Copying $(wc -l < "$TMP/files.txt" | tr -d ' ') images..."
(cd "$DATA" && rsync -a --files-from="$TMP/files.txt" ./ "$OUT/")
rsync -a "$DATA/base/graphics/icons/" "$OUT/base/graphics/icons/"

echo "Writing manifest..."
python3 "$HERE/convert.py" "$OUT/prototypes.json" "$DATA" "$OUT/manifest.json"
echo "Done: $OUT ($(du -sh "$OUT" | cut -f1))"
