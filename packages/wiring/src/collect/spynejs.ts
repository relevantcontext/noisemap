import { AUTO_KEYS, collectTemplateKeys, templateHasSelector } from './content.js';
import type { JsCollected, SpyneClass, SpyneRow } from './js.js';
import type { Edge, Endpoint, Finding, VocabularyEntry, VocabularyUse } from '../types.js';

/** Channels and action prefixes the framework supplies (from the spyne package). */
const FRAMEWORK_CHANNELS = new Set(['CHANNEL_ROUTE', 'CHANNEL_UI', 'CHANNEL_WINDOW', 'CHANNEL_LIFECYCLE']);
const FRAMEWORK_ACTION = /^CHANNEL_(ROUTE|UI|WINDOW|LIFECYCLE)_/;
/** Methods every ViewStream or Channel has; a listener may name them directly. */
const BUILTIN_METHODS = new Set(['disposeViewStream', 'appendView', 'appendViewAfter', 'prependView', 'appendToDom', 'appendToNull', 'sendInfoToChannel', 'sendChannelPayload']);
const ROLE_CLASSES = new Set(['ViewStream', 'DomElement', 'DomItem', 'Channel', 'ChannelFetch', 'SpyneTrait']);

export interface SpyneInputs {
  /** Per module: what its JS declared. */
  collected: ReadonlyMap<string, JsCollected>;
  /** Per module: local import binding → target module path (resolved imports only). */
  bindings: ReadonlyMap<string, ReadonlyMap<string, string>>;
  /** Content of every .html template, by module path. */
  templates: ReadonlyMap<string, string>;
  nextEdgeId: () => string;
}

export interface SpyneOutputs {
  edges: Edge[];
  findings: Finding[];
  vocabulary: VocabularyEntry[];
}

function endpoint(module: string, r: { start: number; end: number }): Endpoint {
  return { module, start: r.start, end: r.end };
}

/** Is the listener row a pattern (glob `*`, regex `.*`, alternation `|`) rather than one name? */
function isPattern(p: string): boolean {
  return /[*|]/.test(p);
}

/**
 * Does `name` match a listener pattern? SpyneJS accepts globs (`CHANGE_*`), regex-style
 * wildcards (`CHANNEL_X_.*_EVENT`), and alternations (`A|B`).
 */
function actionMatches(pattern: string, name: string): boolean {
  return pattern.split('|').some((p) => {
    if (!p.includes('*')) return p === name;
    const body = p.replace(/\.\*/g, '__WILD__').replace(/[.+?^${}()[\]\\]/g, '\\$&').replace(/\*/g, '.*').replace(/__WILD__/g, '.*');
    return new RegExp(`^${body}$`).test(name);
  });
}

