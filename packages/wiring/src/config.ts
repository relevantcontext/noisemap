import { readFile } from 'node:fs/promises';
import { dirname, join, resolve } from 'node:path';

export interface PathAlias {
  /** Pattern like `@/*` or `components/*`; `*` matches the rest. */
  pattern: string;
  /** Targets relative to `base`, like `./app/*`. */
  targets: string[];
  base: string;
}

export interface ResolveConfig {
  /** Absolute directories tried, in order, for bare imports. */
  roots: string[];
  aliases: PathAlias[];
  /** Absolute paths declared as entries. */
  entries: string[];
  /** Package names declared in the nearest package.json; external even without node_modules. */
  packages: Set<string>;
}

/** Strip line and block comments and trailing commas so tsconfig-style JSON parses. String-aware. */
export function parseJsonc(text: string): unknown {
  let out = '';
  let i = 0;
  const n = text.length;
  while (i < n) {
    const ch = text[i] as string;
    if (ch === '"') {
      let j = i + 1;
      while (j < n && text[j] !== '"') j += text[j] === '\\' ? 2 : 1;
      out += text.slice(i, j + 1);
      i = j + 1;
      continue;
    }
    if (ch === '/' && text[i + 1] === '/') {
      while (i < n && text[i] !== '\n') i += 1;
      continue;
    }
    if (ch === '/' && text[i + 1] === '*') {
      const close = text.indexOf('*/', i + 2);
      i = close === -1 ? n : close + 2;
      continue;
    }
    out += ch;
    i += 1;
  }
  return JSON.parse(out.replace(/,(\s*[}\]])/g, '$1'));
}

async function readJsonc(path: string): Promise<Record<string, unknown> | null> {
  const raw = await readFile(path, 'utf8').catch(() => null);
  if (raw === null) return null;
  try {
    const v = parseJsonc(raw);
    return typeof v === 'object' && v !== null ? (v as Record<string, unknown>) : null;
  } catch {
    return null;
  }
}

/** Nearest file named `name` walking up from `dir`, or null. */
async function findUp(dir: string, name: string): Promise<string | null> {
  let current = resolve(dir);
  for (;;) {
    const candidate = join(current, name);
    const raw = await readFile(candidate, 'utf8').catch(() => null);
    if (raw !== null) return candidate;
    const parent = dirname(current);
    if (parent === current) return null;
    current = parent;
  }
}

/**
 * Resolution inputs, in the order ruling 11 states: tsconfig/jsconfig `paths`, package.json
 * `imports`, noisemap.config.json `resolve.roots` and `entries`. Roots found by trial are
 * added at run time by the resolver.
 */
export async function loadResolveConfig(root: string): Promise<ResolveConfig> {
  const cfg: ResolveConfig = { roots: [], aliases: [], entries: [], packages: new Set() };

  for (const name of ['tsconfig.json', 'jsconfig.json']) {
    const file = await findUp(root, name);
    if (!file) continue;
    const json = await readJsonc(file);
    const co = json?.compilerOptions;
    if (typeof co !== 'object' || co === null) continue;
    const opts = co as Record<string, unknown>;
    const baseUrl = typeof opts.baseUrl === 'string' ? resolve(dirname(file), opts.baseUrl) : dirname(file);
    const paths = opts.paths;
    if (typeof paths === 'object' && paths !== null) {
      for (const [pattern, targets] of Object.entries(paths as Record<string, unknown>)) {
        if (Array.isArray(targets)) cfg.aliases.push({ pattern, targets: targets.filter((t): t is string => typeof t === 'string'), base: baseUrl });
      }
    }
    if (typeof opts.baseUrl === 'string') cfg.roots.push(baseUrl);
    break;
  }

  const pkgFile = await findUp(root, 'package.json');
  if (pkgFile) {
    const pkg = await readJsonc(pkgFile);
    for (const field of ['dependencies', 'devDependencies', 'peerDependencies', 'optionalDependencies']) {
      const section = pkg?.[field];
      if (typeof section === 'object' && section !== null) for (const name of Object.keys(section)) cfg.packages.add(name);
    }
    const imports = pkg?.imports;
    if (typeof imports === 'object' && imports !== null) {
      for (const [pattern, target] of Object.entries(imports as Record<string, unknown>)) {
        const t = typeof target === 'string' ? target : typeof target === 'object' && target !== null ? (target as Record<string, unknown>).default : undefined;
        if (typeof t === 'string') cfg.aliases.push({ pattern, targets: [t], base: dirname(pkgFile) });
      }
    }
  }

  const userFile = await findUp(root, 'noisemap.config.json');
  if (userFile) {
    const user = await readJsonc(userFile);
    const r = user?.resolve;
    if (typeof r === 'object' && r !== null) {
      const roots = (r as Record<string, unknown>).roots;
      if (Array.isArray(roots)) for (const x of roots) if (typeof x === 'string') cfg.roots.push(resolve(dirname(userFile), x));
    }
    const entries = user?.entries;
    if (Array.isArray(entries)) for (const x of entries) if (typeof x === 'string') cfg.entries.push(resolve(dirname(userFile), x));
  }
  return cfg;
}
