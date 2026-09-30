import { stat } from 'node:fs/promises';
import { basename, dirname, isAbsolute, join, resolve } from 'node:path';
import type { ResolveConfig } from './config.js';

export const SOURCE_EXTENSIONS = ['.js', '.jsx', '.ts', '.tsx', '.mjs', '.cjs', '.mts', '.cts'];
const NODE_BUILTINS = new Set(['assert', 'buffer', 'child_process', 'crypto', 'events', 'fs', 'http', 'https', 'os', 'path', 'process', 'stream', 'url', 'util', 'zlib', 'worker_threads', 'readline', 'net', 'tls', 'dns', 'module']);
const STYLE_FILE = /\.(scss|sass|css|less)$/;
const ANY_EXTENSIONS = [...SOURCE_EXTENSIONS, '.json', '.html', '.scss', '.sass', '.css', '.less', '.svg', '.md', '.mdx'];

export interface Resolution {
  status: 'resolved' | 'unresolved' | 'ambiguous' | 'external';
  path?: string;
  candidates?: string[];
}

/**
 * Resolves import specifiers to files. Bare specifiers are packages when a node_modules
 * above the root holds them; otherwise they are tried against the roots (configured, then
 * discovered by trial: the analyzed directory and each parent named src or app), and the
 * first directory that has the file joins the roots for the rest of the run (ruling 11).
 */
export class Resolver {
  private readonly cache = new Map<string, boolean>();
  private readonly packageDirs = new Set<string>();
  readonly roots: string[];
  private readonly trialRoots: string[];

  /** Relative paths of every walked file, for suffix-match trial of bare specifiers. */
  private files: string[] = [];

  setFiles(relativePaths: readonly string[]): void {
    this.files = [...relativePaths];
  }

  constructor(
    readonly analyzedRoot: string,
    private readonly config: ResolveConfig,
  ) {
    this.roots = [...config.roots];
    const trial: string[] = [resolve(analyzedRoot)];
    let dir = resolve(analyzedRoot);
    for (;;) {
      const parent = dirname(dir);
      if (parent === dir) break;
      if (['src', 'app', 'lib', 'packages'].includes(basename(parent))) trial.push(parent);
      dir = parent;
    }
    this.trialRoots = trial;
  }

  private async isFile(p: string): Promise<boolean> {
    const hit = this.cache.get(p);
    if (hit !== undefined) return hit;
    const ok = await stat(p).then((s) => s.isFile()).catch(() => false);
    this.cache.set(p, ok);
    return ok;
  }

  private async isDir(p: string): Promise<boolean> {
    const key = `${p}/`;
    const hit = this.cache.get(key);
    if (hit !== undefined) return hit;
    const ok = await stat(p).then((s) => s.isDirectory()).catch(() => false);
    this.cache.set(key, ok);
    return ok;
  }

  /** A path with or without extension → the file it names, trying extensions and index files. */
  private async asFile(p: string, hint: string): Promise<string | null> {
    if (await this.isFile(p)) return p;
    const exts = /\.(scss|sass|css|less)$/.test(hint) ? ['.scss', '.sass', '.css', '.less'] : ANY_EXTENSIONS;
    for (const ext of exts) if (await this.isFile(p + ext)) return p + ext;
    // Sass partials: `variables` → `_variables.scss`
    const partial = join(dirname(p), `_${basename(p)}`);
    for (const ext of ['.scss', '.sass']) if (await this.isFile(partial + ext)) return partial + ext;
    if (await this.isDir(p)) {
      for (const ext of SOURCE_EXTENSIONS) if (await this.isFile(join(p, `index${ext}`))) return join(p, `index${ext}`);
      for (const name of ['_index.scss', 'index.scss', '_index.sass', 'index.sass']) if (await this.isFile(join(p, name))) return join(p, name);
    }
    return null;
  }

