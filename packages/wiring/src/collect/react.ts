import type { JsCollected, JsxUse, ReactComponent, ValueRef } from './js.js';
import type { Edge, Endpoint, Finding, VocabularyEntry, VocabularyUse } from '../types.js';

export interface ReactInputs {
  collected: ReadonlyMap<string, JsCollected>;
  /** Per module: local import binding → target module path. */
  bindings: ReadonlyMap<string, ReadonlyMap<string, string>>;
  /** Per module: local import binding → the imported name (`default`, `*`, or the name). */
  imported: ReadonlyMap<string, ReadonlyMap<string, string>>;
  /** Every walked module path. */
  files: readonly string[];
  nextEdgeId: () => string;
}

export interface ReactOutputs {
  edges: Edge[];
  findings: Finding[];
  vocabulary: VocabularyEntry[];
}

const HANDLER_ATTR = /^(on[A-Z]|action$|formAction$)/;
const MAX_HOPS = 10;

function enclosingComponent(c: JsCollected, pos: number): ReactComponent | null {
  let best: ReactComponent | null = null;
  for (const comp of c.react.components) if (comp.start <= pos && pos <= comp.end && (!best || comp.end - comp.start < best.end - best.start)) best = comp;
  return best;
}

function isProp(comp: ReactComponent | null, name: string): boolean {
  if (!comp) return false;
  if (comp.params.kind === 'destructured') return comp.params.names.includes(name);
  return false;
}

function propsIdentifier(comp: ReactComponent | null): string | null {
  return comp?.params.kind === 'identifier' ? comp.params.name : null;
}

/** Constant value by name in a module, following one import hop. */
function constantValue(input: ReactInputs, module: string, name: string): string | null {
  const c = input.collected.get(module);
  if (!c) return null;
  if (c.constants[name] !== undefined) return c.constants[name];
  const target = input.bindings.get(module)?.get(name);
  const imported = input.imported.get(module)?.get(name) ?? name;
  if (target) {
    const t = input.collected.get(target);
    if (t?.constants[imported] !== undefined) return t.constants[imported];
  }
  return null;
}

function resolveValue(input: ReactInputs, module: string, v: ValueRef): string | null {
  if (v.kind === 'literal') return v.value;
  if (v.kind === 'identifier') return constantValue(input, module, v.name);
  if (v.kind === 'member') {
    const parts = v.chain.split('.');
    if (parts.length === 2) {
      // Enum-like `Actions.ADD` is opaque to us; try the object as an imported constants module is out of scope
      return null;
    }
  }
  return null;
}

/** Which module (and export name) a JSX component tag refers to, from this module's imports or its own declarations. */
function tagTarget(input: ReactInputs, module: string, tag: string): { module: string; name: string } | null {
  const local = tag.split('.')[0] as string;
  const target = input.bindings.get(module)?.get(local);
  if (target) return { module: target, name: input.imported.get(module)?.get(local) ?? local };
  const c = input.collected.get(module);
  if (c?.react.components.some((k) => k.name === local)) return { module, name: local };
  return null;
}

/** Elements across the codebase that render component `name` defined in `defModule`. */
function parentsOf(input: ReactInputs, defModule: string, comp: ReactComponent): { module: string; use: JsxUse }[] {
  const out: { module: string; use: JsxUse }[] = [];
  for (const [module, c] of input.collected) {
    for (const use of c.react.jsx) {
      if (!use.isComponent) continue;
      const t = tagTarget(input, module, use.tag);
      if (t?.module !== defModule) continue;
      const matches = t.name === comp.name || (t.name === 'default' && comp.exported === 'default') || (module === defModule && t.name === comp.name);
      if (matches) out.push({ module, use });
    }
  }
  return out;
}

