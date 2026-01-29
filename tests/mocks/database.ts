import Database from "better-sqlite3";
import { getDatabase, _resetDatabase } from "@/lib/database";

/**
 * Create a fresh in-memory test database.
 * Call in beforeEach to get a clean slate.
 */
export function setupTestDatabase(): Database.Database {
  // Reset the singleton so getDatabase() creates a fresh one
  _resetDatabase();

  // Set env to in-memory so getDatabase() uses :memory:
  process.env.DATABASE_PATH = ":memory:";

  // Trigger initialization (creates tables)
  return getDatabase();
}

/**
 * Tear down the test database.
 * Call in afterEach / afterAll.
 */
export function teardownTestDatabase(): void {
  _resetDatabase();
}

/**
 * Seed a user into the test database.
 */
export function seedUser(
  db: Database.Database,
  user: {
    id: string;
    display_name?: string | null;
    email?: string | null;
    access_token?: string | null;
    refresh_token?: string | null;
    token_expires_at?: number | null;
    created_at?: number;
  }
): void {
  const stmt = db.prepare(`
    INSERT INTO users (id, display_name, email, access_token, refresh_token, token_expires_at, created_at)
    VALUES (@id, @display_name, @email, @access_token, @refresh_token, @token_expires_at, @created_at)
  `);
  stmt.run({
    id: user.id,
    display_name: user.display_name ?? null,
    email: user.email ?? null,
    access_token: user.access_token ?? null,
    refresh_token: user.refresh_token ?? null,
    token_expires_at: user.token_expires_at ?? null,
    created_at: user.created_at ?? Math.floor(Date.now() / 1000),
  });
}

/**
 * Seed an album into the test database.
 */
export function seedAlbum(
  db: Database.Database,
  album: {
    user_id: string;
    album_id: string;
    album_name?: string | null;
    artist_name?: string | null;
    image_url?: string | null;
    status: string;
    created_at: number;
  }
): void {
  const stmt = db.prepare(`
    INSERT INTO user_albums (user_id, album_id, album_name, artist_name, image_url, status, created_at)
    VALUES (@user_id, @album_id, @album_name, @artist_name, @image_url, @status, @created_at)
  `);
  stmt.run({
    user_id: album.user_id,
    album_id: album.album_id,
    album_name: album.album_name ?? null,
    artist_name: album.artist_name ?? null,
    image_url: album.image_url ?? null,
    status: album.status,
    created_at: album.created_at,
  });
}

/**
 * Seed a vinyl cache entry into the test database.
 */
export function seedVinylCache(
  db: Database.Database,
  entry: {
    artist_name: string;
    album_name: string;
    has_vinyl: boolean;
    discogs_url?: string | null;
    checked_at: number;
  }
): void {
  const stmt = db.prepare(`
    INSERT INTO vinyl_cache (artist_name, album_name, has_vinyl, discogs_url, checked_at)
    VALUES (@artist_name, @album_name, @has_vinyl, @discogs_url, @checked_at)
  `);
  stmt.run({
    artist_name: entry.artist_name,
    album_name: entry.album_name,
    has_vinyl: entry.has_vinyl ? 1 : 0,
    discogs_url: entry.discogs_url ?? null,
    checked_at: entry.checked_at,
  });
}
