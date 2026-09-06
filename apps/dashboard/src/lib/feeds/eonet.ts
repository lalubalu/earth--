/* Programmer: Lalith Satheesh / Date: 09/05/2026 */
import { fetchJson, isRecord, num, parseUtc, str } from './http';
import type { FeedEvent, FeedPayload } from './types';

export const EONET_URL = 'https://eonet.gsfc.nasa.gov/api/v3/events?status=open&days=30';

/** EONET category id to our event kind. Anything else is dropped. */
export const EONET_KINDS: Record<string, string> = {
  wildfires: 'wildfire',
  severeStorms: 'storm',
  volcanoes: 'volcano',
  seaLakeIce: 'sea-ice',
};

function ringCentroid(ring: unknown): { lat: number; lon: number } | null {
  if (!Array.isArray(ring) || ring.length === 0) return null;
  let lat = 0;
  let lon = 0;
  let n = 0;
  for (const pt of ring) {
    if (!Array.isArray(pt)) continue;
    const x = num(pt[0]);
    const y = num(pt[1]);
    if (x === null || y === null) continue;
    lon += x;
    lat += y;
    n++;
  }
  return n === 0 ? null : { lat: lat / n, lon: lon / n };
}

/**
 * Verified 2026-09-05: { events: [{ id: "EONET_23800", title, categories: [{ id, title }],
 * sources: [{ id, url }], geometry: [{ date, type: "Point", coordinates: [lon, lat],
 * magnitudeValue (nullable), magnitudeUnit }] }]. Geometry is chronological; the last entry
 * is the current position. Polygons are documented but every open event was a Point.
 */
export function parseEonet(body: unknown): FeedEvent[] {
  if (!isRecord(body) || !Array.isArray(body.events)) throw new Error('EONET: no events array');
  const out: FeedEvent[] = [];
  for (const ev of body.events) {
    if (!isRecord(ev) || !Array.isArray(ev.categories) || !Array.isArray(ev.geometry)) continue;
    const id = str(ev.id);
    if (!id) continue;
    const category = ev.categories.find((c) => isRecord(c) && typeof c.id === 'string');
    const kind = category && isRecord(category) ? EONET_KINDS[String(category.id)] : undefined;
    if (!kind) continue;

    const last = ev.geometry[ev.geometry.length - 1];
    if (!isRecord(last)) continue;
    let where: { lat: number; lon: number } | null = null;
    if (last.type === 'Point' && Array.isArray(last.coordinates)) {
      const lon = num(last.coordinates[0]);
      const lat = num(last.coordinates[1]);
      if (lon !== null && lat !== null) where = { lat, lon };
    } else if (last.type === 'Polygon' && Array.isArray(last.coordinates)) {
      where = ringCentroid(last.coordinates[0]);
    }
    const t = parseUtc(last.date);
    if (!where || t === null) continue;

    const event: FeedEvent = {
      id: `eonet:${id}`,
      source: 'eonet',
      kind,
      lat: where.lat,
      lon: where.lon,
      t,
      magnitude: num(last.magnitudeValue) ?? 1,
    };
    const label = str(ev.title);
    if (label) event.label = label;
    const unit = str(last.magnitudeUnit);
    if (unit) event.magnitudeUnit = unit;
    const source = Array.isArray(ev.sources) ? ev.sources.find(isRecord) : undefined;
    const url = source ? str(source.url) : null;
    if (url) event.url = url;
    out.push(event);
  }
  return out;
}

export async function fetchEonet(now: number): Promise<FeedPayload> {
  const body = await fetchJson(EONET_URL, { revalidateSeconds: 600 });
  const events = parseEonet(body);
  return { source: 'eonet', ok: true, fetchedAt: now, series: [], events, urls: [EONET_URL] };
}
