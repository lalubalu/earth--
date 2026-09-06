/* Programmer: Lalith Satheesh / Date: 09/05/2026 */
import type { GeoEvent, SeriesPoint } from '@lalubalu/signal-engine';

export const FEED_SOURCES = [
  'usgs-hour',
  'usgs-month',
  'noaa',
  'open-meteo',
  'air-quality',
  'eonet',
  'iss',
] as const;

export type FeedSource = (typeof FEED_SOURCES)[number];

export function isFeedSource(value: string): value is FeedSource {
  return (FEED_SOURCES as readonly string[]).includes(value);
}

/** GeoEvent plus the display-only fields the drawer and globe use. */
export interface FeedEvent extends GeoEvent {
  depthKm?: number;
  magnitudeUnit?: string;
  url?: string;
}

export interface FeedPayload {
  source: FeedSource;
  ok: boolean;
  /** Server time of this fetch, epoch ms. */
  fetchedAt: number;
  /** When the upstream says it generated the data, if it says. */
  upstreamUpdatedAt?: number;
  series: SeriesPoint[];
  events: FeedEvent[];
  /** Partial-failure detail; `ok` is false when the fetch failed outright. */
  error?: string;
  /** Set on a failed fetch that is serving the last good data instead of nothing. */
  lastGoodAt?: number;
  /** Upstream URLs that were hit, for the status bar tooltip. */
  urls: string[];
}

export interface FeedSpec {
  source: FeedSource;
  label: string;
  /** Client poll cadence and server-side cache TTL, in ms. */
  intervalMs: number;
  fetch: (now: number) => Promise<FeedPayload>;
}

export const SECOND = 1_000;
export const MINUTE = 60 * SECOND;
export const HOUR = 60 * MINUTE;
