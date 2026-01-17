import { describe, it, expect, beforeEach } from "vitest";
import { http, HttpResponse } from "msw";
import { server } from "../mocks/server";
import {
  exchangeCodeForTokens,
  refreshAccessToken,
  getCurrentUser,
  getTopTracks,
  getSavedAlbums,
  getRecentlyPlayed,
} from "@/lib/spotify";

describe("Spotify API Integration (MSW)", () => {
  describe("exchangeCodeForTokens", () => {
    it("should exchange authorization code for tokens", async () => {
      const tokens = await exchangeCodeForTokens("valid_auth_code");

      expect(tokens.access_token).toBe("mock_access_token");
      expect(tokens.refresh_token).toBe("mock_refresh_token");
      expect(tokens.token_type).toBe("Bearer");
      expect(tokens.expires_in).toBe(3600);
    });

    it("should throw error for invalid authorization code", async () => {
      await expect(exchangeCodeForTokens("invalid_code")).rejects.toThrow(
        "Failed to exchange code"
      );
    });
  });

  describe("refreshAccessToken", () => {
    it("should refresh access token successfully", async () => {
      const tokens = await refreshAccessToken("valid_refresh_token");

      expect(tokens.access_token).toBe("new_mock_access_token");
      expect(tokens.token_type).toBe("Bearer");
    });

    it("should throw error for expired refresh token", async () => {
      await expect(refreshAccessToken("expired_refresh_token")).rejects.toThrow();
    });
  });

  describe("getCurrentUser", () => {
    it("should fetch user profile with valid token", async () => {
      const user = await getCurrentUser("valid_access_token");

      expect(user.id).toBe("spotify_user_123");
      expect(user.display_name).toBe("Test User");
      expect(user.email).toBe("test@example.com");
    });

    it("should throw error for expired token", async () => {
      await expect(getCurrentUser("expired_token")).rejects.toThrow();
    });
  });

  describe("getTopTracks", () => {
    it("should fetch top tracks with valid token", async () => {
      const response = await getTopTracks("valid_access_token", "medium_term", 50);

      expect(response.items).toHaveLength(2);
      expect(response.items[0].name).toBe("Test Track 1");
      expect(response.items[0].album.name).toBe("Test Album 1");
    });

    it("should throw error for unauthorized request", async () => {
      await expect(getTopTracks("expired_token", "medium_term", 50)).rejects.toThrow();
    });
  });

  describe("getSavedAlbums", () => {
    it("should fetch saved albums with valid token", async () => {
      const response = await getSavedAlbums("valid_access_token", 20);

      expect(response.items).toHaveLength(1);
      expect(response.items[0].album.name).toBe("Saved Album 1");
    });
  });

  describe("getRecentlyPlayed", () => {
    it("should fetch recently played tracks", async () => {
      const response = await getRecentlyPlayed("valid_access_token", 50);

      expect(response.items).toHaveLength(1);
      expect(response.items[0].track.name).toBe("Recent Track 1");
      expect(response.items[0].played_at).toBe("2024-01-15T12:00:00Z");
    });
  });

  describe("error handling", () => {
    it("should handle network errors gracefully", async () => {
      server.use(
        http.get("https://api.spotify.com/v1/me", () => {
          return HttpResponse.error();
        })
      );

      await expect(getCurrentUser("valid_token")).rejects.toThrow();
    });

    it("should handle 500 server errors", async () => {
      server.use(
        http.get("https://api.spotify.com/v1/me", () => {
          return HttpResponse.json(
            { error: { message: "Internal server error" } },
            { status: 500 }
          );
        })
      );

      await expect(getCurrentUser("valid_token")).rejects.toThrow();
    });
  });
});
