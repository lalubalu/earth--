/* Programmer: Lalith Satheesh / Date: 09/05/2026 */
import { fmtAgo, fmtValue, seriesLabel } from '../format.js';
import { clamp01, mean, robustScale } from '../stats.js';
import { values, windowPoints } from '../series.js';
import type { Candidate, CusumConfig, DetectorContext, SeriesPoint } from '../types.js';

const MIN_REFERENCE = 10;

/**
 * Two-sided tabular CUSUM in reference-sigma units. The change point is where the winning
 * sum last left zero. The evidence threshold is the mean level the post-change segment
 * needed to reach, which follows from S = m * (d - k) > h, i.e. d > k + h / m.
 */
export function detectCusum(
  seriesId: string,
  points: readonly SeriesPoint[],
  cfg: CusumConfig,
  ctx: DetectorContext,
): Candidate | null {
  if (!cfg.enabled) return null;
  const inWindow = windowPoints(points, ctx.now - cfg.windowMs, ctx.now);
  const n = inWindow.length;
  if (n < cfg.minSamples) return null;

  const refCount = Math.min(n - 1, Math.max(MIN_REFERENCE, Math.floor(n * cfg.baselineFraction)));
  const { center: mu0, sigma: sigma0 } = robustScale(
    values(inWindow.slice(0, refCount)),
    ctx.descriptor?.minSigma ?? 0,
  );
  if (!(sigma0 > 0)) return null;

  let sPos = 0;
  let sNeg = 0;
  let posStart: number | null = null;
  let negStart: number | null = null;
  for (let i = 0; i < n; i++) {
    const d = ((inWindow[i] as SeriesPoint).v - mu0) / sigma0;
    sPos = Math.max(0, sPos + d - cfg.slack);
    sNeg = Math.max(0, sNeg - d - cfg.slack);
    posStart = sPos === 0 ? null : (posStart ?? i);
    negStart = sNeg === 0 ? null : (negStart ?? i);
  }

  const positive = sPos >= sNeg;
  const sum = positive ? sPos : sNeg;
  const ratio = sum / cfg.decision;
  if (ratio < ctx.minRatio) return null;

  const startIdx = (positive ? posStart : negStart) ?? n - 1;
  const since = inWindow.slice(startIdx);
  const m = since.length;
  const observed = mean(values(since));
  const sign = positive ? 1 : -1;
  const thresholdValue = mu0 + sign * (cfg.slack + cfg.decision / m) * sigma0;
  const startedAt = (inWindow[startIdx] as SeriesPoint).t;

  const unit = ctx.descriptor?.unit;
  const label = seriesLabel(seriesId, ctx.descriptor);
  const candidate: Candidate = {
    id: `cusum:${seriesId}`,
    seriesId,
    detector: 'cusum',
    severity: clamp01((ratio - 1) / 2),
    score: ratio,
    ratio,
    startedAt,
    updatedAt: ctx.now,
    evidence: {
      baseline: mu0,
      observed,
      threshold: thresholdValue,
      window: cfg.windowMs,
      sampleSize: m,
    },
    summary:
      `${label} shifted ${positive ? 'up' : 'down'} about ${fmtAgo(startedAt, ctx.now)}: it has ` +
      `averaged ${fmtValue(observed, unit)} since then against a reference of ` +
      `${fmtValue(mu0, unit)} (needed ${fmtValue(thresholdValue, unit)} to fire; ${m} samples).`,
    kind: positive ? 'up' : 'down',
  };
  const d = ctx.descriptor;
  if (d && typeof d.lat === 'number' && typeof d.lon === 'number') {
    candidate.location = { lat: d.lat, lon: d.lon };
  }
  return candidate;
}
