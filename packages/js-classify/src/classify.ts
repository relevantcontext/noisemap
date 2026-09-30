import type { Bucket, Classifier, CommentStyle, FrameworkConfig, RoleConfig, ScaffoldingKind } from '@noisemap/core';
import type * as t from '@babel/types';

/**
 * A source range that assigns a bucket. Ranges nest like the AST; the innermost range
 * containing a token wins. A token in no range gets the config's default bucket.
 */
export interface Range {
  start: number;
  end: number;
  bucket: Bucket | 'excluded';
  rule: string;
  /** When set, literal text inside the range (JSX text, string bodies, template quasis) is re-lexed into words. */
  prose?: readonly CommentStyle[];
  /** When set, the string body inside the range is split on whitespace, one token per item: a class list counts what it holds. */
  split?: 'whitespace';
  /** Tokens here may fall outside the role's expected shape without counting as drift. */
  permitted?: boolean;
}

/** A region that is out of place in full: a member outside the role's sanctioned surface. */
export interface Misplaced {
  start: number;
  end: number;
}

export interface Classified {
  ranges: Range[];
  /** The first declared role matched in the file, if any. */
  role: RoleConfig | null;
  /** The role's expected shape. */
  expected: Bucket[] | null;
  /** Methods defined on the first role class, in source order. */
  members: string[];
  /** For a module with no role: hook calls and handler definitions the walk saw, the internal surface of a component. */
  internal: string[];
  /** The module contains JSX. */
  hasJsx: boolean;
  /** Members outside the sanctioned surface: their tokens are drift whatever their bucket. */
  misplaced: Misplaced[];
  /** The name of the first role class, for facts keyed by class (a trait's bindings). */
  className: string | null;
}

/** Facts another file supplies, gathered by an adapter's prepare pass. */
export interface ClassifyExtras {
  /** Class name → the kind of host it is bound to (`view`, `channel`), or `both`. Informational since 2026-09-29: a trait's shape no longer depends on its host. */
  traitHosts?: Readonly<Record<string, string>>;
  /** Method names defined on trait classes anywhere in the codebase; a `$` call is verified against them when `boundMethods` is absent. */
  traitMethods?: ReadonlySet<string>;
  /** Host class name → the methods of the traits it actually binds through `props.traits`. A `$` call is verified against its own host's set (2026-09-29). */
  boundMethods?: Readonly<Record<string, ReadonlySet<string>>>;
  /**
   * Read every token by what it does alone: no sanctioned-member sealing, no trait absorption, no
   * export sealing, no host inheritance for a payload filter or a transmit. The by-operation figure
   * beside the headline is computed this way, so a reader can see what the numbers do without the
   * structural rulings (2026-09-29).
   */
  byOperation?: boolean;
  /** The analyzed file's path, so facts keyed by file and class (a trait's bindings) resolve to this file's class and not a same-named one elsewhere (2026-09-29). */
  file?: string;
  /** Trait class name → the host classes that bind it through `props.traits`, with their kind. Reported on the trait module (2026-09-29). */
  traitBindings?: Readonly<Record<string, readonly { host: string; kind: string }[]>>;
}

type Node = t.Node;

const COMPONENT_WRAPPERS = /^(React\.)?(memo|forwardRef|observer)$/;
/** A string or template that holds markup: an opening or closing tag. */
const MARKUP = /<[A-Za-z!/][^>]*>/;
/** Hooks whose first argument is the function the declarator names, e.g. `const onSave = useCallback(() => …)`. */
const FUNCTION_HOOKS = /^(React\.)?useCallback$/;

const TS_WRAPPERS = new Set([
  'TSAsExpression',
  'TSSatisfiesExpression',
  'TSNonNullExpression',
  'TSTypeAssertion',
  'TSInstantiationExpression',
  'TSEnumDeclaration',
  'TSEnumMember',
  'TSEnumBody',
  'TSModuleDeclaration',
  'TSModuleBlock',
  'TSExportAssignment',
  'TSParameterProperty',
]);

const SKIP_KEYS = new Set(['loc', 'range', 'extra', 'comments', 'leadingComments', 'trailingComments', 'innerComments', 'tokens', 'errors']);

function isFunction(n: Node | null | undefined): n is t.Function {
  return (
    !!n &&
    (n.type === 'FunctionDeclaration' ||
      n.type === 'FunctionExpression' ||
      n.type === 'ArrowFunctionExpression' ||
      n.type === 'ObjectMethod' ||
      n.type === 'ClassMethod' ||
      n.type === 'ClassPrivateMethod')
  );
}

function unwrap(n: Node | null | undefined): Node | null | undefined {
  let cur = n;
  while (cur && (cur.type === 'TSAsExpression' || cur.type === 'TSSatisfiesExpression' || cur.type === 'TSNonNullExpression' || cur.type === 'ParenthesizedExpression')) {
    cur = cur.expression;
  }
  return cur;
}

function isJsx(n: Node | null | undefined): boolean {
  const u = unwrap(n);
  return !!u && (u.type === 'JSXElement' || u.type === 'JSXFragment');
}

function keyName(key: Node): string | null {
  if (key.type === 'Identifier') return key.name;
  if (key.type === 'StringLiteral') return key.value;
  if (key.type === 'PrivateName') return `#${key.id.name}`;
  return null;
}

function jsxAttrName(attr: t.JSXAttribute): string {
  return attr.name.type === 'JSXNamespacedName' ? `${attr.name.namespace.name}:${attr.name.name.name}` : attr.name.name;
}

/** The literal a JSX attribute carries: a string, or the unwrapped expression of `{…}`. */
function attrLiteral(value: t.JSXAttribute['value']): Node | null {
  if (!value) return null;
  if (value.type === 'StringLiteral') return value;
  if (value.type === 'JSXExpressionContainer') return unwrap(value.expression) ?? null;
  return null;
}

