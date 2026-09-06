/* Programmer: Lalith Satheesh / Date: 09/05/2026 */

/** One sample of a named time series. `t` is epoch milliseconds. */
export interface SeriesPoint {
  seriesId: string;
  t: number;
  v: number;
}

/** A point event on the globe. `magnitude` is source-specific (Mw, knots, acres...). */
export interface GeoEvent {
  id: string;
  source: string;
  kind: string;
  lat: number;
  lon: number;
  t: number;
  magnitude: number;
  /** Optional human name such as the USGS "place" string. Used in summaries only. */
  label?: string;
}

/** Optional metadata that makes summaries readable and lets a UI locate a series. */
export interface SeriesDescriptor {
  id: string;
  label?: string;
  unit?: string;
  lat?: number;
  lon?: number;
  /**
   * Smallest spread that counts as real variation, in series units. Robust scale estimates
   * are floored here so a flat series (a week of zero precipitation, say) cannot turn sensor
   * noise into an infinite z-score.
   */
  minSigma?: number;
  /** Per-series detector settings layered over the global config. */
  overrides?: SeriesOverrides;
}

export interface SeriesOverrides {
  robustZ?: Partial<RobustZConfig>;
  ewma?: Partial<EwmaConfig>;
  cusum?: Partial<CusumConfig>;
}

export type DetectorName = 'robust-z' | 'ewma' | 'cusum' | 'event-rate' | 'swarm' | 'threshold';

export interface SignalEvidence {
  /** Expected level: a median, a reference mean, or an expected event count. */
  baseline: number;
  /** What was measured. */
  observed: number;
  /** The level `observed` had to reach for the detector to fire, in the units of `observed`. */
  threshold: number;
  /** Length of the evaluation window in milliseconds. */
  window: number;
  /** Number of samples or baseline events behind the statistics. */
  sampleSize: number;
}

export type SignalStatus = 'active' | 'cooling';

export interface Signal {
  id: string;
  seriesId?: string;
  eventIds?: string[];
  detector: DetectorName;
  /** 0..1, comparable across detectors. */
  severity: number;
  /** Detector-native statistic: |z|, CUSUM sum over h, sigma ratio... Larger is stronger. */
  score: number;
  startedAt: number;
  updatedAt: number;
  evidence: SignalEvidence;
  /** Plain English built only from the evidence and descriptor labels. */
  summary: string;
  /** `cooling` means the condition cleared less than `cooldownMs` ago. */
  status: SignalStatus;
  /** Event kind for event signals; EWMA variant or direction for series detectors. */
  kind?: string;
  /** Threshold signals only: the rule that fired. */
  rule?: string;
  location?: { lat: number; lon: number };
  alsoDetectedBy?: DetectorName[];
}

/** What a detector emits before ranking, dedupe, and cooldown are applied. */
export interface Candidate extends Omit<Signal, 'status' | 'alsoDetectedBy'> {
  /** statistic / threshold. 1 means exactly at the firing level. */
  ratio: number;
  /** Threshold rules with the same group dedupe to the strongest member. */
  group?: string;
}

export interface DetectorContext {
  now: number;
  /** Candidates with ratio >= minRatio are returned so hysteresis can keep live signals alive. */
  minRatio: number;
  descriptor?: SeriesDescriptor;
}

export interface EngineInput {
  series?: SeriesPoint[];
  events?: GeoEvent[];
  descriptors?: SeriesDescriptor[];
  /** Injected clock. Nothing in the engine reads Date.now(). */
  now: number;
  /** Signals from the previous run, for startedAt continuity, hysteresis, and cooldown. */
  previous?: Signal[];
}

export interface EngineResult {
  signals: Signal[];
  evaluatedSeries: number;
  evaluatedEvents: number;
  /** Candidates before dedupe. Useful for tuning thresholds. */
  candidates: number;
}

export interface RobustZConfig {
  enabled: boolean;
  /** Baseline window length in ms. */
  windowMs: number;
  /** Baseline samples needed before scoring. */
  minSamples: number;
  /** Modified z-score that fires. Iglewicz and Hoaglin suggest 3.5. */
  threshold: number;
  /** Observed value is the median of samples in the last `recentMs`; 0 means the last sample. */
  recentMs: number;
}

