/**
 * In-memory sliding-window rate limiter for login attempts.
 *
 * Real protection against brute-forcing the one account this app has, for
 * the current single-process deployment model (`next start` / a single
 * serverless-but-warm instance). LIMITATION, documented rather than
 * hidden: this state is per-process. A horizontally-scaled deployment
 * (multiple serverless instances, multiple containers behind a load
 * balancer) would need a shared store (Redis, or a DB-backed attempt log)
 * for this to work across instances — see docs/DEPLOYMENT.md.
 */

const MAX_ATTEMPTS = 5;
const WINDOW_MS = 15 * 60 * 1000; // 15 minutes

interface AttemptRecord {
  count: number;
  windowStart: number;
}

const attempts = new Map<string, AttemptRecord>();

function normalizeKey(email: string): string {
  return email.toLowerCase().trim();
}

export function isRateLimited(email: string): boolean {
  const record = attempts.get(normalizeKey(email));
  if (!record) return false;
  if (Date.now() - record.windowStart > WINDOW_MS) {
    attempts.delete(normalizeKey(email));
    return false;
  }
  return record.count >= MAX_ATTEMPTS;
}

export function recordFailedAttempt(email: string): void {
  const key = normalizeKey(email);
  const record = attempts.get(key);
  const now = Date.now();
  if (!record || now - record.windowStart > WINDOW_MS) {
    attempts.set(key, { count: 1, windowStart: now });
  } else {
    record.count += 1;
  }
}

export function clearAttempts(email: string): void {
  attempts.delete(normalizeKey(email));
}
