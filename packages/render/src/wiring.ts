import type { WiringResult } from '@noisemap/wiring';

const pct = (x: number | null): string => (x === null ? '  —' : `${String(Math.round(x * 100)).padStart(3)}%`);

/** Terminal summary of a wiring run: connections by kind, the two ratios side by side, then findings. */
export function renderWiring(w: WiringResult, opts: { all?: boolean } = {}): string {
  const out: string[] = [];
  out.push(`wiring  ${String(w.nodes.length)} modules  ${String(w.edges.length)} connections  ${String(w.sites.length)} sites`);
  out.push(`        discernibility ${pct(w.summary.discernibility)} (declared ${String(w.summary.sites.declared)} / opaque ${String(w.summary.sites.opaque)})   resolution ${pct(w.summary.resolution)}`);
  const ws = w.summary.workingSet;
  const fmt = (x: number | null): string => (x === null ? '—' : String(Math.round(x)));
  out.push(`        vocabulary share ${pct(w.summary.vocabularyShare)}   working set: median ${fmt(ws.medianModules)} modules, ${fmt(ws.medianTokens)} counted tokens (${fmt(ws.tokenWeightedMedianTokens)} by token)${ws.unmeasuredCounterparts ? `, ${String(ws.unmeasuredCounterparts)} counterparts uncounted` : ''}   locality ${w.summary.locality === null ? '—' : w.summary.locality.toFixed(1)}`);
  out.push(`        entries: ${w.summary.entries.length ? w.summary.entries.join(', ') : 'none found'}`);
  out.push(`        roots: ${w.summary.roots.join(', ') || '(none)'}`);
  if (w.vocabulary.length) {
    out.push('');
    out.push(`vocabulary: ${String(w.vocabulary.filter((v) => !v.framework).length)} names the app declares (${String(w.vocabulary.filter((v) => v.framework).length)} more from the framework)`);
    const count = (v: (typeof w.vocabulary)[number], role: string): number => v.uses.filter((u) => u.role === role).length;
    out.push('  name                                               registers  emits  listens  binds');
    for (const v of w.vocabulary) {
      if (v.framework && !opts.all) continue;
      out.push(`  ${v.name.padEnd(50)} ${String(count(v, 'registers')).padStart(9)}  ${String(count(v, 'emits')).padStart(5)}  ${String(count(v, 'listens')).padStart(7)}  ${String(count(v, 'binds')).padStart(5)}`);
    }
  }
  out.push('');
  out.push('kind                 resolved  unresolved  ambiguous  external  unknown');
  for (const [k, c] of Object.entries(w.summary.byKind)) {
    out.push(`${k.padEnd(20)} ${String(c.resolved).padStart(8)}  ${String(c.unresolved).padStart(10)}  ${String(c.ambiguous).padStart(9)}  ${String(c.external).padStart(8)}  ${String(c.unknown).padStart(7)}`);
  }
  const findings = w.findings.filter((f) => f.kind !== 'opaque');
  const opaque = w.findings.filter((f) => f.kind === 'opaque');
  out.push('');
  out.push(`findings: ${String(findings.length)} unresolved/ambiguous, ${String(opaque.length)} opaque`);
  const limit = opts.all ? Infinity : 30;
  for (const f of findings.slice(0, limit)) out.push(`  ${f.kind.padEnd(10)} ${f.module}:${String(f.start)}  ${f.message}${f.candidates?.length ? `  [${f.candidates.join(', ')}]` : ''}`);
  if (findings.length > limit) out.push(`  … ${String(findings.length - limit)} more (--all)`);
  if (opts.all) for (const f of opaque) out.push(`  ${f.kind.padEnd(10)} ${f.module}:${String(f.start)}  ${f.message}`);
  return out.join('\n') + '\n';
}

/** The wiring of one module: its measures, connections out and in, and findings. */
export function renderWiringFor(w: WiringResult, path: string): string {
  const m = w.modules[path];
  if (!m) return `wiring: ${path} is not a module of ${w.root}\n`;
  const out: string[] = [];
  const ws = m.workingSet;
  out.push(`wiring  ${path}`);
  out.push(`        working set ${String(ws.modules)} modules${ws.tokens === null ? '' : `, ${String(ws.tokens)} tokens`}  locality ${m.locality === null ? '—' : m.locality.toFixed(1)}  discernibility ${pct(m.discernibility)}  resolution ${pct(m.resolution)}`);
  if (ws.counterparts.length) out.push(`        counterparts: ${ws.counterparts.join(', ')}`);
  const line = (e: WiringResult['edges'][number], dir: 'out' | 'in'): string => {
    const other = dir === 'out' ? e.to?.module : e.from.module;
    return `  ${dir.padEnd(3)} ${e.kind.padEnd(19)} ${e.status.padEnd(10)} ${e.label}${other ? `  ${dir === 'out' ? '→' : '←'} ${other}` : ''}${e.hops?.length ? `  via ${e.hops.map((h) => h.module).join(' > ')}` : ''}${e.candidates?.length ? `  [${e.candidates.join(', ')}]` : ''}`;
  };
  const outs = w.edges.filter((e) => e.from.module === path);
  const ins = w.edges.filter((e) => e.to?.module === path);
  if (outs.length || ins.length) out.push('');
  for (const e of outs) out.push(line(e, 'out'));
  for (const e of ins) out.push(line(e, 'in'));
  const finds = w.findings.filter((f) => f.module === path);
  if (finds.length) {
    out.push('');
    for (const f of finds) out.push(`  ${f.kind.padEnd(10)} ${path}:${String(f.start)}  ${f.message}`);
  }
  return out.join('\n') + '\n';
}
