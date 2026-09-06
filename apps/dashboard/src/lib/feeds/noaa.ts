/* Programmer: Lalith Satheesh / Date: 09/05/2026 */
import type { SeriesPoint } from '@lalubalu/signal-engine';
import { fetchJson, isRecord, num, parseUtc } from './http';
import type { FeedPayload } from './types';

/**
 * The 7-day products under /products/solar-wind/ returned 404 on 2026-09-05 (the directory
 * is gone), so the engine baselines solar wind on these ~24 h real-time files instead.
 */
export const NOAA_WIND_URL = 'https://services.swpc.noaa.gov/json/rtsw/rtsw_wind_1m.json';
export const NOAA_MAG_URL = 'https://services.swpc.noaa.gov/json/rtsw/rtsw_mag_1m.json';
/** ~6 h of 1-minute estimated Kp. */
export const NOAA_KP_1M_URL = 'https://services.swpc.noaa.gov/json/planetary_k_index_1m.json';
/** 7 days of 3-hour Kp, the only multi-day Kp baseline SWPC still serves as JSON. */
export const NOAA_KP_3H_URL = 'https://services.swpc.noaa.gov/products/noaa-planetary-k-index.json';

export const NOAA_SERIES = {
  speed: 'noaa.speed',
  density: 'noaa.density',
  bz: 'noaa.bz',
  kp1m: 'noaa.kp_1m',
  kp3h: 'noaa.kp',
} as const;

/**
 * Verified 2026-09-05: array of rows { time_tag: "2026-09-06T02:42:00" (UTC, no zone),
 * active: boolean, source: "SOLAR1" | "ACE" | "IMAP", proton_speed, proton_density, ... }.
 * Several spacecraft report the same minute; `active` marks the one SWPC is using.
 */
export function parseRtswWind(body: unknown): SeriesPoint[] {
  if (!Array.isArray(body)) throw new Error('NOAA wind: expected an array');
  const out: SeriesPoint[] = [];
  for (const row of body) {
    if (!isRecord(row) || row.active !== true) continue;
    const t = parseUtc(row.time_tag);
    if (t === null) continue;
    const speed = num(row.proton_speed);
    const density = num(row.proton_density);
    if (speed !== null) out.push({ seriesId: NOAA_SERIES.speed, t, v: speed });
    if (density !== null) out.push({ seriesId: NOAA_SERIES.density, t, v: density });
  }
  return out;
}

/** Same row shape as wind with bz_gsm (nT). */
export function parseRtswMag(body: unknown): SeriesPoint[] {
  if (!Array.isArray(body)) throw new Error('NOAA mag: expected an array');
  const out: SeriesPoint[] = [];
  for (const row of body) {
    if (!isRecord(row) || row.active !== true) continue;
    const t = parseUtc(row.time_tag);
    const bz = num(row.bz_gsm);
    if (t === null || bz === null) continue;
    out.push({ seriesId: NOAA_SERIES.bz, t, v: bz });
  }
  return out;
}

/** Rows { time_tag, kp_index (integer), estimated_kp (float), kp: "1P" }. */
export function parseKp1m(body: unknown): SeriesPoint[] {
  if (!Array.isArray(body)) throw new Error('NOAA Kp 1m: expected an array');
  const out: SeriesPoint[] = [];
  for (const row of body) {
    if (!isRecord(row)) continue;
    const t = parseUtc(row.time_tag);
    const kp = num(row.estimated_kp) ?? num(row.kp_index);
    if (t === null || kp === null) continue;
    out.push({ seriesId: NOAA_SERIES.kp1m, t, v: kp });
  }
  return out;
}

/** Rows { time_tag, Kp, a_running, station_count } every 3 h for 7 days. */
export function parseKp3h(body: unknown): SeriesPoint[] {
  if (!Array.isArray(body)) throw new Error('NOAA Kp 3h: expected an array');
  const out: SeriesPoint[] = [];
  for (const row of body) {
    if (!isRecord(row)) continue;
    const t = parseUtc(row.time_tag);
    const kp = num(row.Kp);
    if (t === null || kp === null) continue;
    out.push({ seriesId: NOAA_SERIES.kp3h, t, v: kp });
  }
  return out;
}

interface Part {
  url: string;
  parse: (body: unknown) => SeriesPoint[];
  /** Left undefined for the 2.6 MB wind file, which Next's data cache would refuse anyway. */
  revalidateSeconds?: number;
}

const PARTS: Part[] = [
  { url: NOAA_WIND_URL, parse: parseRtswWind },
  { url: NOAA_MAG_URL, parse: parseRtswMag, revalidateSeconds: 60 },
  { url: NOAA_KP_1M_URL, parse: parseKp1m, revalidateSeconds: 60 },
  { url: NOAA_KP_3H_URL, parse: parseKp3h, revalidateSeconds: 60 },
];

/** Four files, fetched together; a failing one degrades the payload instead of killing it. */
export async function fetchNoaa(now: number): Promise<FeedPayload> {
  const results = await Promise.allSettled(
    PARTS.map(async (p) => {
      const opts = p.revalidateSeconds === undefined ? {} : { revalidateSeconds: p.revalidateSeconds };
      return p.parse(await fetchJson(p.url, opts));
    }),
  );
  const series: SeriesPoint[] = [];
  const failures: string[] = [];
  results.forEach((r, i) => {
    if (r.status === 'fulfilled') series.push(...r.value);
    else failures.push(`${PARTS[i]!.url.split('/').pop()}: ${String(r.reason?.message ?? r.reason)}`);
  });
  const payload: FeedPayload = {
    source: 'noaa',
    ok: series.length > 0,
    fetchedAt: now,
    series,
    events: [],
    urls: PARTS.map((p) => p.url),
  };
  if (failures.length > 0) payload.error = failures.join('; ');
  return payload;
}
