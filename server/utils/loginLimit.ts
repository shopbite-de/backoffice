import type { H3Event } from "h3";

/**
 * Brute-force guard for the password login (#5). Failed attempts are counted per user name and
 * per IP in memory (one backoffice container per restaurant, a restart forgets them). The IP
 * limit is higher: a whole kitchen shares one IP, one person's typos must not lock out the rest.
 */
export const LIMITS = { user: 5, ip: 20 } as const;
export const WINDOW_MS = 15 * 60 * 1000;
const MAX_KEYS = 10_000;

export class LoginLimiter {
  private failures = new Map<string, number[]>();

  constructor(private readonly now: () => number = Date.now) {}

  /** Seconds until the next attempt is allowed, 0 = go ahead. */
  retryAfter(keys: { key: string; limit: number }[]): number {
    const now = this.now();
    let wait = 0;
    for (const { key, limit } of keys) {
      const recent = this.recent(key, now);
      if (recent.length >= limit) wait = Math.max(wait, recent[recent.length - limit]! + WINDOW_MS - now);
    }
    return Math.ceil(wait / 1000);
  }

  fail(keys: string[]) {
    const now = this.now();
    if (this.failures.size > MAX_KEYS) this.prune(now);
    for (const key of keys) this.failures.set(key, [...this.recent(key, now), now]);
  }

  reset(keys: string[]) {
    for (const key of keys) this.failures.delete(key);
  }

  private recent(key: string, now: number) {
    return (this.failures.get(key) ?? []).filter((at) => now - at < WINDOW_MS);
  }

  private prune(now: number) {
    for (const key of [...this.failures.keys()]) {
      if (!this.recent(key, now).length) this.failures.delete(key);
    }
  }
}

const limiter = new LoginLimiter();

/** The keys of one login attempt. Behind the reverse proxy the client IP is in X-Forwarded-For. */
export function loginKeys(event: H3Event, username: string) {
  const ip = getRequestIP(event, { xForwardedFor: true }) ?? "unknown";
  return [
    { key: `user:${username.trim().toLowerCase()}`, limit: LIMITS.user },
    { key: `ip:${ip}`, limit: LIMITS.ip },
  ];
}

/** Throws 429 before Shopware is asked when too many attempts failed. */
export function assertLoginAllowed(event: H3Event, keys: ReturnType<typeof loginKeys>) {
  const seconds = limiter.retryAfter(keys);
  if (!seconds) return;
  setResponseHeader(event, "Retry-After", seconds);
  const minutes = Math.ceil(seconds / 60);
  throw createError({
    statusCode: 429,
    statusMessage: `Zu viele Fehlversuche. Bitte in ${minutes === 1 ? "einer Minute" : `${minutes} Minuten`} erneut versuchen.`,
  });
}

export const loginFailed = (keys: ReturnType<typeof loginKeys>) => limiter.fail(keys.map((k) => k.key));
export const loginSucceeded = (keys: ReturnType<typeof loginKeys>) => limiter.reset(keys.map((k) => k.key));
