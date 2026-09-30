import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { builtinConfigs } from '@noisemap/configs';
import { moduleFromOutput } from '@noisemap/core';
import type { FileInfo, FrameworkConfig, Span } from '@noisemap/core';
import { describe, expect, it } from 'vitest';
import { prepareSpyne, spynejsAdapter } from './index.js';

const ROOT = fileURLToPath(new URL('../../../../fixtures/spyne-sample/src/', import.meta.url));
const config = builtinConfigs.spynejs as FrameworkConfig;
const ctx = { detected: ['spynejs'], override: null };

function load(rel: string): FileInfo {
  const absPath = ROOT + rel;
  return { path: rel, absPath, ext: rel.slice(rel.lastIndexOf('.')), source: readFileSync(absPath, 'utf8') };
}
const norm = (s: string): string => s.replace(/\s+/g, ' ').trim();
const by = (file: FileInfo, spans: Span[], rule: string): string[] =>
  spans.filter((s) => s.rule === rule).map((s) => norm(file.source.slice(s.start, s.end)));

describe('spynejs adapter: routing', () => {
  it('claims a role file in any codebase and plain js only when SpyneJS is detected or forced', () => {
    const view = load('components/menu-view.js');
    const util = load('util.js');
    expect(spynejsAdapter.match(view, { detected: [], override: null }, config)).toBe(true);
    expect(spynejsAdapter.match(util, { detected: [], override: null }, config)).toBe(false);
    expect(spynejsAdapter.match(util, ctx, config)).toBe(true);
    expect(spynejsAdapter.match(util, { detected: [], override: 'spynejs' }, config)).toBe(true);
    expect(spynejsAdapter.match(util, { detected: ['spynejs'], override: 'react' }, config)).toBe(false);
  });
});

