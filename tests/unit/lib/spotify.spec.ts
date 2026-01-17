import { describe, it, expect, vi, beforeEach } from "vitest";

// Mock global fetch
const mockFetch = vi.fn();
global.fetch = mockFetch;

import {
  getSpotifyAuthUrl,
  exchangeCodeForTokens,
  refreshAccessToken,
  getCurrentUser,
  getTopTracks,
  getSavedAlbums,
  getRecentlyPlayed,
  extractUniqueAlbums,
} from "@/lib/spotify";

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
