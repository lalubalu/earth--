/* Programmer: Lalith Satheesh / Date: 09/05/2026 */
'use client';

import dynamic from 'next/dynamic';
import { useEffect, useMemo, useRef, useState } from 'react';
import { fmtNum } from '@lalubalu/signal-engine';
import { usePrefersReducedMotion } from '@/hooks/usePrefersReducedMotion';
import { useData } from '@/lib/data';
import { usgsEventUrl } from '@/lib/feeds/usgs';
import { formatAgo } from '@/lib/format';
import { useUi } from '@/store/ui';
import { buildMarkers, countByKind, styleFor } from './markers';

const GlobeScene = dynamic(() => import('./GlobeScene').then((m) => m.GlobeScene), {
  ssr: false,
  loading: () => (
    <p className="absolute inset-0 flex items-center justify-center font-mono text-[12px] text-ink-3">
      loading globe
    </p>
  ),
});

const LEGEND: { kind: string; glyph: string; label: string }[] = [
  { kind: 'earthquake', glyph: '◎', label: 'earthquake, size by magnitude' },
  { kind: 'wildfire', glyph: '●', label: 'wildfire / volcano' },
  { kind: 'storm', glyph: '◆', label: 'storm / ice' },
  { kind: 'iss', glyph: '⊙', label: 'ISS' },
];

function useOnScreen(ref: React.RefObject<HTMLElement | null>): boolean {
  const [visible, setVisible] = useState(true);
  useEffect(() => {
    const el = ref.current;
    if (!el || typeof IntersectionObserver === 'undefined') return;
    const io = new IntersectionObserver(([entry]) => setVisible(entry?.isIntersecting ?? true), {
      threshold: 0.05,
    });
    io.observe(el);
    return () => io.disconnect();
  }, [ref]);
  return visible;
}

function useTabVisible(): boolean {
  const [visible, setVisible] = useState(true);
  useEffect(() => {
    const onChange = () => setVisible(document.visibilityState === 'visible');
    onChange();
    document.addEventListener('visibilitychange', onChange);
    return () => document.removeEventListener('visibilitychange', onChange);
  }, []);
  return visible;
}

export function GlobePanel() {
  const { now, feeds, eventsById, signalById } = useData();
  const { selectedSignalId, pickedEventId, pick } = useUi();
  const reducedMotion = usePrefersReducedMotion();
  const sectionRef = useRef<HTMLElement>(null);
  const onScreen = useOnScreen(sectionRef);
  const tabVisible = useTabVisible();

  const selected = selectedSignalId ? signalById.get(selectedSignalId) : undefined;
  const markers = useMemo(() => buildMarkers(feeds.events, now, selected), [feeds.events, now, selected]);
  const counts = useMemo(() => countByKind(feeds.events, now), [feeds.events, now]);
  const picked = pickedEventId ? eventsById.get(pickedEventId) : undefined;
  const pickedUrl = picked?.url ?? (picked?.source === 'usgs' ? usgsEventUrl(picked.id) : undefined);

  return (
    <section
      ref={sectionRef}
      aria-label="Globe of recent events"
      className="relative min-h-[420px] overflow-hidden rounded-card bg-surface/40 hairline lg:min-h-[calc(100vh-9rem)]"
    >
      <GlobeScene markers={markers} active={onScreen && tabVisible} reducedMotion={reducedMotion} onPick={pick} />

      <div className="pointer-events-none absolute inset-x-3 top-3 flex items-start justify-between gap-3">
        <p className="font-mono text-[10px] uppercase tracking-[0.14em] text-ink-3">
          {markers.length} markers · quakes last 24 h and M4.5+ 30 d · drag to orbit, wheel to zoom
        </p>
        {reducedMotion ? (
          <p className="font-mono text-[10px] uppercase tracking-[0.14em] text-ink-3">motion reduced</p>
        ) : null}
      </div>

      <ul className="pointer-events-none absolute bottom-3 left-3 flex flex-col gap-0.5 font-mono text-[11px] text-ink-2" aria-label="Marker legend">
        {LEGEND.map((item) => {
          const count =
            item.kind === 'wildfire'
              ? (counts.wildfire ?? 0) + (counts.volcano ?? 0)
              : item.kind === 'storm'
                ? (counts.storm ?? 0) + (counts['sea-ice'] ?? 0)
                : (counts[item.kind] ?? 0);
          return (
            <li key={item.kind} className="flex items-center gap-2">
              <span className="w-3 text-center text-accent" aria-hidden style={{ opacity: 0.35 + 0.65 * styleFor(item.kind).tone }}>
                {item.glyph}
              </span>
              <span>{item.label}</span>
              <span className="text-ink-3">{count}</span>
            </li>
          );
        })}
      </ul>

      {picked ? (
        <div
          role="status"
          className="absolute bottom-3 right-3 max-w-[280px] rounded-card bg-surface/95 px-3 py-2 text-[12px] text-ink-2 hairline"
        >
          <p className="font-display text-[18px] leading-tight text-ink">
            {picked.kind === 'earthquake' ? `M${fmtNum(picked.magnitude)} ` : ''}
            {picked.label ?? picked.id}
          </p>
          <p className="mt-0.5 font-mono text-[11px] text-ink-3">
            {styleFor(picked.kind).label} · {picked.lat.toFixed(2)}, {picked.lon.toFixed(2)} ·{' '}
            {formatAgo(picked.t, now)}
            {picked.depthKm !== undefined ? ` · ${fmtNum(picked.depthKm)} km deep` : ''}
            {picked.magnitudeUnit && picked.kind !== 'earthquake' ? ` · ${fmtNum(picked.magnitude)} ${picked.magnitudeUnit}` : ''}
          </p>
          <div className="mt-1 flex items-center gap-3 font-mono text-[11px]">
            {pickedUrl ? (
              <a href={pickedUrl} target="_blank" rel="noreferrer" className="text-accent underline underline-offset-2">
                source
              </a>
            ) : null}
            <button type="button" onClick={() => pick(null)} className="text-ink-3 hover:text-ink">
              dismiss
            </button>
          </div>
        </div>
      ) : null}
    </section>
  );
}
