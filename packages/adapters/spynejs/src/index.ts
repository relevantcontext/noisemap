import type { Adapter, AdapterOutput, FileInfo, FrameworkConfig, MatchContext } from '@noisemap/core';
import { analyzeJs, parseSource } from '@noisemap/js-classify';
import type { ClassifyExtras } from '@noisemap/js-classify';

const DEFAULT_PLAIN = ['.js', '.ts', '.mjs', '.cjs', '.mts', '.cts'];
const DEFAULT_EXTENDS = ['ViewStream', 'DomElement', 'DomItem', 'Channel', 'SpyneTrait'];

const DOLLAR = /^[A-Za-z_$][\w$]*\$[A-Za-z_$][\w$]*$/;
const HOST_BASES = new Set(['ViewStream', 'DomElement', 'DomItem', 'Channel', 'ChannelFetch', 'SpyneTrait']);
type Kind = 'view' | 'channel' | 'trait';
interface N { type: string; [key: string]: unknown }
const SKIP = new Set(['loc', 'start', 'end', 'range', 'leadingComments', 'trailingComments', 'innerComments', 'extra', 'comments', 'tokens']);
const isN = (x: unknown): x is N => typeof x === 'object' && x !== null && typeof (x as N).type === 'string';

function walk(n: unknown, fn: (node: N) => void): void {
  if (Array.isArray(n)) {
    for (const x of n) walk(x, fn);
    return;
  }
  if (!isN(n)) return;
  fn(n);
  for (const [k, v] of Object.entries(n)) if (!SKIP.has(k)) walk(v, fn);
}
const ident = (n: unknown): string | null => (isN(n) && n.type === 'Identifier' ? (n.name as string) : null);
function baseName(sup: unknown): string | null {
  if (!isN(sup)) return null;
  if (sup.type === 'Identifier') return sup.name as string;
  if (sup.type === 'MemberExpression') return ident(sup.property);
  return null;
}
const kindOf = (base: string): Kind => (base === 'SpyneTrait' ? 'trait' : base === 'Channel' || base === 'ChannelFetch' ? 'channel' : 'view');

/** Strip the extension and a trailing `/index` so `./t.js`, `./t`, and `./t/index.js` name the same module. */
const moduleKey = (path: string): string => path.replace(/\.[cm]?[jt]sx?$/, '').replace(/\/index$/, '');
/** Resolve an import source against the importing file: relative sources by path, bare ones (`traits/x.js`) by suffix. */
function sourceMatches(source: string, from: string, candidate: string): boolean {
  const cand = moduleKey(candidate);
  if (source.startsWith('./') || source.startsWith('../')) {
    const parts = from.split('/').slice(0, -1);
    for (const seg of source.split('/')) {
      if (seg === '.' || seg === '') continue;
      if (seg === '..') parts.pop();
      else parts.push(seg);
    }
    return moduleKey(parts.join('/')) === cand;
  }
  const bare = moduleKey(source.replace(/^@\/?/, ''));
  return cand === bare || cand.endsWith('/' + bare);
}

interface TraitDecl { id: string; file: string; name: string; isDefault: boolean; exportedAs: Set<string>; methods: Set<string> }
interface HostDecl { name: string; file: string; kind: 'view' | 'channel'; refs: { local: string }[]; imports: Map<string, { imported: string; source: string }> }

/**
 * What one file cannot know: which kind of host binds a trait, and which trait methods exist. Read
 * once from every file before classification (fairness review, 2026-09-27). Each file is parsed with
 * the classifier's parser, so a binding inside a comment or a string is not a binding (review 3).
 * A trait is identified by its file and export, so two traits with one name in different files keep
 * their own hosts, a default import is followed, and only `props.traits` or the object handed to
 * `super()` counts as a binding (review 4, 2026-09-29).
 */
