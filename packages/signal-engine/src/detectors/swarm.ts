/* Programmer: Lalith Satheesh / Date: 09/05/2026 */
import { eventLabel, fmtCoord, fmtDuration, fmtNum } from '../format.js';
import { centroid, dbscan, haversineKm, NOISE } from '../geo.js';
import { clamp01, poissonRequiredCount, poissonZ } from '../stats.js';
import type { Candidate, EngineConfig, GeoEvent, Signal, SwarmConfig } from '../types.js';

export interface SwarmContext {
  now: number;
  minRatio: number;
  /** Lets a moving cluster keep the id (and startedAt) it had last run. */
  previous?: readonly Signal[];
}

/**
 * Haversine DBSCAN over recent events, then each cluster is judged against the baseline
 * rate inside its own footprint. A cluster in a region that is always busy is not a swarm;
 * six events where the last month had none is.
 */
export function detectSwarm(
  events: readonly GeoEvent[],
  cfg: SwarmConfig,
  config: EngineConfig,
  ctx: SwarmContext,
): Candidate[] {
  if (!cfg.enabled) return [];
  const recentFrom = ctx.now - cfg.recentWindowMs;
  const baselineFrom = ctx.now - cfg.baselineWindowMs;
  const baselineDuration = cfg.baselineWindowMs - cfg.recentWindowMs;
  if (baselineDuration <= 0) return [];

  const byKind = new Map<string, GeoEvent[]>();
  for (const e of events) {
    if (cfg.kinds.length > 0 && !cfg.kinds.includes(e.kind)) continue;
    const floor = cfg.minMagnitude[e.kind];
    if (floor !== undefined && e.magnitude < floor) continue;
    if (e.t < baselineFrom || e.t > ctx.now) continue;
    const list = byKind.get(e.kind);
    if (list) list.push(e);
    else byKind.set(e.kind, [e]);
  }

  const previousSwarms = (ctx.previous ?? []).filter(
    (s) => s.detector === 'swarm' && s.location !== undefined,
  );

  const out: Candidate[] = [];
  for (const [kind, list] of byKind) {
    const recent = list.filter((e) => e.t >= recentFrom);
    const baseline = list.filter((e) => e.t < recentFrom);
    if (recent.length < cfg.minPoints) continue;

    const labels = dbscan(recent, cfg.epsKm, cfg.minPoints);
    const clusters = new Map<number, GeoEvent[]>();
    labels.forEach((label, i) => {
      if (label === NOISE) return;
      const member = recent[i] as GeoEvent;
      const members = clusters.get(label);
      if (members) members.push(member);
      else clusters.set(label, [member]);
    });

    for (const members of clusters.values()) {
      const center = centroid(members);
      if (!Number.isFinite(center.lat)) continue;
      const radius = members.reduce(
        (max, e) => Math.max(max, haversineKm(e, center)),
        cfg.epsKm,
      );
      const baselineCount = baseline.filter((e) => haversineKm(e, center) <= radius).length;
      const expected = (baselineCount * cfg.recentWindowMs) / baselineDuration;
      const z = poissonZ(members.length, expected);
      const ratio = z / cfg.threshold;
      if (ratio < ctx.minRatio) continue;

      const required = poissonRequiredCount(expected, cfg.threshold);
      const sorted = [...members].sort((a, b) => b.magnitude - a.magnitude || a.t - b.t);
      const startedAt = members.reduce((min, e) => Math.min(min, e.t), ctx.now);

      let nearest: Signal | undefined;
      let nearestKm = cfg.epsKm;
      for (const prev of previousSwarms) {
        if (prev.kind !== kind || !prev.location) continue;
        const km = haversineKm(prev.location, center);
        if (km <= nearestKm) {
          nearestKm = km;
          nearest = prev;
        }
      }
      const id = nearest?.id ?? `swarm:${kind}:${center.lat.toFixed(1)}:${center.lon.toFixed(1)}`;

      out.push({
        id,
        eventIds: sorted.slice(0, cfg.maxEventIds).map((e) => e.id),
        detector: 'swarm',
        severity: clamp01((z - cfg.threshold) / (2 * cfg.threshold)),
        score: z,
        ratio,
        startedAt,
        updatedAt: ctx.now,
        evidence: {
          baseline: expected,
          observed: members.length,
          threshold: required,
          window: cfg.recentWindowMs,
          sampleSize: baselineCount,
        },
        summary:
          `${members.length} ${eventLabel(kind, config, members.length)} clustered within ` +
          `${fmtNum(radius)} km of ${fmtCoord(center.lat, center.lon)} in the last ` +
          `${fmtDuration(cfg.recentWindowMs)}; the ${fmtDuration(cfg.baselineWindowMs)} rate ` +
          `there predicts ${fmtNum(expected)} (fires at ${required}; ${baselineCount} baseline events).`,
        kind,
        location: center,
      });
    }
  }
  return out;
}
