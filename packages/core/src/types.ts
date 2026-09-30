/** The four buckets. Every counted token lands in exactly one. */
export type Bucket = 'V' | 'B' | 'L' | 'C';

export const BUCKETS: readonly Bucket[] = ['V', 'B', 'L', 'C'];

/** Which adapter an input file is routed to. Angular, Vue, Svelte will extend this union. */
export type FrameworkId = 'react' | 'spynejs' | 'content';

export interface FileInfo {
  /** Path relative to the analyzed root, POSIX separators. */
  path: string;
  /** Absolute path on disk. */
  absPath: string;
  /** Lower-cased extension including the dot, e.g. `.scss`. */
  ext: string;
  source: string;
}

/**
 * One lexical token with its attribution. Adapters produce these; core turns them into
 * counts and spans. Whitespace is never a token. Comments are tokens attributed to
 * `excluded` so click-to-detail can still show them.
 */
export interface Token {
  start: number;
  end: number;
  bucket: Bucket | 'excluded';
  /** The rule that assigned this token, e.g. `method:addActionListeners` or `scaffolding`. */
  rule: string;
  /** Outside the module's expected shape, but permitted there by a rule (a trait call in a Channel). Not drift. */
  permitted?: boolean;
  /** Inside a member the role does not sanction (a method of its own on a ViewStream): out of place whatever its bucket. Drift. */
  misplaced?: boolean;
}

/** A contiguous run of same-bucket, same-rule tokens, with any punctuation between them absorbed. */
export interface Span {
  start: number;
  end: number;
  bucket: Bucket | 'excluded';
  rule: string;
  /** Tokens in the span that carry its bucket and rule. */
  tokens: number;
  /** Punctuation tokens absorbed into the span. Always excluded. */
  punctuation: number;
  /** Every token in the span is permitted outside the expected shape. */
  permitted?: boolean;
  /** Every token in the span sits in a member outside the sanctioned surface: out of place in full. */
  misplaced?: boolean;
}

/**
 * The members a module defines against the surface its role sanctions (the Grammar's
 * `wiring-surface-only-on-viewstream`: a ViewStream carries only its four members). For a
 * module with no declared role, `sanctioned` is null and `members` lists the internal surface
 * the tool could see (hooks called, handlers defined), so distinct surfaces can be counted.
 */
export interface Surface {
  sanctioned: string[] | null;
  members: string[];
  /** Members outside the sanctioned surface. Empty when `sanctioned` is null. */
  extra: string[];
}

export interface TokenCounts {
  V: number;
  B: number;
  L: number;
  C: number;
  excluded: number;
}

export type Shares = Record<Bucket, number>;

export interface ModuleResult {
  path: string;
  framework: string;
  /** Declared role, if the adapter detected one (e.g. `ViewStream`). */
  role?: string;
  tokens: TokenCounts;
  /** Bucket share of counted tokens (V+B+L+C). Sums to 1. */
  shares: Shares;
  spans: Span[];
  /** 1 − largest bucket share. 0 = one bucket. */
  mixing: number;
  /** Share of counted tokens outside the role's expected shape. Declared roles only. */
  drift?: number;
  /** The buckets the declared role expects. Declared roles only. */
  expected?: Bucket[];
  /** The role's default bucket: the color the module is, for tokens in their place. Declared roles only. */
  base?: Bucket;
  /** Members defined against the sanctioned surface; present for declared roles and for modules with an internal surface worth counting. */
  surface?: Surface;
  /** See `AdapterOutput.bindings`. */
  bindings?: { host: string; kind: string }[];
  /** The module's mixing read by operation alone (see `scores.byOperation`). Code modules only (2026-09-29). */
  mixingByOperation?: number;
  /** Logic tokens whose innermost rendering range is a JSX element or a template directive. */
  logicInRendering: number;
}

/** What an adapter returns; core derives counts, shares, mixing, and spans from the tokens. */
export interface AdapterOutput {
  framework: string;
  role?: string;
  tokens: Token[];
  /** Logic tokens inside rendering ranges (JSX elements, template directives). Default 0. */
  logicInRendering?: number;
  /** Buckets the role expects. Present only for declared roles; core derives drift from it. */
  expected?: Bucket[];
  /** Tokens permitted outside the expected shape (e.g. trait calls in a Channel). Not drift. */
  permittedOutside?: number;
  /** Tokens inside the expected shape that sit in an unsanctioned member: counted as drift anyway. */
  misplacedInside?: number;
  /** The role's default bucket. Present with `role`. */
  base?: Bucket;
  /** See `Surface`. */
  surface?: Surface;
  /** For a trait: the host classes that bind it, with their kind (`view`, `channel`). What the adapter read, so a reader can see why a shared trait absorbs both layers (2026-09-29). */
  bindings?: { host: string; kind: string }[];
}

import type { FrameworkConfig } from './config.js';

/** What routing knows about the codebase when an adapter is asked whether it wants a file. */
export interface MatchContext {
  /** Frameworks detected from package.json. */
  detected: readonly string[];
  /** `--framework` override, if any. */
  override: string | null;
}

export interface Adapter {
  id: FrameworkId;
  match(file: FileInfo, context: MatchContext, config: FrameworkConfig | undefined): boolean;
  /**
   * Optional one-time pass over every file the adapter will analyze, before any `analyze` call.
   * Whatever it returns is handed back to `analyze` as `prepared`. This is how a rule can depend
   * on another file (a trait's host, a trait method's existence) without a second walk.
   */
  prepare?(files: readonly FileInfo[], config: FrameworkConfig | undefined): unknown;
  analyze(file: FileInfo, config: FrameworkConfig | undefined, prepared?: unknown): AdapterOutput;
}