/** Function node wrapped by a component wrapper or a memo hook, e.g. useCallback(() => …). */
function innerFunction(n: Node | null | undefined): t.Function | null {
  const u = unwrap(n);
  if (!u) return null;
  if (isFunction(u)) return u;
  if (u.type === 'CallExpression') {
    const first = u.arguments[0];
    if (first && isFunction(first)) return first;
  }
  return null;
}

export class RangeBuilder {
  readonly ranges: Range[] = [];
  private readonly scaffolding: ReadonlySet<ScaffoldingKind>;
  private readonly byKind: ReadonlyMap<string, Classifier[]>;
  private readonly regex = new Map<string, RegExp>();
  /** Names referenced by handler props, resolved to local declarations on the walk. */
  private readonly handlerNames = new Map<string, Classifier>();
  /** Enclosing names: method names, callee text, JSX attribute names. Innermost last. */
  private readonly context: string[] = [];
  /** Enclosing declared roles. Innermost last. */
  private readonly roleStack: RoleConfig[] = [];
  /** Class bodies of uniform roles and uniform methods: no classifier range is emitted inside them. */
  private readonly sealed: { start: number; end: number }[] = [];
  /** Extents of host calls (a payload filter): a declaration in its host, so no computation is counted inside. */
  private readonly hostSealed: { start: number; end: number }[] = [];
  /**
   * Bodies of sanctioned members: everything inside is the module's type, except an explicit
   * operation of another layer (ruling 2026-09-29: a default, a ternary, or a local call that
   * feeds a property is a property of the view; noise is significant logic where it is not expected).
   */
  private readonly configSealed: { start: number; end: number }[] = [];
  /** Bodies of members outside the sanctioned surface: out of place in full. */
  private readonly extraMembers: Misplaced[] = [];
  private readonly operationRules: ReadonlySet<string>;
  private currentClass: string | null = null;
  private moduleClass: string | null = null;
  private moduleRole: RoleConfig | null = null;
  private expected: Bucket[] | null = null;
  private readonly members: string[] = [];
  private readonly internal = new Set<string>();
  private handlerCount = 0;
  private hasJsx = false;
  /** Start offsets of literals that are a view's data configuration: values in `props.data`, its destructured defaults, object-literal props in JSX. */
  private readonly configLiterals = new Set<number>();
  /** Operation rules that stay foreign inside a function-module role: content formats and configuration data. */
  private readonly foreignRules: ReadonlySet<string>;
  /** Configuration-data rules: data a function module assigns is its logic whatever host binds it (ruling 2026-09-29). */
  private readonly dataRules: ReadonlySet<string>;
  /** Inside a function-module class: the operation buckets its functions absorb (`all`, or by the host it is bound to). */
  private absorbed: ReadonlySet<Bucket> | 'all' | null = null;

  constructor(
    private readonly source: string,
    private readonly config: FrameworkConfig,
    private readonly extras: ClassifyExtras = {},
  ) {
    this.scaffolding = new Set(config.scaffolding ?? []);
    this.operationRules = new Set(config.classifiers.filter((c) => c.operation).map((c) => c.rule ?? c.id));
    this.dataRules = new Set(config.classifiers.filter((c) => c.kind === 'configData').map((c) => c.rule ?? c.id));
    this.foreignRules = new Set(config.classifiers.filter((c) => c.operation && c.bucket === 'C').map((c) => c.rule ?? c.id)); // content formats only: data a trait receives or assigns is its logic (ruling 2026-09-29)
    const byKind = new Map<string, Classifier[]>();
    for (const c of config.classifiers) {
      const list = byKind.get(c.kind) ?? [];
      list.push(c);
      byKind.set(c.kind, list);
    }
    this.byKind = byKind;
  }

  run(ast: t.File): Classified {
    this.collectHandlerNames(ast);
    // A React module declares no class; its role is read from the file: JSX means a view, a
    // `use*` export with no JSX means a hook (ruling 2026-09-29). The role frames the whole walk.
    const fileRole = this.fileRole(ast);
    if (fileRole) {
      this.roleStack.push(fileRole);
      this.moduleRole = fileRole;
      this.expected = fileRole.expected;
    }
    this.visit(ast, null);
    this.ranges.sort((a, b) => a.start - b.start || b.end - a.end);
    const internal = [...this.internal];
    if (this.handlerCount) internal.push(`${String(this.handlerCount)} handler${this.handlerCount === 1 ? '' : 's'}`);
    return { ranges: this.ranges, role: this.moduleRole, expected: this.expected ?? this.moduleRole?.expected ?? null, members: this.members, internal, hasJsx: this.hasJsx, misplaced: this.extraMembers, className: this.moduleClass };
  }

  /** The role a file declares by its contents, for roles matched by `jsx` or `exports`. */
  private fileRole(ast: t.File): RoleConfig | undefined {
    const roles = (this.config.roles ?? []).filter((r) => r.match.jsx !== undefined || r.match.exports !== undefined);
    if (!roles.length) return undefined;
    const seen = { jsx: false };
    const exported: string[] = [];
    const walk = (n: unknown): void => {
      if (!n || typeof n !== 'object') return;
      if (Array.isArray(n)) {
        for (const x of n) walk(x);
        return;
      }
      const node = n as Node;
      if (typeof node.type !== 'string') return;
      if (node.type === 'JSXElement' || node.type === 'JSXFragment') seen.jsx = true;
      if (node.type === 'ExportNamedDeclaration' && node.declaration) {
        const d = node.declaration;
        if (d.type === 'FunctionDeclaration' && d.id) exported.push(d.id.name);
        if (d.type === 'VariableDeclaration') for (const v of d.declarations) if (v.id.type === 'Identifier' && v.init && (isFunction(unwrap(v.init)) || unwrap(v.init)?.type === 'CallExpression')) exported.push(v.id.name);
      }
      if (node.type === 'ExportDefaultDeclaration' && node.declaration.type === 'FunctionDeclaration' && node.declaration.id) exported.push(node.declaration.id.name);
      for (const [k, v] of Object.entries(node)) if (!SKIP_KEYS.has(k)) walk(v);
    };
    walk(ast.program);
    for (const r of roles) {
      if (r.match.jsx === true && seen.jsx) return r;
      if (r.match.exports !== undefined && !seen.jsx && exported.some((name) => this.re(r.match.exports as string).test(name))) return r;
    }
    return undefined;
  }

