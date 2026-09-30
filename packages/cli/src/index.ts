import { spawn } from 'node:child_process';
import { readFile, writeFile } from 'node:fs/promises';
import { dirname, join, resolve } from 'node:path';
import { contentAdapter } from '@noisemap/adapter-content';
import { reactAdapter } from '@noisemap/adapter-react';
import { spynejsAdapter } from '@noisemap/adapter-spynejs';
import { builtinConfigs } from '@noisemap/configs';
import { analyze, detectFrameworks, loadConfigs, moduleFromOutput } from '@noisemap/core';
import type { Adapter, FileInfo, NoisemapReport } from '@noisemap/core';
import { renderExplain, renderHtml, renderTerminal, renderWiring, renderWiringFor } from '@noisemap/render';
import { analyzeWiring } from '@noisemap/wiring';
import type { WiringResult } from '@noisemap/wiring';
import { Command } from 'commander';
import pkg from '../package.json' with { type: 'json' };

/** Routing order: role-bearing frameworks first, React next, Content last (by extension only). */
const ADAPTERS: readonly Adapter[] = [spynejsAdapter, reactAdapter, contentAdapter];

interface CommonOptions {
  json?: boolean;
  framework?: string;
  includeTests?: boolean;
}

interface MapOptions extends CommonOptions {
  open?: boolean;
  source?: boolean;
  wiring?: boolean;
}

/** Run the wiring over the same root, with the Shape report's token counts and roles. */
async function wiringFor(dir: string, report: NoisemapReport, includeTests: boolean): Promise<WiringResult> {
  const tokens: Record<string, number> = {};
  const roles: Record<string, string | undefined> = {};
  const frameworks: Record<string, string> = {};
  for (const m of report.modules) {
    tokens[m.path] = m.tokens.V + m.tokens.B + m.tokens.L + m.tokens.C;
    roles[m.path] = m.role;
    frameworks[m.path] = m.framework;
  }
  return analyzeWiring(dir, { toolVersion: pkg.version, includeTests, tokens, roles, frameworks });
}

/** Read each module's source from the analyzed root, for click-to-detail in the map. */
async function readSources(report: NoisemapReport): Promise<Record<string, string>> {
  const sources: Record<string, string> = {};
  await Promise.all(
    report.modules.map(async (m) => {
      const text = await readFile(join(report.root, m.path), 'utf8').catch(() => null);
      if (text !== null) sources[m.path] = text;
    }),
  );
  return sources;
}

function openInBrowser(file: string): void {
  const cmd = process.platform === 'darwin' ? 'open' : process.platform === 'win32' ? 'cmd' : 'xdg-open';
  const args = process.platform === 'win32' ? ['/c', 'start', '', file] : [file];
  const child = spawn(cmd, args, { detached: true, stdio: 'ignore' });
  child.on('error', () => {
    process.stderr.write(`noisemap map: could not open ${file}; open it in a browser.\n`);
  });
  child.unref();
}

async function run(dir: string, opts: CommonOptions): Promise<NoisemapReport> {
  const { configs, userConfig } = await loadConfigs(dir, builtinConfigs);
  const report = await analyze(dir, {
    adapters: ADAPTERS,
    configs,
    userConfig,
    toolVersion: pkg.version,
    includeTests: opts.includeTests ?? false,
    ...(opts.framework ? { framework: opts.framework } : {}),
  });
  if (opts.json) {
    process.stdout.write(JSON.stringify(report, null, 2) + '\n');
    return report;
  }
  const outPath = resolve('noisemap.json');
  await writeFile(outPath, JSON.stringify(report, null, 2) + '\n');
  process.stdout.write(renderTerminal(report));
  process.stdout.write(`\nwrote ${outPath}\n`);
  return report;
}

const program = new Command();

program.name('noisemap').description(pkg.description).version(pkg.version, '-v, --version');

program
  .argument('[dir]', 'directory to analyze', './src')
  .option('--json', 'JSON to stdout only; no file written')
  .option('--framework <id>', 'override detection (react | spynejs)')
  .option('--include-tests', 'measure test files too (skipped by default)')
  .action(async (dir: string, opts: CommonOptions) => {
    await run(dir, opts);
  });

