#!/bin/bash
# Assembles assets/loops/*.mp3 (per assets/loops.tsv) into the starter
# library database dist/library.vibeloop using the sqlite3 CLI only.
set -euo pipefail
cd "$(dirname "$0")/.."

OUT=dist/library.vibeloop
TSV=assets/loops.tsv

mkdir -p dist
rm -f "$OUT"

sqlite3 "$OUT" < scripts/schema.sql

{
  echo "BEGIN;"
  echo "INSERT INTO meta (key, value) VALUES ('format', 'vibeloop');"
  echo "INSERT INTO meta (key, value) VALUES ('version', '1');"
  echo "INSERT INTO meta (key, value) VALUES ('name', 'Starter Library');"
  echo "INSERT INTO meta (key, value) VALUES ('bpm', '120');"
  echo "INSERT INTO meta (key, value) VALUES ('ppq', '96');"

  # default empty arrangement: 8 clip tracks
  colors=('#e06c5c' '#e0a75c' '#d9d05b' '#7fc95e' '#5bd9b1' '#5b8dd9' '#8d6cd9' '#d95bb4')
  for i in $(seq 0 7); do
    echo "INSERT INTO tracks (idx, name, color) VALUES ($i, 'Track $((i+1))', '${colors[$i]}');"
  done

  # loops from the TSV; sql() escapes single quotes
  sql() { printf "%s" "${1//\'/\'\'}"; }
  tail -n +2 "$TSV" | while IFS=$'\t' read -r file name category bpm beats key license source; do
    echo "INSERT INTO loops (name, file, category, bpm, beats, key_sig, license, source, mp3)" \
         "VALUES ('$(sql "$name")', '$(sql "$file")', '$(sql "$category")', $bpm, $beats," \
         "'$(sql "$key")', '$(sql "$license")', '$(sql "$source")', readfile('assets/loops/$file'));"
  done
  echo "COMMIT;"
} | sqlite3 "$OUT"

count=$(sqlite3 "$OUT" "SELECT count(*) FROM loops;")
size=$(du -h "$OUT" | cut -f1)
echo "wrote $OUT ($count loops, $size)"
