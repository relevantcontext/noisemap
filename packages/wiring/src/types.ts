/** Wiring contract, version 1. Mirrors packages/wiring/schema/noisemap-wiring.schema.json. */
export const WIRING_VERSION = 1;

export type SiteKind = 'import' | 'call' | 'handler' | 'prop' | 'dispatch' | 'channel' | 'listener' | 'template-key' | 'context' | 'store';
export type SiteClass = 'declared' | 'opaque';

/** A place the code hands control or data to something named elsewhere (ruling 13). */
export interface Site {
  module: string;
  start: number;
  end: number;
  kind: SiteKind;
  class: SiteClass;
  /** What the code names, when declared; a short description of why it is opaque otherwise. */
  label: string;
}

export type EdgeKind =
  | 'import'
  | 'listener-method'
  | 'listener-action'
  | 'action-registration'
  | 'channel-binding'
  | 'broadcast-selector'
  | 'template-key'
  | 'handler-path'
  | 'action-type'
  | 'context'
  | 'route';

/**
 * `unknown` (2026-09-27): internal wiring the analyzer cannot model, such as a selector whose
 * elements child views supply or a template bound to data the class does not declare. Not a
 * package boundary, so never `external`; not a failure, so never in the resolution ratio.
 */
export type EdgeStatus = 'resolved' | 'unresolved' | 'ambiguous' | 'external' | 'unknown';

export interface Endpoint {
  module: string;
  start?: number;
  end?: number;
}

export interface Edge {
  id: string;
  kind: EdgeKind;
  from: Endpoint;
  /** Absent when unresolved or external. */
  to?: Endpoint;
  label: string;
  status: EdgeStatus;
  verified: 'static' | 'inferred';
  /** Candidate modules when ambiguous. */
  candidates?: string[];
  /** For handler paths: the hops between from and to, in order. */
  hops?: Endpoint[];
  /** Why an edge is unknown: what the analyzer could not follow (a hook result, a computed name). Not a finding. */
  reason?: string;
}

export type FindingKind = 'unresolved' | 'ambiguous' | 'opaque' | 'unreachable';

export interface Finding {
  kind: FindingKind;
  module: string;
  start: number;
  end: number;
  /** Edge id for unresolved/ambiguous; absent for opaque sites. */
  edge?: string;
  message: string;
  candidates?: string[];
}

export interface WiringNode {
  id: string;
  kind: 'module';
  framework: string;
  role?: string;
  entry: boolean;
}

export interface ModuleWiring {
  edges: { out: number; in: number; unresolved: number; ambiguous: number };
  sites: { declared: number; opaque: number };
  /** declared / (declared + opaque); null when the module has no sites. */
  discernibility: number | null;
  /** resolved / declared edges going out; null when none. */
  resolution: number | null;
  /**
   * What must be read to change this module safely: itself plus every module a resolved
   * edge connects it to, in either direction. `tokens` is null when Shape counts were not
   * supplied.
   */
  workingSet: { modules: number; tokens: number | null; counterparts: string[]; /** Counterparts Shape did not count (images, data files, skipped files); their tokens are not in `tokens`. */ unmeasured: number };
  /** Mean directory distance to the counterparts (segments that differ); null when none. */
  locality: number | null;
}

export interface WiringSummary {
  byKind: Record<string, { resolved: number; unresolved: number; ambiguous: number; external: number; unknown: number }>;
  sites: { declared: number; opaque: number };
  discernibility: number | null;
  resolution: number | null;
  /**
   * Named connection sites (listener, channel, dispatch, template-key, context, store) over
   * those plus direct function hand-offs (handler sites): how much of the app's behavior
   * flows through declared names rather than functions passed by hand. Null when neither exists.
   */
  vocabularyShare: number | null;
  /**
   * Working set across modules: median modules and tokens; token-weighted median tokens. The
   * tokens are Shape's counted tokens, not a model's context tokens. `unmeasuredCounterparts`
   * is how many counterpart links point at files Shape did not count.
   */
  workingSet: { medianModules: number | null; medianTokens: number | null; tokenWeightedMedianTokens: number | null; unmeasuredCounterparts: number };
  /** Mean locality across modules that have counterparts. */
  locality: number | null;
  entries: string[];
  /** Resolution roots discovered by trial, plus configured ones. */
  roots: string[];
}

/** A site that speaks a vocabulary name, and in what role. */
export interface VocabularyUse {
  module: string;
  start: number;
  end: number;
  role: 'registers' | 'emits' | 'listens' | 'binds' | 'names' | 'mentions';
}

/** One name the app speaks: an action or a channel, with everyone who uses it. */
export interface VocabularyEntry {
  name: string;
  kind: 'action' | 'channel' | 'context' | 'route' | 'handler';
  /** The framework supplies it (CHANNEL_ROUTE, CHANNEL_UI_*, CHANNEL_WINDOW_*, CHANNEL_LIFECYCLE_*). */
  framework: boolean;
  uses: VocabularyUse[];
}

export interface WiringResult {
  version: typeof WIRING_VERSION;
  tool: { name: 'noisemap'; version: string };
  generatedAt: string;
  root: string;
  nodes: WiringNode[];
  edges: Edge[];
  sites: Site[];
  findings: Finding[];
  /** Every action and channel name the app speaks, with who registers, emits, listens, binds. */
  vocabulary: VocabularyEntry[];
  modules: Record<string, ModuleWiring>;
  summary: WiringSummary;
}