program
  .command('map')
  .argument('[dir]', 'directory to analyze', './src')
  .option('--framework <id>', 'override detection (react | spynejs)')
  .option('--include-tests', 'measure test files too (skipped by default)')
  .option('--no-open', 'write noisemap.html without opening it')
  .option('--no-source', 'do not embed module sources (the map then shows rule tables, not colored source)')
  .option('--no-wiring', 'skip the wiring; the map then has the Shape tab only')
  .description('analyze, write noisemap.json and noisemap.html (Shape and Wiring tabs), and open the map')
  .action(async (dir: string, opts: MapOptions) => {
    const report = await run(dir, opts);
    const sources = opts.source === false ? undefined : await readSources(report);
    const wiring = opts.wiring === false ? undefined : await wiringFor(dir, report, opts.includeTests ?? false);
    const htmlPath = resolve('noisemap.html');
    await writeFile(htmlPath, renderHtml(report, { ...(sources ? { sources } : {}), ...(wiring ? { wiring } : {}) }));
    process.stdout.write(`wrote ${htmlPath}\n`);
    if (opts.open !== false) openInBrowser(htmlPath);
  });

program
  .command('wiring')
  .argument('[dir]', 'directory to analyze', './src')
  .option('--json', 'JSON to stdout only; no file written')
  .option('--all', 'list every finding, opaque sites included')
  .option('--include-tests', 'include test files')
  .description('follow every declared connection to its definition; write noisemap.wiring.json')
  .action(async (dir: string, opts: { json?: boolean; all?: boolean; includeTests?: boolean }) => {
    // Shape first, for the token counts the working set needs and the roles that label nodes.
    const { configs, userConfig } = await loadConfigs(dir, builtinConfigs);
    const shape = await analyze(dir, { adapters: ADAPTERS, configs, userConfig, toolVersion: pkg.version, includeTests: opts.includeTests ?? false });
    const w = await wiringFor(dir, shape, opts.includeTests ?? false);
    if (opts.json) {
      process.stdout.write(JSON.stringify(w, null, 2) + '\n');
      return;
    }
    const outPath = resolve('noisemap.wiring.json');
    await writeFile(outPath, JSON.stringify(w, null, 2) + '\n');
    process.stdout.write(renderWiring(w, { all: opts.all ?? false }));
    process.stdout.write(`\nwrote ${outPath}\n`);
  });

program
  .command('explain')
  .argument('<file>', 'one source file')
  .option('--framework <id>', 'override detection (react | spynejs)')
  .option('--wiring <dir>', 'also run the wiring over <dir> and print this file\'s connections and measures')
  .description('print the file with every span labeled by bucket and rule, to dispute a classification')
  .action(async (path: string, opts: CommonOptions & { wiring?: string }) => {
    const absPath = resolve(path);
    const dir = dirname(absPath);
    const { configs } = await loadConfigs(dir, builtinConfigs);
    const detection = await detectFrameworks(dir);
    const context = { detected: detection.detected, override: opts.framework ?? null };
    const source = await readFile(absPath, 'utf8');
    const ext = absPath.slice(absPath.lastIndexOf('.')).toLowerCase();
    const file: FileInfo = { path, absPath, ext, source };
    const adapter = ADAPTERS.find((a) => a.match(file, context, configs[a.id]));
    if (!adapter) {
      process.stderr.write(`noisemap explain: no adapter accepts ${path}\n`);
      process.exitCode = 1;
      return;
    }
    const mod = moduleFromOutput(file, adapter.analyze(file, configs[adapter.id]));
    process.stdout.write(renderExplain(source, mod));
    if (opts.wiring) {
      const root = resolve(opts.wiring);
      const shape = await analyze(root, { adapters: ADAPTERS, configs, userConfig: null, toolVersion: pkg.version });
      const w = await wiringFor(root, shape, false);
      const relPath = absPath.startsWith(root) ? absPath.slice(root.length + 1) : path;
      process.stdout.write('\n' + renderWiringFor(w, relPath));
    }
  });

await program.parseAsync();
