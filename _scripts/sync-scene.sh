#!/usr/bin/env bash
# Keep the 3D scene identical in undone and undone-static.
# Each path is copied from the repo where it's edited:
#   scene code, scene.css, animation spec -> developed in undone-static (live-server preview)
#   three.js vendor bundle               -> built in undone (_scripts/vendor-three/build.sh)
#
# Usage (from anywhere):
#   undone/_scripts/sync-scene.sh        dry run: list what would change
#   undone/_scripts/sync-scene.sh --go   copy for real
set -euo pipefail

undone="$(cd "$(dirname "$0")/.." && pwd)"
static="$(cd "$undone/../undone-static" && pwd)"

from_static=(assets/js/scene/ assets/css/scene.css _construction/build-spec-animation.md)
from_undone=(assets/js/vendor/)

# -r recurse, -c compare by checksum (ignores mtime noise), --delete removes files gone from the source.
opts=(-rc --delete -v)
[[ "${1:-}" == "--go" ]] || { opts+=(--dry-run); echo "dry run (add --go to apply)"; }

sync() { rsync "${opts[@]}" "$1/$3" "$2/$3" | grep -v '^\(sending\|sent\|total\|building\|$\)' || true; }

for p in "${from_static[@]}"; do sync "$static" "$undone" "$p"; done
for p in "${from_undone[@]}"; do sync "$undone" "$static" "$p"; done
