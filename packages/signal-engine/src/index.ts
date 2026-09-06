/* Programmer: Lalith Satheesh / Date: 09/05/2026 */
export const VERSION = '0.1.0';

export { runEngine, cleanEvents } from './engine.js';
export { reconcile } from './rank.js';
export { resolveConfig, DEFAULT_CONFIG, DEFAULT_RULES, MINUTE, HOUR, DAY } from './config.js';

export { detectRobustZ } from './detectors/robustZ.js';
export { detectEwma } from './detectors/ewma.js';
export { detectCusum } from './detectors/cusum.js';
export { detectEventRate } from './detectors/eventRate.js';
export { detectSwarm } from './detectors/swarm.js';
export { detectThresholds } from './detectors/threshold.js';

export { groupSeries, windowPoints, medianSpacing } from './series.js';
export {
  mean,
  variance,
  median,
  mad,
  meanAbsDev,
  robustScale,
  poissonZ,
  poissonRequiredCount,
  clamp01,
  MAD_SCALE,
} from './stats.js';
export { haversineKm, centroid, dbscan, EARTH_RADIUS_KM, NOISE } from './geo.js';
export { fmtNum, fmtValue, fmtDuration, fmtAgo, fmtCoord } from './format.js';

export type {
  SeriesPoint,
  GeoEvent,
  SeriesDescriptor,
  SeriesOverrides,
  DetectorName,
  SignalEvidence,
  SignalStatus,
  Signal,
  Candidate,
  DetectorContext,
  EngineInput,
  EngineResult,
  EngineConfig,
  EngineConfigInput,
  DeepPartial,
  RobustZConfig,
  EwmaConfig,
  CusumConfig,
  EventRateConfig,
  SwarmConfig,
  ThresholdConfig,
  ThresholdRule,
  ThresholdTarget,
  RankingConfig,
  EventLabel,
} from './types.js';
export type { RobustScale } from './stats.js';
export type { LatLon } from './geo.js';
export type { EventContext } from './detectors/eventRate.js';
export type { SwarmContext } from './detectors/swarm.js';
