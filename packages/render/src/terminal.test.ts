import { describe, expect, it } from 'vitest';
import { shareBar } from './terminal.js';

describe('shareBar', () => {
  it('is always exactly the requested width', () => {
    expect(shareBar({ V: 1 / 3, B: 1 / 3, L: 1 / 3, C: 0 }, 20)).toHaveLength(20);
    expect(shareBar({ V: 0, B: 0, L: 0, C: 1 }, 20)).toBe('C'.repeat(20));
  });
  it('keeps bucket order V B L C', () => {
    expect(shareBar({ V: 0.5, B: 0.25, L: 0.25, C: 0 }, 8)).toBe('VVVVBBLL');
  });
});
