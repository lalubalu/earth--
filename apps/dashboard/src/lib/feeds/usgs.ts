/* Programmer: Lalith Satheesh / Date: 09/05/2026 */
import { fetchJson, isRecord, num, str } from './http';
import type { FeedEvent, FeedPayload } from './types';

export const USGS_HOUR_URL =
  'https://earthquake.usgs.gov/earthquakes/feed/v1.0/summary/all_hour.geojson';
export const USGS_MONTH_URL =
  'https://earthquake.usgs.gov/earthquakes/feed/v1.0/summary/all_month.geojson';

export function usgsEventUrl(id: string): string {
  return `https://earthquake.usgs.gov/earthquakes/eventpage/${encodeURIComponent(id)}`;
}

/**
 * Verified 2026-09-05: FeatureCollection; feature.id like "aka2026rqgcof";
 * properties { mag (nullable), place, time (ms), type: earthquake | quarry blast | explosion |
 * ice quake | landslide, url }; geometry.coordinates [lon, lat, depthKm].
 */
export interface ParseUsgsOptions {
  /** Keep the place string only at or above this magnitude; 11k labels are 600 KB. */
  labelMinMagnitude?: number;
}

export function parseUsgs(
  body: unknown,
  options: ParseUsgsOptions = {},
): { events: FeedEvent[]; generated?: number } {
  const labelMin = options.labelMinMagnitude ?? -Infinity;
  if (!isRecord(body) || !Array.isArray(body.features)) {
    throw new Error('USGS: not a GeoJSON FeatureCollection');
  }
  const generated = isRecord(body.metadata) ? (num(body.metadata.generated) ?? undefined) : undefined;
  const events: FeedEvent[] = [];
  for (const f of body.features) {
    if (!isRecord(f) || !isRecord(f.properties) || !isRecord(f.geometry)) continue;
    const id = str(f.id);
    const coords = f.geometry.coordinates;
    if (!id || !Array.isArray(coords)) continue;
    const lon = num(coords[0]);
    const lat = num(coords[1]);
    const mag = num(f.properties.mag);
    const t = num(f.properties.time);
    if (lon === null || lat === null || mag === null || t === null) continue;
    const type = str(f.properties.type) ?? 'earthquake';
    const event: FeedEvent = {
      id,
      source: 'usgs',
      kind: type === 'earthquake' ? 'earthquake' : type.replace(/\s+/g, '-'),
      lat: round(lat, 3),
      lon: round(lon, 3),
      t,
      magnitude: round(mag, 2),
    };
    const label = mag >= labelMin ? (str(f.properties.place) ?? str(f.properties.title)) : null;
    if (label) event.label = label;
    const depth = num(coords[2]);
    if (depth !== null) event.depthKm = round(depth, 1);
    // The event page URL is derivable from the id; shipping 11k copies of it is 800 KB.
    events.push(event);
  }
  const out: { events: FeedEvent[]; generated?: number } = { events };
  if (generated !== undefined) out.generated = generated;
  return out;
}

function round(x: number, digits: number): number {
  const f = 10 ** digits;
  return Math.round(x * f) / f;
}

async function fetchUsgs(
  source: 'usgs-hour' | 'usgs-month',
  url: string,
  now: number,
  revalidateSeconds?: number,
  parseOptions: ParseUsgsOptions = {},
): Promise<FeedPayload> {
  const opts = revalidateSeconds === undefined ? {} : { revalidateSeconds };
  const body = await fetchJson(url, opts);
  const { events, generated } = parseUsgs(body, parseOptions);
  const payload: FeedPayload = { source, ok: true, fetchedAt: now, series: [], events, urls: [url] };
  if (generated !== undefined) payload.upstreamUpdatedAt = generated;
  return payload;
}

export function fetchUsgsHour(now: number): Promise<FeedPayload> {
  return fetchUsgs('usgs-hour', USGS_HOUR_URL, now, 60);
}

/** ~8 MB upstream, so it bypasses Next's data cache; the registry memoizes the parsed result. */
export function fetchUsgsMonth(now: number): Promise<FeedPayload> {
  return fetchUsgs('usgs-month', USGS_MONTH_URL, now, undefined, { labelMinMagnitude: 4 });
}
