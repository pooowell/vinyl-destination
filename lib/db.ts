import Database from "better-sqlite3";
import path from "path";

const dbPath = path.join(process.cwd(), "data", "vinyl.db");

let db: Database.Database | null = null;

export function getDb(): Database.Database {
  if (!db) {
    db = new Database(dbPath);
    db.pragma("journal_mode = WAL");
    initializeTables();
  }
  return db;
}

function initializeTables() {
  const database = db!;

  database.exec(`
    CREATE TABLE IF NOT EXISTS users (
      id TEXT PRIMARY KEY,
      display_name TEXT,
      email TEXT,
      access_token TEXT,
      refresh_token TEXT,
      token_expires_at INTEGER,
      created_at INTEGER DEFAULT (unixepoch())
    );

    CREATE TABLE IF NOT EXISTS user_albums (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id TEXT NOT NULL,
      album_id TEXT NOT NULL,
      album_name TEXT,
      artist_name TEXT,
      image_url TEXT,
      status TEXT NOT NULL,
      created_at INTEGER DEFAULT (unixepoch()),
      FOREIGN KEY (user_id) REFERENCES users(id),
      UNIQUE(user_id, album_id)
    );

    CREATE INDEX IF NOT EXISTS idx_user_albums_user_id ON user_albums(user_id);
    CREATE INDEX IF NOT EXISTS idx_user_albums_status ON user_albums(user_id, status);

    -- Cache for vinyl availability checks (expires after 7 days)
    CREATE TABLE IF NOT EXISTS vinyl_cache (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      artist_name TEXT NOT NULL,
      album_name TEXT NOT NULL,
      has_vinyl INTEGER NOT NULL,
      discogs_url TEXT,
      checked_at INTEGER DEFAULT (unixepoch()),
      UNIQUE(artist_name, album_name)
    );

    CREATE INDEX IF NOT EXISTS idx_vinyl_cache_lookup ON vinyl_cache(artist_name, album_name);
  `);
}

// User operations
export interface User {
  id: string;
  display_name: string | null;
  email: string | null;
  access_token: string | null;
  refresh_token: string | null;
  token_expires_at: number | null;
  created_at: number;
}

export function upsertUser(user: {
  id: string;
  display_name?: string;
  email?: string;
  access_token: string;
  refresh_token: string;
  token_expires_at: number;
}): void {
  const database = getDb();
  const stmt = database.prepare(`
    INSERT INTO users (id, display_name, email, access_token, refresh_token, token_expires_at)
    VALUES (@id, @display_name, @email, @access_token, @refresh_token, @token_expires_at)
    ON CONFLICT(id) DO UPDATE SET
      display_name = @display_name,
      email = @email,
      access_token = @access_token,
      refresh_token = @refresh_token,
      token_expires_at = @token_expires_at
  `);
  stmt.run({
    id: user.id,
    display_name: user.display_name || null,
    email: user.email || null,
    access_token: user.access_token,
    refresh_token: user.refresh_token,
    token_expires_at: user.token_expires_at,
  });
}

export function getUser(id: string): User | undefined {
  const database = getDb();
  const stmt = database.prepare("SELECT * FROM users WHERE id = ?");
  return stmt.get(id) as User | undefined;
}

export function updateUserTokens(
  id: string,
  accessToken: string,
  refreshToken: string,
  expiresAt: number
): void {
  const database = getDb();
  const stmt = database.prepare(`
    UPDATE users
    SET access_token = ?, refresh_token = ?, token_expires_at = ?
    WHERE id = ?
  `);
  stmt.run(accessToken, refreshToken, expiresAt, id);
}

// Album operations
export type AlbumStatus = "owned" | "wishlist" | "skipped" | "not_interested";

const SKIP_EXPIRY_SECONDS = 48 * 60 * 60; // 48 hours

export interface UserAlbum {
  id: number;
  user_id: string;
  album_id: string;
  album_name: string | null;
  artist_name: string | null;
  image_url: string | null;
  status: AlbumStatus;
  created_at: number;
}

export function setAlbumStatus(
  userId: string,
  album: {
    album_id: string;
    album_name: string;
    artist_name: string;
    image_url: string;
  },
  status: AlbumStatus
): void {
  const database = getDb();
  const stmt = database.prepare(`
    INSERT INTO user_albums (user_id, album_id, album_name, artist_name, image_url, status)
    VALUES (@user_id, @album_id, @album_name, @artist_name, @image_url, @status)
    ON CONFLICT(user_id, album_id) DO UPDATE SET
      status = @status,
      album_name = @album_name,
      artist_name = @artist_name,
      image_url = @image_url
  `);
  stmt.run({
    user_id: userId,
    album_id: album.album_id,
    album_name: album.album_name,
    artist_name: album.artist_name,
    image_url: album.image_url,
    status,
  });
}

