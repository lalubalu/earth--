/* Programmer: Lalith Satheesh / Date: 09/05/2026 */
import { resolveConfig } from './config.js';
import { detectCusum } from './detectors/cusum.js';
import { detectEventRate } from './detectors/eventRate.js';
import { detectEwma } from './detectors/ewma.js';
import { detectRobustZ } from './detectors/robustZ.js';
import { detectSwarm } from './detectors/swarm.js';
import { detectThresholds } from './detectors/threshold.js';
import { reconcile } from './rank.js';
import { groupSeries } from './series.js';
import { isFiniteNumber } from './stats.js';
import type {
  Candidate,
  EngineConfigInput,
  EngineInput,
  EngineResult,
  GeoEvent,
  SeriesDescriptor,
} from './types.js';

/** Drops malformed events, future events, and duplicate ids (last one wins). */
export function cleanEvents(events: readonly GeoEvent[], now: number): GeoEvent[] {
  const byId = new Map<string, GeoEvent>();
  for (const e of events) {
    if (!e || typeof e.id !== 'string' || typeof e.kind !== 'string') continue;
    if (!isFiniteNumber(e.lat) || !isFiniteNumber(e.lon) || !isFiniteNumber(e.t)) continue;
    if (!isFiniteNumber(e.magnitude) || e.t > now) continue;
    if (Math.abs(e.lat) > 90 || Math.abs(e.lon) > 180) continue;
    byId.set(e.id, e);
  }
  return [...byId.values()].sort((a, b) => a.t - b.t || (a.id < b.id ? -1 : 1));
}

/**
 * One deterministic pass over everything. Same input and config always give the same
 * output; the only clock is `input.now`.
 */
export function runEngine(input: EngineInput, configInput?: EngineConfigInput): EngineResult {
  if (!isFiniteNumber(input.now)) throw new TypeError('EngineInput.now must be a finite number');
  const config = resolveConfig(configInput);
  const now = input.now;
  const previous = input.previous ?? [];
  const minRatio = config.ranking.hysteresis;

  const seriesMap = groupSeries(input.series ?? [], now);
  const events = cleanEvents(input.events ?? [], now);
  const descriptors = new Map<string, SeriesDescriptor>();
  for (const d of input.descriptors ?? []) descriptors.set(d.id, d);

  const candidates: Candidate[] = [];
  for (const [seriesId, points] of seriesMap) {
    const descriptor = descriptors.get(seriesId);
    const ctx = { now, minRatio, descriptor };
    const overrides = descriptor?.overrides;
    const rz = detectRobustZ(seriesId, points, { ...config.robustZ, ...overrides?.robustZ }, ctx);
    if (rz) candidates.push(rz);
    const ew = detectEwma(seriesId, points, { ...config.ewma, ...overrides?.ewma }, ctx);
    if (ew) candidates.push(ew);
    const cu = detectCusum(seriesId, points, { ...config.cusum, ...overrides?.cusum }, ctx);
    if (cu) candidates.push(cu);
  }
  candidates.push(...detectEventRate(events, config.eventRate, config, { now, minRatio }));
  candidates.push(...detectSwarm(events, config.swarm, config, { now, minRatio, previous }));
  candidates.push(
    ...detectThresholds(seriesMap, events, config.threshold, config, descriptors, now),
  );

  return {
    signals: reconcile(candidates, previous, now, config.ranking),
    evaluatedSeries: seriesMap.size,
    evaluatedEvents: events.length,
    candidates: candidates.length,
  };
}