  // ---- helpers -------------------------------------------------------------

  private re(pattern: string): RegExp {
    let r = this.regex.get(pattern);
    if (!r) {
      r = new RegExp(pattern);
      this.regex.set(pattern, r);
    }
    return r;
  }

  private text(n: Node): string {
    return this.source.slice(n.start ?? 0, n.end ?? 0);
  }

  private add(start: number | null | undefined, end: number | null | undefined, bucket: Bucket | 'excluded', rule: string, prose?: readonly CommentStyle[], pierce = false): Range | null {
    if (start == null || end == null || end <= start) return null;
    if (!pierce && bucket !== 'excluded' && !rule.startsWith('role:') && !rule.startsWith('method:') && this.sealed.some((z) => z.start <= start && end <= z.end)) return null;
    // Inside a sanctioned member only an explicit operation of a layer keeps its bucket; everything else is the type.
    // A call to a trait method no bound trait defines is a defect, not configuration: it shows even there.
    if (!this.extras.byOperation && bucket !== 'excluded' && !rule.startsWith('role:') && !rule.startsWith('method:') && !rule.startsWith('scaffolding:') && !rule.endsWith(':unverified') && !this.operationRules.has(rule.split(':')[0] as string) && this.configSealed.some((z) => z.start <= start && end <= z.end)) return null;
    // An unverified trait call inside a sanctioned member keeps its name for the report and takes the member's type (2026-09-29).
    if (rule.endsWith(':unverified') && this.role && this.configSealed.some((z) => z.start <= start && end <= z.end)) bucket = this.role.default;
    // Inside a function module (a SpyneTrait) an operation of another layer is what the function does for its
    // host: it takes the role's default. Content formats and configuration data stay foreign (ruling 2026-09-29).
    const base = rule.split(':')[0] as string;
    if (!this.extras.byOperation && bucket !== 'excluded' && this.absorbed && this.role && this.operationRules.has(base) && !this.foreignRules.has(base) && !rule.endsWith(':unverified') && (this.absorbed === 'all' || this.absorbed.has(bucket) || this.dataRules.has(base))) bucket = this.role.default;
    const r: Range = { start, end, bucket, rule };
    if (prose) r.prose = prose;
    this.ranges.push(r);
    return r;
  }

  /**
   * A file role matched by its exports (a hook module, a Route Handler) is its type through those
   * exports: each matched export's body takes the role's default and is a sanctioned member, so
   * only an explicit operation of another layer shows inside it (ruling A applied to file roles,
   * 2026-09-29). Code outside the matched exports keeps the config default.
   */
  private sealExport(d: Node): void {
    const role = this.moduleRole;
    if (this.extras.byOperation || role?.match.exports === undefined || role.match.jsx !== undefined) return;
    const re = this.re(role.match.exports);
    const fns: Node[] = [];
    const declared = d.type === 'FunctionDeclaration' ? d.id?.name : undefined;
    if (declared !== undefined && re.test(declared)) fns.push(d);
    if (d.type === 'VariableDeclaration') for (const v of d.declarations) if (v.id.type === 'Identifier' && re.test(v.id.name) && v.init && isFunction(unwrap(v.init))) fns.push(unwrap(v.init) as Node);
    for (const fn of fns) {
      const body = (fn as { body?: Node }).body;
      if (body?.start == null || body.end == null) continue;
      this.add(body.start, body.end, role.default, `role:${role.name}`);
      this.configSealed.push({ start: body.start, end: body.end });
    }
  }

  /**
   * The bucket of the keyword that introduces markup (`return`, `const x =`): a reader does not
   * distinguish a return from what it returns, so returning a component is View, one concern, and
   * returning host markup is Content (ruling 2026-09-29).
   */
  private jsxHead(n: Node | null | undefined): Bucket {
    const u = unwrap(n);
    if (u?.type === 'JSXFragment') {
      // A fragment introduces no element of its own: it takes what its first element introduces.
      const first = u.children.find((c) => c.type === 'JSXElement' || c.type === 'JSXFragment');
      return first ? this.jsxHead(first) : (this.first('jsx')?.bucket ?? 'V');
    }
    if (u?.type === 'JSXElement') {
      const name = u.openingElement.name;
      const isComponent = name.type !== 'JSXIdentifier' || /^[A-Z]/.test(name.name);
      const cc = isComponent ? this.first('jsxComponent', this.text(name)) : undefined;
      if (cc) return cc.bucket;
    }
    return this.first('jsx')?.bucket ?? 'V';
  }

  private get role(): RoleConfig | undefined {
    return this.roleStack[this.roleStack.length - 1];
  }

  /** Role whose `match.extends` (a regex) matches the class's superclass name. */
  private roleFor(node: t.ClassDeclaration | t.ClassExpression): RoleConfig | undefined {
    const sup = node.superClass;
    if (!sup) return undefined;
    const name = sup.type === 'Identifier' ? sup.name : sup.type === 'MemberExpression' && sup.property.type === 'Identifier' ? sup.property.name : this.text(sup);
    return (this.config.roles ?? []).find((r) => r.match.extends !== undefined && this.re(`^(${r.match.extends})$`).test(name));
  }

  /** Role-level call rule, e.g. a SpyneTrait call inside a Channel. */
  private roleCall(calleeText: string): { bucket: Bucket; permitted: boolean; bare: boolean; verified: boolean } | null {
    const role = this.role;
    if (!role?.calls) return null;
    for (const [pattern, rule] of Object.entries(role.calls)) {
      if (this.re(pattern).test(calleeText)) {
        // A trait method called from a designated member is the host's own, whether the trait is bound through
        // props.traits or used as a pure static function (ruling 2026-09-29). `verified` only says whether some
        // trait in the codebase defines the method; an unverified call is named in the report, not counted as noise.
        const method = calleeText.split('.').pop() ?? calleeText;
        const verified = !this.extras.traitMethods || this.extras.traitMethods.has(method);
        return { bucket: rule.bucket, permitted: rule.permitted ?? false, bare: rule.bare === 'host', verified };
      }
    }
    return null;
  }

