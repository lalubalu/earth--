/* Programmer: Lalith Satheesh / Date: 09/05/2026 */
import { fmtDuration, fmtNum, fmtValue, seriesLabel } from '../format.js';
import { median, clamp01, robustScale } from '../stats.js';
import { values, windowPoints } from '../series.js';
import type { Candidate, DetectorContext, RobustZConfig, SeriesPoint } from '../types.js';

/**
 * Modified z-score of the latest value against a rolling median/MAD baseline.
 * Severity ramps from 0 at the threshold to 1 at three times the threshold.
 */
export function detectRobustZ(
  seriesId: string,
  points: readonly SeriesPoint[],
  cfg: RobustZConfig,
  ctx: DetectorContext,
): Candidate | null {
  if (!cfg.enabled) return null;
  const inWindow = windowPoints(points, ctx.now - cfg.windowMs, ctx.now);
  if (inWindow.length < cfg.minSamples + 1) return null;

  const last = inWindow[inWindow.length - 1] as SeriesPoint;
  const recentFrom = cfg.recentMs > 0 ? last.t - cfg.recentMs : last.t;
  const recent = inWindow.filter((p) => p.t >= recentFrom);
  const baseline = inWindow.filter((p) => p.t < recentFrom);
  if (baseline.length < cfg.minSamples) return null;

  const observed = median(values(recent));
  const { center, sigma } = robustScale(values(baseline), ctx.descriptor?.minSigma ?? 0);
  if (!(sigma > 0)) return null;

  const z = (observed - center) / sigma;
  const absZ = Math.abs(z);
  const ratio = absZ / cfg.threshold;
  if (ratio < ctx.minRatio) return null;

  const sign = z >= 0 ? 1 : -1;
  const thresholdValue = center + sign * cfg.threshold * sigma;
  const unit = ctx.descriptor?.unit;
  const label = seriesLabel(seriesId, ctx.descriptor);
  const summary =
    `${label} is ${fmtValue(observed, unit)}, ${sign > 0 ? 'above' : 'below'} the ` +
    `${fmtDuration(cfg.windowMs)} median of ${fmtValue(center, unit)} by ${fmtNum(absZ)} robust ` +
    `standard deviations (fires past ${fmtValue(thresholdValue, unit)}; ${baseline.length} samples).`;

  const candidate: Candidate = {
    id: `robust-z:${seriesId}`,
    seriesId,
    detector: 'robust-z',
    severity: clamp01((absZ - cfg.threshold) / (2 * cfg.threshold)),
    score: absZ,
    ratio,
    startedAt: last.t,
    updatedAt: ctx.now,
    evidence: {
      baseline: center,
      observed,
      threshold: thresholdValue,
      window: cfg.windowMs,
      sampleSize: baseline.length,
    },
    summary,
    kind: sign > 0 ? 'high' : 'low',
  };
  const d = ctx.descriptor;
  if (d && typeof d.lat === 'number' && typeof d.lon === 'number') {
    candidate.location = { lat: d.lat, lon: d.lon };
  }
  return candidate;
}
