/* Programmer: Lalith Satheesh / Date: 09/05/2026 */
import { describe, expect, it } from 'vitest';
import {
  DEFAULT_CONFIG,
  detectEventRate,
  detectSwarm,
  detectThresholds,
  groupSeries,
} from '../src/index.js';
import type { GeoEvent, Signal } from '../src/index.js';
import { DAY, HOUR, MINUTE, NOW, makeEvents, makeSeries } from './helpers.js';

const evCtx = { now: NOW, minRatio: 1 };

/** ~2 events/hour spread evenly over the baseline window, none in the last 3 h. */
function quietBaseline(): GeoEvent[] {
  return makeEvents({
    count: 1400,
    from: NOW - 30 * DAY,
    to: NOW - 3 * HOUR,
    lat: 35,
    lon: -118,
    spreadKm: 3000,
    magnitude: 3,
    seed: 1,
  });
}

describe('event-rate', () => {
  it('fires on a burst in the recent window and reports expected vs observed', () => {
    const burst = makeEvents({
      count: 20,
      from: NOW - 2 * HOUR,
      to: NOW,
      lat: 35,
      lon: -118,
      spreadKm: 500,
      seed: 2,
      idPrefix: 'burst',
    });
    const out = detectEventRate(
      [...quietBaseline(), ...burst],
      DEFAULT_CONFIG.eventRate,
      DEFAULT_CONFIG,
      evCtx,
    );
    expect(out).toHaveLength(1);
    const c = out[0]!;
    expect(c.id).toBe('event-rate:test:earthquake');
    expect(c.evidence.observed).toBe(20);
    expect(c.evidence.baseline).toBeCloseTo((1400 * 3) / (30 * 24 - 3), 2);
    expect(c.evidence.threshold).toBeLessThanOrEqual(20);
    expect(c.eventIds).toHaveLength(20);
    expect(c.location!.lat).toBeCloseTo(35, 0);
    expect(c.summary).toContain('20 earthquakes in the last 3 h');
  });

  it('is quiet at the baseline rate', () => {
    const normal = makeEvents({
      count: 6,
      from: NOW - 3 * HOUR,
      to: NOW,
      lat: 35,
      lon: -118,
      spreadKm: 3000,
      seed: 3,
      idPrefix: 'n',
    });
    expect(
      detectEventRate(
        [...quietBaseline(), ...normal],
        DEFAULT_CONFIG.eventRate,
        DEFAULT_CONFIG,
        evCtx,
      ),
    ).toEqual([]);
  });

  it('refuses to fire without a baseline', () => {
    const burst = makeEvents({ count: 30, from: NOW - HOUR, to: NOW, seed: 4 });
    expect(detectEventRate(burst, DEFAULT_CONFIG.eventRate, DEFAULT_CONFIG, evCtx)).toEqual([]);
  });

  it('honours the kinds filter', () => {
    const storms = makeEvents({
      count: 30,
      from: NOW - HOUR,
      to: NOW,
      kind: 'storm',
      seed: 13,
      idPrefix: 'st',
    });
    const base = makeEvents({
      count: 500,
      from: NOW - 30 * DAY,
      to: NOW - DAY,
      kind: 'storm',
      seed: 14,
      idPrefix: 'stb',
    });
    const cfg = { ...DEFAULT_CONFIG.eventRate, kinds: ['earthquake'] };
    expect(detectEventRate([...base, ...storms], cfg, DEFAULT_CONFIG, evCtx)).toEqual([]);
    expect(
      detectEventRate([...base, ...storms], DEFAULT_CONFIG.eventRate, DEFAULT_CONFIG, evCtx),
    ).toHaveLength(1);
  });

  it('applies the per-kind magnitude floor', () => {
    const tiny = makeEvents({
      count: 40,
      from: NOW - HOUR,
      to: NOW,
      magnitude: 1.2,
      seed: 5,
      idPrefix: 'tiny',
    });
    expect(
      detectEventRate(
        [...quietBaseline(), ...tiny],
        DEFAULT_CONFIG.eventRate,
        DEFAULT_CONFIG,
        evCtx,
      ),
    ).toEqual([]);
  });
});

