import { describe, it, expect, beforeEach, afterEach } from "vitest";
import type Database from "better-sqlite3";
import {
  setupTestDatabase,
  teardownTestDatabase,
  seedUser,
  seedAlbum,
  seedVinylCache,
} from "@/tests/mocks/database";
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

let db: Database.Database;

beforeEach(() => {
  db = setupTestDatabase();
});

afterEach(() => {
  teardownTestDatabase();
});

describe("db - User Operations", () => {
  describe("upsertUser", () => {
    it("should insert a new user", () => {
      upsertUser({
        id: "user123",
        display_name: "Test User",
        email: "test@example.com",
        access_token: "access-token",
        refresh_token: "refresh-token",
        token_expires_at: 1234567890,
      });

      const user = getUser("user123");
      expect(user).toBeDefined();
      expect(user!.id).toBe("user123");
      expect(user!.display_name).toBe("Test User");
      expect(user!.email).toBe("test@example.com");
      expect(user!.access_token).toBe("access-token");
      expect(user!.refresh_token).toBe("refresh-token");
      expect(user!.token_expires_at).toBe(1234567890);
    });

    it("should update an existing user on conflict", () => {
      upsertUser({
        id: "user123",
        display_name: "Original",
        access_token: "old-token",
        refresh_token: "old-refresh",
        token_expires_at: 1000,
      });

      upsertUser({
        id: "user123",
        display_name: "Updated",
        access_token: "new-token",
        refresh_token: "new-refresh",
        token_expires_at: 2000,
      });

      const user = getUser("user123");
      expect(user!.display_name).toBe("Updated");
      expect(user!.access_token).toBe("new-token");
      expect(user!.token_expires_at).toBe(2000);
    });

    it("should handle null display_name and email", () => {
      upsertUser({
        id: "user123",
        access_token: "access-token",
        refresh_token: "refresh-token",
        token_expires_at: 1234567890,
      });

      const user = getUser("user123");
      expect(user!.display_name).toBeNull();
      expect(user!.email).toBeNull();
    });
  });

  describe("getUser", () => {
    it("should return a user when found", () => {
      seedUser(db, {
        id: "user123",
        display_name: "Test User",
        email: "test@example.com",
        access_token: "access-token",
        refresh_token: "refresh-token",
        token_expires_at: 1234567890,
        created_at: 1234567800,
      });

      const result = getUser("user123");

      expect(result).toBeDefined();
      expect(result!.id).toBe("user123");
      expect(result!.display_name).toBe("Test User");
      expect(result!.email).toBe("test@example.com");
    });

    it("should return undefined when user not found", () => {
      const result = getUser("nonexistent");
      expect(result).toBeUndefined();
    });
  });

  describe("updateUserTokens", () => {
    it("should update user tokens successfully", () => {
      seedUser(db, {
        id: "user123",
        access_token: "old-access",
        refresh_token: "old-refresh",
        token_expires_at: 1000,
      });

      updateUserTokens("user123", "new-access", "new-refresh", 9999999999);

      const user = getUser("user123");
      expect(user!.access_token).toBe("new-access");
      expect(user!.refresh_token).toBe("new-refresh");
      expect(user!.token_expires_at).toBe(9999999999);
    });
  });
});

