import { describe, expect, it } from 'vitest';
import { consistency, drift, euclidean, medianVector, mixing, shares } from './scores.js';

describe('shares and mixing', () => {
  it('a single-bucket module has mixing 0', () => {
    const s = shares({ V: 0, B: 0, L: 0, C: 40, excluded: 3 });
    expect(s).toEqual({ V: 0, B: 0, L: 0, C: 1 });
    expect(mixing(s)).toBe(0);
  });
  it('excluded tokens never enter a share', () => {
    const s = shares({ V: 10, B: 10, L: 0, C: 0, excluded: 100 });
    expect(s.V).toBe(0.5);
    expect(mixing(s)).toBe(0.5);
  });
  it('four equal buckets is the maximum, 0.75', () => {
    expect(mixing(shares({ V: 1, B: 1, L: 1, C: 1, excluded: 0 }))).toBe(0.75);
  });
});

describe('drift', () => {
  it('is the share outside the expected buckets', () => {
    expect(drift({ V: 60, B: 20, L: 20, C: 0, excluded: 0 }, ['V', 'B'])).toBeCloseTo(0.2);
  });
  it('subtracts permitted tokens and floors at 0', () => {
    expect(drift({ V: 0, B: 90, L: 10, C: 0, excluded: 0 }, ['B'], 10)).toBe(0);
    expect(drift({ V: 0, B: 90, L: 10, C: 0, excluded: 0 }, ['B'], 5)).toBeCloseTo(0.05);
  });
});

describe('consistency', () => {
  it('identical shapes score 0', () => {
    const v = { V: 0.5, B: 0.5, L: 0, C: 0 };
    expect(consistency([v, v, v]).consistency).toBe(0);
  });
  it('identical but mixed shapes still score 0 (consistency is not purity)', () => {
    const v = { V: 0.25, B: 0.25, L: 0.25, C: 0.25 };
    expect(consistency([v, v]).consistency).toBe(0);
  });
  it('several clean families score 0: consistency is measured within a family', () => {
    const a = { V: 1, B: 0, L: 0, C: 0 };
    const b = { V: 0, B: 1, L: 0, C: 0 };
    const c = { V: 0, B: 0, L: 1, C: 0 };
    expect(medianVector([a, b, c])).toEqual({ V: 0, B: 0, L: 0, C: 0 });
    const r = consistency([a, a, b, c]);
    expect(r.consistency).toBe(0);
    expect(r.families).toEqual({ V: { modules: 2, median: a }, B: { modules: 1, median: b }, L: { modules: 1, median: c } });
  });
  it('modules that do not resemble the others of their kind score high', () => {
    const clean = { V: 1, B: 0, L: 0, C: 0 };
    const mixed = { V: 0.5, B: 0.5, L: 0, C: 0 };
    const r = consistency([clean, clean, clean, mixed]);
    expect(r.families.V?.modules).toBe(4);
    expect(r.consistency).toBeCloseTo(euclidean(mixed, clean) / 4);
  });
  it('is empty-safe', () => {
    expect(consistency([])).toEqual({ consistency: 0, median: { V: 0, B: 0, L: 0, C: 0 }, families: {} });
  });
});
