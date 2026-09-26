import { readFile } from 'node:fs/promises';
import { dirname, join, resolve } from 'node:path';
import type { Bucket } from './types.js';

export type ScaffoldingKind =
  | 'imports'
  | 'exportKeywords'
  | 'functionSignatures'
  | 'classSignatures'
  | 'constructors'
  | 'superCalls'
  | 'decorators'
  | 'typeAnnotations'
  | 'directives';

export type ClassifierKind =
  | 'jsx'
  | 'jsxAttribute'
  | 'jsxExpressionCall'
  | 'jsxText'
  | 'copyAttribute'
  | 'styleAttribute'
  | 'copyString'
  | 'markupTemplate'
  | 'taggedTemplate'
  | 'call'
  | 'classMethod'
  | 'conditional'
  | 'assignment';

export interface Classifier {
  id: string;
  kind: ClassifierKind;
  match?: string;
  bucket: Bucket;
  rule?: string;
  resolve?: boolean;
  resolveBucket?: Bucket;
  minWords?: number;
  notWithin?: string[];
  allow?: { within: string; bucket: Bucket }[];
  defaults?: { operators: ('??' | '||')[]; allowCalls?: string };
}

export interface RoleConfig {
  name: string;
  match: { extends: string };
  expected: Bucket[];
  default: Bucket;
  methods?: Record<string, Bucket | { bucket: Bucket; uniform?: boolean }>;
  calls?: Record<string, { bucket: Bucket; permitted?: boolean; bare?: 'host' }>;
  /** Every counted token in the class body is the default bucket; classifiers inside do not apply. */
  uniform?: boolean;
}

export interface OpenQuestion {
  rule: string;
  call: string;
  reason: string;
}

/** Mirrors packages/configs/schema.json. */
export interface FrameworkConfig {
  $schema?: string;
  framework: string;
  detect?: {
    dependencies?: string[];
    extensions?: string[];
    plainExtensions?: string[];
    extends?: string[];
  };
  default: Bucket;
  scaffolding?: ScaffoldingKind[];
  roles?: RoleConfig[];
  classifiers: Classifier[];
  openQuestions?: OpenQuestion[];
}

/** A target repo's noisemap.config.json: partial configs keyed by framework id. */
export type UserConfigFile = Record<string, Partial<FrameworkConfig>>;

export const USER_CONFIG_FILENAME = 'noisemap.config.json';

/**
 * Merge a user override onto a built-in config. Scalars and objects replace; `classifiers`
 * and `roles` merge by id/name (same id replaces, new ids append); `openQuestions` replaces.
 */
export function mergeConfig(base: FrameworkConfig, override: Partial<FrameworkConfig> | undefined): FrameworkConfig {
  if (!override) return base;
  const merged: FrameworkConfig = { ...base, ...override, classifiers: base.classifiers, framework: base.framework };
  if (override.classifiers) {
    const byId = new Map(base.classifiers.map((c) => [c.id, c] as const));
    for (const c of override.classifiers) byId.set(c.id, c);
    merged.classifiers = [...byId.values()];
  }
  if (override.roles) {
    const byName = new Map((base.roles ?? []).map((r) => [r.name, r] as const));
    for (const r of override.roles) byName.set(r.name, r);
    merged.roles = [...byName.values()];
  }
  return merged;
}

/** Light structural check for a user override. The full schema is enforced in tests, not at runtime. */
export function assertConfigShape(value: unknown, where: string): asserts value is UserConfigFile {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) {
    throw new Error(`${where}: expected an object keyed by framework id`);
  }
  for (const [id, cfg] of Object.entries(value)) {
    if (typeof cfg !== 'object' || cfg === null) throw new Error(`${where}: "${id}" must be an object`);
    const c = cfg as Record<string, unknown>;
    if (c.classifiers !== undefined && !Array.isArray(c.classifiers)) {
      throw new Error(`${where}: "${id}.classifiers" must be an array`);
    }
    const def = c.default;
    if (def !== undefined && (typeof def !== 'string' || !['V', 'B', 'L', 'C'].includes(def))) {
      throw new Error(`${where}: "${id}.default" must be one of V, B, L, C`);
    }
  }
}

export interface LoadedConfigs {
  configs: Record<string, FrameworkConfig>;
  /** Absolute path of the user override that was applied, or null. */
  userConfig: string | null;
}

/** Walk up from `dir` for noisemap.config.json and merge it onto the built-ins. */
export async function loadConfigs(dir: string, builtins: Readonly<Record<string, FrameworkConfig>>): Promise<LoadedConfigs> {
  let current = resolve(dir);
  for (;;) {
    const candidate = join(current, USER_CONFIG_FILENAME);
    const raw = await readFile(candidate, 'utf8').catch(() => null);
    if (raw !== null) {
      const parsed: unknown = JSON.parse(raw);
      assertConfigShape(parsed, candidate);
      const configs: Record<string, FrameworkConfig> = {};
      for (const [id, base] of Object.entries(builtins)) configs[id] = mergeConfig(base, parsed[id]);
      return { configs, userConfig: candidate };
    }
    const parent = dirname(current);
    if (parent === current) return { configs: { ...builtins }, userConfig: null };
    current = parent;
  }
}