export function getUserAlbumsByStatus(
  userId: string,
  status: AlbumStatus
): UserAlbum[] {
  const database = getDb();
  const stmt = database.prepare(
    "SELECT * FROM user_albums WHERE user_id = ? AND status = ? ORDER BY created_at DESC"
  );
  return stmt.all(userId, status) as UserAlbum[];
}

export function getAllUserAlbumIds(userId: string): string[] {
  const database = getDb();
  const stmt = database.prepare("SELECT album_id FROM user_albums WHERE user_id = ?");
  const results = stmt.all(userId) as { album_id: string }[];
  return results.map((r) => r.album_id);
}

// Get album IDs that should be filtered from recommendations
// Excludes skipped albums that have expired (older than 48 hours)
export function getActiveUserAlbumIds(userId: string): string[] {
  const database = getDb();
  const stmt = database.prepare(`
    SELECT album_id FROM user_albums
    WHERE user_id = ?
    AND (
      status != 'skipped'
      OR created_at > unixepoch() - ?
    )
  `);
  const results = stmt.all(userId, SKIP_EXPIRY_SECONDS) as { album_id: string }[];
  return results.map((r) => r.album_id);
}

// Clean up expired skipped albums
export function cleanupExpiredSkips(userId: string): void {
  const database = getDb();
  const stmt = database.prepare(`
    DELETE FROM user_albums
    WHERE user_id = ?
    AND status = 'skipped'
    AND created_at <= unixepoch() - ?
  `);
  stmt.run(userId, SKIP_EXPIRY_SECONDS);
}

export function removeAlbumStatus(userId: string, albumId: string): void {
  const database = getDb();
  const stmt = database.prepare("DELETE FROM user_albums WHERE user_id = ? AND album_id = ?");
  stmt.run(userId, albumId);
}

// Vinyl cache operations
const CACHE_TTL_SECONDS = 7 * 24 * 60 * 60; // 7 days

export interface VinylCacheEntry {
  id: number;
  artist_name: string;
  album_name: string;
  has_vinyl: number;
  discogs_url: string | null;
  checked_at: number;
}

export function getCachedVinylStatus(
  artistName: string,
  albumName: string
): { hasVinyl: boolean; discogsUrl: string | null } | null {
  const database = getDb();
  const stmt = database.prepare(`
    SELECT * FROM vinyl_cache
    WHERE artist_name = ? AND album_name = ?
    AND checked_at > unixepoch() - ?
  `);
  const result = stmt.get(artistName.toLowerCase(), albumName.toLowerCase(), CACHE_TTL_SECONDS) as VinylCacheEntry | undefined;

  if (!result) return null;

  return {
    hasVinyl: result.has_vinyl === 1,
    discogsUrl: result.discogs_url,
  };
}

export function setCachedVinylStatus(
  artistName: string,
  albumName: string,
  hasVinyl: boolean,
  discogsUrl?: string
): void {
  const database = getDb();
  const stmt = database.prepare(`
    INSERT INTO vinyl_cache (artist_name, album_name, has_vinyl, discogs_url, checked_at)
    VALUES (@artist_name, @album_name, @has_vinyl, @discogs_url, unixepoch())
    ON CONFLICT(artist_name, album_name) DO UPDATE SET
      has_vinyl = @has_vinyl,
      discogs_url = @discogs_url,
      checked_at = unixepoch()
  `);
  stmt.run({
    artist_name: artistName.toLowerCase(),
    album_name: albumName.toLowerCase(),
    has_vinyl: hasVinyl ? 1 : 0,
    discogs_url: discogsUrl || null,
  });
}

export function getBulkCachedVinylStatus(
  albums: { artist: string; album: string }[]
): Map<string, { hasVinyl: boolean; discogsUrl: string | null }> {
  const database = getDb();
  const results = new Map<string, { hasVinyl: boolean; discogsUrl: string | null }>();

  const stmt = database.prepare(`
    SELECT * FROM vinyl_cache
    WHERE artist_name = ? AND album_name = ?
    AND checked_at > unixepoch() - ?
  `);

  for (const { artist, album } of albums) {
    const key = `${artist.toLowerCase()}|${album.toLowerCase()}`;
    const result = stmt.get(artist.toLowerCase(), album.toLowerCase(), CACHE_TTL_SECONDS) as VinylCacheEntry | undefined;
    if (result) {
      results.set(key, {
        hasVinyl: result.has_vinyl === 1,
        discogsUrl: result.discogs_url,
      });
    }
  }

  return results;
}
