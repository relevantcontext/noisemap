import { defineConfig } from 'tsup';

export default defineConfig({
  entry: { index: 'src/index.ts' },
  format: ['esm'],
  target: 'node20',
  platform: 'node',
  banner: { js: '#!/usr/bin/env node' },
  // Workspace packages are private; inline them so `noisemap` publishes as one package.
  noExternal: [/^@noisemap\//],
  clean: true,
  sourcemap: false,
  dts: false,
});
