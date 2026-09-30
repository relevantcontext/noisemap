import { fileURLToPath } from 'node:url';
import Ajv2020 from 'ajv/dist/2020.js';
import addFormats from 'ajv-formats';
import { describe, expect, it } from 'vitest';
import { analyzeWiring } from './analyze.js';
import { parseJsonc } from './config.js';
import schema from '../schema/noisemap-wiring.schema.json' with { type: 'json' };

const ROOT = fileURLToPath(new URL('../../../fixtures/wiring-sample/src', import.meta.url));

describe('wiring: resolution by trial, aliases, entries', () => {
  const run = () => analyzeWiring(ROOT, { toolVersion: '0.0.0-test', now: () => new Date('2026-09-26T00:00:00Z') });

  it('parses tsconfig with comments and trailing commas', () => {
    expect(parseJsonc('{ // c\n "a": [1,2,], /* b */ }')).toEqual({ a: [1, 2] });
    expect(parseJsonc('{ "include": ["**/*.ts", ".next/types/**/*.ts"], "url": "http://x//y" }')).toEqual({ include: ['**/*.ts', '.next/types/**/*.ts'], url: 'http://x//y' });
  });

  it('resolves bare imports against the analyzed root by trial, aliases via tsconfig paths, packages as external, and reports the rest', async () => {
    const w = await run();
    const byLabel = Object.fromEntries(w.edges.filter((e) => e.from.module === 'index.js').map((e) => [e.label, e]));
    expect(byLabel['components/menu-view.js']?.status).toBe('resolved');
    expect(byLabel['components/menu-view.js']?.to?.module).toBe('components/menu-view.js');
    expect(byLabel['@/traits/helper']?.status).toBe('resolved');
    expect(byLabel['@/traits/helper']?.to?.module).toBe('traits/helper.js');
    expect(byLabel.spyne?.status).toBe('external');
    expect(byLabel['./nowhere']?.status).toBe('unresolved');
    expect(byLabel['styles/main.scss']?.status).toBe('resolved');
    expect(w.summary.roots).toEqual(['..', '.']); // tsconfig baseUrl, then the analyzed root by trial
  });

  it('follows Sass @use to a partial and reports a missing one', async () => {
    const w = await run();
    const style = w.edges.filter((e) => e.from.module === 'styles/main.scss');
    expect(style.map((e) => `${e.label}:${e.status}`)).toEqual(['variables:resolved', 'missing-partial:unresolved']);
    expect(style[0]?.to?.module).toBe('styles/_variables.scss');
  });

  it('finds the entry by its boot call', async () => {
    const w = await run();
    expect(w.summary.entries).toEqual(['index.js', 'react/app/orders/[id]/page.tsx']); // the boot call, and a Next.js page by convention
    expect(w.nodes.find((n) => n.id === 'index.js')?.entry).toBe(true);
  });

  it('classifies SpyneJS sites: literal channels, listener rows, bare and computed calls', async () => {
    const w = await run();
    const s = w.sites.filter((x) => x.module === 'components/menu-view.js');
    const labels = (kind: string, cls: string) => s.filter((x) => x.kind === kind && x.class === cls).map((x) => x.label);
    expect(labels('channel', 'declared')).toEqual(['CHANNEL_ROUTE', 'CHANNEL_UI', 'CHANNEL_SHOP', 'CHANNEL_GHOST']);
    expect(labels('listener', 'declared')).toEqual(expect.arrayContaining(['CHANNEL_ROUTE_CHANGE_EVENT', 'menu$OnRoute', 'CHANNEL_UI_*', 'CHANNEL_UI_CLICK_EVENT']));
    expect(labels('listener', 'opaque')).toEqual(['call result used as a name']);
    expect(labels('call', 'declared')).toEqual(expect.arrayContaining(['this.menu$Init', 'computed']));
    expect(labels('call', 'opaque')).toEqual(['computed member']);
  });

  it('classifies React sites: handlers, props, spreads, context, computed members', async () => {
    const w = await run();
    const s = w.sites.filter((x) => x.module === 'components/Panel.tsx');
    const of = (kind: string) => s.filter((x) => x.kind === kind).map((x) => `${x.class}:${x.label}`);
    expect(of('handler')).toEqual(['declared:inline', 'declared:onPress=onSave', 'opaque:computed member']);
    expect(of('prop')).toEqual(['declared:label', 'opaque:spread']);
    expect(of('context')).toEqual(['opaque:context lookup']);
    const m = w.modules['components/Panel.tsx'];
    expect(m?.sites.opaque).toBe(3);
    expect(m?.discernibility).toBeCloseTo(m ? m.sites.declared / (m.sites.declared + m.sites.opaque) : 0);
  });

  it('names a method called on a literal or a call result; a computed member or an invoked call result is opaque', async () => {
    const { collectJs } = await import('./collect/js.js');
    const c = collectJs('x.ts', "/re/.test(s); getEl().focus(); obj[name](); getFn()(); `t`.trim(); (a || b)();", '.ts');
    const calls = c.sites.filter((x) => x.kind === 'call').map((x) => `${x.class}:${x.label}`);
    // the outer call of getFn()() is visited before its inner call, so the opaque site precedes declared:getFn
    expect(calls).toEqual(['declared:(…).test', 'declared:(…).focus', 'declared:getEl', 'opaque:computed member', 'opaque:call result invoked', 'declared:getFn', 'declared:(…).trim', 'opaque:computed callee']);
  });

  it('a data prop is declared by its name whatever its value; only a spread is opaque', async () => {
    const { collectJs } = await import('./collect/js.js');
    const c = collectJs('x.tsx', 'const X = () => <Child className={`a ${b}`} count={n + 1} items={list.map(f)} {...rest} />;', '.tsx');
    expect(c.sites.filter((x) => x.kind === 'prop').map((x) => `${x.class}:${x.label}`)).toEqual(['declared:className', 'declared:count', 'declared:items', 'opaque:spread']);
  });

  it('lists opaque sites and unresolved imports as findings, and keeps the two ratios apart', async () => {
    const w = await run();
    const unresolvedImports = w.findings.filter((f) => f.kind === 'unresolved' && w.edges.find((e) => e.id === f.edge)?.kind === 'import').map((f) => f.module);
    expect(unresolvedImports).toEqual(['index.js', 'styles/main.scss']);
    expect(w.findings.filter((f) => f.kind === 'opaque').length).toBe(w.summary.sites.opaque);
    expect(w.summary.discernibility).toBeLessThan(1);
    expect(w.summary.resolution).toBeLessThan(1);
  });

  it('validates against the wiring schema', async () => {
    const w = await run();
    const ajv = new Ajv2020({ strict: true, allErrors: true });
    addFormats(ajv);
    const validate = ajv.compile(schema);
    expect(validate(JSON.parse(JSON.stringify(w)))).toBe(true);
    expect(validate.errors).toBeNull();
  });
});

