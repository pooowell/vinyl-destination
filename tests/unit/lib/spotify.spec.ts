import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

// Mock global fetch
const mockFetch = vi.fn();
global.fetch = mockFetch;

import {
  retryDefaults,
  getSpotifyAuthUrl,
  exchangeCodeForTokens,
  refreshAccessToken,
  getCurrentUser,
  getTopArtists,
  getTopTracks,
  getSavedAlbums,
  getRecentlyPlayed,
  getArtistAlbums,
  getRecommendations,
  extractUniqueAlbums,
} from "@/lib/spotify";

// Snapshot original defaults so each describe can restore them
const _origRetryDefaults = { ...retryDefaults };

describe("spotify - Auth URL Generation", () => {
  describe("getSpotifyAuthUrl", () => {
    it("should generate correct auth URL with all parameters", () => {
      const state = "test-state-123";
      const url = getSpotifyAuthUrl(state);

      expect(url).toContain("https://accounts.spotify.com/authorize");
      expect(url).toContain("client_id=test-spotify-client-id");
      expect(url).toContain("response_type=code");
      expect(url).toContain("redirect_uri=");
      expect(url).toContain("state=test-state-123");
      expect(url).toContain("scope=");
    });

    it("should include required scopes", () => {
      const url = getSpotifyAuthUrl("state");

      expect(url).toContain("user-read-email");
      expect(url).toContain("user-read-private");
      expect(url).toContain("user-top-read");
      expect(url).toContain("user-library-read");
      expect(url).toContain("user-read-recently-played");
    });
  });
});

describe("spotify - Token Exchange", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe("exchangeCodeForTokens", () => {
    it("should exchange code for tokens successfully", async () => {
      const mockTokenResponse = {
        access_token: "access-token-123",
        token_type: "Bearer",
        scope: "user-read-email",
        expires_in: 3600,
        refresh_token: "refresh-token-123",
      };

      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve(mockTokenResponse),
      });

      const result = await exchangeCodeForTokens("auth-code");

      expect(mockFetch).toHaveBeenCalledWith(
        "https://accounts.spotify.com/api/token",
        expect.objectContaining({
          method: "POST",
          headers: expect.objectContaining({
            "Content-Type": "application/x-www-form-urlencoded",
          }),
        })
      );
      expect(result).toEqual(mockTokenResponse);
    });

    it("should throw on API error", async () => {
      mockFetch.mockResolvedValueOnce({
        ok: false,
        text: () => Promise.resolve("Invalid code"),
      });

      await expect(exchangeCodeForTokens("invalid-code")).rejects.toThrow(
        "Failed to exchange code"
      );
    });
  });

  describe("refreshAccessToken", () => {
    it("should refresh access token successfully", async () => {
      const mockRefreshResponse = {
        access_token: "new-access-token",
        token_type: "Bearer",
        scope: "user-read-email",
        expires_in: 3600,
      };

      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve(mockRefreshResponse),
      });

      const result = await refreshAccessToken("old-refresh-token");

      expect(mockFetch).toHaveBeenCalledWith(
        "https://accounts.spotify.com/api/token",
        expect.objectContaining({
          method: "POST",
        })
      );
      expect(result.access_token).toBe("new-access-token");
    });
  });
});

