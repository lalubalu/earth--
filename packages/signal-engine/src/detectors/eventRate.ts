/* Programmer: Lalith Satheesh / Date: 09/05/2026 */
import { eventLabel, fmtDuration, fmtNum } from '../format.js';
import { centroid } from '../geo.js';
import { clamp01, poissonRequiredCount, poissonZ } from '../stats.js';
import type { Candidate, EngineConfig, EventRateConfig, GeoEvent } from '../types.js';

export interface EventContext {
  now: number;
  minRatio: number;
}

/**
 * Poisson-style burst detection per source:kind. The baseline rate comes from the long
 * window with the recent window cut out, so a burst never inflates its own expectation.
 * Only increases fire; a drop in reported events usually means a feed problem, not a quiet
 * planet, and the dashboard reports feed health separately.
 */
export function detectEventRate(
  events: readonly GeoEvent[],
  cfg: EventRateConfig,
  config: EngineConfig,
  ctx: EventContext,
): Candidate[] {
  if (!cfg.enabled) return [];
  const recentFrom = ctx.now - cfg.recentWindowMs;
  const baselineFrom = ctx.now - cfg.baselineWindowMs;
  const baselineDuration = cfg.baselineWindowMs - cfg.recentWindowMs;
  if (baselineDuration <= 0) return [];

  const groups = new Map<string, GeoEvent[]>();
  for (const e of events) {
    const floor = cfg.minMagnitude[e.kind];
    if (floor !== undefined && e.magnitude < floor) continue;
    if (e.t < baselineFrom || e.t > ctx.now) continue;
    const key = `${e.source}:${e.kind}`;
    const list = groups.get(key);
    if (list) list.push(e);
    else groups.set(key, [e]);
  }

  const out: Candidate[] = [];
  for (const [key, list] of groups) {
    const baseline = list.filter((e) => e.t < recentFrom);
    const recent = list.filter((e) => e.t >= recentFrom);
    if (baseline.length < cfg.minBaselineEvents) continue;

    const expected = (baseline.length * cfg.recentWindowMs) / baselineDuration;
    const z = poissonZ(recent.length, expected);
    const ratio = z / cfg.threshold;
    if (ratio < ctx.minRatio) continue;

    const required = poissonRequiredCount(expected, cfg.threshold);
    const sorted = [...recent].sort((a, b) => b.magnitude - a.magnitude || a.t - b.t);
    const kind = (recent[0] ?? baseline[0] as GeoEvent).kind;
    const startedAt = recent.reduce((min, e) => Math.min(min, e.t), ctx.now);
    const where = centroid(recent);

    const candidate: Candidate = {
      id: `event-rate:${key}`,
      eventIds: sorted.slice(0, cfg.maxEventIds).map((e) => e.id),
      detector: 'event-rate',
      severity: clamp01((z - cfg.threshold) / (2 * cfg.threshold)),
      score: z,
      ratio,
      startedAt,
      updatedAt: ctx.now,
      evidence: {
        baseline: expected,
        observed: recent.length,
        threshold: required,
        window: cfg.recentWindowMs,
        sampleSize: baseline.length,
      },
      summary:
        `${recent.length} ${eventLabel(kind, config, recent.length)} in the last ` +
        `${fmtDuration(cfg.recentWindowMs)} against ${fmtNum(expected)} expected from the ` +
        `${fmtDuration(cfg.baselineWindowMs)} rate (fires at ${required}; ` +
        `${baseline.length} baseline events).`,
      kind,
    };
    if (Number.isFinite(where.lat) && Number.isFinite(where.lon)) candidate.location = where;
    out.push(candidate);
  }
  return out;
}
