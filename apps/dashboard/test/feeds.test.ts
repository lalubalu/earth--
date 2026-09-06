/* Programmer: Lalith Satheesh / Date: 09/05/2026 */
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { runEngine } from '@lalubalu/signal-engine';
import { CITIES } from '../src/lib/feeds/cities';
import { parseEonet } from '../src/lib/feeds/eonet';
import { parseIss } from '../src/lib/feeds/iss';
import { NOAA_SERIES, parseKp1m, parseKp3h, parseRtswMag, parseRtswWind } from '../src/lib/feeds/noaa';
import { AIR_VARS, FORECAST_VARS, buildUrl, parseOpenMeteo } from '../src/lib/feeds/openMeteo';
import { getFeed, resetFeedMemo } from '../src/lib/feeds/registry';
import { parseUsgs, usgsEventUrl } from '../src/lib/feeds/usgs';
import { DESCRIPTORS, ENGINE_CONFIG } from '../src/lib/engine/descriptors';

const fixture = (name: string): unknown =>
  JSON.parse(readFileSync(join(__dirname, 'fixtures', name), 'utf8'));

/** Fixtures were captured around 2026-09-06T02:46Z; parsers drop anything after `now`. */
const CAPTURED_AT = Date.UTC(2026, 8, 6, 2, 50);

describe('USGS', () => {
  it('parses the hour feed into earthquake events with depth, place, and url', () => {
    const { events, generated } = parseUsgs(fixture('usgs_hour.json'));
    expect(events.length).toBe(3);
    expect(generated).toBe(1788662750000);
    const e = events[0]!;
    expect(e).toMatchObject({ id: 'aka2026rqgcof', source: 'usgs', kind: 'earthquake', magnitude: 1 });
    expect(e.lat).toBeCloseTo(64.856, 3);
    expect(e.lon).toBeCloseTo(-147.21, 2);
    expect(e.depthKm).toBe(4.9);
    expect(e.label).toContain('Alaska');
    expect(e.url).toBeUndefined();
    expect(usgsEventUrl(e.id)).toBe('https://earthquake.usgs.gov/earthquakes/eventpage/aka2026rqgcof');
  });

  it('keeps non-earthquake types under their own kind and drops null magnitudes', () => {
    const { events } = parseUsgs(fixture('usgs_month_trimmed.json'));
    const kinds = new Set(events.map((e) => e.kind));
    expect(kinds.has('earthquake')).toBe(true);
    expect([...kinds].some((k) => k !== 'earthquake')).toBe(true);
    expect(kinds.has('quarry blast')).toBe(false);
    for (const e of events) expect(Number.isFinite(e.magnitude)).toBe(true);
  });

  it('can drop labels below a magnitude to keep the month payload small', () => {
    const { events } = parseUsgs(fixture('usgs_month_trimmed.json'), { labelMinMagnitude: 4 });
    expect(events.some((e) => e.magnitude < 4 && e.label !== undefined)).toBe(false);
    expect(events.every((e) => Number.isInteger(e.lat * 1000) || Math.abs(e.lat * 1000 - Math.round(e.lat * 1000)) < 1e-6)).toBe(true);
  });

  it('rejects a non-GeoJSON body', () => {
    expect(() => parseUsgs({ hello: 'world' })).toThrow(/FeatureCollection/);
  });
});

