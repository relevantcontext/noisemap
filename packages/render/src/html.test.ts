import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import type { NoisemapReport } from '@noisemap/core';
import { renderHtml } from './html.js';
import { readFileSync } from 'node:fs';
import type { WiringResult } from '@noisemap/wiring';

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

describe('renderHtml with wiring', () => {
  const report = JSON.parse(readFileSync(fileURLToPath(new URL('../../../samples/fixtures/spyne/noisemap.json', import.meta.url)), 'utf8')) as NoisemapReport;
  const wiring = JSON.parse(readFileSync(fileURLToPath(new URL('../../../samples/fixtures/spyne/noisemap.wiring.json', import.meta.url)), 'utf8')) as WiringResult;
  it('embeds the wiring without its site list and shows the Wiring tab', () => {
    const html = renderHtml(report, { wiring });
    expect(html).toContain('id="tab-wiring"');
    const start = html.indexOf('id="nm-wiring" type="application/json">') + 'id="nm-wiring" type="application/json">'.length;
    const w = JSON.parse(html.slice(start, html.indexOf('</script>', start))) as { sites: unknown[]; vocabulary: unknown[]; modules: Record<string, unknown> };
    expect(w.sites).toEqual([]);
    expect(w.vocabulary.length).toBeGreaterThan(0);
    expect(Object.keys(w.modules).length).toBe(Object.keys(wiring.modules).length);
  });
  it('without wiring the tab is present but disabled by the page script', () => {
    const html = renderHtml(report);
    expect(html).toContain('id="nm-wiring" type="application/json">null</script>');
  });
});
