/* Programmer: Lalith Satheesh / Date: 09/05/2026 */
'use client';

import { useMemo } from 'react';
import { median as d3median } from 'd3-array';
import type { SeriesPoint } from '@lalubalu/signal-engine';
import { linePath, makeFrame, windowOf } from './chartUtils';

interface SparklineProps {
  points: readonly SeriesPoint[];
  windowMs: number;
  now: number;
  width?: number;
  height?: number;
  label: string;
}

const MARGIN = { top: 4, right: 6, bottom: 4, left: 2 };

/** Line over the window, dashed median, and a dot on the last sample. Purely presentational. */
export function Sparkline({ points, windowMs, now, width = 180, height = 44, label }: SparklineProps) {
  const model = useMemo(() => {
    const from = now - windowMs;
    const inWindow = windowOf(points, from, now);
    if (inWindow.length < 2) return null;
    const med = d3median(inWindow, (p) => p.v) ?? 0;
    const frame = makeFrame(inWindow, from, now, width, height, MARGIN, [med]);
    const last = inWindow[inWindow.length - 1]!;
    return {
      path: linePath(inWindow, frame),
      medianY: frame.y(med),
      last: { x: frame.x(new Date(last.t)), y: frame.y(last.v) },
      frame,
    };
  }, [points, windowMs, now, width, height]);

  if (!model) {
    return (
      <svg viewBox={`0 0 ${width} ${height}`} className="block h-auto w-full" role="img" aria-label={`${label}: not enough data`}>
        <line x1={2} x2={width - 2} y1={height / 2} y2={height / 2} stroke="var(--color-line-2)" strokeDasharray="2 3" />
      </svg>
    );
  }
  return (
    <svg viewBox={`0 0 ${width} ${height}`} className="block h-auto w-full" role="img" aria-label={`${label}, recent trend`}>
      <line
        x1={MARGIN.left}
        x2={width - MARGIN.right}
        y1={model.medianY}
        y2={model.medianY}
        stroke="var(--color-line-2)"
        strokeDasharray="2 3"
        vectorEffect="non-scaling-stroke"
      />
      <path d={model.path} fill="none" stroke="var(--color-ink-2)" strokeWidth={1.25} strokeLinejoin="round" vectorEffect="non-scaling-stroke" />
      <circle cx={model.last.x} cy={model.last.y} r={2.5} fill="var(--color-accent)" />
    </svg>
  );
}
