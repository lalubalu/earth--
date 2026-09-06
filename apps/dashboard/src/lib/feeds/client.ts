/* Programmer: Lalith Satheesh / Date: 09/05/2026 */
'use client';

import { useQueries } from '@tanstack/react-query';
import type { UseQueryResult } from '@tanstack/react-query';
import { useEffect, useMemo, useState } from 'react';
import type { SeriesPoint } from '@lalubalu/signal-engine';
import { FEED_INTERVALS } from './intervals';
import { FEED_SOURCES } from './types';
import type { FeedEvent, FeedPayload, FeedSource } from './types';

export type FeedHealth = 'loading' | 'live' | 'stale' | 'degraded' | 'down';

export interface FeedState {
  source: FeedSource;
  payload?: FeedPayload;
  health: FeedHealth;
  /** Client-side time of the last successful response. */
  receivedAt?: number;
  error?: string;
}

export interface FeedsSnapshot {
  feeds: Record<FeedSource, FeedState>;
  /** Every source except the ISS, which is a marker rather than a measurement. */
  series: SeriesPoint[];
  events: FeedEvent[];
  /** The ISS position, kept apart so its 10 s cadence never re-indexes everything else. */
  iss: FeedEvent | null;
  /** Changes whenever a non-ISS payload changes; a cheap dependency for effects. */
  version: string;
}

async function fetchFeed(source: FeedSource): Promise<FeedPayload> {
  const res = await fetch(`/api/feeds/${source}`, { headers: { accept: 'application/json' } });
  if (!res.ok) throw new Error(`Feed route ${source} returned HTTP ${res.status}`);
  return (await res.json()) as FeedPayload;
}

interface Slice {
  payload: FeedPayload | undefined;
  receivedAt: number;
  fetchError: string | undefined;
}

// Module-level so useQueries can memoize the combined value across renders.
function combine(results: UseQueryResult<FeedPayload, Error>[]): Slice[] {
  return results.map((r) => ({
    payload: r.data,
    receivedAt: r.dataUpdatedAt,
    fetchError: r.error?.message,
  }));
}

function healthOf(source: FeedSource, slice: Slice, now: number): FeedHealth {
  const { payload, fetchError, receivedAt } = slice;
  if (!payload) return fetchError ? 'down' : 'loading';
  const hasData = payload.series.length + payload.events.length > 0;
  if (!payload.ok) return hasData ? 'degraded' : 'down';
  if (fetchError) return 'degraded';
  // One missed poll plus the server TTL before it counts as stale.
  if (receivedAt > 0 && now - receivedAt > FEED_INTERVALS[source] * 2 + 5_000) return 'stale';
  return 'live';
}

/**
 * Seven polled queries merged into one snapshot. The hour USGS feed is listed after the
 * month feed so its fresher copies of overlapping events win the engine's id dedupe.
 */
/**
 * `heavyAllowed` gates the 30-day USGS file, the one heavy payload. On a slow connection
 * it would hold up the first signals, so the dashboard passes true once the engine has
 * produced a first result (or after a few seconds); the engine runs again when the
 * baseline arrives and the event-rate and swarm detectors join in.
 */
export function useFeeds(now: number, heavyAllowed: boolean): FeedsSnapshot {
  const [timedOut, setTimedOut] = useState(false);
  const monthEnabled = heavyAllowed || timedOut;
  const slices = useQueries({
    queries: FEED_SOURCES.map((source) => ({
      queryKey: ['feed', source],
      queryFn: () => fetchFeed(source),
      enabled: source !== 'usgs-month' || monthEnabled,
      refetchInterval: FEED_INTERVALS[source],
      staleTime: FEED_INTERVALS[source],
      // Keep the last payload on screen while a refetch fails.
      placeholderData: (prev: FeedPayload | undefined) => prev,
    })),
    combine,
  });
  useEffect(() => {
    if (monthEnabled) return;
    const t = setTimeout(() => setTimedOut(true), 6_000);
    return () => clearTimeout(t);
  }, [monthEnabled]);

  const issIndex = FEED_SOURCES.indexOf('iss');
  const bulk = slices.filter((_, i) => i !== issIndex);
  const issPayload = slices[issIndex]?.payload;
  // fetchedAt is the server's stamp per payload, so this key changes exactly when a non-ISS
  // payload does; the ISS poll must not rebuild 25k records every ten seconds.
  const bulkKey = bulk.map((b) => b.payload?.fetchedAt ?? 0).join('.');

  const merged = useMemo(() => {
    const series: SeriesPoint[] = [];
    const events: FeedEvent[] = [];
    const stamps: number[] = [];
    for (const slice of bulk) {
      if (!slice.payload) continue;
      series.push(...slice.payload.series);
      events.push(...slice.payload.events);
      stamps.push(slice.payload.fetchedAt);
    }
    return { series, events, version: stamps.join('.') };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [bulkKey]);

  return useMemo(() => {
    const feeds = {} as Record<FeedSource, FeedState>;
    FEED_SOURCES.forEach((source, i) => {
      const slice = slices[i] ?? { payload: undefined, receivedAt: 0, fetchError: undefined };
      const state: FeedState = { source, health: healthOf(source, slice, now) };
      if (slice.payload) state.payload = slice.payload;
      if (slice.receivedAt > 0) state.receivedAt = slice.receivedAt;
      const err = slice.payload?.error ?? slice.fetchError;
      if (err) state.error = err;
      feeds[source] = state;
    });
    return { feeds, ...merged, iss: issPayload?.events[0] ?? null };
  }, [slices, merged, now, issPayload]);
}
