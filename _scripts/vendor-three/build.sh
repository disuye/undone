#!/usr/bin/env bash
# Rebuild assets/js/vendor/three.module.js: a minified subset of three.js (only what scene/ imports).
# Usage: _scripts/vendor-three/build.sh [three-version]   — add new names to entry.js first.
set -euo pipefail

VERSION="${1:-0.186.1}"
HERE="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
VENDOR="$HERE/../../assets/js/vendor"
TMP="$(mktemp -d)"
trap 'rm -rf "$TMP"' EXIT

cp "$HERE/entry.js" "$TMP/"
cd "$TMP"
npm init -y >/dev/null
npm i --silent "three@$VERSION" esbuild@0.25.10
npx esbuild entry.js --bundle --format=esm --minify --legal-comments=none --target=es2022 --outfile=bundle.js

{ printf '/*! three.js r%s — MIT licence, see LICENSE-three.txt. Bundled subset: _scripts/vendor-three/build.sh */\n' "${VERSION#0.}"; cat bundle.js; } > "$VENDOR/three.module.js"
cp node_modules/three/LICENSE "$VENDOR/LICENSE-three.txt"
echo "three@$VERSION → $VENDOR/three.module.js ($(wc -c < "$VENDOR/three.module.js") bytes)"
