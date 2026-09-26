import { readFile } from 'node:fs/promises';
import { dirname, join, resolve } from 'node:path';

/** A framework is detected when any marker matches a dependency name exactly or by scope prefix. */
const DEPENDENCY_MARKERS: Record<string, string[]> = {
  react: ['react'],
  // The npm package is `spyne`; plugins live under the `@spynejs/` scope.
  spynejs: ['spyne', 'spynejs', '@spynejs/'],
  angular: ['@angular/core'],
  vue: ['vue'],
  svelte: ['svelte'],
};

function matches(marker: string, deps: ReadonlySet<string>): boolean {
  if (marker.endsWith('/')) {
    for (const d of deps) if (d.startsWith(marker)) return true;
    return false;
  }
  return deps.has(marker);
}

export interface Detection {
  /** Frameworks named in the nearest package.json's dependencies, nearest first. */
  detected: string[];
  /** The package.json that was read, or null when none was found walking up from the target. */
  packageJson: string | null;
}

/** Walk up from `dir` to the nearest package.json and read its dependency names. */
export async function detectFrameworks(dir: string): Promise<Detection> {
  let current = resolve(dir);
  for (;;) {
    const candidate = join(current, 'package.json');
    const raw = await readFile(candidate, 'utf8').catch(() => null);
    if (raw !== null) {
      const deps = new Set(dependencyNames(raw));
      const detected = Object.entries(DEPENDENCY_MARKERS)
        .filter(([, markers]) => markers.some((m) => matches(m, deps)))
        .map(([id]) => id);
      return { detected, packageJson: candidate };
    }
    const parent = dirname(current);
    if (parent === current) return { detected: [], packageJson: null };
    current = parent;
  }
}

function dependencyNames(raw: string): string[] {
  let pkg: unknown;
  try {
    pkg = JSON.parse(raw);
  } catch {
    return [];
  }
  if (typeof pkg !== 'object' || pkg === null) return [];
  const names: string[] = [];
  for (const field of ['dependencies', 'devDependencies', 'peerDependencies']) {
    const section = (pkg as Record<string, unknown>)[field];
    if (typeof section === 'object' && section !== null) names.push(...Object.keys(section));
  }
  return names;
}