  /**
   * A bare delegation: the call is a statement on its own, its result unused, and it passes
   * nothing or only identifiers and member reads through (`e`, `this.props`). Ruling
   * 2026-09-26: that is configuration by another syntax. Anything else composes.
   */
  private isBareDelegation(node: t.CallExpression | t.NewExpression, parent: Node | null): boolean {
    if (node.type !== 'CallExpression') return false;
    // A statement, or the whole body of an arrow (`(p) => this.onRoute(p)`): the result goes nowhere.
    if (parent?.type !== 'ExpressionStatement' && !(parent?.type === 'ArrowFunctionExpression' && parent.body === node)) return false;
    return node.arguments.every((a) => a.type === 'Identifier' || a.type === 'MemberExpression' || a.type === 'ThisExpression');
  }

  private exclude(n: Node | null | undefined, kind: ScaffoldingKind, rule = `scaffolding:${kind}`): void {
    if (n && this.scaffolding.has(kind)) this.add(n.start, n.end, 'excluded', rule);
  }

  private first(kind: Classifier['kind'], subject?: string): Classifier | undefined {
    const list = this.byKind.get(kind);
    if (!list) return undefined;
    return list.find((c) => c.match === undefined || (subject !== undefined && this.re(c.match).test(subject)));
  }

  private bucketFor(c: Classifier): Bucket {
    if (c.allow && c.kind === 'conditional') {
      for (let i = this.context.length - 1; i >= 0; i -= 1) {
        const name = this.context[i] ?? '';
        const hit = c.allow.find((a) => this.re(a.within).test(name));
        if (hit) return hit.bucket;
      }
    }
    return c.bucket;
  }

  private within(names: readonly string[]): boolean {
    return this.context.some((ctx) => names.includes(ctx));
  }

  // ---- pre-pass: handler identifiers ----------------------------------------

  private collectHandlerNames(ast: t.File): void {
    const attrClassifiers = (this.byKind.get('jsxAttribute') ?? []).filter((c) => c.resolve);
    const callClassifiers = (this.byKind.get('call') ?? []).filter((c) => c.resolve);
    if (attrClassifiers.length === 0 && callClassifiers.length === 0) return;
    const remember = (expr: Node | null | undefined, c: Classifier): void => {
      const e = unwrap(expr);
      if (e?.type === 'Identifier') this.handlerNames.set(e.name, c);
      else if (e?.type === 'MemberExpression' && e.object.type === 'ThisExpression' && e.property.type === 'Identifier') {
        this.handlerNames.set(`this.${e.property.name}`, c);
      }
    };
    const walk = (n: unknown): void => {
      if (!n || typeof n !== 'object') return;
      if (Array.isArray(n)) {
        for (const x of n) walk(x);
        return;
      }
      const node = n as Node;
      if (typeof node.type !== 'string') return;
      if (node.type === 'JSXAttribute') {
        const name = jsxAttrName(node);
        const c = attrClassifiers.find((cl) => cl.match === undefined || this.re(cl.match).test(name));
        if (c && node.value?.type === 'JSXExpressionContainer') remember(node.value.expression, c);
      }
      if (node.type === 'CallExpression') {
        const calleeText = this.text(node.callee);
        const c = callClassifiers.find((cl) => cl.match === undefined || this.re(cl.match).test(calleeText));
        if (c) for (const arg of node.arguments) remember(arg, c);
      }
      for (const [k, v] of Object.entries(node)) if (!SKIP_KEYS.has(k)) walk(v);
    };
    walk(ast.program);
  }

  // ---- walk ---------------------------------------------------------------------

  private visit(n: unknown, parent: Node | null): void {
    if (!n || typeof n !== 'object') return;
    if (Array.isArray(n)) {
      for (const x of n) this.visit(x, parent);
      return;
    }
    const node = n as Node;
    if (typeof node.type !== 'string') return;

    const before = this.roleStack.length;
    const sealedBefore = this.sealed.length;
    const hostBefore = this.hostSealed.length;
    const configBefore = this.configSealed.length;
    const absorbedBefore = this.absorbed;
    const pushed = this.enter(node, parent);
    for (const [k, v] of Object.entries(node)) if (!SKIP_KEYS.has(k)) this.visit(v, node);
    for (let i = 0; i < pushed; i += 1) this.context.pop();
    while (this.roleStack.length > before) this.roleStack.pop();
    this.absorbed = absorbedBefore;
    while (this.sealed.length > sealedBefore) this.sealed.pop();
    while (this.hostSealed.length > hostBefore) this.hostSealed.pop();
    while (this.configSealed.length > configBefore) this.configSealed.pop();
  }