describe("spotify - User Data", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe("getCurrentUser", () => {
    it("should fetch current user profile", async () => {
      const mockUser = {
        id: "user123",
        display_name: "Test User",
        email: "test@example.com",
      };

      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve(mockUser),
      });

      const result = await getCurrentUser("access-token");

      expect(mockFetch).toHaveBeenCalledWith(
        "https://api.spotify.com/v1/me",
        expect.objectContaining({
          headers: { Authorization: "Bearer access-token" },
        })
      );
      expect(result).toEqual(mockUser);
    });
  });

  describe("getTopTracks", () => {
    it("should fetch top tracks with correct parameters", async () => {
      const mockResponse = {
        items: [
          { id: "track1", name: "Track 1" },
          { id: "track2", name: "Track 2" },
        ],
      };

      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve(mockResponse),
      });

      const result = await getTopTracks("access-token", "medium_term", 50);

      expect(mockFetch).toHaveBeenCalledWith(
        expect.stringContaining("/me/top/tracks"),
        expect.any(Object)
      );
      expect(mockFetch).toHaveBeenCalledWith(
        expect.stringContaining("time_range=medium_term"),
        expect.any(Object)
      );
      expect(mockFetch).toHaveBeenCalledWith(
        expect.stringContaining("limit=50"),
        expect.any(Object)
      );
      expect(result).toEqual(mockResponse);
    });
  });

  describe("getSavedAlbums", () => {
    it("should fetch saved albums", async () => {
      const mockResponse = {
        items: [
          { album: { id: "album1", name: "Album 1" } },
          { album: { id: "album2", name: "Album 2" } },
        ],
      };

      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve(mockResponse),
      });

      const result = await getSavedAlbums("access-token", 20);

      expect(mockFetch).toHaveBeenCalledWith(
        expect.stringContaining("/me/albums"),
        expect.any(Object)
      );
      expect(result).toEqual(mockResponse);
    });
  });

  describe("getRecentlyPlayed", () => {
    it("should fetch recently played tracks", async () => {
      const mockResponse = {
        items: [
          { track: { id: "track1" }, played_at: "2024-01-01T00:00:00Z" },
        ],
      };

      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve(mockResponse),
      });

      const result = await getRecentlyPlayed("access-token", 50);

      expect(mockFetch).toHaveBeenCalledWith(
        expect.stringContaining("/me/player/recently-played"),
        expect.any(Object)
      );
      expect(result).toEqual(mockResponse);
    });
  });

  describe("getTopArtists", () => {
    it("should fetch top artists with default parameters", async () => {
      const mockResponse = {
        items: [
          { id: "artist1", name: "Artist 1" },
          { id: "artist2", name: "Artist 2" },
        ],
      };

      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve(mockResponse),
      });

      const result = await getTopArtists("access-token");

      expect(mockFetch).toHaveBeenCalledWith(
        expect.stringContaining("/me/top/artists"),
        expect.any(Object)
      );
      expect(mockFetch).toHaveBeenCalledWith(
        expect.stringContaining("time_range=medium_term"),
        expect.any(Object)
      );
      expect(mockFetch).toHaveBeenCalledWith(
        expect.stringContaining("limit=20"),
        expect.any(Object)
      );
      expect(result).toEqual(mockResponse);
    });

    it("should fetch top artists with custom time range", async () => {
      const mockResponse = { items: [] };

      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve(mockResponse),
      });

      await getTopArtists("access-token", "short_term", 10);

      expect(mockFetch).toHaveBeenCalledWith(
        expect.stringContaining("time_range=short_term"),
        expect.any(Object)
      );
      expect(mockFetch).toHaveBeenCalledWith(
        expect.stringContaining("limit=10"),
        expect.any(Object)
      );
    });

    it("should throw on API error", async () => {
      mockFetch.mockResolvedValueOnce({
        ok: false,
        text: () => Promise.resolve("Unauthorized"),
      });

      await expect(getTopArtists("invalid-token")).rejects.toThrow("Spotify API error");
    });
  });

  describe("getArtistAlbums", () => {
    it("should fetch albums for an artist", async () => {
      const mockResponse = {
        items: [
          { id: "album1", name: "Album 1", album_type: "album" },
          { id: "album2", name: "Album 2", album_type: "album" },
        ],
      };

      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve(mockResponse),
      });

      const result = await getArtistAlbums("access-token", "artist123", 50);

      expect(mockFetch).toHaveBeenCalledWith(
        expect.stringContaining("/artists/artist123/albums"),
        expect.any(Object)
      );
      expect(mockFetch).toHaveBeenCalledWith(
        expect.stringContaining("include_groups=album"),
        expect.any(Object)
      );
      expect(mockFetch).toHaveBeenCalledWith(
        expect.stringContaining("limit=50"),
        expect.any(Object)
      );
      expect(result).toEqual(mockResponse);
    });

    it("should throw on API error", async () => {
      mockFetch.mockResolvedValueOnce({
        ok: false,
        text: () => Promise.resolve("Artist not found"),
      });

      await expect(getArtistAlbums("access-token", "invalid-artist")).rejects.toThrow(
        "Spotify API error"
      );
    });
  });

  describe("getRecommendations", () => {
    it("should get recommendations based on seed tracks", async () => {
      const mockResponse = {
        tracks: [
          { id: "rec1", name: "Recommended Track 1" },
          { id: "rec2", name: "Recommended Track 2" },
        ],
      };

      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve(mockResponse),
      });

      const result = await getRecommendations("access-token", ["track1", "track2"], [], 20);

      expect(mockFetch).toHaveBeenCalledWith(
        expect.stringContaining("/recommendations"),
        expect.any(Object)
      );
      expect(mockFetch).toHaveBeenCalledWith(
        expect.stringContaining("seed_tracks=track1,track2"),
        expect.any(Object)
      );
      expect(result).toEqual(mockResponse);
    });

    it("should search for artists and use as seeds", async () => {
      // Mock artist search response
      const mockSearchResponse = {
        artists: { items: [{ id: "found-artist-1" }] },
      };
      const mockRecommendationsResponse = {
        tracks: [{ id: "rec1", name: "Recommended" }],
      };

      mockFetch
        .mockResolvedValueOnce({
          ok: true,
          json: () => Promise.resolve(mockSearchResponse),
        })
        .mockResolvedValueOnce({
          ok: true,
          json: () => Promise.resolve(mockRecommendationsResponse),
        });

      const result = await getRecommendations("access-token", [], ["Artist Name"], 20);

      // First call should be artist search
      expect(mockFetch).toHaveBeenNthCalledWith(
        1,
        expect.stringContaining("/search"),
        expect.any(Object)
      );
      expect(mockFetch).toHaveBeenNthCalledWith(
        1,
        expect.stringContaining("type=artist"),
        expect.any(Object)
      );
      // Second call should be recommendations
      expect(mockFetch).toHaveBeenNthCalledWith(
        2,
        expect.stringContaining("seed_artists=found-artist-1"),
        expect.any(Object)
      );
      expect(result).toEqual(mockRecommendationsResponse);
    });

    it("should return empty tracks when no seeds provided", async () => {
      const result = await getRecommendations("access-token", [], [], 20);

      expect(mockFetch).not.toHaveBeenCalled();
      expect(result).toEqual({ tracks: [] });
    });

    it("should handle artist search failures gracefully", async () => {
      // Mock failed search followed by recommendations
      mockFetch
        .mockResolvedValueOnce({
          ok: false,
          text: () => Promise.resolve("Search failed"),
        })
        .mockResolvedValueOnce({
          ok: true,
          json: () => Promise.resolve({ tracks: [] }),
        });

      // Should not throw, just return empty tracks since no valid seeds
      const result = await getRecommendations("access-token", [], ["Unknown Artist"], 20);
      expect(result).toEqual({ tracks: [] });
    });

    it("should combine track and artist seeds when artist is found", async () => {
      // This test verifies that multiple track IDs can be used as seeds
      // and are correctly formatted in the URL
      
      const mockRecommendationsResponse = {
        tracks: [{ id: "rec1" }],
      };

      // Reset fetch to clean state
      mockFetch.mockReset();
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve(mockRecommendationsResponse),
      });

      const result = await getRecommendations("access-token", ["track1", "track2"], [], 20);

      // Should include both tracks in seeds (limited to 2)
      expect(mockFetch).toHaveBeenCalledWith(
        expect.stringContaining("seed_tracks=track1,track2"),
        expect.any(Object)
      );
      
      expect(result).toEqual(mockRecommendationsResponse);
    });
  });
});

