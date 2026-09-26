import type { Adapter, AdapterOutput, FileInfo, FrameworkConfig, MatchContext } from '@noisemap/core';
import { analyzeJs } from '@noisemap/js-classify';
import { analyzeMdx } from './mdx.js';

const DEFAULT_EXTENSIONS = ['.jsx', '.tsx', '.mdx'];
const DEFAULT_PLAIN = ['.js', '.ts', '.mjs', '.cjs', '.mts', '.cts'];

/**
 * React adapter. Claims .jsx/.tsx/.mdx always, and plain .js/.ts when React is the
 * detected or forced framework (a React codebase's utility modules are measured too:
 * they are where fetch/transform/derive live).
 */
export const reactAdapter: Adapter = {
  id: 'react',
  match: (file: FileInfo, context: MatchContext, config: FrameworkConfig | undefined): boolean => {
    const always = config?.detect?.extensions ?? DEFAULT_EXTENSIONS;
    if (always.includes(file.ext)) return true;
    const plain = config?.detect?.plainExtensions ?? DEFAULT_PLAIN;
    if (!plain.includes(file.ext)) return false;
    return context.override === 'react' || (context.override === null && context.detected.includes('react'));
  },
  analyze: (file: FileInfo, config: FrameworkConfig | undefined): AdapterOutput => {
    if (!config) throw new Error('react adapter: no config loaded');
    if (file.ext === '.mdx') return { framework: 'react', tokens: analyzeMdx(file.source, config) };
    return analyzeJs(file.source, file.ext, config, 'react');
  },
};
