#!/usr/bin/env node
// Renders the vocabulary of a noisemap.wiring.json as a Markdown glossary: every name the app
// speaks, with who registers, emits, listens for, binds, or names it. Usage: glossary.mjs <file>
import { readFileSync } from 'node:fs';

const file = process.argv[2];
if (!file) {
  process.stderr.write('usage: glossary.mjs noisemap.wiring.json\n');
  process.exit(2);
}
const w = JSON.parse(readFileSync(file, 'utf8'));
const root = w.root.split('/').slice(-2).join('/');
const roles = ['registers', 'emits', 'listens', 'binds', 'names', 'mentions'];
const by = (v, role) => [...new Set(v.uses.filter((u) => u.role === role).map((u) => u.module))].sort();
const lines = [];
lines.push(`# Vocabulary — ${root}`, '');
lines.push(`${w.vocabulary.filter((v) => !v.framework).length} names the app declares, ${w.vocabulary.filter((v) => v.framework).length} from the framework. Roles: SpyneJS — registers (addRegisteredActions), emits (sendChannelPayload), listens (addActionListeners, patterns expanded), binds (props.channels), names (a Channel class), mentions (payload filters, comparisons, constants). React — actions: registers (a reducer case), emits (dispatch); contexts: names (createContext), emits (a Provider), listens (useContext); routes: names (a page or route file), emits (href, push, redirect); handler props: listens (a component declares the prop), emits (a parent passes it).`, '');
const kinds = [['channel', 'Channels'], ['action', 'Actions'], ['context', 'Contexts'], ['route', 'Routes'], ['handler', 'Handler props']];
const section = (title, items) => {
  lines.push(`## ${title}`, '');
  for (const v of items) {
    lines.push(`### \`${v.name}\`${v.framework ? ' *(framework)*' : ''}`, '');
    for (const r of roles) {
      const mods = by(v, r);
      if (mods.length) lines.push(`- **${r}**: ${mods.map((m) => `\`${m}\``).join(', ')}`);
    }
    lines.push('');
  }
};
for (const [kind, title] of kinds) {
  const items = w.vocabulary.filter((v) => v.kind === kind && !v.framework);
  if (items.length) section(title, items);
}
const fw = w.vocabulary.filter((v) => v.framework);
if (fw.length) section('Framework names in use', fw);
const findings = w.findings.filter((f) => f.kind !== 'opaque');
lines.push('## Findings', '');
if (!findings.length) lines.push('None.', '');
for (const f of findings) lines.push(`- ${f.kind}: \`${f.module}\` — ${f.message}`);
lines.push('');
process.stdout.write(lines.join('\n'));
