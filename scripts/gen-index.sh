#!/bin/bash
# Generates dist/index.html from index.html.tpl, replacing every
# @@SRI:<path>@@ placeholder with the sha384 hash of dist/<path> so the
# integrity attributes always match the shipped files.
set -euo pipefail
cd "$(dirname "$0")/.."

tpl=index.html.tpl
out=dist/index.html

cp "$tpl" "$out.tmp"
grep -o '@@SRI:[^@]*@@' "$tpl" | sort -u | while read -r ph; do
  path=${ph#@@SRI:}; path=${path%@@}
  if [ ! -f "dist/$path" ]; then
    echo "gen-index.sh: missing dist/$path referenced by template" >&2
    exit 1
  fi
  hash=$(openssl dgst -sha384 -binary "dist/$path" | openssl base64 -A)
  # '|' as sed delimiter; base64 may contain '/' and '+'
  hash_escaped=$(printf '%s' "$hash" | sed 's/[&|\\]/\\&/g')
  sed -i "s|$ph|$hash_escaped|g" "$out.tmp"
done
mv "$out.tmp" "$out"
echo "wrote $out"
