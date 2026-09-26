import { readdir, readFile } from 'node:fs/promises';
import { extname, join, relative, resolve, sep } from 'node:path';
import type { FileInfo } from './types.js';

export const DEFAULT_IGNORED_DIRS: readonly string[] = [
  'node_modules',
  '.git',
  'dist',
  'build',
  'coverage',
  'out',
  '.next',
  '.turbo',
  '.cache',
];

/** Test code is not measured (ruling 2026-09-22). Directories by name, files by infix. */
export const TEST_DIRS: readonly string[] = ['test', 'tests', '__tests__', '__mocks__', '__snapshots__'];
export const TEST_FILE = /\.(test|spec)\.[^.]+$/;

export interface WalkOptions {
  ignoreDirs?: readonly string[];
  /** Measure test files too. Default false. */
  includeTests?: boolean;
}

export interface Walked {
  files: FileInfo[];
  /** Test files left out, when `includeTests` is false. */
  tests: number;
}

/** Recursively list files under `root`, skipping ignored and dot-directories. Sorted by path. */
export async function walkFiles(root: string, options: WalkOptions = {}): Promise<Walked> {
  const absRoot = resolve(root);
  const ignore = new Set(options.ignoreDirs ?? DEFAULT_IGNORED_DIRS);
  const includeTests = options.includeTests ?? false;
  const files: FileInfo[] = [];
  let tests = 0;

  async function countFiles(dir: string): Promise<number> {
    let n = 0;
    for (const entry of await readdir(dir, { withFileTypes: true })) {
      if (entry.isDirectory()) n += ignore.has(entry.name) || entry.name.startsWith('.') ? 0 : await countFiles(join(dir, entry.name));
      else if (entry.isFile() && !entry.name.startsWith('.')) n += 1;
    }
    return n;
  }

  async function visit(dir: string): Promise<void> {
    const entries = await readdir(dir, { withFileTypes: true });
    entries.sort((a, b) => (a.name < b.name ? -1 : a.name > b.name ? 1 : 0));
    for (const entry of entries) {
      const absPath = join(dir, entry.name);
      if (entry.isDirectory()) {
        if (ignore.has(entry.name) || entry.name.startsWith('.')) continue;
        if (!includeTests && TEST_DIRS.includes(entry.name)) {
          tests += await countFiles(absPath);
          continue;
        }
        await visit(absPath);
      } else if (entry.isFile()) {
        if (entry.name.startsWith('.')) continue;
        if (!includeTests && TEST_FILE.test(entry.name)) {
          tests += 1;
          continue;
        }
        const source = await readFile(absPath, 'utf8');
        files.push({
          path: relative(absRoot, absPath).split(sep).join('/'),
          absPath,
          ext: extname(entry.name).toLowerCase(),
          source,
        });
      }
    }
  }

  await visit(absRoot);
  return { files, tests };
}
