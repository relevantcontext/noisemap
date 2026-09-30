import { fileURLToPath } from 'node:url';
import { contentAdapter } from '@noisemap/adapter-content';
import Ajv2020 from 'ajv/dist/2020.js';
import addFormats from 'ajv-formats';
import { describe, expect, it } from 'vitest';
import { analyze } from '@noisemap/core';
import schema from '../../core/schema/noisemap-output.schema.json' with { type: 'json' };

const FIXTURE = fileURLToPath(new URL('../../../fixtures/content-sample', import.meta.url));

describe('analyze (content fixture)', () => {
  const run = () =>
    analyze(FIXTURE, {
      adapters: [contentAdapter],
      toolVersion: '0.0.0-test',
      now: () => new Date('2026-09-22T00:00:00Z'),
    });

  it('routes content files, skips the rest, drops empty files', async () => {
    const r = await run();
    expect(r.modules.map((m) => m.path)).toEqual([
      'NOTES.txt',
      'data.json',
      'pages/about.md',
      'pages/index.html',
      'pages/inline.html',
      'styles/_variables.scss',
      'styles/card.scss',
      'styles/legacy.css',
    ]);
    expect(r.empty).toEqual(['styles/empty.scss']);
    expect(r.skipped).toEqual({ count: 1, byExtension: { '.json': 1 }, tests: 0 }); // package.json: tooling, not content
    expect(r.frameworks).toEqual({ detected: ['react'], override: null, adapters: ['content'], userConfig: null });
  });

  it('every content module without inline behavior is a clean brick: 100% C, mixing 0', async () => {
    const r = await run();
    for (const m of r.modules.filter((x) => x.path !== 'pages/inline.html')) {
      expect(m.shares).toEqual({ V: 0, B: 0, L: 0, C: 1 });
      expect(m.mixing).toBe(0);
      expect(m.drift).toBeUndefined();
    }
    expect(r.scores.median).toEqual({ V: 0, B: 0, L: 0, C: 1 });
    expect(r.scores.families.C?.modules).toBe(8); // data.json is Content; package.json is tooling and is skipped
    expect(r.version).toBe(2);
    expect(r.scores.totals.counted).toBe(r.scores.totals.C + r.scores.totals.B); // inline.html carries Behavior
  });

  it('spans cover every token and comments land in excluded', async () => {
    const r = await run();
    const card = r.modules.find((m) => m.path === 'styles/card.scss');
    expect(card?.spans.filter((s) => s.rule === 'comment')).toHaveLength(1);
    expect(card?.spans.filter((s) => s.rule === 'punctuation').every((s) => s.bucket === 'excluded')).toBe(true);
    const spanTokens = card?.spans.reduce((a, s) => a + s.tokens + s.punctuation, 0);
    expect(spanTokens).toBe(card ? card.tokens.C + card.tokens.excluded : -1);
    // @use 'variables' as v .card border-radius v.$radius hover color v.$brand .title font-weight 600
    expect(card?.tokens.C).toBe(13);
  });

  it('validates against the published output schema', async () => {
    const r = await run();
    const ajv = new Ajv2020({ strict: true, allErrors: true });
    addFormats(ajv);
    const validate = ajv.compile(schema);
    const ok = validate(JSON.parse(JSON.stringify(r)));
    expect(validate.errors).toBeNull();
    expect(ok).toBe(true);
  });
});

describe('analyze (tests are left out by default)', () => {
  const FIXTURE_REACT = fileURLToPath(new URL('../../../fixtures/react-sample/src', import.meta.url));
  const base = { adapters: [contentAdapter], toolVersion: '0.0.0-test', now: () => new Date('2026-09-22T00:00:00Z') };
  it('counts test directories and *.test/*.spec files under skipped.tests', async () => {
    const r = await analyze(FIXTURE_REACT, base);
    expect(r.skipped.tests).toBe(2);
    expect(r.modules.map((m) => m.path).some((p) => /test|spec/.test(p))).toBe(false);
  });
  it('--include-tests measures them', async () => {
    const r = await analyze(FIXTURE_REACT, { ...base, includeTests: true });
    expect(r.skipped.tests).toBe(0);
  });
});

describe('analyze (phase 3 measures)', () => {
  const FIXTURE = fileURLToPath(new URL('../../../fixtures/content-sample', import.meta.url));
  const base = { adapters: [contentAdapter], toolVersion: '0.0.0-test', now: () => new Date('2026-09-26T00:00:00Z') };
  it('inline <script> bodies and on*= values in HTML are Behavior; JSON scripts are not; sections iterate data and are not logic in rendering', async () => {
    const r = await analyze(FIXTURE, base);
    const m = r.modules.find((x) => x.path === 'pages/inline.html');
    expect(m?.tokens.B).toBeGreaterThan(0);
    expect(m?.spans.filter((s) => s.rule === 'inline-handler').map((s) => s.tokens)).toEqual([1]); // the quoted value is one token
    expect(m?.spans.some((s) => s.rule === 'inline-script')).toBe(true);
    expect(m?.spans.filter((s) => s.rule === 'inline-script').reduce((a, s) => a + s.tokens, 0)).toBe(5); // function toggle el el.classList.toggle 'open'
    expect(m?.logicInRendering).toBe(0); // {{#if}}/{{#loop}} sections iterate the data at a key; a template evaluates nothing (2026-09-27)
    expect(m?.tokens.C).toBeGreaterThan(0);
  });
  it('a class attribute in a template counts one token per class', async () => {
    const r = await analyze(FIXTURE, base);
    const m = r.modules.find((x) => x.path === 'pages/inline.html');
    const cls = m?.spans.filter((s) => s.rule === 'class-attribute') ?? [];
    expect(cls.map((s) => s.tokens)).toEqual([1]); // class="card"
    const file = { path: 'x.html', absPath: '/x/x.html', ext: '.html', source: '<div class="flex h-10 items-center sm:px-4">Hi</div>' };
    const out = contentAdapter.analyze(file, undefined);
    expect(out.tokens.filter((t) => t.rule === 'class-attribute').length).toBe(4);
    expect(out.tokens.filter((t) => t.rule === 'class-attribute').every((t) => t.bucket === 'C')).toBe(true);
  });
  it('reports mean mixing over code modules, stylesheets left out', async () => {
    const r = await analyze(FIXTURE, base);
    const styles = r.modules.filter((m) => /\.(s?css|less)$/.test(m.path)).length;
    expect(styles).toBeGreaterThan(0);
    expect(r.scores.codeModules.count).toBe(r.modules.length - styles);
    expect(r.scores.codeModules.meanMixing).not.toBeNull();
  });
  it('reports the declared-shape counts; content modules declare nothing', async () => {
    const r = await analyze(FIXTURE, base);
    expect(r.scores.shape).toEqual({ declared: 0, insideShape: 0, withSurface: 0, onSurface: 0, undeclared: r.modules.length, internalSurfaces: 0, internalModules: 0 });
  });
  it('rolls the scores up per directory, ancestors included', async () => {
    const r = await analyze(FIXTURE, base);
    expect(r.directories.map((d) => `${d.path}:${String(d.modules)}`)).toEqual(['.:8', 'pages:3', 'styles:3']);
    expect(r.directories[0]?.tokens).toBe(r.scores.totals.counted);
  });
});