  /** Emits ranges for `node`; returns how many context names were pushed. */
  private enter(node: Node, parent: Node | null): number {
    let pushed = 0;
    const push = (name: string): void => {
      this.context.push(name);
      pushed += 1;
    };

    // ---- scaffolding ----
    if (node.type.startsWith('TS') && !TS_WRAPPERS.has(node.type)) {
      this.exclude(node, 'typeAnnotations');
      return 0;
    }
    if (node.type === 'TSAsExpression' || node.type === 'TSSatisfiesExpression') {
      if (this.scaffolding.has('typeAnnotations')) this.add(node.expression.end, node.end, 'excluded', 'scaffolding:typeAnnotations');
    }
    if (node.type === 'TSTypeAssertion') {
      if (this.scaffolding.has('typeAnnotations')) this.add(node.start, node.expression.start, 'excluded', 'scaffolding:typeAnnotations');
    }
    switch (node.type) {
      case 'ImportDeclaration':
      case 'TSImportEqualsDeclaration':
      case 'ExportAllDeclaration':
        this.exclude(node, 'imports');
        return 0;
      case 'ExportNamedDeclaration':
        if (node.declaration) {
          this.addExcluded(node.start, node.declaration.start, 'exportKeywords');
          this.sealExport(node.declaration);
        } else this.exclude(node, 'exportKeywords');
        break;
      case 'ExportDefaultDeclaration':
        if (node.declaration.type === 'Identifier') {
          // `export default P;` names what was already declared: scaffolding, not a concern (review 4, 2026-09-29).
          this.exclude(node, 'exportKeywords');
          return 0;
        }
        this.addExcluded(node.start, node.declaration.start, 'exportKeywords');
        this.sealExport(node.declaration);
        break;
      case 'Directive':
        this.exclude(node, 'directives');
        return 0;
      case 'Decorator':
        this.exclude(node, 'decorators');
        return 0;
      case 'ClassDeclaration':
      case 'ClassExpression': {
        this.addExcluded(node.start, node.body.start, 'classSignatures');
        const role = this.roleFor(node);
        if (role) {
          this.currentClass = node.id?.name ?? null;
          if (this.moduleRole === null) this.moduleClass = this.currentClass;
          this.roleStack.push(role);
          const first = this.moduleRole?.match.extends === undefined; // no role yet, or a file role that a class role now refines
          this.moduleRole ??= role;
          this.add(node.body.start, node.body.end, role.default, `role:${role.name}`);
          if (role.uniform && node.body.start != null && node.body.end != null) this.sealed.push({ start: node.body.start, end: node.body.end });
          if (first) this.expected = null;
          if (role.functions) {
            // What the trait absorbs depends on who binds it: a view trait's DOM work and a channel trait's stream work are their functions;
            // the other layer's operations stay foreign. Unbound, or bound to both, it absorbs the union (ruling 2026-09-29).
            const byId = node.id && this.extras.file !== undefined ? this.extras.traitHosts?.[`${this.extras.file}#${node.id.name}`] : undefined;
            const kind = byId ?? (node.id ? this.extras.traitHosts?.[node.id.name] : undefined);
            const map = role.functions;
            this.absorbed = map === true || kind === undefined || !(kind in map) ? 'all' : new Set(map[kind]);
          }
        }
        break;
      }
      case 'ClassMethod':
      case 'ClassPrivateMethod': {
        if (node.kind === 'constructor' && this.scaffolding.has('constructors')) {
          this.exclude(node, 'constructors');
          return 0;
        }
        const name = keyName(node.key) ?? '';
        if (this.role && this.moduleRole === this.role) this.members.push(name);
        if (this.role?.surface && this.role.match.extends !== undefined && node.body.start != null && node.body.end != null) {
          const sanctioned = this.role.surface.some((s) => (/^[A-Za-z_$][\w$]*$/.test(s) ? s === name : this.re(s).test(name)));
          if (sanctioned) this.configSealed.push({ start: node.body.start, end: node.body.end });
          else this.extraMembers.push({ start: node.body.start, end: node.body.end });
        }
        const c = this.first('classMethod', name);
        if (c) this.add(node.start, node.end, c.bucket, c.rule ?? c.id);
        const rm = this.role?.methods?.[name];
        if (rm) {
          const roleBucket = typeof rm === 'string' ? rm : rm.bucket;
          this.add(node.start, node.end, roleBucket, `method:${name}`);
          if (typeof rm !== 'string' && rm.uniform && node.body.start != null && node.body.end != null) this.sealed.push({ start: node.body.start, end: node.body.end });
        }
        const handler = this.handlerNames.get(`this.${name}`);
        if (handler) this.add(node.start, node.end, handler.resolveBucket ?? handler.bucket, `${handler.rule ?? handler.id}:resolved`);
        this.addExcluded(node.start, node.body.start, 'functionSignatures');
        push(name);
        break;
      }
      case 'ClassProperty':
      case 'ClassPrivateProperty':
      case 'ClassAccessorProperty': {
        const name = keyName(node.key) ?? '';
        const fn = innerFunction(node.value);
        if (fn) {
          this.addExcluded(node.start, node.value?.start, 'functionSignatures');
          const handler = this.handlerNames.get(`this.${name}`);
          if (handler) this.add(fn.start, fn.end, handler.resolveBucket ?? handler.bucket, `${handler.rule ?? handler.id}:resolved`);
        }
        push(name);
        break;
      }
      case 'FunctionDeclaration':
      case 'FunctionExpression':
      case 'ArrowFunctionExpression':
      case 'ObjectMethod': {
        if (node.type === 'FunctionDeclaration' && node.id) {
          if (/^(handle|on)[A-Z]/.test(node.id.name)) this.handlerCount += 1;
          const handler = this.handlerNames.get(node.id.name);
          if (handler) this.add(node.start, node.end, handler.resolveBucket ?? handler.bucket, `${handler.rule ?? handler.id}:resolved`);
        }
        this.addExcluded(node.start, node.body.start, 'functionSignatures');
        if (node.type === 'ObjectMethod') push(keyName(node.key) ?? '');
        else if (node.type === 'FunctionDeclaration' && node.id) push(node.id.name);
        break;
      }
      case 'VariableDeclaration': {
        // `const App = () => …`: the keyword and the name are the function's signature.
        const allFns = node.declarations.every((d) => d.init && this.namesFunction(d.init));
        if (allFns && node.declarations[0]?.init) this.addExcluded(node.start, node.declarations[0].init.start, 'functionSignatures');
        break;
      }
      case 'VariableDeclarator': {
        const init = node.init;
        if (!init) break;
        if (this.role && this.first('configData') && node.id.type === 'ObjectPattern' && /props\.data\b/.test(this.text(init))) this.markConfigLiterals(node.id);
        // `const ADD_ITEM = 'ADD_ITEM'`: a name for something dispatched or emitted; it declares behavior.
        if (node.id.type === 'Identifier' && /^[A-Z][A-Z0-9_]+$/.test(node.id.name) && unwrap(init)?.type === 'StringLiteral' && (unwrap(init) as t.StringLiteral).value === node.id.name) {
          const al = this.first('actionLabel', node.id.name);
          if (al) this.add(node.start, node.end, al.bucket, al.rule ?? al.id);
        }
        const fn = innerFunction(init);
        if (this.namesFunction(init)) {
          this.addExcluded(node.start, init.start, 'functionSignatures');
          if (this.isWrappedComponent(init) && init.type === 'CallExpression') this.addExcluded(init.callee.start, init.callee.end, 'functionSignatures', 'scaffolding:componentWrapper');
        }
        if (node.id.type === 'Identifier') {
          if (fn && /^(handle|on)[A-Z]/.test(node.id.name)) this.handlerCount += 1;
          const handler = this.handlerNames.get(node.id.name);
          if (handler && fn) this.add(fn.start, fn.end, handler.resolveBucket ?? handler.bucket, `${handler.rule ?? handler.id}:resolved`);
          if (!fn && isJsx(init)) this.add(node.start, init.start, this.jsxHead(init), 'jsx');
        }
        break;
      }
      case 'ReturnStatement':
        if (node.argument && isJsx(node.argument)) this.add(node.start, node.argument.start, this.jsxHead(node.argument), 'jsx');
        break;
      case 'CallExpression':
      case 'NewExpression': {
        if (node.callee.type === 'Super') {
          this.exclude(node, 'superCalls');
          return 0;
        }
        const calleeText = (node.type === 'NewExpression' ? 'new ' : '') + this.text(node.callee);
        if (/^(React\.)?use[A-Z]/.test(calleeText)) this.internal.add(calleeText.replace(/^React\./, ''));
        const c = this.first('call', calleeText);
        if (c?.host && node.start != null && node.end != null) {
          // The construct is a declaration in its host: it takes the innermost enclosing bucket and seals its arguments.
          let bucket: Bucket = this.extras.byOperation ? c.bucket : (this.role?.default ?? c.bucket);
          let best = -1;
          if (!this.extras.byOperation) for (const r of this.ranges) if (r.start <= node.start && node.end <= r.end && r.bucket !== 'excluded' && r.start >= best) { best = r.start; bucket = r.bucket; }
          this.add(node.start, node.end, bucket, c.rule ?? c.id);
          if (!this.extras.byOperation) this.hostSealed.push({ start: node.start, end: node.end }); // its structure takes the host; an operation inside keeps its own bucket
          push(calleeText);
          break;
        }
        if (c) {
          this.add(node.start, node.end, c.bucket, c.rule ?? c.id);
          if (c.resolveBucket !== undefined && c.resolveBucket !== c.bucket) {
            for (const arg of node.arguments) {
              const fn = innerFunction(arg);
              if (fn) this.add(fn.start, fn.end, c.resolveBucket, `${c.rule ?? c.id}:body`);
            }
          }
        }
        const rc = this.roleCall(calleeText);
        const bare = this.isBareDelegation(node, parent);
        if (rc && !(rc.bare && bare)) {
          // A composed trait call is Logic in the host; one no trait defines is named `:unverified` for the report.
          const r = this.add(node.start, node.end, rc.bucket, rc.verified ? `${this.role?.name ?? 'role'}:call` : `${this.role?.name ?? 'role'}:call:unverified`, undefined, !bare);
          if (r) r.permitted = rc.permitted && !this.extraMembers.some((z) => z.start <= (node.start ?? 0) && (node.end ?? 0) <= z.end);
        } else if (rc && !rc.verified) {
          // A bare delegation to a method no trait defines keeps the host's bucket and is still named (review 4, 2026-09-29).
          this.add(node.start, node.end, rc.bucket, `${this.role?.name ?? 'role'}:call:unverified`);
        } else if (!rc && !bare && this.role?.match.extends !== undefined && !c && this.role.uniform !== true && !this.hostSealed.some((z) => z.start <= (node.start ?? 0) && (node.end ?? 0) <= z.end)) {
          // A local call whose result is used, inside a role class, is a computed value: Logic, not configuration.
          this.add(node.start, node.end, 'L', 'call:composed', undefined, true);
        }
        if (parent?.type === 'JSXExpressionContainer') {
          // `{items.map(item => <li/>)}` over a bare list iterates data and decides nothing: Content, like a
          // template section. A call on a computed receiver, or any other call in markup, evaluates: Logic.
          const it = this.first('jsxIteration', calleeText);
          const receiver = node.type === 'CallExpression' && node.callee.type === 'MemberExpression' ? unwrap(node.callee.object) : null;
          const bareReceiver = !!receiver && this.isBareRead(receiver);
          if (it && bareReceiver) {
            // The iteration is Content; a block-bodied callback's statements are classified by what they do.
            const cb = node.type === 'CallExpression' ? innerFunction(node.arguments[0]) : null;
            const end = cb?.body.type === 'BlockStatement' ? cb.body.start : node.end;
            this.add(node.start, end, it.bucket, it.rule ?? it.id);
            if (cb?.body.type === 'BlockStatement') {
              // the body is code: the config default, with the markup it returns Content and any operation its own
              this.add(cb.body.start, cb.body.end, this.config.default, `${it.rule ?? it.id}:body`);
              this.add(cb.body.end, node.end, it.bucket, it.rule ?? it.id);
            }
          } else {
            const jc = this.first('jsxExpressionCall');
            if (jc) this.add(node.start, node.end, jc.bucket, jc.rule ?? jc.id);
          }
        }
        push(calleeText);
        break;
      }
      case 'JSXElement':
      case 'JSXFragment': {
        this.hasJsx = true;
        const c = this.first('jsx');
        if (c) this.add(node.start, node.end, c.bucket, c.rule ?? c.id);
        if (node.type === 'JSXElement') {
          // Nesting a component is composition, the view's own act, as appendView is in a class-based view (ruling 2026-09-29):
          // the tags that place it are View; its attributes and children keep their own rules.
          const name = node.openingElement.name;
          const isComponent = name.type !== 'JSXIdentifier' || /^[A-Z]/.test(name.name);
          const cc = isComponent ? this.first('jsxComponent', this.text(name)) : undefined;
          if (cc) {
            this.add(node.openingElement.start, node.openingElement.end, cc.bucket, cc.rule ?? cc.id);
            if (node.closingElement) this.add(node.closingElement.start, node.closingElement.end, cc.bucket, cc.rule ?? cc.id);
          }
        }
        break;
      }
      case 'JSXText': {
        const c = this.first('jsxText');
        if (c) this.add(node.start, node.end, c.bucket, c.rule ?? c.id, []);
        break;
      }
      case 'JSXExpressionContainer': {
        // {'Hello world'}, {`Hello ${name}`}, and {cond ? 'Live' : 'Connecting…'} as a JSX child are copy, whatever the word count.
        const e = unwrap(node.expression);
        if (parent && (parent.type === 'JSXElement' || parent.type === 'JSXFragment') && e) {
          const c = this.first('jsxText');
          const copy = (n: Node | null | undefined): void => {
            const u = unwrap(n);
            if (!u || !c) return;
            if (u.type === 'StringLiteral' || u.type === 'TemplateLiteral') this.add(u.start, u.end, c.bucket, c.rule ?? c.id, []);
            else if (u.type === 'ConditionalExpression') {
              copy(u.consequent);
              copy(u.alternate);
            } else if (u.type === 'LogicalExpression') copy(u.right);
          };
          copy(e);
        }
        break;
      }
      case 'JSXAttribute': {
        const name = jsxAttrName(node);
        const attr = this.first('jsxAttribute', name);
        if (attr) {
          this.add(node.start, node.end, attr.bucket, attr.rule ?? attr.id);
          if (attr.resolveBucket !== undefined && attr.resolveBucket !== attr.bucket && node.value?.type === 'JSXExpressionContainer') {
            const fn = innerFunction(node.value.expression);
            if (fn) this.add(fn.start, fn.end, attr.resolveBucket, `${attr.rule ?? attr.id}:body`);
          }
        }
        // Only literal values are copy or style; `title={title}` and `style={style}` pass a prop through and stay View.
        const literal = attrLiteral(node.value);
        const isCopy = literal?.type === 'StringLiteral' || literal?.type === 'TemplateLiteral';
        const copy = this.first('copyAttribute', name);
        if (copy && literal && isCopy) this.add(literal.start, literal.end, copy.bucket, copy.rule ?? copy.id, []);
        const style = this.first('styleAttribute', name);
        if (style && literal?.type === 'ObjectExpression') this.add(literal.start, literal.end, style.bucket, style.rule ?? style.id);
        // A static class list is styles: one Content token per class, the way a stylesheet counts by word (2026-09-27).
        const cls = this.first('classAttribute', name);
        if (cls && literal?.type === 'StringLiteral') {
          const r = this.add(literal.start, literal.end, cls.bucket, cls.rule ?? cls.id);
          if (r) r.split = 'whitespace';
        }
        if (this.first('configData') && !style && (literal?.type === 'ObjectExpression' || literal?.type === 'ArrayExpression')) this.markConfigLiterals(literal);
        push(name);
        break;
      }
      case 'StringLiteral': {
        if (parent?.type === 'ImportDeclaration' || parent?.type === 'JSXAttribute') break;
        if (node.start != null && this.configLiterals.has(node.start)) {
          const cd = this.first('configData');
          if (cd) this.add(node.start, node.end, cd.bucket, cd.rule ?? cd.id);
          break;
        }
        const markup = this.first('markupTemplate');
        if (markup && MARKUP.test(node.value) && !this.isKey(node, parent) && !this.inExcludedContext()) {
          this.add(node.start, node.end, markup.bucket, markup.rule ?? markup.id, ['html']);
          break;
        }
        this.copyString(node, parent, node.value);
        break;
      }
      case 'TemplateLiteral': {
        if (parent?.type === 'TaggedTemplateExpression') break;
        if (node.start != null && this.configLiterals.has(node.start)) {
          const cd = this.first('configData');
          if (cd) this.add(node.start, node.end, cd.bucket, cd.rule ?? cd.id);
          break;
        }
        const raw = node.quasis.map((q) => q.value.cooked ?? q.value.raw).join(' ');
        const markup = this.first('markupTemplate');
        if (markup && MARKUP.test(raw) && !this.inExcludedContext()) {
          this.add(node.start, node.end, markup.bucket, markup.rule ?? markup.id, ['html']);
          break;
        }
        this.copyString(node, parent, raw);
        break;
      }
      case 'TaggedTemplateExpression': {
        const c = this.first('taggedTemplate', this.text(node.tag));
        if (c) this.add(node.start, node.end, c.bucket, c.rule ?? c.id, ['block', 'line']);
        break;
      }
      case 'AssignmentExpression': {
        const c = this.first('assignment', this.text(node.left));
        if (c) this.add(node.start, node.end, c.bucket, c.rule ?? c.id);
        if (this.role && this.first('configData') && /^(this\.)?props\.data(\.|$)/.test(this.text(node.left))) this.markConfigLiterals(node.right);
        break;
      }
      case 'IfStatement': {
        const c = this.first('conditional');
        if (c) {
          const b = this.bucketFor(c);
          this.add(node.start, node.test.end, b, c.rule ?? c.id);
          if (node.alternate) this.add(node.consequent.end, node.alternate.start, b, c.rule ?? c.id);
        }
        break;
      }
      case 'ConditionalExpression': {
        const c = this.first('conditional');
        if (c) this.add(node.start, node.test.end, this.bucketFor(c), c.rule ?? c.id);
        break;
      }
      case 'LogicalExpression': {
        const c = this.first('conditional');
        if (c && !this.isExemptDefault(node, c)) this.add(node.start, node.left.end, this.bucketFor(c), c.rule ?? c.id);
        break;
      }
      case 'SwitchStatement': {
        const c = this.first('conditional');
        if (c) {
          const b = this.bucketFor(c);
          this.add(node.start, node.discriminant.end, b, c.rule ?? c.id);
          for (const sc of node.cases) this.add(sc.start, sc.test ? sc.test.end : (sc.start ?? 0) + 'default'.length, b, c.rule ?? c.id);
        }
        break;
      }
      default:
        break;
    }
    return pushed;
  }