describe('wiring: SpyneJS contracts and the vocabulary', () => {
  const run = () => analyzeWiring(ROOT, { toolVersion: '0.0.0-test', now: () => new Date('2026-09-26T00:00:00Z') });
  const edgesOf = async (kind: string, module?: string) => (await run()).edges.filter((e) => e.kind === kind && (!module || e.from.module === module)).map((e) => `${e.label}:${e.status}${e.to ? '→' + e.to.module : ''}${e.candidates ? '?' + e.candidates.join('|') : ''}`);

  it('listener methods resolve to the class, a bound trait, or a built-in; elsewhere is ambiguous; nowhere is unresolved', async () => {
    expect(await edgesOf('listener-method', 'components/menu-view.js')).toEqual([
      'menu$OnRoute:resolved→traits/menu-traits.js',
      'menu$OnCart:resolved→traits/menu-traits.js',
      'menu$Missing:ambiguous?traits/other-traits.js',
      'onUi:resolved→components/menu-view.js',
      'disposeViewStream:external',
    ]);
    expect(await edgesOf('listener-method', 'channels/channel-shop.js')).toEqual(['shop$OnRequest:resolved→traits/shop-traits.js']);
  });

  it('listener actions resolve to a registration or an emit, framework actions are external, globs match, the rest is unresolved', async () => {
    expect(await edgesOf('listener-action')).toEqual([
      'CHANNEL_ROUTE_CHANGE_EVENT:external',
      'CHANNEL_SHOP_CART_EVENT:resolved→channels/channel-shop.js',
      'CHANNEL_SHOP_LOST_EVENT:unresolved',
      'CHANNEL_UI_*:external',
      'CHANNEL_SHOP_.*_EVENT:resolved→channels/channel-shop.js',
      'CHANNEL_UI_CLICK_EVENT:external',
    ]);
  });

  it('channel bindings resolve to the Channel class that names itself; framework channels are external', async () => {
    expect(await edgesOf('channel-binding')).toEqual(['CHANNEL_ROUTE:external', 'CHANNEL_UI:external', 'CHANNEL_SHOP:resolved→channels/channel-shop.js', 'CHANNEL_GHOST:unresolved']);
  });

  it('broadcast selectors are checked against the bound template', async () => {
    expect(await edgesOf('broadcast-selector', 'components/menu-view.js')).toEqual(['a.item:resolved→components/menu.tmpl.html', '[data-qs-dismiss]:resolved→components/menu.tmpl.html', '.zoom:unresolved', 'nav.menu-root:resolved→components/menu.tmpl.html']); // the root element counts
  });

  it('a registered action nobody listens for is a finding', async () => {
    const w = await run();
    // ORPHAN is mentioned by a trait's payload filter, so it resolves; REQUEST is registered and never named again
    expect(w.edges.filter((e) => e.kind === 'action-registration').map((e) => `${e.label}:${e.status}`)).toEqual(['CHANNEL_SHOP_CART_EVENT:resolved', 'CHANNEL_SHOP_ORPHAN_EVENT:resolved', 'CHANNEL_SHOP_REQUEST:unresolved']);
    expect(w.findings.some((f) => f.message.includes("'CHANNEL_SHOP_REQUEST' is registered but nothing listens"))).toBe(true);
  });

  it('the vocabulary lists every name with who registers, emits, listens, binds, or names it; a variable-held action is opaque', async () => {
    const w = await run();
    const v = Object.fromEntries(w.vocabulary.map((x) => [x.name, x.uses.map((u) => u.role).sort().join(',')]));
    expect(v.CHANNEL_SHOP_CART_EVENT).toBe('emits,listens,listens,registers'); // one direct listener, one through the CHANNEL_SHOP_.*_EVENT pattern
    expect(v.CHANNEL_SHOP_ORPHAN_EVENT).toBe('listens,mentions,registers');
    expect(v.CHANNEL_SHOP_DONE_EVENT).toBe('emits,listens,mentions'); // emitted through the DONE constant, matched by the CHANNEL_SHOP_.*_EVENT pattern, mentioned where the constant is declared
    expect(v.CHANNEL_SHOP).toBe('binds,names');
    expect(w.vocabulary.find((x) => x.name === 'CHANNEL_ROUTE')?.framework).toBe(true);
    expect(w.sites.filter((s) => s.kind === 'dispatch' && s.class === 'opaque').map((s) => s.label)).toEqual(['action from a variable']);
  });
});

