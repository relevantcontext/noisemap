import type * as t from '@babel/types';
import { parseSource } from '@noisemap/js-classify';
import type { Site, SiteKind } from '../types.js';

export interface ImportRef {
  specifier: string;
  start: number;
  end: number;
  dynamic: boolean;
  /** Local binding names this import introduces, with the exported name (`default`, `*`, or the name). */
  bindings: { local: string; imported: string }[];
}

export interface SpyneRow {
  start: number;
  end: number;
  /** Literal value, or null when computed. */
  value: string | null;
}

/** What a SpyneJS class declares: its role by `extends`, its name, its traits, channels, template, tables, methods, and emits. */
export interface SpyneClass {
  name: string;
  extends: string | null;
  start: number;
  end: number;
  /** `name = 'CHANNEL_X'` in a Channel constructor. */
  channelName: string | null;
  /** Identifiers in `props.traits = [...]`. */
  traits: string[];
  /** `props.channels` entries. */
  channels: SpyneRow[];
  /** `props.template = X`: an identifier (resolved through imports) or an inline string. */
  template: { kind: 'identifier'; name: string } | { kind: 'inline'; source: string } | { kind: 'opaque' } | null;
  /** addActionListeners rows: [action, method]. */
  listeners: { action: SpyneRow; method: SpyneRow | null }[];
  /** addRegisteredActions rows: [action, method?]. */
  registrations: { action: SpyneRow; method: SpyneRow | null }[];
  /** broadcastEvents rows: [selector, event]. */
  broadcasts: { selector: SpyneRow; event: SpyneRow | null }[];
  /** Method names defined on the class (static and instance). */
  methods: string[];
  /** sendChannelPayload / sendInfoToChannel first arguments. */
  emits: SpyneRow[];
  /** The view's own root element: props.tagName, props.id, props.class. */
  root: { tagName: string | null; id: string | null; classes: string[] };
  /**
   * What the class declares for its template: literal keys assigned to `props.data`, or
   * `computed` when it assigns something the collector cannot read. Null when the class never
   * assigns `props.data`, so the data arrives from whoever constructs it.
   */
  data: { kind: 'literal'; keys: string[] } | { kind: 'computed' } | null;
}

/** How a JSX attribute value or a handler reference is written. */
export type ValueRef =
  | { kind: 'inline' }
  | { kind: 'identifier'; name: string }
  | { kind: 'member'; chain: string }
  | { kind: 'literal'; value: string }
  | { kind: 'spread' }
  | { kind: 'opaque'; reason: string };

export interface JsxAttr {
  name: string;
  value: ValueRef;
  start: number;
  end: number;
}

export interface JsxUse {
  /** Local tag name (`Button`, `Ctx.Provider`, `div`). */
  tag: string;
  isComponent: boolean;
  start: number;
  end: number;
  attrs: JsxAttr[];
}

export interface ReactComponent {
  name: string;
  start: number;
  end: number;
  /** Prop names when destructured (`{ onSave, ...rest }`), or the props identifier, or none. */
  params: { kind: 'destructured'; names: string[]; rest: boolean } | { kind: 'identifier'; name: string } | { kind: 'none' };
  exported: 'default' | 'named' | null;
}

export interface ReactFacts {
  components: ReactComponent[];
  /**
   * Function-valued declarations by name: `function f`, `const f = () =>`, `const f = useCallback(…)`,
   * `const f = g.bind(…)`. A name destructured from a call (`const [s, act] = useActionState(fn)`,
   * `const { undo } = useEdits()`) carries `from`: the callee, and its first argument when it names one.
   */
  locals: { name: string; start: number; end: number; from?: { callee: string; firstArg: string | null } }[];
  jsx: JsxUse[];
  /** `dispatch({ type: X })` and `dispatch(X)`: the type as a literal or an identifier. */
  dispatches: { value: ValueRef; start: number; end: number }[];
  /** `case X:` tests in switch statements, with the switch discriminant's source text. */
  cases: { value: ValueRef; start: number; end: number; discriminant: string }[];
  contexts: { created: { name: string; start: number; end: number }[]; consumed: { name: string; start: number; end: number }[] };
  /** Route path literals: href, router.push/replace, redirect, Link. Template expressions become `*`. */
  routes: { path: string; start: number; end: number }[];
  /** Names this module exports, with `default` for the default export. */
  exports: string[];
}

