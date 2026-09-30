#!/usr/bin/env node
// Prints the samples score table from the report artifacts, so the table cannot go stale (review 3, 2026-09-29).
// Usage: node scripts/samples-table.mjs > table.md ; scripts/build-samples.sh splices it into samples/README.md.
import { readFileSync, existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

const ROOT = fileURLToPath(new URL('../samples/', import.meta.url));
const ORDER = ['acme-spynejs', 'acme-nextjs', 'acme-nextjs-frontend', 'alpha-spynejs', 'tic-tac-toe-react', 'tic-tac-toe-spynejs-canonical', 'todos-react', 'todos-spynejs', 'tour-of-heroes-spynejs', 'canonical-app-spynejs', 'meme-gen-spynejs', 'three-js-spynejs'];
const f3 = (x) => (x === null || x === undefined ? '—' : x.toFixed(3));
const f2 = (x) => (x === null || x === undefined ? '—' : x.toFixed(2));
const pct = (x) => `${Math.round(x * 100)}%`;
const lines = [
  '| sample | modules | tokens | V / B / L / C | consistency | mean mixing (code / all / by operation) | vocabulary share | working set (modules / tokens) | locality | findings |',
  '|---|---|---|---|---|---|---|---|---|---|',
];
for (const name of ORDER) {
  const f = `${ROOT}${name}/noisemap.json`;
  if (!existsSync(f)) continue;
  const r = JSON.parse(readFileSync(f, 'utf8'));
  const w = JSON.parse(readFileSync(`${ROOT}${name}/noisemap.wiring.json`, 'utf8'));
  const s = r.scores;
  const sh = ['V', 'B', 'L', 'C'].map((b) => Math.round(s.shares[b] * 100)).join(' / ');
  const ws = w.summary.workingSet;
  lines.push(`| [${name}](${name}/noisemap.html) | ${r.modules.length} | ${s.totals.counted.toLocaleString('en-US')} | ${sh} | ${f2(s.consistency)} | ${f3(s.codeModules.meanMixing)} / ${f3(s.meanMixing)} / ${f3(s.byOperation.meanMixing)} | ${pct(w.summary.vocabularyShare)} | ${ws.medianModules} / ${ws.medianTokens} | ${w.summary.locality === null ? '—' : w.summary.locality.toFixed(1)} | ${w.findings.filter((f) => f.kind === 'unresolved' || f.kind === 'ambiguous').length} |`);
}
console.log(lines.join('\n'));