describe('NOAA', () => {
  it('keeps only active-source rows and both wind series', () => {
    const points = parseRtswWind(fixture('rtsw_wind_trimmed.json'));
    const speed = points.filter((p) => p.seriesId === NOAA_SERIES.speed);
    const density = points.filter((p) => p.seriesId === NOAA_SERIES.density);
    expect(speed.length).toBeGreaterThan(50);
    expect(speed.length).toBe(density.length);
    expect(speed[0]!.t).toBe(Date.UTC(2026, 8, 6, 2, 42));
    expect(speed[0]!.v).toBe(336);
  });

  it('parses Bz, 1-minute Kp, and 3-hour Kp', () => {
    const bz = parseRtswMag(fixture('rtsw_mag_trimmed.json'));
    expect(bz[0]).toEqual({ seriesId: NOAA_SERIES.bz, t: Date.UTC(2026, 8, 6, 2, 42), v: 0.31 });
    const kp1m = parseKp1m(fixture('kp_1m.json'));
    expect(kp1m[0]).toEqual({ seriesId: NOAA_SERIES.kp1m, t: Date.UTC(2026, 8, 5, 20, 45), v: 0.33 });
    const kp3h = parseKp3h(fixture('kp_3h.json'));
    expect(kp3h.length).toBe(56);
    expect(kp3h[0]).toEqual({ seriesId: NOAA_SERIES.kp3h, t: Date.UTC(2026, 7, 30, 0, 0), v: 3.67 });
  });

  it('rejects a non-array body', () => {
    expect(() => parseRtswWind({})).toThrow();
  });
});

describe('Open-Meteo', () => {
  it('builds one batched request with every anchor city', () => {
    const url = new URL(buildUrl('https://api.open-meteo.com/v1/forecast', FORECAST_VARS));
    expect(url.searchParams.get('latitude')!.split(',')).toHaveLength(CITIES.length);
    expect(url.searchParams.get('hourly')).toBe('temperature_2m,pressure_msl,wind_gusts_10m,precipitation');
    expect(url.searchParams.get('past_days')).toBe('7');
    expect(url.searchParams.get('timeformat')).toBe('unixtime');
  });

  it('maps locations to cities by order and drops future hours', () => {
    const points = parseOpenMeteo(fixture('open_meteo.json'), 'meteo', FORECAST_VARS, CAPTURED_AT);
    const nycTemp = points.filter((p) => p.seriesId === 'meteo.nyc.temp');
    expect(nycTemp.length).toBeGreaterThan(160);
    expect(nycTemp.length).toBeLessThan(192);
    expect(nycTemp[0]!.t).toBe(1788048000 * 1000);
    expect(nycTemp[0]!.v).toBe(21.3);
    expect(Math.max(...points.map((p) => p.t))).toBeLessThanOrEqual(CAPTURED_AT);
    const ids = new Set(points.map((p) => p.seriesId));
    expect(ids.size).toBe(CITIES.length * 4);
    expect(ids.has('meteo.syd.precip')).toBe(true);
  });

  it('parses air quality under the aq prefix', () => {
    const points = parseOpenMeteo(fixture('air_quality.json'), 'aq', AIR_VARS, CAPTURED_AT);
    const ids = new Set(points.map((p) => p.seriesId));
    expect(ids.size).toBe(CITIES.length * 2);
    expect(points.find((p) => p.seriesId === 'aq.nyc.pm25')!.v).toBe(14.2);
  });

  it('surfaces the upstream error reason', () => {
    expect(() => parseOpenMeteo({ error: true, reason: 'Latitude must be in range' }, 'meteo', FORECAST_VARS, CAPTURED_AT)).toThrow(/Latitude/);
  });
});

describe('EONET', () => {
  it('keeps supported categories, uses the latest geometry, and carries units', () => {
    const events = parseEonet(fixture('eonet_trimmed.json'));
    expect(events.length).toBeGreaterThan(0);
    const storm = events.find((e) => e.id === 'eonet:EONET_23800')!;
    expect(storm).toMatchObject({ kind: 'storm', label: 'Hurricane Marie', magnitude: 80, magnitudeUnit: 'kts' });
    expect(storm.lat).toBe(21.9);
    expect(storm.lon).toBe(-120.6);
    expect(storm.t).toBe(Date.UTC(2026, 8, 5, 18, 0));
    const ice = events.find((e) => e.id === 'eonet:EONET_2736')!;
    expect(ice.kind).toBe('sea-ice');
    expect(events.every((e) => ['wildfire', 'storm', 'volcano', 'sea-ice'].includes(e.kind))).toBe(true);
  });

  it('takes the centroid of a polygon geometry', () => {
    const events = parseEonet({
      events: [
        {
          id: 'X',
          title: 'Poly',
          categories: [{ id: 'wildfires' }],
          geometry: [{ date: '2026-09-01T00:00:00Z', type: 'Polygon', coordinates: [[[10, 20], [12, 20], [12, 22], [10, 22]]] }],
        },
      ],
    });
    expect(events[0]!.lat).toBe(21);
    expect(events[0]!.lon).toBe(11);
  });
});

