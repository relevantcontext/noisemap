#!/usr/bin/env bash
# Rebuilds every published sample from a neutral root, so noisemap.json's `root` says nothing
# about the machine it ran on. Each source is copied (src + package.json) into
# $STAGE/<name>/ and analyzed there. Local sources are Frank's checkouts; the two React
# twins are public code fetched into $STAGE/upstream (see their SOURCE.md files).
set -euo pipefail
HERE="$(cd "$(dirname "$0")/.." && pwd)"
BIN="$HERE/node_modules/.bin/noisemap"
OUT="$HERE/samples"
STAGE="${NOISEMAP_STAGE:-/tmp/noisemap-samples}"
SPYNE_SAMPLES="${SPYNE_SAMPLES:-$HOME/sites/claude-code-spynejs-code-samples}"
ACME="${ACME:-$HOME/sites/acme-comparison}"

# name | source project dir | analyzed subdir | sources embedded in the map
SAMPLES=(
  "acme-spynejs|$ACME/acme-dashboard-spynejs-private|src|yes"
  "acme-nextjs|$ACME/acme-dashboard-nextjs-private|app|yes"
  "tic-tac-toe-react|$STAGE/react-tic-tac-toe|src|yes"
  "tic-tac-toe-spynejs|$SPYNE_SAMPLES/spyne-ttt-simplified|src|yes"
  "tic-tac-toe-spynejs-canonical|$SPYNE_SAMPLES/spyne-ttt-canonical|src|yes"
  "todos-react|$STAGE/todomvc-react|src|yes"
  "todos-spynejs|$SPYNE_SAMPLES/spyne-todos|src|yes"
  "tour-of-heroes-spynejs|$SPYNE_SAMPLES/spyne-toh|src|yes"
  "canonical-app-spynejs|$SPYNE_SAMPLES/canonical-app|src|yes"
  "meme-gen-spynejs|$SPYNE_SAMPLES/spyne-meme-gen|src|yes"
  "three-js-spynejs|$SPYNE_SAMPLES/spyne-3js|src|yes"
  "fixtures/content|$HERE/fixtures/content-sample|.|no"
  "fixtures/react|$HERE/fixtures/react-sample|src|yes"
  "fixtures/spyne|$HERE/fixtures/spyne-sample|src|yes"
)

( cd "$HERE" && pnpm build >/dev/null )

for entry in "${SAMPLES[@]}"; do
  IFS='|' read -r name project sub embed <<<"$entry"
  if [ ! -d "$project/$sub" ]; then echo "skip $name: $project/$sub not found" >&2; continue; fi
  stage="$STAGE/$name"
  rm -rf "$stage" && mkdir -p "$stage"
  cp -R "$project/$sub" "$stage/$sub"
  [ -f "$project/package.json" ] && cp "$project/package.json" "$stage/package.json"
  mkdir -p "$OUT/$name"
  ( cd "$stage/$sub" && "$BIN" map --no-open $([ "$embed" = yes ] || echo --no-source) . > "$OUT/$name/noisemap.txt" \
      && mv noisemap.json "$OUT/$name/noisemap.json" && mv noisemap.html "$OUT/$name/noisemap.html" )
  sed -i '' '/^wrote /d' "$OUT/$name/noisemap.txt"
  echo "built $name: $(grep -c '' "$OUT/$name/noisemap.txt") lines"
done