  private async isPackage(specifier: string): Promise<boolean> {
    const name = specifier.startsWith('@') ? specifier.split('/').slice(0, 2).join('/') : (specifier.split('/')[0] ?? specifier);
    if (this.packageDirs.has(name) || this.config.packages.has(name) || NODE_BUILTINS.has(name)) return true;
    let dir = resolve(this.analyzedRoot);
    for (;;) {
      if (await this.isDir(join(dir, 'node_modules', name))) {
        this.packageDirs.add(name);
        return true;
      }
      const parent = dirname(dir);
      if (parent === dir) return false;
      dir = parent;
    }
  }

  private aliasTargets(specifier: string): string[] {
    const out: string[] = [];
    for (const a of this.config.aliases) {
      const star = a.pattern.indexOf('*');
      let rest: string | null = null;
      if (star === -1) {
        if (specifier === a.pattern) rest = '';
      } else {
        const head = a.pattern.slice(0, star);
        const tail = a.pattern.slice(star + 1);
        if (specifier.startsWith(head) && specifier.endsWith(tail) && specifier.length >= head.length + tail.length) rest = specifier.slice(head.length, specifier.length - tail.length);
      }
      if (rest === null) continue;
      for (const t of a.targets) out.push(resolve(a.base, t.replace('*', rest)));
    }
    return out;
  }

  async resolve(fromFile: string, specifier: string): Promise<Resolution> {
    const spec = specifier.replace(/[?#].*$/, '');
    if (spec.startsWith('.') || isAbsolute(spec)) {
      const p = isAbsolute(spec) ? spec : resolve(dirname(fromFile), spec);
      const f = await this.asFile(p, fromFile);
      return f ? { status: 'resolved', path: f } : { status: 'unresolved' };
    }
    if (/^(node:|sass:|https?:|data:)/.test(spec)) return { status: 'external' };
    // webpack's `~pkg/...` and `~node_modules/...` mean a package
    if (spec.startsWith('~')) return { status: 'external' };

    // Sass and CSS resolve a bare name relative to the importing file before any load path.
    if (STYLE_FILE.test(fromFile)) {
      const f = await this.asFile(resolve(dirname(fromFile), spec.replace(/^~/, '')), fromFile);
      if (f) return { status: 'resolved', path: f };
    }

    const aliased = this.aliasTargets(spec);
    if (aliased.length) {
      const hits: string[] = [];
      for (const t of aliased) {
        const f = await this.asFile(t, fromFile);
        if (f) hits.push(f);
      }
      if (hits.length === 1) return { status: 'resolved', path: hits[0] as string };
      if (hits.length > 1) return { status: 'ambiguous', candidates: hits };
    }

    if (await this.isPackage(spec)) return { status: 'external' };

    // Configured roots, then trial roots; every root that has the file is a candidate.
    const hits = new Set<string>();
    for (const r of this.roots) {
      const f = await this.asFile(join(r, spec), fromFile);
      if (f) hits.add(f);
    }
    if (hits.size === 0) {
      for (const r of this.trialRoots) {
        const f = await this.asFile(join(r, spec), fromFile);
        if (f) {
          hits.add(f);
          if (!this.roots.includes(r)) this.roots.push(r);
        }
      }
    }
    if (hits.size === 0) {
      // Trial by suffix: any walked file whose path ends with the specifier (with or without an
      // extension, or as a directory index). The directory above the match becomes a root.
      const bases = [spec, ...ANY_EXTENSIONS.map((e) => spec + e), ...SOURCE_EXTENSIONS.map((e) => `${spec}/index${e}`)];
      for (const relPath of this.files) {
        for (const b of bases) {
          if (relPath === b || relPath.endsWith(`/${b}`)) {
            const abs = join(this.analyzedRoot, relPath);
            hits.add(abs);
            const rootDir = abs.slice(0, abs.length - b.length).replace(/\/$/, '') || this.analyzedRoot;
            if (!this.roots.includes(rootDir)) this.roots.push(rootDir);
          }
        }
      }
    }
    if (hits.size === 1) return { status: 'resolved', path: [...hits][0] as string };
    if (hits.size > 1) return { status: 'ambiguous', candidates: [...hits] };
    return { status: 'unresolved' };
  }
}
