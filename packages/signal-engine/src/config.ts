/* Programmer: Lalith Satheesh / Date: 09/05/2026 */
import type { EngineConfig, EngineConfigInput, ThresholdRule } from './types.js';

export const MINUTE = 60_000;
export const HOUR = 3_600_000;
export const DAY = 86_400_000;

/**
 * Domain facts shipped as defaults. They reference the series ids and event kinds the
 * Earth Signals dashboard uses; replace `threshold.rules` wholesale for other data.
 */
export const DEFAULT_RULES: ThresholdRule[] = [
  {
    id: 'kp-storm',
    label: 'G1 geomagnetic storm',
    target: { seriesPrefix: 'noaa.kp' },
    op: 'gte',
    value: 5,
    severityAtThreshold: 0.45,
    severityFull: 9,
    group: 'geomagnetic-storm',
    contextWindowMs: DAY,
  },
  {
    id: 'bz-south',
    label: 'sustained southward Bz',
    target: { seriesId: 'noaa.bz' },
    op: 'lte',
    value: -10,
    sustainedMs: 30 * MINUTE,
    severityAtThreshold: 0.4,
    severityFull: -30,
    contextWindowMs: DAY,
  },
  {
    id: 'major-quake',
    label: 'major earthquake',
    target: { kind: 'earthquake' },
    op: 'gte',
    value: 5.5,
    severityAtThreshold: 0.5,
    severityFull: 7.5,
  },
];

export const DEFAULT_CONFIG: EngineConfig = {
  robustZ: {
    enabled: true,
    windowMs: 7 * DAY,
    minSamples: 20,
    threshold: 3.5,
    recentMs: 0,
  },
  ewma: {
    enabled: true,
    windowMs: 7 * DAY,
    minSamples: 30,
    baselineFraction: 0.5,
    halfLifeMs: DAY,
    meanLimit: 3,
    minShiftSigmas: 1,
    varianceRatio: 4,
  },
  cusum: {
    enabled: true,
    windowMs: 7 * DAY,
    minSamples: 30,
    baselineFraction: 0.5,
    slack: 0.5,
    decision: 5,
    severityShiftSigmas: 3,
  },
  eventRate: {
    enabled: true,
    recentWindowMs: 3 * HOUR,
    baselineWindowMs: 30 * DAY,
    threshold: 3,
    minBaselineEvents: 10,
    kinds: [],
    minMagnitude: { earthquake: 2.5 },
    maxEventIds: 200,
  },
  swarm: {
    enabled: true,
    recentWindowMs: DAY,
    baselineWindowMs: 30 * DAY,
    epsKm: 50,
    minPoints: 6,
    threshold: 3,
    kinds: [],
    minMagnitude: {},
    maxEventIds: 200,
  },
  threshold: {
    enabled: true,
    rules: DEFAULT_RULES,
    eventWindowMs: DAY,
    eventBaselineWindowMs: 30 * DAY,
  },
  ranking: {
    cooldownMs: 10 * MINUTE,
    hysteresis: 0.8,
    maxSignals: 50,
  },
  eventLabels: {
    earthquake: { singular: 'earthquake', plural: 'earthquakes' },
  },
};

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

// Arrays (rules, kinds) are replaced, never concatenated: a caller that passes rules
// wants exactly those rules.
function merge<T>(base: T, patch: unknown): T {
  if (!isPlainObject(base) || !isPlainObject(patch)) {
    return (patch === undefined ? base : patch) as T;
  }
  const out: Record<string, unknown> = { ...base };
  for (const [key, value] of Object.entries(patch)) {
    if (value === undefined) continue;
    out[key] = merge(base[key], value);
  }
  return out as T;
}

export function resolveConfig(input?: EngineConfigInput): EngineConfig {
  return merge(DEFAULT_CONFIG, input ?? {});
}
