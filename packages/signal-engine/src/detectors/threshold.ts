/* Programmer: Lalith Satheesh / Date: 09/05/2026 */
import { eventLabel, fmtDuration, fmtValue, seriesLabel } from '../format.js';
import { clamp01, mean, median } from '../stats.js';
import { values, windowPoints } from '../series.js';
import type {
  Candidate,
  EngineConfig,
  GeoEvent,
  SeriesDescriptor,
  SeriesPoint,
  ThresholdConfig,
  ThresholdRule,
} from '../types.js';

const DEFAULT_CONTEXT_WINDOW_MS = 86_400_000;

function satisfies(rule: ThresholdRule, v: number): boolean {
  return rule.op === 'gte' ? v >= rule.value : v <= rule.value;
}

/** Severity climbs linearly from the threshold to `severityFull`; direction-agnostic. */
function ruleSeverity(rule: ThresholdRule, observed: number): number {
  const span = rule.severityFull - rule.value;
  const progress = span === 0 ? 1 : clamp01((observed - rule.value) / span);
  return rule.severityAtThreshold + (1 - rule.severityAtThreshold) * progress;
}

function matchesSeries(rule: ThresholdRule, seriesId: string): boolean {
  const t = rule.target;
  if (t.seriesId !== undefined) return t.seriesId === seriesId;
  if (t.seriesPrefix !== undefined) return seriesId.startsWith(t.seriesPrefix);
  return false;
}

function seriesCandidate(
  rule: ThresholdRule,
  seriesId: string,
  points: readonly SeriesPoint[],
  descriptor: SeriesDescriptor | undefined,
  now: number,
): Candidate | null {
  const last = points[points.length - 1];
  if (!last) return null;

  const sustainedMs = rule.sustainedMs ?? 0;
  const run = windowPoints(points, last.t - sustainedMs, last.t);
  const first = run[0] as SeriesPoint;
  // A "sustained" rule needs the samples to actually span the period, not one lonely reading.
  if (sustainedMs > 0 && (run.length < 2 || last.t - first.t < sustainedMs / 2)) return null;
  if (!run.every((p) => satisfies(rule, p.v))) return null;

  const observed = sustainedMs > 0 ? mean(values(run)) : last.v;
  let startIdx = points.length - 1;
  while (startIdx > 0 && satisfies(rule, (points[startIdx - 1] as SeriesPoint).v)) startIdx--;
  const startedAt = (points[startIdx] as SeriesPoint).t;

  const contextMs = rule.contextWindowMs ?? DEFAULT_CONTEXT_WINDOW_MS;
  const context = windowPoints(points, last.t - contextMs, last.t);
  const baseline = median(values(context));
  const unit = descriptor?.unit;
  const label = seriesLabel(seriesId, descriptor);
  const severity = ruleSeverity(rule, observed);

  const candidate: Candidate = {
    id: `threshold:${rule.id}:${seriesId}`,
    seriesId,
    detector: 'threshold',
    severity,
    score: rule.op === 'gte' ? observed / rule.value : rule.value / observed,
    ratio: 1 + severity,
    startedAt,
    updatedAt: now,
    evidence: {
      baseline,
      observed,
      threshold: rule.value,
      window: sustainedMs,
      sampleSize: run.length,
    },
    summary:
      `${label} is ${fmtValue(observed, unit)}, ${rule.op === 'gte' ? 'at or above' : 'at or below'} ` +
      `the ${rule.label} threshold of ${fmtValue(rule.value, unit)}` +
      (sustainedMs > 0 ? ` for the last ${fmtDuration(sustainedMs)}` : '') +
      ` (${fmtDuration(contextMs)} median ${fmtValue(baseline, unit)}).`,
    kind: rule.op === 'gte' ? 'high' : 'low',
    rule: rule.id,
  };
  if (rule.group) candidate.group = rule.group;
  if (descriptor && typeof descriptor.lat === 'number' && typeof descriptor.lon === 'number') {
    candidate.location = { lat: descriptor.lat, lon: descriptor.lon };
  }
  return candidate;
}

function eventCandidates(
  rule: ThresholdRule,
  events: readonly GeoEvent[],
  cfg: ThresholdConfig,
  config: EngineConfig,
  now: number,
): Candidate[] {
  const t = rule.target;
  if (t.kind === undefined) return [];
  const pool = events.filter(
    (e) =>
      e.kind === t.kind &&
      (t.source === undefined || e.source === t.source) &&
      e.t >= now - cfg.eventBaselineWindowMs &&
      e.t <= now,
  );
  const baseline = median(pool.map((e) => e.magnitude));
  const out: Candidate[] = [];
  for (const e of pool) {
    if (e.t < now - cfg.eventWindowMs || !satisfies(rule, e.magnitude)) continue;
    const severity = ruleSeverity(rule, e.magnitude);
    const candidate: Candidate = {
      id: `threshold:${rule.id}:${e.id}`,
      eventIds: [e.id],
      detector: 'threshold',
      severity,
      score: rule.op === 'gte' ? e.magnitude / rule.value : rule.value / e.magnitude,
      ratio: 1 + severity,
      startedAt: e.t,
      updatedAt: now,
      evidence: {
        baseline,
        observed: e.magnitude,
        threshold: rule.value,
        window: cfg.eventWindowMs,
        sampleSize: pool.length,
      },
      summary:
        `${capitalize(eventLabel(e.kind, config, 1))} of magnitude ${fmtValue(e.magnitude)}` +
        (e.label ? ` near ${e.label}` : '') +
        ` is ${rule.op === 'gte' ? 'at or above' : 'at or below'} the ${rule.label} threshold of ` +
        `${fmtValue(rule.value)} (median of the last ${fmtDuration(cfg.eventBaselineWindowMs)}: ` +
        `${fmtValue(baseline)}; ${pool.length} events).`,
      kind: e.kind,
      rule: rule.id,
      location: { lat: e.lat, lon: e.lon },
    };
    if (rule.group) candidate.group = rule.group;
    out.push(candidate);
  }
  return out;
}

function capitalize(s: string): string {
  return s.length === 0 ? s : s[0]!.toUpperCase() + s.slice(1);
}

export function detectThresholds(
  series: ReadonlyMap<string, SeriesPoint[]>,
  events: readonly GeoEvent[],
  cfg: ThresholdConfig,
  config: EngineConfig,
  descriptors: ReadonlyMap<string, SeriesDescriptor>,
  now: number,
): Candidate[] {
  if (!cfg.enabled) return [];
  const out: Candidate[] = [];
  for (const rule of cfg.rules) {
    if (rule.target.kind !== undefined) {
      out.push(...eventCandidates(rule, events, cfg, config, now));
      continue;
    }
    for (const [seriesId, points] of series) {
      if (!matchesSeries(rule, seriesId)) continue;
      const c = seriesCandidate(rule, seriesId, points, descriptors.get(seriesId), now);
      if (c) out.push(c);
    }
  }
  return out;
}
