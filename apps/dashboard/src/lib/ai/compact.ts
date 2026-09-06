/* Programmer: Lalith Satheesh / Date: 09/05/2026 */
import { median as d3median } from 'd3-array';
import type { SeriesPoint, Signal } from '@lalubalu/signal-engine';
import { DESCRIPTOR_BY_ID } from '@/lib/engine/descriptors';
import type { FeedEvent } from '@/lib/feeds/types';
import { signalTitle } from '@/lib/signals';
import type { CompactSignal, SeriesSummary } from './schemas';

const DAY = 86_400_000;

/** Signal to the model-facing shape: title, summary, evidence, no internals. */
export function compactSignal(signal: Signal, eventsById: ReadonlyMap<string, FeedEvent>): CompactSignal {
  const out: CompactSignal = {
    id: signal.id,
    title: signalTitle(signal, eventsById),
    detector: signal.detector,
    severity: Number(signal.severity.toFixed(3)),
    status: signal.status,
    startedAt: signal.startedAt,
    summary: signal.summary,
    evidence: {
      baseline: round(signal.evidence.baseline),
      observed: round(signal.evidence.observed),
      threshold: round(signal.evidence.threshold),
      window: signal.evidence.window,
      sampleSize: signal.evidence.sampleSize,
    },
  };
  if (signal.seriesId) {
    out.seriesId = signal.seriesId;
    const unit = DESCRIPTOR_BY_ID.get(signal.seriesId)?.unit;
    if (unit) out.unit = unit;
  }
  if (signal.location) {
    out.location = { lat: round(signal.location.lat), lon: round(signal.location.lon) };
  }
  return out;
}

export function summarizeSeries(seriesById: ReadonlyMap<string, SeriesPoint[]>, now: number): SeriesSummary[] {
  const out: SeriesSummary[] = [];
  for (const [id, points] of seriesById) {
    const recent = points.filter((p) => p.t >= now - 7 * DAY && p.t <= now);
    if (recent.length === 0) continue;
    const d = DESCRIPTOR_BY_ID.get(id);
    let min = Infinity;
    let max = -Infinity;
    for (const p of recent) {
      if (p.v < min) min = p.v;
      if (p.v > max) max = p.v;
    }
    out.push({
      id,
      label: d?.label ?? id,
      unit: d?.unit ?? '',
      count: recent.length,
      from: recent[0]!.t,
      to: recent[recent.length - 1]!.t,
      last: round(recent[recent.length - 1]!.v),
      min: round(min),
      max: round(max),
      median: round(d3median(recent, (p) => p.v) ?? NaN),
    });
  }
  return out;
}

function round(x: number): number {
  return Number.isFinite(x) ? Number(x.toFixed(3)) : x;
}