describe("db - Album Operations", () => {
  describe("setAlbumStatus", () => {
    it("should insert a new album status", () => {
      seedUser(db, { id: "user123" });

      setAlbumStatus(
        "user123",
        {
          album_id: "album456",
          album_name: "Test Album",
          artist_name: "Test Artist",
          image_url: "https://example.com/image.jpg",
        },
        "owned"
      );

      const albums = getUserAlbumsByStatus("user123", "owned");
      expect(albums).toHaveLength(1);
      expect(albums[0].album_id).toBe("album456");
      expect(albums[0].album_name).toBe("Test Album");
      expect(albums[0].artist_name).toBe("Test Artist");
      expect(albums[0].image_url).toBe("https://example.com/image.jpg");
      expect(albums[0].status).toBe("owned");
    });

    it("should update status on conflict (same user + album)", () => {
      seedUser(db, { id: "user123" });

      setAlbumStatus(
        "user123",
        {
          album_id: "album456",
          album_name: "Test Album",
          artist_name: "Test Artist",
          image_url: "https://example.com/image.jpg",
        },
        "wishlist"
      );

      setAlbumStatus(
        "user123",
        {
          album_id: "album456",
          album_name: "Test Album",
          artist_name: "Test Artist",
          image_url: "https://example.com/image.jpg",
        },
        "owned"
      );

      const wishlist = getUserAlbumsByStatus("user123", "wishlist");
      const owned = getUserAlbumsByStatus("user123", "owned");
      expect(wishlist).toHaveLength(0);
      expect(owned).toHaveLength(1);
    });
  });

  describe("getUserAlbumsByStatus", () => {
    it("should return albums filtered by status", () => {
      seedUser(db, { id: "user123" });
      const now = Math.floor(Date.now() / 1000);

      seedAlbum(db, {
        user_id: "user123",
        album_id: "album1",
        album_name: "Album 1",
        artist_name: "Artist 1",
        status: "owned",
        created_at: now - 100,
      });
      seedAlbum(db, {
        user_id: "user123",
        album_id: "album2",
        album_name: "Album 2",
        artist_name: "Artist 2",
        status: "owned",
        created_at: now,
      });
      seedAlbum(db, {
        user_id: "user123",
        album_id: "album3",
        album_name: "Album 3",
        artist_name: "Artist 3",
        status: "wishlist",
        created_at: now,
      });

      const result = getUserAlbumsByStatus("user123", "owned");

      expect(result).toHaveLength(2);
      // Ordered by created_at DESC
      expect(result[0].album_id).toBe("album2");
      expect(result[1].album_id).toBe("album1");
    });

    it("should return empty array when no matching albums", () => {
      const result = getUserAlbumsByStatus("user123", "owned");
      expect(result).toEqual([]);
    });
  });

  describe("getAllUserAlbumIds", () => {
    it("should return all album IDs for a user", () => {
      seedUser(db, { id: "user123" });
      const now = Math.floor(Date.now() / 1000);

      seedAlbum(db, { user_id: "user123", album_id: "album1", status: "owned", created_at: now });
      seedAlbum(db, { user_id: "user123", album_id: "album2", status: "wishlist", created_at: now });

      const result = getAllUserAlbumIds("user123");

      expect(result).toHaveLength(2);
      expect(result).toContain("album1");
      expect(result).toContain("album2");
    });

    it("should return empty array when no albums", () => {
      const result = getAllUserAlbumIds("user123");
      expect(result).toEqual([]);
    });
  });

  describe("getActiveUserAlbumIds", () => {
    it("should return active album IDs excluding expired skips", () => {
      seedUser(db, { id: "user123" });
      const now = Math.floor(Date.now() / 1000);

      seedAlbum(db, { user_id: "user123", album_id: "owned1", status: "owned", created_at: now - 1000 });
      seedAlbum(db, { user_id: "user123", album_id: "wishlist1", status: "wishlist", created_at: now - 2000 });
      seedAlbum(db, { user_id: "user123", album_id: "skipped_recent", status: "skipped", created_at: now - 3600 }); // 1h ago - active
      seedAlbum(db, { user_id: "user123", album_id: "skipped_old", status: "skipped", created_at: now - 200000 }); // >48h - expired

      const result = getActiveUserAlbumIds("user123");

      expect(result).toContain("owned1");
      expect(result).toContain("wishlist1");
      expect(result).toContain("skipped_recent");
      expect(result).not.toContain("skipped_old");
    });

    it("should return empty array when no albums", () => {
      const result = getActiveUserAlbumIds("user123");
      expect(result).toEqual([]);
    });
  });

  describe("cleanupExpiredSkips", () => {
    it("should delete expired skipped albums", () => {
      seedUser(db, { id: "user123" });
      const now = Math.floor(Date.now() / 1000);

      seedAlbum(db, { user_id: "user123", album_id: "recent_skip", status: "skipped", created_at: now - 3600 });
      seedAlbum(db, { user_id: "user123", album_id: "old_skip", status: "skipped", created_at: now - 200000 });
      seedAlbum(db, { user_id: "user123", album_id: "owned1", status: "owned", created_at: now });

      cleanupExpiredSkips("user123");

      const allIds = getAllUserAlbumIds("user123");
      expect(allIds).toContain("recent_skip");
      expect(allIds).toContain("owned1");
      expect(allIds).not.toContain("old_skip");
    });
  });

  describe("removeAlbumStatus", () => {
    it("should delete album from user collection", () => {
      seedUser(db, { id: "user123" });
      const now = Math.floor(Date.now() / 1000);

      seedAlbum(db, { user_id: "user123", album_id: "album456", status: "owned", created_at: now });

      removeAlbumStatus("user123", "album456");

      const allIds = getAllUserAlbumIds("user123");
      expect(allIds).not.toContain("album456");
    });
  });
});

