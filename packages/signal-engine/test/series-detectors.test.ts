/* Programmer: Lalith Satheesh / Date: 09/05/2026 */
import { describe, expect, it } from 'vitest';
import {
  DEFAULT_CONFIG,
  detectCusum,
  detectEwma,
  detectRobustZ,
  groupSeries,
} from '../src/index.js';
import type { DetectorContext, SeriesPoint } from '../src/index.js';
import { DAY, HOUR, MINUTE, NOW, makeSeries } from './helpers.js';

const ctx: DetectorContext = { now: NOW, minRatio: 1 };

function withSpike(points: SeriesPoint[], size: number): SeriesPoint[] {
  const last = points[points.length - 1] as SeriesPoint;
  return [...points.slice(0, -1), { ...last, v: last.v + size }];
}

describe('robust z-score', () => {
  it('fires on a spike at the end and reports coherent evidence', () => {
    const points = withSpike(makeSeries({ base: 1015, sigma: 2 }), 30);
    const c = detectRobustZ('p', points, DEFAULT_CONFIG.robustZ, {
      ...ctx,
      descriptor: { id: 'p', label: 'Pressure', unit: 'hPa' },
    });
    expect(c).not.toBeNull();
    expect(c!.severity).toBeGreaterThan(0.5);
    expect(c!.kind).toBe('high');
    expect(c!.evidence.observed).toBeGreaterThan(c!.evidence.threshold);
    expect(c!.evidence.threshold).toBeGreaterThan(c!.evidence.baseline);
    expect(c!.evidence.sampleSize).toBe(points.length - 1);
    expect(c!.summary).toContain('Pressure is');
    expect(c!.summary).toContain('hPa');
  });

  it('stays quiet on plain noise', () => {
    expect(detectRobustZ('p', makeSeries({ seed: 3 }), DEFAULT_CONFIG.robustZ, ctx)).toBeNull();
  });

  it('needs enough baseline samples', () => {
    const short = withSpike(makeSeries({ count: 10 }), 50);
    expect(detectRobustZ('p', short, DEFAULT_CONFIG.robustZ, ctx)).toBeNull();
  });

  it('cannot score a constant series without a minSigma floor, and can with one', () => {
    const flat = makeSeries({ base: 0, sigma: 0 });
    const spiked = withSpike(flat, 12);
    expect(detectRobustZ('rain', spiked, DEFAULT_CONFIG.robustZ, ctx)).toBeNull();
    const c = detectRobustZ('rain', spiked, DEFAULT_CONFIG.robustZ, {
      ...ctx,
      descriptor: { id: 'rain', minSigma: 0.5 },
    });
    expect(c).not.toBeNull();
    expect(c!.severity).toBe(1);
  });

  it('ignores NaN and future samples through groupSeries', () => {
    const points = withSpike(makeSeries({ base: 20, sigma: 1 }), 15);
    const dirty: SeriesPoint[] = [
      ...points,
      { seriesId: 's', t: NOW - 3 * HOUR, v: NaN },
      { seriesId: 's', t: NOW + HOUR, v: 1e9 },
    ];
    const clean = groupSeries(dirty, NOW).get('s')!;
    expect(clean.length).toBe(points.length);
    const c = detectRobustZ('s', clean, DEFAULT_CONFIG.robustZ, ctx);
    expect(c).not.toBeNull();
    expect(c!.evidence.observed).toBeCloseTo(points[points.length - 1]!.v, 6);
  });

  it('uses the median of the recent window when recentMs is set', () => {
    // A single glitch sample at 1-minute cadence should not fire when recentMs smooths it.
    const points = withSpike(makeSeries({ stepMs: MINUTE, count: 600, base: 400, sigma: 5 }), 100);
    const glitch = detectRobustZ('w', points, DEFAULT_CONFIG.robustZ, ctx);
    expect(glitch).not.toBeNull();
    const smoothed = detectRobustZ(
      'w',
      points,
      { ...DEFAULT_CONFIG.robustZ, recentMs: 10 * MINUTE },
      ctx,
    );
    expect(smoothed).toBeNull();
  });

  it('returns sub-threshold candidates only when asked via minRatio', () => {
    const points = withSpike(makeSeries({ base: 50, sigma: 1, seed: 11 }), 3.2);
    expect(detectRobustZ('s', points, DEFAULT_CONFIG.robustZ, ctx)).toBeNull();
    const c = detectRobustZ('s', points, DEFAULT_CONFIG.robustZ, { ...ctx, minRatio: 0.5 });
    expect(c).not.toBeNull();
    expect(c!.ratio).toBeLessThan(1);
  });
});

