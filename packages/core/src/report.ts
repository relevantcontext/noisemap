import type { DirectoryRollup } from './directories.js';
import type { Family } from './scores.js';
import type { Bucket, ModuleResult, Shares, TokenCounts } from './types.js';

/**
 * Bump when the JSON shape changes incompatibly. Renderers check this field.
 * 2 (2026-09-23): consistency is measured against the module's family median, not the
 * codebase median; `scores.families` added.
 */
export const REPORT_VERSION = 2;

export interface CodebaseScores {
  /** Mean distance of each module's share vector from its family's median; null when no family has two modules. See scores.ts. */
  consistency: number | null;
  /** Component-wise median share vector across all modules, for reference. */
  median: Shares;
  /** Per dominant bucket: how many modules, and their median shape. Consistency is measured against these. */
  families: Partial<Record<Bucket, Family>>;
  /** Token totals across all modules, plus `counted` = V+B+L+C. */
  totals: TokenCounts & { counted: number };
  /** Bucket share of all counted tokens across the codebase. */
  shares: Shares;
  /** Unweighted mean of module mixing scores: every module counts once. */
  meanMixing: number;
  /** Token-weighted mean of module mixing: every counted token counts once. */
  meanMixingTokenWeighted: number;
  /** The headline: mean mixing over code modules (everything but stylesheets), so the score does not depend on how a framework files its styles. Null with no code modules. */
  codeModules: { count: number; meanMixing: number | null };
  /**
   * The same code modules read by operation alone, every structural ruling off: no sanctioned-member
   * sealing, no trait absorption, no export sealing, no host inheritance. Beside the headline so the
   * reader can see whether the ranking depends on the rulings (2026-09-29). Null with no code modules.
   */
  byOperation: { count: number; meanMixing: number | null };
  /**
   * The declared-shape counts (2026-09-27): modules with a role, how many keep every token
   * inside what the role expects or permits, how many define only sanctioned members; modules
   * with no role, and how many distinct internal surfaces they show.
   */
  shape: { declared: number; insideShape: number; withSurface: number; onSurface: number; undeclared: number; internalSurfaces: number; internalModules: number };
}

export interface NoisemapReport {
  version: typeof REPORT_VERSION;
  tool: { name: 'noisemap'; version: string };
  generatedAt: string;
  /** Absolute path of the analyzed directory. Module paths are relative to it. */
  root: string;
  frameworks: {
    /** From the nearest package.json's dependencies. */
    detected: string[];
    /** `--framework` value, if given. */
    override: string | null;
    /** Adapter ids that produced at least one module. */
    adapters: string[];
    /** Absolute path of the noisemap.config.json that was applied, or null. */
    userConfig: string | null;
  };
  /** Human-readable statement of the counting unit, so a reader of the JSON knows what a token is. */
  tokenizer: string;
  scores: CodebaseScores;
  /** Modules with at least one counted token, in walk order (sorted by path). */
  modules: ModuleResult[];
  /** The codebase scores per directory, ancestors included; `.` is the root. */
  directories: DirectoryRollup[];
  /** Files an adapter accepted but which had zero counted tokens. Excluded from scores. */
  empty: string[];
  /** Files no adapter accepted, plus test files left out by default. Neither is in `count`'s modules. */
  skipped: { count: number; byExtension: Record<string, number>; tests: number };
  /** Files an adapter accepted but could not analyze (parse errors). Excluded from every score. */
  failed: { path: string; error: string }[];
}