describe('wiring: React handler paths and contracts', () => {
  const run = () => analyzeWiring(ROOT, { toolVersion: '0.0.0-test', now: () => new Date('2026-09-26T00:00:00Z') });
  const w2 = run;
  const paths = async () => (await run()).edges.filter((e) => e.kind === 'handler-path' && e.from.module.startsWith('react/')).map((e) => `${e.from.module}:${e.label} → ${e.status}${e.to ? ' ' + e.to.module : ''} [${(e.hops ?? []).map((h) => h.module).join(' > ')}]`);

  it('follows a handler through props and parents to its body, one path per parent value; a memo wrapper is not a barrier', async () => {
    expect(await paths()).toEqual([
      'react/Game.tsx:action=formAction → resolved react/state/actions.ts [react/Game.tsx]',
      'react/Game.tsx:onClick=undo → unknown [react/Game.tsx]',
      'react/Orphan.tsx:onClick=onGo → unresolved [react/Board.tsx]',
      'react/Square.tsx:onClick=onSquareClick → resolved react/Board.tsx [react/Board.tsx]',
      'react/Square.tsx:onClick=onSquareClick → resolved react/Game.tsx [react/Board.tsx > react/Game.tsx]',
    ]);
    const w = await w2();
    // a hook result is unsupported tracing, not demonstrated absence: unknown, with its reason on the edge, and no finding
    expect(w.findings.some((f) => f.message.includes("'undo' comes out of useUndo()"))).toBe(false);
    expect(w.edges.find((e) => e.label === 'onClick=undo')?.reason).toContain('not followed statically');
    expect(w.findings.find((f) => f.module === 'react/Orphan.tsx')?.message).toContain("<Orphan> in react/Board.tsx is rendered without 'onGo'");
  });

  it('dispatch types resolve to reducer cases through imported constants; the unhandled and the never-dispatched are findings', async () => {
    const w = await run();
    const at = w.edges.filter((e) => e.kind === 'action-type').map((e) => `${e.label}:${e.status}`);
    expect(at).toEqual(['ADD_ITEM:resolved', 'NOT_HANDLED:unresolved', 'REMOVE_ITEM:unresolved', 'NEVER_DISPATCHED:unresolved']); // REMOVE_ITEM is imported but never dispatched; the switch over x.kind is not a reducer
  });

  it('useContext resolves to a rendered Provider of the same context; a context with no provider is a finding', async () => {
    const w = await run();
    expect(w.edges.filter((e) => e.kind === 'context' && e.from.module.startsWith('react/')).map((e) => `${e.label}:${e.status}`).sort()).toEqual(['Ctx:resolved', 'Lonely:unresolved']);
  });

  it('route literals resolve to page files, dynamic segments included', async () => {
    const w = await run();
    expect(w.edges.filter((e) => e.kind === 'route').map((e) => `${e.label}:${e.status}`)).toEqual(['/orders/42:resolved', '/nowhere:unresolved']);
  });

  it('the React vocabulary lists actions, contexts, routes, and handler props with their roles', async () => {
    const w = await run();
    // two contexts are named Ctx (one in react/state, one in traits/helper); keep the entries whose uses are under react/
    const v = Object.fromEntries(w.vocabulary.filter((x) => x.kind !== 'channel' && !x.name.startsWith('CHANNEL_') && x.uses.every((u) => u.module.startsWith('react/'))).map((x) => [`${x.kind}:${x.name}`, x.uses.map((u) => u.role).sort().join(',')]));
    expect(v['action:ADD_ITEM']).toBe('emits,registers');
    expect(v['context:Ctx']).toBe('emits,listens,names');
    expect(v['route:/orders/*']).toBe('names');
    expect(v['handler:onSquareClick']).toBe('emits,emits,listens');
    expect(v['handler:onPlay']).toBe('emits,listens');
  });
});