describe('spynejs adapter: ViewStream', () => {
  const file = load('components/menu-view.js');
  const mod = moduleFromOutput(file, spynejsAdapter.analyze(file, config));
  const spans = (rule: string) => by(file, mod.spans, rule);

  it('declares the role and its expected shape', () => {
    expect(mod.role).toBe('ViewStream');
    expect(mod.drift).toBeDefined();
  });
  it('constructor body is the config object (V); signature and super are scaffolding', () => {
    expect(spans('method:constructor').join(' ')).toContain("props.id = 'menu'; props.tagName = 'nav'; props.channels");
    expect(spans('scaffolding:superCalls')).toEqual(['super(props']);
    expect(spans('scaffolding:functionSignatures')).toEqual(expect.arrayContaining(['constructor(props', 'addActionListeners', 'onRendered']));
  });
  it('listener tables are View by what they are; a payload filter built inside one is the view\'s wiring, View (2026-09-27)', () => {
    expect(spans('method:addActionListeners').join(' ')).toContain("'CHANNEL_ROUTE_CHANGE_EVENT', 'menuView$SetActiveLink', filter");
    expect(spans('payload-filter')).toEqual(["new ChannelPayloadFilter('.item', { isOpen", 'v === true']); // split by the arrow's signature, which is scaffolding
    expect(mod.spans.find((s) => s.rule === 'payload-filter')?.bucket).toBe('V'); // in a view it is wiring
    expect(spans('method:broadcastEvents')).toEqual(["return [['a', 'click'], ['.close', 'click'"]);
    expect(mod.spans.filter((s) => s.rule === 'method:addActionListeners' || s.rule === 'method:broadcastEvents').every((s) => s.bucket === 'V')).toBe(true);
    expect(mod.tokens.B).toBe(0);
    const trait: FileInfo = { path: 't.js', absPath: '/x/t.js', ext: '.js', source: "import { SpyneTrait, ChannelPayloadFilter } from 'spyne';\nexport class T extends SpyneTrait {\n  static t$Filter() { return new ChannelPayloadFilter({ action: (a) => a === 'X' }); }\n}\n" };
    expect(moduleFromOutput(trait, spynejsAdapter.analyze(trait, config)).shares.L).toBe(1); // in a trait it is logic
    const chan: FileInfo = { path: 'c.js', absPath: '/x/c.js', ext: '.js', source: "import { Channel, ChannelPayloadFilter } from 'spyne';\nexport class C extends Channel {\n  onRegistered() { this.getChannel('CHANNEL_UI', new ChannelPayloadFilter({ selector: ['.x'] })).subscribe((p) => this.c$On(p)); }\n}\n" };
    const cm = moduleFromOutput(chan, spynejsAdapter.analyze(chan, config));
    expect(cm.spans.find((s) => s.rule === 'payload-filter')?.bucket).toBe('B'); // in a channel it is the subscription
    expect(cm.drift).toBe(0);
  });
  it('the constructor is the view\'s configuration in full: a default, a ternary, a trait call, a local call that feeds a property are all View (ruling 2026-09-29)', () => {
    expect(spans('conditional')).toEqual([]);
    expect(spans('method:constructor').join(' ')).toContain('props.limit = props.data?.limit ?? 10');
    expect(spans('method:constructor').join(' ')).toContain('this.menuView$DefaultSort');
    expect(spans('method:constructor').join(' ')).toContain('this.computeTitle');
    expect(spans('ViewStream:call')).toEqual([]);
  });

  it('onRendered is a sanctioned member: composition, trait calls, and a conditional there are all View; an unsanctioned member is out of place with its operations classified as they are', () => {
    expect(spans('role:ViewStream')[0]).toContain("this.menuView$SetActiveLink({ payload: { path: '/' } }); if (this.props.channels.length > 1)");
    expect(spans('dom')).toEqual(["this.el.classList.toggle('busy', count > 3"]);
    expect(spans('compose-view')).toEqual(['this.appendView']);
    expect(spans('new-view')).toEqual(["new ViewStream({ tagName: 'p', data: 'Menu ready to use'"]); // the data string is one View token, not prose
    expect(spans('ViewStream:call')).toEqual([]); // trait calls inside sanctioned members are the view's wiring
    expect(spans('conditional')).toEqual([]);
    expect(spans('call:composed')).toEqual(['e.payload.items.filter', 'i.active']); // inside onUiEvent, a member the surface does not sanction
    expect(mod.surface?.extra).toEqual(['onUiEvent']);
    expect(spans('copy-string')).toEqual([]);
  });
  it('drift = every token in a member outside the sanctioned surface, whatever its bucket, plus Logic elsewhere (ruling 2026-09-29)', () => {
    const counted = mod.tokens.V + mod.tokens.B + mod.tokens.L + mod.tokens.C;
    const misplaced = mod.spans.filter((s) => s.misplaced).reduce((a, s) => a + s.tokens, 0);
    expect(misplaced).toBeGreaterThan(0);
    expect(mod.drift).toBeCloseTo(misplaced / counted); // onUiEvent, all of it; nothing else is out of place
    expect(mod.spans.filter((s) => s.rule === 'method:constructor').every((s) => !s.misplaced)).toBe(true);
  });

  it('a bare trait delegation takes the host bucket; a composed one is Logic', () => {
    const mk = (body: string): FileInfo => ({ path: 'c.js', absPath: '/x/c.js', ext: '.js', source: `import { Channel } from 'spyne';\nexport class C extends Channel {\n  onRegistered() {\n${body}\n  }\n}\n` });
    const bare = moduleFromOutput(mk('    this.c$OnRegistered(); this.c$Bind(this.props);'), spynejsAdapter.analyze(mk('    this.c$OnRegistered(); this.c$Bind(this.props);'), config));
    expect(bare.tokens.L).toBe(0);
    expect(bare.shares.B).toBe(1);
    // inside onRegistered, a sanctioned member, a composed trait call is the channel's wiring too (ruling 2026-09-29)
    const composed = moduleFromOutput(mk("    const s = this.c$Sort(this.props.items, 'title'); this.sendChannelPayload('X', { s });"), spynejsAdapter.analyze(mk("    const s = this.c$Sort(this.props.items, 'title'); this.sendChannelPayload('X', { s });"), config));
    expect(composed.tokens.L).toBe(0);
    expect(composed.drift).toBe(0);
  });

  it('a view that subscribes itself has Behavior, which is out of its shape; a listener table alone has none', () => {
    const file2: FileInfo = {
      path: 'self-view.js',
      absPath: '/x/self-view.js',
      ext: '.js',
      source: "import { ViewStream } from 'spyne';\nexport class SelfView extends ViewStream {\n  addActionListeners() { return [['CHANNEL_X_EVENT', 'onX']]; }\n  onRendered() { this.getChannel('CHANNEL_X').subscribe((p) => this.onX(p)); }\n}\n",
    };
    const m2 = moduleFromOutput(file2, spynejsAdapter.analyze(file2, config));
    expect(m2.tokens.B).toBeGreaterThan(0);
    expect(m2.drift).toBeGreaterThan(0); // rxjs logic in a view is noise (Frank, 2026-09-29)
    expect(m2.spans.filter((s) => s.rule === 'method:addActionListeners').every((s) => s.bucket === 'V')).toBe(true);
  });
});