/** What a JS/TS module declares for the wiring: its import specifiers and its connection sites. */
export interface JsCollected {
  imports: ImportRef[];
  sites: Site[];
  classes: SpyneClass[];
  /** Channel names created inline: `new ChannelFetch('CHANNEL_X', …)`. */
  fetchChannels: SpyneRow[];
  /** Every `'CHANNEL_…'` string literal outside the structured tables, with its position. */
  mentions: SpyneRow[];
  react: ReactFacts;
  /** Boot calls seen: `new SpyneApp(`, `createRoot(`, `hydrateRoot(`, `ReactDOM.render(`. */
  boots: string[];
  /** Simple `const NAME = 'literal'` bindings at module scope, for action-name resolution later. */
  constants: Record<string, string>;
}

const SKIP = new Set(['loc', 'range', 'extra', 'comments', 'leadingComments', 'trailingComments', 'innerComments', 'tokens', 'errors']);
const DISPATCH = /(^|\.)(dispatch|emit|sendChannelPayload|sendInfoToChannel|publish|trigger|next)$/;
const CONTEXT = /(^|\.)(useContext|use)$/;
const STORE = /(^|\.)(useSelector|useStore|useAtom|useAtomValue|useSnapshot|getProp|getProps|getState|getItem)$/;
const BOOT = /^(new SpyneApp|SpyneApp\.init|createRoot|hydrateRoot|ReactDOM\.render|render)$/;

type Node = t.Node;

function memberChain(n: Node): string | null {
  if (n.type === 'Identifier') return n.name;
  if (n.type === 'ThisExpression') return 'this';
  if (n.type === 'MemberExpression' && !n.computed) {
    const o = memberChain(n.object);
    return o && n.property.type === 'Identifier' ? `${o}.${n.property.name}` : null;
  }
  return null;
}

/** Why a value cannot be followed, or null when it is a plain name/literal. */
function opaqueReason(n: Node | null | undefined): string | null {
  if (!n) return null;
  switch (n.type) {
    case 'Identifier':
    case 'ThisExpression':
    case 'StringLiteral':
    case 'NumericLiteral':
    case 'BooleanLiteral':
    case 'NullLiteral':
    case 'ArrowFunctionExpression':
    case 'FunctionExpression':
    case 'JSXElement':
    case 'JSXFragment':
    case 'ArrayExpression':
    case 'ObjectExpression':
      return null;
    case 'MemberExpression':
      return n.computed ? 'computed member' : opaqueReason(n.object);
    case 'OptionalMemberExpression':
      return n.computed ? 'computed member' : opaqueReason(n.object);
    case 'TemplateLiteral':
      return n.expressions.length ? 'template with expressions' : null;
    case 'CallExpression':
    case 'OptionalCallExpression':
    case 'NewExpression':
      return 'call result used as a name';
    case 'ConditionalExpression':
      return opaqueReason(n.consequent) ?? opaqueReason(n.alternate);
    case 'LogicalExpression':
      return opaqueReason(n.left) ?? opaqueReason(n.right);
    case 'TSAsExpression':
    case 'TSSatisfiesExpression':
    case 'TSNonNullExpression':
    case 'ParenthesizedExpression':
      return opaqueReason(n.expression);
    case 'SpreadElement':
    case 'JSXSpreadAttribute':
      return 'spread';
    default:
      return n.type;
  }
}

/**
 * The name a call site states for what it invokes, or null when it cannot be named: a
 * computed property (`obj[name]()`), a call result invoked directly (`getFn()()`), a
 * conditional or logical callee. A method called on any expression is named by its
 * property: `getEl().focus()` states `focus`.
 */