describe("db - Vinyl Cache Operations", () => {
  describe("getCachedVinylStatus", () => {
    it("should return cached vinyl status when found", () => {
      const now = Math.floor(Date.now() / 1000);

      seedVinylCache(db, {
        artist_name: "test artist",
        album_name: "test album",
        has_vinyl: true,
        discogs_url: "https://discogs.com/release/123",
        checked_at: now,
      });

      const result = getCachedVinylStatus("Test Artist", "Test Album");

      expect(result).toEqual({
        hasVinyl: true,
        discogsUrl: "https://discogs.com/release/123",
      });
    });

    it("should return null when not cached", () => {
      const result = getCachedVinylStatus("Unknown Artist", "Unknown Album");
      expect(result).toBeNull();
    });

    it("should return null for expired cache entries", () => {
      const eightDaysAgo = Math.floor(Date.now() / 1000) - 8 * 24 * 60 * 60;

      seedVinylCache(db, {
        artist_name: "test artist",
        album_name: "test album",
        has_vinyl: true,
        checked_at: eightDaysAgo,
      });

      const result = getCachedVinylStatus("Test Artist", "Test Album");
      expect(result).toBeNull();
    });
  });

  describe("setCachedVinylStatus", () => {
    it("should cache vinyl status with lowercase names", () => {
      setCachedVinylStatus(
        "Test Artist",
        "Test Album",
        true,
        "https://discogs.com/release/123"
      );

      const result = getCachedVinylStatus("test artist", "test album");
      expect(result).toEqual({
        hasVinyl: true,
        discogsUrl: "https://discogs.com/release/123",
      });
    });

    it("should handle null discogs URL", () => {
      setCachedVinylStatus("Artist", "Album", false);

      const result = getCachedVinylStatus("artist", "album");
      expect(result).toEqual({
        hasVinyl: false,
        discogsUrl: null,
      });
    });

    it("should update existing cache entry on conflict", () => {
      setCachedVinylStatus("Artist", "Album", false);
      setCachedVinylStatus("Artist", "Album", true, "https://discogs.com/1");

      const result = getCachedVinylStatus("artist", "album");
      expect(result!.hasVinyl).toBe(true);
      expect(result!.discogsUrl).toBe("https://discogs.com/1");
    });
  });

  describe("getBulkCachedVinylStatus", () => {
    it("should return cached status for multiple albums", () => {
      const now = Math.floor(Date.now() / 1000);

      seedVinylCache(db, {
        artist_name: "artist1",
        album_name: "album1",
        has_vinyl: true,
        discogs_url: "https://discogs.com/1",
        checked_at: now,
      });
      seedVinylCache(db, {
        artist_name: "artist2",
        album_name: "album2",
        has_vinyl: false,
        discogs_url: null,
        checked_at: now,
      });

      const albums = [
        { artist: "Artist1", album: "Album1" },
        { artist: "Artist2", album: "Album2" },
      ];

      const result = getBulkCachedVinylStatus(albums);

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

    it("should handle missing cache entries", () => {
      const albums = [{ artist: "Unknown", album: "Unknown" }];
      const result = getBulkCachedVinylStatus(albums);
      expect(result.size).toBe(0);
    });

    it("should handle empty album list", () => {
      const result = getBulkCachedVinylStatus([]);
      expect(result.size).toBe(0);
    });

    it("should normalize artist and album names to lowercase", () => {
      const now = Math.floor(Date.now() / 1000);

      seedVinylCache(db, {
        artist_name: "upper case",
        album_name: "mixedcase",
        has_vinyl: true,
        discogs_url: "https://discogs.com/test",
        checked_at: now,
      });

      const albums = [{ artist: "UPPER CASE", album: "MixedCase" }];
      const result = getBulkCachedVinylStatus(albums);

      expect(result.has("upper case|mixedcase")).toBe(true);
    });
  });
});
