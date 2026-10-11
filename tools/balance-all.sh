#!/usr/bin/env bash
# Balances every level in parallel, one process per level. Usage: tools/balance-all.sh [runs] [--lookahead]
set -uo pipefail
runs="${1:-60}"
extra="${2:-}"
out="$(mktemp -d)"
ids=$(grep -o "^    id: '[a-z-]*'" src/sim/levels.ts | sed "s/.*id: '\(.*\)'/\1/")
n=0
for id in $ids; do
  n=$((n + 1))
  file="$out/$(printf '%02d' "$n").txt"
  npx vite-node tools/balance.ts -- "$runs" "$id" $extra > "$file" 2>&1 &
  while [ "$(jobs -rp | wc -l)" -ge "$(nproc)" ]; do sleep 0.5; done
done
wait
cat "$out"/*.txt
rm -rf "$out"