export interface EwmaConfig {
  enabled: boolean;
  windowMs: number;
  minSamples: number;
  /** Share of the window, from the start, used as the reference period. */
  baselineFraction: number;
  /** Smoothing half-life in ms; alpha is derived per series from its sample spacing. */
  halfLifeMs: number;
  /** Control-limit width in sigmas for the smoothed mean. */
  meanLimit: number;
  /** The limit is never narrower than this many reference sigmas. */
  minShiftSigmas: number;
  /** Fires when the smoothed residual variance exceeds this multiple of the reference variance. */
  varianceRatio: number;
}

export interface CusumConfig {
  enabled: boolean;
  windowMs: number;
  minSamples: number;
  baselineFraction: number;
  /** Slack k in sigmas: deviations smaller than this do not accumulate. */
  slack: number;
  /** Decision interval h in sigmas. */
  decision: number;
}

export interface EventRateConfig {
  enabled: boolean;
  recentWindowMs: number;
  baselineWindowMs: number;
  /** Anscombe-transformed Poisson z that fires. */
  threshold: number;
  /** Baseline events needed before a rate is trusted. */
  minBaselineEvents: number;
  /** Only these kinds are counted; empty means all. */
  kinds: string[];
  /** Per-kind magnitude floor applied before counting. */
  minMagnitude: Record<string, number>;
  /** Cap on eventIds attached to a signal. */
  maxEventIds: number;
}

export interface SwarmConfig {
  enabled: boolean;
  recentWindowMs: number;
  baselineWindowMs: number;
  /** DBSCAN neighbourhood radius in km. */
  epsKm: number;
  /** DBSCAN core-point minimum, counting the point itself. */
  minPoints: number;
  threshold: number;
  /** Only these kinds are clustered; empty means all. */
  kinds: string[];
  minMagnitude: Record<string, number>;
  maxEventIds: number;
}

export type ThresholdTarget =
  | { seriesId: string; seriesPrefix?: undefined; kind?: undefined; source?: undefined }
  | { seriesPrefix: string; seriesId?: undefined; kind?: undefined; source?: undefined }
  | { kind: string; source?: string; seriesId?: undefined; seriesPrefix?: undefined };

export interface ThresholdRule {
  id: string;
  /** Domain name of the condition, e.g. "G1 geomagnetic storm". */
  label: string;
  target: ThresholdTarget;
  op: 'gte' | 'lte';
  value: number;
  /** Series only: every sample in the last `sustainedMs` must satisfy the rule. */
  sustainedMs?: number;
  /** Severity at the threshold itself. */
  severityAtThreshold: number;
  /** Value at which severity saturates to 1. */
  severityFull: number;
  /** Rules sharing a group dedupe to the strongest firing member. */
  group?: string;
  /** Series only: window used for the contextual median in the evidence. */
  contextWindowMs?: number;
}

export interface ThresholdConfig {
  enabled: boolean;
  rules: ThresholdRule[];
  /** Events only: how far back an event can be and still fire a rule. */
  eventWindowMs: number;
  /** Events only: baseline window for the contextual median magnitude. */
  eventBaselineWindowMs: number;
}

export interface RankingConfig {
  /** How long a cleared signal stays visible as `cooling`. */
  cooldownMs: number;
  /** A live signal survives while its statistic stays above hysteresis * threshold. */
  hysteresis: number;
  maxSignals: number;
}

export interface EventLabel {
  singular: string;
  plural: string;
}

export interface EngineConfig {
  robustZ: RobustZConfig;
  ewma: EwmaConfig;
  cusum: CusumConfig;
  eventRate: EventRateConfig;
  swarm: SwarmConfig;
  threshold: ThresholdConfig;
  ranking: RankingConfig;
  /** Human names for event kinds, used in summaries. */
  eventLabels: Record<string, EventLabel>;
}

export type DeepPartial<T> = {
  [K in keyof T]?: T[K] extends (infer U)[] ? U[] : T[K] extends object ? DeepPartial<T[K]> : T[K];
};

export type EngineConfigInput = DeepPartial<EngineConfig>;
