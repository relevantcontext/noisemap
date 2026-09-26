import type { FrameworkConfig } from '@noisemap/core';
import react from './react.json' with { type: 'json' };
import spynejs from './spynejs.json' with { type: 'json' };

/** Built-in configs keyed by adapter id. */
export const builtinConfigs: Readonly<Record<string, FrameworkConfig>> = {
  react: react as FrameworkConfig,
  spynejs: spynejs as FrameworkConfig,
};
