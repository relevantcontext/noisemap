import { consistency, countedTotal, mixing, shares } from './scores.js';
import type { Shares } from './types.js';
import type { ModuleResult } from './types.js';

export interface DirectoryRollup {
  /** Directory path relative to root, `.` for the root itself. Every ancestor directory gets a row. */
  path: string;
  /** Modules under this directory, recursively. */
  modules: number;
  tokens: number;
  shares: Shares;
  meanMixing: number;
  consistency: number | null;
}

/** Per-directory rollups of the codebase scores, one row per directory that holds a module, ancestors included. */
export function rollupDirectories(modules: readonly ModuleResult[]): DirectoryRollup[] {
  const byDir = new Map<string, ModuleResult[]>();
  for (const m of modules) {
    const parts = m.path.split('/');
    parts.pop();
    for (let i = 0; i <= parts.length; i += 1) {
      const dir = i === 0 ? '.' : parts.slice(0, i).join('/');
      const list = byDir.get(dir) ?? [];
      list.push(m);
      byDir.set(dir, list);
    }
  }
  const rows: DirectoryRollup[] = [];
  for (const [path, list] of byDir) {
    const totals = { V: 0, B: 0, L: 0, C: 0, excluded: 0 };
    for (const m of list) {
      totals.V += m.tokens.V;
      totals.B += m.tokens.B;
      totals.L += m.tokens.L;
      totals.C += m.tokens.C;
    }
    rows.push({
      path,
      modules: list.length,
      tokens: list.reduce((a, m) => a + countedTotal(m.tokens), 0),
      shares: shares(totals),
      meanMixing: list.reduce((a, m) => a + mixing(m.shares), 0) / list.length,
      consistency: consistency(list.map((m) => m.shares)).consistency,
    });
  }
  return rows.sort((a, b) => a.path.localeCompare(b.path));
}
