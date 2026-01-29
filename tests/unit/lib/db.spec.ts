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
  getBulkCachedVinylStatus,
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

    it("should return empty array when no albums", async () => {
      const mockEq = vi.fn().mockResolvedValue({ data: null, error: null });
      const mockSelect = vi.fn().mockReturnValue({ eq: mockEq });
      mockFrom.mockReturnValue({ select: mockSelect });

      const result = await getAllUserAlbumIds("user123");

      expect(result).toEqual([]);
    });

    it("should throw on database error", async () => {
      const mockError = { message: "Database error" };
      const mockEq = vi.fn().mockResolvedValue({ data: null, error: mockError });
      const mockSelect = vi.fn().mockReturnValue({ eq: mockEq });
      mockFrom.mockReturnValue({ select: mockSelect });

      await expect(getAllUserAlbumIds("user123")).rejects.toEqual(mockError);
    });
  });

  describe("getActiveUserAlbumIds", () => {
    it("should return active album IDs excluding expired skips", async () => {
      const now = Math.floor(Date.now() / 1000);
      const mockData = [
        { album_id: "owned1", status: "owned", created_at: now - 1000 },
        { album_id: "wishlist1", status: "wishlist", created_at: now - 2000 },
        { album_id: "skipped_recent", status: "skipped", created_at: now - 3600 }, // 1 hour ago - active
        { album_id: "skipped_old", status: "skipped", created_at: now - 200000 }, // expired (>48h)
      ];

      const mockEq = vi.fn().mockResolvedValue({ data: mockData, error: null });
      const mockSelect = vi.fn().mockReturnValue({ eq: mockEq });
      mockFrom.mockReturnValue({ select: mockSelect });

      const result = await getActiveUserAlbumIds("user123");

      expect(result).toContain("owned1");
      expect(result).toContain("wishlist1");
      expect(result).toContain("skipped_recent");
      expect(result).not.toContain("skipped_old");
    });

    it("should return empty array when no albums", async () => {
      const mockEq = vi.fn().mockResolvedValue({ data: null, error: null });
      const mockSelect = vi.fn().mockReturnValue({ eq: mockEq });
      mockFrom.mockReturnValue({ select: mockSelect });

      const result = await getActiveUserAlbumIds("user123");

      expect(result).toEqual([]);
    });

    it("should throw on database error", async () => {
      const mockError = { message: "Database error" };
      const mockEq = vi.fn().mockResolvedValue({ data: null, error: mockError });
      const mockSelect = vi.fn().mockReturnValue({ eq: mockEq });
      mockFrom.mockReturnValue({ select: mockSelect });

      await expect(getActiveUserAlbumIds("user123")).rejects.toEqual(mockError);
    });
  });

  describe("cleanupExpiredSkips", () => {
    it("should delete expired skipped albums", async () => {
      const mockLte = vi.fn().mockResolvedValue({ error: null });
      const mockEqStatus = vi.fn().mockReturnValue({ lte: mockLte });
      const mockEqUser = vi.fn().mockReturnValue({ eq: mockEqStatus });
      const mockDelete = vi.fn().mockReturnValue({ eq: mockEqUser });
      mockFrom.mockReturnValue({ delete: mockDelete });

      await cleanupExpiredSkips("user123");

      expect(mockFrom).toHaveBeenCalledWith("user_albums");
      expect(mockDelete).toHaveBeenCalled();
      expect(mockEqUser).toHaveBeenCalledWith("user_id", "user123");
      expect(mockEqStatus).toHaveBeenCalledWith("status", "skipped");
      expect(mockLte).toHaveBeenCalledWith("created_at", expect.any(Number));
    });

    it("should throw on database error", async () => {
      const mockError = { message: "Cleanup failed" };
      const mockLte = vi.fn().mockResolvedValue({ error: mockError });
      const mockEqStatus = vi.fn().mockReturnValue({ lte: mockLte });
      const mockEqUser = vi.fn().mockReturnValue({ eq: mockEqStatus });
      const mockDelete = vi.fn().mockReturnValue({ eq: mockEqUser });
      mockFrom.mockReturnValue({ delete: mockDelete });

      await expect(cleanupExpiredSkips("user123")).rejects.toEqual(mockError);
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

    it("should handle null discogs URL", async () => {
      const mockUpsert = vi.fn().mockResolvedValue({ error: null });
      mockFrom.mockReturnValue({ upsert: mockUpsert });

      await setCachedVinylStatus("Artist", "Album", false);

      expect(mockUpsert).toHaveBeenCalledWith(
        expect.objectContaining({
          has_vinyl: false,
          discogs_url: null,
        }),
        expect.any(Object)
      );
    });

    it("should throw on database error", async () => {
      const mockError = { message: "Cache write failed" };
      const mockUpsert = vi.fn().mockResolvedValue({ error: mockError });
      mockFrom.mockReturnValue({ upsert: mockUpsert });

      await expect(
        setCachedVinylStatus("Artist", "Album", true)
      ).rejects.toEqual(mockError);
    });
  });

  describe("getBulkCachedVinylStatus", () => {
    it("should return cached status for multiple albums", async () => {
      const mockData1 = {
        has_vinyl: true,
        discogs_url: "https://discogs.com/1",
      };
      const mockData2 = {
        has_vinyl: false,
        discogs_url: null,
      };

      // Mock the chained calls for each album query
      const createMockChain = (data: unknown, hasError: boolean) => {
        const mockSingle = vi.fn().mockResolvedValue({
          data: hasError ? null : data,
          error: hasError ? { code: "PGRST116" } : null,
        });
        const mockGt = vi.fn().mockReturnValue({ single: mockSingle });
        const mockEqAlbum = vi.fn().mockReturnValue({ gt: mockGt });
        const mockEqArtist = vi.fn().mockReturnValue({ eq: mockEqAlbum });
        const mockSelect = vi.fn().mockReturnValue({ eq: mockEqArtist });
        return { select: mockSelect };
      };

      // First call returns data, second call returns data
      mockFrom
        .mockReturnValueOnce(createMockChain(mockData1, false))
        .mockReturnValueOnce(createMockChain(mockData2, false));

      const albums = [
        { artist: "Artist1", album: "Album1" },
        { artist: "Artist2", album: "Album2" },
      ];

      const result = await getBulkCachedVinylStatus(albums);

      expect(result.size).toBe(2);
      expect(result.get("artist1|album1")).toEqual({
        hasVinyl: true,
        discogsUrl: "https://discogs.com/1",
      });
      expect(result.get("artist2|album2")).toEqual({
        hasVinyl: false,
        discogsUrl: null,
      });
    });

    it("should handle missing cache entries", async () => {
      const createMockChain = () => {
        const mockSingle = vi.fn().mockResolvedValue({
          data: null,
          error: { code: "PGRST116" },
        });
        const mockGt = vi.fn().mockReturnValue({ single: mockSingle });
        const mockEqAlbum = vi.fn().mockReturnValue({ gt: mockGt });
        const mockEqArtist = vi.fn().mockReturnValue({ eq: mockEqAlbum });
        const mockSelect = vi.fn().mockReturnValue({ eq: mockEqArtist });
        return { select: mockSelect };
      };

      mockFrom.mockReturnValue(createMockChain());

      const albums = [{ artist: "Unknown", album: "Unknown" }];

      const result = await getBulkCachedVinylStatus(albums);

      expect(result.size).toBe(0);
    });

    it("should handle empty album list", async () => {
      const result = await getBulkCachedVinylStatus([]);

      expect(result.size).toBe(0);
      expect(mockFrom).not.toHaveBeenCalled();
    });

    it("should normalize artist and album names to lowercase", async () => {
      const mockData = {
        has_vinyl: true,
        discogs_url: "https://discogs.com/test",
      };

      const mockSingle = vi.fn().mockResolvedValue({ data: mockData, error: null });
      const mockGt = vi.fn().mockReturnValue({ single: mockSingle });
      const mockEqAlbum = vi.fn().mockReturnValue({ gt: mockGt });
      const mockEqArtist = vi.fn().mockReturnValue({ eq: mockEqAlbum });
      const mockSelect = vi.fn().mockReturnValue({ eq: mockEqArtist });
      mockFrom.mockReturnValue({ select: mockSelect });

      const albums = [{ artist: "UPPER CASE", album: "MixedCase" }];

      const result = await getBulkCachedVinylStatus(albums);

      expect(mockEqArtist).toHaveBeenCalledWith("artist_name", "upper case");
      expect(mockEqAlbum).toHaveBeenCalledWith("album_name", "mixedcase");
      expect(result.has("upper case|mixedcase")).toBe(true);
    });
  });
});
