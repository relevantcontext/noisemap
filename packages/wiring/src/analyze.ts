import { relative, resolve, sep } from 'node:path';
import { detectFrameworks, walkFiles } from '@noisemap/core';
import type { FileInfo } from '@noisemap/core';
import { collectStyleImports } from './collect/content.js';
import { collectJs } from './collect/js.js';
import type { JsCollected } from './collect/js.js';
import { collectReactContracts } from './collect/react.js';
import { collectSpyneContracts } from './collect/spynejs.js';
import { loadResolveConfig } from './config.js';
import { detectEntries } from './entries.js';
import { Resolver, SOURCE_EXTENSIONS } from './resolve.js';
import { WIRING_VERSION } from './types.js';
import type { Edge, Finding, ModuleWiring, Site, VocabularyEntry, WiringNode, WiringResult } from './types.js';

export interface WiringOptions {
  toolVersion: string;
  includeTests?: boolean;
  now?: () => Date;
  /** Role names per module path, from a prior Shape run, to label nodes. Optional. */
  roles?: Readonly<Record<string, string | undefined>>;
  frameworks?: Readonly<Record<string, string>>;
  /** Counted tokens per module path from a Shape run, for working-set sizes. Optional. */
  tokens?: Readonly<Record<string, number>>;
}

function median(xs: number[]): number | null {
  if (!xs.length) return null;
  const s = [...xs].sort((a, b) => a - b);
  const mid = Math.floor(s.length / 2);
  return s.length % 2 ? (s[mid] as number) : ((s[mid - 1] as number) + (s[mid] as number)) / 2;
}

function weightedMedian(pairs: { value: number; weight: number }[]): number | null {
  const total = pairs.reduce((a, p) => a + p.weight, 0);
  if (!total) return null;
  const s = [...pairs].sort((a, b) => a.value - b.value);
  let acc = 0;
  for (const p of s) {
    acc += p.weight;
    if (acc >= total / 2) return p.value;
  }
  return s[s.length - 1]?.value ?? null;
}

/** Directory distance: path segments that differ between two module paths' directories. */
function dirDistance(a: string, b: string): number {
  const da = a.split('/').slice(0, -1);
  const db = b.split('/').slice(0, -1);
  let i = 0;
  while (i < da.length && i < db.length && da[i] === db[i]) i += 1;
  return da.length - i + (db.length - i);
}

const STYLE = new Set(['.scss', '.sass', '.css', '.less']);

function isJs(ext: string): boolean {
  return SOURCE_EXTENSIONS.includes(ext) || ext === '.jsx' || ext === '.tsx';
}

