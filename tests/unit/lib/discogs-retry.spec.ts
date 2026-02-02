import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

// Use vi.hoisted so the mock fn is available in the vi.mock factory
const { mockFetch } = vi.hoisted(() => ({
  mockFetch: vi.fn(),
}));

global.fetch = mockFetch;

vi.mock("@/lib/db", () => ({
  getCachedVinylStatus: vi.fn().mockResolvedValue(null),
  setCachedVinylStatus: vi.fn().mockResolvedValue(undefined),
  getBulkCachedVinylStatus: vi.fn().mockResolvedValue(new Map()),
}));

import { searchVinylRelease, retryDefaults } from "@/lib/discogs";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Minimal mock Response for a successful Discogs search. */
const ok200 = (results: unknown[] = []) => ({
  ok: true,
  status: 200,
  json: () => Promise.resolve({ results }),
});

/** Minimal mock 429 response. */
const err429 = (retryAfter?: string) => ({
  ok: false,
  status: 429,
  headers: {
    get: (h: string) => (h === "Retry-After" ? (retryAfter ?? null) : null),
  },
});

/** Minimal mock 5xx response. */
const err5xx = (status = 500) => ({
  ok: false,
  status,
  text: () => Promise.resolve("Server error"),
});

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe("fetchWithRetry (via discogsFetch)", () => {
  let warnSpy: ReturnType<typeof vi.spyOn>;
  const savedBaseDelay = retryDefaults.baseDelayMs;
  const savedMaxRetries = retryDefaults.maxRetries;

  beforeEach(() => {
    vi.clearAllMocks();
    retryDefaults.baseDelayMs = 0; // instant retries for test speed
    retryDefaults.maxRetries = 3;
    warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});
  });

  afterEach(() => {
    warnSpy.mockRestore();
    retryDefaults.baseDelayMs = savedBaseDelay;
    retryDefaults.maxRetries = savedMaxRetries;
  });

  // -- 429 retry then success --

  it("should retry once on 429 then succeed on next attempt", async () => {
    mockFetch
      .mockResolvedValueOnce(err429())
      .mockResolvedValueOnce(ok200([{ id: 1 }]));

    const result = await searchVinylRelease("Retry429Ok1", "Album1");

    expect(mockFetch).toHaveBeenCalledTimes(2);
    expect(warnSpy).toHaveBeenCalledTimes(1);
    expect(warnSpy).toHaveBeenCalledWith(expect.stringContaining("429"));
    expect(result).toEqual([{ id: 1 }]);
  });

  // -- 5xx retry then success --

  it("should retry once on 500 then succeed on next attempt", async () => {
    mockFetch
      .mockResolvedValueOnce(err5xx(500))
      .mockResolvedValueOnce(ok200([{ id: 2 }]));

    const result = await searchVinylRelease("Retry500Ok1", "Album2");

    expect(mockFetch).toHaveBeenCalledTimes(2);
    expect(warnSpy).toHaveBeenCalledTimes(1);
    expect(warnSpy).toHaveBeenCalledWith(expect.stringContaining("500"));
    expect(result).toEqual([{ id: 2 }]);
  });

  it("should retry on 502 and 503 as well", async () => {
    mockFetch
      .mockResolvedValueOnce(err5xx(502))
      .mockResolvedValueOnce(err5xx(503))
      .mockResolvedValueOnce(ok200([{ id: 3 }]));

    const result = await searchVinylRelease("Retry502503", "Album3");

    expect(mockFetch).toHaveBeenCalledTimes(3);
    expect(warnSpy).toHaveBeenCalledTimes(2);
    expect(result).toEqual([{ id: 3 }]);
  });

  // -- Exhaust retries --

  it("should throw after exhausting retries on persistent 429", async () => {
    const r = err429();
    mockFetch
      .mockResolvedValueOnce(r)
      .mockResolvedValueOnce(r)
      .mockResolvedValueOnce(r)
      .mockResolvedValueOnce(r);

    await expect(
      searchVinylRelease("PersistentRateLimit", "Album4"),
    ).rejects.toThrow("rate limit");

    // 1 initial + 3 retries = 4 total calls
    expect(mockFetch).toHaveBeenCalledTimes(4);
    // 3 warning logs (one per retry, not for the final attempt)
    expect(warnSpy).toHaveBeenCalledTimes(3);
  });

  it("should throw after exhausting retries on persistent 500", async () => {
    const r = err5xx();
    mockFetch
      .mockResolvedValueOnce(r)
      .mockResolvedValueOnce(r)
      .mockResolvedValueOnce(r)
      .mockResolvedValueOnce(r);

    await expect(
      searchVinylRelease("PersistentServerErr", "Album5"),
    ).rejects.toThrow("Discogs API error");

    expect(mockFetch).toHaveBeenCalledTimes(4);
    expect(warnSpy).toHaveBeenCalledTimes(3);
  });

  // -- Exponential backoff --

  it("should use exponential backoff delays", async () => {
    retryDefaults.baseDelayMs = 100;

    const r = err429();
    mockFetch
      .mockResolvedValueOnce(r)
      .mockResolvedValueOnce(r)
      .mockResolvedValueOnce(r)
      .mockResolvedValueOnce(r);

    await expect(
      searchVinylRelease("BackoffTest", "Album6"),
    ).rejects.toThrow("rate limit");

    expect(warnSpy).toHaveBeenCalledTimes(3);
    // 100 * 2^0 = 100, 100 * 2^1 = 200, 100 * 2^2 = 400
    expect(warnSpy).toHaveBeenNthCalledWith(
      1,
      expect.stringContaining("100ms"),
    );
    expect(warnSpy).toHaveBeenNthCalledWith(
      2,
      expect.stringContaining("200ms"),
    );
    expect(warnSpy).toHaveBeenNthCalledWith(
      3,
      expect.stringContaining("400ms"),
    );
  });

  // -- Retry-After header --

  it("should respect Retry-After header on 429", async () => {
    retryDefaults.baseDelayMs = 50;

    // Retry-After: 1 → 1000 ms, which is > base delay of 50
    mockFetch
      .mockResolvedValueOnce(err429("1"))
      .mockResolvedValueOnce(ok200([]));

    await searchVinylRelease("RetryAfterTest", "Album7");

    expect(warnSpy).toHaveBeenCalledTimes(1);
    // delay = max(50 * 2^0, 1 * 1000) = max(50, 1000) = 1000
    expect(warnSpy).toHaveBeenCalledWith(expect.stringContaining("1000ms"));
  });

  // -- Configurable maxRetries --

  it("should respect custom maxRetries", async () => {
    retryDefaults.maxRetries = 1;

    const r = err429();
    mockFetch.mockResolvedValueOnce(r).mockResolvedValueOnce(r);

    await expect(
      searchVinylRelease("MaxRetries1", "Album8"),
    ).rejects.toThrow("rate limit");

    // 1 initial + 1 retry = 2 total
    expect(mockFetch).toHaveBeenCalledTimes(2);
    expect(warnSpy).toHaveBeenCalledTimes(1);
  });

  // -- Non-retryable errors pass through immediately --

  it("should NOT retry on 401 (non-retryable)", async () => {
    mockFetch.mockResolvedValueOnce({
      ok: false,
      status: 401,
      text: () => Promise.resolve("Unauthorized"),
    });

    await expect(
      searchVinylRelease("NoRetry401", "Album9"),
    ).rejects.toThrow("Discogs API error");

    expect(mockFetch).toHaveBeenCalledTimes(1);
    expect(warnSpy).not.toHaveBeenCalled();
  });

  it("should NOT retry on 404 (non-retryable)", async () => {
    mockFetch.mockResolvedValueOnce({
      ok: false,
      status: 404,
      text: () => Promise.resolve("Not found"),
    });

    await expect(
      searchVinylRelease("NoRetry404", "Album10"),
    ).rejects.toThrow("Discogs API error");

    expect(mockFetch).toHaveBeenCalledTimes(1);
    expect(warnSpy).not.toHaveBeenCalled();
  });
});
