import { describe, it, expect, vi, beforeEach } from "vitest";

// Use vi.hoisted to define mocks that can be used in vi.mock factory
const { mockFrom, mockSupabaseClient } = vi.hoisted(() => {
  const mockFrom = vi.fn();
  const mockSupabaseClient = { from: mockFrom };
  return { mockFrom, mockSupabaseClient };
});

vi.mock("@/lib/supabase", () => ({
  getSupabase: vi.fn().mockResolvedValue(mockSupabaseClient),
}));

import {
  upsertUser,
  getUser,
  updateUserTokens,
  setAlbumStatus,
  getUserAlbumsByStatus,
  getAllUserAlbumIds,
  getActiveUserAlbumIds,
  cleanupExpiredSkips,
  removeAlbumStatus,
  getCachedVinylStatus,
  setCachedVinylStatus,
} from "@/lib/db";

describe("db - User Operations", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe("upsertUser", () => {
    it("should upsert a user successfully", async () => {
      const mockUpsert = vi.fn().mockResolvedValue({ error: null });
      mockFrom.mockReturnValue({ upsert: mockUpsert });

      await upsertUser({
        id: "user123",
        display_name: "Test User",
        email: "test@example.com",
        access_token: "access-token",
        refresh_token: "refresh-token",
        token_expires_at: 1234567890,
      });

      expect(mockFrom).toHaveBeenCalledWith("users");
      expect(mockUpsert).toHaveBeenCalledWith({
        id: "user123",
        display_name: "Test User",
        email: "test@example.com",
        access_token: "access-token",
        refresh_token: "refresh-token",
        token_expires_at: 1234567890,
      });
    });

    it("should handle null display_name and email", async () => {
      const mockUpsert = vi.fn().mockResolvedValue({ error: null });
      mockFrom.mockReturnValue({ upsert: mockUpsert });

      await upsertUser({
        id: "user123",
        access_token: "access-token",
        refresh_token: "refresh-token",
        token_expires_at: 1234567890,
      });

      expect(mockUpsert).toHaveBeenCalledWith(
        expect.objectContaining({
          display_name: null,
          email: null,
        })
      );
    });

    it("should throw on error", async () => {
      const mockError = { message: "Database error" };
      const mockUpsert = vi.fn().mockResolvedValue({ error: mockError });
      mockFrom.mockReturnValue({ upsert: mockUpsert });

      await expect(
        upsertUser({
          id: "user123",
          access_token: "access-token",
          refresh_token: "refresh-token",
          token_expires_at: 1234567890,
        })
      ).rejects.toEqual(mockError);
    });
  });

  describe("getUser", () => {
    it("should return a user when found", async () => {
      const mockUser = {
        id: "user123",
        display_name: "Test User",
        email: "test@example.com",
        access_token: "access-token",
        refresh_token: "refresh-token",
        token_expires_at: 1234567890,
        created_at: 1234567800,
      };

      const mockSingle = vi.fn().mockResolvedValue({ data: mockUser, error: null });
      const mockEq = vi.fn().mockReturnValue({ single: mockSingle });
      const mockSelect = vi.fn().mockReturnValue({ eq: mockEq });
      mockFrom.mockReturnValue({ select: mockSelect });

      const result = await getUser("user123");

      expect(mockFrom).toHaveBeenCalledWith("users");
      expect(mockSelect).toHaveBeenCalledWith("*");
      expect(mockEq).toHaveBeenCalledWith("id", "user123");
      expect(result).toEqual(mockUser);
    });

    it("should return undefined when user not found", async () => {
      const mockSingle = vi.fn().mockResolvedValue({
        data: null,
        error: { code: "PGRST116" },
      });
      const mockEq = vi.fn().mockReturnValue({ single: mockSingle });
      const mockSelect = vi.fn().mockReturnValue({ eq: mockEq });
      mockFrom.mockReturnValue({ select: mockSelect });

      const result = await getUser("nonexistent");

      expect(result).toBeUndefined();
    });
  });

  describe("updateUserTokens", () => {
    it("should update user tokens successfully", async () => {
      const mockEq = vi.fn().mockResolvedValue({ error: null });
      const mockUpdate = vi.fn().mockReturnValue({ eq: mockEq });
      mockFrom.mockReturnValue({ update: mockUpdate });

      await updateUserTokens("user123", "new-access", "new-refresh", 9999999999);

      expect(mockFrom).toHaveBeenCalledWith("users");
      expect(mockUpdate).toHaveBeenCalledWith({
        access_token: "new-access",
        refresh_token: "new-refresh",
        token_expires_at: 9999999999,
      });
      expect(mockEq).toHaveBeenCalledWith("id", "user123");
    });
  });
});

