/* Programmer: Lalith Satheesh / Date: 09/05/2026 */
import { isFiniteNumber } from './stats.js';
import type { SeriesPoint } from './types.js';

/**
 * Group flat points by series, dropping NaN/Infinity, points after `now` (forecast hours
 * from weather APIs would otherwise leak into the observed value), and duplicate timestamps
 * (last one wins). Output is sorted ascending by time.
 */
export function groupSeries(
  points: readonly SeriesPoint[],
  now: number,
): Map<string, SeriesPoint[]> {
  const groups = new Map<string, SeriesPoint[]>();
  for (const p of points) {
    if (!p || typeof p.seriesId !== 'string') continue;
    if (!isFiniteNumber(p.t) || !isFiniteNumber(p.v) || p.t > now) continue;
    let list = groups.get(p.seriesId);
    if (!list) {
      list = [];
      groups.set(p.seriesId, list);
    }
    list.push(p);
  }
  for (const [id, list] of groups) {
    list.sort((a, b) => a.t - b.t);
    const deduped: SeriesPoint[] = [];
    for (const p of list) {
      const last = deduped[deduped.length - 1];
      if (last && last.t === p.t) deduped[deduped.length - 1] = p;
      else deduped.push(p);
    }
    groups.set(id, deduped);
  }
  return groups;
}

/** Points with from <= t <= to. */
export function windowPoints(
  points: readonly SeriesPoint[],
  from: number,
  to: number,
): SeriesPoint[] {
  return points.filter((p) => p.t >= from && p.t <= to);
}

export function values(points: readonly SeriesPoint[]): number[] {
  return points.map((p) => p.v);
}

/** Typical gap between consecutive samples; used to derive cadence-aware smoothing. */
export function medianSpacing(points: readonly SeriesPoint[]): number {
  if (points.length < 2) return NaN;
  const gaps: number[] = [];
  for (let i = 1; i < points.length; i++) {
    gaps.push((points[i] as SeriesPoint).t - (points[i - 1] as SeriesPoint).t);
  }
  gaps.sort((a, b) => a - b);
  const mid = gaps.length >> 1;
  return gaps.length % 2 === 1
    ? (gaps[mid] as number)
    : ((gaps[mid - 1] as number) + (gaps[mid] as number)) / 2;
}