describe('spynejs adapter: DomElement', () => {
  const file = load('components/bare-item.js');
  const mod = moduleFromOutput(file, spynejsAdapter.analyze(file, config));
  it('a bare element is View with its inline template as Content inside the View module: mixed, and not drift because Content is expected', () => {
    expect(mod.role).toBe('DomElement');
    expect(by(file, mod.spans, 'markup-template')).toEqual(['span>{{label}}</span']);
    expect(mod.tokens.V).toBeGreaterThan(0);
    expect(mod.tokens.C).toBeGreaterThan(0);
    expect(mod.mixing).toBeGreaterThan(0);
    expect(mod.drift).toBe(0);
  });
});

describe('spynejs adapter: Channel', () => {
  const file = load('channels/channel-cards.js');
  const mod = moduleFromOutput(file, spynejsAdapter.analyze(file, config));
  const spans = (rule: string) => by(file, mod.spans, rule);
  it('is Behavior in its sanctioned members; its own onRoute method is outside the surface and out of place in full', () => {
    expect(mod.role).toBe('Channel');
    expect(spans('Channel:call')).toEqual(["this.cards$Sort(p.payload.cards, 'title'"]); // inside onRoute: Logic, not permitted there
    expect(mod.surface?.extra).toEqual(['onRoute']);
    expect(mod.drift).toBeGreaterThan(0.3);
    expect(spans('channel-io')).toEqual(["this.getChannel('CHANNEL_ROUTE'", "this.sendChannelPayload('CHANNEL_CARDS_SORT_EVENT', { cards: sorted"]);
    expect(spans('method:onRegistered').length + spans('method:addRegisteredActions').length).toBeGreaterThan(0);
  });
});

