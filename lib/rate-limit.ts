import { NextRequest, NextResponse } from "next/server";

export interface RateLimitResult {
  allowed: boolean;
  remaining: number;
  resetMs: number;
}

/**
 * In-memory sliding window rate limiter.
 *
 * Tracks request timestamps per key (typically client IP) within a
 * configurable time window. Expired entries are cleaned up automatically
 * on every `check()` call and periodically via a background sweep.
 */
export class RateLimiter {
  private windows: Map<string, number[]> = new Map();
  private cleanupTimer: ReturnType<typeof setInterval> | null = null;

  constructor(
    /** Maximum requests allowed within the window. */
    public readonly maxRequests: number,
    /** Window size in milliseconds. */
    public readonly windowMs: number
  ) {
    // Background sweep every 60 s to evict stale keys
    this.cleanupTimer = setInterval(() => this.cleanup(), 60_000);
    // Allow Node to exit without waiting for the timer
    if (this.cleanupTimer && typeof this.cleanupTimer === "object" && "unref" in this.cleanupTimer) {
      this.cleanupTimer.unref();
    }
  }

  /**
   * Check whether `key` is allowed to make a request right now.
   * Records the request if allowed.
   */
  check(key: string): RateLimitResult {
    const now = Date.now();
    const windowStart = now - this.windowMs;

    // Get existing timestamps and prune expired ones
    let timestamps = this.windows.get(key) ?? [];
    timestamps = timestamps.filter((t) => t > windowStart);

    if (timestamps.length >= this.maxRequests) {
      // Rate limited – compute when the oldest request in the window expires
      const oldestInWindow = timestamps[0];
      const resetMs = oldestInWindow + this.windowMs - now;
      this.windows.set(key, timestamps);
      return {
        allowed: false,
        remaining: 0,
        resetMs: Math.max(resetMs, 0),
      };
    }

    // Allowed – record this request
    timestamps.push(now);
    this.windows.set(key, timestamps);

    return {
      allowed: true,
      remaining: this.maxRequests - timestamps.length,
      resetMs: timestamps[0] + this.windowMs - now,
    };
  }

  /** Remove all entries whose timestamps are entirely expired. */
  cleanup(): void {
    const now = Date.now();
    const windowStart = now - this.windowMs;

    for (const [key, timestamps] of this.windows.entries()) {
      const active = timestamps.filter((t) => t > windowStart);
      if (active.length === 0) {
        this.windows.delete(key);
      } else {
        this.windows.set(key, active);
      }
    }
  }

  /** Tear down the background timer (useful in tests). */
  destroy(): void {
    if (this.cleanupTimer) {
      clearInterval(this.cleanupTimer);
      this.cleanupTimer = null;
    }
  }

  /** Reset all state (useful in tests). */
  reset(): void {
    this.windows.clear();
  }
}

// ---------------------------------------------------------------------------
// Pre-configured limiters (singletons – survive across requests in the same
// server process, which is exactly what we want for in-memory rate limiting).
// ---------------------------------------------------------------------------

/** General API routes – 60 req / min */
export const generalLimiter = new RateLimiter(60, 60_000);

/** Recommendation stream – expensive, 5 req / min */
export const streamLimiter = new RateLimiter(5, 60_000);

/** Auth endpoints – 10 req / min */
export const authLimiter = new RateLimiter(10, 60_000);

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/**
 * Extract the client IP from a Next.js request.
 * Checks x-forwarded-for, x-real-ip, then falls back to "unknown".
 */
export function getClientIp(request: NextRequest | Request): string {
  const headers = request.headers;

  const forwarded = headers.get("x-forwarded-for");
  if (forwarded) {
    // x-forwarded-for may contain a comma-separated list; first = client
    const first = forwarded.split(",")[0].trim();
    if (first) return first;
  }

  const realIp = headers.get("x-real-ip");
  if (realIp) return realIp.trim();

  return "unknown";
}

/**
 * Apply a rate limiter to a request. Returns a 429 Response if the client
 * has exceeded the limit, or `null` if the request is allowed.
 *
 * Usage in a route handler:
 * ```ts
 * const blocked = applyRateLimit(request, generalLimiter);
 * if (blocked) return blocked;
 * ```
 */
export function applyRateLimit(
  request: NextRequest | Request,
  limiter: RateLimiter
): NextResponse | null {
  const ip = getClientIp(request);
  const result = limiter.check(ip);

  if (!result.allowed) {
    const retryAfterSeconds = Math.ceil(result.resetMs / 1000);
    return NextResponse.json(
      { error: "Too many requests. Please try again later." },
      {
        status: 429,
        headers: {
          "Retry-After": String(retryAfterSeconds),
          "X-RateLimit-Limit": String(limiter.maxRequests),
          "X-RateLimit-Remaining": "0",
          "X-RateLimit-Reset": String(retryAfterSeconds),
        },
      }
    );
  }

  return null;
}