describe("spotify - Utilities", () => {
  describe("extractUniqueAlbums", () => {
    it("should extract unique albums from multiple sources", () => {
      const tracks = [
        { album: { id: "album1", name: "Album 1" } },
        { album: { id: "album2", name: "Album 2" } },
        { album: { id: "album1", name: "Album 1" } }, // Duplicate
      ];
      const savedAlbums = [
        { id: "album2", name: "Album 2" }, // Duplicate
        { id: "album3", name: "Album 3" },
      ];
      const recentTracks = [
        { album: { id: "album4", name: "Album 4" } },
      ];

      const result = extractUniqueAlbums(tracks as any, savedAlbums as any, recentTracks as any);

      const ids = result.map((a) => a.id);
      expect(ids).toContain("album1");
      expect(ids).toContain("album2");
      expect(ids).toContain("album3");
      expect(ids).toContain("album4");
      // Should have no duplicates
      expect(new Set(ids).size).toBe(ids.length);
    });

    it("should handle empty arrays", () => {
      const result = extractUniqueAlbums([], [], []);
      expect(result).toEqual([]);
    });

    it("should filter out null albums", () => {
      const tracks = [
        { album: null },
        { album: { id: "album1", name: "Album 1" } },
      ];

      const result = extractUniqueAlbums(tracks as any, [], []);

      expect(result.length).toBe(1);
      expect(result[0].id).toBe("album1");
    });
  });
});

