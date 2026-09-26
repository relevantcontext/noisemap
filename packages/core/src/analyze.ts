import { resolve } from 'node:path';
import { detectFrameworks } from './detect.js';
import { REPORT_VERSION } from './report.js';
import type { NoisemapReport } from './report.js';
import { consistency, countedTotal, drift, mixing, shares } from './scores.js';
import { countTokens, spansFromTokens } from './spans.js';
import type { FrameworkConfig } from './config.js';
import type { Adapter, AdapterOutput, FileInfo, MatchContext, ModuleResult } from './types.js';
import { walkFiles } from './walk.js';

export const TOKENIZER_STATEMENT =
  'Lexical tokens: identifiers, keywords, literals, and words of prose. Whitespace is never a token. ' +
  'Punctuation, comments, and scaffolding are tokens attributed to `excluded` and enter no score, ' +
  'so a formatter run cannot move a score.';

export interface AnalyzeOptions {
  /** Adapters tried in order; the first whose `match` returns true takes the file. */
  adapters: readonly Adapter[];
  /** Per-adapter configs keyed by adapter id (built-ins merged with any user override). */
  configs?: Readonly<Record<string, FrameworkConfig>>;
  /** Absolute path of the user override that was applied, recorded in the report. */
  userConfig?: string | null;
  /** Measure test files too. Default false: tests are skipped and counted under `skipped.tests`. */
  includeTests?: boolean;
  /** `--framework` override. Recorded in the report; routing is still per file. */
  framework?: string;
  toolVersion: string;
  now?: () => Date;
}

export function moduleFromOutput(file: FileInfo, out: AdapterOutput): ModuleResult {
  const tokens = countTokens(out.tokens);
  const s = shares(tokens);
  const result: ModuleResult = {
    path: file.path,
    framework: out.framework,
    tokens,
    shares: s,
    spans: spansFromTokens(out.tokens),
    mixing: mixing(s),
  };
  if (out.role !== undefined) result.role = out.role;
  if (out.expected !== undefined) result.drift = drift(tokens, out.expected, out.permittedOutside);
  return result;
}

export async function analyze(root: string, options: AnalyzeOptions): Promise<NoisemapReport> {
  const absRoot = resolve(root);
  const { files, tests } = await walkFiles(absRoot, { includeTests: options.includeTests ?? false });
  const detection = await detectFrameworks(absRoot);
  const context: MatchContext = { detected: detection.detected, override: options.framework ?? null };

  const modules: ModuleResult[] = [];
  const empty: string[] = [];
  const failed: { path: string; error: string }[] = [];
  const skippedByExt: Record<string, number> = {};
  const adaptersUsed = new Set<string>();

  for (const file of files) {
    const adapter = options.adapters.find((a) => a.match(file, context, options.configs?.[a.id]));
    if (!adapter) {
      const key = file.ext || '(none)';
      skippedByExt[key] = (skippedByExt[key] ?? 0) + 1;
      continue;
    }
    let out: AdapterOutput;
    try {
      out = adapter.analyze(file, options.configs?.[adapter.id]);
    } catch (err) {
      failed.push({ path: file.path, error: err instanceof Error ? err.message.split('\n')[0] ?? '' : String(err) });
      continue;
    }
    const mod = moduleFromOutput(file, out);
    if (countedTotal(mod.tokens) === 0) {
      empty.push(file.path);
      continue;
    }
    adaptersUsed.add(adapter.id);
    modules.push(mod);
  }

  const totals = { V: 0, B: 0, L: 0, C: 0, excluded: 0, counted: 0 };
  for (const m of modules) {
    totals.V += m.tokens.V;
    totals.B += m.tokens.B;
    totals.L += m.tokens.L;
    totals.C += m.tokens.C;
    totals.excluded += m.tokens.excluded;
  }
  totals.counted = totals.V + totals.B + totals.L + totals.C;
  const { consistency: c, median, families } = consistency(modules.map((m) => m.shares));
  const meanMixing = modules.length ? modules.reduce((a, m) => a + m.mixing, 0) / modules.length : 0;
  const meanMixingTokenWeighted = totals.counted ? modules.reduce((a, m) => a + m.mixing * countedTotal(m.tokens), 0) / totals.counted : 0;

  return {
    version: REPORT_VERSION,
    tool: { name: 'noisemap', version: options.toolVersion },
    generatedAt: (options.now ?? (() => new Date()))().toISOString(),
    root: absRoot,
    frameworks: {
      detected: detection.detected,
      override: options.framework ?? null,
      adapters: [...adaptersUsed].sort(),
      userConfig: options.userConfig ?? null,
    },
    tokenizer: TOKENIZER_STATEMENT,
    scores: { consistency: c, median, families, totals, shares: shares(totals), meanMixing, meanMixingTokenWeighted },
    modules,
    empty,
    skipped: {
      count: Object.values(skippedByExt).reduce((a, b) => a + b, 0),
      byExtension: skippedByExt,
      tests,
    },
    failed,
  };
}
