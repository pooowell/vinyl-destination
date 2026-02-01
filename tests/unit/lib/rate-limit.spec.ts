import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { RateLimiter, getClientIp, applyRateLimit } from "@/lib/rate-limit";

// ---------------------------------------------------------------------------
// RateLimiter class
// ---------------------------------------------------------------------------
describe("RateLimiter", () => {
  let limiter: RateLimiter;

  beforeEach(() => {
    vi.useFakeTimers();
    limiter = new RateLimiter(3, 60_000); // 3 req / 60 s for easy testing
  });

  afterEach(() => {
    limiter.destroy();
    vi.useRealTimers();
  });

  it("allows requests under the limit", () => {
    const r1 = limiter.check("ip1");
    expect(r1.allowed).toBe(true);
    expect(r1.remaining).toBe(2);

    const r2 = limiter.check("ip1");
    expect(r2.allowed).toBe(true);
    expect(r2.remaining).toBe(1);

    const r3 = limiter.check("ip1");
    expect(r3.allowed).toBe(true);
    expect(r3.remaining).toBe(0);
  });

  it("blocks requests over the limit", () => {
    limiter.check("ip1");
    limiter.check("ip1");
    limiter.check("ip1");

    const r4 = limiter.check("ip1");
    expect(r4.allowed).toBe(false);
    expect(r4.remaining).toBe(0);
    expect(r4.resetMs).toBeGreaterThan(0);
  });

  it("tracks keys independently", () => {
    limiter.check("ip1");
    limiter.check("ip1");
    limiter.check("ip1");

    // ip1 is blocked
    expect(limiter.check("ip1").allowed).toBe(false);

    // ip2 is still fine
    const r = limiter.check("ip2");
    expect(r.allowed).toBe(true);
    expect(r.remaining).toBe(2);
  });

  it("allows requests again after the window expires", () => {
    limiter.check("ip1");
    limiter.check("ip1");
    limiter.check("ip1");
    expect(limiter.check("ip1").allowed).toBe(false);

    // Advance time past the window
    vi.advanceTimersByTime(60_001);

    const r = limiter.check("ip1");
    expect(r.allowed).toBe(true);
    expect(r.remaining).toBe(2);
  });

  it("implements sliding window (partial expiry)", () => {
    // t=0: request 1
    limiter.check("ip1");

    // t=30s: requests 2 & 3
    vi.advanceTimersByTime(30_000);
    limiter.check("ip1");
    limiter.check("ip1");

    // All 3 used – should be blocked
    expect(limiter.check("ip1").allowed).toBe(false);

    // t=60.001s: request 1 expired, but 2 & 3 still within window
    vi.advanceTimersByTime(30_001);
    const r = limiter.check("ip1");
    expect(r.allowed).toBe(true);
    // After request 1 expired, 2 old remain in window + this new one = 3 total, remaining = 0
    expect(r.remaining).toBe(0);
  });

  it("returns correct resetMs when blocked", () => {
    // t=0: fill the window
    limiter.check("ip1");
    limiter.check("ip1");
    limiter.check("ip1");

    // t=10s: try again
    vi.advanceTimersByTime(10_000);
    const r = limiter.check("ip1");
    expect(r.allowed).toBe(false);
    // oldest request was at t=0, so it expires at t=60s. We're at t=10s → 50s left
    expect(r.resetMs).toBe(50_000);
  });

  it("returns correct resetMs when allowed", () => {
    // First request: resetMs should be ~60s (the full window from now)
    const r = limiter.check("ip1");
    expect(r.allowed).toBe(true);
    expect(r.resetMs).toBe(60_000);
  });

  describe("cleanup()", () => {
    it("removes keys with all-expired timestamps", () => {
      limiter.check("ip1");
      limiter.check("ip2");

      vi.advanceTimersByTime(60_001);
      limiter.cleanup();

      // After cleanup, both should be allowed the full quota again
      const r1 = limiter.check("ip1");
      expect(r1.allowed).toBe(true);
      expect(r1.remaining).toBe(2);
    });

    it("keeps keys with active timestamps", () => {
      limiter.check("ip1");
      limiter.check("ip1");
      limiter.check("ip1");

      vi.advanceTimersByTime(30_000);
      limiter.cleanup();

      // Still within window – should be blocked
      expect(limiter.check("ip1").allowed).toBe(false);
    });
  });

  describe("reset()", () => {
    it("clears all tracked data", () => {
      limiter.check("ip1");
      limiter.check("ip1");
      limiter.check("ip1");
      expect(limiter.check("ip1").allowed).toBe(false);

      limiter.reset();

      const r = limiter.check("ip1");
      expect(r.allowed).toBe(true);
      expect(r.remaining).toBe(2);
    });
  });

  describe("constructor", () => {
    it("stores maxRequests and windowMs", () => {
      const l = new RateLimiter(100, 30_000);
      expect(l.maxRequests).toBe(100);
      expect(l.windowMs).toBe(30_000);
      l.destroy();
    });
  });
});