  private addExcluded(start: number | null | undefined, end: number | null | undefined, kind: ScaffoldingKind, rule = `scaffolding:${kind}`): void {
    if (this.scaffolding.has(kind)) this.add(start, end, 'excluded', rule);
  }

  /**
   * Data handed to a rendering surface is the view's configuration, not copy in the wild: string
   * values inside `props.data = {…}`, defaults destructured from `props.data`, `props.data.x = '…'`,
   * and object-literal props on a JSX element (`<Form labels={{ email: 'Email' }} />`). The same act
   * in both frameworks: declaring what the template or component will be given (ruling 2026-09-22
   * that config is View, reapplied 2026-09-27 as a token rule instead of a seal).
   */
  private markConfigLiterals(n: Node | null | undefined): void {
    const walk = (x: unknown): void => {
      if (!x || typeof x !== 'object') return;
      if (Array.isArray(x)) {
        for (const y of x) walk(y);
        return;
      }
      const node = x as Node;
      if (typeof node.type !== 'string') return;
      if (isFunction(node)) return; // a function inside data is not data
      if ((node.type === 'StringLiteral' || node.type === 'TemplateLiteral') && node.start != null) this.configLiterals.add(node.start);
      for (const [k, v] of Object.entries(node)) if (!SKIP_KEYS.has(k)) walk(v);
    };
    walk(n);
  }

