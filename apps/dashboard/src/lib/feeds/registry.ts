/* Programmer: Lalith Satheesh / Date: 09/05/2026 */
import { fetchEonet } from './eonet';
import { fetchIss } from './iss';
import { fetchNoaa } from './noaa';
import { FEED_INTERVALS, FEED_LABELS } from './intervals';
import { fetchAirQuality, fetchOpenMeteo } from './openMeteo';
import { SECOND } from './types';
import type { FeedPayload, FeedSource, FeedSpec } from './types';
import { fetchUsgsHour, fetchUsgsMonth } from './usgs';

const FETCHERS: Record<FeedSource, FeedSpec['fetch']> = {
  'usgs-hour': fetchUsgsHour,
  'usgs-month': fetchUsgsMonth,
  noaa: fetchNoaa,
  'open-meteo': fetchOpenMeteo,
  'air-quality': fetchAirQuality,
  eonet: fetchEonet,
  iss: fetchIss,
};

export const FEEDS: Record<FeedSource, FeedSpec> = Object.fromEntries(
  (Object.keys(FETCHERS) as FeedSource[]).map((source) => [
    source,
    { source, label: FEED_LABELS[source], intervalMs: FEED_INTERVALS[source], fetch: FETCHERS[source] },
  ]),
) as Record<FeedSource, FeedSpec>;

/** Failed fetches are retried sooner than the poll interval, but never in a tight loop. */
const FAILURE_TTL_MS = 30 * SECOND;

interface MemoEntry {
  payload: FeedPayload;
  expiresAt: number;
}

// Module scope survives across requests inside one server instance, which is what bounds
// upstream calls when many visitors poll. The CDN Cache-Control header does the rest.
const memo = new Map<FeedSource, MemoEntry>();
const inflight = new Map<FeedSource, Promise<FeedPayload>>();

export async function getFeed(source: FeedSource, now: number): Promise<FeedPayload> {
  const cached = memo.get(source);
  if (cached && cached.expiresAt > now) return cached.payload;
  const pending = inflight.get(source);
  if (pending) return pending;

  const spec = FEEDS[source];
  const run = spec
    .fetch(now)
    .then((payload) => {
      memo.set(source, { payload, expiresAt: now + spec.intervalMs });
      return payload;
    })
    .catch((err: unknown) => {
      const lastGood = memo.get(source)?.payload;
      const message = err instanceof Error ? err.message : String(err);
      const payload: FeedPayload = {
        source,
        ok: false,
        fetchedAt: now,
        series: lastGood?.ok || lastGood?.lastGoodAt ? lastGood.series : [],
        events: lastGood?.ok || lastGood?.lastGoodAt ? lastGood.events : [],
        error: message,
        urls: lastGood?.urls ?? [],
      };
      const goodAt = lastGood?.ok ? lastGood.fetchedAt : lastGood?.lastGoodAt;
      if (goodAt !== undefined) payload.lastGoodAt = goodAt;
      memo.set(source, { payload, expiresAt: now + Math.min(spec.intervalMs, FAILURE_TTL_MS) });
      return payload;
    })
    .finally(() => inflight.delete(source));
  inflight.set(source, run);
  return run;
}

/** Test hook. */
export function resetFeedMemo(): void {
  memo.clear();
  inflight.clear();
}
