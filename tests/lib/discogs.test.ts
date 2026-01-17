import { describe, it, expect, vi, beforeEach } from "vitest";
import { http, HttpResponse } from "msw";
import { server } from "../mocks/server";

// Mock db functions to isolate Discogs API testing
const mockGetCachedVinylStatus = vi.fn();
const mockSetCachedVinylStatus = vi.fn();
const mockGetBulkCachedVinylStatus = vi.fn();

vi.mock("@/lib/db", () => ({
  getCachedVinylStatus: () => mockGetCachedVinylStatus(),
  setCachedVinylStatus: (...args: unknown[]) => mockSetCachedVinylStatus(...args),
  getBulkCachedVinylStatus: () => mockGetBulkCachedVinylStatus(),
}));

// Import after mocking
import {
  searchVinylRelease,
  checkVinylAvailability,
} from "@/lib/discogs";

describe("Discogs API Integration (MSW)", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockGetCachedVinylStatus.mockResolvedValue(null);
    mockSetCachedVinylStatus.mockResolvedValue(undefined);
    mockGetBulkCachedVinylStatus.mockResolvedValue(new Map());
  });

  describe("searchVinylRelease", () => {
    it("should search for vinyl releases via Discogs API", async () => {
      // Use unique query to avoid in-memory cache
      const results = await searchVinylRelease("MSW Test Artist", "MSW Test Album");

      expect(results).toHaveLength(2);
      expect(results[0].title).toBe("Test Artist - Test Album");
      expect(results[0].format).toContain("Vinyl");
      expect(results[0].uri).toBe("/release/12345");
    });

    it("should handle rate limiting (429 response)", async () => {
      // Use query that triggers rate limit in handler
      await expect(
        searchVinylRelease("rate_limit_test", "album")
      ).rejects.toThrow("rate limit");
    });

    it("should handle empty results", async () => {
      // Use query that returns no results in handler
      const results = await searchVinylRelease("no_results_test", "album");
      expect(results).toHaveLength(0);
    });

    it("should handle unauthorized requests", async () => {
      // Override handler to return 401
      server.use(
        http.get("https://api.discogs.com/database/search", () => {
          return HttpResponse.json(
            { message: "Unauthorized" },
            { status: 401 }
          );
        })
      );

      await expect(
        searchVinylRelease("Unauthorized Artist", "Album")
      ).rejects.toThrow("Discogs API error");
    });

    it("should handle server errors", async () => {
      server.use(
        http.get("https://api.discogs.com/database/search", () => {
          return HttpResponse.json(
            { message: "Internal Server Error" },
            { status: 500 }
          );
        })
      );

      await expect(
        searchVinylRelease("Server Error Artist", "Album")
      ).rejects.toThrow("Discogs API error");
    });
  });

  describe("checkVinylAvailability", () => {
    it("should return availability from Discogs when not cached", async () => {
      mockGetCachedVinylStatus.mockResolvedValue(null);

      const result = await checkVinylAvailability(
        "Check Availability Artist",
        "Check Availability Album"
      );

      expect(result.available).toBe(true);
      expect(result.discogsUrl).toContain("discogs.com");
      expect(result.discogsUrl).toContain("/release/");
      expect(mockSetCachedVinylStatus).toHaveBeenCalled();
    });

    it("should return cached result when available", async () => {
      mockGetCachedVinylStatus.mockResolvedValue({
        hasVinyl: true,
        discogsUrl: "https://www.discogs.com/release/cached-123",
      });

      const result = await checkVinylAvailability(
        "Cached Artist",
        "Cached Album"
      );

      expect(result.available).toBe(true);
      expect(result.discogsUrl).toBe("https://www.discogs.com/release/cached-123");
      // Should not call setCachedVinylStatus since we have a cache hit
      expect(mockSetCachedVinylStatus).not.toHaveBeenCalled();
    });

    it("should handle no vinyl available", async () => {
      mockGetCachedVinylStatus.mockResolvedValue(null);

      const result = await checkVinylAvailability(
        "no_results_test",
        "No Vinyl Album"
      );

      expect(result.available).toBe(false);
      expect(result.discogsUrl).toBeNull();
    });

    it("should handle API errors gracefully", async () => {
      mockGetCachedVinylStatus.mockResolvedValue(null);

      server.use(
        http.get("https://api.discogs.com/database/search", () => {
          return HttpResponse.json(
            { message: "Service Unavailable" },
            { status: 503 }
          );
        })
      );

      const result = await checkVinylAvailability(
        "Error Test Artist",
        "Error Test Album"
      );

      // Should return false on error (graceful degradation)
      expect(result.available).toBe(false);
      expect(result.discogsUrl).toBeNull();
    });
  });

  describe("request headers", () => {
    it("should include correct authorization header", async () => {
      let capturedHeaders: Headers | null = null;

      server.use(
        http.get("https://api.discogs.com/database/search", ({ request }) => {
          capturedHeaders = request.headers;
          return HttpResponse.json({
            pagination: { page: 1, pages: 1, per_page: 5, items: 0 },
            results: [],
          });
        })
      );

      await searchVinylRelease("Header Test Artist", "Header Test Album");

      expect(capturedHeaders?.get("Authorization")).toContain("Discogs token=");
    });

    it("should include user agent header", async () => {
      let capturedHeaders: Headers | null = null;

      server.use(
        http.get("https://api.discogs.com/database/search", ({ request }) => {
          capturedHeaders = request.headers;
          return HttpResponse.json({
            pagination: { page: 1, pages: 1, per_page: 5, items: 0 },
            results: [],
          });
        })
      );

      await searchVinylRelease("UA Test Artist", "UA Test Album");

      expect(capturedHeaders?.get("User-Agent")).toBe("SpotifyVinylSearch/1.0");
    });
  });
});