describe("db - Album Operations", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe("setAlbumStatus", () => {
    it("should set album status with upsert", async () => {
      const mockUpsert = vi.fn().mockResolvedValue({ error: null });
      mockFrom.mockReturnValue({ upsert: mockUpsert });

      await setAlbumStatus(
        "user123",
        {
          album_id: "album456",
          album_name: "Test Album",
          artist_name: "Test Artist",
          image_url: "https://example.com/image.jpg",
        },
        "owned"
      );

      expect(mockFrom).toHaveBeenCalledWith("user_albums");
      expect(mockUpsert).toHaveBeenCalledWith(
        expect.objectContaining({
          user_id: "user123",
          album_id: "album456",
          album_name: "Test Album",
          artist_name: "Test Artist",
          image_url: "https://example.com/image.jpg",
          status: "owned",
        }),
        { onConflict: "user_id,album_id" }
      );
    });
  });

  describe("getUserAlbumsByStatus", () => {
    it("should return albums filtered by status", async () => {
      const mockAlbums = [
        { id: 1, album_id: "album1", status: "owned" },
        { id: 2, album_id: "album2", status: "owned" },
      ];

      const mockOrder = vi.fn().mockResolvedValue({ data: mockAlbums, error: null });
      const mockEqStatus = vi.fn().mockReturnValue({ order: mockOrder });
      const mockEqUser = vi.fn().mockReturnValue({ eq: mockEqStatus });
      const mockSelect = vi.fn().mockReturnValue({ eq: mockEqUser });
      mockFrom.mockReturnValue({ select: mockSelect });

      const result = await getUserAlbumsByStatus("user123", "owned");

      expect(mockFrom).toHaveBeenCalledWith("user_albums");
      expect(mockEqUser).toHaveBeenCalledWith("user_id", "user123");
      expect(mockEqStatus).toHaveBeenCalledWith("status", "owned");
      expect(result).toEqual(mockAlbums);
    });
  });

  describe("getAllUserAlbumIds", () => {
    it("should return all album IDs for a user", async () => {
      const mockData = [{ album_id: "album1" }, { album_id: "album2" }];

      const mockEq = vi.fn().mockResolvedValue({ data: mockData, error: null });
      const mockSelect = vi.fn().mockReturnValue({ eq: mockEq });
      mockFrom.mockReturnValue({ select: mockSelect });

      const result = await getAllUserAlbumIds("user123");

      expect(result).toEqual(["album1", "album2"]);
    });
  });

  describe("removeAlbumStatus", () => {
    it("should delete album from user collection", async () => {
      const mockEqAlbum = vi.fn().mockResolvedValue({ error: null });
      const mockEqUser = vi.fn().mockReturnValue({ eq: mockEqAlbum });
      const mockDelete = vi.fn().mockReturnValue({ eq: mockEqUser });
      mockFrom.mockReturnValue({ delete: mockDelete });

      await removeAlbumStatus("user123", "album456");

      expect(mockFrom).toHaveBeenCalledWith("user_albums");
      expect(mockEqUser).toHaveBeenCalledWith("user_id", "user123");
      expect(mockEqAlbum).toHaveBeenCalledWith("album_id", "album456");
    });
  });
});

describe("db - Vinyl Cache Operations", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe("getCachedVinylStatus", () => {
    it("should return cached vinyl status when found", async () => {
      const mockData = {
        has_vinyl: true,
        discogs_url: "https://discogs.com/release/123",
      };

      const mockSingle = vi.fn().mockResolvedValue({ data: mockData, error: null });
      const mockGt = vi.fn().mockReturnValue({ single: mockSingle });
      const mockEqAlbum = vi.fn().mockReturnValue({ gt: mockGt });
      const mockEqArtist = vi.fn().mockReturnValue({ eq: mockEqAlbum });
      const mockSelect = vi.fn().mockReturnValue({ eq: mockEqArtist });
      mockFrom.mockReturnValue({ select: mockSelect });

      const result = await getCachedVinylStatus("Test Artist", "Test Album");

      expect(mockFrom).toHaveBeenCalledWith("vinyl_cache");
      expect(mockEqArtist).toHaveBeenCalledWith("artist_name", "test artist");
      expect(mockEqAlbum).toHaveBeenCalledWith("album_name", "test album");
      expect(result).toEqual({
        hasVinyl: true,
        discogsUrl: "https://discogs.com/release/123",
      });
    });

    it("should return null when not cached", async () => {
      const mockSingle = vi.fn().mockResolvedValue({
        data: null,
        error: { code: "PGRST116" },
      });
      const mockGt = vi.fn().mockReturnValue({ single: mockSingle });
      const mockEqAlbum = vi.fn().mockReturnValue({ gt: mockGt });
      const mockEqArtist = vi.fn().mockReturnValue({ eq: mockEqAlbum });
      const mockSelect = vi.fn().mockReturnValue({ eq: mockEqArtist });
      mockFrom.mockReturnValue({ select: mockSelect });

      const result = await getCachedVinylStatus("Unknown Artist", "Unknown Album");

      expect(result).toBeNull();
    });
  });

  describe("setCachedVinylStatus", () => {
    it("should cache vinyl status with lowercase names", async () => {
      const mockUpsert = vi.fn().mockResolvedValue({ error: null });
      mockFrom.mockReturnValue({ upsert: mockUpsert });

      await setCachedVinylStatus(
        "Test Artist",
        "Test Album",
        true,
        "https://discogs.com/release/123"
      );

      expect(mockFrom).toHaveBeenCalledWith("vinyl_cache");
      expect(mockUpsert).toHaveBeenCalledWith(
        expect.objectContaining({
          artist_name: "test artist",
          album_name: "test album",
          has_vinyl: true,
          discogs_url: "https://discogs.com/release/123",
        }),
        { onConflict: "artist_name,album_name" }
      );
    });
  });
});
