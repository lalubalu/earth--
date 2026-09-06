/* Programmer: Lalith Satheesh / Date: 09/05/2026 */
'use client';

import { useEffect, useRef } from 'react';
import { fmtNum, fmtValue } from '@lalubalu/signal-engine';
import { useData } from '@/lib/data';
import { DESCRIPTOR_BY_ID } from '@/lib/engine/descriptors';
import { usgsEventUrl } from '@/lib/feeds/usgs';
import { formatAgo, formatDateTime, formatDuration } from '@/lib/format';
import { DETECTOR_HELP, DETECTOR_LABELS, SEVERITY_LABELS, severityBand, signalEvents, signalLocation, signalTitle } from '@/lib/signals';
import { useUi } from '@/store/ui';
import { DetailChart } from '../charts/DetailChart';
import { EventHistogram, MagnitudeScale } from '../charts/EventCharts';
import { SeverityMeter } from './SeverityMeter';

/**
 * Native <dialog> so focus trapping, Escape, and the backdrop come for free. The chart
 * draws exactly the numbers in `evidence`, so what fired is visible, not asserted.
 */
export function SignalDrawer() {
  const { now, signalById, seriesById, eventsById, feeds } = useData();
  const { selectedSignalId, drawerOpen, closeDrawer, flyTo } = useUi();
  const ref = useRef<HTMLDialogElement>(null);
  const signal = selectedSignalId ? signalById.get(selectedSignalId) : undefined;

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    if (drawerOpen && signal && !el.open) el.showModal();
    if ((!drawerOpen || !signal) && el.open) el.close();
  }, [drawerOpen, signal]);

  const descriptor = signal?.seriesId ? DESCRIPTOR_BY_ID.get(signal.seriesId) : undefined;
  const points = signal?.seriesId ? (seriesById.get(signal.seriesId) ?? []) : [];
  const events = signal ? signalEvents(signal, eventsById) : [];
  const location = signal ? signalLocation(signal) : null;
  const isEventSignal = signal !== undefined && signal.seriesId === undefined;

  return (
    <dialog
      ref={ref}
      onClose={closeDrawer}
      aria-labelledby="drawer-title"
      className="m-0 h-full max-h-none w-full max-w-none bg-transparent p-0 backdrop:bg-bg/70 backdrop:backdrop-blur-[2px] sm:ml-auto sm:w-[min(720px,100vw)]"
    >
      {signal ? (
        <div className="flex h-full flex-col overflow-y-auto border-l border-line bg-surface text-ink">
          <div className="flex items-start justify-between gap-4 px-5 pt-5">
            <div>
              <p className="font-mono text-[10px] uppercase tracking-[0.14em] text-ink-3">
                {DETECTOR_LABELS[signal.detector]} · {DETECTOR_HELP[signal.detector]}
              </p>
              <h2 id="drawer-title" className="mt-1 font-display text-[30px] leading-tight">
                {signalTitle(signal, eventsById)}
              </h2>
            </div>
            <button
              type="button"
              onClick={closeDrawer}
              className="rounded px-2 py-1 font-mono text-[12px] text-ink-2 hairline hover:text-ink"
              aria-label="Close details"
            >
              esc
            </button>
          </div>

          <div className="mt-3 flex flex-wrap items-center gap-x-4 gap-y-2 px-5">
            <SeverityMeter severity={signal.severity} />
            <span className="font-mono text-[11px] text-ink-3">
              score {fmtNum(signal.score)} · {signal.status} · started {formatAgo(signal.startedAt, now)}
            </span>
            {location ? (
              <button
                type="button"
                onClick={() => flyTo(location.lat, location.lon)}
                className="rounded px-2 py-0.5 font-mono text-[11px] text-accent hairline hover:bg-surface-2"
              >
                fly to {location.lat.toFixed(1)}, {location.lon.toFixed(1)}
              </button>
            ) : null}
          </div>

          <p className="mt-4 px-5 text-[15px] leading-relaxed text-ink">{signal.summary}</p>

          <div className="mt-4 px-5">
            {signal.seriesId ? (
              <DetailChart points={points} signal={signal} descriptor={descriptor} now={now} />
            ) : signal.detector === 'threshold' ? (
              <MagnitudeScale signal={signal} />
            ) : (
              <EventHistogram signal={signal} events={feeds.events} now={now} />
            )}
          </div>

          <dl className="mt-4 grid grid-cols-2 gap-x-4 gap-y-2 px-5 font-mono text-[12px] sm:grid-cols-3">
            {(
              [
                ['baseline', signal.evidence.baseline],
                ['observed', signal.evidence.observed],
                ['threshold', signal.evidence.threshold],
              ] as const
            ).map(([k, v]) => (
              <div key={k} className="rounded bg-surface-2 px-2 py-1.5">
                <dt className="text-[10px] uppercase tracking-[0.12em] text-ink-3">{k}</dt>
                <dd className="text-ink">{isEventSignal && signal.detector !== 'threshold' ? fmtNum(v) : fmtValue(v, descriptor?.unit)}</dd>
              </div>
            ))}
            <div className="rounded bg-surface-2 px-2 py-1.5">
              <dt className="text-[10px] uppercase tracking-[0.12em] text-ink-3">window</dt>
              <dd className="text-ink">{signal.evidence.window > 0 ? formatDuration(signal.evidence.window) : 'instant'}</dd>
            </div>
            <div className="rounded bg-surface-2 px-2 py-1.5">
              <dt className="text-[10px] uppercase tracking-[0.12em] text-ink-3">sample size</dt>
              <dd className="text-ink">{signal.evidence.sampleSize}</dd>
            </div>
            <div className="rounded bg-surface-2 px-2 py-1.5">
              <dt className="text-[10px] uppercase tracking-[0.12em] text-ink-3">severity</dt>
              <dd className="text-ink">
                {SEVERITY_LABELS[severityBand(signal.severity)]} ({signal.severity.toFixed(2)})
              </dd>
            </div>
          </dl>

          {signal.alsoDetectedBy && signal.alsoDetectedBy.length > 0 ? (
            <p className="mt-3 px-5 font-mono text-[11px] text-ink-3">
              also flagged by {signal.alsoDetectedBy.map((d) => DETECTOR_LABELS[d].toLowerCase()).join(', ')}
            </p>
          ) : null}

          {events.length > 0 ? (
            <div className="mt-5 px-5 pb-6">
              <h3 className="font-display text-[20px]">
                Events <span className="font-mono text-[11px] text-ink-3">{events.length}</span>
              </h3>
              <ul className="mt-2 divide-y divide-line text-[13px]">
                {events.slice(0, 40).map((e) => {
                  const href = e.url ?? (e.source === 'usgs' ? usgsEventUrl(e.id) : undefined);
                  return (
                    <li key={e.id} className="flex items-baseline justify-between gap-3 py-1.5">
                      <span className="min-w-0 truncate text-ink-2">
                        <span className="font-mono text-ink">
                          {e.kind === 'earthquake' ? `M${fmtNum(e.magnitude)}` : `${fmtNum(e.magnitude)}${e.magnitudeUnit ? ` ${e.magnitudeUnit}` : ''}`}
                        </span>{' '}
                        {href ? (
                          <a href={href} target="_blank" rel="noreferrer" className="underline decoration-line-2 underline-offset-2 hover:text-accent-2">
                            {e.label ?? e.id}
                          </a>
                        ) : (
                          (e.label ?? e.id)
                        )}
                      </span>
                      <span className="shrink-0 font-mono text-[11px] text-ink-3">{formatDateTime(e.t)}</span>
                    </li>
                  );
                })}
                {events.length > 40 ? <li className="py-1.5 font-mono text-[11px] text-ink-3">and {events.length - 40} more</li> : null}
              </ul>
            </div>
          ) : (
            <div className="pb-6" />
          )}
        </div>
      ) : null}
    </dialog>
  );
}
