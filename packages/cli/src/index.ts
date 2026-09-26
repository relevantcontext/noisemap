import { spawn } from 'node:child_process';
import { readFile, writeFile } from 'node:fs/promises';
import { dirname, join, resolve } from 'node:path';
import { contentAdapter } from '@noisemap/adapter-content';
import { reactAdapter } from '@noisemap/adapter-react';
import { spynejsAdapter } from '@noisemap/adapter-spynejs';
import { builtinConfigs } from '@noisemap/configs';
import { analyze, detectFrameworks, loadConfigs, moduleFromOutput } from '@noisemap/core';
import type { Adapter, FileInfo, NoisemapReport } from '@noisemap/core';
import { renderExplain, renderHtml, renderTerminal } from '@noisemap/render';
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
  .description('analyze, write noisemap.json and noisemap.html, and open the map')
  .action(async (dir: string, opts: MapOptions) => {
    const report = await run(dir, opts);
    const sources = opts.source === false ? undefined : await readSources(report);
    const htmlPath = resolve('noisemap.html');
    await writeFile(htmlPath, renderHtml(report, sources ? { sources } : {}));
    process.stdout.write(`wrote ${htmlPath}\n`);
    if (opts.open !== false) openInBrowser(htmlPath);
  });

program
  .command('explain')
  .argument('<file>', 'one source file')
  .option('--framework <id>', 'override detection (react | spynejs)')
  .description('print the file with every span labeled by bucket and rule, to dispute a classification')
  .action(async (path: string, opts: CommonOptions) => {
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
  });

await program.parseAsync();
