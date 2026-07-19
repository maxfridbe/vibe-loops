#!/bin/bash
# Downloads the pinned third-party runtime libraries into lib/ and the
# dev-only TypeScript typings into typings/. Run once; the results are
# committed to the repository so builds never touch npm or a CDN.
set -euo pipefail
cd "$(dirname "$0")/.."

REACT_VERSION=18.3.1
SQLJS_VERSION=1.13.0
LAMEJS_VERSION=1.2.1
TYPES_REACT_VERSION=18.3.12
TYPES_REACT_DOM_VERSION=18.3.1
CSSTYPE_VERSION=3.1.3
TYPES_PROP_TYPES_VERSION=15.7.13

fetch() { # url dest
  echo "fetching $2"
  curl -fsSL "$1" -o "$2"
}

# --- runtime libraries (shipped, referenced with SRI hashes) ---------------
fetch "https://unpkg.com/react@${REACT_VERSION}/umd/react.production.min.js"         lib/react.production.min.js
fetch "https://unpkg.com/react-dom@${REACT_VERSION}/umd/react-dom.production.min.js" lib/react-dom.production.min.js
fetch "https://unpkg.com/sql.js@${SQLJS_VERSION}/dist/sql-wasm.js"                   lib/sql-wasm.js
fetch "https://unpkg.com/sql.js@${SQLJS_VERSION}/dist/sql-wasm.wasm"                 lib/sql-wasm.wasm
fetch "https://unpkg.com/lamejs@${LAMEJS_VERSION}/lame.min.js"                       lib/lame.min.js

# --- dev-only typings (not shipped) ----------------------------------------
tmp=$(mktemp -d)
trap 'rm -rf "$tmp"' EXIT
untar_types() { # tarball-url dest-dir
  mkdir -p "$2"
  rm -rf "$tmp"/*
  curl -fsSL "$1" | tar -xz -C "$tmp"
  # tarball root dir name varies (package/, react/, ...); take whatever unpacked
  find "$tmp" -name '*.d.ts' -exec cp {} "$2/" \;
}
untar_types "https://registry.npmjs.org/@types/react/-/react-${TYPES_REACT_VERSION}.tgz"             typings/react
untar_types "https://registry.npmjs.org/@types/react-dom/-/react-dom-${TYPES_REACT_DOM_VERSION}.tgz" typings/react-dom
untar_types "https://registry.npmjs.org/csstype/-/csstype-${CSSTYPE_VERSION}.tgz"                    typings/csstype
untar_types "https://registry.npmjs.org/@types/prop-types/-/prop-types-${TYPES_PROP_TYPES_VERSION}.tgz" typings/prop-types

echo "done."