export function collectReactContracts(input: ReactInputs): ReactOutputs {
  const edges: Edge[] = [];
  const findings: Finding[] = [];
  const vocab = new Map<string, VocabularyEntry>();
  const use = (name: string, kind: VocabularyEntry['kind'], u: VocabularyUse, key = name): void => {
    let e = vocab.get(`${kind}:${key}`);
    if (!e) {
      e = { name, kind, framework: false, uses: [] };
      vocab.set(`${kind}:${key}`, e);
    }
    e.uses.push(u);
  };

  // ---- handler paths ----
  interface Step { module: string; comp: ReactComponent | null; value: ValueRef; at: { start: number; end: number } }
  const follow = (start: Step, hops: Endpoint[], depth: number): { status: Edge['status']; to?: Endpoint; hops: Endpoint[]; reason?: string }[] => {
    const { module, comp, value } = start;
    const c = input.collected.get(module);
    if (!c) return [{ status: 'unresolved', hops, reason: 'module not collected' }];
    if (value.kind === 'inline') return [{ status: 'resolved', to: { module, start: start.at.start, end: start.at.end }, hops }];
    if (value.kind === 'spread') return [{ status: 'unresolved', hops, reason: 'passed through a spread' }];
    if (value.kind === 'opaque') return [{ status: 'unresolved', hops, reason: value.reason }];
    if (value.kind === 'literal') return [{ status: 'resolved', to: { module, start: start.at.start, end: start.at.end }, hops }];

    let name: string | null = null;
    if (value.kind === 'identifier') name = value.name;
    else {
      const [head, ...rest] = value.chain.split('.');
      const pid = propsIdentifier(comp);
      if (head === pid && rest.length === 1) name = rest[0] as string; // props.onX
      else if (head === 'this' && rest[0] === 'props' && rest.length === 2) name = rest[1] as string;
      else if (head && c.react.locals.some((l) => l.name === head)) {
        const l = c.react.locals.find((x) => x.name === head) as { start: number; end: number };
        return [{ status: 'resolved', to: { module, start: l.start, end: l.end }, hops }];
      } else return [{ status: 'unresolved', hops, reason: `member '${value.chain}' is not a prop or a local` }];
    }
    // a local function in this module (component-scoped or module-scoped)
    const local = c.react.locals.filter((l) => l.name === name);
    const scoped = comp ? local.find((l) => l.start >= comp.start && l.end <= comp.end) : undefined;
    const chosen = scoped ?? local.find((l) => !comp || l.end < comp.start || l.start > comp.end) ?? local[0];
    if (chosen?.from) {
      // destructured from a call: a form action hook names the function it wraps; any other hook result is not followed
      if (/(^|\.)(useActionState|useFormState)$/.test(chosen.from.callee) && chosen.from.firstArg) {
        const fnName = chosen.from.firstArg;
        const fnLocal = c.react.locals.find((l) => l.name === fnName && !l.from);
        if (fnLocal) return [{ status: 'resolved', to: { module, start: fnLocal.start, end: fnLocal.end }, hops: [...hops, { module, start: chosen.start, end: chosen.end }] }];
        const target = input.bindings.get(module)?.get(fnName);
        if (target) return [{ status: 'resolved', to: { module: target }, hops: [...hops, { module, start: chosen.start, end: chosen.end }] }];
      }
      // unsupported tracing, not demonstrated absence: unknown, outside the ratios (review 2, 2.2)
      return [{ status: 'unknown', hops: [...hops, { module, start: chosen.start, end: chosen.end }], reason: `'${name}' comes out of ${chosen.from.callee}(); a hook result is not followed statically` }];
    }
    if (chosen) return [{ status: 'resolved', to: { module, start: chosen.start, end: chosen.end }, hops }];
    // an imported function
    const target = input.bindings.get(module)?.get(name);
    if (target) return [{ status: 'resolved', to: { module: target }, hops }];
    // a prop: follow to every parent that renders this component
    if (comp && (isProp(comp, name) || propsIdentifier(comp) !== null)) {
      if (depth >= MAX_HOPS) return [{ status: 'unresolved', hops, reason: 'too many hops' }];
      const parents = parentsOf(input, module, comp);
      if (!parents.length) return [{ status: 'unresolved', hops, reason: `no parent renders <${comp.name}> to supply '${name}'` }];
      const results: ReturnType<typeof follow> = [];
      for (const p of parents) {
        const attr = p.use.attrs.find((a) => a.name === name);
        const spread = p.use.attrs.find((a) => a.value.kind === 'spread');
        const pc = input.collected.get(p.module);
        const pcomp = pc ? enclosingComponent(pc, p.use.start) : null;
        if (attr) results.push(...follow({ module: p.module, comp: pcomp, value: attr.value, at: { start: attr.start, end: attr.end } }, [...hops, { module: p.module, start: attr.start, end: attr.end }], depth + 1));
        else if (spread) results.push({ status: 'unresolved', hops: [...hops, { module: p.module, start: spread.start, end: spread.end }], reason: `<${comp.name}> in ${p.module} gets '${name}' through a spread, if at all` });
        else results.push({ status: 'unresolved', hops: [...hops, { module: p.module, start: p.use.start, end: p.use.end }], reason: `<${comp.name}> in ${p.module} is rendered without '${name}'` });
      }
      return results;
    }
    return [{ status: 'unresolved', hops, reason: `'${name}' is neither a local function, an import, nor a prop of ${comp?.name ?? 'the module'}` }];
  };

  for (const [module, c] of input.collected) {
    for (const u of c.react.jsx) {
      if (u.isComponent) {
        for (const a of u.attrs) if (HANDLER_ATTR.test(a.name) && a.name !== '...') use(a.name, 'handler', { module, start: a.start, end: a.end, role: 'emits' });
        continue;
      }
      for (const a of u.attrs) {
        if (!HANDLER_ATTR.test(a.name)) continue;
        const comp = enclosingComponent(c, u.start);
        const results = follow({ module, comp, value: a.value, at: { start: a.start, end: a.end } }, [], 0);
        for (const r of results) {
          const id = input.nextEdgeId();
          const edge: Edge = { id, kind: 'handler-path', from: { module, start: a.start, end: a.end }, label: `${a.name}=${a.value.kind === 'identifier' ? a.value.name : a.value.kind === 'member' ? a.value.chain : a.value.kind}`, status: r.status, verified: 'static', hops: r.hops };
          if (r.to) edge.to = r.to;
          if (r.status === 'unknown' && r.reason) edge.reason = r.reason;
          edges.push(edge);
          if (r.status === 'unresolved') findings.push({ kind: 'unresolved', module, start: a.start, end: a.end, edge: id, message: `${a.name} on <${u.tag}>: ${r.reason ?? 'unresolved'}` });
        }
      }
    }
    for (const comp of c.react.components) if (comp.params.kind === 'destructured') for (const n of comp.params.names) if (HANDLER_ATTR.test(n)) use(n, 'handler', { module, start: comp.start, end: comp.end, role: 'listens' });
  }

  // ---- action types: dispatch → reducer case ----
  const cases = new Map<string, { module: string; start: number; end: number }[]>();
  // only switches over an action's type are reducers; `switch (field)` or `switch (error.type)` are not
  for (const [module, c] of input.collected) for (const k of c.react.cases) {
    if (!/^(action|a|act)\.type$/.test(k.discriminant)) continue;
    const v = resolveValue(input, module, k.value);
    if (v === null) continue;
    const list = cases.get(v) ?? [];
    list.push({ module, start: k.start, end: k.end });
    cases.set(v, list);
    use(v, 'action', { module, start: k.start, end: k.end, role: 'registers' });
  }
  const dispatched = new Set<string>();
  for (const [module, c] of input.collected) for (const d of c.react.dispatches) {
    const v = resolveValue(input, module, d.value);
    const id = input.nextEdgeId();
    if (v === null) {
      edges.push({ id, kind: 'action-type', from: { module, start: d.start, end: d.end }, label: d.value.kind === 'identifier' ? d.value.name : d.value.kind === 'member' ? d.value.chain : d.value.kind, status: 'unresolved', verified: 'static' });
      findings.push({ kind: 'unresolved', module, start: d.start, end: d.end, edge: id, message: 'dispatch type is not a literal or a known constant' });
      continue;
    }
    dispatched.add(v);
    use(v, 'action', { module, start: d.start, end: d.end, role: 'emits' });
    const hit = cases.get(v);
    const edge: Edge = { id, kind: 'action-type', from: { module, start: d.start, end: d.end }, label: v, status: hit?.length ? 'resolved' : 'unresolved', verified: 'static' };
    if (hit?.[0]) edge.to = hit[0];
    edges.push(edge);
    if (!hit?.length) findings.push({ kind: 'unresolved', module, start: d.start, end: d.end, edge: id, message: `dispatches '${v}' but no reducer case handles it` });
  }
  for (const [v, list] of cases) if (!dispatched.has(v)) for (const k of list) {
    const id = input.nextEdgeId();
    edges.push({ id, kind: 'action-type', from: { module: k.module, start: k.start, end: k.end }, label: v, status: 'unresolved', verified: 'static' });
    findings.push({ kind: 'unresolved', module: k.module, start: k.start, end: k.end, edge: id, message: `reducer handles '${v}' but nothing dispatches it` });
  }

  // ---- contexts: useContext(X) → <X.Provider> ----
  const providers = new Map<string, { module: string; start: number; end: number }[]>(); // key: defining module + name
  const contextKey = (module: string, name: string): string => {
    const local = name.split('.')[0] as string;
    const target = input.bindings.get(module)?.get(local);
    const imported = input.imported.get(module)?.get(local) ?? local;
    return target ? `${target}#${imported}` : `${module}#${local}`;
  };
  for (const [module, c] of input.collected) {
    for (const cr of c.react.contexts.created) use(cr.name, 'context', { module, start: cr.start, end: cr.end, role: 'names' }, `${module}#${cr.name}`);
    for (const u of c.react.jsx) {
      if (!u.isComponent || !u.tag.endsWith('.Provider')) continue;
      const key = contextKey(module, u.tag);
      const list = providers.get(key) ?? [];
      list.push({ module, start: u.start, end: u.end });
      providers.set(key, list);
      use(u.tag.replace(/\.Provider$/, ''), 'context', { module, start: u.start, end: u.end, role: 'emits' }, key);
    }
  }
  for (const [module, c] of input.collected) for (const cons of c.react.contexts.consumed) {
    const key = contextKey(module, cons.name);
    const hit = providers.get(key);
    const id = input.nextEdgeId();
    use(cons.name, 'context', { module, start: cons.start, end: cons.end, role: 'listens' }, key);
    const edge: Edge = { id, kind: 'context', from: { module, start: cons.start, end: cons.end }, label: cons.name, status: hit?.length ? 'resolved' : 'unresolved', verified: 'static' };
    if (hit?.[0]) edge.to = hit[0];
    edges.push(edge);
    if (!hit?.length) findings.push({ kind: 'unresolved', module, start: cons.start, end: cons.end, edge: id, message: `useContext(${cons.name}) but no <${cons.name}.Provider> is rendered in the analyzed root` });
  }

  // ---- routes: path literal → Next.js page file ----
  const pageFiles = input.files.filter((f) => /(^|\/)page\.(jsx?|tsx?|mdx?)$/.test(f) || /(^|\/)route\.(jsx?|tsx?)$/.test(f));
  const routeOf = (file: string): string => {
    const dir = file.replace(/\/?(page|route)\.(jsx?|tsx?|mdx?)$/, '');
    let segs = dir.split('/').filter(Boolean);
    // routes start at the `app` or `pages` directory, wherever it sits under the analyzed root
    const base = Math.max(segs.lastIndexOf('app'), segs.lastIndexOf('pages'));
    if (base >= 0) segs = segs.slice(base + 1);
    segs = segs.filter((seg) => !/^\(.*\)$/.test(seg) && !seg.startsWith('@'));
    return '/' + segs.map((seg) => (/^\[.*\]$/.test(seg) ? '*' : seg)).join('/');
  };
  const routes = new Map<string, string[]>();
  for (const f of pageFiles) {
    const r = routeOf(f);
    const list = routes.get(r) ?? [];
    list.push(f);
    routes.set(r, list);
    use(r, 'route', { module: f, start: 0, end: 0, role: 'names' });
  }
  const routeMatches = (path: string, pattern: string): boolean => {
    const a = path.replace(/[?#].*$/, '').replace(/\/+$/, '').split('/').filter(Boolean);
    const b = pattern.split('/').filter(Boolean);
    if (a.length !== b.length) return false;
    return a.every((seg, i) => b[i] === '*' || seg === '*' || b[i] === seg);
  };
  if (pageFiles.length) for (const [module, c] of input.collected) for (const r of c.react.routes) {
    const id = input.nextEdgeId();
    const hit = [...routes.keys()].filter((p) => routeMatches(r.path, p));
    use(r.path, 'route', { module, start: r.start, end: r.end, role: 'emits' });
    const edge: Edge = { id, kind: 'route', from: { module, start: r.start, end: r.end }, label: r.path, status: hit.length === 1 ? 'resolved' : hit.length > 1 ? 'ambiguous' : 'unresolved', verified: 'static' };
    if (hit.length >= 1) edge.to = { module: (routes.get(hit[0] as string) as string[])[0] as string };
    if (hit.length > 1) edge.candidates = hit.flatMap((h) => routes.get(h) ?? []);
    edges.push(edge);
    if (!hit.length) findings.push({ kind: 'unresolved', module, start: r.start, end: r.end, edge: id, message: `navigates to '${r.path}' but no page or route file matches it` });
  }

  const vocabulary = [...vocab.values()].sort((a, b) => a.kind.localeCompare(b.kind) || a.name.localeCompare(b.name));
  return { edges, findings, vocabulary };
}