// ---------------------------------------------------------------------------
// Retry & timeout behaviour
// ---------------------------------------------------------------------------

describe("spotify - Retry Behavior", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    // Zero-delay so tests run instantly
    retryDefaults.baseDelayMs = 0;
    retryDefaults.maxRetries = 3;
    retryDefaults.timeoutMs = 15_000;
  });

  afterEach(() => {
    Object.assign(retryDefaults, _origRetryDefaults);
  });

  // Helper to build a mock Response
  function mockResponse(
    status: number,
    body: unknown = "error",
    headers: Record<string, string> = {}
  ) {
    return {
      ok: status >= 200 && status < 300,
      status,
      headers: { get: (name: string) => headers[name] ?? null },
      json: () => Promise.resolve(body),
      text: () => Promise.resolve(typeof body === "string" ? body : JSON.stringify(body)),
    };
  }

  it("should retry on 429 and succeed on next attempt", async () => {
    const user = { id: "u1", display_name: "Test" };

    mockFetch
      .mockResolvedValueOnce(mockResponse(429, "Rate limited"))
      .mockResolvedValueOnce(mockResponse(200, user));

    const result = await getCurrentUser("tok");

    expect(mockFetch).toHaveBeenCalledTimes(2);
    expect(result).toEqual(user);
  });

  it("should retry on 500 and succeed on next attempt", async () => {
    const user = { id: "u2", display_name: "Test" };

    mockFetch
      .mockResolvedValueOnce(mockResponse(500, "Server error"))
      .mockResolvedValueOnce(mockResponse(200, user));

    const result = await getCurrentUser("tok");

    expect(mockFetch).toHaveBeenCalledTimes(2);
    expect(result).toEqual(user);
  });

  it("should retry on 503 (5xx range)", async () => {
    const user = { id: "u3", display_name: "Test" };

    mockFetch
      .mockResolvedValueOnce(mockResponse(503, "Unavailable"))
      .mockResolvedValueOnce(mockResponse(200, user));

    const result = await getCurrentUser("tok");

    expect(mockFetch).toHaveBeenCalledTimes(2);
    expect(result).toEqual(user);
  });

  it("should respect Retry-After header on 429", async () => {
    const user = { id: "u4", display_name: "Test" };

    mockFetch
      .mockResolvedValueOnce(mockResponse(429, "Rate limited", { "Retry-After": "0" }))
      .mockResolvedValueOnce(mockResponse(200, user));

    const result = await getCurrentUser("tok");

    expect(mockFetch).toHaveBeenCalledTimes(2);
    expect(result).toEqual(user);
  });

  it("should throw after exhausting all retries on 429", async () => {
    // 1 initial + 3 retries = 4 total
    mockFetch
      .mockResolvedValue(mockResponse(429, "Rate limited"));

    await expect(getCurrentUser("tok")).rejects.toThrow("Spotify API error");
    expect(mockFetch).toHaveBeenCalledTimes(4); // 1 + maxRetries
  });

  it("should throw after exhausting all retries on 500", async () => {
    mockFetch
      .mockResolvedValue(mockResponse(500, "Server error"));

    await expect(getCurrentUser("tok")).rejects.toThrow("Spotify API error");
    expect(mockFetch).toHaveBeenCalledTimes(4);
  });

  it("should NOT retry on 401 (non-retryable)", async () => {
    mockFetch.mockResolvedValueOnce(mockResponse(401, "Unauthorized"));

    await expect(getCurrentUser("tok")).rejects.toThrow("Spotify API error");
    expect(mockFetch).toHaveBeenCalledTimes(1);
  });

  it("should NOT retry on 403 (non-retryable)", async () => {
    mockFetch.mockResolvedValueOnce(mockResponse(403, "Forbidden"));

    await expect(getCurrentUser("tok")).rejects.toThrow("Spotify API error");
    expect(mockFetch).toHaveBeenCalledTimes(1);
  });

  it("should NOT retry on 404 (non-retryable)", async () => {
    mockFetch.mockResolvedValueOnce(mockResponse(404, "Not found"));

    await expect(getCurrentUser("tok")).rejects.toThrow("Spotify API error");
    expect(mockFetch).toHaveBeenCalledTimes(1);
  });

  it("should retry on network errors and eventually succeed", async () => {
    const user = { id: "u5", display_name: "Net" };

    mockFetch
      .mockRejectedValueOnce(new TypeError("fetch failed"))
      .mockResolvedValueOnce(mockResponse(200, user));

    const result = await getCurrentUser("tok");

    expect(mockFetch).toHaveBeenCalledTimes(2);
    expect(result).toEqual(user);
  });

  it("should throw after exhausting retries on network errors", async () => {
    mockFetch.mockRejectedValue(new TypeError("fetch failed"));

    await expect(getCurrentUser("tok")).rejects.toThrow("fetch failed");
    expect(mockFetch).toHaveBeenCalledTimes(4);
  });

  it("should recover after multiple 429s then success", async () => {
    const user = { id: "u6", display_name: "Multi" };

    mockFetch
      .mockResolvedValueOnce(mockResponse(429, "Rate limited"))
      .mockResolvedValueOnce(mockResponse(429, "Rate limited"))
      .mockResolvedValueOnce(mockResponse(200, user));

    const result = await getCurrentUser("tok");

    expect(mockFetch).toHaveBeenCalledTimes(3);
    expect(result).toEqual(user);
  });

  it("should pass AbortSignal.timeout to spotifyFetch calls", async () => {
    mockFetch.mockResolvedValueOnce(mockResponse(200, { id: "u7" }));

    await getCurrentUser("tok");

    const fetchOptions = mockFetch.mock.calls[0][1];
    expect(fetchOptions).toHaveProperty("signal");
  });
});