describe('spynejs adapter: SpyneTrait', () => {
  it('a pure trait is Logic with zero drift', () => {
    const file = load('traits/cards-traits.js');
    const mod = moduleFromOutput(file, spynejsAdapter.analyze(file, config));
    expect(mod.role).toBe('SpyneTrait');
    expect(mod.tokens.V).toBe(0);
    expect(mod.drift).toBe(0);
  });
  it('a trait that composes views is Logic in full: composing for its host is what a trait function does (functions, 2026-09-29)', () => {
    const file = load('traits/menu-view-traits.js');
    const alone = moduleFromOutput(file, spynejsAdapter.analyze(file, config));
    expect(by(file, alone.spans, 'new-view')).toEqual(["new ViewStream({ tagName: 'em', data: e.payload.path"]); // the operation is still named
    expect(alone.spans.filter((s) => s.rule === 'new-view').every((s) => s.bucket === 'L')).toBe(true); // and takes the trait's bucket
    expect(alone.tokens.V).toBe(0);
    expect(alone.expected).toEqual(['L']);
    expect(alone.drift).toBe(0);
    expect(alone.spans.some((s) => s.rule === 'scaffolding:imports')).toBe(true);
    const prepared = prepareSpyne([load('components/menu-view.js'), file]);
    expect(prepared.traitHosts?.MenuViewTraits).toBe('view'); // the binding is still read: it decides which layer the trait absorbs
    const bound = moduleFromOutput(file, spynejsAdapter.analyze(file, config, prepared));
    expect(bound.tokens).toEqual(alone.tokens); // binding no longer changes the trait's shape
  });
  it('a channel trait is Logic for its channel work: a payload read, a transmit; a DOM query in it is a channel manipulating the DOM, View and drift; content and configuration are foreign', () => {
    const host: FileInfo = { path: 'channel-x.js', absPath: '/x/channel-x.js', ext: '.js', source: "import { Channel } from 'spyne';\nimport { XTraits } from './x-traits.js';\nexport class ChannelX extends Channel {\n  constructor(name, props = {}) { props.traits = [XTraits]; super(name, props); }\n}\n" };
    const mk = (body: string): FileInfo => ({ path: 'x-traits.js', absPath: '/x/x-traits.js', ext: '.js', source: `import { SpyneTrait } from 'spyne';\nexport class XTraits extends SpyneTrait {\n  static x$Read(e) {\n${body}\n  }\n}\n` });
    const clean = mk("    const name = e.payload.target.dataset.name; this.sendChannelPayload('X', { name });");
    const p1 = prepareSpyne([host, clean]);
    expect(p1.traitHosts?.XTraits).toBe('channel');
    const m1 = moduleFromOutput(clean, spynejsAdapter.analyze(clean, config, p1));
    expect(m1.tokens.V).toBe(0);
    expect(m1.drift).toBe(0);
    const dirty = mk("    const el = document.querySelector('.x'); this.sendChannelPayload('X', { el });");
    const m2 = moduleFromOutput(dirty, spynejsAdapter.analyze(dirty, config, prepareSpyne([host, dirty])));
    expect(m2.tokens.V).toBeGreaterThan(0); // a channel using its trait to manipulate the DOM is noise (Frank, 2026-09-29)
    expect(m2.drift).toBeGreaterThan(0);
    const foreign = mk("    this.props.data = { label: 'Hi' }; return `<p class=\"x y\">${e.payload.name}</p>`;");
    const m3 = moduleFromOutput(foreign, spynejsAdapter.analyze(foreign, config, prepareSpyne([host, foreign])));
    expect(m3.tokens.C).toBeGreaterThan(0); // markup in a trait stays Content
    expect(m3.tokens.V).toBe(0); // data assigned to props.data, literal or not, is the trait's logic (review 3)
    expect(m3.drift).toBeGreaterThan(0);
  });
  it('a view trait transmitting is Logic with no drift; a view trait subscribing to a stream is the view doing channel work, Behavior and drift', () => {
    const host: FileInfo = { path: 'v.js', absPath: '/x/v.js', ext: '.js', source: "import { ViewStream } from 'spyne';\nimport { VTraits } from './v-traits.js';\nexport class V extends ViewStream {\n  constructor(props = {}) { props.traits = [VTraits]; super(props); }\n}\n" };
    const mk = (body: string): FileInfo => ({ path: 'v-traits.js', absPath: '/x/v-traits.js', ext: '.js', source: `import { SpyneTrait } from 'spyne';\nexport class VTraits extends SpyneTrait {\n  static v$Go(e) {\n${body}\n  }\n}\n` });
    const send = mk("    this.sendInfoToChannel('CHANNEL_X', { id: e.payload.id });");
    const m1 = moduleFromOutput(send, spynejsAdapter.analyze(send, config, prepareSpyne([host, send])));
    expect(m1.tokens.B).toBe(0);
    expect(m1.shares.L).toBe(1);
    expect(m1.drift).toBe(0);
    const sub = mk("    this.getChannel('CHANNEL_X').subscribe((p) => this.v$Go(p));");
    const m2 = moduleFromOutput(sub, spynejsAdapter.analyze(sub, config, prepareSpyne([host, sub])));
    expect(m2.tokens.B).toBeGreaterThan(0);
    expect(m2.drift).toBeGreaterThan(0);
    const listen = mk("    this.props.el$('.x').el.addEventListener('click', () => this.v$Go());");
    const m3 = moduleFromOutput(listen, spynejsAdapter.analyze(listen, config, prepareSpyne([host, listen])));
    expect(m3.tokens.B).toBeGreaterThan(0); // a view adding its own listeners is noise too
    expect(m3.drift).toBeGreaterThan(0);
    const unbound = moduleFromOutput(sub, spynejsAdapter.analyze(sub, config));
    expect(unbound.tokens.B).toBe(0); // bound to no host it absorbs both layers
  });
  it('a trait call from a designated member is the view\'s own, bound or not; one no trait defines is named unverified and takes the member\'s type (2026-09-29)', () => {
    const view = load('components/menu-view.js');
    const traits = load('traits/menu-view-traits.js');
    const prepared = prepareSpyne([view, traits]);
    expect([...(prepared.traitMethods ?? [])]).toEqual(['menuView$SetActiveLink', 'menuView$Log']);
    expect(prepared.boundMethods?.MenuView).toEqual(new Set(['menuView$SetActiveLink', 'menuView$Log']));
    const mod = moduleFromOutput(view, spynejsAdapter.analyze(view, config, prepared));
    const unverified = mod.spans.filter((s) => s.rule === 'ViewStream:call:unverified');
    expect(unverified.map((s) => view.source.slice(s.start, s.end))).toEqual(['this.menuView$DefaultSort']); // no trait defines it: named for the report
    expect(unverified.every((s) => s.bucket === 'V')).toBe(true); // inside the constructor it is still the view's wiring
    const trusted = moduleFromOutput(view, spynejsAdapter.analyze(view, config));
    expect(mod.drift).toBe(trusted.drift); // the call is not noise whether or not the method is found
    // a trait used as a pure static function, never listed in props.traits, is verified all the same
    const stray: FileInfo = { path: 'stray.js', absPath: '/x/stray.js', ext: '.js', source: "import { SpyneTrait } from 'spyne';\nexport class Stray extends SpyneTrait { static menuView$DefaultSort() { return 1; } }\n" };
    const withStray = moduleFromOutput(view, spynejsAdapter.analyze(view, config, prepareSpyne([view, traits, stray])));
    expect(withStray.spans.some((s) => s.rule === 'ViewStream:call:unverified')).toBe(false);
  });
  it('a trait is identified by file and export: same-named traits keep their own hosts, a default import is followed, a stray traits key is not a binding, and a bare unresolved call is still named (review 4)', () => {
    const mk = (path: string, source: string): FileInfo => ({ path, absPath: '/x/' + path, ext: '.js', source });
    const body = "static t$Do() { document.querySelector('.x'); fetch('/x'); }";
    const a = mk('a.js', `import { SpyneTrait } from 'spyne';\nexport class T extends SpyneTrait { ${body} }\n`);
    const b = mk('b.js', `import { SpyneTrait } from 'spyne';\nexport class T extends SpyneTrait { ${body} }\n`);
    const v = mk('v.js', "import { T } from './a.js';\nimport { ViewStream } from 'spyne';\nexport class V extends ViewStream { constructor(props = {}) { props.traits = [T]; super(props); } }\n");
    const c = mk('c.js', "import { T } from './b.js';\nimport { Channel } from 'spyne';\nexport class C extends Channel { constructor(props = {}) { super('C', { traits: [T] }); } }\n");
    const prepared = prepareSpyne([a, b, v, c]);
    expect(prepared.traitHosts).toEqual({ 'a.js#T': 'view', 'b.js#T': 'channel' });
    const am = moduleFromOutput(a, spynejsAdapter.analyze(a, config, prepared));
    const bm = moduleFromOutput(b, spynejsAdapter.analyze(b, config, prepared));
    expect(am.tokens.V).toBe(0); expect(am.tokens.B).toBeGreaterThan(0); // the view trait absorbs its DOM query; its fetch shows
    expect(bm.tokens.B).toBe(0); expect(bm.tokens.V).toBeGreaterThan(0); // the channel trait absorbs its fetch; its DOM query shows
    expect(am.bindings).toEqual([{ host: 'V', kind: 'view' }]);
    const d = mk('d.js', `import { SpyneTrait } from 'spyne';\nexport default class D extends SpyneTrait { ${body} }\n`);
    const dv = mk('dv.js', "import Local from './d.js';\nimport { ViewStream } from 'spyne';\nexport class DV extends ViewStream { constructor(props = {}) { props.traits = [Local]; super(props); } }\n");
    expect(prepareSpyne([d, dv]).traitHosts).toEqual({ 'd.js#D': 'view', D: 'view' });
    const stray = mk('s.js', "import { T } from './a.js';\nimport { ViewStream } from 'spyne';\nexport class S extends ViewStream { onRendered() { const unrelated = { traits: [T] }; } }\n");
    expect(prepareSpyne([a, stray]).traitHosts).toEqual({});
    // an explicit import that matches nothing binds nothing; an export alias is followed (review 5)
    const other = mk('other.js', "export class T { helper() { return 1; } }\n");
    const wrong = mk('w.js', "import { T } from './other.js';\nimport { ViewStream } from 'spyne';\nexport class W extends ViewStream { constructor(props = {}) { props.traits = [T]; super(props); } }\n");
    expect(prepareSpyne([a, other, wrong]).traitHosts).toEqual({});
    const aliased = mk('real.js', `import { SpyneTrait } from 'spyne';\nclass R extends SpyneTrait { ${body} }\nexport { R as Public };\n`);
    const av = mk('av.js', "import { Public } from './real.js';\nimport { ViewStream } from 'spyne';\nexport class AV extends ViewStream { constructor(props = {}) { props.traits = [Public]; super(props); } }\n");
    expect(prepareSpyne([aliased, av]).traitHosts).toEqual({ 'real.js#R': 'view', R: 'view' });
    // a `$` call resolved to an imported function or a static method is not unverified (ruling 2026-09-29)
    const helper = mk('helper.js', "export function util$Run() { return 1; }\nexport class Util { static fmt$Money(v) { return v; } }\n");
    const uv = mk('uv.js', "import { util$Run, Util } from './helper.js';\nimport { ViewStream } from 'spyne';\nexport class UV extends ViewStream { onRendered() { util$Run(); Util.fmt$Money(1); } }\n");
    const um = moduleFromOutput(uv, spynejsAdapter.analyze(uv, config, prepareSpyne([helper, uv])));
    expect(um.spans.some((s) => s.rule.endsWith(':unverified'))).toBe(false);
    const bare = mk('bare.js', "import { ViewStream } from 'spyne';\nexport class BV extends ViewStream { onRendered() { this.missing$Run(); } }\n");
    const bm2 = moduleFromOutput(bare, spynejsAdapter.analyze(bare, config, prepareSpyne([a, bare])));
    const un = bm2.spans.filter((s) => s.rule === 'ViewStream:call:unverified');
    expect(un.length).toBe(1);
    expect(un[0]?.bucket).toBe('V');
    expect(bm2.drift).toBe(0);
  });
  it('bindings are read with the parser: a comment is not a binding, an alias is followed, a brace in a string is a character (review 3)', () => {
    const t: FileInfo = { path: 't.js', absPath: '/x/t.js', ext: '.js', source: "import { SpyneTrait } from 'spyne';\nexport class Actual extends SpyneTrait { static t$Do() { return 1; } }\n" };
    const aliased: FileInfo = { path: 'v.js', absPath: '/x/v.js', ext: '.js', source: "import { Actual as Local } from './t.js';\nimport { ViewStream } from 'spyne';\nexport class V extends ViewStream { constructor(props = {}) { props.label = '}}'; props.traits = [Local]; super(props); } }\n" };
    const p1 = prepareSpyne([t, aliased]);
    expect(p1.traitHosts).toEqual({ 't.js#Actual': 'view', Actual: 'view' });
    expect(p1.traitBindings?.Actual).toEqual([{ host: 'V', kind: 'view' }]);
    const commented: FileInfo = { path: 'c.js', absPath: '/x/c.js', ext: '.js', source: "import { ViewStream } from 'spyne';\nexport class C extends ViewStream {\n  // props.traits = [Actual];\n  onRendered() { this.t$Do(); }\n}\n" };
    expect(prepareSpyne([t, commented]).traitHosts).toEqual({});
    const tm = moduleFromOutput(t, spynejsAdapter.analyze(t, config, p1));
    expect(tm.bindings).toEqual([{ host: 'V', kind: 'view' }]);
  });
});

