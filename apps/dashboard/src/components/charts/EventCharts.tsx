/* Programmer: Lalith Satheesh / Date: 09/05/2026 */
'use client';

import { useMemo } from 'react';
import { scaleLinear, scaleTime } from 'd3-scale';
import { haversineKm } from '@lalubalu/signal-engine';
import type { Signal } from '@lalubalu/signal-engine';
import type { FeedEvent } from '@/lib/feeds/types';
import { formatAxisValue, formatTick } from './chartUtils';

const HOUR = 3_600_000;
const DAY = 86_400_000;
const MARGIN = { top: 14, right: 12, bottom: 22, left: 34 };

interface HistogramProps {
  signal: Signal;
  events: readonly FeedEvent[];
  now: number;
  width?: number;
  height?: number;
}

/**
 * Event counts per bin over a context span, with the expected count per bin drawn as a
 * line from the same baseline rate the detector used. The recent window is highlighted.
 * For swarms only events inside the cluster footprint are counted.
 */
export function EventHistogram({ signal, events, now, width = 640, height = 220 }: HistogramProps) {
  const model = useMemo(() => {
    const windowMs = signal.evidence.window;
    const binMs = windowMs >= DAY ? 6 * HOUR : HOUR;
    const span = windowMs >= DAY ? 14 * DAY : 3 * DAY;
    const from = now - span;
    const kind = signal.kind;
    const center = signal.location;
    const radiusKm = signal.detector === 'swarm' ? footprintKm(signal, events) : Infinity;
    const pool = events.filter(
      (e) =>
        e.t >= from &&
        e.t <= now &&
        (kind === undefined || e.kind === kind) &&
        (signal.detector !== 'swarm' || !center || haversineKm(e, center) <= radiusKm),
    );
    const binCount = Math.ceil(span / binMs);
    const bins = new Array<number>(binCount).fill(0);
    for (const e of pool) {
      const i = Math.min(binCount - 1, Math.floor((e.t - from) / binMs));
      bins[i] = (bins[i] ?? 0) + 1;
    }
    const expectedPerBin = (signal.evidence.baseline * binMs) / windowMs;
    const x = scaleTime()
      .domain([new Date(from), new Date(now)])
      .range([MARGIN.left, width - MARGIN.right]);
    const yMax = Math.max(1, ...bins, expectedPerBin * 1.5);
    const y = scaleLinear()
      .domain([0, yMax])
      .nice()
      .range([height - MARGIN.bottom, MARGIN.top]);
    return { bins, binMs, from, span, x, y, expectedPerBin, pool: pool.length, radiusKm };
  }, [signal, events, now, width, height]);

  const { x, y } = model;
  const bottomY = height - MARGIN.bottom;
  const recentX = x(new Date(now - signal.evidence.window));
  return (
    <svg
      viewBox={`0 0 ${width} ${height}`}
      className="h-auto w-full"
      role="img"
      aria-label="Event counts per bin against the expected rate"
    >
      {y.ticks(3).map((v) => (
        <g key={v}>
          <line
            x1={MARGIN.left}
            x2={width - MARGIN.right}
            y1={y(v)}
            y2={y(v)}
            stroke="var(--color-line)"
          />
          <text
            x={MARGIN.left - 6}
            y={y(v)}
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
      {x.ticks(width > 480 ? 6 : 4).map((d) => (
        <text
          key={d.getTime()}
          x={x(d)}
          y={bottomY + 14}
          textAnchor="middle"
          fontSize={10}
          fill="var(--color-ink-3)"
          fontFamily="var(--font-mono)"
        >
          {formatTick(d, model.span)}
        </text>
      ))}
      <rect
        x={recentX}
        y={MARGIN.top}
        width={width - MARGIN.right - recentX}
        height={bottomY - MARGIN.top}
        fill="var(--color-accent)"
        opacity={0.07}
      />
      {model.bins.map((count, i) => {
        const t0 = model.from + i * model.binMs;
        const x0 = x(new Date(t0));
        const x1 = x(new Date(Math.min(now, t0 + model.binMs)));
        const recent = t0 + model.binMs > now - signal.evidence.window;
        return (
          <rect
            key={i}
            x={x0 + 0.5}
            y={y(count)}
            width={Math.max(1, x1 - x0 - 1)}
            height={bottomY - y(count)}
            fill={recent ? 'var(--color-accent)' : 'var(--color-ink-3)'}
            opacity={recent ? 0.9 : 0.6}
          />
        );
      })}
      <line
        x1={MARGIN.left}
        x2={width - MARGIN.right}
        y1={y(model.expectedPerBin)}
        y2={y(model.expectedPerBin)}
        stroke="var(--color-accent-2)"
        strokeDasharray="4 3"
      />
      <text
        x={width - MARGIN.right}
        y={y(model.expectedPerBin) - 4}
        textAnchor="end"
        fontSize={10}
        fill="var(--color-accent-2)"
        fontFamily="var(--font-mono)"
      >
        expected {formatAxisValue(model.expectedPerBin)} per{' '}
        {model.binMs >= DAY ? 'day' : `${model.binMs / HOUR} h`}
      </text>
    </svg>
  );
}

function footprintKm(signal: Signal, events: readonly FeedEvent[]): number {
  if (!signal.location || !signal.eventIds) return 50;
  const ids = new Set(signal.eventIds);
  let max = 50;
  for (const e of events) {
    if (ids.has(e.id)) max = Math.max(max, haversineKm(e, signal.location));
  }
  return max;
}

interface MagnitudeScaleProps {
  signal: Signal;
  width?: number;
}

/** A single event against its rule: baseline median, threshold, observed on one axis. */
export function MagnitudeScale({ signal, width = 640 }: MagnitudeScaleProps) {
  const { baseline, observed, threshold } = signal.evidence;
  const max = Math.max(observed, threshold, baseline) * 1.15;
  const x = scaleLinear()
    .domain([0, max])
    .range([MARGIN.left, width - MARGIN.right]);
  const height = 72;
  const axisY = 44;
  const marks = [
    {
      label: `baseline median ${formatAxisValue(baseline)}`,
      v: baseline,
      color: 'var(--color-ink-3)',
      dy: -18,
    },
    {
      label: `threshold ${formatAxisValue(threshold)}`,
      v: threshold,
      color: 'var(--color-accent-2)',
      dy: 18,
    },
    {
      label: `observed ${formatAxisValue(observed)}`,
      v: observed,
      color: 'var(--color-accent)',
      dy: -18,
    },
  ];
  return (
    <svg
      viewBox={`0 0 ${width} ${height}`}
      className="h-auto w-full"
      role="img"
      aria-label="Observed magnitude against the rule threshold and the baseline median"
    >
      <line
        x1={MARGIN.left}
        x2={width - MARGIN.right}
        y1={axisY}
        y2={axisY}
        stroke="var(--color-line-2)"
      />
      <rect
        x={x(threshold)}
        y={axisY - 3}
        width={Math.max(0, x(max) - x(threshold))}
        height={6}
        fill="var(--color-accent)"
        opacity={0.15}
      />
      {x.ticks(6).map((v) => (
        <text
          key={v}
          x={x(v)}
          y={axisY + 16}
          textAnchor="middle"
          fontSize={10}
          fill="var(--color-ink-3)"
          fontFamily="var(--font-mono)"
        >
          {formatAxisValue(v)}
        </text>
      ))}
      {marks.map((m) => (
        <g key={m.label}>
          <line
            x1={x(m.v)}
            x2={x(m.v)}
            y1={axisY - 8}
            y2={axisY + 8}
            stroke={m.color}
            strokeWidth={2}
          />
          <text
            x={x(m.v)}
            y={axisY + m.dy}
            textAnchor="middle"
            fontSize={10}
            fill={m.color}
            fontFamily="var(--font-mono)"
          >
            {m.label}
          </text>
        </g>
      ))}
    </svg>
  );
}