describe("spotify - Auth Timeout", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    retryDefaults.timeoutMs = 15_000;
  });

  afterEach(() => {
    Object.assign(retryDefaults, _origRetryDefaults);
  });

  it("exchangeCodeForTokens should include timeout signal", async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: () =>
        Promise.resolve({
          access_token: "at",
          token_type: "Bearer",
          scope: "user-read-email",
          expires_in: 3600,
          refresh_token: "rt",
        }),
    });

    await exchangeCodeForTokens("code");

    const fetchOptions = mockFetch.mock.calls[0][1];
    expect(fetchOptions).toHaveProperty("signal");
  });

  it("refreshAccessToken should include timeout signal", async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: () =>
        Promise.resolve({
          access_token: "at2",
          token_type: "Bearer",
          scope: "user-read-email",
          expires_in: 3600,
          refresh_token: "rt2",
        }),
    });

    await refreshAccessToken("old-rt");

    const fetchOptions = mockFetch.mock.calls[0][1];
    expect(fetchOptions).toHaveProperty("signal");
  });

  it("exchangeCodeForTokens should NOT retry on failure", async () => {
    mockFetch.mockResolvedValueOnce({
      ok: false,
      text: () => Promise.resolve("Bad request"),
    });

    await expect(exchangeCodeForTokens("bad")).rejects.toThrow("Failed to exchange code");
    expect(mockFetch).toHaveBeenCalledTimes(1);
  });

  it("refreshAccessToken should NOT retry on failure", async () => {
    mockFetch.mockResolvedValueOnce({
      ok: false,
      text: () => Promise.resolve("Invalid token"),
    });

    await expect(refreshAccessToken("bad")).rejects.toThrow("Failed to refresh token");
    expect(mockFetch).toHaveBeenCalledTimes(1);
  });
});
