/* Programmer: Lalith Satheesh / Date: 09/05/2026 */
import { describe, expect, it } from 'vitest';
import { DEFAULT_CONFIG, reconcile, resolveConfig, runEngine } from '../src/index.js';
import type { Candidate, GeoEvent, SeriesPoint, Signal } from '../src/index.js';
import { DAY, HOUR, MINUTE, NOW, makeEvents, makeSeries } from './helpers.js';

function candidate(partial: Partial<Candidate> & { id: string }): Candidate {
  return {
    detector: 'robust-z',
    severity: 0.5,
    score: 4,
    ratio: 1.2,
    startedAt: NOW,
    updatedAt: NOW,
    evidence: { baseline: 0, observed: 1, threshold: 1, window: DAY, sampleSize: 10 },
    summary: 'x',
    ...partial,
  };
}

describe('reconcile', () => {
  const cfg = DEFAULT_CONFIG.ranking;

  it('lets a domain rule outrank a statistical detector on the same series', () => {
    const z = candidate({ id: 'robust-z:noaa.kp', seriesId: 'noaa.kp', severity: 0.9, score: 9 });
    const rule = candidate({
      id: 'threshold:kp-storm:noaa.kp',
      seriesId: 'noaa.kp',
      detector: 'threshold',
      severity: 0.5,
      score: 1.2,
    });
    const out = reconcile([z, rule], [], NOW, cfg);
    expect(out).toHaveLength(1);
    expect(out[0]!.detector).toBe('threshold');
    expect(out[0]!.alsoDetectedBy).toEqual(['robust-z']);
    expect(out[0]).not.toHaveProperty('ratio');
  });

  it('keeps the strongest of two statistical detectors per series', () => {
    const a = candidate({ id: 'robust-z:s', seriesId: 's', severity: 0.2 });
    const b = candidate({ id: 'cusum:s', seriesId: 's', detector: 'cusum', severity: 0.6 });
    const out = reconcile([a, b], [], NOW, cfg);
    expect(out.map((s) => s.id)).toEqual(['cusum:s']);
    expect(out[0]!.alsoDetectedBy).toEqual(['robust-z']);
  });

  it('collapses grouped threshold rules to the strongest member', () => {
    const a = candidate({ id: 'threshold:kp-storm:noaa.kp', seriesId: 'noaa.kp', detector: 'threshold', severity: 0.5, group: 'g' });
    const b = candidate({ id: 'threshold:kp-storm:noaa.kp_1m', seriesId: 'noaa.kp_1m', detector: 'threshold', severity: 0.7, group: 'g' });
    expect(reconcile([a, b], [], NOW, cfg).map((s) => s.id)).toEqual(['threshold:kp-storm:noaa.kp_1m']);
  });

  it('applies hysteresis only to signals that were active', () => {
    const weak = candidate({ id: 'robust-z:s', seriesId: 's', ratio: 0.85 });
    expect(reconcile([weak], [], NOW, cfg)).toEqual([]);
    const prevActive: Signal = { ...candidate({ id: 'robust-z:s', seriesId: 's' }), status: 'active' };
    expect(reconcile([weak], [prevActive], NOW, cfg)).toHaveLength(1);
    const prevCooling: Signal = { ...prevActive, status: 'cooling' };
    expect(reconcile([weak], [prevCooling], NOW, cfg)).toHaveLength(1);
    expect(reconcile([weak], [prevCooling], NOW, cfg)[0]!.status).toBe('cooling');
    const tooWeak = candidate({ id: 'robust-z:s', seriesId: 's', ratio: 0.5 });
    expect(reconcile([tooWeak], [prevActive], NOW, cfg).map((s) => s.status)).toEqual(['cooling']);
  });

  it('preserves startedAt across runs and cools cleared signals for cooldownMs', () => {
    const first = reconcile([candidate({ id: 'cusum:s', seriesId: 's', detector: 'cusum', startedAt: NOW - 5 * HOUR })], [], NOW, cfg);
    const second = reconcile(
      [candidate({ id: 'cusum:s', seriesId: 's', detector: 'cusum', startedAt: NOW - 4 * HOUR, updatedAt: NOW + MINUTE })],
      first,
      NOW + MINUTE,
      cfg,
    );
    expect(second[0]!.startedAt).toBe(NOW - 5 * HOUR);

    const cleared = reconcile([], second, NOW + 5 * MINUTE, cfg);
    expect(cleared).toHaveLength(1);
    expect(cleared[0]!.status).toBe('cooling');
    expect(cleared[0]!.updatedAt).toBe(NOW + MINUTE);

    expect(reconcile([], cleared, NOW + MINUTE + cfg.cooldownMs, cfg)).toEqual([]);
  });

  it('does not carry a cooling duplicate for a series that has a live signal', () => {
    const prev: Signal = { ...candidate({ id: 'robust-z:s', seriesId: 's' }), status: 'active' };
    const now = reconcile([candidate({ id: 'threshold:r:s', seriesId: 's', detector: 'threshold' })], [prev], NOW + MINUTE, cfg);
    expect(now.map((s) => s.id)).toEqual(['threshold:r:s']);
  });

  it('ranks by severity, then recency, then id, and caps the list', () => {
    const cs = [
      candidate({ id: 'b', severity: 0.5, updatedAt: NOW }),
      candidate({ id: 'a', severity: 0.5, updatedAt: NOW }),
      candidate({ id: 'c', severity: 0.9, updatedAt: NOW - HOUR }),
      candidate({ id: 'd', severity: 0.5, updatedAt: NOW + 1 }),
    ];
    expect(reconcile(cs, [], NOW, cfg).map((s) => s.id)).toEqual(['c', 'd', 'a', 'b']);
    expect(reconcile(cs, [], NOW, { ...cfg, maxSignals: 2 })).toHaveLength(2);
  });
});

