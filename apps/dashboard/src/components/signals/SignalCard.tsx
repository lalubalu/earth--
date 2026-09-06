/* Programmer: Lalith Satheesh / Date: 09/05/2026 */
'use client';

import { useEffect, useRef } from 'react';
import type { KeyboardEvent } from 'react';
import { gsap } from 'gsap';
import type { Signal } from '@lalubalu/signal-engine';
import type { FeedEvent } from '@/lib/feeds/types';
import { formatAgo } from '@/lib/format';
import { DETECTOR_HELP, DETECTOR_LABELS, signalDelta, signalTitle } from '@/lib/signals';
import { SeverityMeter } from './SeverityMeter';

interface SignalCardProps {
  signal: Signal;
  now: number;
  eventsById: ReadonlyMap<string, FeedEvent>;
  selected: boolean;
  tabIndex: number;
  index: number;
  isNew: boolean;
  onOpen: (id: string) => void;
  onKeyDown: (event: KeyboardEvent<HTMLButtonElement>) => void;
}

const MAX_STAGGER = 12;

export function SignalCard({
  signal,
  now,
  eventsById,
  selected,
  tabIndex,
  index,
  isNew,
  onOpen,
  onKeyDown,
}: SignalCardProps) {
  const ref = useRef<HTMLButtonElement>(null);
  const cooling = signal.status === 'cooling';
  const title = signalTitle(signal, eventsById);

  // Entrance on mount only; re-renders from polling must not replay it. gsap.matchMedia
  // skips everything when the user prefers reduced motion.
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const mm = gsap.matchMedia();
    mm.add('(prefers-reduced-motion: no-preference)', () => {
      gsap.fromTo(
        el,
        { autoAlpha: 0, y: 12 },
        { autoAlpha: 1, y: 0, duration: 0.55, ease: 'power3.out', delay: Math.min(index, MAX_STAGGER) * 0.045 },
      );
    });
    return () => mm.revert();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <li>
      <button
        ref={ref}
        type="button"
        tabIndex={tabIndex}
        data-signal-card
        data-new={isNew ? '' : undefined}
        aria-current={selected ? 'true' : undefined}
        onClick={() => onOpen(signal.id)}
        onKeyDown={onKeyDown}
        className={`group w-full rounded-card border-l-2 bg-surface px-4 py-3 text-left transition-colors duration-200 hover:bg-surface-2 ${
          selected ? 'border-accent bg-surface-2' : cooling ? 'border-line' : 'border-line-2'
        } ${cooling ? 'opacity-70' : ''}`}
      >
        <div className="flex items-center justify-between gap-3">
          <SeverityMeter severity={signal.severity} compact />
          <div className="flex items-center gap-2 font-mono text-[10px] uppercase tracking-[0.14em] text-ink-3">
            <span title={DETECTOR_HELP[signal.detector]}>{DETECTOR_LABELS[signal.detector]}</span>
            {signal.alsoDetectedBy && signal.alsoDetectedBy.length > 0 ? (
              <span title={`Also detected by ${signal.alsoDetectedBy.map((d) => DETECTOR_LABELS[d]).join(', ')}`}>
                +{signal.alsoDetectedBy.length}
              </span>
            ) : null}
            {cooling ? <span className="text-ink-2">cooling</span> : null}
            {isNew ? <span className="text-accent">new</span> : null}
          </div>
        </div>
        <h3 className="mt-2 font-display text-[22px] leading-tight text-ink group-hover:text-accent-2">
          {title}
        </h3>
        <p className="mt-1 font-mono text-[12px] text-ink-2">{signalDelta(signal)}</p>
        <p className="mt-2 text-[13px] leading-snug text-ink-2">{signal.summary}</p>
        <p className="mt-2 font-mono text-[11px] text-ink-3">
          started {formatAgo(signal.startedAt, now)} · updated {formatAgo(signal.updatedAt, now)}
        </p>
      </button>
    </li>
  );
}
