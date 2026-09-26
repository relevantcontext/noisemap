import type { ModuleResult, NoisemapReport, Shares } from '@noisemap/core';

const BAR_WIDTH = 20;

/** A proportional bar drawn with bucket letters, e.g. `VVVVVVVVVVVVBBBBBLLC`. */
export function shareBar(s: Shares, width = BAR_WIDTH): string {
  const order = ['V', 'B', 'L', 'C'] as const;
  // Largest-remainder rounding so the bar is always exactly `width` wide.
  const raw = order.map((b) => s[b] * width);
  const cells = raw.map(Math.floor);
  let remaining = width - cells.reduce((a, b) => a + b, 0);
  const byRemainder = raw
    .map((v, i) => ({ i, r: v - Math.floor(v) }))
    .sort((a, b) => b.r - a.r);
  for (const { i } of byRemainder) {
    if (remaining <= 0) break;
    cells[i] = (cells[i] ?? 0) + 1;
    remaining -= 1;
  }
  return order.map((b, i) => b.repeat(cells[i] ?? 0)).join('');
}

const pct = (n: number): string => `${String(Math.round(n * 100)).padStart(3)}%`;
const fixed = (n: number): string => n.toFixed(2);

interface Column {
  header: string;
  align: 'left' | 'right';
  cell: (m: ModuleResult) => string;
}

const COLUMNS: Column[] = [
  { header: 'file', align: 'left', cell: (m) => m.path },
  { header: 'tokens', align: 'right', cell: (m) => String(m.tokens.V + m.tokens.B + m.tokens.L + m.tokens.C) },
  { header: 'V B L C', align: 'left', cell: (m) => shareBar(m.shares) },
  { header: 'V', align: 'right', cell: (m) => pct(m.shares.V) },
  { header: 'B', align: 'right', cell: (m) => pct(m.shares.B) },
  { header: 'L', align: 'right', cell: (m) => pct(m.shares.L) },
  { header: 'C', align: 'right', cell: (m) => pct(m.shares.C) },
  { header: 'mixing', align: 'right', cell: (m) => fixed(m.mixing) },
  { header: 'role', align: 'left', cell: (m) => m.role ?? '' },
  { header: 'drift', align: 'right', cell: (m) => (m.drift === undefined ? '' : fixed(m.drift)) },
];

/** Noisiest-first table, codebase line at the bottom. Plain text; no ANSI. */
export function renderTerminal(report: NoisemapReport): string {
  const modules = [...report.modules].sort((a, b) => b.mixing - a.mixing || a.path.localeCompare(b.path));
  const hasRoles = modules.some((m) => m.role !== undefined);
  const columns = hasRoles ? COLUMNS : COLUMNS.filter((c) => c.header !== 'role' && c.header !== 'drift');

  const rows = modules.map((m) => columns.map((c) => c.cell(m)));
  const widths = columns.map((c, i) => Math.max(c.header.length, ...rows.map((r) => r[i]?.length ?? 0)));
  const line = (cells: string[]): string =>
    cells
      .map((cell, i) => {
        const w = widths[i] ?? 0;
        return columns[i]?.align === 'right' ? cell.padStart(w) : cell.padEnd(w);
      })
      .join('  ')
      .trimEnd();

  const out: string[] = [];
  out.push(line(columns.map((c) => c.header)));
  out.push(widths.map((w) => '-'.repeat(w)).join('  '));
  for (const r of rows) out.push(line(r));
  out.push('');

  const s = report.scores;
  const detected = report.frameworks.detected.length ? report.frameworks.detected.join(', ') : 'none';
  out.push(
    `codebase  ${String(report.modules.length)} modules  ${String(s.totals.counted)} tokens  ` +
      `${shareBar(s.shares)}  V ${pct(s.shares.V)} B ${pct(s.shares.B)} L ${pct(s.shares.L)} C ${pct(s.shares.C)}`,
  );
  out.push(
    `          consistency ${fixed(s.consistency)}  mean mixing ${fixed(s.meanMixing)} (by module) ${fixed(s.meanMixingTokenWeighted)} (by token)  ` +
      `median V ${pct(s.median.V)} B ${pct(s.median.B)} L ${pct(s.median.L)} C ${pct(s.median.C)}`,
  );
  const fams = (['V', 'B', 'L', 'C'] as const)
    .filter((b) => s.families[b])
    .map((b) => {
      const f = s.families[b] as { modules: number; median: Shares };
      return `${b} ${String(f.modules)} (${pct(f.median.V)} ${pct(f.median.B)} ${pct(f.median.L)} ${pct(f.median.C)})`;
    });
  out.push(`          families: ${fams.join('  ')}`);
  out.push(
    `          detected: ${detected}` +
      (report.frameworks.override ? `  override: ${report.frameworks.override}` : '') +
      `  adapters: ${report.frameworks.adapters.join(', ') || 'none'}` +
      `  skipped: ${String(report.skipped.count)}` +
      (report.skipped.tests ? `  tests: ${String(report.skipped.tests)}` : '') +
      (report.empty.length ? `  empty: ${String(report.empty.length)}` : '') +
      (report.failed.length ? `  failed: ${String(report.failed.length)}` : ''),
  );
  return out.join('\n') + '\n';
}