  /** An identifier or a member chain with no call in it: a read, not a computation. */
  private isBareRead(n: Node): boolean {
    let cur: Node | null | undefined = unwrap(n);
    while (cur) {
      if (cur.type === 'Identifier' || cur.type === 'ThisExpression') return true;
      if (cur.type === 'MemberExpression' && !cur.computed) {
        cur = unwrap(cur.object);
        continue;
      }
      if (cur.type === 'MemberExpression' && cur.computed && (cur.property.type === 'StringLiteral' || cur.property.type === 'NumericLiteral')) {
        cur = unwrap(cur.object);
        continue;
      }
      return false;
    }
    return false;
  }

  /** Is this initializer a function, so the declarator's name is that function's name? */
  private namesFunction(init: Node): boolean {
    const u = unwrap(init);
    if (!u) return false;
    if (isFunction(u)) return true;
    if (u.type !== 'CallExpression') return false;
    const callee = this.text(u.callee);
    return (COMPONENT_WRAPPERS.test(callee) || FUNCTION_HOOKS.test(callee)) && innerFunction(u.arguments[0]) !== null;
  }

  private isWrappedComponent(init: Node): boolean {
    const u = unwrap(init);
    return !!u && u.type === 'CallExpression' && COMPONENT_WRAPPERS.test(this.text(u.callee)) && innerFunction(u.arguments[0]) !== null;
  }

