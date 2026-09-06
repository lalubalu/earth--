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
export function parseUsgs(body: unknown): { events: FeedEvent[]; generated?: number } {
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
      lat,
      lon,
      t,
      magnitude: mag,
    };
    const label = str(f.properties.place) ?? str(f.properties.title);
    if (label) event.label = label;
    const depth = num(coords[2]);
    if (depth !== null) event.depthKm = depth;
    // The event page URL is derivable from the id; shipping 11k copies of it is 800 KB.
    events.push(event);
  }
  const out: { events: FeedEvent[]; generated?: number } = { events };
  if (generated !== undefined) out.generated = generated;
  return out;
}

async function fetchUsgs(
  source: 'usgs-hour' | 'usgs-month',
  url: string,
  now: number,
  revalidateSeconds?: number,
): Promise<FeedPayload> {
  const opts = revalidateSeconds === undefined ? {} : { revalidateSeconds };
  const body = await fetchJson(url, opts);
  const { events, generated } = parseUsgs(body);
  const payload: FeedPayload = { source, ok: true, fetchedAt: now, series: [], events, urls: [url] };
  if (generated !== undefined) payload.upstreamUpdatedAt = generated;
  return payload;
}

export function fetchUsgsHour(now: number): Promise<FeedPayload> {
  return fetchUsgs('usgs-hour', USGS_HOUR_URL, now, 60);
}

/** ~8 MB upstream, so it bypasses Next's data cache; the registry memoizes the parsed result. */
export function fetchUsgsMonth(now: number): Promise<FeedPayload> {
  return fetchUsgs('usgs-month', USGS_MONTH_URL, now);
}
