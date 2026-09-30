#!/usr/bin/env node
// Renders handler paths from a noisemap.wiring.json as Markdown: the five longest resolved
// paths and the five unresolved or ambiguous ones, every hop shown. Usage: paths.mjs <file>
import { readFileSync } from 'node:fs';
const file = process.argv[2];
if (!file) { process.stderr.write('usage: paths.mjs noisemap.wiring.json\n'); process.exit(2); }
const w = JSON.parse(readFileSync(file, 'utf8'));
const paths = w.edges.filter((e) => e.kind === 'handler-path');
const where = (ep) => `\`${ep.module}\`${ep.start !== undefined ? `:${ep.start}` : ''}`;
const render = (e) => {
  const chain = [where(e.from), ...(e.hops ?? []).map(where), ...(e.to ? [where(e.to)] : [])];
  const finding = w.findings.find((f) => f.edge === e.id);
  return `- **${e.label}** — ${e.status}${e.hops?.length ? `, ${e.hops.length} hop${e.hops.length === 1 ? '' : 's'}` : ''}\n  ${chain.join(' → ')}${finding ? `\n  *${finding.message}*` : ''}`;
};
const longest = paths.filter((e) => e.status === 'resolved').sort((a, b) => (b.hops?.length ?? 0) - (a.hops?.length ?? 0)).slice(0, 5);
const broken = paths.filter((e) => e.status !== 'resolved' && e.status !== 'external').slice(0, 5);
const lines = [`# Handler paths — ${w.root.split('/').slice(-2).join('/')}`, '', `${paths.length} handler attachments on DOM elements; ${paths.filter((e) => e.status === 'resolved').length} resolved, ${paths.filter((e) => e.status === 'unresolved').length} unresolved, ${paths.filter((e) => e.status === 'ambiguous').length} ambiguous. A path runs from the DOM attribute through each prop that carried the handler to the function body. Offsets are character positions in the file.`, '', '## The five longest resolved paths', '', ...longest.map(render), '', '## Unresolved or ambiguous', '', ...(broken.length ? broken.map(render) : ['None.']), ''];
process.stdout.write(lines.join('\n'));
