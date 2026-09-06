/* Programmer: Lalith Satheesh / Date: 09/05/2026 */
import { extent, median as d3median } from 'd3-array';
import { scaleLinear, scaleTime } from 'd3-scale';
import type { ScaleLinear, ScaleTime } from 'd3-scale';
import { line as d3line, curveMonotoneX } from 'd3-shape';
import type { SeriesPoint } from '@lalubalu/signal-engine';

export interface Margin {
  top: number;
  right: number;
  bottom: number;
  left: number;
}

export interface Frame {
  width: number;
  height: number;
  margin: Margin;
  x: ScaleTime<number, number>;
  y: ScaleLinear<number, number>;
}

/** Typical spacing so the line breaks at real gaps instead of bridging outages. */
export function gapThreshold(points: readonly SeriesPoint[]): number {
  if (points.length < 3) return Infinity;
  const gaps: number[] = [];
  for (let i = 1; i < points.length; i++) gaps.push(points[i]!.t - points[i - 1]!.t);
  const typical = d3median(gaps) ?? Infinity;
  return typical * 3;
}

export function makeFrame(
  points: readonly SeriesPoint[],
  from: number,
  to: number,
  width: number,
  height: number,
  margin: Margin,
  extraY: number[] = [],
): Frame {
  const values = points.map((p) => p.v).concat(extraY.filter(Number.isFinite));
  const [lo, hi] = extent(values);
  const min = lo ?? 0;
  const max = hi ?? 1;
  const pad = max === min ? Math.max(1, Math.abs(max) * 0.1) : (max - min) * 0.08;
  return {
    width,
    height,
    margin,
    x: scaleTime()
      .domain([new Date(from), new Date(to)])
      .range([margin.left, width - margin.right]),
    y: scaleLinear()
      .domain([min - pad, max + pad])
      .nice()
      .range([height - margin.bottom, margin.top]),
  };
}

export function linePath(points: readonly SeriesPoint[], frame: Frame): string {
  const gap = gapThreshold(points);
  const gen = d3line<SeriesPoint>()
    .defined((p, i, arr) => i === 0 || p.t - arr[i - 1]!.t <= gap)
    .x((p) => frame.x(new Date(p.t)))
    .y((p) => frame.y(p.v))
    .curve(curveMonotoneX);
  return gen([...points]) ?? '';
}

export function windowOf(points: readonly SeriesPoint[], from: number, to: number): SeriesPoint[] {
  return points.filter((p) => p.t >= from && p.t <= to);
}

const tickTime = new Intl.DateTimeFormat(undefined, { hour: '2-digit', minute: '2-digit', hour12: false });
const tickDay = new Intl.DateTimeFormat(undefined, { month: 'short', day: 'numeric' });

export function formatTick(d: Date, spanMs: number): string {
  return spanMs > 2 * 86_400_000 ? tickDay.format(d) : tickTime.format(d);
}

export function formatAxisValue(v: number): string {
  const abs = Math.abs(v);
  if (abs >= 1000) return `${Math.round(v)}`;
  if (abs >= 100) return v.toFixed(0);
  if (abs >= 10) return v.toFixed(1).replace(/\.0$/, '');
  return v.toFixed(2).replace(/\.?0+$/, '');
}