describe('wiring: working set, locality, vocabulary share', () => {
  it("a module's working set is itself plus every resolved counterpart, sized by supplied tokens; locality is directory distance", async () => {
    const tokens: Record<string, number> = { 'components/menu-view.js': 100, 'traits/menu-traits.js': 40, 'channels/channel-shop.js': 30, 'components/menu.tmpl.html': 10, 'index.js': 5 };
    const w = await analyzeWiring(ROOT, { toolVersion: '0.0.0-test', tokens });
    const m = w.modules['components/menu-view.js'];
    expect(m?.workingSet.counterparts).toEqual(expect.arrayContaining(['traits/menu-traits.js', 'channels/channel-shop.js', 'components/menu.tmpl.html', 'index.js']));
    expect(m?.workingSet.tokens).toBe(100 + 40 + 30 + 10 + 5);
    expect(m?.workingSet.unmeasured).toBe(m?.workingSet.counterparts.filter((c) => tokens[c] === undefined).length);
    expect(w.summary.workingSet.unmeasuredCounterparts).toBeGreaterThan(0);
    expect(m?.locality).toBeGreaterThan(0); // the template is adjacent (0), the trait and channel are two segments away
    expect(w.summary.workingSet.medianModules).toBeGreaterThan(1);
    expect(w.modules['traits/other-traits.js']?.resolution).toBeNull(); // its only edge is the external `spyne` import

    expect(w.summary.vocabularyShare).not.toBeNull();
    expect(w.summary.locality).not.toBeNull();
  });
});

describe('wiring: template keys, selector relationships, unknown status (fairness review, 2026-09-27)', () => {
  const run = () => analyzeWiring(ROOT, { toolVersion: '0.0.0-test', now: () => new Date('2026-09-26T00:00:00Z') });
  it('a template binding is unknown when the class declares no data, unresolved when a top-level key is missing, resolved when every key is declared', async () => {
    const w = await run();
    const tk = Object.fromEntries(w.edges.filter((e) => e.kind === 'template-key').map((e) => [e.from.module, e]));
    expect(tk['components/menu-view.js']?.status).toBe('unknown');
    expect(tk['components/menu-view.js']?.label).toContain("supplied by the constructor's caller");
    expect(tk['components/card-view.js']?.status).toBe('unresolved');
    expect(tk['components/card-view.js']?.label).toContain('missing');
    expect(w.findings.some((f) => f.module === 'components/card.tmpl.html' && f.message.includes("'missing'"))).toBe(true);
    expect(tk['components/tile-view.js']?.status).toBe('resolved');
    expect(tk['components/tile-view.js']?.label).toContain('verified');
    expect(w.summary.byKind['template-key']).toEqual({ resolved: 1, unresolved: 1, ambiguous: 0, external: 0, unknown: 1 });
  });
  it('a descendant selector needs a real ancestor; siblings do not satisfy it', async () => {
    const w = await run();
    const sel = Object.fromEntries(w.edges.filter((e) => e.kind === 'broadcast-selector' && e.from.module === 'components/card-view.js').map((e) => [e.label, e.status]));
    expect(sel['.card .title']).toBe('resolved');
    expect(sel['.card .sibling']).toBe('unresolved');
    expect(sel['.card > .sibling']).toBe('unresolved');
    expect(sel['.title + .sibling']).toBe('unresolved'); // .title sits inside .card; .sibling is outside it
  });
  it('a selector whose elements children supply is unknown, not external, and stays out of the resolution ratio', async () => {
    const w = await run();
    const e = w.edges.find((x) => x.kind === 'broadcast-selector' && x.from.module === 'components/shell-view.js');
    expect(e?.status).toBe('unknown');
    expect(w.modules['components/shell-view.js']?.resolution).toBeNull();
    expect(w.summary.byKind['broadcast-selector']?.unknown).toBe(1);
  });
});
