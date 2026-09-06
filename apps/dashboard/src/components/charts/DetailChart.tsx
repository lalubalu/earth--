/* Programmer: Lalith Satheesh / Date: 09/05/2026 */
'use client';

import { useMemo } from 'react';
import type { SeriesDescriptor, SeriesPoint, Signal } from '@lalubalu/signal-engine';
import { formatAxisValue, formatTick, linePath, makeFrame, windowOf } from './chartUtils';

interface DetailChartProps {
  points: readonly SeriesPoint[];
  signal: Signal;
  descriptor?: SeriesDescriptor;
  now: number;
  width?: number;
  height?: number;
}

const MARGIN = { top: 14, right: 12, bottom: 22, left: 46 };
const DAY = 86_400_000;

/**
 * Raw series with the three evidence lines drawn on it: baseline, threshold (dashed), and
 * observed. For level detectors (EWMA, CUSUM) "observed" spans the shifted segment; for
 * point detectors it is a marked sample. The band past the threshold is shaded so the eye
 * lands on why it fired.
 */
export function DetailChart({ points, signal, descriptor, now, width = 640, height = 240 }: DetailChartProps) {
  const model = useMemo(() => {
    const { baseline, observed, threshold } = signal.evidence;
    const windowMs = signal.evidence.window > 0 ? signal.evidence.window : DAY;
    // Threshold rules report the sustained window, which is too short to show context.
    const span = signal.detector === 'threshold' ? Math.max(windowMs, DAY) : windowMs;
    const from = now - span;
    const inWindow = windowOf(points, from, now);
    if (inWindow.length < 2) return null;
    const isSpread = signal.kind === 'ewma-variance';
    const extra = isSpread ? [] : [baseline, observed, threshold];
    const frame = makeFrame(inWindow, from, now, width, height, MARGIN, extra);
    const last = inWindow[inWindow.length - 1]!;
    const above = threshold >= baseline;
    const range = frame.y.range();
    const top = Math.min(...range);
    const bottom = Math.max(...range);
    const thresholdY = frame.y(threshold);
    return {
      frame,
      path: linePath(inWindow, frame),
      baselineY: frame.y(baseline),
      thresholdY,
      observedY: frame.y(observed),
      band: above
        ? { y: top, h: Math.max(0, thresholdY - top) }
        : { y: thresholdY, h: Math.max(0, bottom - thresholdY) },
      spansSegment: signal.detector === 'cusum' || signal.detector === 'ewma',
      startX: frame.x(new Date(Math.max(signal.startedAt, from))),
      last: { x: frame.x(new Date(last.t)), y: frame.y(last.v) },
      isSpread,
      xTicks: frame.x.ticks(width > 480 ? 6 : 4),
      yTicks: frame.y.ticks(4),
      span,
    };
  }, [points, signal, now, width, height]);

  const unit = descriptor?.unit ?? '';
  if (!model) {
    return <p className="text-[13px] text-ink-3">Not enough samples in the window to draw.</p>;
  }
  const { frame } = model;
  const left = MARGIN.left;
  const right = width - MARGIN.right;
  const bottomY = height - MARGIN.bottom;

  return (
    <svg
      viewBox={`0 0 ${width} ${height}`}
      className="h-auto w-full"
      role="img"
      aria-label={`${descriptor?.label ?? signal.seriesId}: observed against baseline and threshold`}
    >
      {model.yTicks.map((v) => (
        <g key={v}>
          <line x1={left} x2={right} y1={frame.y(v)} y2={frame.y(v)} stroke="var(--color-line)" />
          <text x={left - 6} y={frame.y(v)} dy="0.32em" textAnchor="end" fontSize={10} fill="var(--color-ink-3)" fontFamily="var(--font-mono)">
            {formatAxisValue(v)}
          </text>
        </g>
      ))}
      {model.xTicks.map((d) => (
        <text key={d.getTime()} x={frame.x(d)} y={bottomY + 14} textAnchor="middle" fontSize={10} fill="var(--color-ink-3)" fontFamily="var(--font-mono)">
          {formatTick(d, model.span)}
        </text>
      ))}
      {!model.isSpread ? (
        <rect x={left} y={model.band.y} width={right - left} height={model.band.h} fill="var(--color-accent)" opacity={0.06} />
      ) : null}
      <path d={model.path} fill="none" stroke="var(--color-ink-2)" strokeWidth={1.25} strokeLinejoin="round" />
      {!model.isSpread ? (
        <>
          <line x1={left} x2={right} y1={model.baselineY} y2={model.baselineY} stroke="var(--color-ink-3)" strokeWidth={1} />
          <text x={right} y={model.baselineY - 4} textAnchor="end" fontSize={10} fill="var(--color-ink-3)" fontFamily="var(--font-mono)">
            baseline {formatAxisValue(signal.evidence.baseline)} {unit}
          </text>
          <line x1={left} x2={right} y1={model.thresholdY} y2={model.thresholdY} stroke="var(--color-accent)" strokeWidth={1} strokeDasharray="4 3" />
          <text x={left + 4} y={model.thresholdY - 4} fontSize={10} fill="var(--color-accent)" fontFamily="var(--font-mono)">
            fires past {formatAxisValue(signal.evidence.threshold)} {unit}
          </text>
          {model.spansSegment ? (
            <line x1={model.startX} x2={right} y1={model.observedY} y2={model.observedY} stroke="var(--color-accent-2)" strokeWidth={2} />
          ) : (
            <circle cx={model.last.x} cy={model.last.y} r={4} fill="var(--color-accent)" stroke="var(--color-bg)" strokeWidth={1.5} />
          )}
          {model.spansSegment ? (
            <line x1={model.startX} x2={model.startX} y1={MARGIN.top} y2={bottomY} stroke="var(--color-accent)" strokeDasharray="2 3" opacity={0.7} />
          ) : null}
        </>
      ) : (
        <text x={left + 4} y={MARGIN.top + 2} fontSize={10} fill="var(--color-accent)" fontFamily="var(--font-mono)">
          spread {formatAxisValue(signal.evidence.observed)} vs reference {formatAxisValue(signal.evidence.baseline)} {unit}, limit {formatAxisValue(signal.evidence.threshold)}
        </text>
      )}
    </svg>
  );
}