describe('swarm', () => {
  it('finds a tight cluster where the baseline was empty', () => {
    const cluster = makeEvents({
      count: 9,
      from: NOW - 12 * HOUR,
      to: NOW,
      lat: 38.8,
      lon: -122.8,
      spreadKm: 15,
      magnitude: 1.8,
      seed: 6,
      idPrefix: 'sw',
    });
    const out = detectSwarm(
      [...quietBaseline(), ...cluster],
      DEFAULT_CONFIG.swarm,
      DEFAULT_CONFIG,
      evCtx,
    );
    expect(out).toHaveLength(1);
    const c = out[0]!;
    expect(c.evidence.observed).toBe(9);
    expect(c.evidence.baseline).toBeLessThan(1);
    expect(c.location!.lat).toBeCloseTo(38.8, 0);
    expect(c.eventIds).toHaveLength(9);
    expect(c.summary).toMatch(/9 earthquakes clustered within \d+(\.\d+)? km/);
  });

  it('does not call a permanently busy region a swarm', () => {
    const always = makeEvents({
      count: 900,
      from: NOW - 30 * DAY,
      to: NOW - DAY,
      lat: 19.4,
      lon: -155.3,
      spreadKm: 10,
      seed: 8,
      idPrefix: 'busy',
    });
    const today = makeEvents({
      count: 30,
      from: NOW - DAY,
      to: NOW,
      lat: 19.4,
      lon: -155.3,
      spreadKm: 10,
      seed: 9,
      idPrefix: 'today',
    });
    expect(detectSwarm([...always, ...today], DEFAULT_CONFIG.swarm, DEFAULT_CONFIG, evCtx)).toEqual(
      [],
    );
  });

  it('ignores scattered events', () => {
    const scattered = makeEvents({ count: 40, from: NOW - DAY, to: NOW, spreadKm: 4000, seed: 10 });
    expect(detectSwarm(scattered, DEFAULT_CONFIG.swarm, DEFAULT_CONFIG, evCtx)).toEqual([]);
  });

  it('keeps the id of a previous swarm nearby', () => {
    const cluster = makeEvents({
      count: 8,
      from: NOW - 6 * HOUR,
      to: NOW,
      lat: 10,
      lon: 10,
      spreadKm: 10,
      seed: 11,
    });
    const previous: Signal[] = [
      {
        id: 'swarm:earthquake:old',
        detector: 'swarm',
        severity: 0.3,
        score: 3.2,
        startedAt: NOW - DAY,
        updatedAt: NOW - MINUTE,
        evidence: { baseline: 0, observed: 7, threshold: 5, window: DAY, sampleSize: 0 },
        summary: '',
        status: 'active',
        kind: 'earthquake',
        location: { lat: 10.1, lon: 10.1 },
      },
    ];
    const out = detectSwarm(cluster, DEFAULT_CONFIG.swarm, DEFAULT_CONFIG, { ...evCtx, previous });
    expect(out[0]!.id).toBe('swarm:earthquake:old');
  });
});

describe('threshold rules', () => {
  const descriptors = new Map([
    ['noaa.kp_1m', { id: 'noaa.kp_1m', label: 'Kp (1-min estimate)' }],
    ['noaa.bz', { id: 'noaa.bz', label: 'Bz', unit: 'nT' }],
  ]);

  it('fires the G1 rule when Kp reaches 5 and scales severity with Kp', () => {
    const kp = makeSeries({
      id: 'noaa.kp_1m',
      stepMs: MINUTE,
      count: 360,
      base: 2,
      sigma: 0.2,
      shape: (i, n) => (i >= n - 5 ? 4 : 0),
    });
    const out = detectThresholds(
      groupSeries(kp, NOW),
      [],
      DEFAULT_CONFIG.threshold,
      DEFAULT_CONFIG,
      descriptors,
      NOW,
    );
    expect(out).toHaveLength(1);
    const c = out[0]!;
    expect(c.rule).toBe('kp-storm');
    expect(c.group).toBe('geomagnetic-storm');
    expect(c.severity).toBeGreaterThan(0.45);
    expect(c.severity).toBeLessThan(1);
    expect(c.startedAt).toBe(kp[kp.length - 5]!.t);
    expect(c.summary).toContain('G1 geomagnetic storm');
  });

  it('requires Bz to stay below -10 nT for the whole sustained window', () => {
    const brief = makeSeries({
      id: 'noaa.bz',
      stepMs: MINUTE,
      count: 300,
      base: 0,
      sigma: 1,
      shape: (i, n) => (i >= n - 10 ? -15 : 0),
    });
    expect(
      detectThresholds(
        groupSeries(brief, NOW),
        [],
        DEFAULT_CONFIG.threshold,
        DEFAULT_CONFIG,
        descriptors,
        NOW,
      ),
    ).toEqual([]);
    const sustained = makeSeries({
      id: 'noaa.bz',
      stepMs: MINUTE,
      count: 300,
      base: 0,
      sigma: 1,
      shape: (i, n) => (i >= n - 45 ? -15 : 0),
    });
    const out = detectThresholds(
      groupSeries(sustained, NOW),
      [],
      DEFAULT_CONFIG.threshold,
      DEFAULT_CONFIG,
      descriptors,
      NOW,
    );
    expect(out).toHaveLength(1);
    expect(out[0]!.rule).toBe('bz-south');
    expect(out[0]!.evidence.window).toBe(30 * MINUTE);
    expect(out[0]!.summary).toContain('for the last 30 min');
  });

  it('fires per major earthquake inside the event window only', () => {
    const background = makeEvents({
      count: 50,
      from: NOW - 20 * DAY,
      to: NOW - 2 * DAY,
      magnitude: 2,
      seed: 12,
    });
    const big: GeoEvent = {
      id: 'big',
      source: 'usgs',
      kind: 'earthquake',
      lat: -8,
      lon: 120,
      t: NOW - HOUR,
      magnitude: 6.4,
      label: 'Flores Sea',
    };
    const old: GeoEvent = { ...big, id: 'old', t: NOW - 3 * DAY, magnitude: 6.0 };
    const out = detectThresholds(
      new Map(),
      [...background, big, old],
      DEFAULT_CONFIG.threshold,
      DEFAULT_CONFIG,
      descriptors,
      NOW,
    );
    expect(out).toHaveLength(1);
    const c = out[0]!;
    expect(c.id).toBe('threshold:major-quake:big');
    expect(c.eventIds).toEqual(['big']);
    expect(c.location).toEqual({ lat: -8, lon: 120 });
    expect(c.evidence.baseline).toBe(2);
    expect(c.summary).toContain('near Flores Sea');
    expect(c.summary).toContain('magnitude 6.4');
  });
});