export function collectSpyneContracts(input: SpyneInputs): SpyneOutputs {
  const edges: Edge[] = [];
  const findings: Finding[] = [];
  const vocab = new Map<string, VocabularyEntry>();
  const use = (name: string, kind: 'action' | 'channel', u: VocabularyUse): void => {
    let e = vocab.get(name);
    if (!e) {
      e = { name, kind, framework: kind === 'channel' ? FRAMEWORK_CHANNELS.has(name) : FRAMEWORK_ACTION.test(name) || FRAMEWORK_CHANNELS.has(name), uses: [] };
      vocab.set(name, e);
    }
    e.uses.push(u);
  };

  // ---- index: classes by role, channels by name, traits' methods, registrations and emits by action ----
  const classesByModule = input.collected;
  const channelByName = new Map<string, { module: string; cls: SpyneClass }>();
  const registrations = new Map<string, { module: string; row: SpyneRow }[]>();
  const emits = new Map<string, { module: string; row: SpyneRow }[]>();
  const traitMethods = new Map<string, Set<string>>(); // module → static method names of SpyneTrait classes
  const allTraitModulesByMethod = new Map<string, string[]>();
  const fetchChannels = new Set<string>();

  for (const [module, c] of classesByModule) {
    for (const f of c.fetchChannels) if (f.value) {
      fetchChannels.add(f.value);
      channelByName.set(f.value, { module, cls: { name: 'ChannelFetch', extends: 'ChannelFetch', start: f.start, end: f.end, channelName: f.value, traits: [], channels: [], template: null, listeners: [], registrations: [], broadcasts: [], methods: [], emits: [], root: { tagName: null, id: null, classes: [] }, data: null } });
      use(f.value, 'channel', { module, start: f.start, end: f.end, role: 'names' });
    }
    for (const m of c.mentions) if (m.value) use(m.value, 'action', { module, start: m.start, end: m.end, role: 'mentions' });
    for (const cls of c.classes) {
      if (cls.extends === 'Channel' || cls.extends === 'ChannelFetch') {
        if (cls.channelName) {
          channelByName.set(cls.channelName, { module, cls });
          use(cls.channelName, 'channel', { module, start: cls.start, end: cls.end, role: 'names' });
        }
        for (const r of cls.registrations) if (r.action.value) {
          const list = registrations.get(r.action.value) ?? [];
          list.push({ module, row: r.action });
          registrations.set(r.action.value, list);
          use(r.action.value, 'action', { module, start: r.action.start, end: r.action.end, role: 'registers' });
        }
      }
      if (cls.extends === 'SpyneTrait') {
        const set = traitMethods.get(module) ?? new Set<string>();
        for (const m of cls.methods) {
          set.add(m);
          const mods = allTraitModulesByMethod.get(m) ?? [];
          if (!mods.includes(module)) mods.push(module);
          allTraitModulesByMethod.set(m, mods);
        }
        traitMethods.set(module, set);
      }
      for (const e of cls.emits) if (e.value) {
        const list = emits.get(e.value) ?? [];
        list.push({ module, row: e });
        emits.set(e.value, list);
        use(e.value, 'action', { module, start: e.start, end: e.end, role: 'emits' });
      }
    }
  }

  // ---- per class: listener-method, listener-action, channel-binding, broadcast-selector, template-key ----
  for (const [module, c] of classesByModule) {
    const local = input.bindings.get(module) ?? new Map<string, string>();
    for (const cls of c.classes) {
      if (!cls.extends || !ROLE_CLASSES.has(cls.extends)) continue;
      const isChannel = cls.extends === 'Channel' || cls.extends === 'ChannelFetch';
      const boundTraits = cls.traits.map((t) => local.get(t)).filter((m): m is string => m !== undefined);

      const methodTarget = (name: string): { status: Edge['status']; to?: Endpoint; candidates?: string[] } => {
        if (cls.methods.includes(name)) return { status: 'resolved', to: { module } };
        if (BUILTIN_METHODS.has(name)) return { status: 'external' };
        const hits = boundTraits.filter((m) => traitMethods.get(m)?.has(name));
        if (hits.length === 1) return { status: 'resolved', to: { module: hits[0] as string } };
        if (hits.length > 1) return { status: 'ambiguous', candidates: hits };
        const anywhere = allTraitModulesByMethod.get(name) ?? [];
        if (anywhere.length) return { status: 'ambiguous', candidates: anywhere };
        return { status: 'unresolved' };
      };

      const tables = isChannel ? cls.registrations : cls.listeners;
      for (const rowPair of tables) {
        const { action, method } = rowPair;
        if (action.value && !isChannel) {
          if (isPattern(action.value)) {
            // a pattern listens for every registered or emitted name it matches
            const known = new Set([...registrations.keys(), ...emits.keys()]);
            for (const k of known) if (actionMatches(action.value, k)) use(k, 'action', { module, start: action.start, end: action.end, role: 'listens' });
          } else use(action.value, 'action', { module, start: action.start, end: action.end, role: 'listens' });
        }
        if (method?.value) {
          const t = methodTarget(method.value);
          const id = input.nextEdgeId();
          const edge: Edge = { id, kind: 'listener-method', from: endpoint(module, method), label: method.value, status: t.status, verified: 'static' };
          if (t.to) edge.to = t.to;
          if (t.candidates) edge.candidates = t.candidates;
          edges.push(edge);
          if (t.status === 'unresolved') findings.push({ kind: 'unresolved', module, start: method.start, end: method.end, edge: id, message: `${cls.name} names method '${method.value}' that neither it nor a bound trait defines` });
          if (t.status === 'ambiguous') findings.push({ kind: 'ambiguous', module, start: method.start, end: method.end, edge: id, message: `${cls.name} names method '${method.value}' defined in a trait it does not bind`, candidates: t.candidates ?? [] });
        }
        if (action.value && !isChannel) {
          const name = action.value;
          const id = input.nextEdgeId();
          const reg = [...registrations.keys()].filter((k) => actionMatches(name, k));
          const emit = [...emits.keys()].filter((k) => actionMatches(name, k));
          const fromFramework = (p: string): boolean => FRAMEWORK_ACTION.test(p) || [...fetchChannels].some((fc) => p.startsWith(`${fc}_`));
          const fw = name.split('|').every((p) => fromFramework(p.replace(/(\.\*|\*).*$/, '')));
          let status: Edge['status'] = 'unresolved';
          let to: Endpoint | undefined;
          if (reg.length) {
            status = 'resolved';
            const first = registrations.get(reg[0] as string)?.[0];
            if (first) to = endpoint(first.module, first.row);
          } else if (emit.length) {
            status = 'resolved';
            const first = emits.get(emit[0] as string)?.[0];
            if (first) to = endpoint(first.module, first.row);
          } else if (fw) status = 'external';
          const edge: Edge = { id, kind: 'listener-action', from: endpoint(module, action), label: name, status, verified: 'static' };
          if (to) edge.to = to;
          edges.push(edge);
          if (status === 'unresolved') findings.push({ kind: 'unresolved', module, start: action.start, end: action.end, edge: id, message: `${cls.name} listens for '${name}' but no channel registers or emits it` });
        }
      }

      for (const ch of cls.channels) {
        if (!ch.value) continue;
        use(ch.value, 'channel', { module, start: ch.start, end: ch.end, role: 'binds' });
        const id = input.nextEdgeId();
        const target = channelByName.get(ch.value);
        const status: Edge['status'] = target ? 'resolved' : FRAMEWORK_CHANNELS.has(ch.value) ? 'external' : 'unresolved';
        const edge: Edge = { id, kind: 'channel-binding', from: endpoint(module, ch), label: ch.value, status, verified: 'static' };
        if (target) edge.to = { module: target.module, start: target.cls.start, end: target.cls.end };
        edges.push(edge);
        if (status === 'unresolved') findings.push({ kind: 'unresolved', module, start: ch.start, end: ch.end, edge: id, message: `${cls.name} binds channel '${ch.value}' but no Channel class names itself that` });
      }

      // template: identifier through imports, or inline
      let templateModule: string | null = null;
      let templateHtml: string | null = null;
      if (cls.template?.kind === 'identifier') {
        const m = local.get(cls.template.name);
        if (m && input.templates.has(m)) {
          templateModule = m;
          templateHtml = input.templates.get(m) as string;
        }
      } else if (cls.template?.kind === 'inline') templateHtml = cls.template.source;

      for (const b of cls.broadcasts) {
        if (!b.selector.value) continue;
        const id = input.nextEdgeId();
        let status: Edge['status'] = 'unresolved';
        const rootTag = cls.root.tagName ?? 'div';
        const rootEl = `<${rootTag}${cls.root.id ? ` id="${cls.root.id}"` : ''}${cls.root.classes.length ? ` class="${cls.root.classes.join(' ')}"` : ''}>`;
        if (templateHtml !== null) status = templateHasSelector(`${rootEl}${templateHtml}</${rootTag}>`, b.selector.value) ? 'resolved' : 'unresolved';
        else if (cls.template === null && templateHasSelector(`${rootEl}</${rootTag}>`, b.selector.value)) status = 'resolved';
        else if (cls.template === null || cls.template.kind === 'opaque') status = 'unknown'; // no static template: children or data supply the elements; internal, unmodeled
        const edge: Edge = { id, kind: 'broadcast-selector', from: endpoint(module, b.selector), label: b.selector.value, status, verified: 'static' };
        if (status === 'resolved' && templateModule) edge.to = { module: templateModule };
        if (status === 'resolved' && !templateModule) edge.to = { module };
        edges.push(edge);
        if (status === 'unresolved') findings.push({ kind: 'unresolved', module, start: b.selector.start, end: b.selector.end, edge: id, message: `${cls.name} broadcasts on '${b.selector.value}' but its template has no element matching it (child views may supply one)` });
      }

      if (templateModule && templateHtml !== null) {
        // Template keys against the data the class declares (2026-09-27; before this the binding was
        // marked resolved on finding the file). Only top-level keys can be checked: a key inside a
        // section names a property of that section's items, which the data's shape decides at runtime.
        const keys = collectTemplateKeys(templateHtml);
        // A section key is optional by the engine's semantics: absent or falsy, the block is omitted
        // (DomElementTemplate reference). Only top-level value keys are required bindings (review 2, 2.2).
        const top = [...new Set(keys.filter((k) => k.scope === null && k.kind === 'value' && !AUTO_KEYS.has(k.key)).map((k) => k.key))];
        const id = input.nextEdgeId();
        const edge: Edge = { id, kind: 'template-key', from: { module }, to: { module: templateModule }, label: '', status: 'unknown', verified: 'static' };
        if (cls.data === null) edge.label = `${String(top.length)} keys, data supplied by the constructor's caller`;
        else if (cls.data.kind === 'computed') edge.label = `${String(top.length)} keys, data computed`;
        else {
          const declared = new Set(cls.data.keys);
          const missing = top.filter((k) => !declared.has(k));
          if (missing.length === 0) {
            edge.status = 'resolved';
            edge.label = `${String(top.length)} keys verified against props.data`;
          } else {
            edge.status = 'unresolved';
            edge.label = `${String(missing.length)} of ${String(top.length)} keys not in props.data: ${missing.join(', ')}`;
            const first = keys.find((k) => k.key === missing[0] && k.scope === null);
            findings.push({ kind: 'unresolved', module: templateModule, start: first?.start ?? 0, end: first?.end ?? 0, edge: id, message: `${cls.name} declares props.data without ${missing.map((k) => `'${k}'`).join(', ')}, which its template uses` });
          }
        }
        edges.push(edge);
      }
    }
  }

  // ---- action registered but nobody listens ----
  for (const [name, regs] of registrations) {
    const listened = [...vocab.get(name)?.uses ?? []].some((u) => u.role === 'listens' || u.role === 'mentions');
    for (const r of regs) {
      const id = input.nextEdgeId();
      const edge: Edge = { id, kind: 'action-registration', from: endpoint(r.module, r.row), label: name, status: listened ? 'resolved' : 'unresolved', verified: 'static' };
      const firstListener = vocab.get(name)?.uses.find((u) => u.role === 'listens' || u.role === 'mentions');
      if (firstListener) edge.to = { module: firstListener.module, start: firstListener.start, end: firstListener.end };
      edges.push(edge);
      if (!listened) findings.push({ kind: 'unresolved', module: r.module, start: r.row.start, end: r.row.end, edge: id, message: `'${name}' is registered but nothing listens for it or mentions it` });
    }
  }

  const vocabulary = [...vocab.values()].sort((a, b) => a.name.localeCompare(b.name));
  return { edges, findings, vocabulary };
}
