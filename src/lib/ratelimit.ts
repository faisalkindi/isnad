// Simple in-memory sliding-window rate limiter, keyed by client IP.
// Resets on deploy — acceptable for v1; revisit if abused.

const WINDOW_MS = 10 * 60 * 1000; // 10 minutes
const MAX_REQUESTS = 20;

const hits = new Map<string, number[]>();

/** Returns true if this IP may proceed, false if it has hit the limit. */
export function checkRate(ip: string): boolean {
  const now = Date.now();
  const recent = (hits.get(ip) ?? []).filter((t) => now - t < WINDOW_MS);

  if (recent.length >= MAX_REQUESTS) {
    hits.set(ip, recent);
    return false;
  }

  recent.push(now);
  hits.set(ip, recent);
  return true;
}