describe('spynejs adapter: plain module', () => {
  it('has no role and no drift', () => {
    const file = load('util.js');
    const mod = moduleFromOutput(file, spynejsAdapter.analyze(file, config));
    expect(mod.role).toBeUndefined();
    expect(mod.drift).toBeUndefined();
    expect(mod.shares.L).toBe(1);
  });
});

describe('spynejs adapter: DOM access is View wherever it appears', () => {
  const mk = (body: string): FileInfo => ({
    path: 'channel-x.js',
    absPath: '/x/channel-x.js',
    ext: '.js',
    source: `import { Channel } from 'spyne';\nexport class ChannelX extends Channel {\n  onRegistered() {\n${body}\n  }\n}\n`,
  });
  it('a Channel that reads a payload is clean', () => {
    const file = mk("    const cards = this.getChannel('CHANNEL_DATA').payload.cards; this.sendChannelPayload('X', { cards });");
    const mod = moduleFromOutput(file, spynejsAdapter.analyze(file, config));
    expect(mod.tokens.V).toBe(0);
    expect(mod.drift).toBe(0);
  });
  it('a Channel that manages the DOM shows View drift', () => {
    const file = mk("    document.querySelector('.x').classList.add('busy'); document.body.innerHTML = '<p>hi</p>';");
    const mod = moduleFromOutput(file, spynejsAdapter.analyze(file, config));
    expect(by(file, mod.spans, 'dom').length).toBeGreaterThan(0);
    expect(by(file, mod.spans, 'dom-write')).toEqual(['document.body.innerHTML']); // the markup string inside is Content, innermost
    expect(mod.tokens.V).toBeGreaterThan(0);
    expect(mod.drift).toBeGreaterThan(0.3);
  });
});

