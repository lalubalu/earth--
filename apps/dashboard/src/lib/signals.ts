/* Programmer: Lalith Satheesh / Date: 09/05/2026 */
import { fmtNum, fmtValue } from '@lalubalu/signal-engine';
import type { DetectorName, Signal } from '@lalubalu/signal-engine';
import { DESCRIPTOR_BY_ID, ENGINE_CONFIG } from './engine/descriptors';
import type { FeedEvent } from './feeds/types';

export const DETECTOR_LABELS: Record<DetectorName, string> = {
  'robust-z': 'Spike',
  ewma: 'Drift',
  cusum: 'Shift',
  'event-rate': 'Burst',
  swarm: 'Swarm',
  threshold: 'Rule',
};

export const DETECTOR_HELP: Record<DetectorName, string> = {
  'robust-z': 'Latest value against the rolling median and MAD of the window.',
  ewma: 'Exponentially weighted moving average control chart on level and variance.',
  cusum: 'Cumulative sum change-point test in reference-sigma units.',
  'event-rate': 'Poisson test of recent event count against the long-run rate.',
  swarm: 'Haversine DBSCAN cluster judged against its own local baseline rate.',
  threshold: 'Absolute domain rule such as Kp at or above 5.',
};

export type SeverityBand = 'low' | 'moderate' | 'high' | 'severe';

export function severityBand(severity: number): SeverityBand {
  if (severity >= 0.75) return 'severe';
  if (severity >= 0.5) return 'high';
  if (severity >= 0.25) return 'moderate';
  return 'low';
}

export const SEVERITY_LABELS: Record<SeverityBand, string> = {
  low: 'Low',
  moderate: 'Moderate',
  high: 'High',
  severe: 'Severe',
};

function kindLabel(kind: string | undefined, count: number): string {
  if (!kind) return count === 1 ? 'event' : 'events';
  const label = ENGINE_CONFIG.eventLabels?.[kind];
  if (label?.singular && label.plural) return count === 1 ? label.singular : label.plural;
  return count === 1 ? `${kind} event` : `${kind} events`;
}

function capitalize(s: string): string {
  return s.length === 0 ? s : s[0]!.toUpperCase() + s.slice(1);
}

/** Short headline for a card; the summary carries the numbers. */
export function signalTitle(signal: Signal, eventsById: ReadonlyMap<string, FeedEvent>): string {
  if (signal.seriesId) {
    const d = DESCRIPTOR_BY_ID.get(signal.seriesId);
    return d?.label ?? signal.seriesId;
  }
  const count = signal.eventIds?.length ?? 0;
  const first = signal.eventIds?.[0] ? eventsById.get(signal.eventIds[0]) : undefined;
  switch (signal.detector) {
    case 'threshold': {
      const mag = first ? fmtNum(first.magnitude) : fmtNum(signal.evidence.observed);
      const where = first?.label ? ` near ${first.label}` : '';
      return `M${mag} ${kindLabel(signal.kind, 1)}${where}`;
    }
    case 'event-rate':
      return `${capitalize(kindLabel(signal.kind, 2))}: ${count} in ${Math.round(signal.evidence.window / 3_600_000)} h`;
    case 'swarm':
      return `${capitalize(kindLabel(signal.kind, 1))} swarm, ${count} events`;
    default:
      return capitalize(kindLabel(signal.kind, count));
  }
}

/** Compact "observed vs baseline" for the card meter line. */
export function signalDelta(signal: Signal): string {
  const unit = signal.seriesId ? DESCRIPTOR_BY_ID.get(signal.seriesId)?.unit : undefined;
  const { observed, baseline } = signal.evidence;
  if (signal.detector === 'event-rate' || signal.detector === 'swarm') {
    return `${fmtNum(observed)} vs ${fmtNum(baseline)} expected`;
  }
  if (signal.kind === 'ewma-variance') {
    return `spread ${fmtValue(observed, unit)} vs ${fmtValue(baseline, unit)}`;
  }
  return `${fmtValue(observed, unit)} vs ${fmtValue(baseline, unit)}`;
}

export function signalEvents(
  signal: Signal,
  eventsById: ReadonlyMap<string, FeedEvent>,
): FeedEvent[] {
  if (!signal.eventIds) return [];
  const out: FeedEvent[] = [];
  for (const id of signal.eventIds) {
    const e = eventsById.get(id);
    if (e) out.push(e);
  }
  return out;
}

export function signalLocation(signal: Signal): { lat: number; lon: number } | null {
  if (signal.location) return signal.location;
  if (signal.seriesId) {
    const d = DESCRIPTOR_BY_ID.get(signal.seriesId);
    if (d && typeof d.lat === 'number' && typeof d.lon === 'number')
      return { lat: d.lat, lon: d.lon };
  }
  return null;
}
