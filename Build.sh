#!/bin/bash
# Full build: TypeScript -> single AMD bundle, starter library assembly,
# SRI-hashed index.html, and dist/ assembly. No Node package management:
# the only tools used are tsc, sqlite3, openssl, and coreutils.
set -euo pipefail
cd "$(dirname "$0")"

echo "[1/4] compiling TypeScript (tsc --outFile)"
rm -rf dist
tsc -p .

echo "[2/4] assembling starter library (sqlite3)"
./scripts/build-library.sh

echo "[3/4] copying static assets"
cp css/vibe-loops.css dist/
mkdir -p dist/lib dist/fonts
cp lib/*.js lib/*.wasm dist/lib/
cp fonts/*.ttf dist/fonts/

echo "[4/4] generating index.html with SRI hashes"
./scripts/gen-index.sh

echo "build complete: $(du -sh dist | cut -f1) in dist/"
