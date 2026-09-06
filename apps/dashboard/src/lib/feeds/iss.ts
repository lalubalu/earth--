/* Programmer: Lalith Satheesh / Date: 09/05/2026 */
import { fetchJson, isRecord, num } from './http';
import type { FeedEvent, FeedPayload } from './types';

export const ISS_URL = 'https://api.wheretheiss.at/v1/satellites/25544';

export const ISS_EVENT_ID = 'iss';

/**
 * Verified 2026-09-05: { name: "iss", id: 25544, latitude, longitude, altitude (km),
 * velocity (km/h), timestamp (unix seconds), visibility, units: "kilometers" }.
 * Modelled as a single moving GeoEvent so the globe needs no special case; `magnitude`
 * carries altitude and nothing in the engine targets kind "iss".
 */
export function parseIss(body: unknown): FeedEvent {
  if (!isRecord(body)) throw new Error('ISS: unexpected shape');
  const lat = num(body.latitude);
  const lon = num(body.longitude);
  const ts = num(body.timestamp);
  if (lat === null || lon === null || ts === null) throw new Error('ISS: missing position');
  return {
    id: ISS_EVENT_ID,
    source: 'wheretheiss',
    kind: 'iss',
    lat,
    lon,
    t: ts * 1000,
    magnitude: num(body.altitude) ?? 0,
    magnitudeUnit: 'km',
    label: 'International Space Station',
    url: 'https://wheretheiss.at/',
  };
}

export async function fetchIss(now: number): Promise<FeedPayload> {
  const body = await fetchJson(ISS_URL, { revalidateSeconds: 10, timeoutMs: 8_000 });
  return { source: 'iss', ok: true, fetchedAt: now, series: [], events: [parseIss(body)], urls: [ISS_URL] };
}
