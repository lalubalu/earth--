/* Programmer: Lalith Satheesh / Date: 09/05/2026 */
import { describe, expect, it } from 'vitest';
import {
  centroid,
  dbscan,
  haversineKm,
  mad,
  median,
  NOISE,
  poissonRequiredCount,
  poissonZ,
  robustScale,
} from '../src/index.js';

describe('median and MAD', () => {
  it('handles odd and even lengths', () => {
    expect(median([3, 1, 2])).toBe(2);
    expect(median([4, 1, 3, 2])).toBe(2.5);
    expect(median([])).toBeNaN();
  });

  it('MAD ignores a single wild outlier', () => {
    expect(mad([1, 2, 3, 4, 5, 1000])).toBe(1.5);
  });
});

describe('robustScale', () => {
  it('uses MAD when there is spread', () => {
    const r = robustScale([10, 11, 9, 12, 8]);
    expect(r.method).toBe('mad');
    expect(r.center).toBe(10);
    expect(r.sigma).toBeCloseTo(1.4826, 4);
  });

  it('falls back to mean absolute deviation when more than half the samples repeat', () => {
    const r = robustScale([5, 5, 5, 5, 5, 5, 9, 1]);
    expect(r.method).toBe('mean-abs');
    expect(r.sigma).toBeGreaterThan(0);
  });

  it('uses the floor for a constant series and reports no spread otherwise', () => {
    expect(robustScale([2, 2, 2, 2], 0.5)).toEqual({ center: 2, sigma: 0.5, method: 'floor' });
    expect(robustScale([2, 2, 2, 2]).sigma).toBe(0);
  });

  it('never returns a sigma below the floor', () => {
    expect(robustScale([10, 10.1, 9.9, 10.05], 1).sigma).toBe(1);
  });
});

describe('poisson helpers', () => {
  it('is zero at the expectation and positive above it', () => {
    expect(poissonZ(4, 4)).toBeCloseTo(0, 10);
    expect(poissonZ(14, 4)).toBeGreaterThan(3);
    expect(poissonZ(12, 4)).toBeCloseTo(2.852, 2);
    expect(poissonZ(0, 0)).toBe(0);
  });

  it('required count is the smallest integer reaching the z', () => {
    const lambda = 2.3;
    const need = poissonRequiredCount(lambda, 3);
    expect(poissonZ(need, lambda)).toBeGreaterThanOrEqual(3);
    expect(poissonZ(need - 1, lambda)).toBeLessThan(3);
  });
});

describe('geo', () => {
  it('haversine London to Paris is about 344 km', () => {
    const km = haversineKm({ lat: 51.5074, lon: -0.1278 }, { lat: 48.8566, lon: 2.3522 });
    expect(km).toBeGreaterThan(340);
    expect(km).toBeLessThan(346);
  });

  it('centroid survives the antimeridian', () => {
    const c = centroid([
      { lat: 0, lon: 179 },
      { lat: 0, lon: -179 },
    ]);
    expect(Math.abs(c.lon)).toBeCloseTo(180, 5);
    expect(c.lat).toBeCloseTo(0, 5);
  });

  it('dbscan separates two tight groups and leaves a straggler as noise', () => {
    const a = [0, 0.05, 0.1, 0.15, 0.2].map((d) => ({ lat: 10 + d, lon: 10 + d }));
    const b = [0, 0.05, 0.1, 0.15, 0.2].map((d) => ({ lat: -30 + d, lon: 40 + d }));
    const straggler = { lat: 60, lon: -100 };
    const labels = dbscan([...a, ...b, straggler], 50, 3);
    expect(new Set(labels.slice(0, 5)).size).toBe(1);
    expect(new Set(labels.slice(5, 10)).size).toBe(1);
    expect(labels[0]).not.toBe(labels[5]);
    expect(labels[10]).toBe(NOISE);
  });

  it('dbscan on nothing is nothing', () => {
    expect(dbscan([], 10, 3)).toEqual([]);
  });
});
