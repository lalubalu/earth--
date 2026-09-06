/* Programmer: Lalith Satheesh / Date: 09/05/2026 */
import type { SeriesPoint } from '@lalubalu/signal-engine';
import { CITIES } from './cities';
import { fetchJson, isRecord } from './http';
import type { FeedPayload, FeedSource } from './types';

export const OPEN_METEO_FORECAST_URL = 'https://api.open-meteo.com/v1/forecast';
export const OPEN_METEO_AIR_URL = 'https://air-quality-api.open-meteo.com/v1/air-quality';

/** Upstream variable name to our series suffix. */
export const FORECAST_VARS = {
  temperature_2m: 'temp',
  pressure_msl: 'pressure',
  wind_gusts_10m: 'gust',
  precipitation: 'precip',
} as const;

export const AIR_VARS = {
  pm2_5: 'pm25',
  us_aqi: 'aqi',
} as const;

export function seriesId(prefix: 'meteo' | 'aq', cityId: string, suffix: string): string {
  return `${prefix}.${cityId}.${suffix}`;
}

/**
 * One request for all cities. `past_days=7` gives the baseline; `forecast_days=1` covers
 * today's hours up to now (future hours are dropped in the parser). Weighted at roughly
 * 12 locations * 8 days / 7 ~ 14 call units per request, ~1.3k/day at a 15 min cadence.
 */
export function buildUrl(base: string, vars: Record<string, string>): string {
  const params = new URLSearchParams({
    latitude: CITIES.map((c) => c.lat).join(','),
    longitude: CITIES.map((c) => c.lon).join(','),
    hourly: Object.keys(vars).join(','),
    past_days: '7',
    forecast_days: '1',
    timeformat: 'unixtime',
  });
  return `${base}?${params.toString()}`;
}

/**
 * Verified 2026-09-05: with comma-separated coordinates the response is an array, one object
 * per location in request order, each with hourly { time: number[] (unix seconds), <var>:
 * (number | null)[] } and hourly_units. There is no location id, so order is the join key.
 */
export function parseOpenMeteo(
  body: unknown,
  prefix: 'meteo' | 'aq',
  vars: Record<string, string>,
  now: number,
): SeriesPoint[] {
  const list = Array.isArray(body) ? body : isRecord(body) && isRecord(body.hourly) ? [body] : null;
  if (!list) {
    const reason = isRecord(body) && typeof body.reason === 'string' ? body.reason : 'unexpected shape';
    throw new Error(`Open-Meteo: ${reason}`);
  }
  const out: SeriesPoint[] = [];
  list.forEach((loc, i) => {
    const city = CITIES[i];
    if (!city || !isRecord(loc) || !isRecord(loc.hourly)) return;
    const times = loc.hourly.time;
    if (!Array.isArray(times)) return;
    for (const [upstream, suffix] of Object.entries(vars)) {
      const column = loc.hourly[upstream];
      if (!Array.isArray(column)) continue;
      const id = seriesId(prefix, city.id, suffix);
      times.forEach((sec, k) => {
        const v = column[k];
        if (typeof sec !== 'number' || typeof v !== 'number' || !Number.isFinite(v)) return;
        const t = sec * 1000;
        if (t > now) return;
        out.push({ seriesId: id, t, v });
      });
    }
  });
  return out;
}

async function fetchBatch(
  source: FeedSource,
  base: string,
  prefix: 'meteo' | 'aq',
  vars: Record<string, string>,
  now: number,
): Promise<FeedPayload> {
  const url = buildUrl(base, vars);
  const body = await fetchJson(url, { revalidateSeconds: 900 });
  const series = parseOpenMeteo(body, prefix, vars, now);
  return { source, ok: series.length > 0, fetchedAt: now, series, events: [], urls: [url] };
}

export function fetchOpenMeteo(now: number): Promise<FeedPayload> {
  return fetchBatch('open-meteo', OPEN_METEO_FORECAST_URL, 'meteo', FORECAST_VARS, now);
}

export function fetchAirQuality(now: number): Promise<FeedPayload> {
  return fetchBatch('air-quality', OPEN_METEO_AIR_URL, 'aq', AIR_VARS, now);
}