describe('runEngine', () => {
  const descriptors = [
    { id: 'meteo.nyc.temp', label: 'New York temperature', unit: '°C', lat: 40.7, lon: -74 },
    { id: 'noaa.kp_1m', label: 'Kp (1-min estimate)' },
  ];

  function scenario(): { series: SeriesPoint[]; events: GeoEvent[] } {
    const temp = makeSeries({ id: 'meteo.nyc.temp', base: 22, sigma: 1.5, seed: 31 });
    temp[temp.length - 1] = { ...temp[temp.length - 1]!, v: 41 };
    const kp = makeSeries({ id: 'noaa.kp_1m', stepMs: MINUTE, count: 360, base: 2, sigma: 0.2, seed: 32, shape: (i, n) => (i >= n - 30 ? 4.5 : 0) });
    const baseline = makeEvents({ count: 1200, from: NOW - 30 * DAY, to: NOW - 3 * HOUR, spreadKm: 5000, seed: 33 });
    const quake: GeoEvent = { id: 'q1', source: 'usgs', kind: 'earthquake', lat: 36, lon: 140, t: NOW - 20 * MINUTE, magnitude: 6.1, label: 'Honshu' };
    return { series: [...temp, ...kp], events: [...baseline, quake] };
  }

  it('runs end to end, is deterministic, and ranks the strongest facts first', () => {
    const { series, events } = scenario();
    const a = runEngine({ series, events, descriptors, now: NOW });
    const b = runEngine({ series, events, descriptors, now: NOW });
    expect(a).toEqual(b);
    expect(a.evaluatedSeries).toBe(2);
    expect(a.evaluatedEvents).toBe(1201);
    const ids = a.signals.map((s) => s.id);
    expect(ids).toContain('threshold:major-quake:q1');
    expect(ids).toContain('threshold:kp-storm:noaa.kp_1m');
    expect(ids).toContain('robust-z:meteo.nyc.temp');
    for (const s of a.signals) {
      expect(s.severity).toBeGreaterThanOrEqual(0);
      expect(s.severity).toBeLessThanOrEqual(1);
      expect(s.summary.length).toBeGreaterThan(20);
      expect(s.status).toBe('active');
    }
    const temp = a.signals.find((s) => s.id === 'robust-z:meteo.nyc.temp')!;
    expect(temp.location).toEqual({ lat: 40.7, lon: -74 });
    expect(temp.summary).toContain('New York temperature is 41°C');
  });

  it('feeds previous signals back for continuity', () => {
    const { series, events } = scenario();
    const first = runEngine({ series, events, descriptors, now: NOW });
    const later = NOW + 2 * MINUTE;
    const second = runEngine({ series, events, descriptors, now: later, previous: first.signals });
    const q1 = second.signals.find((s) => s.id === 'threshold:major-quake:q1')!;
    expect(q1.startedAt).toBe(NOW - 20 * MINUTE);
    expect(q1.updatedAt).toBe(later);
  });

  it('honours config overrides and disabled detectors', () => {
    const { series, events } = scenario();
    const out = runEngine(
      { series, events, descriptors, now: NOW },
      { robustZ: { enabled: false }, ewma: { enabled: false }, cusum: { enabled: false }, threshold: { rules: [] } },
    );
    expect(out.signals).toEqual([]);
  });

  it('survives garbage input', () => {
    const out = runEngine({
      series: [{ seriesId: 'x', t: NaN, v: 1 }, { seriesId: 'x', t: NOW, v: Infinity }],
      events: [{ id: 'e', source: 's', kind: 'k', lat: 999, lon: 0, t: NOW, magnitude: 1 }],
      now: NOW,
    });
    expect(out.signals).toEqual([]);
    expect(out.evaluatedEvents).toBe(0);
    expect(() => runEngine({ now: NaN })).toThrow(TypeError);
  });
});

describe('resolveConfig', () => {
  it('deep merges objects and replaces arrays', () => {
    const cfg = resolveConfig({ eventRate: { threshold: 4 }, threshold: { rules: [] }, swarm: { kinds: ['earthquake'] } });
    expect(cfg.eventRate.threshold).toBe(4);
    expect(cfg.eventRate.baselineWindowMs).toBe(DEFAULT_CONFIG.eventRate.baselineWindowMs);
    expect(cfg.threshold.rules).toEqual([]);
    expect(cfg.swarm.kinds).toEqual(['earthquake']);
    expect(DEFAULT_CONFIG.threshold.rules.length).toBe(3);
  });
});