export async function analyzeWiring(root: string, options: WiringOptions): Promise<WiringResult> {
  const absRoot = resolve(root);
  const { files } = await walkFiles(absRoot, { includeTests: options.includeTests ?? false });
  const detection = await detectFrameworks(absRoot);
  const config = await loadResolveConfig(absRoot);
  const resolver = new Resolver(absRoot, config);
  resolver.setFiles(files.map((f) => f.path));
  const rel = (abs: string): string => relative(absRoot, abs).split(sep).join('/');
  const byPath = new Map(files.map((f) => [f.path, f] as const));

  const nodes: WiringNode[] = [];
  const edges: Edge[] = [];
  const sites: Site[] = [];
  const findings: Finding[] = [];
  const bootsByPath = new Map<string, string[]>();
  const collected = new Map<string, JsCollected>();
  let edgeSeq = 0;
  const nextEdgeId = (): string => `e${String(++edgeSeq)}`;
  /** Per module: local import binding → resolved target module. */
  const bindings = new Map<string, Map<string, string>>();
  const imported = new Map<string, Map<string, string>>();
  const templates = new Map<string, string>();
  for (const f of files) if (f.ext === '.html' || f.ext === '.htm') templates.set(f.path, f.source);

  // ---- collect ----
  for (const f of files) {
    if (isJs(f.ext)) {
      let c: JsCollected;
      try {
        c = collectJs(f.path, f.source, f.ext);
      } catch {
        continue;
      }
      collected.set(f.path, c);
      bootsByPath.set(f.path, c.boots);
      sites.push(...c.sites);
    }
  }

  const entries = detectEntries(files, bootsByPath, detection.detected, config.entries, absRoot);
  const entrySet = new Set(entries);

  // ---- import edges ----
  const addImportEdge = async (f: FileInfo, spec: string, start: number, end: number, locals: readonly { local: string; imported: string }[] = []): Promise<void> => {
    const r = await resolver.resolve(f.absPath, spec);
    const id = nextEdgeId();
    const edge: Edge = { id, kind: 'import', from: { module: f.path, start, end }, label: spec, status: r.status, verified: 'static' };
    if (r.status === 'resolved' && r.path) {
      const target = rel(r.path);
      edge.to = { module: target };
      if (!byPath.has(target)) edge.status = 'external'; // resolved to a file outside the analyzed root
      else {
        const map = bindings.get(f.path) ?? new Map<string, string>();
        const imap = imported.get(f.path) ?? new Map<string, string>();
        for (const b of locals) {
          map.set(b.local, target);
          imap.set(b.local, b.imported);
        }
        bindings.set(f.path, map);
        imported.set(f.path, imap);
      }
    }
    if (r.status === 'ambiguous' && r.candidates) edge.candidates = r.candidates.map(rel);
    edges.push(edge);
    if (edge.status === 'unresolved') findings.push({ kind: 'unresolved', module: f.path, start, end, edge: id, message: `import '${spec}' does not resolve to a file or a package` });
    if (edge.status === 'ambiguous') findings.push({ kind: 'ambiguous', module: f.path, start, end, edge: id, message: `import '${spec}' resolves to ${String(edge.candidates?.length ?? 0)} files`, candidates: edge.candidates ?? [] });
  };

  for (const f of files) {
    const c = collected.get(f.path);
    if (c) for (const imp of c.imports) await addImportEdge(f, imp.specifier, imp.start, imp.end, imp.bindings);
    else if (STYLE.has(f.ext)) for (const imp of collectStyleImports(f.source)) await addImportEdge(f, imp.specifier, imp.start, imp.end);
  }

  // ---- SpyneJS contracts and the vocabulary ----
  let vocabulary: VocabularyEntry[] = [];
  if (detection.detected.includes('spynejs') || [...collected.values()].some((c) => c.classes.some((k) => k.extends && ['ViewStream', 'Channel', 'SpyneTrait', 'DomElement'].includes(k.extends)))) {
    const spyne = collectSpyneContracts({ collected, bindings, templates, nextEdgeId });
    edges.push(...spyne.edges);
    findings.push(...spyne.findings);
    vocabulary = spyne.vocabulary;
  }

  // ---- React contracts and vocabulary ----
  if (detection.detected.includes('react') || [...collected.values()].some((c) => c.react.jsx.length > 0)) {
    const react = collectReactContracts({ collected, bindings, imported, files: files.map((f) => f.path), nextEdgeId });
    edges.push(...react.edges);
    findings.push(...react.findings);
    vocabulary = [...vocabulary, ...react.vocabulary];
  }

  // ---- opaque findings ----
  for (const s of sites) if (s.class === 'opaque') findings.push({ kind: 'opaque', module: s.module, start: s.start, end: s.end, message: `${s.kind} cannot be followed statically: ${s.label}` });

  // ---- nodes ----
  for (const f of files) {
    const fw = options.frameworks?.[f.path] ?? (isJs(f.ext) ? (detection.detected[0] ?? 'js') : 'content');
    const n: WiringNode = { id: f.path, kind: 'module', framework: fw, entry: entrySet.has(f.path) };
    const role = options.roles?.[f.path];
    if (role) n.role = role;
    nodes.push(n);
  }

  // ---- per-module counts ----
  const modules: Record<string, ModuleWiring> = {};
  const mw = (p: string): ModuleWiring => (modules[p] ??= { edges: { out: 0, in: 0, unresolved: 0, ambiguous: 0 }, sites: { declared: 0, opaque: 0 }, discernibility: null, resolution: null, workingSet: { modules: 1, tokens: null, counterparts: [], unmeasured: 0 }, locality: null });
  for (const f of files) mw(f.path);
  for (const e of edges) {
    const m = mw(e.from.module);
    m.edges.out += 1;
    if (e.status === 'unresolved') m.edges.unresolved += 1;
    if (e.status === 'ambiguous') m.edges.ambiguous += 1;
    if (e.to && e.status === 'resolved' && modules[e.to.module]) (modules[e.to.module] as ModuleWiring).edges.in += 1;
  }
  for (const s of sites) mw(s.module).sites[s.class] += 1;
  const resolvedOut = new Map<string, number>();
  const externalOut = new Map<string, number>();
  for (const e of edges) {
    if (e.status === 'resolved') resolvedOut.set(e.from.module, (resolvedOut.get(e.from.module) ?? 0) + 1);
    // external and unknown edges are neither resolved nor failures
    if (e.status === 'external' || e.status === 'unknown') externalOut.set(e.from.module, (externalOut.get(e.from.module) ?? 0) + 1);
  }
  let unmeasuredCounterparts = 0;
  // ---- working set and locality: counterparts are the modules a resolved edge connects, either direction ----
  const counterparts = new Map<string, Set<string>>();
  const link = (a: string, b: string): void => {
    if (a === b || !modules[a] || !modules[b]) return;
    const sa = counterparts.get(a) ?? new Set<string>();
    sa.add(b);
    counterparts.set(a, sa);
    const sb = counterparts.get(b) ?? new Set<string>();
    sb.add(a);
    counterparts.set(b, sb);
  };

  for (const e of edges) {
    if (e.status !== 'resolved' || !e.to) continue;
    link(e.from.module, e.to.module);
    for (const h of e.hops ?? []) link(e.from.module, h.module);
  }
  for (const [p, m] of Object.entries(modules)) {
    const total = m.sites.declared + m.sites.opaque;
    m.discernibility = total ? m.sites.declared / total : null;
    // like the codebase figure: external edges are neither resolved nor failures
    const resolvable = m.edges.out - (externalOut.get(p) ?? 0);
    m.resolution = resolvable ? (resolvedOut.get(p) ?? 0) / resolvable : null;
    const cps = [...(counterparts.get(p) ?? [])].sort();
    const own = options.tokens?.[p];
    const tokens = options.tokens && own !== undefined ? cps.reduce((a, c) => a + (options.tokens?.[c] ?? 0), own) : null;
    // A counterpart Shape did not count (an image, a data file, a skipped file) adds nothing to
    // `tokens`; say so instead of silently adding zero (fairness review, 2026-09-27).
    const unmeasured = options.tokens ? cps.filter((c) => options.tokens?.[c] === undefined).length : 0;
    unmeasuredCounterparts += unmeasured;
    m.workingSet = { modules: 1 + cps.length, tokens, counterparts: cps, unmeasured };
    m.locality = cps.length ? cps.reduce((a, c) => a + dirDistance(p, c), 0) / cps.length : null;
  }

  // ---- summary ----
  const byKind: Record<string, { resolved: number; unresolved: number; ambiguous: number; external: number; unknown: number }> = {};
  for (const e of edges) {
    const k = (byKind[e.kind] ??= { resolved: 0, unresolved: 0, ambiguous: 0, external: 0, unknown: 0 });
    k[e.status] += 1;
  }
  const declared = sites.filter((s) => s.class === 'declared').length;
  const opaque = sites.length - declared;
  const resolvable = edges.filter((e) => e.status !== 'external' && e.status !== 'unknown');
  const resolved = resolvable.filter((e) => e.status === 'resolved').length;
  const named = sites.filter((s) => ['listener', 'channel', 'dispatch', 'template-key', 'context', 'store'].includes(s.kind)).length;
  const handed = sites.filter((s) => s.kind === 'handler').length;
  const wsMods = Object.values(modules).map((m) => m.workingSet.modules);
  const wsTok = Object.entries(modules).filter(([, m]) => m.workingSet.tokens !== null).map(([p, m]) => ({ value: m.workingSet.tokens as number, weight: options.tokens?.[p] ?? 0 }));
  const localities = Object.values(modules).map((m) => m.locality).filter((x): x is number => x !== null);

  return {
    version: WIRING_VERSION,
    tool: { name: 'noisemap', version: options.toolVersion },
    generatedAt: (options.now ?? (() => new Date()))().toISOString(),
    root: absRoot,
    nodes,
    edges,
    sites,
    findings,
    vocabulary,
    modules,
    summary: {
      byKind,
      sites: { declared, opaque },
      discernibility: declared + opaque ? declared / (declared + opaque) : null,
      resolution: resolvable.length ? resolved / resolvable.length : null,
      vocabularyShare: named + handed ? named / (named + handed) : null,
      workingSet: { medianModules: median(wsMods), medianTokens: median(wsTok.map((x) => x.value)), tokenWeightedMedianTokens: weightedMedian(wsTok), unmeasuredCounterparts },
      locality: localities.length ? localities.reduce((a, b) => a + b, 0) / localities.length : null,
      entries,
      roots: resolver.roots.map(rel).map((r) => r || '.'),
    },
  };
}
