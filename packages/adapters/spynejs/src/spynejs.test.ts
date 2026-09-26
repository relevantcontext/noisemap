import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { builtinConfigs } from '@noisemap/configs';
import { moduleFromOutput } from '@noisemap/core';
import type { FileInfo, FrameworkConfig, Span } from '@noisemap/core';
import { describe, expect, it } from 'vitest';
import { spynejsAdapter } from './index.js';

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
  it('addActionListeners is B with its payload filter; broadcastEvents is uniformly V (configuration)', () => {
    expect(spans('method:addActionListeners').join(' ')).toContain("'CHANNEL_ROUTE_CHANGE_EVENT', 'menuView$SetActiveLink', filter");
    expect(spans('payload-filter')).toEqual(["new ChannelPayloadFilter('.item', { isOpen", 'v === true']);
    expect(spans('conditional')).not.toContain('v === true');
    expect(spans('method:broadcastEvents')).toEqual(["return [['a', 'click'], ['.close', 'click'"]);
    expect(mod.spans.find((s) => s.rule === 'method:broadcastEvents')?.bucket).toBe('V');
  });
  it('the constructor is uniformly View: its ?? defaults, trait calls, and local calls are all config', () => {
    expect(spans('conditional')).not.toContain('props.data?.limit');
    expect(spans('conditional')).not.toContain('props.data?.title');
    expect(spans('method:constructor').join(' ')).toContain('props.limit = props.data?.limit ?? 10');
    expect(spans('method:constructor').join(' ')).toContain('this.computeTitle');
  });

  it('onRendered is role default V; composition is V; trait calls are L and permitted; a conditional is L', () => {
    expect(spans('role:ViewStream')).toEqual(['const count = e.payload.items.filter', 'i.active).length']);
    expect(spans('dom')).toEqual(["this.el.classList.toggle('busy', count > 3"]);
    expect(spans('compose-view')).toEqual(['this.appendView']);
    expect(spans('new-view')).toEqual(["new ViewStream({ tagName: 'p', data"]);
    expect(spans('ViewStream:call')).toEqual(["this.menuView$SetActiveLink({ payload: { path: '/'", "this.menuView$Log('multi'"]);
    expect(spans('conditional')).toEqual(['if (this.props.channels.length > 1']);
    expect(spans('copy-string')).toEqual(['Menu ready to use']);
  });
  it('drift = Logic that is not a trait call; Content is expected', () => {
    const counted = mod.tokens.V + mod.tokens.B + mod.tokens.L + mod.tokens.C;
    const traitTokens = mod.spans.filter((s) => s.rule === 'ViewStream:call').reduce((a, s) => a + s.tokens, 0);
    expect(mod.drift).toBeCloseTo((mod.tokens.L - traitTokens) / counted);
    expect(mod.drift).toBeGreaterThan(0);
    expect(mod.drift).toBeLessThan(0.15);
  });
});

describe('spynejs adapter: DomElement', () => {
  const file = load('components/bare-item.js');
  const mod = moduleFromOutput(file, spynejsAdapter.analyze(file, config));
  it('a bare element is 100% View: its inline template is configuration', () => {
    expect(mod.role).toBe('DomElement');
    expect(mod.shares.V).toBe(1);
    expect(by(file, mod.spans, 'markup-template')).toEqual([]);
    expect(mod.mixing).toBe(0);
    expect(mod.drift).toBe(0);
  });
});

describe('spynejs adapter: Channel', () => {
  const file = load('channels/channel-cards.js');
  const mod = moduleFromOutput(file, spynejsAdapter.analyze(file, config));
  const spans = (rule: string) => by(file, mod.spans, rule);
  it('is Behavior with permitted trait calls that are reported, not drift', () => {
    expect(mod.role).toBe('Channel');
    expect(spans('Channel:call')).toEqual(['this.cards$Init', "this.cards$Sort(p.payload.cards, 'title'"]);
    expect(mod.tokens.L).toBeGreaterThan(0);
    expect(mod.drift).toBe(0);
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
  it('a trait is uniform Logic even when it composes views; scaffolding and comments stay excluded', () => {
    const file = load('traits/menu-view-traits.js');
    const mod = moduleFromOutput(file, spynejsAdapter.analyze(file, config));
    expect(by(file, mod.spans, 'new-view')).toEqual([]);
    expect(mod.tokens.V).toBe(0);
    expect(mod.tokens.C).toBe(0);
    expect(mod.shares.L).toBe(1);
    expect(mod.drift).toBe(0);
    expect(mod.spans.some((s) => s.rule === 'scaffolding:imports')).toBe(true);
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
