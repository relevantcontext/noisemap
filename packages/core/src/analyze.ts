import { resolve } from 'node:path';
import { detectFrameworks } from './detect.js';
import { REPORT_VERSION } from './report.js';
import type { NoisemapReport } from './report.js';
import { consistency, countedTotal, drift, mixing, shares } from './scores.js';
import { rollupDirectories } from './directories.js';
import { countTokens, spansFromTokens } from './spans.js';
import type { FrameworkConfig } from './config.js';
import type { Adapter, AdapterOutput, FileInfo, MatchContext, ModuleResult } from './types.js';
import { walkFiles } from './walk.js';

const STYLE_EXT = /\.(s?css|sass|less)$/;
/** The tool's own configuration and reports are not the application (review 3, 2026-09-29). */
const TOOL_FILES = new Set(['noisemap.config.json', 'noisemap.json', 'noisemap.wiring.json', 'noisemap.html', 'noisemap.txt', 'noisemap.wiring.txt']);

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
    logicInRendering: out.logicInRendering ?? 0,
  };
  if (out.role !== undefined) result.role = out.role;
  if (out.expected !== undefined) {
    result.drift = drift(tokens, out.expected, out.permittedOutside, out.misplacedInside);
    result.expected = [...out.expected];
  }
  if (out.base !== undefined) result.base = out.base;
  if (out.surface !== undefined) result.surface = out.surface;
  if (out.bindings !== undefined) result.bindings = out.bindings;
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

  const routed = files.filter((f) => !TOOL_FILES.has(f.path.split('/').pop() ?? '')).map((file) => ({ file, adapter: options.adapters.find((a) => a.match(file, context, options.configs?.[a.id])) ?? null }));
  const prepared = new Map<string, unknown>();
  for (const adapter of options.adapters) {
    if (!adapter.prepare) continue;
    const mine = routed.filter((r) => r.adapter === adapter).map((r) => r.file);
    if (mine.length) prepared.set(adapter.id, adapter.prepare(mine, options.configs?.[adapter.id]));
  }

  for (const { file, adapter } of routed) {
    if (!adapter) {
      const key = file.ext || '(none)';
      skippedByExt[key] = (skippedByExt[key] ?? 0) + 1;
      continue;
    }
    let out: AdapterOutput;
    try {
      out = adapter.analyze(file, options.configs?.[adapter.id], prepared.get(adapter.id));
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
  // The headline: mean mixing over code modules, everything but stylesheets. A codebase that files
  // its styles in 65 SCSS modules at zero mixing would otherwise pull an unweighted mean down against
  // one that puts its classes on its elements (2026-09-29).
  const code = modules.filter((m) => !STYLE_EXT.test(m.path));
  const codeModules = { count: code.length, meanMixing: code.length ? code.reduce((a, m) => a + m.mixing, 0) / code.length : null };
  // By operation: the same code modules read with every structural ruling off (no sanctioned-member
  // sealing, no trait absorption, no export sealing, no host inheritance), every token by what it does
  // alone. Reported beside the headline so a reader who rejects the premise that a declared structure
  // fixes the category of what sits inside it can see what the numbers do without it (2026-09-29).
  const codeByPath = new Map(code.map((m) => [m.path, m] as const));
  const byOp: number[] = [];
  for (const { file, adapter } of routed) {
    const own = codeByPath.get(file.path);
    if (!adapter || !own) continue;
    try {
      const extras = { ...((prepared.get(adapter.id) as object | undefined) ?? {}), byOperation: true };
      const mod = moduleFromOutput(file, adapter.analyze(file, options.configs?.[adapter.id], extras));
      if (countedTotal(mod.tokens) > 0) {
        byOp.push(mod.mixing);
        own.mixingByOperation = mod.mixing;
      }
    } catch {
      // already reported in `failed` by the first pass
    }
  }
  const byOperation = { count: byOp.length, meanMixing: byOp.length ? byOp.reduce((a, b) => a + b, 0) / byOp.length : null };
  // Declared shapes and surfaces: the Grammar's claim, as counts. A module is inside its shape
  // when nothing sits outside what its role expects or permits (drift 0); on its surface when it
  // defines no member the role does not sanction. Modules with no role cannot be asked either.
  const declared = modules.filter((m) => m.role !== undefined);
  const withSurface = declared.filter((m) => m.surface?.sanctioned);
  const internal = modules.filter((m) => m.surface?.sanctioned === null);
  const shape = {
    declared: declared.length,
    insideShape: declared.filter((m) => m.drift === 0).length,
    withSurface: withSurface.length,
    onSurface: withSurface.filter((m) => m.surface?.extra.length === 0).length,
    undeclared: modules.length - declared.length,
    internalSurfaces: new Set(internal.map((m) => (m.surface as { members: string[] }).members.join('|'))).size,
    internalModules: internal.length,
  };

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
    scores: { consistency: c, median, families, totals, shares: shares(totals), meanMixing, meanMixingTokenWeighted, codeModules, byOperation, shape },
    modules,
    directories: rollupDirectories(modules),
    empty,
    skipped: {
      count: Object.values(skippedByExt).reduce((a, b) => a + b, 0),
      byExtension: skippedByExt,
      tests,
    },
    failed,
  };
}
