/* Programmer: Lalith Satheesh / Date: 09/05/2026 */
'use client';

import { useEffect, useMemo } from 'react';
import { scaleLinear, scaleTime } from 'd3-scale';
import { centroid, fmtValue } from '@lalubalu/signal-engine';
import type { SeriesPoint } from '@lalubalu/signal-engine';
import type { ChartSpec } from '@/lib/ai/schemas';
import { useData } from '@/lib/data';
import { DESCRIPTOR_BY_ID } from '@/lib/engine/descriptors';
import { useUi } from '@/store/ui';
import { formatAxisValue, formatTick, linePath, makeFrame, windowOf } from '../charts/chartUtils';

const HOUR = 3_600_000;
const DAY = 86_400_000;
const MARGIN = { top: 10, right: 10, bottom: 20, left: 44 };
const WIDTH = 600;
const HEIGHT = 130;

interface MiniProps {
  id: string;
  points: SeriesPoint[];
  from: number;
  to: number;
  kind: 'line' | 'bar';
}

function SeriesMini({ id, points, from, to, kind }: MiniProps) {
  const d = DESCRIPTOR_BY_ID.get(id);
  const label = d?.label ?? id;
  const unit = d?.unit ?? '';
  const model = useMemo(() => {
    const inWindow = windowOf(points, from, to);
    if (inWindow.length < 2) return null;
    if (kind === 'line') {
      const frame = makeFrame(inWindow, from, to, WIDTH, HEIGHT, MARGIN);
      return {
        kind,
        frame,
        path: linePath(inWindow, frame),
        bars: [] as { x0: number; x1: number; v: number }[],
        span: to - from,
      };
    }
    const binMs = to - from > 2 * DAY ? DAY : HOUR;
    const bins = new Map<number, { sum: number; n: number }>();
    for (const p of inWindow) {
      const key = Math.floor((p.t - from) / binMs);
      const b = bins.get(key) ?? { sum: 0, n: 0 };
      b.sum += p.v;
      b.n++;
      bins.set(key, b);
    }
    const bars = [...bins.entries()].map(([k, b]) => ({
      x0: from + k * binMs,
      x1: from + (k + 1) * binMs,
      v: b.sum / b.n,
    }));
    const values = bars.map((b) => b.v);
    const x = scaleTime()
      .domain([new Date(from), new Date(to)])
      .range([MARGIN.left, WIDTH - MARGIN.right]);
    const y = scaleLinear()
      .domain([Math.min(0, ...values), Math.max(...values)])
      .nice()
      .range([HEIGHT - MARGIN.bottom, MARGIN.top]);
    return {
      kind,
      frame: { x, y, width: WIDTH, height: HEIGHT, margin: MARGIN },
      path: '',
      bars,
      span: to - from,
    };
  }, [points, from, to, kind]);

  if (!model) {
    return <p className="font-mono text-[11px] text-ink-3">{label}: no samples in that window.</p>;
  }
  const { frame } = model;
  const last = windowOf(points, from, to).at(-1);
  return (
    <figure>
      <figcaption className="flex items-baseline justify-between font-mono text-[11px] text-ink-2">
        <span>{label}</span>
        <span className="text-ink-3">{last ? `last ${fmtValue(last.v, unit)}` : ''}</span>
      </figcaption>
      <svg
        viewBox={`0 0 ${WIDTH} ${HEIGHT}`}
        className="h-auto w-full"
        role="img"
        aria-label={`${label}, ${kind} chart`}
      >
        {frame.y.ticks(3).map((v) => (
          <g key={v}>
            <line
              x1={MARGIN.left}
              x2={WIDTH - MARGIN.right}
              y1={frame.y(v)}
              y2={frame.y(v)}
              stroke="var(--color-line)"
            />
            <text
              x={MARGIN.left - 6}
              y={frame.y(v)}
              dy="0.32em"
              textAnchor="end"
              fontSize={10}
              fill="var(--color-ink-3)"
              fontFamily="var(--font-mono)"
            >
              {formatAxisValue(v)}
            </text>
          </g>
        ))}
        {frame.x.ticks(5).map((t) => (
          <text
            key={t.getTime()}
            x={frame.x(t)}
            y={HEIGHT - 6}
            textAnchor="middle"
            fontSize={10}
            fill="var(--color-ink-3)"
            fontFamily="var(--font-mono)"
          >
            {formatTick(t, model.span)}
          </text>
        ))}
        {model.kind === 'line' ? (
          <path
            d={model.path}
            fill="none"
            stroke="var(--color-accent)"
            strokeWidth={1.4}
            strokeLinejoin="round"
          />
        ) : (
          model.bars.map((b) => {
            const x0 = frame.x(new Date(b.x0));
            const x1 = frame.x(new Date(Math.min(to, b.x1)));
            const y0 = frame.y(Math.max(0, b.v));
            const y1 = frame.y(Math.min(0, b.v));
            return (
              <rect
                key={b.x0}
                x={x0 + 0.5}
                y={y0}
                width={Math.max(1, x1 - x0 - 1)}
                height={Math.max(1, y1 - y0)}
                fill="var(--color-accent)"
                opacity={0.85}
              />
            );
          })
        )}
      </svg>
    </figure>
  );
}

/** Renders the validated chart request from /api/ask. "map" flies the globe and lists places. */
export function AnswerChart({ spec }: { spec: ChartSpec }) {
  const { seriesById } = useData();
  const flyTo = useUi((s) => s.flyTo);

  const places = useMemo(
    () =>
      spec.seriesIds
        .map((id) => DESCRIPTOR_BY_ID.get(id))
        .filter(
          (d): d is NonNullable<typeof d> =>
            d !== undefined && typeof d.lat === 'number' && typeof d.lon === 'number',
        ),
    [spec.seriesIds],
  );

  useEffect(() => {
    if (spec.kind !== 'map' || places.length === 0) return;
    const c = centroid(places.map((p) => ({ lat: p.lat as number, lon: p.lon as number })));
    if (Number.isFinite(c.lat)) flyTo(c.lat, c.lon);
  }, [spec, places, flyTo]);

  return (
    <div className="mt-3 flex flex-col gap-3">
      {spec.kind === 'map' ? (
        <p className="font-mono text-[11px] text-ink-3">
          {places.length > 0
            ? `Globe centred on ${places.map((p) => p.label).join(', ')}.`
            : 'None of those series has a location.'}
        </p>
      ) : null}
      {spec.seriesIds.map((id) => (
        <SeriesMini
          key={id}
          id={id}
          points={seriesById.get(id) ?? []}
          from={spec.from}
          to={spec.to}
          kind={spec.kind === 'bar' ? 'bar' : 'line'}
        />
      ))}
    </div>
  );
}