export function prepareSpyne(files: readonly FileInfo[]): ClassifyExtras {
  const traits: TraitDecl[] = [];
  const hosts: HostDecl[] = [];
  const callables = new Set<string>();
  for (const f of files) {
    let program: N;
    try {
      program = parseSource(f.source, f.ext).ast.program as unknown as N;
    } catch {
      continue;
    }
    const imports = new Map<string, { imported: string; source: string }>();
    const defaultNames = new Set<string>();
    const exportedAs = new Map<string, Set<string>>(); // local class name → the names it is exported under
    const exportName = (local: string, as: string): void => { (exportedAs.get(local) ?? exportedAs.set(local, new Set()).get(local))?.add(as); };
    walk(program, (node) => {
      if (node.type === 'ExportNamedDeclaration') {
        const d = node.declaration as N | null;
        const declared = d ? ident(d.id) : null;
        if (declared) exportName(declared, declared);
        if (d?.type === 'VariableDeclaration') for (const v of d.declarations as N[]) { const n = ident(v.id); if (n) exportName(n, n); }
        for (const sp of (node.specifiers as N[] | undefined) ?? []) {
          const local = ident(sp.local);
          const as = ident(sp.exported) ?? ((sp.exported as N | undefined)?.value as string | undefined);
          if (local && as) exportName(local, as);
        }
      }
      if (node.type === 'ImportDeclaration') {
        const source = (node.source as N).value as string;
        for (const sp of node.specifiers as N[]) {
          const local = ident(sp.local);
          if (!local) continue;
          const imported = sp.type === 'ImportSpecifier' ? (ident(sp.imported) ?? ((sp.imported as N).value as string)) : sp.type === 'ImportDefaultSpecifier' ? 'default' : local;
          imports.set(local, { imported, source });
        }
      }
      if (node.type === 'ExportDefaultDeclaration') {
        const d = node.declaration as N;
        const name = d.type === 'Identifier' ? (d.name as string) : ident(d.id);
        if (name) defaultNames.add(name);
      }
    });
    walk(program, (node) => {
      // A `$` call may resolve to an exported function or a static method of any class, not only a trait (ruling 2026-09-29).
      if (node.type === 'FunctionDeclaration') { const n = ident(node.id); if (n && DOLLAR.test(n)) callables.add(n); }
      if (node.type === 'VariableDeclarator') { const n = ident(node.id); if (n && DOLLAR.test(n)) callables.add(n); }
      if (node.type === 'ClassMethod' && node.static === true) { const n = ident(node.key); if (n && DOLLAR.test(n)) callables.add(n); }
    });
    walk(program, (node) => {
      if (node.type !== 'ClassDeclaration' && node.type !== 'ClassExpression') return;
      const base = baseName(node.superClass);
      const name = ident(node.id);
      if (!base || !HOST_BASES.has(base) || !name) return;
      const body = (node.body as N).body as N[];
      if (kindOf(base) === 'trait') {
        const methods = new Set<string>();
        for (const m of body) {
          const key = m.type === 'ClassMethod' ? ident(m.key) : null;
          if (key && /^[A-Za-z_$][\w$]*\$[A-Za-z_$][\w$]*$/.test(key)) methods.add(key);
        }
        traits.push({ id: `${f.path}#${name}`, file: f.path, name, isDefault: defaultNames.has(name), exportedAs: exportedAs.get(name) ?? new Set(), methods });
        return;
      }
      const refs: { local: string }[] = [];
      const take = (arr: unknown): void => {
        if (!isN(arr) || arr.type !== 'ArrayExpression') return;
        for (const el of arr.elements as unknown[]) {
          const id = ident(el);
          if (id) refs.push({ local: id });
        }
      };
      const isProps = (obj: unknown): boolean => ident(obj) === 'props' || (isN(obj) && obj.type === 'MemberExpression' && isN(obj.object) && obj.object.type === 'ThisExpression' && ident(obj.property) === 'props');
      walk(node.body, (n) => {
        // `props.traits = [...]` / `this.props.traits = [...]`, or `traits: [...]` in the object handed to super(): the framework's binding sites.
        if (n.type === 'AssignmentExpression' && isN(n.left) && n.left.type === 'MemberExpression' && ident(n.left.property) === 'traits' && isProps(n.left.object)) take(n.right);
        if (n.type === 'CallExpression' && isN(n.callee) && n.callee.type === 'Super') for (const arg of n.arguments as unknown[]) if (isN(arg) && arg.type === 'ObjectExpression') for (const prop of arg.properties as N[]) if (prop.type === 'ObjectProperty' && (ident(prop.key) === 'traits' || (isN(prop.key) && prop.key.type === 'StringLiteral' && prop.key.value === 'traits'))) take(prop.value);
      });
      hosts.push({ name, file: f.path, kind: kindOf(base) as 'view' | 'channel', refs, imports });
    });
  }
  // Resolve each host's references to trait declarations: an explicit import through its source and the name it is
  // exported under (aliases included); an import that matches nothing binds nothing (review 5: a unique name elsewhere is
  // not evidence). A reference with no import is a class in the same file, else a unique name anywhere.
  const resolve = (h: HostDecl, local: string): TraitDecl | undefined => {
    const imp = h.imports.get(local);
    if (imp) {
      const hit = traits.filter((t) => sourceMatches(imp.source, h.file, t.file) && (imp.imported === 'default' ? t.isDefault : t.exportedAs.has(imp.imported)));
      return hit.length === 1 ? hit[0] : undefined;
    }
    const same = traits.find((t) => t.file === h.file && t.name === local);
    if (same) return same;
    const byName = traits.filter((t) => t.name === local);
    return byName.length === 1 ? byName[0] : undefined;
  };
  const hostSets = new Map<string, Set<'view' | 'channel'>>();
  const bindings: Record<string, { host: string; kind: string }[]> = {};
  const boundMethods: Record<string, ReadonlySet<string>> = {};
  for (const h of hosts) {
    const set = new Set<string>();
    for (const r of h.refs) {
      const t = resolve(h, r.local);
      if (!t) continue;
      const hs = hostSets.get(t.id) ?? new Set<'view' | 'channel'>();
      hs.add(h.kind);
      hostSets.set(t.id, hs);
      (bindings[t.id] ??= []).push({ host: h.name, kind: h.kind });
      for (const m of t.methods) set.add(m);
    }
    boundMethods[h.name] = set;
  }
  // Keyed by `file#Name`; a name that is unique across the codebase is also keyed bare, for callers without a file.
  const nameCount = new Map<string, number>();
  for (const t of traits) nameCount.set(t.name, (nameCount.get(t.name) ?? 0) + 1);
  const traitHosts: Record<string, string> = {};
  for (const [id, set] of hostSets) {
    const kind = set.size === 1 ? ([...set][0] as string) : 'both';
    traitHosts[id] = kind;
    const t = traits.find((x) => x.id === id);
    if (t && nameCount.get(t.name) === 1) {
      traitHosts[t.name] = kind;
      bindings[t.name] = bindings[id] as { host: string; kind: string }[];
    }
  }
  // What a `$` call may resolve to: any trait method, static or instance, and any `$`-named exported function or static method.
  const traitMethods = new Set<string>(callables);
  for (const t of traits) for (const m of t.methods) traitMethods.add(m);
  return { traitHosts, traitMethods, boundMethods, traitBindings: bindings };
}

