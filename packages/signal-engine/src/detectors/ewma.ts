/* Programmer: Lalith Satheesh / Date: 09/05/2026 */
import { fmtDuration, fmtValue, seriesLabel } from '../format.js';
import { clamp01, robustScale } from '../stats.js';
import { medianSpacing, values, windowPoints } from '../series.js';
import type { Candidate, DetectorContext, EwmaConfig, SeriesPoint } from '../types.js';

const MIN_REFERENCE = 10;

/**
 * EWMA control chart on the smoothed level plus an EWMA of squared residuals for variance.
 * The reference mean and sigma come from the first `baselineFraction` of the window using
 * robust estimators, so a shift late in the window does not contaminate them. Alpha is
 * derived from the series' own sample spacing so one half-life works for 1-minute and
 * hourly data alike.
 */
export function detectEwma(
  seriesId: string,
  points: readonly SeriesPoint[],
  cfg: EwmaConfig,
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

  const spacing = medianSpacing(inWindow);
  if (!(spacing > 0)) return null;
  const alpha = Math.min(0.5, Math.max(1e-4, 1 - Math.pow(2, -spacing / cfg.halfLifeMs)));

  const limit = Math.max(
    cfg.meanLimit * sigma0 * Math.sqrt(alpha / (2 - alpha)),
    cfg.minShiftSigmas * sigma0,
  );
  const varianceLimit = sigma0 * sigma0 * cfg.varianceRatio;

  let level = mu0;
  let s2 = sigma0 * sigma0;
  let meanSince: number | null = null;
  let varSince: number | null = null;
  for (const p of inWindow) {
    const resid = p.v - level;
    s2 = (1 - alpha) * s2 + alpha * resid * resid;
    level += alpha * resid;
    meanSince = Math.abs(level - mu0) > limit ? (meanSince ?? p.t) : null;
    varSince = s2 > varianceLimit ? (varSince ?? p.t) : null;
  }

  const meanDev = level - mu0;
  const meanRatio = Math.abs(meanDev) / limit;
  const varRatio = s2 / varianceLimit;
  const useMean = meanRatio >= varRatio;
  const ratio = useMean ? meanRatio : varRatio;
  if (ratio < ctx.minRatio) return null;

  const last = inWindow[n - 1] as SeriesPoint;
  const unit = ctx.descriptor?.unit;
  const label = seriesLabel(seriesId, ctx.descriptor);
  const sd = Math.sqrt(s2);

  let candidate: Candidate;
  if (useMean) {
    const sign = meanDev >= 0 ? 1 : -1;
    const thresholdValue = mu0 + sign * limit;
    candidate = {
      id: `ewma:${seriesId}`,
      seriesId,
      detector: 'ewma',
      severity: clamp01((ratio - 1) / 2),
      score: Math.abs(meanDev) / sigma0,
      ratio,
      startedAt: meanSince ?? last.t,
      updatedAt: ctx.now,
      evidence: {
        baseline: mu0,
        observed: level,
        threshold: thresholdValue,
        window: cfg.windowMs,
        sampleSize: n,
      },
      summary:
        `Smoothed ${label} has drifted ${sign > 0 ? 'above' : 'below'} its reference: ` +
        `${fmtValue(level, unit)} against ${fmtValue(mu0, unit)} ` +
        `(limit ${fmtValue(thresholdValue, unit)}; ${n} samples over ${fmtDuration(cfg.windowMs)}).`,
      kind: 'ewma-mean',
    };
  } else {
    const thresholdSd = Math.sqrt(varianceLimit);
    candidate = {
      id: `ewma:${seriesId}`,
      seriesId,
      detector: 'ewma',
      severity: clamp01((ratio - 1) / 2),
      score: sd / sigma0,
      ratio,
      startedAt: varSince ?? last.t,
      updatedAt: ctx.now,
      evidence: {
        baseline: sigma0,
        observed: sd,
        threshold: thresholdSd,
        window: cfg.windowMs,
        sampleSize: n,
      },
      summary:
        `${label} has become more volatile: recent spread ${fmtValue(sd, unit)} against a ` +
        `reference spread of ${fmtValue(sigma0, unit)} (fires past ${fmtValue(thresholdSd, unit)}; ` +
        `${n} samples over ${fmtDuration(cfg.windowMs)}).`,
      kind: 'ewma-variance',
    };
  }
  const d = ctx.descriptor;
  if (d && typeof d.lat === 'number' && typeof d.lon === 'number') {
    candidate.location = { lat: d.lat, lon: d.lon };
  }
  return candidate;
}