describe('spynejs adapter: el$ is View, surfaces and permitted spans (Grammar-cited, 2026-09-27)', () => {
  const mk = (name: string, body: string): FileInfo => ({ path: name, absPath: '/x/' + name, ext: '.js', source: body });
  it('el$ and its class methods are View in a view and in a plain module (address-region-by-el$); in a trait they are the trait\'s function, Logic', () => {
    const body = "    this.props.el$('.x').toggleClass('busy', e.payload.on); this.props.el$('#h').el.innerText = e.payload.label;\n";
    const plain = mk('p.js', "export function go(e) {\n" + body + "}\n");
    const pm = moduleFromOutput(plain, spynejsAdapter.analyze(plain, config));
    expect(by(plain, pm.spans, 'dom')).toEqual(["this.props.el$('.x').toggleClass('busy', e.payload.on); this.props.el$('#h'"]); // adjacent same-rule tokens merge into one span
    expect(by(plain, pm.spans, 'dom-write')).toEqual(['el.innerText = e.payload.label']); // the el$ call inside is the innermost dom span; both are View
    expect(pm.tokens.V).toBeGreaterThan(0);
    const trait = mk('t.js', "import { SpyneTrait } from 'spyne';\nexport class T extends SpyneTrait {\n  static t$Go(e) {\n" + body + "  }\n}\n");
    const tm = moduleFromOutput(trait, spynejsAdapter.analyze(trait, config));
    expect(by(trait, tm.spans, 'dom')).toEqual(["this.props.el$('.x').toggleClass('busy', e.payload.on); this.props.el$('#h'"]); // the same operations are named
    expect(tm.spans.filter((s) => s.rule === 'dom' || s.rule === 'dom-write').every((s) => s.bucket === 'L')).toBe(true);
    expect(tm.tokens.V).toBe(0);
  });
  it('a view on the sanctioned surface reports its four members and no extras; an extra method is reported', () => {
    const view = load('components/menu-view.js');
    const mod = moduleFromOutput(view, spynejsAdapter.analyze(view, config));
    expect(mod.base).toBe('V');
    expect(mod.expected).toEqual(['V', 'C']); // a view expects no Behavior: its transmit is its own act (2026-09-29)
    expect(mod.surface?.sanctioned).toEqual(['constructor', 'broadcastEvents', 'addActionListeners', 'onRendered']);
    expect(mod.surface?.members).toEqual(['constructor', 'addActionListeners', 'broadcastEvents', 'onRendered', 'onUiEvent']);
    expect(mod.surface?.extra).toEqual(['onUiEvent']);
    const clean = mk('v.js', "import { ViewStream } from 'spyne';\nexport class V extends ViewStream {\n  constructor(props = {}) { super(props); }\n  onRendered() { this.v$Go(); }\n}\n");
    expect(moduleFromOutput(clean, spynejsAdapter.analyze(clean, config)).surface?.extra).toEqual([]);
    const trait = mk('t.js', "import { SpyneTrait } from 'spyne';\nexport class T extends SpyneTrait {\n  constructor(c) { super(c, 't$'); }\n  static t$Go() {}\n  static helper() {}\n}\n");
    expect(moduleFromOutput(trait, spynejsAdapter.analyze(trait, config)).surface?.extra).toEqual(['helper']);
  });
  it('sendInfoToChannel takes its host: View inside a ViewStream, Logic inside a trait, Behavior in a plain module (transmit, 2026-09-29)', () => {
    const view = mk('v.js', "import { ViewStream } from 'spyne';\nexport class V extends ViewStream {\n  onRendered() { this.sendInfoToChannel('CHANNEL_X', { id: this.props.id }); }\n}\n");
    const vm = moduleFromOutput(view, spynejsAdapter.analyze(view, config));
    expect(by(view, vm.spans, 'transmit')).toEqual(["this.sendInfoToChannel('CHANNEL_X', { id: this.props.id"]);
    expect(vm.spans.filter((s) => s.rule === 'transmit').every((s) => s.bucket === 'V')).toBe(true);
    expect(vm.tokens.B).toBe(0);
    const trait = mk('v-traits.js', "import { SpyneTrait } from 'spyne';\nexport class VTraits extends SpyneTrait {\n  static v$Go(e) { this.sendInfoToChannel('CHANNEL_X', { id: e.payload.id }); }\n}\n");
    const tm = moduleFromOutput(trait, spynejsAdapter.analyze(trait, config));
    expect(tm.spans.filter((s) => s.rule === 'transmit').every((s) => s.bucket === 'L')).toBe(true);
    expect(tm.spans.some((s) => s.permitted)).toBe(false); // nothing to permit: it is inside the shape
    const plain = mk('p.js', "export function go(v, e) { v.sendInfoToChannel('CHANNEL_X', { id: e.payload.id }); }\n");
    const pm = moduleFromOutput(plain, spynejsAdapter.analyze(plain, config));
    expect(pm.spans.filter((s) => s.rule === 'transmit').every((s) => s.bucket === 'B')).toBe(true);
  });
});