function calleeName(callee: Node): string | null {
  const chain = memberChain(callee);
  if (chain) return chain;
  if (callee.type === 'Super') return 'super';
  if ((callee.type === 'MemberExpression' || callee.type === 'OptionalMemberExpression') && !callee.computed && callee.property.type === 'Identifier') {
    const inner = calleeName(callee.object);
    return `${inner ?? '(…)'}.${callee.property.name}`;
  }
  if (callee.type === 'StringLiteral' || callee.type === 'TemplateLiteral' || callee.type === 'RegExpLiteral' || callee.type === 'ArrayExpression' || callee.type === 'TaggedTemplateExpression' || callee.type === 'CallExpression' || callee.type === 'OptionalCallExpression' || callee.type === 'NewExpression') return '(…)';
  if (callee.type === 'TSAsExpression' || callee.type === 'TSNonNullExpression' || callee.type === 'ParenthesizedExpression') return calleeName(callee.expression);
  return null;
}

function calleeOpaqueReason(callee: Node): string {
  if ((callee.type === 'MemberExpression' || callee.type === 'OptionalMemberExpression') && callee.computed) return 'computed member';
  if (callee.type === 'CallExpression' || callee.type === 'OptionalCallExpression') return 'call result invoked';
  return opaqueReason(callee) ?? 'computed callee';
}

function isComponentTag(name: t.JSXOpeningElement['name']): boolean {
  if (name.type === 'JSXIdentifier') return /^[A-Z]/.test(name.name);
  if (name.type === 'JSXMemberExpression') return true;
  return false;
}