describe('ISS', () => {
  it('parses position into a single moving event', () => {
    const e = parseIss(fixture('iss.json'));
    expect(e).toMatchObject({ id: 'iss', kind: 'iss', t: 1788662769000, magnitudeUnit: 'km' });
    expect(e.lat).toBeCloseTo(-17.579, 2);
    expect(e.magnitude).toBeCloseTo(424.3, 1);
  });
});

describe('registry', () => {
  afterEach(() => {
    resetFeedMemo();
    vi.unstubAllGlobals();
  });

  it('memoizes for the poll interval and coalesces concurrent calls', async () => {
    const fetchMock = vi.fn(async () => new Response(JSON.stringify(fixture('iss.json')), { status: 200 }));
    vi.stubGlobal('fetch', fetchMock);
    const now = CAPTURED_AT;
    const [a, b] = await Promise.all([getFeed('iss', now), getFeed('iss', now)]);
    expect(a).toBe(b);
    expect(fetchMock).toHaveBeenCalledTimes(1);
    await getFeed('iss', now + 5_000);
    expect(fetchMock).toHaveBeenCalledTimes(1);
    await getFeed('iss', now + 11_000);
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it('serves the last good data with ok=false when the upstream fails', async () => {
    let calls = 0;
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => {
        calls++;
        return calls === 1
          ? new Response(JSON.stringify(fixture('iss.json')), { status: 200 })
          : new Response('nope', { status: 503 });
      }),
    );
    const good = await getFeed('iss', CAPTURED_AT);
    expect(good.ok).toBe(true);
    const bad = await getFeed('iss', CAPTURED_AT + 20_000);
    expect(bad.ok).toBe(false);
    expect(bad.error).toMatch(/HTTP 503/);
    expect(bad.events).toEqual(good.events);
    expect(bad.lastGoodAt).toBe(CAPTURED_AT);
  });
});

describe('engine over real fixtures', () => {
  it('runs the dashboard config against parsed fixtures without throwing', () => {
    const series = [
      ...parseRtswWind(fixture('rtsw_wind_trimmed.json')),
      ...parseRtswMag(fixture('rtsw_mag_trimmed.json')),
      ...parseKp1m(fixture('kp_1m.json')),
      ...parseKp3h(fixture('kp_3h.json')),
      ...parseOpenMeteo(fixture('open_meteo.json'), 'meteo', FORECAST_VARS, CAPTURED_AT),
      ...parseOpenMeteo(fixture('air_quality.json'), 'aq', AIR_VARS, CAPTURED_AT),
    ];
    const events = [
      ...parseUsgs(fixture('usgs_month_trimmed.json')).events,
      ...parseEonet(fixture('eonet_trimmed.json')),
      parseIss(fixture('iss.json')),
    ];
    const result = runEngine({ series, events, descriptors: [...DESCRIPTORS], now: CAPTURED_AT }, ENGINE_CONFIG);
    expect(result.evaluatedSeries).toBeGreaterThan(70);
    expect(result.evaluatedEvents).toBe(events.length);
    for (const s of result.signals) {
      expect(s.summary).not.toMatch(/undefined|NaN/);
      expect(s.severity).toBeGreaterThanOrEqual(0);
    }
  });
});
