/* Programmer: Lalith Satheesh / Date: 09/05/2026 */
'use client';

import { useCallback, useMemo, useRef, useState } from 'react';
import type { KeyboardEvent } from 'react';
import { useData } from '@/lib/data';
import { FEED_SOURCES } from '@/lib/feeds/types';
import { signalLocation, signalTitle } from '@/lib/signals';
import { useUi } from '@/store/ui';
import { SignalCard } from './SignalCard';

/**
 * Roving tabindex list: Tab lands on the current card, arrows move between cards,
 * Enter/Space opens the drawer. New arrivals are announced through a polite live region.
 */
export function SignalFeed() {
  const { now, signals, eventsById, engine, feeds } = useData();
  const { selectedSignalId, openDrawer, flyTo, showCooling, toggleCooling } = useUi();
  const listRef = useRef<HTMLOListElement>(null);
  const [focusIndexRaw, setFocusIndex] = useState(0);
  const [tracked, setTracked] = useState<{
    signals: typeof signals;
    newIds: Set<string>;
    announcement: string;
  }>(() => ({ signals, newIds: new Set(), announcement: '' }));

  // Diff against the last rendered list during render (React's "adjust state on prop
  // change" pattern) so new arrivals get a highlight and one live-region announcement.
  if (tracked.signals !== signals) {
    const seen = new Set(tracked.signals.map((s) => s.id));
    const fresh = tracked.signals.length === 0 ? [] : signals.filter((s) => !seen.has(s.id));
    const names = fresh.slice(0, 3).map((s) => signalTitle(s, eventsById));
    setTracked({
      signals,
      newIds: new Set(fresh.map((s) => s.id)),
      announcement:
        fresh.length === 0
          ? tracked.announcement
          : `${fresh.length} new signal${fresh.length === 1 ? '' : 's'}: ${names.join('; ')}${fresh.length > 3 ? ' and more' : ''}.`,
    });
  }

  const visible = useMemo(
    () => (showCooling ? signals : signals.filter((s) => s.status === 'active')),
    [signals, showCooling],
  );
  const focusIndex = Math.min(focusIndexRaw, Math.max(0, visible.length - 1));

  const focusCard = useCallback((index: number) => {
    const buttons = listRef.current?.querySelectorAll<HTMLButtonElement>('[data-signal-card]');
    const target = buttons?.[index];
    if (target) {
      setFocusIndex(index);
      target.focus();
    }
  }, []);

  const onKeyDown = useCallback(
    (event: KeyboardEvent<HTMLButtonElement>) => {
      const count = visible.length;
      if (count === 0) return;
      switch (event.key) {
        case 'ArrowDown':
        case 'j':
          event.preventDefault();
          focusCard((focusIndex + 1) % count);
          break;
        case 'ArrowUp':
        case 'k':
          event.preventDefault();
          focusCard((focusIndex - 1 + count) % count);
          break;
        case 'Home':
          event.preventDefault();
          focusCard(0);
          break;
        case 'End':
          event.preventDefault();
          focusCard(count - 1);
          break;
        default:
      }
    },
    [visible.length, focusIndex, focusCard],
  );

  const loading = FEED_SOURCES.every((s) => feeds.feeds[s].health === 'loading');
  const coolingCount = signals.length - signals.filter((s) => s.status === 'active').length;

  return (
    <aside
      id="signals"
      aria-labelledby="signals-heading"
      className="flex max-h-[75vh] min-h-[420px] flex-col rounded-card bg-surface/60 hairline lg:max-h-[calc(100vh-9rem)]"
    >
      <div className="flex items-baseline justify-between gap-3 px-4 pb-2 pt-3">
        <h2 id="signals-heading" className="font-display text-[26px] leading-none text-ink">
          Signals <span className="font-mono text-[12px] text-ink-3">{visible.length}</span>
        </h2>
        <div className="flex items-center gap-3 font-mono text-[11px] text-ink-3">
          <span className="hidden sm:inline">ranked by severity, then recency</span>
          {coolingCount > 0 ? (
            <button
              type="button"
              onClick={toggleCooling}
              aria-pressed={showCooling}
              className="rounded px-1.5 py-0.5 text-ink-2 hairline hover:text-ink"
            >
              {showCooling ? 'hide' : 'show'} {coolingCount} cooling
            </button>
          ) : null}
        </div>
      </div>
      <div className="sr-only" aria-live="polite" aria-atomic="true">
        {tracked.announcement}
      </div>
      {visible.length === 0 ? (
        <div className="flex flex-1 flex-col items-center justify-center gap-2 px-6 py-10 text-center">
          <p className="font-display text-[22px] text-ink-2">
            {loading
              ? 'Waiting for the first feeds'
              : engine.error
                ? 'Engine error'
                : engine.lastRunAt
                  ? 'Nothing anomalous right now'
                  : 'Running detectors'}
          </p>
          <p className="max-w-[32ch] text-[13px] text-ink-3">
            {engine.error
              ? engine.error
              : engine.lastRunAt
                ? `${engine.evaluatedSeries} series and ${engine.evaluatedEvents} events evaluated. Signals appear here the moment a detector fires.`
                : 'Feeds are polled every 10 s to 15 min; the engine runs in a Web Worker whenever data changes.'}
          </p>
        </div>
      ) : (
        <ol
          ref={listRef}
          className="flex flex-1 flex-col gap-2 overflow-y-auto px-3 pb-3"
          aria-label="Ranked signals"
        >
          {visible.map((signal, i) => (
            <SignalCard
              key={signal.id}
              signal={signal}
              now={now}
              eventsById={eventsById}
              selected={signal.id === selectedSignalId}
              tabIndex={i === focusIndex ? 0 : -1}
              index={i}
              isNew={tracked.newIds.has(signal.id)}
              onOpen={(id) => {
                setFocusIndex(i);
                openDrawer(id);
                const where = signalLocation(signal);
                if (where) flyTo(where.lat, where.lon);
              }}
              onKeyDown={onKeyDown}
            />
          ))}
        </ol>
      )}
    </aside>
  );
}
