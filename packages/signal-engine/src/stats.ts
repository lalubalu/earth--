/* Programmer: Lalith Satheesh / Date: 09/05/2026 */

export function isFiniteNumber(x: unknown): x is number {
  return typeof x === 'number' && Number.isFinite(x);
}

export function clamp01(x: number): number {
  if (Number.isNaN(x)) return 0;
  return x < 0 ? 0 : x > 1 ? 1 : x;
}

export function mean(xs: readonly number[]): number {
  if (xs.length === 0) return NaN;
  let sum = 0;
  for (const x of xs) sum += x;
  return sum / xs.length;
}

/** Sample variance (n - 1). */
export function variance(xs: readonly number[], center = mean(xs)): number {
  if (xs.length < 2) return NaN;
  let sum = 0;
  for (const x of xs) sum += (x - center) * (x - center);
  return sum / (xs.length - 1);
}

export function median(xs: readonly number[]): number {
  if (xs.length === 0) return NaN;
  const sorted = [...xs].sort((a, b) => a - b);
  const mid = sorted.length >> 1;
  return sorted.length % 2 === 1
    ? (sorted[mid] as number)
    : ((sorted[mid - 1] as number) + (sorted[mid] as number)) / 2;
}

/** Median absolute deviation, unscaled. */
export function mad(xs: readonly number[], center = median(xs)): number {
  if (xs.length === 0) return NaN;
  return median(xs.map((x) => Math.abs(x - center)));
}

export function meanAbsDev(xs: readonly number[], center: number): number {
  if (xs.length === 0) return NaN;
  let sum = 0;
  for (const x of xs) sum += Math.abs(x - center);
  return sum / xs.length;
}

/** MAD to sigma for a normal distribution. */
export const MAD_SCALE = 1.4826;
/** Mean absolute deviation to sigma for a normal distribution. */
export const MEAN_ABS_SCALE = 1.2533;

export interface RobustScale {
  center: number;
  sigma: number;
  method: 'mad' | 'mean-abs' | 'floor' | 'none';
}

/**
 * Median plus a sigma-equivalent spread. Falls back from MAD to mean absolute deviation
 * when more than half the samples share one value, then to `floor`. `sigma` is 0 when no
 * spread can be estimated at all; callers must treat that as "cannot score".
 */
export function robustScale(xs: readonly number[], floor = 0): RobustScale {
  const center = median(xs);
  const scaledMad = mad(xs, center) * MAD_SCALE;
  if (scaledMad > 0) return { center, sigma: Math.max(scaledMad, floor), method: 'mad' };
  const scaledMean = meanAbsDev(xs, center) * MEAN_ABS_SCALE;
  if (scaledMean > 0) return { center, sigma: Math.max(scaledMean, floor), method: 'mean-abs' };
  if (floor > 0) return { center, sigma: floor, method: 'floor' };
  return { center, sigma: 0, method: 'none' };
}

/**
 * Anscombe variance-stabilised Poisson z-score. Behaves like a standard normal for
 * lambda above ~2 and stays finite at lambda = 0, unlike (k - lambda) / sqrt(lambda).
 */
export function poissonZ(observed: number, expected: number): number {
  return 2 * (Math.sqrt(observed + 3 / 8) - Math.sqrt(Math.max(expected, 0) + 3 / 8));
}

/** Smallest integer count whose poissonZ reaches `z` for the given expectation. */
export function poissonRequiredCount(expected: number, z: number): number {
  const root = z / 2 + Math.sqrt(Math.max(expected, 0) + 3 / 8);
  return Math.max(0, Math.ceil(root * root - 3 / 8 - 1e-9));
}
