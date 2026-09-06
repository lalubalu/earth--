/* Programmer: Lalith Satheesh / Date: 09/05/2026 */
import type { GeoEvent, SeriesPoint } from '../src/index.js';

export const MINUTE = 60_000;
export const HOUR = 3_600_000;
export const DAY = 86_400_000;
export const NOW = Date.UTC(2026, 8, 5, 12, 0, 0);

/** mulberry32: tiny, seedable, good enough for synthetic fixtures. */
export function rng(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export function gaussian(rand: () => number): () => number {
  return () => {
    const u = 1 - rand();
    const v = rand();
    return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v);
  };
}

export interface SeriesOptions {
  id?: string;
  end?: number;
  stepMs?: number;
  count?: number;
  base?: number;
  sigma?: number;
  seed?: number;
  /** Extra deterministic term per index, e.g. a step or ramp. */
  shape?: (i: number, n: number) => number;
}

/** `count` samples ending at `end`, base + gaussian noise + shape(i). */
export function makeSeries(opts: SeriesOptions = {}): SeriesPoint[] {
  const {
    id = 's',
    end = NOW,
    stepMs = HOUR,
    count = 7 * 24,
    base = 100,
    sigma = 1,
    seed = 1,
    shape,
  } = opts;
  const noise = gaussian(rng(seed));
  const out: SeriesPoint[] = [];
  for (let i = 0; i < count; i++) {
    const t = end - (count - 1 - i) * stepMs;
    out.push({ seriesId: id, t, v: base + sigma * noise() + (shape ? shape(i, count) : 0) });
  }
  return out;
}

export interface EventOptions {
  kind?: string;
  source?: string;
  count: number;
  from: number;
  to: number;
  lat?: number;
  lon?: number;
  spreadKm?: number;
  magnitude?: number;
  seed?: number;
  idPrefix?: string;
}

/** Uniformly spread events in time and inside a square of `spreadKm` around a centre. */
export function makeEvents(opts: EventOptions): GeoEvent[] {
  const {
    kind = 'earthquake',
    source = 'test',
    count,
    from,
    to,
    lat = 0,
    lon = 0,
    spreadKm = 0,
    magnitude = 3,
    seed = 7,
    idPrefix = kind,
  } = opts;
  const rand = rng(seed);
  const out: GeoEvent[] = [];
  const dLat = spreadKm / 111;
  const dLon = spreadKm / (111 * Math.max(0.1, Math.cos((lat * Math.PI) / 180)));
  for (let i = 0; i < count; i++) {
    out.push({
      id: `${idPrefix}-${seed}-${i}`,
      source,
      kind,
      lat: lat + (rand() * 2 - 1) * dLat,
      lon: lon + (rand() * 2 - 1) * dLon,
      t: from + rand() * (to - from),
      magnitude,
    });
  }
  return out;
}
