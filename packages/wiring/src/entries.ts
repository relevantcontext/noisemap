import { basename } from 'node:path';
import type { FileInfo } from '@noisemap/core';

/** Entry files by boot call or framework file convention (ruling 11). */
export function detectEntries(files: readonly FileInfo[], bootsByPath: ReadonlyMap<string, string[]>, detected: readonly string[], configured: readonly string[], root = ''): string[] {
  const entries = new Set<string>();
  const rootName = basename(root);
  for (const f of files) {
    if (configured.includes(f.absPath)) entries.add(f.path);
    const boots = bootsByPath.get(f.path) ?? [];
    if (boots.some((b) => /^(new SpyneApp|SpyneApp\.init|createRoot|hydrateRoot|ReactDOM\.render)$/.test(b))) entries.add(f.path);
  }
  if (detected.includes('react')) {
    for (const f of files) {
      // Next.js app router: page/layout/route/template/loading/error/not-found files; pages router: pages/**
      const inApp = rootName === 'app' || /(^|\/)app\//.test(f.path);
      const inPages = rootName === 'pages' || /(^|\/)pages\//.test(f.path);
      if (inApp && /(^|\/)(page|layout|route|template|loading|error|not-found|default)\.(jsx?|tsx?|mdx?)$/.test(f.path)) entries.add(f.path);
      if (inPages && /\.(jsx?|tsx?|mdx?)$/.test(f.path) && !(f.path.split('/').pop() ?? '').startsWith('_')) entries.add(f.path);
      // Remix / React Router file routes
      if (/(^|\/)app\/(root\.(jsx?|tsx?)|routes\/)/.test(f.path)) entries.add(f.path);
    }
  }
  return [...entries].sort();
}