/**
 * SpyneJS adapter. Claims a plain JS/TS file when it extends a role class (any codebase),
 * or any plain JS/TS file when SpyneJS is the detected or forced framework. Roles come
 * from the config: a match on `extends` plus an expected shape; drift is measured against it.
 */
export const spynejsAdapter: Adapter = {
  id: 'spynejs',
  match: (file: FileInfo, context: MatchContext, config: FrameworkConfig | undefined): boolean => {
    const plain = config?.detect?.plainExtensions ?? DEFAULT_PLAIN;
    if (!plain.includes(file.ext)) return false;
    if (context.override === 'spynejs') return true;
    if (context.override !== null) return false;
    const names = config?.detect?.extends ?? DEFAULT_EXTENDS;
    if (new RegExp(`\\bextends\\s+(?:[A-Za-z_$][\\w$]*\\.)?(?:${names.join('|')})\\b`).test(file.source)) return true;
    return context.detected.includes('spynejs');
  },
  prepare: (files: readonly FileInfo[]): ClassifyExtras => prepareSpyne(files),
  analyze: (file: FileInfo, config: FrameworkConfig | undefined, prepared?: unknown): AdapterOutput => {
    if (!config) throw new Error('spynejs adapter: no config loaded');
    return analyzeJs(file.source, file.ext, config, 'spynejs', { ...((prepared as ClassifyExtras | undefined) ?? {}), file: file.path });
  },
};
