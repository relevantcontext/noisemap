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
  /** Tokens here may fall outside the role's expected shape without counting as drift. */
  permitted?: boolean;
}

export interface Classified {
  ranges: Range[];
  /** The first declared role matched in the file, if any. */
  role: RoleConfig | null;
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
  private moduleRole: RoleConfig | null = null;

  constructor(
    private readonly source: string,
    private readonly config: FrameworkConfig,
  ) {
    this.scaffolding = new Set(config.scaffolding ?? []);
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
    this.visit(ast, null);
    this.ranges.sort((a, b) => a.start - b.start || b.end - a.end);
    return { ranges: this.ranges, role: this.moduleRole };
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

  private add(start: number | null | undefined, end: number | null | undefined, bucket: Bucket | 'excluded', rule: string, prose?: readonly CommentStyle[]): Range | null {
    if (start == null || end == null || end <= start) return null;
    if (bucket !== 'excluded' && !rule.startsWith('role:') && !rule.startsWith('method:') && this.sealed.some((z) => z.start <= start && end <= z.end)) return null;
    const r: Range = { start, end, bucket, rule };
    if (prose) r.prose = prose;
    this.ranges.push(r);
    return r;
  }

  private get role(): RoleConfig | undefined {
    return this.roleStack[this.roleStack.length - 1];
  }

  /** Role whose `match.extends` (a regex) matches the class's superclass name. */
  private roleFor(node: t.ClassDeclaration | t.ClassExpression): RoleConfig | undefined {
    const sup = node.superClass;
    if (!sup) return undefined;
    const name = sup.type === 'Identifier' ? sup.name : sup.type === 'MemberExpression' && sup.property.type === 'Identifier' ? sup.property.name : this.text(sup);
    return (this.config.roles ?? []).find((r) => this.re(`^(${r.match.extends})$`).test(name));
  }

  /** Role-level call rule, e.g. a SpyneTrait call inside a Channel. */
  private roleCall(calleeText: string): { bucket: Bucket; permitted: boolean } | null {
    const role = this.role;
    if (!role?.calls) return null;
    for (const [pattern, rule] of Object.entries(role.calls)) {
      if (this.re(pattern).test(calleeText)) return { bucket: rule.bucket, permitted: rule.permitted ?? false };
    }
    return null;
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
    const pushed = this.enter(node, parent);
    for (const [k, v] of Object.entries(node)) if (!SKIP_KEYS.has(k)) this.visit(v, node);
    for (let i = 0; i < pushed; i += 1) this.context.pop();
    while (this.roleStack.length > before) this.roleStack.pop();
    while (this.sealed.length > sealedBefore) this.sealed.pop();
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
        if (node.declaration) this.addExcluded(node.start, node.declaration.start, 'exportKeywords');
        else this.exclude(node, 'exportKeywords');
        break;
      case 'ExportDefaultDeclaration':
        this.addExcluded(node.start, node.declaration.start, 'exportKeywords');
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
          this.roleStack.push(role);
          this.moduleRole ??= role;
          this.add(node.body.start, node.body.end, role.default, `role:${role.name}`);
          if (role.uniform && node.body.start != null && node.body.end != null) this.sealed.push({ start: node.body.start, end: node.body.end });
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
        const fn = innerFunction(init);
        if (this.namesFunction(init)) {
          this.addExcluded(node.start, init.start, 'functionSignatures');
          if (this.isWrappedComponent(init) && init.type === 'CallExpression') this.addExcluded(init.callee.start, init.callee.end, 'functionSignatures', 'scaffolding:componentWrapper');
        }
        if (node.id.type === 'Identifier') {
          const handler = this.handlerNames.get(node.id.name);
          if (handler && fn) this.add(fn.start, fn.end, handler.resolveBucket ?? handler.bucket, `${handler.rule ?? handler.id}:resolved`);
          if (!fn && isJsx(init)) this.add(node.start, init.start, 'V', 'jsx');
        }
        break;
      }
      case 'ReturnStatement':
        if (node.argument && isJsx(node.argument)) this.add(node.start, node.argument.start, 'V', 'jsx');
        break;
      case 'CallExpression':
      case 'NewExpression': {
        if (node.callee.type === 'Super') {
          this.exclude(node, 'superCalls');
          return 0;
        }
        const calleeText = (node.type === 'NewExpression' ? 'new ' : '') + this.text(node.callee);
        const c = this.first('call', calleeText);
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
        if (rc) {
          const r = this.add(node.start, node.end, rc.bucket, `${this.role?.name ?? 'role'}:call`);
          if (r) r.permitted = rc.permitted;
        }
        if (parent?.type === 'JSXExpressionContainer') {
          const jc = this.first('jsxExpressionCall');
          if (jc) this.add(node.start, node.end, jc.bucket, jc.rule ?? jc.id);
        }
        push(calleeText);
        break;
      }
      case 'JSXElement':
      case 'JSXFragment': {
        const c = this.first('jsx');
        if (c) this.add(node.start, node.end, c.bucket, c.rule ?? c.id);
        break;
      }
      case 'JSXText': {
        const c = this.first('jsxText');
        if (c) this.add(node.start, node.end, c.bucket, c.rule ?? c.id, []);
        break;
      }
      case 'JSXExpressionContainer': {
        // {'Hello world'} or {`Hello ${name}`} as a JSX child is copy.
        const e = unwrap(node.expression);
        if (parent && (parent.type === 'JSXElement' || parent.type === 'JSXFragment') && e && (e.type === 'StringLiteral' || e.type === 'TemplateLiteral')) {
          const c = this.first('jsxText');
          if (c) this.add(e.start, e.end, c.bucket, c.rule ?? c.id, []);
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
        push(name);
        break;
      }
      case 'StringLiteral': {
        if (parent?.type === 'ImportDeclaration' || parent?.type === 'JSXAttribute') break;
        const markup = this.first('markupTemplate');
        if (markup && MARKUP.test(node.value) && !this.isKey(node, parent)) {
          this.add(node.start, node.end, markup.bucket, markup.rule ?? markup.id, ['html']);
          break;
        }
        this.copyString(node, parent, node.value);
        break;
      }
      case 'TemplateLiteral': {
        if (parent?.type === 'TaggedTemplateExpression') break;
        const raw = node.quasis.map((q) => q.value.cooked ?? q.value.raw).join(' ');
        const markup = this.first('markupTemplate');
        if (markup && MARKUP.test(raw)) {
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
    if (c.notWithin && this.within(c.notWithin)) return;
    const words = value.trim().split(/\s+/).filter((w) => /\p{L}/u.test(w));
    if (words.length < (c.minWords ?? 3)) return;
    // Prose is mostly plain words. Class lists (`ml-1 w-4 text-gray-500`) and CSS values are not.
    const plain = words.filter((w) => /^\p{L}+[,.!?;:'")]*$/u.test(w)).length;
    if (plain * 2 <= words.length) return;
    this.add(node.start, node.end, c.bucket, c.rule ?? c.id, []);
  }
}

export function classifyAst(source: string, ast: t.File, config: FrameworkConfig): Classified {
  return new RangeBuilder(source, config).run(ast);
}
