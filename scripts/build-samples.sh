#!/usr/bin/env bash
# Rebuilds every published sample from a neutral root, so noisemap.json's `root` says nothing
# about the machine it ran on. Each source is copied (src + package.json) into
# $STAGE/<name>/ and analyzed there.
#
# Sources are given by environment variables, no defaults:
#   ACME_SPYNEJS   the Acme dashboard SpyneJS port (project root; src/ is analyzed)
#   ACME_NEXTJS    the Acme dashboard Next.js reference (project root; app/ is analyzed)
#   SPYNE_SAMPLES  the spynejs.com examples checkout (spyne-ttt-simplified, spyne-todos, …)
#   ALPHA          the code-assembly-alpha project root (100% agent-generated; the demonstrative v2 sample)
# The two React twins are public code fetched into $STAGE (see their SOURCE.md files):
#   react.dev tutorial final App.js  → $STAGE/react-tic-tac-toe
#   tastejs/todomvc examples/react   → $STAGE/todomvc-react
set -euo pipefail
HERE="$(cd "$(dirname "$0")/.." && pwd)"
BIN="$HERE/node_modules/.bin/noisemap"
OUT="$HERE/samples"
STAGE="${NOISEMAP_STAGE:-/tmp/noisemap-samples}"
: "${ACME_SPYNEJS:?set ACME_SPYNEJS to the Acme SpyneJS project root}"
: "${ACME_NEXTJS:?set ACME_NEXTJS to the Acme Next.js project root}"
: "${SPYNE_SAMPLES:?set SPYNE_SAMPLES to the spynejs.com examples checkout}"
: "${ALPHA:?set ALPHA to the code-assembly-alpha project root}"

# name | source project dir | analyzed subdir | sources embedded in the map
SAMPLES=(
  "acme-spynejs|$ACME_SPYNEJS|src|yes"
  "acme-nextjs|$ACME_NEXTJS|app|yes"
  "acme-nextjs-frontend|$ACME_NEXTJS|app|yes"
  "alpha-spynejs|$ALPHA|src|yes"
  "tic-tac-toe-react|$STAGE/react-tic-tac-toe|src|yes"
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
  # The frontend-only Next.js sample leaves out the server: route handlers, server actions, and the database modules (review 3, 2026-09-29).
  if [ "$name" = acme-nextjs-frontend ]; then rm -rf "$stage/$sub/api" "$stage/$sub/seed" "$stage/$sub/query" "$stage/$sub/lib/data.ts" "$stage/$sub/lib/payment-events.ts" "$stage/$sub/lib/actions.ts"; fi
  for cfg in package.json tsconfig.json jsconfig.json noisemap.config.json; do [ -f "$project/$cfg" ] && cp "$project/$cfg" "$stage/$cfg"; done

  # Root-level source files (e.g. Next.js auth.ts) are not analyzed but let aliased imports resolve as external.
  for ctx in "$project"/*.ts "$project"/*.js "$project"/*.mjs; do [ -f "$ctx" ] && cp "$ctx" "$stage/"; done
  mkdir -p "$OUT/$name"
  ( cd "$stage/$sub" && "$BIN" map --no-open $([ "$embed" = yes ] || echo --no-source) . > "$OUT/$name/noisemap.txt" \
      && mv noisemap.json "$OUT/$name/noisemap.json" && mv noisemap.html "$OUT/$name/noisemap.html" \
      && "$BIN" wiring . > "$OUT/$name/noisemap.wiring.txt" && mv noisemap.wiring.json "$OUT/$name/noisemap.wiring.json" )
  sed -i '' '/^wrote /d' "$OUT/$name/noisemap.txt" "$OUT/$name/noisemap.wiring.txt"
  node "$HERE/scripts/glossary.mjs" "$OUT/$name/noisemap.wiring.json" > "$OUT/$name/VOCABULARY.md"
  if grep -q '"handler-path"' "$OUT/$name/noisemap.wiring.json"; then node "$HERE/scripts/paths.mjs" "$OUT/$name/noisemap.wiring.json" > "$OUT/$name/HANDLER-PATHS.md"; fi
  echo "built $name: $(grep -c '' "$OUT/$name/noisemap.txt") lines"
done
# The score table in samples/README.md is generated from the reports (review 3, 2026-09-29).
node "$HERE/scripts/samples-table.mjs" > "$STAGE/table.md"
TABLE="$STAGE/table.md" perl -0pi -e 'BEGIN { local $/; open my $t, "<", $ENV{TABLE}; $table = <$t>; close $t; chomp $table } s/<!-- samples-table -->.*?<!-- \/samples-table -->/<!-- samples-table -->\n$table\n<!-- \/samples-table -->/s' "$OUT/README.md"
