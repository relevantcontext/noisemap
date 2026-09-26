import type { Adapter, AdapterOutput, FileInfo, FrameworkConfig, MatchContext } from '@noisemap/core';
import { analyzeJs } from '@noisemap/js-classify';

const DEFAULT_PLAIN = ['.js', '.ts', '.mjs', '.cjs', '.mts', '.cts'];
const DEFAULT_EXTENDS = ['ViewStream', 'DomElement', 'DomItem', 'Channel', 'SpyneTrait'];

/**
 * SpyneJS adapter. Claims a plain JS/TS file when it extends a role class (any codebase),
 * or any plain JS/TS file when SpyneJS is the detected or forced framework. Roles come
 * from the config: a match on `extends` plus an expected shape; drift is measured against it.
 */
export const spynejsAdapter: Adapter = {
  id: 'spynejs',
  match: (file: FileInfo, context: MatchContext, config: FrameworkConfig | undefined): boolean => {
    const plain = config?.detect?.plainExtensions ?? DEFAULT_PLAIN;
    if (!plain.includes(file.ext)) return false;
    if (context.override === 'spynejs') return true;
    if (context.override !== null) return false;
    const names = config?.detect?.extends ?? DEFAULT_EXTENDS;
    if (new RegExp(`\\bextends\\s+(?:[A-Za-z_$][\\w$]*\\.)?(?:${names.join('|')})\\b`).test(file.source)) return true;
    return context.detected.includes('spynejs');
  },
  analyze: (file: FileInfo, config: FrameworkConfig | undefined): AdapterOutput => {
    if (!config) throw new Error('spynejs adapter: no config loaded');
    return analyzeJs(file.source, file.ext, config, 'spynejs');
  },
};