export function collectJs(modulePath: string, source: string, ext: string): JsCollected {
  const out: JsCollected = { imports: [], sites: [], classes: [], fetchChannels: [], mentions: [], boots: [], constants: {}, react: { components: [], locals: [], jsx: [], dispatches: [], cases: [], contexts: { created: [], consumed: [] }, routes: [], exports: [] } };
  const structured = new Set<number>();
  const R = out.react;
  const valueRef = (v: Node | null | undefined): ValueRef => {
    if (!v) return { kind: 'opaque', reason: 'no value' };
    if (v.type === 'ArrowFunctionExpression' || v.type === 'FunctionExpression') return { kind: 'inline' };
    if (v.type === 'StringLiteral') return { kind: 'literal', value: v.value };
    if (v.type === 'TemplateLiteral') return v.expressions.length ? { kind: 'literal', value: v.quasis.map((q) => q.value.cooked ?? q.value.raw).join('*') } : { kind: 'literal', value: v.quasis.map((q) => q.value.cooked ?? q.value.raw).join('') };
    if (v.type === 'Identifier') return { kind: 'identifier', name: v.name };
    if (v.type === 'JSXExpressionContainer') return valueRef(v.expression);
    if (v.type === 'TSAsExpression' || v.type === 'TSNonNullExpression' || v.type === 'ParenthesizedExpression') return valueRef(v.expression);
    const chain = memberChain(v);
    if (chain) return { kind: 'member', chain };
    return { kind: 'opaque', reason: opaqueReason(v) ?? v.type };
  };
  const paramsOf = (fn: t.Function): ReactComponent['params'] => {
    const p0 = fn.params[0];
    if (!p0) return { kind: 'none' };
    const target = p0.type === 'AssignmentPattern' ? p0.left : p0.type === 'TSParameterProperty' ? p0.parameter : p0;
    if (target.type === 'Identifier') return { kind: 'identifier', name: target.name };
    if (target.type === 'ObjectPattern') {
      const names: string[] = [];
      let rest = false;
      for (const prop of target.properties) {
        if (prop.type === 'RestElement') rest = true;
        else if (prop.key.type === 'Identifier') names.push(prop.key.name);
        else if (prop.key.type === 'StringLiteral') names.push(prop.key.value);
      }
      return { kind: 'destructured', names, rest };
    }
    return { kind: 'none' };
  };
  const containsJsx = (n: Node): boolean => {
    let found = false;
    const walk = (x: unknown): void => {
      if (found || !x || typeof x !== 'object') return;
      if (Array.isArray(x)) { for (const y of x) walk(y); return; }
      const nn = x as Node;
      if (typeof nn.type !== 'string') return;
      if (nn.type === 'JSXElement' || nn.type === 'JSXFragment') { found = true; return; }
      for (const [k, v] of Object.entries(nn)) if (!SKIP.has(k)) walk(v);
    };
    walk(n);
    return found;
  };
  const exportedAs = (parent: Node | null): 'default' | 'named' | null => parent?.type === 'ExportDefaultDeclaration' ? 'default' : parent?.type === 'ExportNamedDeclaration' ? 'named' : null;
  const registerComponent = (name: string, fn: t.Function, node: Node, exported: 'default' | 'named' | null): void => {
    if (!/^[A-Z]/.test(name) || !containsJsx(fn)) return;
    R.components.push({ name, start: node.start ?? 0, end: node.end ?? 0, params: paramsOf(fn), exported });
  };
  const classStack: SpyneClass[] = [];
  const row = (n: Node | null | undefined): SpyneRow | null => (n ? { start: n.start ?? 0, end: n.end ?? 0, value: n.type === 'StringLiteral' ? n.value : n.type === 'Identifier' && out.constants[n.name] !== undefined ? (out.constants[n.name] as string) : null } : null);
  const { ast } = parseSource(source, ext);
  const text = (n: Node): string => source.slice(n.start ?? 0, n.end ?? 0);
  const site = (n: Node, kind: SiteKind, cls: 'declared' | 'opaque', label: string): void => {
    out.sites.push({ module: modulePath, start: n.start ?? 0, end: n.end ?? 0, kind, class: cls, label });
  };
  const nameSite = (n: Node, kind: SiteKind, valueNode: Node | null | undefined, declaredLabel: string): void => {
    const why = opaqueReason(valueNode);
    if (why) site(n, kind, 'opaque', why);
    else site(n, kind, 'declared', declaredLabel);
  };

  const grandParents = new WeakMap<Node, Node>();
  const visit = (n: unknown, parent: Node | null): void => {
    if (!n || typeof n !== 'object') return;
    if (Array.isArray(n)) {
      for (const x of n) visit(x, parent);
      return;
    }
    const node = n as Node;
    if (typeof node.type !== 'string') return;
    if (parent) grandParents.set(node, parent);

    switch (node.type) {
      case 'ImportDeclaration': {
        const bindings = node.specifiers.map((sp) => ({
          local: sp.local.name,
          imported: sp.type === 'ImportDefaultSpecifier' ? 'default' : sp.type === 'ImportNamespaceSpecifier' ? '*' : sp.imported.type === 'Identifier' ? sp.imported.name : sp.imported.value,
        }));
        out.imports.push({ specifier: node.source.value, start: node.source.start ?? 0, end: node.source.end ?? 0, dynamic: false, bindings });
        site(node.source, 'import', 'declared', node.source.value);
        break;
      }
      case 'ExportNamedDeclaration':
      case 'ExportAllDeclaration':
        if (node.source) {
          out.imports.push({ specifier: node.source.value, start: node.source.start ?? 0, end: node.source.end ?? 0, dynamic: false, bindings: [] });
          site(node.source, 'import', 'declared', node.source.value);
        }
        if (node.type === 'ExportNamedDeclaration') {
          if (node.declaration?.type === 'VariableDeclaration') for (const d of node.declaration.declarations) if (d.id.type === 'Identifier') R.exports.push(d.id.name);
          if ((node.declaration?.type === 'FunctionDeclaration' || node.declaration?.type === 'ClassDeclaration') && node.declaration.id) R.exports.push(node.declaration.id.name);
          for (const sp of node.specifiers) if (sp.type === 'ExportSpecifier') R.exports.push(sp.exported.type === 'Identifier' ? sp.exported.name : sp.exported.value);
        }
        break;
      case 'ImportExpression': {
        const src = node.source;
        if (src.type === 'StringLiteral') {
          out.imports.push({ specifier: src.value, start: src.start ?? 0, end: src.end ?? 0, dynamic: true, bindings: [] });
          site(src, 'import', 'declared', src.value);
        } else site(node, 'import', 'opaque', opaqueReason(src) ?? 'dynamic import');
        break;
      }
      case 'FunctionDeclaration': {
        if (node.id) {
          R.locals.push({ name: node.id.name, start: node.start ?? 0, end: node.end ?? 0 });
          registerComponent(node.id.name, node, node, exportedAs(parent));
        }
        break;
      }
      case 'ExportDefaultDeclaration': {
        const d = node.declaration;
        if (d.type === 'Identifier') R.exports.push('default', d.name);
        else R.exports.push('default');
        break;
      }
      case 'SwitchStatement': {
        const disc = memberChain(node.discriminant) ?? text(node.discriminant);
        for (const sc of node.cases) if (sc.test) R.cases.push({ value: valueRef(sc.test), start: sc.test.start ?? 0, end: sc.test.end ?? 0, discriminant: disc });
        break;
      }
      case 'ClassDeclaration':
      case 'ClassExpression': {
        const sup = node.superClass;
        const ext = sup ? (sup.type === 'Identifier' ? sup.name : sup.type === 'MemberExpression' && sup.property.type === 'Identifier' ? sup.property.name : null) : null;
        const cls: SpyneClass = { name: node.id?.name ?? '(anonymous)', extends: ext, start: node.start ?? 0, end: node.end ?? 0, channelName: null, traits: [], channels: [], template: null, listeners: [], registrations: [], broadcasts: [], methods: [], emits: [], root: { tagName: null, id: null, classes: [] }, data: null };
        for (const m of node.body.body) if ((m.type === 'ClassMethod' || m.type === 'ClassPrivateMethod' || m.type === 'ClassProperty') && m.key.type === 'Identifier') cls.methods.push(m.key.name);
        out.classes.push(cls);
        classStack.push(cls);
        for (const [k, v] of Object.entries(node)) if (!SKIP.has(k)) visit(v, node);
        classStack.pop();
        return;
      }
      case 'VariableDeclarator': {
        if (parent?.type === 'VariableDeclaration' && node.id.type === 'Identifier' && node.init?.type === 'StringLiteral') out.constants[node.id.name] = node.init.value;
        if ((node.id.type === 'ArrayPattern' || node.id.type === 'ObjectPattern') && node.init && (node.init.type === 'CallExpression' || node.init.type === 'AwaitExpression')) {
          const call = node.init.type === 'AwaitExpression' ? node.init.argument : node.init;
          if (call.type === 'CallExpression') {
            const callee = memberChain(call.callee) ?? text(call.callee);
            const first = call.arguments[0];
            const firstArg = first ? (memberChain(first) ?? null) : null;
            const names: string[] = [];
            if (node.id.type === 'ArrayPattern') for (const el of node.id.elements) if (el?.type === 'Identifier') names.push(el.name);
            if (node.id.type === 'ObjectPattern') for (const pr of node.id.properties) if (pr.type === 'ObjectProperty' && pr.value.type === 'Identifier') names.push(pr.value.name);
            for (const n of names) R.locals.push({ name: n, start: node.start ?? 0, end: node.end ?? 0, from: { callee, firstArg } });
          }
        }
        if (node.id.type === 'Identifier' && node.init) {
          const init = node.init;
          let fn: t.Function | null = null;
          if (init.type === 'ArrowFunctionExpression' || init.type === 'FunctionExpression') fn = init;
          else if ((init.type === 'CallExpression') && (init.arguments[0]?.type === 'ArrowFunctionExpression' || init.arguments[0]?.type === 'FunctionExpression')) fn = init.arguments[0];
          const bound = init.type === 'CallExpression' && (memberChain(init.callee) ?? '').endsWith(".bind");
          if (bound) R.locals.push({ name: node.id.name, start: node.start ?? 0, end: node.end ?? 0 });
          if (fn) {
            R.locals.push({ name: node.id.name, start: node.start ?? 0, end: node.end ?? 0 });
            const grand = parent?.type === 'VariableDeclaration' ? grandParents.get(parent) ?? null : null;
            registerComponent(node.id.name, fn, node, exportedAs(grand));
          }
          if (init.type === 'CallExpression' && /(^|\.)createContext$/.test(memberChain(init.callee) ?? '')) R.contexts.created.push({ name: node.id.name, start: node.start ?? 0, end: node.end ?? 0 });
        }
        break;
      }
      case 'StringLiteral':
        if (/^CHANNEL_[A-Z0-9_]+$/.test(node.value) && !structured.has(node.start ?? -1) && parent?.type !== 'ImportDeclaration') out.mentions.push({ start: node.start ?? 0, end: node.end ?? 0, value: node.value });
        break;
      case 'CallExpression':
      case 'OptionalCallExpression':
      case 'NewExpression': {
        const callee = node.callee;
        if (callee.type === 'Import') break; // handled as ImportExpression in older parsers
        if (callee.type === 'Identifier' && callee.name === 'require' && node.arguments[0]?.type === 'StringLiteral') {
          const a = node.arguments[0];
          out.imports.push({ specifier: a.value, start: a.start ?? 0, end: a.end ?? 0, dynamic: false, bindings: [] });
          site(a, 'import', 'declared', a.value);
          break;
        }
        const chain = callee.type === 'Super' ? 'super' : memberChain(callee);
        const calleeLabel = (node.type === 'NewExpression' ? 'new ' : '') + (chain ?? text(callee));
        if (BOOT.test(calleeLabel)) out.boots.push(calleeLabel);
        const named0 = calleeName(callee);
        const named = named0 === '(…)' ? null : named0;
        if (named === null) {
          site(callee, 'call', 'opaque', calleeOpaqueReason(callee));
        } else if (chain !== 'super') {
          site(callee, 'call', 'declared', (node.type === 'NewExpression' ? 'new ' : '') + named);
        }
        if (chain && /(^|\.)(sendChannelPayload|sendInfoToChannel)$/.test(chain) && node.arguments[0] && classStack.length) {
          const a = node.arguments[0] as Node;
          (classStack[classStack.length - 1] as SpyneClass).emits.push(row(a) as SpyneRow);
          structured.add(a.start ?? -1);
        }
        if (node.type === 'NewExpression' && chain === 'ChannelFetch' && node.arguments[0]?.type === 'StringLiteral') {
          const a = node.arguments[0];
          out.fetchChannels.push(row(a) as SpyneRow);
          structured.add(a.start ?? -1);
        }
        if (chain && /(^|\.)useContext$/.test(chain) && node.arguments[0]) {
          const a = node.arguments[0] as Node;
          const nm = memberChain(a);
          if (nm) R.contexts.consumed.push({ name: nm, start: node.start ?? 0, end: node.end ?? 0 });
        }
        if (chain && /(^|\.)dispatch$/.test(chain) && node.arguments[0]) {
          const a = node.arguments[0] as Node;
          if (a.type === 'ObjectExpression') {
            const tp = a.properties.find((pp) => pp.type === 'ObjectProperty' && ((pp.key.type === 'Identifier' && pp.key.name === 'type') || (pp.key.type === 'StringLiteral' && pp.key.value === 'type')));
            if (tp?.type === 'ObjectProperty') R.dispatches.push({ value: valueRef(tp.value), start: tp.value.start ?? 0, end: tp.value.end ?? 0 });
          } else R.dispatches.push({ value: valueRef(a), start: a.start ?? 0, end: a.end ?? 0 });
        }
        if (chain && /(^|\.)(push|replace|redirect|permanentRedirect|navigate)$/.test(chain) && node.arguments[0]) {
          const v = valueRef(node.arguments[0]);
          if (v.kind === 'literal' && v.value.startsWith('/')) R.routes.push({ path: v.value, start: node.arguments[0].start ?? 0, end: node.arguments[0].end ?? 0 });
        }
        if (chain && CONTEXT.test(chain)) site(node, 'context', 'opaque', 'context lookup');
        else if (chain && STORE.test(chain)) site(node, 'store', 'opaque', 'value read from a store');
        else if (chain && DISPATCH.test(chain) && node.arguments.length) {
          const a = node.arguments[0] as Node;
          if (a.type === 'ObjectExpression') {
            const typeProp = a.properties.find((p) => p.type === 'ObjectProperty' && ((p.key.type === 'Identifier' && (p.key.name === 'type' || p.key.name === 'action')) || (p.key.type === 'StringLiteral' && (p.key.value === 'type' || p.key.value === 'action'))));
            if (typeProp?.type === 'ObjectProperty') nameSite(a, 'dispatch', typeProp.value, text(typeProp.value));
            else site(a, 'dispatch', 'opaque', 'payload without a literal type');
          } else if (a.type === 'Identifier' && out.constants[a.name] === undefined) site(a, 'dispatch', 'opaque', 'action from a variable');
          else nameSite(a, 'dispatch', a, a.type === 'Identifier' ? (out.constants[a.name] as string) : text(a));
        }
        break;
      }
      case 'JSXOpeningElement': {
        {
          const tag = node.name.type === 'JSXIdentifier' ? node.name.name : node.name.type === 'JSXMemberExpression' ? text(node.name) : text(node.name);
          const use: JsxUse = { tag, isComponent: isComponentTag(node.name), start: node.start ?? 0, end: node.end ?? 0, attrs: [] };
          for (const attr of node.attributes) {
            if (attr.type === 'JSXSpreadAttribute') use.attrs.push({ name: '...', value: { kind: 'spread' }, start: attr.start ?? 0, end: attr.end ?? 0 });
            else {
              const name = attr.name.type === 'JSXIdentifier' ? attr.name.name : `${attr.name.namespace.name}:${attr.name.name.name}`;
              use.attrs.push({ name, value: valueRef(attr.value), start: attr.start ?? 0, end: attr.end ?? 0 });
              if (name === 'href' && attr.value) { const v = valueRef(attr.value); if (v.kind === 'literal' && v.value.startsWith('/')) R.routes.push({ path: v.value, start: attr.value.start ?? 0, end: attr.value.end ?? 0 }); }
            }
          }
          R.jsx.push(use);
        }
        if (!isComponentTag(node.name)) {
          for (const attr of node.attributes) {
            if (attr.type === 'JSXAttribute' && attr.name.type === 'JSXIdentifier' && /^on[A-Z]/.test(attr.name.name)) {
              const v = attr.value?.type === 'JSXExpressionContainer' ? attr.value.expression : attr.value;
              nameSite(attr, 'handler', v, memberChain(v as Node) ?? 'inline');
            }
          }
          break;
        }
        for (const attr of node.attributes) {
          if (attr.type === 'JSXSpreadAttribute') {
            site(attr, 'prop', 'opaque', 'spread');
            continue;
          }
          const v = attr.value?.type === 'JSXExpressionContainer' ? attr.value.expression : attr.value;
          const name = attr.name.type === 'JSXIdentifier' ? attr.name.name : `${attr.name.namespace.name}:${attr.name.name.name}`;
          if (/^on[A-Z]/.test(name)) nameSite(attr, 'handler', v, `${name}=${memberChain(v as Node) ?? 'inline'}`);
          else site(attr, 'prop', 'declared', name);
        }
        break;
      }
      case 'AssignmentExpression': {
        // SpyneJS config: props.channels = [...], props.traits = [...], props.template = X, name = 'CHANNEL_X'
        const left = memberChain(node.left);
        const cls = classStack[classStack.length - 1];
        if (cls && (left === 'name' || left === 'props.name') && node.right.type === 'StringLiteral') {
          cls.channelName = node.right.value;
          structured.add(node.right.start ?? -1);
        }
        if (cls && node.right.type === 'StringLiteral') {
          if (left === 'props.tagName') cls.root.tagName = node.right.value.toLowerCase();
          if (left === 'props.id') cls.root.id = node.right.value;
          if (left === 'props.class' || left === 'props.className') cls.root.classes = node.right.value.split(/\s+/).filter(Boolean);
        }
        if (cls && (left === 'props.data' || left === 'this.props.data')) {
          const r = node.right;
          if (r.type === 'ObjectExpression' && r.properties.every((pr) => pr.type === 'ObjectProperty' && (pr.key.type === 'Identifier' || pr.key.type === 'StringLiteral'))) {
            const keys = r.properties.map((pr) => { const k = (pr as { key: { name?: string; value?: string } }).key; return k.name ?? k.value ?? ''; });
            cls.data = cls.data?.kind === 'literal' ? { kind: 'literal', keys: [...new Set([...cls.data.keys, ...keys])] } : { kind: 'literal', keys };
          } else cls.data = { kind: 'computed' };
        }
        if (cls && left && /^(this\.)?props\.data\.[A-Za-z_$][\w$]*$/.test(left)) {
          const key = left.split('.').pop() as string;
          if (cls.data === null) cls.data = { kind: 'literal', keys: [key] };
          else if (cls.data.kind === 'literal' && !cls.data.keys.includes(key)) cls.data.keys.push(key);
        }
        if (cls && (left === 'props.traits' || left === 'this.props.traits') && node.right.type === 'ArrayExpression') {
          for (const el of node.right.elements) if (el?.type === 'Identifier') cls.traits.push(el.name);
        }
        if (cls && (left === 'props.template' || left === 'this.props.template')) {
          const r = node.right;
          cls.template = r.type === 'Identifier' ? { kind: 'identifier', name: r.name } : r.type === 'StringLiteral' ? { kind: 'inline', source: r.value } : r.type === 'TemplateLiteral' && r.expressions.length === 0 ? { kind: 'inline', source: r.quasis.map((q) => q.value.cooked ?? q.value.raw).join('') } : { kind: 'opaque' };
        }
        if (cls && (left === 'props.channels' || left === 'this.props.channels')) {
          if (node.right.type === 'ArrayExpression') for (const el of node.right.elements) { const target = el?.type === 'ArrayExpression' ? el.elements[0] : el; if (target) { cls.channels.push(row(target) as SpyneRow); structured.add(target.start ?? -1); } }
          else { cls.channels.push(row(node.right) as SpyneRow); structured.add(node.right.start ?? -1); }
        }
        if (left === 'props.channels' || left === 'this.props.channels') {
          if (node.right.type === 'ArrayExpression') {
            for (const el of node.right.elements) {
              const target = el?.type === 'ArrayExpression' ? el.elements[0] : el;
              if (target?.type === 'StringLiteral') site(target, 'channel', 'declared', target.value);
              else if (target) site(target, 'channel', 'opaque', opaqueReason(target) ?? 'computed channel name');
            }
          } else if (node.right.type === 'StringLiteral') site(node.right, 'channel', 'declared', node.right.value);
          else site(node.right, 'channel', 'opaque', opaqueReason(node.right) ?? 'computed');
        }
        break;
      }
      case 'ClassMethod': {
        const key = node.key.type === 'Identifier' ? node.key.name : null;
        const cls = classStack[classStack.length - 1];
        if (key === 'addActionListeners' || key === 'addRegisteredActions' || key === 'broadcastEvents') {
          // Each row: [ACTION, methodName, filter?] or a bare ACTION string; broadcastEvents rows: [selector, event]
          const ret = node.body.body.find((s): s is t.ReturnStatement => s.type === 'ReturnStatement');
          const arr = ret?.argument?.type === 'ArrayExpression' ? ret.argument : null;
          if (arr) {
            for (const r of arr.elements) {
              if (!r) continue;
              if (r.type === 'StringLiteral') {
                structured.add(r.start ?? -1);
                site(r, 'listener', 'declared', r.value);
                if (cls && key === 'addRegisteredActions') cls.registrations.push({ action: row(r) as SpyneRow, method: null });
              } else if (r.type === 'ArrayExpression') {
                const [first, second] = r.elements;
                structured.add(first?.start ?? -1);
                structured.add(second?.start ?? -1);
                if (first?.type === 'StringLiteral') site(first, 'listener', 'declared', first.value);
                else if (first) site(first, 'listener', 'opaque', opaqueReason(first) ?? 'computed action');
                if (second?.type === 'StringLiteral') site(second, 'listener', 'declared', second.value);
                else if (second) site(second, 'listener', 'opaque', opaqueReason(second) ?? 'computed method');
                if (cls && first) {
                  const entry = { action: row(first) as SpyneRow, method: second ? row(second) : null };
                  if (key === 'addActionListeners') cls.listeners.push(entry);
                  else if (key === 'addRegisteredActions') cls.registrations.push(entry);
                  else cls.broadcasts.push({ selector: entry.action, event: entry.method });
                }
              } else site(r, 'listener', 'opaque', opaqueReason(r) ?? 'computed row');
            }
          } else if (ret?.argument) site(ret.argument, 'listener', 'opaque', 'table not a literal array');
        }
        break;
      }
      default:
        break;
    }
    for (const [k, v] of Object.entries(node)) if (!SKIP.has(k)) visit(v, node);
  };
  visit(ast.program, null);
  out.sites.sort((a, b) => a.start - b.start);
  return out;
}