describe('EWMA drift', () => {
  it('flags a slow upward ramp in the second half as a mean drift', () => {
    const points = makeSeries({
      base: 10,
      sigma: 1,
      shape: (i, n) => (i > n / 2 ? ((i - n / 2) / (n / 2)) * 6 : 0),
    });
    const c = detectEwma('t', points, DEFAULT_CONFIG.ewma, ctx);
    expect(c).not.toBeNull();
    expect(c!.kind).toBe('ewma-mean');
    expect(c!.evidence.observed).toBeGreaterThan(c!.evidence.threshold);
    expect(c!.startedAt).toBeGreaterThan(NOW - 4 * DAY);
    expect(c!.summary).toContain('drifted above');
  });

  it('flags a variance blow-up in the last day', () => {
    const noisy = makeSeries({ base: 10, sigma: 1, seed: 5 }).map((p, i, arr) =>
      i > arr.length - 24 ? { ...p, v: 10 + (p.v - 10) * 6 } : p,
    );
    const c = detectEwma('t', noisy, DEFAULT_CONFIG.ewma, ctx);
    expect(c).not.toBeNull();
    expect(c!.kind).toBe('ewma-variance');
    expect(c!.evidence.observed).toBeGreaterThan(c!.evidence.baseline);
  });

  it('ignores a diurnal cycle with the default one-day half-life', () => {
    const points = makeSeries({
      base: 20,
      sigma: 0.5,
      shape: (i) => 5 * Math.sin((2 * Math.PI * i) / 24),
    });
    expect(detectEwma('temp', points, DEFAULT_CONFIG.ewma, ctx)).toBeNull();
  });

  it('is quiet on noise and on short series', () => {
    expect(detectEwma('t', makeSeries({ seed: 9 }), DEFAULT_CONFIG.ewma, ctx)).toBeNull();
    expect(detectEwma('t', makeSeries({ count: 12 }), DEFAULT_CONFIG.ewma, ctx)).toBeNull();
  });
});

describe('CUSUM change point', () => {
  it('locates a step change and reports the post-change mean', () => {
    const shiftAt = 5 * 24;
    const points = makeSeries({ base: 100, sigma: 2, shape: (i) => (i >= shiftAt ? 5 : 0) });
    const c = detectCusum('s', points, DEFAULT_CONFIG.cusum, {
      ...ctx,
      descriptor: { id: 's', label: 'Speed', unit: 'km/s' },
    });
    expect(c).not.toBeNull();
    expect(c!.kind).toBe('up');
    const expectedStart = points[shiftAt]!.t;
    expect(Math.abs(c!.startedAt - expectedStart)).toBeLessThanOrEqual(6 * HOUR);
    expect(c!.evidence.observed).toBeGreaterThan(103);
    expect(c!.evidence.observed).toBeGreaterThan(c!.evidence.threshold);
    expect(c!.evidence.baseline).toBeCloseTo(100, 0);
    expect(c!.summary).toMatch(/Speed shifted up about .* ago/);
  });

  it('detects a downward shift too', () => {
    const points = makeSeries({ base: 50, sigma: 1, shape: (i, n) => (i >= n - 30 ? -4 : 0) });
    const c = detectCusum('s', points, DEFAULT_CONFIG.cusum, ctx);
    expect(c).not.toBeNull();
    expect(c!.kind).toBe('down');
  });

  it('stays quiet without a shift and on a constant series', () => {
    expect(detectCusum('s', makeSeries({ seed: 21 }), DEFAULT_CONFIG.cusum, ctx)).toBeNull();
    expect(detectCusum('s', makeSeries({ sigma: 0 }), DEFAULT_CONFIG.cusum, ctx)).toBeNull();
  });

  it('respects a decision override that makes 1-minute data need an hour of shift', () => {
    const points = makeSeries({
      stepMs: MINUTE,
      count: 12 * 60,
      base: 400,
      sigma: 10,
      shape: (i, n) => (i >= n - 20 ? 15 : 0),
    });
    expect(detectCusum('w', points, DEFAULT_CONFIG.cusum, ctx)).not.toBeNull();
    expect(detectCusum('w', points, { ...DEFAULT_CONFIG.cusum, decision: 60 }, ctx)).toBeNull();
  });
});