// ---------------------------------------------------------------------------
// getClientIp
// ---------------------------------------------------------------------------
describe("getClientIp", () => {
  const makeReq = (headers: Record<string, string>): Request =>
    new Request("http://localhost/api/test", { headers });

  it("extracts IP from x-forwarded-for (single)", () => {
    expect(getClientIp(makeReq({ "x-forwarded-for": "1.2.3.4" }))).toBe("1.2.3.4");
  });

  it("extracts first IP from x-forwarded-for (chain)", () => {
    expect(getClientIp(makeReq({ "x-forwarded-for": "1.2.3.4, 10.0.0.1, 192.168.1.1" }))).toBe("1.2.3.4");
  });

  it("trims whitespace in x-forwarded-for", () => {
    expect(getClientIp(makeReq({ "x-forwarded-for": "  1.2.3.4 " }))).toBe("1.2.3.4");
  });

  it("falls back to x-real-ip", () => {
    expect(getClientIp(makeReq({ "x-real-ip": "5.6.7.8" }))).toBe("5.6.7.8");
  });

  it("trims x-real-ip", () => {
    expect(getClientIp(makeReq({ "x-real-ip": " 5.6.7.8 " }))).toBe("5.6.7.8");
  });

  it("prefers x-forwarded-for over x-real-ip", () => {
    expect(
      getClientIp(makeReq({ "x-forwarded-for": "1.2.3.4", "x-real-ip": "5.6.7.8" }))
    ).toBe("1.2.3.4");
  });

  it("returns 'unknown' when no IP headers present", () => {
    expect(getClientIp(makeReq({}))).toBe("unknown");
  });
});

// ---------------------------------------------------------------------------
// applyRateLimit
// ---------------------------------------------------------------------------
describe("applyRateLimit", () => {
  let limiter: RateLimiter;

  beforeEach(() => {
    vi.useFakeTimers();
    limiter = new RateLimiter(2, 60_000);
  });

  afterEach(() => {
    limiter.destroy();
    vi.useRealTimers();
  });

  const makeReq = (ip: string): Request =>
    new Request("http://localhost/api/test", {
      headers: { "x-forwarded-for": ip },
    });

  it("returns null when under the limit", () => {
    const result = applyRateLimit(makeReq("1.2.3.4"), limiter);
    expect(result).toBeNull();
  });

  it("returns a 429 response when limit exceeded", async () => {
    applyRateLimit(makeReq("1.2.3.4"), limiter);
    applyRateLimit(makeReq("1.2.3.4"), limiter);
    const result = applyRateLimit(makeReq("1.2.3.4"), limiter);

    expect(result).not.toBeNull();
    expect(result!.status).toBe(429);

    const body = await result!.json();
    expect(body.error).toContain("Too many requests");
  });

  it("sets Retry-After header on 429", () => {
    applyRateLimit(makeReq("1.2.3.4"), limiter);
    applyRateLimit(makeReq("1.2.3.4"), limiter);
    const result = applyRateLimit(makeReq("1.2.3.4"), limiter);

    expect(result!.headers.get("Retry-After")).toBeDefined();
    const retryAfter = Number(result!.headers.get("Retry-After"));
    expect(retryAfter).toBeGreaterThan(0);
    expect(retryAfter).toBeLessThanOrEqual(60);
  });

  it("sets X-RateLimit-* headers on 429", () => {
    applyRateLimit(makeReq("1.2.3.4"), limiter);
    applyRateLimit(makeReq("1.2.3.4"), limiter);
    const result = applyRateLimit(makeReq("1.2.3.4"), limiter);

    expect(result!.headers.get("X-RateLimit-Limit")).toBe("2");
    expect(result!.headers.get("X-RateLimit-Remaining")).toBe("0");
    expect(result!.headers.get("X-RateLimit-Reset")).toBeDefined();
  });

  it("does not block different IPs", () => {
    applyRateLimit(makeReq("1.2.3.4"), limiter);
    applyRateLimit(makeReq("1.2.3.4"), limiter);

    // ip1 is exhausted
    expect(applyRateLimit(makeReq("1.2.3.4"), limiter)).not.toBeNull();

    // ip2 is fine
    expect(applyRateLimit(makeReq("5.6.7.8"), limiter)).toBeNull();
  });

  it("allows requests again after window expires", () => {
    applyRateLimit(makeReq("1.2.3.4"), limiter);
    applyRateLimit(makeReq("1.2.3.4"), limiter);
    expect(applyRateLimit(makeReq("1.2.3.4"), limiter)).not.toBeNull();

    vi.advanceTimersByTime(60_001);

    expect(applyRateLimit(makeReq("1.2.3.4"), limiter)).toBeNull();
  });
});
