import { describe, it, expect, vi, beforeEach } from "vitest";

// Use vi.hoisted to define mocks that can be used in vi.mock factory
const {
  mockFetch,
  mockGetCachedVinylStatus,
  mockSetCachedVinylStatus,
  mockGetBulkCachedVinylStatus,
} = vi.hoisted(() => ({
  mockFetch: vi.fn(),
  mockGetCachedVinylStatus: vi.fn(),
  mockSetCachedVinylStatus: vi.fn(),
  mockGetBulkCachedVinylStatus: vi.fn(),
}));

// Set global fetch
global.fetch = mockFetch;

vi.mock("@/lib/db", () => ({
  getCachedVinylStatus: mockGetCachedVinylStatus,
  setCachedVinylStatus: mockSetCachedVinylStatus,
  getBulkCachedVinylStatus: mockGetBulkCachedVinylStatus,
}));

import {
  searchVinylRelease,
  checkVinylAvailability,
  batchCheckVinylAvailability,
} from "@/lib/discogs";

describe("discogs - Search Operations", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe("searchVinylRelease", () => {
    it("should search for vinyl releases successfully", async () => {
      const mockResults = [
        { id: 1, title: "Artist - Album", format: ["Vinyl"], uri: "/release/1" },
        { id: 2, title: "Artist - Album (Reissue)", format: ["Vinyl"], uri: "/release/2" },
      ];

      mockFetch.mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: () => Promise.resolve({ results: mockResults }),
      });

      const result = await searchVinylRelease("Artist", "Album");

      expect(mockFetch).toHaveBeenCalledWith(
        expect.stringContaining("api.discogs.com/database/search"),
        expect.objectContaining({
          headers: expect.objectContaining({
            Authorization: expect.stringContaining("Discogs token="),
          }),
        })
      );
      expect(mockFetch).toHaveBeenCalledWith(
        expect.stringContaining("format=Vinyl"),
        expect.any(Object)
      );
      expect(result).toEqual(mockResults);
    });

    it("should throw on rate limit (429)", async () => {
      mockFetch.mockResolvedValueOnce({
        ok: false,
        status: 429,
      });

      // Use unique artist/album to avoid in-memory cache from previous test
      await expect(searchVinylRelease("RateLimitArtist", "RateLimitAlbum")).rejects.toThrow(
        "rate limit"
      );
    });

    it("should throw on API error", async () => {
      mockFetch.mockResolvedValueOnce({
        ok: false,
        status: 500,
        text: () => Promise.resolve("Server error"),
      });

      // Use unique artist/album to avoid in-memory cache from previous tests
      await expect(searchVinylRelease("ErrorArtist", "ErrorAlbum")).rejects.toThrow(
        "Discogs API error"
      );
    });
  });
});

describe("discogs - Vinyl Availability", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe("checkVinylAvailability", () => {
    it("should return cached result when available", async () => {
      mockGetCachedVinylStatus.mockResolvedValue({
        hasVinyl: true,
        discogsUrl: "https://discogs.com/release/123",
      });

      // Use unique artist/album to avoid in-memory cache
      const result = await checkVinylAvailability("CachedArtist", "CachedAlbum");

      expect(mockGetCachedVinylStatus).toHaveBeenCalledWith("CachedArtist", "CachedAlbum");
      expect(mockFetch).not.toHaveBeenCalled();
      expect(result).toEqual({
        available: true,
        discogsUrl: "https://discogs.com/release/123",
      });
    });

    it("should search Discogs when not cached and cache the result", async () => {
      mockGetCachedVinylStatus.mockResolvedValue(null);
      mockSetCachedVinylStatus.mockResolvedValue(undefined);

      const mockResults = [{ id: 1, uri: "/release/456" }];

      mockFetch.mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: () => Promise.resolve({ results: mockResults }),
      });

      // Use unique artist/album to avoid in-memory cache from previous tests
      const result = await checkVinylAvailability("UncachedArtist", "UncachedAlbum");

      expect(mockGetCachedVinylStatus).toHaveBeenCalled();
      expect(mockFetch).toHaveBeenCalled();
      expect(mockSetCachedVinylStatus).toHaveBeenCalled();
      expect(result.available).toBe(true);
      expect(result.discogsUrl).toContain("discogs.com");
    });
  });

  describe("batchCheckVinylAvailability", () => {
    it("should use cached results when available", async () => {
      const albums = [
        { artist: "Artist1", album: "Album1", albumId: "id1" },
      ];

      // Album is cached
      mockGetBulkCachedVinylStatus.mockResolvedValue(
        new Map([
          ["artist1|album1", { hasVinyl: true, discogsUrl: "https://discogs.com/1" }],
        ])
      );

      const result = await batchCheckVinylAvailability(albums);

      expect(mockGetBulkCachedVinylStatus).toHaveBeenCalled();
      expect(result.get("id1")).toEqual({
        available: true,
        discogsUrl: "https://discogs.com/1",
      });
    });

    it("should handle empty album list", async () => {
      mockGetBulkCachedVinylStatus.mockResolvedValue(new Map());

      const result = await batchCheckVinylAvailability([]);

      expect(result.size).toBe(0);
    });
  });
});