describe('spynejs adapter: props.data is configuration (config-data, 2026-09-27)', () => {
  it('copy declared as the view\'s data is View; the same string in a trait is Logic, because a string in code is code', () => {
    const view: FileInfo = { path: 'v.js', absPath: '/x/v.js', ext: '.js', source: "import { ViewStream } from 'spyne';\nexport class V extends ViewStream {\n  constructor(props = {}) {\n    const { heading = 'Please log in to continue.' } = props.data || {};\n    props.data = { ...props.data, heading, hint: 'Enter your email address' };\n    props.data.footer = 'All rights reserved here';\n    super(props);\n  }\n}\n" };
    const mod = moduleFromOutput(view, spynejsAdapter.analyze(view, config));
    expect(mod.tokens.C).toBe(0);
    expect(by(view, mod.spans, 'config-data')).toEqual(["'Please log in to continue.'", "'Enter your email address'", "'All rights reserved here'"]); // one token each: configuration, not prose
    expect(mod.spans.filter((s) => s.rule === 'config-data').every((s) => s.bucket === 'V')).toBe(true);
    const trait: FileInfo = { path: 't.js', absPath: '/x/t.js', ext: '.js', source: "import { SpyneTrait } from 'spyne';\nexport class T extends SpyneTrait {\n  static t$Heading(e) { return 'Please log in to continue.'; }\n}\n" };
    const tm = moduleFromOutput(trait, spynejsAdapter.analyze(trait, config));
    expect(tm.tokens.C).toBe(0);
    expect(tm.shares.L).toBe(1);
  });
});
