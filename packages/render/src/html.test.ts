import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import type { NoisemapReport } from '@noisemap/core';
import { renderHtml } from './html.js';
import { readFileSync } from 'node:fs';

const sample = fileURLToPath(new URL('../../../samples/fixtures/spyne/noisemap.json', import.meta.url));

describe('renderHtml', () => {
  const report = JSON.parse(readFileSync(sample, 'utf8')) as NoisemapReport;
  const html = renderHtml(report, { sources: { 'components/menu-view.js': 'class MenuView extends ViewStream {}' } });

  it('is a single self-contained document with the data embedded', () => {
    expect(html.startsWith('<!doctype html>')).toBe(true);
    expect(html).not.toMatch(/<script[^>]+src=/);
    expect(html).not.toMatch(/<link[^>]+href=/);
    expect(html).toContain('id="nm-data"');
    const json = html.slice(html.indexOf('type="application/json">') + 'type="application/json">'.length, html.indexOf('</script>', html.indexOf('nm-data')));
    const data = JSON.parse(json) as { modules: { p: string; s: number[][] }[]; rules: string[]; src: Record<string, string> };
    expect(data.modules.map((m) => m.p)).toEqual(report.modules.map((m) => m.path));
    expect(data.rules).toContain('method:constructor');
    expect(data.src['components/menu-view.js']).toContain('MenuView');
  });

  it('spans round-trip through the compact form', () => {
    const json = html.slice(html.indexOf('type="application/json">') + 'type="application/json">'.length, html.indexOf('</script>', html.indexOf('nm-data')));
    const data = JSON.parse(json) as { modules: { s: number[][] }[] };
    const first = report.modules[0];
    expect(data.modules[0]?.s.length).toBe(first?.spans.length);
    expect(data.modules[0]?.s[0]?.slice(0, 2)).toEqual([first?.spans[0]?.start, first?.spans[0]?.end]);
  });

  it('escapes closing tags inside embedded data', () => {
    const r: NoisemapReport = { ...report, root: '/tmp/</script><script>alert(1)</script>' };
    const out = renderHtml(r);
    const dataStart = out.indexOf('id="nm-data"');
    const dataEnd = out.indexOf('</script>', dataStart);
    expect(out.slice(dataStart, dataEnd)).not.toContain('</script');
  });

  it('carries the explainer, the sort toggle, and a table view', () => {
    expect(html).toContain('Every module is a brick');
    expect(html).toContain('largest first');
    expect(html).toContain('noisiest first');
    expect(html).toContain('Table view');
    expect(html).toContain('prefers-color-scheme: dark');
  });
});