  /** `a ?? b` reads a default; it is exempt from the conditional rule unless an operand calls a local method. */
  private isExemptDefault(node: t.LogicalExpression, c: Classifier): boolean {
    const d = c.defaults;
    if (!d?.operators.includes(node.operator as '??' | '||')) return false;
    const callees: string[] = [];
    const walk = (n: unknown): void => {
      if (!n || typeof n !== 'object') return;
      if (Array.isArray(n)) {
        for (const x of n) walk(x);
        return;
      }
      const sub = n as Node;
      if (typeof sub.type !== 'string') return;
      if (sub.type === 'CallExpression' || sub.type === 'NewExpression') callees.push((sub.type === 'NewExpression' ? 'new ' : '') + this.text(sub.callee));
      for (const [k, v] of Object.entries(sub)) if (!SKIP_KEYS.has(k)) walk(v);
    };
    walk(node.left);
    walk(node.right);
    if (callees.length === 0) return true;
    return d.allowCalls !== undefined && callees.every((callee) => this.re(d.allowCalls as string).test(callee));
  }

  /** Inside a console.* call, or a callee the copy-string rule lists in `notWithin`: markup there is instrumentation, not content. */
  private inExcludedContext(): boolean {
    if (this.context.some((ctx) => ctx.startsWith('console.'))) return true;
    const c = this.first('copyString');
    return !!c?.notWithin && this.within(c.notWithin);
  }

  private isKey(node: Node, parent: Node | null): boolean {
    if (!parent) return false;
    if ((parent.type === 'ObjectProperty' || parent.type === 'ClassProperty') && parent.key === node) return true;
    return parent.type === 'MemberExpression' && parent.property === node;
  }

  private copyString(node: t.StringLiteral | t.TemplateLiteral, parent: Node | null, value: string): void {
    const c = this.first('copyString');
    if (!c) return;
    if (!parent) return;
    if (parent.type === 'ImportDeclaration' || parent.type === 'ExportNamedDeclaration' || parent.type === 'ExportAllDeclaration') return;
    if (parent.type === 'JSXAttribute') return; // handled by copyAttribute / jsx
    if ((parent.type === 'ObjectProperty' || parent.type === 'ClassProperty') && parent.key === node) return;
    if (parent.type === 'MemberExpression' && parent.property === node) return;
    if (c.notWithin && this.within(c.notWithin)) {
      // Console output is the developer's instrumentation: Logic wherever the call sits (ruling 2026-09-26).
      if (this.context.some((ctx) => ctx.startsWith('console.'))) this.add(node.start, node.end, 'L', 'console');
      return;
    }
    const words = value.trim().split(/\s+/).filter((w) => /\p{L}/u.test(w));
    if (words.length < (c.minWords ?? 3)) return;
    // Prose is mostly plain words. Class lists (`ml-1 w-4 text-gray-500`) and CSS values are not.
    const plain = words.filter((w) => /^\p{L}+[,.!?;:'")]*$/u.test(w)).length;
    if (plain * 2 <= words.length) return;
    this.add(node.start, node.end, c.bucket, c.rule ?? c.id, []);
  }
}

export function classifyAst(source: string, ast: t.File, config: FrameworkConfig, extras: ClassifyExtras = {}): Classified {
  return new RangeBuilder(source, config, extras).run(ast);
}
