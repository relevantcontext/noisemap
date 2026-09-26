import type { ModuleResult } from '@noisemap/core';
import { shareBar } from './terminal.js';

/**
 * The file, one span per line: `[bucket rule] text`. Whitespace inside a span is collapsed;
 * excluded spans are shown as `[- rule]`. Spans that are only punctuation are omitted.
 */
export function renderExplain(source: string, mod: ModuleResult): string {
  const out: string[] = [];
  const t = mod.tokens;
  out.push(`${mod.path}  ${mod.framework}${mod.role ? `  role ${mod.role}` : ''}`);
  out.push(
    `tokens ${String(t.V + t.B + t.L + t.C)}  ${shareBar(mod.shares)}  V ${String(t.V)} B ${String(t.B)} L ${String(t.L)} C ${String(t.C)}  excluded ${String(t.excluded)}  mixing ${mod.mixing.toFixed(2)}` +
      (mod.drift === undefined ? '' : `  drift ${mod.drift.toFixed(2)}`),
  );
  out.push('(punctuation-only spans omitted)');
  out.push('');
  for (const s of mod.spans) {
    if (s.rule === 'punctuation') continue;
    const text = source.slice(s.start, s.end).replace(/\s+/g, ' ').trim();
    const tag = s.bucket === 'excluded' ? '-' : s.bucket;
    out.push(`[${tag} ${s.rule}] ${text.length > 160 ? text.slice(0, 157) + '...' : text}`);
  }
  return out.join('\n') + '\n';
}
