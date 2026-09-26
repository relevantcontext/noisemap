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
}

/** What an adapter returns; core derives counts, shares, mixing, and spans from the tokens. */
export interface AdapterOutput {
  framework: string;
  role?: string;
  tokens: Token[];
  /** Buckets the role expects. Present only for declared roles; core derives drift from it. */
  expected?: Bucket[];
  /** Tokens permitted outside the expected shape (e.g. trait calls in a Channel). Not drift. */
  permittedOutside?: number;
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
  analyze(file: FileInfo, config: FrameworkConfig | undefined): AdapterOutput;
}
