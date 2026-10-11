#!/usr/bin/env bash
# Tunes every level's difficulty in parallel towards a target greedy win rate that falls across the campaign.
set -uo pipefail
runs="${1:-40}"
targets=(0.97 0.94 0.92 0.9 0.87 0.85 0.82 0.8 0.77 0.75)
out="$(mktemp -d)"
ids=$(grep -o "^    id: '[a-z-]*'" src/sim/levels.ts | sed "s/.*id: '\(.*\)'/\1/")
n=0
for id in $ids; do
  npx vite-node tools/tune.ts -- "$id" "${targets[$n]}" "$runs" > "$out/$(printf '%02d' "$n").txt" 2>&1 &
  n=$((n + 1))
  while [ "$(jobs -rp | wc -l)" -ge "$(nproc)" ]; do sleep 0.5; done
done
wait
cat "$out"/*.txt
rm -rf "$out"
