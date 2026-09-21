/**
 * Simple in-memory sliding-window rate limiter.
 * Fine for a single-process lab deployment; swap for Redis in multi-instance deploys.
 */
type Bucket = { timestamps: number[] };

const buckets = new Map<string, Bucket>();

export function rateLimit(
  key: string,
  limit: number,
  windowMs: number
): { ok: boolean; remaining: number } {
  const now = Date.now();
  let bucket = buckets.get(key);
  if (!bucket) {
    bucket = { timestamps: [] };
    buckets.set(key, bucket);
  }
  bucket.timestamps = bucket.timestamps.filter((t) => now - t < windowMs);
  if (bucket.timestamps.length >= limit) {
    return { ok: false, remaining: 0 };
  }
  bucket.timestamps.push(now);
  return { ok: true, remaining: limit - bucket.timestamps.length };
}

export function clientKey(ip: string | null, suffix: string) {
  return `${ip ?? "unknown"}:${suffix}`;
}
