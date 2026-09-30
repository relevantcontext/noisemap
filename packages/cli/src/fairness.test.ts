import { fileURLToPath } from 'node:url';
import { contentAdapter } from '@noisemap/adapter-content';
import { reactAdapter } from '@noisemap/adapter-react';
import { spynejsAdapter } from '@noisemap/adapter-spynejs';
import { builtinConfigs } from '@noisemap/configs';
import { analyze } from '@noisemap/core';
import type { ModuleResult } from '@noisemap/core';
import { analyzeWiring } from '@noisemap/wiring';
import { describe, expect, it } from 'vitest';

/**
 * The paired probes from the independent fairness review (2026-09-27). Each pair showed one
 * place the instrument treated the same act differently by framework or by file type. These
 * tests hold the corrections in place. See fixtures/fairness-probes/README.md.
 */
const ROOT = fileURLToPath(new URL('../../../fixtures/fairness-probes/src', import.meta.url));

describe('fairness probes', () => {
  const report = analyze(ROOT, { adapters: [contentAdapter, spynejsAdapter, reactAdapter], configs: builtinConfigs, toolVersion: '0.0.0-test', now: () => new Date('2026-09-27T00:00:00Z') });
  const mod = async (p: string): Promise<ModuleResult> => {
    const m = (await report).modules.find((x) => x.path === p);
    if (!m) throw new Error(`no module ${p}: ${JSON.stringify((await report).failed)}`);
    return m;
  };
  const spanTokens = (m: ModuleResult, rule: string): number => m.spans.filter((s) => s.rule === rule).reduce((a, s) => a + s.tokens, 0);

  it('the same paragraph is Content in a template and in JSX (review 1.2)', async () => {
    const html = await mod('plain.html');
    const jsx = await mod('plain.jsx');
    expect(html.shares.C).toBe(1);
    expect(jsx.shares.C).toBe(1);
    expect(html.mixing).toBe(0);
    expect(jsx.mixing).toBe(0);
  });

  it('copy in a title attribute counts by word in both lexers (review 1.2)', async () => {
    const html = await mod('copy.html');
    const jsx = await mod('copy.jsx');
    expect(spanTokens(html, 'copy-attribute')).toBe(3);
    expect(spanTokens(jsx, 'copy-attribute')).toBe(3);
    expect(html.shares.C).toBe(1);
    expect(jsx.shares.C).toBe(1);
  });

  it('a template section is not logic in rendering; a JSX conditional is (review 1.2, ruling 2026-09-27)', async () => {
    const html = await mod('logic.html');
    const jsx = await mod('logic.jsx');
    expect(html.logicInRendering).toBe(0);
    expect(html.shares.C).toBe(1);
    expect(jsx.logicInRendering).toBeGreaterThan(0);
    expect(jsx.tokens.V).toBe(0);
  });

  it('the same DOM-writing body: View in a plain function, the trait\'s function (Logic) in a SpyneTrait, with the operations still named; the unprefixed member is out of place (review 1.1, ruled 2026-09-29)', async () => {
    const plain = await mod('ordinary.js');
    const trait = await mod('trait.js');
    expect(plain.tokens.V).toBeGreaterThan(0);
    expect(trait.tokens.V).toBe(0);
    expect(trait.tokens.C).toBe(plain.tokens.C);
    const ops = (m: typeof plain) => m.spans.filter((s) => s.rule === 'dom' || s.rule === 'dom-write').map((s) => s.rule);
    expect(ops(trait)).toEqual(ops(plain)); // the same operations are found in both; the trait's take its bucket
    expect(trait.surface?.extra).toEqual(['paint']);
    expect(trait.drift).toBeGreaterThan(0.5); // a member outside the prefix$ surface is out of place in full
  });

  it('a trait that reads a payload is Logic with no drift when its method wears the prefix; a method without the prefix is outside the sanctioned surface', async () => {
    const m = await mod('payload-prefixed.js');
    expect(m.shares.L).toBe(1);
    expect(m.drift).toBe(0);
    const bare = await mod('payload.js');
    expect(bare.surface?.extra).toEqual(['read']);
    expect(bare.drift).toBe(1);
  });

  it('a call to a trait method no trait defines is named unverified; from a designated member it is still the view\'s own (review 1.3, ruled 2026-09-29)', async () => {
    const m = await mod('default-view.js');
    expect(m.spans.some((s) => s.rule === 'ViewStream:call:unverified')).toBe(true);
    expect(m.spans.filter((s) => s.rule === 'ViewStream:call:unverified').every((s) => s.bucket === 'V')).toBe(true);
  });

  it('a console string inside an effect is Logic, not Behavior (review 1.4)', async () => {
    const m = await mod('console.jsx');
    expect(m.spans.some((s) => s.rule === 'console' && s.bucket === 'L')).toBe(true);
    expect(m.tokens.C).toBe(0);
  });

  it('a template key the data lacks is unresolved, and a descendant selector over siblings is unresolved (review 2.2)', async () => {
    const w = await analyzeWiring(ROOT, { toolVersion: '0.0.0-test', now: () => new Date('2026-09-27T00:00:00Z') });
    const tk = w.edges.find((e) => e.kind === 'template-key' && e.from.module === 'view.js');
    expect(tk?.status).toBe('unresolved');
    expect(tk?.label).toContain('missing');
    const sel = w.edges.find((e) => e.kind === 'broadcast-selector' && e.from.module === 'view.js');
    expect(sel?.label).toBe('.parent .child');
    expect(sel?.status).toBe('unresolved');
  });
});
