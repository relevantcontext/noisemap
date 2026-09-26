import { BUCKETS } from './types.js';
import type { Bucket, Shares, TokenCounts } from './types.js';

export function countedTotal(tokens: TokenCounts): number {
  return tokens.V + tokens.B + tokens.L + tokens.C;
}

/** Bucket share of counted tokens. All zeros when nothing is counted. */
export function shares(tokens: TokenCounts): Shares {
  const total = countedTotal(tokens);
  const s: Shares = { V: 0, B: 0, L: 0, C: 0 };
  if (total === 0) return s;
  for (const b of BUCKETS) s[b] = tokens[b] / total;
  return s;
}

/** Mixing = 1 − largest bucket share. 0 = one bucket. */
export function mixing(s: Shares): number {
  return 1 - Math.max(s.V, s.B, s.L, s.C);
}

/**
 * Drift = share of counted tokens outside the role's expected buckets, minus tokens the
 * config permits there (e.g. SpyneTrait calls in a Channel).
 */
export function drift(tokens: TokenCounts, expected: readonly Bucket[], permittedOutside = 0): number {
  const total = countedTotal(tokens);
  if (total === 0) return 0;
  let outside = 0;
  for (const b of BUCKETS) if (!expected.includes(b)) outside += tokens[b];
  return Math.max(0, outside - permittedOutside) / total;
}

/** Component-wise median of share vectors. */
export function medianVector(vectors: readonly Shares[]): Shares {
  const m: Shares = { V: 0, B: 0, L: 0, C: 0 };
  if (vectors.length === 0) return m;
  for (const b of BUCKETS) {
    const sorted = vectors.map((v) => v[b]).sort((a, c) => a - c);
    const mid = Math.floor(sorted.length / 2);
    const hi = sorted[mid] ?? 0;
    const lo = sorted[mid - 1] ?? hi;
    m[b] = sorted.length % 2 === 1 ? hi : (lo + hi) / 2;
  }
  return m;
}

export function euclidean(a: Shares, b: Shares): number {
  let sum = 0;
  for (const k of BUCKETS) sum += (a[k] - b[k]) ** 2;
  return Math.sqrt(sum);
}

/** The bucket with the largest share. Ties go to the earlier bucket in V, B, L, C order. */
export function dominant(s: Shares): Bucket {
  let best: Bucket = 'V';
  for (const b of BUCKETS) if (s[b] > s[best]) best = b;
  return best;
}

export interface Family {
  /** Modules whose dominant bucket is this one. */
  modules: number;
  /** Component-wise median shape of those modules. */
  median: Shares;
}

export interface Consistency {
  consistency: number;
  /** Component-wise median of every module's shape, for reference. Not what consistency measures. */
  median: Shares;
  /** One entry per dominant bucket that has at least one module. */
  families: Partial<Record<Bucket, Family>>;
}

/**
 * Consistency = mean Euclidean distance of each module's share vector from the median shape
 * of its own family, where a module's family is its dominant bucket (ruling 2026-09-23).
 * 0 = every kind of module has one shape, whether that is four clean shapes or one shared
 * mixed shape. High = modules of the same kind do not share a shape. Max is √2.
 * Unweighted: a 40-token module and a 4,000-token module count the same.
 */
export function consistency(vectors: readonly Shares[]): Consistency {
  const median = medianVector(vectors);
  const families: Partial<Record<Bucket, Family>> = {};
  if (vectors.length === 0) return { consistency: 0, median, families };
  const groups = new Map<Bucket, Shares[]>();
  for (const v of vectors) {
    const d = dominant(v);
    const g = groups.get(d) ?? [];
    g.push(v);
    groups.set(d, g);
  }
  const centers = new Map<Bucket, Shares>();
  for (const b of BUCKETS) {
    const g = groups.get(b);
    if (!g) continue;
    const m = medianVector(g);
    centers.set(b, m);
    families[b] = { modules: g.length, median: m };
  }
  const sum = vectors.reduce((acc, v) => acc + euclidean(v, centers.get(dominant(v)) as Shares), 0);
  return { consistency: sum / vectors.length, median, families };
}
