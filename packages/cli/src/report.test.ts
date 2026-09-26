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
      'pages/about.md',
      'pages/index.html',
      'styles/_variables.scss',
      'styles/card.scss',
      'styles/legacy.css',
    ]);
    expect(r.empty).toEqual(['styles/empty.scss']);
    expect(r.skipped).toEqual({ count: 2, byExtension: { '.json': 2 }, tests: 0 });
    expect(r.frameworks).toEqual({ detected: ['react'], override: null, adapters: ['content'], userConfig: null });
  });

  it('every content module is a clean brick: 100% C, mixing 0, consistency 0', async () => {
    const r = await run();
    for (const m of r.modules) {
      expect(m.shares).toEqual({ V: 0, B: 0, L: 0, C: 1 });
      expect(m.mixing).toBe(0);
      expect(m.drift).toBeUndefined();
    }
    expect(r.scores.consistency).toBe(0);
    expect(r.scores.median).toEqual({ V: 0, B: 0, L: 0, C: 1 });
    expect(r.scores.families).toEqual({ C: { modules: 6, median: { V: 0, B: 0, L: 0, C: 1 } } });
    expect(r.version).toBe(2);
    expect(r.scores.totals.counted).toBe(r.scores.totals.C);
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
