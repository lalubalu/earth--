/* Programmer: Lalith Satheesh / Date: 09/05/2026 */

interface Bucket {
  stamps: number[];
}

// Per server instance; on Vercel that is per warm lambda, which is enough to stop one
// browser from hammering the model without adding a datastore to a keyless demo.
const buckets = new Map<string, Bucket>();
const SWEEP_EVERY = 500;
let calls = 0;

export function clientIp(req: Request): string {
  const forwarded = req.headers.get('x-forwarded-for');
  if (forwarded) return forwarded.split(',')[0]!.trim();
  return req.headers.get('x-real-ip') ?? 'local';
}

export interface RateLimitResult {
  ok: boolean;
  remaining: number;
  retryAfterSeconds: number;
}

export function rateLimit(
  key: string,
  limit: number,
  windowMs: number,
  now = Date.now(),
): RateLimitResult {
  if (++calls % SWEEP_EVERY === 0) sweep(now, windowMs);
  const bucket = buckets.get(key) ?? { stamps: [] };
  bucket.stamps = bucket.stamps.filter((t) => now - t < windowMs);
  if (bucket.stamps.length >= limit) {
    const oldest = bucket.stamps[0] ?? now;
    buckets.set(key, bucket);
    return {
      ok: false,
      remaining: 0,
      retryAfterSeconds: Math.ceil((oldest + windowMs - now) / 1000),
    };
  }
  bucket.stamps.push(now);
  buckets.set(key, bucket);
  return { ok: true, remaining: limit - bucket.stamps.length, retryAfterSeconds: 0 };
}

function sweep(now: number, windowMs: number): void {
  for (const [key, bucket] of buckets) {
    if (bucket.stamps.every((t) => now - t >= windowMs)) buckets.delete(key);
  }
}

/** Test hook. */
export function resetRateLimits(): void {
  buckets.clear();
}
