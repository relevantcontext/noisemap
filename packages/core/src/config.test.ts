import { describe, expect, it } from 'vitest';
import { mergeConfig } from './config.js';
import type { FrameworkConfig } from './config.js';

const base: FrameworkConfig = {
  framework: 'react',
  default: 'L',
  classifiers: [
    { id: 'jsx', kind: 'jsx', bucket: 'V' },
    { id: 'effect', kind: 'call', match: '^useEffect$', bucket: 'B' },
  ],
  openQuestions: [{ rule: 'effect', call: 'B', reason: 'responds' }],
};

describe('mergeConfig', () => {
  it('replaces a classifier by id and appends new ones', () => {
    const merged = mergeConfig(base, {
      classifiers: [
        { id: 'effect', kind: 'call', match: '^useEffect$', bucket: 'L' },
        { id: 'custom', kind: 'call', match: '^useThing$', bucket: 'B' },
      ],
    });
    expect(merged.classifiers.map((c) => `${c.id}:${c.bucket}`)).toEqual(['jsx:V', 'effect:L', 'custom:B']);
  });
  it('keeps the framework id and replaces scalars', () => {
    const merged = mergeConfig(base, { framework: 'nope', default: 'V' });
    expect(merged.framework).toBe('react');
    expect(merged.default).toBe('V');
  });
});
