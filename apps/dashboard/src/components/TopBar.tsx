/* Programmer: Lalith Satheesh / Date: 09/05/2026 */
'use client';

import { useData } from '@/lib/data';
import { FEED_INTERVALS, FEED_LABELS } from '@/lib/feeds/intervals';
import type { FeedHealth, FeedState } from '@/lib/feeds/client';
import { FEED_SOURCES } from '@/lib/feeds/types';
import { formatAgo, formatClock, formatDuration, formatMs } from '@/lib/format';

const HEALTH_TEXT: Record<FeedHealth, string> = {
  loading: 'loading',
  live: 'live',
  stale: 'stale',
  degraded: 'degraded',
  down: 'down',
};

const HEALTH_DOT: Record<FeedHealth, string> = {
  loading: 'bg-ink-3',
  live: 'bg-ok live-dot',
  stale: 'bg-warn',
  degraded: 'bg-warn',
  down: 'bg-down',
};

function FeedPill({ state, now }: { state: FeedState; now: number }) {
  const { source, health, payload, receivedAt, error } = state;
  const updated = payload?.fetchedAt ?? receivedAt;
  const detail = [
    `${FEED_LABELS[source]}: ${HEALTH_TEXT[health]}`,
    updated ? `data ${formatAgo(updated, now)}` : 'no data yet',
    `polls every ${formatDuration(FEED_INTERVALS[source])}`,
    payload?.lastGoodAt ? `last good ${formatAgo(payload.lastGoodAt, now)}` : '',
    error ?? '',
    ...(payload?.urls ?? []),
  ]
    .filter(Boolean)
    .join('\n');
  return (
    <li
      className="flex items-center gap-1.5 rounded-full px-2 py-0.5 text-[11px] leading-4 text-ink-2 hairline"
      title={detail}
    >
      <span className={`inline-block h-1.5 w-1.5 shrink-0 rounded-full ${HEALTH_DOT[health]}`} aria-hidden />
      <span className="whitespace-nowrap">{FEED_LABELS[source]}</span>
      <span className="whitespace-nowrap font-mono text-ink-3">
        {health === 'live' && updated ? formatAgo(updated, now) : HEALTH_TEXT[health]}
      </span>
    </li>
  );
}

export function TopBar() {
  const { now, feeds, engine } = useData();
  const active = engine.signals.filter((s) => s.status === 'active').length;
  return (
    <header className="flex flex-col gap-3 py-4 lg:flex-row lg:items-end lg:justify-between lg:py-5">
      <div className="flex items-baseline gap-3">
        <h1 className="font-display text-[34px] leading-none tracking-tight text-ink">
          Earth <span className="italic text-accent">Signals</span>
        </h1>
        <p className="hidden text-xs text-ink-3 sm:block">
          public feeds, browser-side anomaly detection, explained
        </p>
      </div>
      <div className="flex flex-col gap-2 lg:items-end">
        <ul className="flex flex-wrap gap-1.5" aria-label="Feed status">
          {FEED_SOURCES.map((source) => (
            <FeedPill key={source} state={feeds.feeds[source]} now={now} />
          ))}
        </ul>
        <p className="font-mono text-[11px] text-ink-3" aria-live="off">
          {engine.lastRunAt
            ? `${active} active signal${active === 1 ? '' : 's'} · ${engine.evaluatedSeries} series · ${engine.evaluatedEvents} events · engine ${formatMs(engine.tookMs ?? 0)} in ${engine.mode === 'worker' ? 'worker' : 'main thread'} · ${formatClock(engine.lastRunAt)}`
            : engine.error
              ? `engine error: ${engine.error}`
              : 'waiting for first feed'}
        </p>
      </div>
    </header>
  );
}
